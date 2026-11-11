import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { apiClient } from "../../services/api";
import LearnerCourseReader from "./LearnerCourseReader";

/**
 * LearnerReaderPage
 *
 * Dedicated standalone full-page route (/learner/reader) for learners (and admin previews).
 * Opened in a separate browser tab when clicking any course, module, submodule, or "View Content".
 * Reads ?courseId=...&moduleId=...&submoduleId=...
 * Leaves the learner's original dashboard intact in its own tab.
 */
export default function LearnerReaderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, activePortal } = useAuth();
  const isAdminPreview = user?.role === "ADMIN" && activePortal === "LEARNER";

  const courseIdParam = searchParams.get("courseId");
  const moduleIdParam = searchParams.get("moduleId");
  const submoduleIdParam = searchParams.get("submoduleId");

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchTargetCourse() {
      if (!courseIdParam) {
        setError("No course was specified. Please return to your learning dashboard and select a course.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        // Fetch course details
        const data = await apiClient(`/courses/${courseIdParam}/`).catch(async () => {
          // If single course lookup fails or permissions differ, fallback to query /courses/
          const all = await apiClient("/courses/");
          const list = Array.isArray(all) ? all : all?.results || [];
          return list.find((c) => String(c.id) === String(courseIdParam));
        });

        if (!data) {
          throw new Error(`Course #${courseIdParam} could not be loaded or is not assigned to you.`);
        }

        if (isMounted) {
          setCourse(data);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load course details.");
          setLoading(false);
        }
      }
    }

    fetchTargetCourse();

    return () => {
      isMounted = false;
    };
  }, [courseIdParam]);

  const handleClose = () => {
    // Try to close tab if opened via window.open; fallback to navigating back to home portal
    if (window.opener) {
      window.close();
    } else {
      if (user?.role === "TRAINER") {
        navigate("/trainer");
      } else {
        navigate("/learner");
      }
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg-main, #f1f5f9)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div className="spinner" style={{ width: "32px", height: "32px", marginBottom: "16px" }}></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", fontWeight: "500" }}>
          Opening learning environment...
        </p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg-main, #f1f5f9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: "520px",
            width: "100%",
            padding: "32px",
            textAlign: "center",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#EF4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
            Unable to Open Learning Content
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px", lineHeight: "1.5" }}>
            {error || "The requested curriculum could not be found."}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              style={{ padding: "8px 18px", fontSize: "13px" }}
            >
              Close Tab
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate("/learner")}
              style={{ padding: "8px 18px", fontSize: "13px" }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-main, #f1f5f9)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          backgroundColor: "#ffffff",
          borderBottom: "1px solid var(--border-color)",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "var(--accent-primary, #6366f1)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "700",
              fontSize: "14px",
              flexShrink: 0,
            }}
          >
            LMS
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className="badge badge-info" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                {course.code || `CRS-${course.id}`}
              </span>
              <span
                style={{
                  fontWeight: "600",
                  fontSize: "15px",
                  color: "var(--text-main)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {course.name}
              </span>
              {isAdminPreview ? (
                <span className="badge badge-purple" style={{ fontSize: "11px" }}>
                  Admin Preview
                </span>
              ) : user?.role === "TRAINER" ? (
                <span className="badge badge-primary" style={{ fontSize: "11px" }}>
                  Instructor View
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Close this learning tab"
          >
            <span>&larr; Return to Dashboard</span>
          </button>
        </div>
      </header>

      {/* Main Learning Body */}
      <main
        style={{
          flex: 1,
          maxWidth: "1440px",
          width: "100%",
          margin: "0 auto",
          padding: "24px 20px 48px",
        }}
      >
        <LearnerCourseReader
          course={course}
          initialModuleId={moduleIdParam ? Number(moduleIdParam) : null}
          initialSubmoduleId={submoduleIdParam ? Number(submoduleIdParam) : null}
          onBack={handleClose}
          isStandaloneTab={true}
        />
      </main>
    </div>
  );
}

