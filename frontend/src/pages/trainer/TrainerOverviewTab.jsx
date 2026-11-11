import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import { apiClient } from "../../services/api";

export default function TrainerOverviewTab({ onNavigateToLearners, onSelectLearner }) {
  const { user, activePortal } = useAuth();
  const isAdminPreview = user?.role === "ADMIN" && activePortal === "TRAINER";

  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(!isAdminPreview);
  const [error, setError] = useState(null);

  const loadOverview = useCallback(async () => {
    if (isAdminPreview) return;
    try {
      const data = await apiClient("/trainer/learners/");
      const learnerList = Array.isArray(data?.learners) ? data.learners : [];
      setLearners(learnerList);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load trainer overview.");
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
        const data = await apiClient("/trainer/learners/");
        if (isMounted) {
          const learnerList = Array.isArray(data?.learners) ? data.learners : [];
          setLearners(learnerList);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load trainer overview.");
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [isAdminPreview]);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    loadOverview();
  };

  // If in Admin Preview mode, render generic preview without requesting trainer-specific data
  if (isAdminPreview) {
    return (
      <div className="tab-pane active" style={{ animation: "fadeIn 0.2s ease" }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
            Instructor Dashboard Preview
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Sample representation of an instructor's dashboard interface. Real trainer metrics and individual learner records are isolated.
          </p>
        </div>

        {/* Generic Informational Cards Grid */}
        <div className="stats-grid" style={{ marginBottom: "28px" }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#3B82F6" }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="stat-details">
              <span className="stat-label">Assigned Cohorts</span>
              <div className="stat-number">—</div>
              <span className="stat-desc" style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                Preview only • Active cohorts
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10B981" }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="stat-details">
              <span className="stat-label">Enrolled Learners</span>
              <div className="stat-number">—</div>
              <span className="stat-desc" style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                Preview only • Total learners
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#F59E0B" }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="stat-details">
              <span className="stat-label">Learner Progress</span>
              <div className="stat-number">—</div>
              <span className="stat-desc" style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                Preview only • Module completion rate
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#8B5CF6" }}>
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="stat-details">
              <span className="stat-label">Training Reports</span>
              <div className="stat-number">—</div>
              <span className="stat-desc" style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                Preview only • Performance reports
              </span>
            </div>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "6px" }}>
                Sample Overview & Layout Preview
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.6", margin: "0 0 16px 0" }}>
                When authentic instructors log in to this portal, this dashboard displays their assigned cohorts, real-time learner progress, completion rates, and quick navigation to detailed learner reports.
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
      <div className="card" style={{ textAlign: "center", padding: "40px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p style={{ color: "var(--text-secondary)" }}>Loading trainer metrics and assigned learners...</p>
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

  // Derive metrics strictly from the actual API response
  const totalLearners = learners.length;

  // Extract unique assigned groups across all visible learners
  const groupSet = new Set();
  learners.forEach((l) => {
    if (Array.isArray(l.assigned_groups)) {
      l.assigned_groups.forEach((g) => {
        if (typeof g === "string" && g.trim()) {
          groupSet.add(g.trim());
        }
      });
    }
  });
  const totalGroups = groupSet.size;

  // Aggregate completion status counts across assigned learners
  let fullyCompletedLearners = 0;
  let inProgressLearners = 0;
  let notStartedLearners = 0;
  let totalAssignedModulesSum = 0;
  let completedModulesSum = 0;

  learners.forEach((l) => {
    totalAssignedModulesSum += (l.total_assigned_modules || 0);
    completedModulesSum += (l.completed_modules || 0);

    if ((l.total_assigned_modules || 0) > 0 && l.completed_modules === l.total_assigned_modules) {
      fullyCompletedLearners += 1;
    } else if ((l.completed_modules || 0) > 0) {
      inProgressLearners += 1;
    } else {
      notStartedLearners += 1;
    }
  });

  const averageCohortCompletion = totalAssignedModulesSum > 0
    ? roundPercentage((completedModulesSum / totalAssignedModulesSum) * 100)
    : 0;

  function roundPercentage(num) {
    return Math.round(num * 10) / 10;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>Trainer Dashboard Overview</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
            Real-time cohort progress metrics and assigned learner activity.
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

      {/* Metrics Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">Assigned Learners</div>
          <div className="stat-value">{totalLearners}</div>
          <div className="stat-footer">Active in assigned cohorts</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Assigned Groups</div>
          <div className="stat-value">{totalGroups}</div>
          <div className="stat-footer">Learner cohorts actively managed</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Average Progress</div>
          <div className="stat-value" style={{ color: "var(--accent-secondary)" }}>
            {averageCohortCompletion}%
          </div>
          <div className="stat-footer">{completedModulesSum} / {totalAssignedModulesSum} modules completed</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Fully Completed</div>
          <div className="stat-value" style={{ color: "var(--status-success)" }}>
            {fullyCompletedLearners}
          </div>
          <div className="stat-footer">{inProgressLearners} in progress &bull; {notStartedLearners} pending</div>
        </div>
      </div>

      {/* Assigned Cohorts Summary List */}
      <div className="card" style={{ marginTop: "24px" }}>
        <h3 className="card-title">
          <span>Active Assigned Cohorts</span>
          <span className="badge badge-purple">{totalGroups} Cohorts</span>
        </h3>

        {totalGroups === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
            No cohorts or groups are currently assigned to your trainer profile. Contact an administrator to allocate groups.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
            {Array.from(groupSet).map((groupName) => (
              <div
                key={groupName}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "var(--accent-primary)"
                }}></div>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>{groupName}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {learners.filter((l) => Array.isArray(l.assigned_groups) && l.assigned_groups.includes(groupName)).length} Assigned Learners
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Learners Quick View */}
      <div className="card" style={{ marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            <span>Assigned Learners Snapshot</span>
            <span className="badge badge-purple">{totalLearners} Learners</span>
          </h3>
          {totalLearners > 0 && onNavigateToLearners && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onNavigateToLearners}
              style={{ fontSize: "12px", padding: "4px 10px" }}
            >
              View All in Progression &rarr;
            </button>
          )}
        </div>

        {totalLearners === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
            No learners assigned to your active groups yet.
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Learner ID</th>
                  <th>Name / Username</th>
                  <th>Assigned Groups</th>
                  <th>Modules Progress</th>
                  <th>Completion Rate</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {learners.slice(0, 10).map((l) => (
                  <tr key={l.learner_id}>
                    <td><code>#{l.learner_id}</code></td>
                    <td>
                      <strong>{l.learner_name}</strong>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{l.learner_username}</div>
                    </td>
                    <td>
                      {Array.isArray(l.assigned_groups) && l.assigned_groups.length > 0 ? (
                        l.assigned_groups.map((g) => (
                          <span key={g} className="badge badge-info" style={{ marginRight: "4px" }}>
                            {g}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {l.completed_modules} / {l.total_assigned_modules} Completed
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          flex: 1, backgroundColor: "var(--bg-main)", height: "8px", borderRadius: "4px", overflow: "hidden", minWidth: "60px"
                        }}>
                          <div style={{
                            width: `${Math.min(100, Math.max(0, l.completion_percentage))}%`,
                            backgroundColor: l.completion_percentage === 100 ? "var(--status-success)" : "var(--accent-primary)",
                            height: "100%"
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: "600", minWidth: "36px" }}>
                          {l.completion_percentage}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onSelectLearner && onSelectLearner(l.learner_id)}
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                      >
                        Inspect Progress
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

