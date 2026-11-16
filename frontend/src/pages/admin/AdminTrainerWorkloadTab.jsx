import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../services/api";

export default function AdminTrainerWorkloadTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrainer, setSelectedTrainer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadWorkload = useCallback(async () => {
    try {
      const res = await apiClient("/admin/reports/trainer-workload/");
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load trainer workload report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const res = await apiClient("/admin/reports/trainer-workload/");
        if (isMounted) {
          setData(res);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load trainer workload report.");
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
    loadWorkload();
  };

  const trainers = data?.trainers || [];
  const filteredTrainers = trainers.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.trainer_name?.toLowerCase().includes(q) ||
      t.trainer_username?.toLowerCase().includes(q) ||
      t.trainer_email?.toLowerCase().includes(q) ||
      t.assigned_groups?.some((g) => g.group_name?.toLowerCase().includes(q) || g.group_code?.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      {/* Header and Refresh */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>Trainer Workload & Curriculum Oversight</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
            Monitor trainer assignments, active candidate cohorts, curriculum responsibilities, and group-level progression.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRefresh}
          disabled={loading}
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="status" style={{ marginBottom: "16px" }}>
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
      )}

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
          <p style={{ color: "var(--text-secondary)" }}>Loading trainer workload reports...</p>
        </div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px"
          }}>
            <div className="card">
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Total Trainers
              </span>
              <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "6px", color: "var(--text-primary)" }}>
                {data?.total_trainers ?? 0}
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                {data?.total_trainers_with_assignments ?? 0} with active cohorts
              </span>
            </div>

            <div className="card">
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Assigned Cohorts
              </span>
              <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "6px", color: "var(--accent-primary)" }}>
                {data?.total_assigned_cohorts ?? 0}
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                Active learner groups mapped
              </span>
            </div>

            <div className="card">
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Candidates Reached
              </span>
              <div style={{ fontSize: "24px", fontWeight: "700", marginTop: "6px", color: "var(--status-success)" }}>
                {data?.total_distinct_candidates_reached ?? 0}
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                Distinct active learners
              </span>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search trainers by name, username, or assigned cohort..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "320px", padding: "8px 12px", fontSize: "13px" }}
            />
            <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Showing <strong>{filteredTrainers.length}</strong> of <strong>{trainers.length}</strong> trainers
            </div>
          </div>

          {/* Trainers Workload Table */}
          <div className="card">
            <h3 className="card-title">
              <span>Trainer Workload Overview</span>
              <span className="badge badge-purple">{filteredTrainers.length} Trainers</span>
            </h3>

            {filteredTrainers.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                {trainers.length === 0
                  ? "No trainers registered in the system."
                  : "No trainers match the search criteria."}
              </p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Trainer</th>
                      <th>Assigned Groups</th>
                      <th>Candidates (Per Group)</th>
                      <th>Assigned Curriculum</th>
                      <th>Distinct Candidates</th>
                      <th>Learner Progress</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTrainers.map((t, index) => (
                      <tr key={t.trainer_id}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{t.trainer_name}</strong>
                          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                            @{t.trainer_username} {t.trainer_email ? `• ${t.trainer_email}` : ""}
                          </div>
                        </td>
                        <td>
                          {t.assigned_groups.length === 0 ? (
                            <span style={{ color: "var(--text-secondary)", fontStyle: "italic", fontSize: "12px" }}>
                              No groups assigned
                            </span>
                          ) : (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {t.assigned_groups.map((g) => (
                                <span key={g.group_id} className="badge badge-info" title={`Group Code: ${g.group_code}`}>
                                  {g.group_name}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {t.assigned_groups.length === 0 ? (
                            <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>—</span>
                          ) : (
                            <div style={{ fontSize: "12px" }}>
                              {t.assigned_groups.map((g) => (
                                <div key={g.group_id} style={{ color: "var(--text-secondary)" }}>
                                  <strong>{g.group_name}:</strong> {g.active_candidates_count} {g.active_candidates_count === 1 ? "learner" : "learners"}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {t.total_assigned_modules_count === 0 ? (
                            <span style={{ color: "var(--text-secondary)", fontSize: "12px", fontStyle: "italic" }}>
                              No curriculum assigned
                            </span>
                          ) : (
                            <span className="badge badge-purple">
                              {t.total_assigned_courses_count} {t.total_assigned_courses_count === 1 ? "Course" : "Courses"} • {t.total_assigned_modules_count} {t.total_assigned_modules_count === 1 ? "Module" : "Modules"}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: "13px", fontWeight: "600", color: t.distinct_candidates_count > 0 ? "var(--status-success)" : "var(--text-secondary)" }}>
                            {t.distinct_candidates_count}
                          </span>
                        </td>
                        <td>
                          {t.assigned_groups.length === 0 ? (
                            <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>—</span>
                          ) : (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                                <span>Avg: {t.overall_completion_percentage}%</span>
                              </div>
                              <div style={{ width: "100%", minWidth: "90px", height: "6px", backgroundColor: "var(--bg-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
                                <div
                                  style={{
                                    width: `${Math.min(100, Math.max(0, t.overall_completion_percentage))}%`,
                                    height: "100%",
                                    backgroundColor: t.overall_completion_percentage >= 100 ? "var(--status-success)" : "var(--accent-primary)",
                                    borderRadius: "3px",
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setSelectedTrainer(t)}
                            style={{ padding: "5px 10px", fontSize: "12px", whiteSpace: "nowrap" }}
                            title="Inspect detailed cohort breakdown and curriculum obligations"
                          >
                            Inspect Workload
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Inspect Workload Detailed Modal / Drawer */}
      {selectedTrainer && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "800px", maxHeight: "90vh", overflowY: "auto", margin: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", color: "var(--text-primary)" }}>
                  Trainer Workload Breakdown: {selectedTrainer.trainer_name}
                </h3>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  @{selectedTrainer.trainer_username} {selectedTrainer.trainer_email ? `• ${selectedTrainer.trainer_email}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedTrainer(null)}
                style={{ padding: "4px 10px", fontSize: "12px" }}
              >
                Close
              </button>
            </div>

            {/* Trainer High-Level Summary */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "12px",
              marginBottom: "20px"
            }}>
              <div style={{ backgroundColor: "var(--bg-tertiary)", padding: "12px", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Assigned Cohorts</span>
                <div style={{ fontSize: "18px", fontWeight: "700", marginTop: "4px" }}>
                  {selectedTrainer.assigned_groups_count}
                </div>
              </div>
              <div style={{ backgroundColor: "var(--bg-tertiary)", padding: "12px", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Distinct Candidates</span>
                <div style={{ fontSize: "18px", fontWeight: "700", marginTop: "4px", color: "var(--status-success)" }}>
                  {selectedTrainer.distinct_candidates_count}
                </div>
              </div>
              <div style={{ backgroundColor: "var(--bg-tertiary)", padding: "12px", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Curriculum In Scope</span>
                <div style={{ fontSize: "18px", fontWeight: "700", marginTop: "4px", color: "var(--accent-primary)" }}>
                  {selectedTrainer.total_assigned_modules_count} Modules
                </div>
              </div>
              <div style={{ backgroundColor: "var(--bg-tertiary)", padding: "12px", borderRadius: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Avg Progress</span>
                <div style={{ fontSize: "18px", fontWeight: "700", marginTop: "4px", color: "var(--accent-secondary)" }}>
                  {selectedTrainer.overall_completion_percentage}%
                </div>
              </div>
            </div>

            {/* Per-Group Breakdown */}
            <h4 style={{ fontSize: "15px", marginBottom: "12px", color: "var(--text-primary)" }}>
              Cohort-by-Cohort Breakdown
            </h4>

            {selectedTrainer.assigned_groups.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center", fontStyle: "italic" }}>
                This trainer is currently not assigned to any candidate groups.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {selectedTrainer.assigned_groups.map((grp) => (
                  <div
                    key={grp.group_id}
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      padding: "16px",
                      backgroundColor: "var(--bg-secondary)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
                      <div>
                        <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>{grp.group_name}</strong>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginLeft: "8px" }}>
                          (Code: <code>{grp.group_code}</code> {grp.candidate_type ? `• Type: ${grp.candidate_type}` : ""})
                        </span>
                      </div>
                      <span className="badge badge-info">
                        {grp.active_candidates_count} Active {grp.active_candidates_count === 1 ? "Candidate" : "Candidates"}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                        <span style={{ color: "var(--text-secondary)" }}>Learner Progress for this Group:</span>
                        <span>
                          <strong>{grp.average_completion_percentage}%</strong> ({grp.completed_learners_count} of {grp.active_candidates_count} completed)
                        </span>
                      </div>
                      <div style={{ width: "100%", height: "8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, grp.average_completion_percentage))}%`,
                            height: "100%",
                            backgroundColor: grp.average_completion_percentage >= 100 ? "var(--status-success)" : "var(--accent-primary)",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>

                    {/* Assigned Curriculum Items */}
                    <div>
                      <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                        Assigned Curriculum Targets:
                      </span>
                      {grp.assigned_curriculum.length === 0 ? (
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                          No curriculum assigned to this group yet.
                        </span>
                      ) : (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {grp.assigned_curriculum.map((c, i) => (
                            <span
                              key={i}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 10px",
                                backgroundColor: "var(--bg-tertiary)",
                                borderRadius: "4px",
                                fontSize: "12px",
                              }}
                            >
                              <strong style={{ color: "var(--accent-primary)" }}>{c.type}:</strong>
                              <span>{c.name} ({c.code})</span>
                              <span className="badge badge-purple" style={{ fontSize: "10px", padding: "2px 6px" }}>
                                {c.modules_count} {c.modules_count === 1 ? "module" : "modules"}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedTrainer(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

