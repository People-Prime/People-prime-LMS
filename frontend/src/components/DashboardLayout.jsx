import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Shared Dashboard Layout with responsive header, user profile area,
 * dark theme styling, Admin portal view switcher dropdown, Admin preview banner,
 * and role/portal-scoped sidebar navigation.
 */
export default function DashboardLayout({ activeTab, onTabChange, children }) {
  const { user, logout, activePortal, switchPortal } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const isAdminUser = user?.role === "ADMIN";

  // Navigation role scoping:
  // For actual Admin, use activePortal (fallback to ADMIN).
  // For actual Trainer or Learner, strictly use their actual database role.
  const effectivePortal = isAdminUser ? (activePortal || "ADMIN") : user?.role;

  const showAdminNav = effectivePortal === "ADMIN";
  const showTrainerNav = effectivePortal === "TRAINER";
  const showLearnerNav = effectivePortal === "LEARNER";

  // Admin Preview Banner conditions:
  // Display only when the actual authenticated role is ADMIN and activePortal is previewing TRAINER or LEARNER.
  const isPreviewMode = isAdminUser && (activePortal === "TRAINER" || activePortal === "LEARNER");
  const previewPortalTitle = activePortal === "TRAINER" ? "Instructor Portal" : "Learner Portal";

  // Handle outside click & escape key to close profile dropdown
  useEffect(() => {
    if (!dropdownOpen) return;

    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  const handlePortalSwitch = (targetPortal) => {
    if (!isAdminUser) return;
    setDropdownOpen(false);
    if (targetPortal === activePortal) return;

    switchPortal(targetPortal);
    if (targetPortal === "ADMIN") navigate("/admin");
    else if (targetPortal === "TRAINER") navigate("/trainer");
    else if (targetPortal === "LEARNER") navigate("/learner");
  };

  const handleSignOut = async () => {
    setLoggingOut(true);
    setDropdownOpen(false);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <header className="app-header">
        <div className="header-brand">
          <img
            src="/assets/people-prime-logo.png"
            alt="People Prime Worldwide"
            className="header-logo"
          />
          <span className="header-title-badge">Enterprise LMS</span>
        </div>

        <div className="header-user-area">
          {isAdminUser ? (
            /* Admin Interactive Dropdown */
            <div className="admin-portal-switcher-wrapper" ref={dropdownRef}>
              <button
                type="button"
                className="user-profile-badge user-profile-badge-btn"
                onClick={() => setDropdownOpen((prev) => !prev)}
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
                aria-label="User profile and portal view switcher"
              >
                <div className="user-avatar">
                  {user?.username ? user.username[0].toUpperCase() : "U"}
                </div>
                <div className="user-info">
                  <span className="user-name">{user?.username}</span>
                  <span className="user-role-tag">
                    {user?.role}
                    {activePortal && activePortal !== "ADMIN" && (
                      <span className="active-view-tag"> ({activePortal})</span>
                    )}
                  </span>
                </div>
                <svg
                  className={`dropdown-chevron ${dropdownOpen ? "open" : ""}`}
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="portal-dropdown-menu" role="menu">
                  <div className="portal-dropdown-header">
                    <span className="dropdown-label">Switch Portal View</span>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    className={`portal-dropdown-item ${activePortal === "ADMIN" ? "active" : ""}`}
                    onClick={() => handlePortalSwitch("ADMIN")}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="portal-title">Administrator</span>
                    {activePortal === "ADMIN" && (
                      <span className="active-checkmark" aria-hidden="true">✓</span>
                    )}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`portal-dropdown-item ${activePortal === "TRAINER" ? "active" : ""}`}
                    onClick={() => handlePortalSwitch("TRAINER")}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="portal-title">Instructor</span>
                    {activePortal === "TRAINER" && (
                      <span className="active-checkmark" aria-hidden="true">✓</span>
                    )}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`portal-dropdown-item ${activePortal === "LEARNER" ? "active" : ""}`}
                    onClick={() => handlePortalSwitch("LEARNER")}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                    </svg>
                    <span className="portal-title">Learner</span>
                    {activePortal === "LEARNER" && (
                      <span className="active-checkmark" aria-hidden="true">✓</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Non-Admin static badge (Trainer & Learner) */
            <div className="user-profile-badge">
              <div className="user-avatar">
                {user?.username ? user.username[0].toUpperCase() : "U"}
              </div>
              <div className="user-info">
                <span className="user-name">{user?.username}</span>
                <span className="user-role-tag">{user?.role}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSignOut}
            disabled={loggingOut}
            style={{ padding: "8px 14px", fontSize: "13px" }}
          >
            {loggingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </header>

      {/* Admin Preview Banner across Instructor / Learner preview views */}
      {isPreviewMode && (
        <div className="admin-preview-banner" role="status" aria-live="polite">
          <div className="admin-preview-content">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <div className="admin-preview-text">
              <strong>{previewPortalTitle} — Admin Preview</strong>
              <span className="admin-preview-subtext">
                Viewing interface as {activePortal === "TRAINER" ? "an Instructor" : "a Learner"}. Your administrator identity and permissions remain unchanged.
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary admin-preview-return-btn"
            onClick={() => handlePortalSwitch("ADMIN")}
          >
            Return to Admin Portal
          </button>
        </div>
      )}

      {/* Dashboard Layout: Sidebar + Main Content */}
      <div className="dashboard-layout">
        <aside className="app-sidebar">
          <div className="sidebar-heading">Navigation</div>
          {showAdminNav ? (
            <>
              {/* TalentLMS Primary Admin Sections: 1. Home, 2. Users, 3. Courses, 4. Groups, 5. Reports */}
              <button
                type="button"
                className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => onTabChange("overview")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
                Home
              </button>

              <button
                type="button"
                className={`nav-item ${activeTab === "users" ? "active" : ""}`}
                onClick={() => onTabChange("users")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Users
              </button>

              <button
                type="button"
                className={`nav-item ${activeTab === "curriculum" ? "active" : ""}`}
                onClick={() => onTabChange("curriculum")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
                Courses
              </button>

              <button
                type="button"
                className={`nav-item ${activeTab === "cohorts" ? "active" : ""}`}
                onClick={() => onTabChange("cohorts")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
                Groups
              </button>

              <button
                type="button"
                className={`nav-item ${activeTab === "learners" ? "active" : ""}`}
                onClick={() => onTabChange("learners")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                Reports
              </button>

              <button
                type="button"
                className={`nav-item ${activeTab === "trainer-workload" ? "active" : ""}`}
                onClick={() => onTabChange("trainer-workload")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Trainer Workload
              </button>

              <button
                type="button"
                className={`nav-item ${activeTab === "projects" ? "active" : ""}`}
                onClick={() => onTabChange("projects")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Projects
              </button>
            </>
          ) : showTrainerNav ? (
            <>
              <button
                type="button"
                className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => onTabChange("overview")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
                Dashboard Overview
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === "courses" ? "active" : ""}`}
                onClick={() => onTabChange("courses")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
                Courses
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === "questions" ? "active" : ""}`}
                onClick={() => onTabChange("questions")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Assessment Bank
              </button>
              <div className="sidebar-heading" style={{ marginTop: "16px" }}>Tracking & Oversight</div>
              <button
                type="button"
                className={`nav-item ${activeTab === "learners" ? "active" : ""}`}
                onClick={() => onTabChange("learners")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                Reports
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === "projects" ? "active" : ""}`}
                onClick={() => onTabChange("projects")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Projects
              </button>
            </>
          ) : showLearnerNav ? (
            <>
              <button
                type="button"
                className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => onTabChange("overview")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
                Dashboard
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === "mycourses" ? "active" : ""}`}
                onClick={() => onTabChange("mycourses")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
                My Learning
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === "projects" ? "active" : ""}`}
                onClick={() => onTabChange("projects")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Projects
              </button>
              <button
                type="button"
                className={`nav-item ${activeTab === "reports" ? "active" : ""}`}
                onClick={() => onTabChange("reports")}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                My Progress Reports
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => onTabChange("overview")}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
              Dashboard Overview
            </button>
          )}
        </aside>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
