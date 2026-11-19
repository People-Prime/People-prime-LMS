import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";

export default function TrainerProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");

  // Project Details & Documents Modal
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState("documents"); // 'documents' | 'submissions' | 'details'

  // Submissions State for the Selected Project
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Review Modal State
  const [reviewSubmission, setReviewSubmission] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("REVIEWED");
  const [reviewScore, setReviewScore] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  // ---------------------------------------------------------------------------
  // Load Trainer Assigned Projects
  // ---------------------------------------------------------------------------
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient("/projects/");
      const data = Array.isArray(res) ? res : res.results || [];
      setProjects(data);
    } catch (err) {
      setError(err.message || "Failed to load assigned projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // ---------------------------------------------------------------------------
  // Load Submissions for a Project
  // ---------------------------------------------------------------------------
  const loadProjectSubmissions = useCallback(async (projectId) => {
    try {
      setSubmissionsLoading(true);
      const res = await apiClient(`/project-submissions/?project=${projectId}`);
      const data = Array.isArray(res) ? res : res.results || [];
      setSubmissions(data);
    } catch {
      setSubmissions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  }, []);

  const handleOpenProject = (project, initialTab = "documents") => {
    setSelectedProject(project);
    setActiveModalTab(initialTab);
    setShowProjectModal(true);
    loadProjectSubmissions(project.id);
  };

  // ---------------------------------------------------------------------------
  // Review Submission Handlers
  // ---------------------------------------------------------------------------
  const handleOpenReviewModal = (submission) => {
    setReviewSubmission(submission);
    setReviewStatus(submission.status || "REVIEWED");
    setReviewScore(submission.score !== null && submission.score !== undefined ? String(submission.score) : "");
    setReviewFeedback(submission.trainer_feedback || "");
    setReviewError(null);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!reviewSubmission) return;
    setReviewSubmitting(true);
    setReviewError(null);

    try {
      const payload = {
        status: reviewStatus,
        feedback: reviewFeedback.trim(),
      };
      if (reviewScore !== "") {
        payload.score = Number(reviewScore);
      }

      const updated = await apiClient(`/project-submissions/${reviewSubmission.id}/review/`, {
        method: "POST",
        body: payload,
      });

      // Update submissions list
      setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setSuccessMessage(`Submission from ${updated.learner_username} reviewed successfully.`);
      setReviewSubmission(null);

      // Refresh project list counts
      loadProjects();
    } catch (err) {
      setReviewError(err.message || "Failed to save submission review.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helper Formatters & Preview
  // ---------------------------------------------------------------------------
  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIcon = (filename) => {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    if (["pdf"].includes(ext)) {
      return (
        <span style={{ color: "#ef4444", fontWeight: "700", fontSize: "11px", backgroundColor: "rgba(239, 68, 68, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
          PDF
        </span>
      );
    }
    if (["doc", "docx"].includes(ext)) {
      return (
        <span style={{ color: "#3b82f6", fontWeight: "700", fontSize: "11px", backgroundColor: "rgba(59, 130, 246, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
          DOCX
        </span>
      );
    }
    if (["xls", "xlsx"].includes(ext)) {
      return (
        <span style={{ color: "#10b981", fontWeight: "700", fontSize: "11px", backgroundColor: "rgba(16, 185, 129, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
          XLSX
        </span>
      );
    }
    if (["ppt", "pptx"].includes(ext)) {
      return (
        <span style={{ color: "#f97316", fontWeight: "700", fontSize: "11px", backgroundColor: "rgba(249, 115, 22, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
          PPTX
        </span>
      );
    }
    return (
      <span style={{ color: "var(--text-secondary)", fontWeight: "700", fontSize: "11px", backgroundColor: "rgba(255, 255, 255, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>
        {ext.toUpperCase() || "FILE"}
      </span>
    );
  };

  const handlePreviewResource = (res) => {
    const viewerUrl = `/viewer?url=${encodeURIComponent(res.download_url)}&title=${encodeURIComponent(res.original_name)}`;
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "ACTIVE":
        return <span className="badge badge-success">ACTIVE</span>;
      case "COMPLETED":
        return <span className="badge badge-info">COMPLETED</span>;
      case "ARCHIVED":
        return <span className="badge badge-secondary">ARCHIVED</span>;
      case "DRAFT":
      default:
        return <span className="badge badge-warning">DRAFT</span>;
    }
  };

  const getSubmissionStatusBadge = (status) => {
    switch (status) {
      case "COMPLETED":
        return <span className="badge badge-success">COMPLETED</span>;
      case "REVIEWED":
        return <span className="badge badge-info">REVIEWED</span>;
      case "CHANGES_REQUESTED":
        return <span className="badge badge-warning">CHANGES REQUESTED</span>;
      case "UNDER_REVIEW":
        return <span className="badge badge-purple">UNDER REVIEW</span>;
      case "SUBMITTED":
      default:
        return <span className="badge badge-secondary">SUBMITTED</span>;
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
      const matchesPriority = priorityFilter === "ALL" || p.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [projects, searchQuery, statusFilter, priorityFilter]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* Notifications */}
      {successMessage && (
        <div className="card" style={{ padding: "12px 18px", marginBottom: "16px", borderLeft: "4px solid var(--status-success)" }}>
          <span style={{ color: "var(--status-success)", fontWeight: "600", fontSize: "14px" }}>
            ✓ {successMessage}
          </span>
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: "16px", marginBottom: "16px", borderLeft: "4px solid var(--status-error)" }}>
          <span style={{ color: "var(--status-error)", fontSize: "14px" }}>{error}</span>
          <button type="button" className="btn btn-secondary" onClick={loadProjects} style={{ marginLeft: "12px", padding: "4px 10px", fontSize: "12px" }}>
            Retry
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: "1", minWidth: "260px", maxWidth: "480px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search assigned projects by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <select
              className="form-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "7px 12px", fontSize: "13px" }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="DRAFT">Draft</option>
            </select>

            <select
              className="form-input"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{ padding: "7px 12px", fontSize: "13px" }}
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Projects Grid / List */}
      {loading ? (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading assigned projects...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center", border: "1px dashed var(--border-color)" }}>
          <p style={{ fontSize: "15px", color: "var(--text-main)", fontWeight: "600", marginBottom: "6px" }}>
            No Assigned Projects Found
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
            {projects.length === 0
              ? "You do not have any projects assigned to you yet."
              : "No projects match the selected filters."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "18px" }}>
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              className="card"
              style={{
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                border: "1px solid var(--border-color)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)", lineHeight: "1.3" }}>
                    {proj.title}
                  </h3>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {getStatusBadge(proj.status)}
                  </div>
                </div>

                {proj.description && (
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 14px 0", lineHeight: "1.5", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {proj.description}
                  </p>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px", padding: "10px", backgroundColor: "rgba(0, 0, 0, 0.15)", borderRadius: "6px" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Due Date:</span>
                    <strong>{proj.due_date ? new Date(proj.due_date).toLocaleDateString() : "No deadline"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Assigned Learners:</span>
                    <strong>{proj.learners_count || (proj.learners || []).length}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Documents:</span>
                    <strong>{proj.resources?.length || 0} files</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block" }}>Submissions:</span>
                    <strong style={{ color: (proj.pending_reviews_count || 0) > 0 ? "var(--status-warning)" : "inherit" }}>
                      {proj.submissions_count || 0} ({(proj.pending_reviews_count || 0)} pending)
                    </strong>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleOpenProject(proj, "documents")}
                  style={{ flex: 1, padding: "8px", fontSize: "12px" }}
                >
                  Documents ({proj.resources?.length || 0})
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleOpenProject(proj, "submissions")}
                  style={{ flex: 1, padding: "8px", fontSize: "12px" }}
                >
                  Submissions ({proj.submissions_count || 0})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* PROJECT DRAWER / MODAL                                                 */}
      {/* ---------------------------------------------------------------------- */}
      {showProjectModal && selectedProject && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProjectModal(false);
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "860px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              border: "1px solid var(--border-color)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "var(--text-main)" }}>
                    {selectedProject.title}
                  </h3>
                  {getStatusBadge(selectedProject.status)}
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Due: {selectedProject.due_date ? new Date(selectedProject.due_date).toLocaleString() : "No deadline"} • Max Score: {selectedProject.max_score || "N/A"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowProjectModal(false)}
                style={{ padding: "4px 8px", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", backgroundColor: "rgba(0, 0, 0, 0.1)" }}>
              <button
                type="button"
                onClick={() => setActiveModalTab("documents")}
                style={{
                  padding: "12px 20px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: activeModalTab === "documents" ? "var(--bg-card)" : "transparent",
                  color: activeModalTab === "documents" ? "var(--accent-primary)" : "var(--text-secondary)",
                  borderBottom: activeModalTab === "documents" ? "2px solid var(--accent-primary)" : "none",
                }}
              >
                Project Documents ({selectedProject.resources?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab("submissions")}
                style={{
                  padding: "12px 20px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: activeModalTab === "submissions" ? "var(--bg-card)" : "transparent",
                  color: activeModalTab === "submissions" ? "var(--accent-primary)" : "var(--text-secondary)",
                  borderBottom: activeModalTab === "submissions" ? "2px solid var(--accent-primary)" : "none",
                }}
              >
                Learner Submissions ({submissions.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab("details")}
                style={{
                  padding: "12px 20px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: activeModalTab === "details" ? "var(--bg-card)" : "transparent",
                  color: activeModalTab === "details" ? "var(--accent-primary)" : "var(--text-secondary)",
                  borderBottom: activeModalTab === "details" ? "2px solid var(--accent-primary)" : "none",
                }}
              >
                Instructions & Objectives
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {/* TAB 1: DOCUMENTS */}
              {activeModalTab === "documents" && (
                <div>
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
                    Project Guidance & Reference Documents
                  </h4>

                  {(!selectedProject.resources || selectedProject.resources.length === 0) ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
                        No project documents have been attached by the administrator yet.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {selectedProject.resources.map((res) => (
                        <div
                          key={res.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 16px",
                            borderRadius: "6px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "rgba(255, 255, 255, 0.02)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
                            {getFileIcon(res.original_name)}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={res.original_name}>
                                {res.original_name}
                              </div>
                              <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                {formatFileSize(res.file_size)} • Uploaded {new Date(res.uploaded_at).toLocaleDateString()}
                                {res.uploaded_by_name && ` by ${res.uploaded_by_name}`}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "8px", flexShrink: 0, marginLeft: "12px" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handlePreviewResource(res)}
                              style={{ padding: "4px 10px", fontSize: "12px" }}
                            >
                              Preview
                            </button>
                            <a
                              href={res.download_url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary"
                              style={{ padding: "4px 10px", fontSize: "12px", textDecoration: "none" }}
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SUBMISSIONS */}
              {activeModalTab === "submissions" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
                      Learner Project Submissions ({submissions.length})
                    </h4>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => loadProjectSubmissions(selectedProject.id)}
                      disabled={submissionsLoading}
                      style={{ padding: "4px 10px", fontSize: "11px" }}
                    >
                      {submissionsLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  {submissionsLoading ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>Loading submissions...</p>
                  ) : submissions.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
                        No submissions received from assigned learners yet.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {submissions.map((sub) => (
                        <div
                          key={sub.id}
                          style={{
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "rgba(255, 255, 255, 0.02)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                            <div>
                              <strong style={{ fontSize: "14px", color: "var(--text-main)" }}>
                                {sub.learner_username}
                              </strong>
                              <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>
                                Version {sub.version} • Submitted {new Date(sub.submitted_at).toLocaleString()}
                              </span>
                              {sub.is_late && (
                                <span className="badge badge-error" style={{ marginLeft: "8px", fontSize: "10px" }}>
                                  LATE
                                </span>
                              )}
                            </div>
                            <div>{getSubmissionStatusBadge(sub.status)}</div>
                          </div>

                          {sub.comments && (
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "10px", padding: "8px 12px", backgroundColor: "rgba(0, 0, 0, 0.15)", borderRadius: "6px" }}>
                              <strong>Learner Comments:</strong> {sub.comments}
                            </div>
                          )}

                          {/* Submission Files */}
                          <div style={{ marginBottom: "12px" }}>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              Submitted Files ({sub.files?.length || 0}):
                            </span>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" }}>
                              {(sub.files || []).map((file) => (
                                <a
                                  key={file.id}
                                  href={file.download_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-secondary"
                                  style={{ padding: "4px 10px", fontSize: "12px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                                >
                                  {getFileIcon(file.original_name)}
                                  <span>{file.original_name}</span>
                                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>({formatFileSize(file.file_size)})</span>
                                </a>
                              ))}
                            </div>
                          </div>

                          {/* Existing Review / Score */}
                          {(sub.score !== null || sub.trainer_feedback) && (
                            <div style={{ padding: "8px 12px", backgroundColor: "rgba(59, 130, 246, 0.08)", borderRadius: "6px", fontSize: "12px", marginBottom: "12px", borderLeft: "3px solid var(--accent-primary)" }}>
                              {sub.score !== null && (
                                <div style={{ fontWeight: "700", color: "var(--text-main)", marginBottom: "4px" }}>
                                  Score: {sub.score} / {selectedProject.max_score || 100}
                                </div>
                              )}
                              {sub.trainer_feedback && (
                                <div style={{ color: "var(--text-secondary)" }}>
                                  <strong>Trainer Feedback:</strong> {sub.trainer_feedback}
                                </div>
                              )}
                              {sub.reviewed_at && (
                                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
                                  Reviewed {new Date(sub.reviewed_at).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleOpenReviewModal(sub)}
                            style={{ padding: "4px 12px", fontSize: "12px" }}
                          >
                            {sub.status === "SUBMITTED" ? "Review Submission" : "Update Review"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: DETAILS */}
              {activeModalTab === "details" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {selectedProject.description && (
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Description
                      </h4>
                      <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.6", color: "var(--text-main)" }}>
                        {selectedProject.description}
                      </p>
                    </div>
                  )}

                  {selectedProject.instructions && (
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Detailed Instructions
                      </h4>
                      <div style={{ padding: "14px", backgroundColor: "rgba(0, 0, 0, 0.15)", borderRadius: "6px", fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap", color: "var(--text-main)" }}>
                        {selectedProject.instructions}
                      </div>
                    </div>
                  )}

                  {selectedProject.objectives && (
                    <div>
                      <h4 style={{ margin: "0 0 6px 0", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Project Objectives
                      </h4>
                      <div style={{ padding: "14px", backgroundColor: "rgba(0, 0, 0, 0.15)", borderRadius: "6px", fontSize: "13px", lineHeight: "1.6", whiteSpace: "pre-wrap", color: "var(--text-main)" }}>
                        {selectedProject.objectives}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* REVIEW SUBMISSION MODAL                                                */}
      {/* ---------------------------------------------------------------------- */}
      {reviewSubmission && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1400,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !reviewSubmitting) setReviewSubmission(null);
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              border: "1px solid var(--border-color)",
              padding: "24px 28px",
            }}
          >
            <h3 style={{ margin: "0 0 6px 0", fontSize: "17px", fontWeight: "700", color: "var(--text-main)" }}>
              Review Submission — {reviewSubmission.learner_username} (v{reviewSubmission.version})
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "var(--text-secondary)" }}>
              Provide assessment status, optional numerical score, and guidance feedback.
            </p>

            {reviewError && (
              <div className="card" style={{ padding: "10px", marginBottom: "14px", borderLeft: "4px solid var(--status-error)" }}>
                <span style={{ color: "var(--status-error)", fontSize: "12px" }}>{reviewError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitReview}>
              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>
                  Evaluation Status <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <select
                  className="form-input"
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value)}
                  style={{ width: "100%" }}
                  required
                >
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="REVIEWED">Reviewed</option>
                  <option value="CHANGES_REQUESTED">Changes Requested</option>
                  <option value="COMPLETED">Completed / Approved</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: "14px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>
                  Score (Optional{selectedProject?.max_score ? `, max ${selectedProject.max_score}` : ""})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedProject?.max_score || 100}
                  className="form-input"
                  placeholder="e.g. 85.0"
                  value={reviewScore}
                  onChange={(e) => setReviewScore(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "18px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>
                  Trainer Feedback
                </label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Provide constructive feedback for the learner..."
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReviewSubmission(null)}
                  disabled={reviewSubmitting}
                  style={{ padding: "6px 14px", fontSize: "13px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={reviewSubmitting}
                  style={{ padding: "6px 14px", fontSize: "13px" }}
                >
                  {reviewSubmitting ? "Saving Review..." : "Save Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
