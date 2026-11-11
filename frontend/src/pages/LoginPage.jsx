import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { user, isAuthenticated, login } = useAuth();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect to appropriate role portal
  if (isAuthenticated && user) {
    const role = user.role;
    let defaultPortal = "/unauthorized";
    if (role === "ADMIN") defaultPortal = "/admin";
    else if (role === "TRAINER") defaultPortal = "/trainer";
    else if (role === "LEARNER") defaultPortal = "/learner";

    const from = location.state?.from?.pathname;
    if (typeof from === "string" && from.startsWith("/")) {
      // Validate that requested destination matches the user's role portal
      const isPermittedReturn =
        (role === "ADMIN" && (from === "/admin" || from.startsWith("/admin/"))) ||
        (role === "TRAINER" && (from === "/trainer" || from.startsWith("/trainer/"))) ||
        (role === "LEARNER" && (from === "/learner" || from.startsWith("/learner/")));

      // Exclude login, unauthorized, root, and invalid destinations
      if (isPermittedReturn && from !== "/login" && from !== "/unauthorized" && from !== "/") {
        return <Navigate to={from} replace />;
      }
    }

    return <Navigate to={defaultPortal} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await login(username, password);
      // Navigation is triggered by reactive re-render when isAuthenticated becomes true
    } catch (error) {
      setErrorMessage(error.message || "Unable to sign in. Please check your credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <main className="login-card">
        {/* People Prime Worldwide Logo */}
        <div className="login-logo-container">
          <img
            src="/assets/people-prime-logo.png"
            alt="People Prime Worldwide"
            className="login-company-logo"
          />
        </div>

        <h1 className="login-header-text">Sign In to LMS</h1>
        <p className="login-subtext">Enterprise Learning Management Portal</p>

        {errorMessage && (
          <div
            className="alert alert-error"
            role="status"
            aria-live="polite"
          >
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="username" className="form-label">
              Username or Corporate Email
            </label>
            <div className="form-input-wrapper">
              <input
                id="username"
                type="text"
                className="form-input"
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <div className="form-input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={isSubmitting}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isSubmitting || !username.trim() || !password}
            style={{ marginTop: "8px" }}
          >
            {isSubmitting ? "Authenticating..." : "Sign In to Portal"}
          </button>
        </form>
      </main>
    </div>
  );
}
