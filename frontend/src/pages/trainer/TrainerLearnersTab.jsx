import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../services/api";

export default function TrainerLearnersTab({ initialSelectedLearnerId, onClearSelection }) {
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Group filter state
  const [selectedGroup, setSelectedGroup] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected learner inspection state
  const [selectedLearnerId, setSelectedLearnerId] = useState(initialSelectedLearnerId || null);
  const [learnerDetail, setLearnerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const loadLearners = useCallback(async () => {
    try {
      const data = await apiClient("/trainer/learners/");
      const learnerList = Array.isArray(data?.learners) ? data.learners : [];
      setLearners(learnerList);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load assigned learners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
          setError(err.message || "Failed to load assigned learners.");
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
    loadLearners();
  };

  // Fetch individual learner progress when selected
  const loadLearnerDetail = useCallback(async (learnerId) => {
    if (!learnerId) return;
    try {
      const data = await apiClient(`/trainer/learners/${learnerId}/progress/`);
      setLearnerDetail(data);
      setDetailError(null);
    } catch (err) {
      setDetailError(err.message || `Failed to load progress for learner #${learnerId}.`);
      setLearnerDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedLearnerId) {
      return;
    }
    let isMounted = true;
    async function fetchDetail() {
      try {
        const data = await apiClient(`/trainer/learners/${selectedLearnerId}/progress/`);
        if (isMounted) {
          setLearnerDetail(data);
          setDetailError(null);
          setDetailLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setDetailError(err.message || `Failed to load progress for learner #${selectedLearnerId}.`);
          setLearnerDetail(null);
          setDetailLoading(false);
        }
      }
    }
    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedLearnerId]);

  const handleSelectLearner = (learnerId) => {
    setDetailLoading(true);
    setDetailError(null);
    setLearnerDetail(null);
    setSelectedLearnerId(learnerId);
  };

  const handleRetryDetail = () => {
    if (selectedLearnerId) {
      setDetailLoading(true);
      setDetailError(null);
      loadLearnerDetail(selectedLearnerId);
    }
  };

  const handleCloseDetail = () => {
    setSelectedLearnerId(null);
    setLearnerDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    if (onClearSelection) onClearSelection();
  };

  // Derive unique groups for filtering
  const allGroups = Array.from(
    new Set(
      learners.flatMap((l) => (Array.isArray(l.assigned_groups) ? l.assigned_groups : []))
    )
  );

  // Filter learners by selected group and search query
  const filteredLearners = learners.filter((l) => {
    const matchesGroup =
      selectedGroup === "ALL" ||
      (Array.isArray(l.assigned_groups) && l.assigned_groups.includes(selectedGroup));

    const matchesSearch =
      !searchQuery.trim() ||
      l.learner_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.learner_username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(l.learner_id).includes(searchQuery);

    return matchesGroup && matchesSearch;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>Assigned Learners & Progression Monitoring</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
            Track individual progress, module completion criteria, and learner responses in assigned cohorts.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRefresh}
          disabled={loading}
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          Refresh Roster
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

      {/* Individual Learner Detail Modal / Inspection Card */}
      {selectedLearnerId && (
        <div className="card" style={{
          border: "2px solid var(--accent-primary)",
          marginBottom: "24px",
          backgroundColor: "var(--bg-surface)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Learner Progress Inspection</span>
              <span className="badge badge-purple">Learner #{selectedLearnerId}</span>
            </h3>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCloseDetail}
              style={{ padding: "4px 10px", fontSize: "12px" }}
            >
              &times; Close Inspection
            </button>
          </div>

          {detailLoading ? (
            <div style={{ textAlign: "center", padding: "30px" }}>
              <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>Loading learner module progress...</p>
            </div>
          ) : detailError ? (
            <div className="alert alert-error" role="status">
              <span>{detailError}</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRetryDetail}
                style={{ marginLeft: "12px", padding: "4px 8px", fontSize: "12px" }}
              >
                Retry
              </button>
            </div>
          ) : learnerDetail ? (
            <div>
              {/* Learner Info Header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
                marginBottom: "20px",
                padding: "16px",
                backgroundColor: "var(--bg-card)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-color)"
              }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Learner Name</div>
                  <div style={{ fontSize: "15px", fontWeight: "600", marginTop: "2px" }}>{learnerDetail.learner?.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>@{learnerDetail.learner?.username}</div>
                </div>

                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Email Address</div>
                  <div style={{ fontSize: "14px", marginTop: "2px" }}>{learnerDetail.learner?.email || "—"}</div>
                </div>

                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Assigned Cohorts</div>
                  <div style={{ marginTop: "4px" }}>
                    {Array.isArray(learnerDetail.learner?.assigned_groups) && learnerDetail.learner.assigned_groups.length > 0 ? (
                      learnerDetail.learner.assigned_groups.map((g) => (
                        <span key={g.id || g.name} className="badge badge-info" style={{ marginRight: "4px" }}>
                          {g.name} ({g.code})
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "var(--text-secondary)" }}>—</span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Completion Status</div>
                  <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--status-success)", marginTop: "2px" }}>
                    {learnerDetail.progress?.completion_percentage ?? 0}%
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {learnerDetail.progress?.completed_modules ?? 0} of {learnerDetail.progress?.total_assigned_modules ?? 0} modules complete
                  </div>
                </div>
              </div>

              {/* Module Progression Table */}
              <h4 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "10px" }}>
                Assigned Modules Breakdown ({learnerDetail.modules?.length ?? 0} Modules)
              </h4>

              {(!learnerDetail.modules || learnerDetail.modules.length === 0) ? (
                <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                  No published curriculum modules are assigned to this learner&apos;s active cohorts.
                </p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Module ID</th>
                        <th>Module Name</th>
                        <th>Course / Program</th>
                        <th>Required Questions</th>
                        <th>Answered Questions</th>
                        <th>Completion Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {learnerDetail.modules.map((m) => (
                        <tr key={m.module_id}>
                          <td><code>#{m.module_id}</code></td>
                          <td><strong>{m.module_name}</strong></td>
                          <td>
                            <div>{m.course_name}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{m.program_name}</div>
                          </td>
                          <td>
                            <span className="badge badge-purple">{m.total_required_questions} Required</span>
                          </td>
                          <td>
                            {m.answered_required_questions} answered
                          </td>
                          <td>
                            {m.is_completed ? (
                              <span className="badge badge-success">COMPLETED</span>
                            ) : (
                              <span className="badge badge-warning">INCOMPLETE</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Module Completion Rule Callout */}
              <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--text-secondary)" }}>
                <em>* Note: A module is marked Completed only when at least one active required question exists and the learner has answered every required question. Modules with 0 required questions remain incomplete by business policy.</em>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Filter and Search Controls */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        marginBottom: "16px",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <div>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name, username, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "240px", padding: "8px 12px", fontSize: "13px" }}
            />
          </div>

          <div>
            <select
              className="form-input"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              style={{ width: "200px", padding: "8px 12px", fontSize: "13px" }}
            >
              <option value="ALL">All Cohorts ({learners.length})</option>
              {allGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Showing <strong>{filteredLearners.length}</strong> of <strong>{learners.length}</strong> assigned learners
        </div>
      </div>

      {/* Learners Table */}
      <div className="card">
        <h3 className="card-title">
          <span>Learner Roster</span>
          <span className="badge badge-purple">{filteredLearners.length} Records</span>
        </h3>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
            <p style={{ color: "var(--text-secondary)" }}>Loading learner roster from backend...</p>
          </div>
        ) : filteredLearners.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "20px", textAlign: "center" }}>
            {learners.length === 0
              ? "No learners are assigned to your trainer profile. Ensure an administrator assigns you to one or more active learner groups."
              : "No learners match the selected filter criteria."}
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Learner ID</th>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Assigned Cohorts</th>
                  <th>Completed Modules</th>
                  <th>Pending Modules</th>
                  <th>Overall Progress</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLearners.map((l) => (
                  <tr
                    key={l.learner_id}
                    style={{
                      backgroundColor: selectedLearnerId === l.learner_id ? "rgba(99, 102, 241, 0.08)" : undefined
                    }}
                  >
                    <td><code>#{l.learner_id}</code></td>
                    <td><strong>{l.learner_name}</strong></td>
                    <td><code>{l.learner_username}</code></td>
                    <td style={{ fontSize: "13px" }}>{l.learner_email || "—"}</td>
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
                      <span className="badge badge-success">{l.completed_modules}</span>
                    </td>
                    <td>
                      <span className="badge badge-warning">{l.pending_modules}</span>
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
                        onClick={() => handleSelectLearner(l.learner_id)}
                        style={{ padding: "4px 10px", fontSize: "11px" }}
                      >
                        {selectedLearnerId === l.learner_id ? "Inspecting" : "Inspect"}
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
