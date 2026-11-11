import { useEffect, useState, useCallback, useRef } from "react";
import { AuthContext } from "./authContextDef";
import { apiClient, clearCsrfTokenCache } from "../services/api";

const ADMIN_PORTAL_STORAGE_KEY = "lms_admin_active_portal";
const VALID_PORTALS = ["ADMIN", "TRAINER", "LEARNER"];

function getStoredAdminPortal() {
  try {
    const val = sessionStorage.getItem(ADMIN_PORTAL_STORAGE_KEY);
    if (val && VALID_PORTALS.includes(val)) {
      return val;
    }
  } catch {
    // sessionStorage unavailable or restricted
  }
  return "ADMIN";
}

function setStoredAdminPortal(portal) {
  try {
    sessionStorage.setItem(ADMIN_PORTAL_STORAGE_KEY, portal);
  } catch {
    // Ignore storage errors safely
  }
}

function clearStoredAdminPortal() {
  try {
    sessionStorage.removeItem(ADMIN_PORTAL_STORAGE_KEY);
  } catch {
    // Ignore storage errors safely
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activePortal, setActivePortal] = useState("ADMIN");
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Synchronizes activePortal with user role and session storage rules:
   * - ADMIN: restores saved portal from sessionStorage (or defaults to ADMIN)
   * - TRAINER: strictly locked to TRAINER
   * - LEARNER: strictly locked to LEARNER
   * - Unauthenticated: defaults to ADMIN and clears storage
   */
  const syncPortalForUser = useCallback((currentUser) => {
    if (!currentUser || !currentUser.role) {
      clearStoredAdminPortal();
      setActivePortal("ADMIN");
      return;
    }

    if (currentUser.role === "ADMIN") {
      const restored = getStoredAdminPortal();
      setActivePortal(restored);
    } else if (currentUser.role === "TRAINER") {
      clearStoredAdminPortal();
      setActivePortal("TRAINER");
    } else if (currentUser.role === "LEARNER") {
      clearStoredAdminPortal();
      setActivePortal("LEARNER");
    } else {
      clearStoredAdminPortal();
      setActivePortal(null);
    }
  }, []);

  /**
   * Switch active portal view.
   * Allowed ONLY if the actual authenticated user's role is ADMIN.
   * Accepts ONLY 'ADMIN', 'TRAINER', or 'LEARNER'.
   */
  const switchPortal = useCallback((portalRole) => {
    if (user?.role !== "ADMIN") {
      return;
    }
    if (!VALID_PORTALS.includes(portalRole)) {
      return;
    }
    setStoredAdminPortal(portalRole);
    setActivePortal(portalRole);
  }, [user]);

  /**
   * Refreshes the current session state by querying /api/me/.
   */
  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await apiClient("/me/");
      if (!isMountedRef.current) return;
      if (data && data.authenticated === true && data.user) {
        setUser(data.user);
        syncPortalForUser(data.user);
      } else if (data && data.authenticated === false) {
        setUser(null);
        syncPortalForUser(null);
      }
      // If temporary non-401 network/server issue occurred, retain existing user state without falsely assuming logout
    } catch (error) {
      if (!isMountedRef.current) return;
      if (error && error.status === 401) {
        setUser(null);
        syncPortalForUser(null);
      } else {
        setAuthError(error.message || "Failed to refresh session status.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [syncPortalForUser]);

  // Check active session on initial app mount
  useEffect(() => {
    async function init() {
      try {
        const data = await apiClient("/me/");
        if (isMountedRef.current) {
          if (data && data.authenticated === true && data.user) {
            setUser(data.user);
            syncPortalForUser(data.user);
          } else {
            setUser(null);
            syncPortalForUser(null);
          }
        }
      } catch {
        if (isMountedRef.current) {
          setUser(null);
          syncPortalForUser(null);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    }
    init();
  }, [syncPortalForUser]);

  /**
   * Performs user login via /api/login/.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<object>} The authenticated user object
   */
  const login = async (username, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await apiClient("/login/", {
        method: "POST",
        body: { username, password },
      });

      if (!isMountedRef.current) return null;

      if (data && data.user) {
        setUser(data.user);
        syncPortalForUser(data.user);
        return data.user;
      }
      throw new Error("Invalid response format received from authentication server.");
    } catch (error) {
      if (isMountedRef.current) {
        setAuthError(error.message || "Failed to sign in.");
      }
      throw error;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  /**
   * Logs out the user via /api/logout/ and clears local auth state.
   * Does not falsely report successful logout if backend logout encounters an error.
   */
  const logout = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      await apiClient("/logout/", { method: "POST" });
      if (isMountedRef.current) {
        setUser(null);
        clearCsrfTokenCache();
        syncPortalForUser(null);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      // If 401, session was already invalid/terminated
      if (error && error.status === 401) {
        setUser(null);
        clearCsrfTokenCache();
        syncPortalForUser(null);
      } else {
        // Network or server error: communicate uncertainty instead of claiming successful logout
        const msg = error.message || "Logout failed. Please check your network connection.";
        setAuthError(msg);
        throw error;
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    role: user?.role || null,
    activePortal,
    switchPortal,
    isLoading,
    authError,
    login,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
