import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";

/**
 * TrainerCoursesTab Component
 *
 * Dedicated course catalogue for LMS Trainers:
 * - Organized by Course Levels (Level 1, Level 2, Level 3...) matching the Learner Portal experience.
 * - Displays course level cards with accurate module counts.
 * - Clicking a level displays its assigned modules.
 * - Clicking a module opens its sequential learning content directly via the full-page reader tab.
 * - Completely READ-ONLY: No creation, editing, deleting, assigning, or unassigning controls.
 */
export default function TrainerCoursesTab() {
  const { user, activePortal } = useAuth();
  const isAdminPreview = user?.role === "ADMIN" && activePortal === "TRAINER";

  const [courses, setCourses] = useState([]);
  const [courseLevels, setCourseLevels] = useState([]);
  const [modules, setModules] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(null); // active level object for drill-down
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [coursesRes, levelsRes, modulesRes] = await Promise.all([
        apiClient("/courses/"),
        apiClient("/course-levels/").catch(() => []),
        apiClient("/modules/").catch(() => []),
      ]);

      const courseList = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || []);
      const levelList = Array.isArray(levelsRes) ? levelsRes : (levelsRes?.results || []);
      const moduleList = Array.isArray(modulesRes) ? modulesRes : (modulesRes?.results || []);

      setCourses(courseList);
      setCourseLevels(levelList);
      setModules(moduleList);
    } catch (err) {
      setError(err.message || "Failed to load published courses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Filter to published courses (safety guard in case an Admin is previewing the trainer portal)
  const publishedCourses = useMemo(() => {
    return courses.filter((c) => c.status === "PUBLISHED");
  }, [courses]);

  // Active levels for the primary course (Course 6 or first published course)
  const activeLevels = useMemo(() => {
    const targetCourseId = publishedCourses[0]?.id || 6;
    return courseLevels
      .filter((lvl) => lvl.course === targetCourseId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [courseLevels, publishedCourses]);

  const handleOpenModule = (courseId, moduleId) => {
    window.open(`/learner/module-viewer?courseId=${courseId}&moduleId=${moduleId}`, "_blank");
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
          Loading course levels catalogue...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--status-error)" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--status-error)", margin: "0 0 8px 0" }}>
          Unable to Load Courses
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "0 0 16px 0" }}>
          {error}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={fetchCatalog}
          style={{ padding: "8px 16px", fontSize: "13px" }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LEVEL DETAIL VIEW: Displays modules assigned to the selected level
  // ---------------------------------------------------------------------------
  if (selectedLevel) {
    const parentCourse = courses.find((c) => c.id === selectedLevel.course) || courses[0];
    const levelModules = modules
      .filter((m) => m.level === selectedLevel.id && m.course === selectedLevel.course)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    return (
      <div>
        {/* Navigation Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSelectedLevel(null)}
              style={{ padding: "6px 14px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span>&larr; Back to Levels</span>
            </button>
            <div>
              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-secondary)" }}>
                {parentCourse?.name || "Curriculum"} &bull; Tier #{selectedLevel.order}
              </div>
              <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                {selectedLevel.name}
              </h2>
            </div>
          </div>
          <span className="badge badge-purple" style={{ fontSize: "12px" }}>
            {levelModules.length} {levelModules.length === 1 ? "Module" : "Modules"}
          </span>
        </div>

        {/* Modules in this Level */}
        {levelModules.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px", border: "1px dashed var(--border-color)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "6px" }}>
              No Modules in {selectedLevel.name} Yet
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
              Curriculum modules will appear here once assigned to {selectedLevel.name} by the course administrator.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
            {levelModules.map((mod) => (
              <div
                key={mod.id}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "20px",
                  cursor: "pointer",
                  transition: "transform 0.15s ease, border-color 0.15s ease",
                }}
                onClick={() => handleOpenModule(parentCourse.id, mod.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenModule(parentCourse.id, mod.id);
                  }
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span className="badge badge-info" style={{ fontFamily: "var(--font-mono)" }}>
                      {mod.code || `MOD-${mod.id}`}
                    </span>
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", margin: 0 }}>
                    {mod.name}
                  </h3>
                </div>

                <div
                  style={{
                    marginTop: "16px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>Module #{mod.order || mod.id}</span>
                  <span style={{ color: "var(--accent-secondary)", fontWeight: "600" }}>
                    View Content (Read-Only) &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN VIEW: Level Cards Grid (Level 1, Level 2, Level 3...)
  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* Informational Header Bar */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          marginBottom: "20px",
          backgroundColor: "rgba(99, 102, 241, 0.06)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "rgba(99, 102, 241, 0.15)",
              color: "var(--accent-primary, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-main)", marginBottom: "2px" }}>
              Published LMS Curriculum Catalogue
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Instructors have complete read-only visibility into course levels, modules, lessons, and training materials.
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={fetchCatalog}
          style={{ padding: "6px 14px", fontSize: "13px" }}
        >
          Refresh Catalogue
        </button>
      </div>

      {/* Header bar with count badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
            <span>Curriculum Learning Levels</span>
            <span className="badge badge-purple">{activeLevels.length} Levels</span>
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Sequential curriculum tiers configured for the training program
          </p>
        </div>
      </div>

      {/* Level Cards Grid */}
      {activeLevels.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "56px 24px",
            border: "1px dashed var(--border-color)",
            backgroundColor: "var(--bg-card)",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", margin: "0 0 8px 0" }}>
            No Learning Levels Available
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
            Course levels will appear here once configured by the administrator.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {activeLevels.map((lvl) => {
            const assignedCount = modules.filter((m) => m.level === lvl.id).length;

            return (
              <div
                key={lvl.id}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "24px 20px",
                  transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                  cursor: "pointer",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                }}
                onClick={() => setSelectedLevel(lvl)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedLevel(lvl);
                  }
                }}
              >
                <div>
                  {/* Top Badge: Level Sequence */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "14px",
                    }}
                  >
                    <span className="badge badge-purple" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                      Tier #{lvl.order}
                    </span>
                    <span
                      className={`badge ${assignedCount > 0 ? "badge-success" : "badge-secondary"}`}
                      style={{ fontSize: "11px" }}
                    >
                      {assignedCount} {assignedCount === 1 ? "Module" : "Modules"}
                    </span>
                  </div>

                  {/* Level Name */}
                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "var(--text-main)",
                      margin: 0,
                      lineHeight: "1.3",
                    }}
                  >
                    {lvl.name}
                  </h3>
                </div>

                {/* Card Footer: Metadata and Action */}
                <div
                  style={{
                    marginTop: "20px",
                    paddingTop: "14px",
                    borderTop: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                  }}
                >
                  <span>
                    {assignedCount > 0 ? `${assignedCount} Learning Modules` : "0 Modules Configured"}
                  </span>
                  <span style={{ color: "var(--accent-secondary)", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                    View Modules (Read-Only) &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
