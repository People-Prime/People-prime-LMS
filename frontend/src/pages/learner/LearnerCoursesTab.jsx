import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import LearnerCourseReader from "./LearnerCourseReader";

export default function LearnerCoursesTab({ initialSelectedCourse = null, onClearSelectedCourse = null }) {
  const { user, activePortal } = useAuth();
  const isAdminPreview = user?.role === "ADMIN" && activePortal === "LEARNER";

  const [courses, setCourses] = useState([]);
  const [courseLevels, setCourseLevels] = useState([]);
  const [modules, setModules] = useState([]);
  const [learnerProgressData, setLearnerProgressData] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(initialSelectedCourse);
  const [selectedLevel, setSelectedLevel] = useState(null); // active level object for drill-down
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync initialSelectedCourse prop if it changes
  useEffect(() => {
    if (initialSelectedCourse) {
      setSelectedCourse(initialSelectedCourse);
    }
  }, [initialSelectedCourse]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [coursesRes, levelsRes, modulesRes, overviewRes] = await Promise.all([
        apiClient("/courses/"),
        apiClient("/course-levels/").catch(() => []),
        apiClient("/modules/").catch(() => []),
        apiClient("/reports/overview/").catch(() => null),
      ]);

      const courseList = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || []);
      const levelList = Array.isArray(levelsRes) ? levelsRes : (levelsRes?.results || []);
      const moduleList = Array.isArray(modulesRes) ? modulesRes : (modulesRes?.results || []);

      setCourses(courseList);
      setCourseLevels(levelList);
      setModules(moduleList);
      setLearnerProgressData(overviewRes);
    } catch (err) {
      setError(err.message || "Failed to load courses. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRetry = () => {
    fetchData();
  };

  // Filter courses for display:
  // In Admin Preview, show only published courses from the general catalog
  const displayedCourses = useMemo(() => {
    if (isAdminPreview) {
      return courses.filter((c) => c.status === "PUBLISHED");
    }
    return courses;
  }, [courses, isAdminPreview]);

  // Compute active levels for the selected course, or all scoped levels when no course is selected
  const activeLevels = useMemo(() => {
    const displayedIds = new Set(displayedCourses.map((c) => c.id));
    const filtered = selectedCourse
      ? courseLevels.filter((lvl) => lvl.course === selectedCourse.id)
      : courseLevels.filter((lvl) => !lvl.course || displayedIds.has(lvl.course));
    return [...filtered].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [courseLevels, selectedCourse, displayedCourses]);

  // Map each module ID to its completion status (strictly 'COMPLETED' or 'NOT_COMPLETED')
  const moduleCompletionMap = useMemo(() => {
    const map = {};
    if (!learnerProgressData?.learners_progress) return map;

    // In Learner portal, learners_progress has exactly the authenticated learner's record.
    // In Admin Preview, match by current user id or use first record.
    const record =
      learnerProgressData.learners_progress.find((lp) => lp.learner_id === user?.id) ||
      learnerProgressData.learners_progress[0];

    if (record?.modules_progress) {
      for (const mp of record.modules_progress) {
        map[mp.module_id] = mp.status === "COMPLETED";
      }
    }
    return map;
  }, [learnerProgressData, user]);

  // If a course reader is opened directly, render LearnerCourseReader view
  if (selectedCourse && !selectedLevel) {
    return (
      <LearnerCourseReader
        course={selectedCourse}
        onBack={() => {
          setSelectedCourse(null);
          if (onClearSelectedCourse) onClearSelectedCourse();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
          {isAdminPreview ? "Loading course catalog..." : "Loading your learning levels..."}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--status-error)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "var(--status-error)" }}>
              Unable to Load Courses
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
              {error}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRetry}
            style={{ padding: "8px 16px", fontSize: "13px" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LEVEL DETAIL VIEW: When a learner clicks a Level Card
  // Displays only the modules assigned to that level.
  // Clicking a module launches direct module content reading.
  // ---------------------------------------------------------------------------
  if (selectedLevel) {
    const parentCourse = selectedLevel.course
      ? courses.find((c) => c.id === selectedLevel.course) || null
      : null;
    const levelModules = modules
      .filter((m) => m.level === selectedLevel.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const openModuleViewer = (mod) => {
      const targetCourseId = parentCourse?.id || mod.course || "";
      const query = targetCourseId
        ? `?courseId=${targetCourseId}&moduleId=${mod.id}`
        : `?moduleId=${mod.id}`;
      window.open(`/learner/module-viewer${query}`, "_blank");
    };

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
                {parentCourse?.name || selectedLevel.course_name || "Curriculum"} &bull; Tier #{selectedLevel.order}
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
            {levelModules.map((mod) => {
              const isCompleted = Boolean(moduleCompletionMap[mod.id]);

              return (
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
                  onClick={() => openModuleViewer(mod)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openModuleViewer(mod);
                    }
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      {isCompleted ? (
                        <span
                          className="badge badge-success"
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            backgroundColor: "var(--status-success-bg, #ecfdf5)",
                            color: "var(--status-success, #10b981)",
                            borderColor: "var(--status-success, #10b981)",
                          }}
                        >
                          Completed
                        </span>
                      ) : (
                        <span
                          className="badge badge-secondary"
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            backgroundColor: "var(--bg-secondary, #f1f5f9)",
                            color: "var(--text-muted, #64748b)",
                            borderColor: "var(--border-color, #cbd5e1)",
                          }}
                        >
                          Not Completed
                        </span>
                      )}
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
                      Start Learning &rarr;
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

  // ---------------------------------------------------------------------------
  // MAIN VIEW: Level Cards Grid (Level 1, Level 2, Level 3...)
  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* Admin Preview Explanatory Banner */}
      {isAdminPreview && (
        <div
          className="card"
          style={{
            padding: "16px 20px",
            marginBottom: "20px",
            backgroundColor: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "rgba(59, 130, 246, 0.2)",
              color: "#3B82F6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)", marginBottom: "2px" }}>
              Admin Preview • Level-Based Curriculum
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Inspect curriculum modules organized into learning levels (Level 1, Level 2, Level 3). Click any level to view its assigned modules and lesson content.
            </div>
          </div>
        </div>
      )}

      {/* Header bar with count badge and refresh */}
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
            <span>{isAdminPreview ? "Preview Curriculum Levels" : "Course Learning Levels"}</span>
            <span className="badge badge-purple">{activeLevels.length} Levels</span>
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            {isAdminPreview
              ? "Sequential curriculum tiers configured for the training program"
              : "Structured curriculum stages for your professional training journey"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRetry}
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          Refresh Levels
        </button>
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
            const levelMods = modules.filter((m) => m.level === lvl.id);
            const totalModules = levelMods.length;
            const completedCount = levelMods.filter((m) => moduleCompletionMap[m.id]).length;
            const progressPct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

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
                      className={`badge ${totalModules > 0 ? "badge-success" : "badge-secondary"}`}
                      style={{ fontSize: "11px" }}
                    >
                      {totalModules} {totalModules === 1 ? "Module" : "Modules"}
                    </span>
                  </div>

                  {/* Level Name */}
                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "var(--text-main)",
                      margin: "0 0 14px 0",
                      lineHeight: "1.3",
                    }}
                  >
                    {lvl.name}
                  </h3>

                  {/* Level Progress Section */}
                  <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", marginBottom: "6px" }}>
                      <span style={{ color: "var(--text-secondary)", fontWeight: "500" }}>
                        {completedCount} / {totalModules} Modules Completed
                      </span>
                      <strong style={{ color: progressPct === 100 ? "var(--status-success, #10b981)" : "var(--accent-primary, #6366f1)" }}>
                        {progressPct}% Complete
                      </strong>
                    </div>
                    {/* Visual Progress Bar */}
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        backgroundColor: "var(--border-color, #e2e8f0)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                      title={`${progressPct}% Complete`}
                    >
                      <div
                        style={{
                          width: `${progressPct}%`,
                          height: "100%",
                          backgroundColor: progressPct === 100 ? "var(--status-success, #10b981)" : "var(--accent-primary, #6366f1)",
                          borderRadius: "3px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
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
                    {totalModules > 0 ? `${totalModules} Learning Modules` : "0 Modules Configured"}
                  </span>
                  <span style={{ color: "var(--accent-secondary)", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                    View Modules &rarr;
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
