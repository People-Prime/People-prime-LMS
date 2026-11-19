/**
 * People Prime LMS — Centralized API Client
 *
 * Implements session-based HTTP communication with Django REST Framework backend:
 * - Credentials included ('include') for Django session cookies.
 * - CSRF token caching and retrieval from cookie or /api/csrf/ endpoint.
 * - Content-Type negotiation (JSON by default; automatic FormData passthrough).
 * - Comprehensive HTTP error handling with normalized APIError objects.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

class APIError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Reads a cookie by name from document.cookie.
 * @param {string} name - Cookie name (e.g. 'csrftoken')
 * @returns {string|null} Cookie value or null
 */
function getCookie(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
  return match && match[3] ? decodeURIComponent(match[3]).trim() : null;
}

let cachedCsrfToken = null;

/**
 * Fetches or returns a cached CSRF token.
 * If cookie is present and non-empty, prefers the cookie value.
 * Otherwise, requests a fresh token from /api/csrf/.
 * Throws APIError if a valid token cannot be obtained.
 * @returns {Promise<string>}
 */
export async function getCsrfToken() {
  const cookieToken = getCookie("csrftoken");
  if (cookieToken && typeof cookieToken === "string" && cookieToken.trim().length > 0) {
    cachedCsrfToken = cookieToken.trim();
    return cachedCsrfToken;
  }

  if (cachedCsrfToken && typeof cachedCsrfToken === "string" && cachedCsrfToken.trim().length > 0) {
    return cachedCsrfToken;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/csrf/`, {
      method: "GET",
      credentials: "include",
    });

    if (!res.ok) {
      throw new APIError("Could not retrieve CSRF token from server.", res.status);
    }

    const data = await res.json();
    const token = (data && typeof data.csrfToken === "string" ? data.csrfToken.trim() : "") || getCookie("csrftoken") || "";

    if (!token || typeof token !== "string" || token.trim().length === 0) {
      throw new APIError("Server returned an invalid or empty CSRF token.", 500);
    }

    cachedCsrfToken = token.trim();
    return cachedCsrfToken;
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError("Network failure while obtaining CSRF token.", 0);
  }
}

/**
 * Clears cached CSRF token (e.g. after logout or verified CSRF failure).
 */
export function clearCsrfTokenCache() {
  cachedCsrfToken = null;
}

/**
 * Core fetch wrapper with session authentication and CSRF protection.
 *
 * @param {string} endpoint - API path relative to base (e.g. '/login/' or 'programs/')
 * @param {object} options - Request options (method, headers, body, etc.)
 * @returns {Promise<any>} Parsed response data
 */
export async function apiClient(endpoint, options = {}) {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };

  // Determine if this is a state-changing request requiring CSRF
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (isStateChanging) {
    const token = await getCsrfToken();
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      throw new APIError("Cannot send request: Valid CSRF token is required but unavailable.", 403);
    }
    headers["X-CSRFToken"] = token;
  }

  // Handle request body
  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  } else if (typeof body === "string" && !headers["Content-Type"]) {
    // If caller provided a string body without explicit Content-Type,
    // detect JSON strings to prevent browser default text/plain;charset=UTF-8
    const trimmed = body.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      headers["Content-Type"] = "application/json";
    }
  }

  const fetchConfig = {
    ...options,
    method,
    headers,
    body,
    credentials: "include", // Essential for Django session cookie transmission
  };

  let response;
  try {
    response = await fetch(url, fetchConfig);
  } catch {
    throw new APIError(
      "Unable to connect to the People Prime LMS backend. Please verify network connectivity.",
      0
    );
  }

  // Parse response
  let data = null;
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else if (response.status !== 204) {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  // Handle successful responses
  if (response.ok) {
    // If response sets a new csrftoken cookie, update cache
    const newCookie = getCookie("csrftoken");
    if (newCookie) cachedCsrfToken = newCookie;
    return data;
  }

  // Determine backend-supplied error message if present
  let backendMessage = null;
  if (data && typeof data === "object") {
    if (typeof data.error === "string" && data.error.trim()) {
      backendMessage = data.error.trim();
    } else if (typeof data.detail === "string" && data.detail.trim()) {
      backendMessage = data.detail.trim();
    } else if (typeof data.message === "string" && data.message.trim()) {
      backendMessage = data.message.trim();
    } else if (Array.isArray(data.details) && data.details.length > 0) {
      backendMessage = data.details.join(" ");
    } else {
      // Unpack DRF validation dictionaries: { field: ["error1", "error2"], ... }
      const fieldErrors = [];
      for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val) && val.length > 0) {
          fieldErrors.push(`${key}: ${val.join(" ")}`);
        } else if (typeof val === "string" && val.trim()) {
          fieldErrors.push(`${key}: ${val.trim()}`);
        }
      }
      if (fieldErrors.length > 0) {
        backendMessage = fieldErrors.join(" | ");
      }
    }
  } else if (typeof data === "string" && data.trim()) {
    // Detect HTML error pages or tracebacks (e.g. Django debug pages, 500 error pages)
    const trimmed = data.trim();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.includes("Traceback (most recent call last):")) {
      backendMessage = null; // Suppress raw HTML tracebacks from being shown as user-facing error message
    } else {
      backendMessage = trimmed;
    }
  }

  // Determine appropriate fallback message per HTTP status code
  let fallbackMessage;
  if (response.status === 400) {
    fallbackMessage = "Invalid request. Please check submitted data.";
  } else if (response.status === 401) {
    fallbackMessage = "Authentication required. Please sign in.";
  } else if (response.status === 403) {
    // Detect whether response specifically mentions CSRF failure
    const rawLower = ((backendMessage || "") + (typeof data === "string" ? data : "")).toLowerCase();
    const isCsrfFailure = rawLower.includes("csrf");
    if (isCsrfFailure) {
      clearCsrfTokenCache(); // Only clear CSRF cache if the 403 was due to CSRF failure
      fallbackMessage = "CSRF verification failed. Please refresh your session.";
    } else {
      fallbackMessage = "Access denied. Insufficient permissions.";
    }
  } else if (response.status === 404) {
    fallbackMessage = "Requested resource not found.";
  } else if (response.status >= 500) {
    fallbackMessage = "Unable to load dashboard data. Please try again.";
  } else {
    fallbackMessage = "An unexpected error occurred. Please try again.";
  }

  const finalErrorMessage = backendMessage || fallbackMessage;
  throw new APIError(finalErrorMessage, response.status, data);
}

/**
 * Returns the download/preview URL for a given training file ID.
 * Returns a relative URL so that requests in the browser stay on the same origin
 * (navigating via Vite proxy or reverse proxy), preventing X-Frame-Options SAMEORIGIN
 * blocking and cross-origin connection refusals.
 * @param {number|string} fileId
 * @returns {string}
 */
export function getTrainingFileDownloadUrl(fileId) {
  if (!fileId) return "";
  return `/api/admin/training-files/${fileId}/download/`;
}

export { API_BASE_URL, APIError };
