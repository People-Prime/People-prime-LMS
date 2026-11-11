import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function UnauthorizedPage() {
  const { user } = useAuth();

  let destination = "/login";
  if (user?.role === "ADMIN") destination = "/admin";
  else if (user?.role === "TRAINER") destination = "/trainer";
  else if (user?.role === "LEARNER") destination = "/learner";

  return (
    <div className="login-wrapper">
      <main className="login-card" style={{ textAlign: "center" }}>
        <div className="login-logo-container">
          <img
            src="/assets/people-prime-logo.png"
            alt="People Prime Worldwide"
            className="login-company-logo"
          />
        </div>

        <h1 className="login-header-text" style={{ color: "var(--status-error)" }}>
          Access Denied
        </h1>
        <p className="login-subtext" style={{ marginBottom: "20px" }}>
          You do not have permission to access the requested portal.
        </p>

        <div className="alert alert-error" role="status" style={{ textAlign: "left", marginBottom: "20px" }}>
          <span>
            Your account is currently assigned the <strong>{user?.role || "UNKNOWN"}</strong> role.
            Access to this section requires higher administrative or different role privileges.
          </span>
        </div>

        <Link
          to={destination}
          className="btn btn-primary btn-full"
          style={{ textDecoration: "none", display: "inline-block", textAlign: "center" }}
        >
          Return to My Portal
        </Link>
      </main>
    </div>
  );
}
