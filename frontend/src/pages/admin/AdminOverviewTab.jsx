import { useEffect, useState, useCallback, useRef } from "react";
import { apiClient } from "../../services/api";


/**
 * Fallback generator for human-readable audit activity descriptions across at least two lines.
 */
function getAuditDescription(act) {
  if (act.description) {
    return act.description;
  }
  const details = act.details || {};
  const name = details.name || details.title;
  const label = name ? `"${name}"` : `record #${act.entity_id}`;

  if (act.action === "CREATE") {
    return `A new ${act.entity_type.toLowerCase()}, ${label}, was created in the LMS.\nThe record is now established in the system for administrative tracking.`;
  }
  if (act.action === "UPDATE") {
    return `The ${act.entity_type.toLowerCase()} record, ${label}, was updated in the administration portal.\nReview the latest changes to ensure settings reflect current operational requirements.`;
  }
  if (act.action === "DELETE") {
    return `The ${act.entity_type.toLowerCase()} record, ${label}, was deleted from the LMS.\nThe activity is retained in the audit history for administrative tracking and governance.`;
  }
  if (act.action === "PUBLISH") {
    const ver = details.version ? `Version ${details.version}` : "A new version";
    return `A new version of the learning material, ${label}, was published.\n${ver} is now recorded as the active published version for assigned learners.`;
  }
  if (act.action === "ASSIGN") {
    return `An assignment action was recorded for ${act.entity_type} #${act.entity_id}.\nThis relationship has been updated in the portal learning and administration workflows.`;
  }
  return `The recorded administrator performed ${act.action.toLowerCase()} on ${act.entity_type} (${label}).\nThis action has been logged for administrative compliance and audit history.`;
}

/**
 * Donut chart component using lightweight native SVG.
 * Handles zero values gracefully with theme-aware styling.
 */
