import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../services/api";

export default function AdminProgressionTab() {
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProgression = useCallback(async () => {
    try {
      const data = await apiClient("/admin/reports/progress/");
      setProgressData(data);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load learner progression reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const data = await apiClient("/admin/reports/progress/");
        if (isMounted) {
          setProgressData(data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load learner progression reports.");
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
    loadProgression();
  };

  if (loading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p style={{ color: "var(--text-secondary)" }}>Calculating system progression statistics...</p>
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

  const cohorts = progressData?.cohorts || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>Learner Progression & Cohort Completion</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
            Real-time completion tracking calculated from verified module completion question submissions.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRefresh}
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          Refresh Reports
        </button>
      </div>

      {/* Progression Stat Cards */}
      <div className="stats-grid" style={{ marginBottom: "20px" }}>
        <div className="stat-card">
          <div className="stat-header">System Completion Rate</div>
          <div className="stat-value" style={{ color: "var(--status-success)" }}>
            {progressData?.system_completion_rate ?? 0}%
          </div>
          <div className="stat-footer">Across all active enrolled cohorts</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Active Enrolled Learners</div>
          <div className="stat-value">{progressData?.total_active_learners ?? 0}</div>
          <div className="stat-footer">With active group memberships</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">Active Learner Cohorts</div>
          <div className="stat-value">{progressData?.total_learner_groups ?? 0}</div>
          <div className="stat-footer">Tracking completion criteria</div>
        </div>
      </div>

      {/* Cohort Progression Table */}
      <div className="card">
        <h3 className="card-title">
          <span>Cohort Completion Performance</span>
          <span className="badge badge-purple">{cohorts.length} Cohorts</span>
        </h3>

        {cohorts.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
            No cohort progression data available yet. Ensure learner groups and training assignments are configured.
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cohort ID</th>
                  <th>Group Name</th>
                  <th>Code</th>
                  <th>Candidate Type</th>
                  <th>Learners</th>
                  <th>Average Progress</th>
                  <th>Fully Completed</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr key={cohort.group_id}>
                    <td><code>#{cohort.group_id}</code></td>
                    <td><strong>{cohort.group_name}</strong></td>
                    <td><code>{cohort.group_code}</code></td>
                    <td>{cohort.candidate_type || "—"}</td>
                    <td><span className="badge badge-info">{cohort.total_learners}</span></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          flex: 1, backgroundColor: "var(--bg-main)", height: "8px", borderRadius: "4px", overflow: "hidden", minWidth: "80px"
                        }}>
                          <div style={{
                            width: `${Math.min(100, Math.max(0, cohort.average_completion_percentage))}%`,
                            backgroundColor: cohort.average_completion_percentage === 100 ? "var(--status-success)" : "var(--accent-primary)",
                            height: "100%"
                          }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: "600", minWidth: "40px" }}>
                          {cohort.average_completion_percentage}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${cohort.completed_learners_count > 0 ? "badge-success" : "badge-info"}`}>
                        {cohort.completed_learners_count} / {cohort.total_learners}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: "20px", fontSize: "13px", color: "var(--text-secondary)" }}>
        <h4 style={{ margin: "0 0 8px 0", color: "var(--text-main)", fontSize: "14px" }}>
          Module Completion Business Rule
        </h4>
        <p style={{ margin: "0 0 4px 0" }}>
          &bull; A module is marked <strong>Complete</strong> only when at least one active required question exists, and the learner has submitted an answer to every active required question.
        </p>
        <p style={{ margin: 0 }}>
          &bull; Modules with zero active required questions strictly remain incomplete until required questions are added and answered.
        </p>
      </div>
    </div>
  );
}
