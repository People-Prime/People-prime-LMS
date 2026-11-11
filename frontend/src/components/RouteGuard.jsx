import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * RouteGuard Component
 *
 * Enforces role-based access rules:
 * - Shows loading spinner while session verification is in progress.
 * - Redirects unauthenticated users to /login, recording location.pathname for return navigation.
 * - Redirects users with missing or unpermitted LMS roles to /unauthorized.
 * - Never grants access based on superuser or staff flags (strict LMS role compliance).
 */
export default function RouteGuard({ allowedRoles, children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <div className="spinner"></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          Verifying session authorization...
        </p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if role is in allowed list
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
