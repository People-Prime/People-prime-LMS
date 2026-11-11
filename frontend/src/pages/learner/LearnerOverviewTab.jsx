import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import { apiClient } from "../../services/api";

export default function LearnerOverviewTab({ onNavigateToCourses, onSelectCourse }) {
  const { user, activePortal } = useAuth();
  const isAdminPreview = user?.role === "ADMIN" && activePortal === "LEARNER";

  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [moduleProgressMap, setModuleProgressMap] = useState({});
  const [recentResponses, setRecentResponses] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(!isAdminPreview);
  const [error, setError] = useState(null);

  const loadDashboardData = useCallback(async () => {
    if (isAdminPreview) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch assigned courses, modules, recent question responses, and assigned trainers in parallel
      const [coursesRes, modulesRes, responsesRes, trainersRes] = await Promise.all([
        apiClient("/courses/"),
        apiClient("/modules/"),
        apiClient("/question-responses/"),
        apiClient("/trainer-assignments/"),
      ]);

      const courseList = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || []);
      const moduleList = Array.isArray(modulesRes) ? modulesRes : (modulesRes?.results || []);
      const responseList = Array.isArray(responsesRes) ? responsesRes : (responsesRes?.results || []);
      const trainerList = Array.isArray(trainersRes) ? trainersRes : (trainersRes?.results || []);

      setCourses(courseList);
      setModules(moduleList);
      setRecentResponses(responseList);
      setTrainers(trainerList);

      // Fetch completion status for assigned modules
      if (moduleList.length > 0) {
        const statusPromises = moduleList.map((m) =>
          apiClient(`/question-responses/module-completion-status/?module=${m.id}`)
            .then((status) => ({ id: m.id, status }))
            .catch(() => ({ id: m.id, status: null }))
        );
        const statuses = await Promise.all(statusPromises);
        const map = {};
        statuses.forEach(({ id, status }) => {
          map[id] = status;
        });
        setModuleProgressMap(map);
      } else {
        setModuleProgressMap({});
      }
    } catch (err) {
      setError(err.message || "Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [isAdminPreview]);

  useEffect(() => {
    if (isAdminPreview) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    async function init() {
      try {
        setLoading(true);
        setError(null);

        const [coursesRes, modulesRes, responsesRes, trainersRes] = await Promise.all([
          apiClient("/courses/"),
          apiClient("/modules/"),
          apiClient("/question-responses/"),
          apiClient("/trainer-assignments/"),
        ]);

        if (!isMounted) return;

        const courseList = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.results || []);
        const moduleList = Array.isArray(modulesRes) ? modulesRes : (modulesRes?.results || []);
        const responseList = Array.isArray(responsesRes) ? responsesRes : (responsesRes?.results || []);
        const trainerList = Array.isArray(trainersRes) ? trainersRes : (trainersRes?.results || []);

        setCourses(courseList);
        setModules(moduleList);
        setRecentResponses(responseList);
        setTrainers(trainerList);

        if (moduleList.length > 0) {
          const statusPromises = moduleList.map((m) =>
            apiClient(`/question-responses/module-completion-status/?module=${m.id}`)
              .then((status) => ({ id: m.id, status }))
              .catch(() => ({ id: m.id, status: null }))
          );
          const statuses = await Promise.all(statusPromises);
          if (!isMounted) return;

          const map = {};
          statuses.forEach(({ id, status }) => {
            map[id] = status;
          });
          setModuleProgressMap(map);
        } else {
          setModuleProgressMap({});
        }
        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || "Failed to load dashboard data. Please try again.");
        setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [isAdminPreview]);

  // Compute unique trainers with their assigned group context(s)
  const uniqueTrainers = (() => {
    const trainerMap = new Map();
    trainers.forEach((assign) => {
      if (!assign.trainer) return;
      const trainerId = assign.trainer;
      if (!trainerMap.has(trainerId)) {
        trainerMap.set(trainerId, {
          id: trainerId,
          username: assign.trainer_username,
          name: assign.trainer_name || assign.trainer_username,
          email: assign.trainer_email,
          groups: [],
        });
      }
      if (assign.group_name && !trainerMap.get(trainerId).groups.includes(assign.group_name)) {
        trainerMap.get(trainerId).groups.push(assign.group_name);
      }
    });
    return Array.from(trainerMap.values());
  })();

  // Compute Learning Summary Metrics safely (guarding division by zero)
  const totalAssignedCourses = courses.length;
  const totalAssignedModules = modules.length;

  let completedModulesCount = 0;
  modules.forEach((mod) => {
    const status = moduleProgressMap[mod.id];
    if (status && status.is_module_completed) {
      completedModulesCount += 1;
    }
  });

  const pendingModulesCount = Math.max(0, totalAssignedModules - completedModulesCount);
  const overallProgressPercentage = totalAssignedModules > 0
    ? Math.round((completedModulesCount / totalAssignedModules) * 1000) / 10
    : 0.0;

  // Compute per-course progress
  const getCourseProgress = (courseId) => {
    const courseModules = modules.filter((m) => {
      if (typeof m.course === "object" && m.course !== null) {
        return m.course.id === courseId;
      }
      return m.course === courseId;
    });

    const totalMods = courseModules.length;
    if (totalMods === 0) return { totalMods: 0, completedMods: 0, percentage: 0 };

    let compMods = 0;
    courseModules.forEach((m) => {
      if (moduleProgressMap[m.id]?.is_module_completed) {
        compMods += 1;
      }
    });

    return {
      totalMods,
      completedMods: compMods,
      percentage: Math.round((compMods / totalMods) * 100),
    };
  };

  // If in Admin Preview mode, render generic preview without requesting learner-specific data
  if (isAdminPreview) {
    return (
      <div className="tab-pane active" style={{ animation: "fadeIn 0.2s ease" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
            Learner Dashboard Preview
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Sample overview representing the learner interface. Real progress metrics, scores, and personal records are isolated.
          </p>
        </div>

        {/* Generic Informational Cards Grid */}
        <div className="stats-grid" style={{ marginBottom: "28px" }}>
          <div className="stat-card">
            <div className="stat-header">My Courses</div>
            <div className="stat-value">—</div>
            <div className="stat-footer">Preview only • Active courses</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">Learning Modules</div>
            <div className="stat-value" style={{ color: "var(--status-success)" }}>
              —
            </div>
            <div className="stat-footer">Preview only • Assigned modules</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">Learning Progress</div>
            <div className="stat-value" style={{ color: "var(--accent-secondary)" }}>
              —%
            </div>
            <div className="stat-footer">Preview only • Progress status</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">Assessment Overview</div>
            <div className="stat-value" style={{ color: "var(--status-info, #60A5FA)" }}>
              —
            </div>
            <div className="stat-footer">Preview only • Mandatory assessments</div>
          </div>
        </div>

        {/* Informational Guidance Panel */}
        <div className="card" style={{ padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              color: "#3B82F6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "6px" }}>
                Example Layout & Learner Overview
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.6", margin: "0 0 16px 0" }}>
                Enrolled learners view their personal course catalog, track their submodule progress, complete mandatory assessments, review attempt history, and inspect instructor feedback from this portal.
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <span className="badge badge-info">Generic View</span>
                <span className="badge badge-secondary">No Data Queried</span>
                <span className="badge badge-success">Admin Preview Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
          Loading your learning dashboard...
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
              Unable to Load Dashboard
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
              {error}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadDashboardData}
            style={{ padding: "8px 16px", fontSize: "13px" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 1. Learning Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: "28px" }}>
        <div className="stat-card">
          <div className="stat-header">Assigned Courses</div>
          <div className="stat-value">{totalAssignedCourses}</div>
          <div className="stat-footer">Active learning programs</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Completed Modules</div>
          <div className="stat-value" style={{ color: "var(--status-success)" }}>
            {completedModulesCount}
          </div>
          <div className="stat-footer">Requirements fulfilled</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Pending Modules</div>
          <div className="stat-value" style={{ color: pendingModulesCount > 0 ? "var(--status-warning)" : "var(--status-success)" }}>
            {pendingModulesCount}
          </div>
          <div className="stat-footer">In progress or upcoming</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Overall Progress</div>
          <div className="stat-value" style={{ color: "var(--accent-secondary)" }}>
            {overallProgressPercentage}%
          </div>
          <div className="stat-footer">
            {completedModulesCount} of {totalAssignedModules} modules done
          </div>
        </div>
      </div>

      {/* 2. Assigned Trainer Section */}
      <div className="card" style={{ marginBottom: "28px" }}>
        <div style={{ marginBottom: "18px" }}>
          <h2 className="card-title" style={{ margin: 0 }}>
            <span>Assigned Trainer</span>
            {uniqueTrainers.length > 0 && (
              <span className="badge badge-purple">{uniqueTrainers.length}</span>
            )}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Trainer responsible for guiding your training cohorts and curriculum
          </p>
        </div>

        {uniqueTrainers.length === 0 ? (
          <div
            style={{
              padding: "20px",
              border: "1px dashed var(--border-color)",
              borderRadius: "8px",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-secondary)",
              fontSize: "13px",
              lineHeight: "1.5",
            }}
          >
            No trainer assigned yet. Please contact your LMS administrator if you need assistance.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {uniqueTrainers.map((trainer) => (
              <div
                key={trainer.id}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "16px 18px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                }}
              >
                {/* Trainer Avatar Badge */}
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(168, 85, 247, 0.15)",
                    color: "var(--accent-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: "600",
                    flexShrink: 0,
                  }}
                >
                  {(trainer.name || trainer.username)[0].toUpperCase()}
                </div>

                {/* Trainer Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "15px",
                        fontWeight: "600",
                        color: "var(--text-main)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {trainer.name}
                    </h3>
                    <span className="badge badge-info" style={{ fontSize: "11px", flexShrink: 0 }}>
                      Trainer
                    </span>
                  </div>

                  {trainer.email ? (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "8px",
                        wordBreak: "break-all",
                      }}
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                      </svg>
                      <a
                        href={`mailto:${trainer.email}`}
                        style={{ color: "var(--accent-secondary)", textDecoration: "none" }}
                      >
                        {trainer.email}
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                      Email not provided
                    </div>
                  )}

                  {trainer.groups.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Cohort:</span>
                      {trainer.groups.map((grpName) => (
                        <span key={grpName} className="badge badge-purple" style={{ fontSize: "11px" }}>
                          {grpName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Continue Learning Section */}
      <div className="card" style={{ marginBottom: "28px" }}>
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
            <h2 className="card-title" style={{ margin: 0 }}>
              <span>Continue Learning</span>
              <span className="badge badge-purple">{courses.length}</span>
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Pick up where you left off in your assigned curriculum
            </p>
          </div>
          {onNavigateToCourses && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onNavigateToCourses}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              View All in My Learning &rarr;
            </button>
          )}
        </div>

        {courses.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              border: "1px dashed var(--border-color)",
              borderRadius: "8px",
              backgroundColor: "var(--bg-surface)",
            }}
          >
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
              No courses are currently assigned to you. When training content is assigned, it will appear here.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {courses.map((course) => {
              const { totalMods, completedMods, percentage } = getCourseProgress(course.id);
              return (
                <div
                  key={course.id}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    padding: "18px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "10px",
                      }}
                    >
                      <span className="badge badge-info" style={{ fontFamily: "var(--font-mono)" }}>
                        {course.code || `CRS-${course.id}`}
                      </span>
                      {course.status && (
                        <span
                          className={`badge ${
                            course.status === "PUBLISHED" ? "badge-success" : "badge-warning"
                          }`}
                        >
                          {course.status}
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        fontSize: "15px",
                        fontWeight: "600",
                        color: "var(--text-main)",
                        margin: "0 0 6px 0",
                        lineHeight: "1.3",
                      }}
                    >
                      {course.name}
                    </h3>

                    {course.description && (
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          lineHeight: "1.4",
                          margin: "0 0 14px 0",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {course.description}
                      </p>
                    )}

                    {/* Progress representation */}
                    <div style={{ margin: "12px 0 16px 0" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          marginBottom: "4px",
                        }}
                      >
                        <span>Course Progress</span>
                        <span style={{ fontWeight: "600", color: "var(--text-main)" }}>
                          {totalMods > 0 ? `${completedMods}/${totalMods} modules (${percentage}%)` : "No modules"}
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "6px",
                          backgroundColor: "var(--bg-card)",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${percentage}%`,
                            height: "100%",
                            backgroundColor: percentage === 100 ? "var(--status-success)" : "var(--accent-secondary)",
                            borderRadius: "3px",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      window.open(`/learner/reader?courseId=${course.id}`, "_blank");
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "13px",
                      marginTop: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{percentage > 0 ? "Continue Learning" : "View Course"}</span>
                    <span>&rarr;</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Recent Learning Activity Section (only rendered when real activity data exists) */}
      {recentResponses.length > 0 && (
        <div className="card">
          <div style={{ marginBottom: "16px" }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              <span>Recent Learning Activity</span>
              <span className="badge badge-info">{recentResponses.length}</span>
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Your recent module question responses and submissions
            </p>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Your Answer</th>
                  <th>Submitted At</th>
                </tr>
              </thead>
              <tbody>
                {recentResponses.slice(0, 5).map((resp) => (
                  <tr key={resp.id}>
                    <td style={{ color: "var(--text-main)", fontWeight: "500" }}>
                      {resp.question_text || `Question #${resp.question}`}
                    </td>
                    <td>
                      <span className={`badge ${resp.response_value ? "badge-success" : "badge-warning"}`}>
                        {resp.response_value ? "Yes" : "No"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                      {resp.submitted_at ? new Date(resp.submitted_at).toLocaleString() : "Recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