function UserDistributionDonut({ admins = 0, trainers = 0, learners = 0 }) {
  const total = admins + trainers + learners;

  // Safe percentages
  const adminPct = total > 0 ? (admins / total) * 100 : 0;
  const trainerPct = total > 0 ? (trainers / total) * 100 : 0;
  const learnerPct = total > 0 ? (learners / total) * 100 : 0;

  // SVG circle calculation: r=15.9155 => circumference ~ 100
  const r = 15.9155;
  const c = 100;

  // Offsets for stroke-dasharray [length, remaining] and stroke-dashoffset
  const adminOffset = 25; // start at top (12 o'clock)
  const trainerOffset = 25 - adminPct;
  const learnerOffset = 25 - adminPct - trainerPct;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: "120px", height: "120px", flexShrink: 0 }}>
        {total === 0 ? (
          <svg viewBox="0 0 42 42" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
            <circle
              cx="21"
              cy="21"
              r={r}
              fill="transparent"
              stroke="var(--border-color)"
              strokeWidth="4.5"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 42 42" style={{ width: "100%", height: "100%" }}>
            {/* Background ring */}
            <circle
              cx="21"
              cy="21"
              r={r}
              fill="transparent"
              stroke="var(--bg-surface)"
              strokeWidth="4.5"
            />
            {/* Admins ring (Purple/Indigo) */}
            {admins > 0 && (
              <circle
                cx="21"
                cy="21"
                r={r}
                fill="transparent"
                stroke="var(--accent-primary)"
                strokeWidth="4.5"
                strokeDasharray={`${adminPct} ${c - adminPct}`}
                strokeDashoffset={adminOffset}
              />
            )}
            {/* Trainers ring (Cyan/Sky) */}
            {trainers > 0 && (
              <circle
                cx="21"
                cy="21"
                r={r}
                fill="transparent"
                stroke="var(--accent-secondary)"
                strokeWidth="4.5"
                strokeDasharray={`${trainerPct} ${c - trainerPct}`}
                strokeDashoffset={trainerOffset}
              />
            )}
            {/* Learners ring (Green) */}
            {learners > 0 && (
              <circle
                cx="21"
                cy="21"
                r={r}
                fill="transparent"
                stroke="var(--status-success)"
                strokeWidth="4.5"
                strokeDasharray={`${learnerPct} ${c - learnerPct}`}
                strokeDashoffset={learnerOffset}
              />
            )}
          </svg>
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-main)", lineHeight: 1 }}>
            {total}
          </span>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", textTransform: "uppercase" }}>
            Users
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, minWidth: "140px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "var(--accent-primary)",
                display: "inline-block",
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>Admins</span>
          </div>
          <span style={{ fontWeight: "600", color: "var(--text-main)" }}>
            {admins} <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>({adminPct.toFixed(0)}%)</span>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "var(--accent-secondary)",
                display: "inline-block",
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>Trainers</span>
          </div>
          <span style={{ fontWeight: "600", color: "var(--text-main)" }}>
            {trainers} <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>({trainerPct.toFixed(0)}%)</span>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "var(--status-success)",
                display: "inline-block",
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>Learners</span>
          </div>
          <span style={{ fontWeight: "600", color: "var(--text-main)" }}>
            {learners} <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>({learnerPct.toFixed(0)}%)</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Visual horizontal multi-segment bar chart showing module status breakdown (Published vs Draft).
 */
function ModuleStatusChart({ published = 0, draft = 0, total = 0 }) {
  const effectiveTotal = total > 0 ? total : published + draft;
  const publishedPct = effectiveTotal > 0 ? (published / effectiveTotal) * 100 : 0;
  const draftPct = effectiveTotal > 0 ? (draft / effectiveTotal) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Visual Multi-segment bar */}
      <div
        style={{
          width: "100%",
          height: "12px",
          borderRadius: "6px",
          background: "var(--bg-surface)",
          overflow: "hidden",
          display: "flex",
          border: "1px solid var(--border-color)",
        }}
      >
        {effectiveTotal === 0 ? (
          <div style={{ width: "100%", background: "transparent" }} />
        ) : (
          <>
            {published > 0 && (
              <div
                title={`Published: ${published} (${publishedPct.toFixed(1)}%)`}
                style={{
                  width: `${publishedPct}%`,
                  background: "var(--status-success)",
                  transition: "width 0.3s ease",
                }}
              />
            )}
            {draft > 0 && (
              <div
                title={`Draft: ${draft} (${draftPct.toFixed(1)}%)`}
                style={{
                  width: `${draftPct}%`,
                  background: "var(--status-warning)",
                  transition: "width 0.3s ease",
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Legend & Breakdown */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              background: "var(--status-success)",
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--text-secondary)" }}>Published:</span>
          <strong style={{ color: "var(--text-main)" }}>{published}</strong>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            ({effectiveTotal > 0 ? publishedPct.toFixed(0) : 0}%)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              background: "var(--status-warning)",
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--text-secondary)" }}>Draft:</span>
          <strong style={{ color: "var(--text-main)" }}>{draft}</strong>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            ({effectiveTotal > 0 ? draftPct.toFixed(0) : 0}%)
          </span>
        </div>

        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          Total Modules: <strong style={{ color: "var(--text-main)" }}>{effectiveTotal}</strong>
        </div>
      </div>
    </div>
  );
}

export default function AdminOverviewTab() {
  const [metrics, setMetrics] = useState(null);
  const [activities, setActivities] = useState([]);
  const [moduleList, setModuleList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // In-Progress Learners Modal State
  const [showInProgressModal, setShowInProgressModal] = useState(false);
  const [inProgressData, setInProgressData] = useState(null);
  const [inProgressLoading, setInProgressLoading] = useState(false);
  const [inProgressError, setInProgressError] = useState(null);
  const [inProgressSearch, setInProgressSearch] = useState("");
  const inProgressRequestIdRef = useRef(0);
  const modalCloseBtnRef = useRef(null);
  const inProgressCardRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [overviewData, activityData, modulesData] = await Promise.all([
        apiClient("/admin/reports/overview/"),
        apiClient("/admin/reports/activity/"),
        apiClient("/modules/").catch(() => []),
      ]);
      setMetrics(overviewData);
      setActivities(activityData?.recent_activities || []);
      const mods = Array.isArray(modulesData) ? modulesData : (modulesData?.results || []);
      setModuleList(mods);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load administrative overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [overviewData, activityData, modulesData] = await Promise.all([
          apiClient("/admin/reports/overview/"),
          apiClient("/admin/reports/activity/"),
          apiClient("/modules/").catch(() => []),
        ]);
        if (isMounted) {
          setMetrics(overviewData);
          setActivities(activityData?.recent_activities || []);
          const mods = Array.isArray(modulesData) ? modulesData : (modulesData?.results || []);
          setModuleList(mods);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load administrative overview.");
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    loadData();
  };

  const loadInProgressLearners = useCallback(async () => {
    const currentRequestId = ++inProgressRequestIdRef.current;
    setInProgressLoading(true);
    setInProgressError(null);
    try {
      const data = await apiClient("/admin/reports/in-progress-learners/");
      if (currentRequestId === inProgressRequestIdRef.current) {
        setInProgressData(data);
        setInProgressError(null);
      }
    } catch (err) {
      if (currentRequestId === inProgressRequestIdRef.current) {
        setInProgressError(err.message || "Failed to load in-progress learners.");
      }
    } finally {
      if (currentRequestId === inProgressRequestIdRef.current) {
        setInProgressLoading(false);
      }
    }
  }, []);

  const handleOpenInProgressModal = () => {
    setShowInProgressModal(true);
    setInProgressSearch("");
    loadInProgressLearners();
    setTimeout(() => {
      if (modalCloseBtnRef.current) {
        modalCloseBtnRef.current.focus();
      }
    }, 50);
  };

  const handleCloseInProgressModal = () => {
    setShowInProgressModal(false);
    if (inProgressCardRef.current) {
      inProgressCardRef.current.focus();
    }
  };

  const handleKeyDownCard = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpenInProgressModal();
    }
  };

  useEffect(() => {
    if (!showInProgressModal) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleCloseInProgressModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showInProgressModal]);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p style={{ color: "var(--text-secondary)" }}>Loading administrative metrics from backend...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error" role="status">
        <span>{error}</span>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRefresh}
          style={{ marginLeft: "12px", padding: "4px 8px", fontSize: "12px" }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Safe metrics calculations
  const totalUsers = metrics?.total_users ?? ((metrics?.total_admins ?? 0) + (metrics?.total_trainers ?? 0) + (metrics?.total_learners ?? 0));
  const totalAdmins = metrics?.total_admins ?? 0;
  const totalTrainers = metrics?.total_trainers ?? 0;
  const totalTrainersAndLearners = metrics?.total_trainers_and_learners ?? (totalTrainers + totalLearners);
  const totalLearners = metrics?.total_learners ?? 0;
  const inProgressLearnersCount = metrics?.in_progress_learners_count ?? 0;
  const totalCourses = metrics?.total_courses ?? 0;
  const draftCourses = metrics?.draft_courses ?? 0;
  const publishedCourses = metrics?.published_courses ?? 0;
  const totalModules = metrics?.total_modules ?? moduleList.length;

  // Actual module status counts calculated from moduleList
  const publishedModulesCount = moduleList.length > 0
    ? moduleList.filter((m) => m.status === "PUBLISHED").length
    : totalModules;
  const draftModulesCount = moduleList.length > 0
    ? moduleList.filter((m) => m.status === "DRAFT").length
    : 0;
  const effectiveTotalModules = moduleList.length > 0 ? moduleList.length : totalModules;
  const activeLearnersCount = metrics?.active_learners_count ?? 0;
  const completionRate = metrics?.system_wide_completion_rate ?? 0;
  const recentLogins = metrics?.recent_logins || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>System Overview & Key Metrics</h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Real-time platform status, user community, curriculum, and governance
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRefresh}
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          Refresh Data
        </button>
      </div>

      {/* Top Overview Cards Grid */}
      <div className="stats-grid">
        {/* Row 1, Card 1: Total LMS Users */}
        <div className="stat-card">
          <div className="stat-header">Total LMS Users</div>
          <div className="stat-value">{totalUsers}</div>
          <div className="stat-footer">
            {totalAdmins} Admin &bull; {totalTrainers} Trainer &bull; {totalLearners} Learner
          </div>
        </div>

        {/* Row 1, Card 2: Total LMS Admins */}
        <div className="stat-card">
          <div className="stat-header">Total LMS Admins</div>
          <div className="stat-value">{totalAdmins}</div>
          <div className="stat-footer">Full administrative privileges</div>
        </div>

        {/* Row 1, Card 3: Total LMS Trainers */}
        <div className="stat-card">
          <div className="stat-header">Total LMS Trainers</div>
          <div className="stat-value">{totalTrainers}</div>
          <div className="stat-footer">Assigned across cohorts</div>
        </div>

        {/* Row 1, Card 4: Total Trainers & Learners */}
        <div className="stat-card">
          <div className="stat-header">Total Trainers & Learners</div>
          <div className="stat-value">{totalTrainersAndLearners}</div>
          <div className="stat-footer">
            {totalTrainers} Trainer &bull; {totalLearners} Learner
          </div>
        </div>

        {/* Row 2, Card 1: Total LMS Learners */}
        <div className="stat-card">
          <div className="stat-header">Total LMS Learners</div>
          <div className="stat-value">{totalLearners}</div>
          <div className="stat-footer">
            {activeLearnersCount > 0 ? `${activeLearnersCount} Enrolled in Cohorts` : "0 Active Cohort Enrollments"}
          </div>
        </div>

        {/* Row 2, Card 3: Learner Completion Rate */}
        <div className="stat-card">
          <div className="stat-header">Learner Completion Rate</div>
          <div className="stat-value" style={{ color: activeLearnersCount > 0 ? "var(--status-success)" : "var(--text-secondary)" }}>
            {activeLearnersCount > 0 ? `${completionRate}%` : "N/A"}
          </div>
          <div className="stat-footer">
            {activeLearnersCount > 0 ? `${activeLearnersCount} Active Learners Enrolled` : "No active cohort assignments"}
          </div>
        </div>

        {/* Row 2, Card 4: Total Modules */}
        <div className="stat-card">
          <div className="stat-header">Total Modules</div>
          <div className="stat-value">{totalModules}</div>
          <div className="stat-footer">
            {publishedCourses} Published &bull; {draftCourses} Draft &bull; {totalModules} Modules
          </div>
        </div>
      </div>

      {/* Visual Analytics Section (Charts) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "28px" }}>
        {/* User Distribution Chart */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "16px", fontSize: "15px" }}>
            <span>User Distribution by Role</span>
            <span className="badge badge-purple">{totalUsers} Users</span>
          </h3>
          <UserDistributionDonut admins={totalAdmins} trainers={totalTrainers} learners={totalLearners} />
        </div>

        {/* Module Status Breakdown Chart */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: "16px", fontSize: "15px" }}>
            <span>Module Status Breakdown</span>
            <span className="badge badge-info">{effectiveTotalModules} Modules</span>
          </h3>
          <ModuleStatusChart published={publishedModulesCount} draft={draftModulesCount} total={effectiveTotalModules} />
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "16px", lineHeight: "1.4" }}>
            Modules are learning units within courses. Published modules are available according to the LMS's existing course access and assignment rules.
          </p>
        </div>
      </div>

      {/* Recent Logins & System Activity Section */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        {/* Recent User Logins */}
        <div className="card">
          <h3 className="card-title" style={{ fontSize: "15px" }}>
            <span>Recent Platform Logins</span>
            <span className="badge badge-teal">{recentLogins.length} Users</span>
          </h3>
          {recentLogins.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", padding: "16px 0", textAlign: "center", fontSize: "13px" }}>
              No recent logins recorded.
            </p>
          ) : (
            <div className="table-container" style={{ marginTop: "12px" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogins.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong style={{ color: "var(--text-main)", fontSize: "13px" }}>{u.username}</strong>
                        {u.email && (
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{u.email}</div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            u.role === "ADMIN" ? "badge-purple" : u.role === "TRAINER" ? "badge-info" : "badge-success"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap", fontSize: "12px", color: "var(--text-secondary)" }}>
                        {u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Learner Progress Overview Summary */}
        <div className="card">
          <h3 className="card-title" style={{ fontSize: "15px" }}>
            <span>Learner Progression Status</span>
            <span className="badge badge-warning">Cohort Progress</span>
          </h3>
          <div style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Active Learner Cohorts:</span>
              <strong style={{ color: "var(--text-main)" }}>{metrics?.total_learner_groups ?? 0}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Candidate Types:</span>
              <strong style={{ color: "var(--text-main)" }}>{metrics?.total_candidate_types ?? 0}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Active Learners Assigned:</span>
              <strong style={{ color: "var(--text-main)" }}>{activeLearnersCount}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Learners In Progress:</span>
              <strong style={{ color: inProgressLearnersCount > 0 ? "var(--accent-secondary)" : "var(--text-main)" }}>{inProgressLearnersCount}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>System Completion Rate:</span>
              <strong style={{ color: activeLearnersCount > 0 ? "var(--status-success)" : "var(--text-muted)" }}>
                {activeLearnersCount > 0 ? `${completionRate}%` : "No active assignments"}
              </strong>
            </div>

            {activeLearnersCount === 0 && (
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-color)",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  lineHeight: "1.4",
                }}
              >
                <strong style={{ color: "var(--status-warning)" }}>Note:</strong> No active learner enrollments or training assignments are currently assigned. Completion rates will calculate automatically once learners are enrolled into active cohorts with assigned course modules.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent System Audit Activity Table */}
      <div className="card">
        <h3 className="card-title">
          <span>Recent Administrative & Audit Activity</span>
          <span className="badge badge-purple">{activities.length} Events</span>
        </h3>

        {activities.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
            No recent audit events recorded.
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Performed By</th>
                  <th>Action</th>
                  <th>Item Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {activities.slice(0, 15).map((act) => {
                  const descriptionText = getAuditDescription(act);
                  const descLines = descriptionText.split("\n");

                  return (
                    <tr key={act.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "12px", color: "var(--text-secondary)", verticalAlign: "top" }}>
                        {new Date(act.timestamp).toLocaleString()}
                      </td>
                      <td style={{ verticalAlign: "top" }}>
                        <strong style={{ color: "var(--text-main)" }}>{act.actor}</strong>
                      </td>
                      <td style={{ verticalAlign: "top" }}>
                        <span className={`badge ${act.action === "CREATE" ? "badge-success" : act.action === "DELETE" ? "badge-warning" : "badge-info"}`}>
                          {act.action}
                        </span>
                      </td>
                      <td style={{ verticalAlign: "top" }}>{act.entity_type}</td>
                      <td style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--text-main)", verticalAlign: "top" }}>
                        {descLines.map((line, lIdx) => (
                          <div
                            key={lIdx}
                            style={{
                              color: lIdx === 0 ? "var(--text-main)" : "var(--text-secondary)",
                              fontSize: lIdx === 0 ? "13px" : "12px",
                              marginTop: lIdx > 0 ? "3px" : 0,
                            }}
                          >
                            {line}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Learners In Progress Details Modal */}
      {showInProgressModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
            boxSizing: "border-box",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseInProgressModal();
            }
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "960px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "600", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>Learners In Progress Overview</span>
                  {inProgressData && (
                    <span className="badge badge-purple">
                      {inProgressData.total_in_progress_learners} Unique {inProgressData.total_in_progress_learners === 1 ? "Learner" : "Learners"} &bull; {inProgressData.total_in_progress_module_enrollments} {inProgressData.total_in_progress_module_enrollments === 1 ? "Module" : "Modules"}
                    </span>
                  )}
                </h3>
                <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>
                  Detailed breakdown of learners who have submitted responses for modules that remain incomplete.
                </p>
              </div>
              <button
                ref={modalCloseBtnRef}
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseInProgressModal}
                style={{ padding: "6px 12px", fontSize: "16px", lineHeight: 1 }}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {inProgressLoading ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading in-progress learner records...</p>
                </div>
              ) : inProgressError ? (
                <div className="alert alert-error" role="status" style={{ margin: "20px 0" }}>
                  <span>{inProgressError}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={loadInProgressLearners}
                    style={{ marginLeft: "12px", padding: "4px 10px", fontSize: "12px" }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {/* Search and Summary Bar */}
                  <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ flex: "1", minWidth: "240px", maxWidth: "420px" }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Search by learner, email, course, or module..."
                        value={inProgressSearch}
                        onChange={(e) => setInProgressSearch(e.target.value)}
                        style={{ padding: "8px 12px", fontSize: "13px" }}
                      />
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                      Showing {
                        (inProgressData?.items || []).filter((item) => {
                          const query = inProgressSearch.toLowerCase().trim();
                          if (!query) return true;
                          return (
                            (item.learner_name && item.learner_name.toLowerCase().includes(query)) ||
                            (item.learner_username && item.learner_username.toLowerCase().includes(query)) ||
                            (item.learner_email && item.learner_email.toLowerCase().includes(query)) ||
                            (item.course_name && item.course_name.toLowerCase().includes(query)) ||
                            (item.module_name && item.module_name.toLowerCase().includes(query))
                          );
                        }).length
                      } of {inProgressData?.total_in_progress_module_enrollments ?? 0} unfinished module records
                    </div>
                  </div>

                  {/* Details Table */}
                  {(() => {
                    const filteredItems = (inProgressData?.items || []).filter((item) => {
                      const query = inProgressSearch.toLowerCase().trim();
                      if (!query) return true;
                      return (
                        (item.learner_name && item.learner_name.toLowerCase().includes(query)) ||
                        (item.learner_username && item.learner_username.toLowerCase().includes(query)) ||
                        (item.learner_email && item.learner_email.toLowerCase().includes(query)) ||
                        (item.course_name && item.course_name.toLowerCase().includes(query)) ||
                        (item.module_name && item.module_name.toLowerCase().includes(query))
                      );
                    });

                    if ((inProgressData?.items || []).length === 0) {
                      return (
                        <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-secondary)" }}>
                          <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: "0 auto 12px", opacity: 0.5 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-main)" }}>
                            No Learners Currently In Progress
                          </div>
                          <p style={{ margin: "6px 0 0", fontSize: "13px" }}>
                            No learners currently have unfinished modules. Learners will appear here once they begin answering module questions until all required questions are completed.
                          </p>
                        </div>
                      );
                    }

                    if (filteredItems.length === 0) {
                      return (
                        <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-secondary)" }}>
                          <p style={{ margin: 0, fontSize: "14px" }}>
                            No in-progress learners match your search query "{inProgressSearch}".
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Learner</th>
                              <th>Email</th>
                              <th>Course</th>
                              <th>Module</th>
                              <th>Required Questions</th>
                              <th>Progress</th>
                              <th>Last Activity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredItems.map((item, idx) => (
                              <tr key={`${item.learner_id}-${item.module_id}-${idx}`}>
                                <td>
                                  <div>
                                    <strong style={{ color: "var(--text-main)" }}>{item.learner_name}</strong>
                                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                      @{item.learner_username}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                    {item.learner_email || "—"}
                                  </span>
                                </td>
                                <td>
                                  <strong style={{ fontSize: "13px" }}>{item.course_name}</strong>
                                </td>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span>{item.module_name}</span>
                                    <span className="badge badge-warning" style={{ fontSize: "10px", padding: "1px 6px" }}>
                                      Incomplete
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ fontSize: "12px", fontWeight: "500" }}>
                                    {item.answered_required_questions} of {item.total_required_questions} answered
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "110px" }}>
                                    <div
                                      style={{
                                        flex: 1,
                                        backgroundColor: "var(--bg-main)",
                                        height: "6px",
                                        borderRadius: "3px",
                                        overflow: "hidden",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: `${Math.min(100, Math.max(0, item.completion_percentage))}%`,
                                          backgroundColor: "var(--accent-secondary)",
                                          height: "100%",
                                        }}
                                      />
                                    </div>
                                    <span style={{ fontSize: "11px", fontWeight: "600", minWidth: "35px" }}>
                                      {item.completion_percentage}%
                                    </span>
                                  </div>
                                </td>
                                <td style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                  {item.last_activity ? new Date(item.last_activity).toLocaleString() : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Press <kbd style={{ padding: "2px 5px", backgroundColor: "var(--bg-main)", border: "1px solid var(--border-color)", borderRadius: "3px" }}>Esc</kbd> to close
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCloseInProgressModal}
                style={{ padding: "6px 16px", fontSize: "13px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
