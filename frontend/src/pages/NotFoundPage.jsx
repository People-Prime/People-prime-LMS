import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function NotFoundPage() {
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

        <h1 className="login-header-text">404 - Page Not Found</h1>
        <p className="login-subtext" style={{ marginBottom: "20px" }}>
          The page or portal you are looking for does not exist.
        </p>

        <Link
          to={destination}
          className="btn btn-primary btn-full"
          style={{ textDecoration: "none", display: "inline-block", textAlign: "center" }}
        >
          Return to Portal
        </Link>
      </main>
    </div>
  );
}
