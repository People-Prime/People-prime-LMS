import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";
import ActionMenu from "../../components/common/ActionMenu";

export default function AdminProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [trainerFilter, setTrainerFilter] = useState("ALL");
  const [learnerFilter, setLearnerFilter] = useState("ALL");

  // Create / Edit Modal State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    instructions: "",
    objectives: "",
    start_date: "",
    due_date: "",
    status: "DRAFT",
    priority: "MEDIUM",
    allow_late_submissions: true,
  });

  // Assign Modal State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningProject, setAssigningProject] = useState(null);
  const [selectedTrainers, setSelectedTrainers] = useState([]);
  const [selectedLearners, setSelectedLearners] = useState([]);
  const [trainerSearch, setTrainerSearch] = useState("");
  const [learnerSearch, setLearnerSearch] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState(null);

  // Resources Modal State
  const [showResourcesModal, setShowResourcesModal] = useState(false);
  const [resourceProject, setResourceProject] = useState(null);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [resourceToDelete, setResourceToDelete] = useState(null);
  const [deleteResourceSubmitting, setDeleteResourceSubmitting] = useState(false);

  // Details Modal State
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailProject, setDetailProject] = useState(null);

  // Soft Delete Confirmation Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Fetch all initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [projRes, usersRes] = await Promise.all([
        apiClient("/projects/"),
        apiClient("/admin/users/").catch(() => []),
      ]);

      const projList = Array.isArray(projRes) ? projRes : (projRes?.results || []);
      const userList = Array.isArray(usersRes) ? usersRes : (usersRes?.results || []);

      setProjects(projList);
      setTrainers(userList.filter((u) => u.role === "TRAINER" && u.is_active));
      setLearners(userList.filter((u) => u.role === "LEARNER" && u.is_active));
    } catch (err) {
      setError(err.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clear notification message after 4s
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
      const matchesPriority = priorityFilter === "ALL" || p.priority === priorityFilter;

      const matchesTrainer =
        trainerFilter === "ALL" ||
        (p.trainers && p.trainers.includes(Number(trainerFilter)));

      const matchesLearner =
        learnerFilter === "ALL" ||
        (p.learners && p.learners.includes(Number(learnerFilter)));

      return matchesSearch && matchesStatus && matchesPriority && matchesTrainer && matchesLearner;
    });
  }, [projects, searchQuery, statusFilter, priorityFilter, trainerFilter, learnerFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    return {
      total: projects.length,
      active: projects.filter((p) => p.status === "ACTIVE").length,
      draft: projects.filter((p) => p.status === "DRAFT").length,
      completed: projects.filter((p) => p.status === "COMPLETED").length,
      archived: projects.filter((p) => p.status === "ARCHIVED").length,
      totalSubmissions: projects.reduce((acc, p) => acc + (p.submissions_count || 0), 0),
      pendingReviews: projects.reduce((acc, p) => acc + (p.pending_reviews_count || 0), 0),
    };
  }, [projects]);

  // ---------------------------------------------------------------------------
  // Create / Edit Handlers
  // ---------------------------------------------------------------------------
  const handleOpenCreateModal = () => {
    setEditingProject(null);
    setFormData({
      title: "",
      description: "",
      instructions: "",
      objectives: "",
      start_date: "",
      due_date: "",
      status: "ACTIVE",
      priority: "MEDIUM",
      allow_late_submissions: true,
    });
    setFormError(null);
    setShowFormModal(true);
  };

  const handleOpenEditModal = (project) => {
    setEditingProject(project);
    // Format due_date for datetime-local input: YYYY-MM-DDTHH:MM
    let formattedDueDate = "";
    if (project.due_date) {
      const d = new Date(project.due_date);
      formattedDueDate = d.toISOString().slice(0, 16);
    }

    setFormData({
      title: project.title || "",
      description: project.description || "",
      instructions: project.instructions || "",
      objectives: project.objectives || "",
      start_date: project.start_date || "",
      due_date: formattedDueDate,
      status: project.status || "DRAFT",
      priority: project.priority || "MEDIUM",
      allow_late_submissions: project.allow_late_submissions ?? true,
    });
    setFormError(null);
    setShowFormModal(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError("Project title is required.");
      return;
    }

    if (formData.start_date && formData.due_date) {
      const start = new Date(formData.start_date);
      const due = new Date(formData.due_date);
      if (due < start) {
        setFormError("Due date cannot be earlier than start date.");
        return;
      }
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        ...formData,
        start_date: formData.start_date || null,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      };

      if (editingProject) {
        const updated = await apiClient(`/projects/${editingProject.id}/`, {
          method: "PATCH",
          body: payload,
        });
        setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setSuccessMessage(`Project "${updated.title}" updated successfully.`);
      } else {
        const created = await apiClient("/projects/", {
          method: "POST",
          body: payload,
        });
        setProjects((prev) => [created, ...prev]);
        setSuccessMessage(`Project "${created.title}" created successfully.`);
      }

      setShowFormModal(false);
    } catch (err) {
      setFormError(err.message || "Failed to save project.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Assignment Handlers
  // ---------------------------------------------------------------------------
  const handleOpenAssignModal = (project) => {
    setAssigningProject(project);
    setSelectedTrainers(project.trainers ? [...project.trainers] : []);
    setSelectedLearners(project.learners ? [...project.learners] : []);
    setTrainerSearch("");
    setLearnerSearch("");
    setAssignError(null);
    setShowAssignModal(true);
  };

  const handleSaveAssignments = async () => {
    if (!assigningProject) return;
    setAssignSubmitting(true);
    setAssignError(null);

    try {
      const res = await apiClient(`/projects/${assigningProject.id}/assign/`, {
        method: "POST",
        body: {
          trainers: selectedTrainers,
          learners: selectedLearners,
        },
      });

      setProjects((prev) => prev.map((p) => (p.id === res.id ? res : p)));
      setSuccessMessage(`User assignments saved for "${res.title}".`);
      setShowAssignModal(false);
    } catch (err) {
      setAssignError(err.message || "Failed to save assignments.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const toggleTrainer = (id) => {
    setSelectedTrainers((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const toggleLearner = (id) => {
    setSelectedLearners((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  };

  // ---------------------------------------------------------------------------
  // Resource / Document Management Handlers
  // ---------------------------------------------------------------------------
  const handleOpenResourcesModal = (project) => {
    setResourceProject(project);
    setUploadFiles([]);
    setUploadError(null);
    setUploadProgress(null);
    setResourceToDelete(null);
    setShowResourcesModal(true);
  };

  const handleUploadResource = async (e) => {
    e.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0) {
      setUploadError("Please choose one or more documents to upload.");
      return;
    }
    if (!resourceProject) return;

    setUploadSubmitting(true);
    setUploadError(null);

    const uploadedResults = [];
    const failedFiles = [];

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      setUploadProgress(`Uploading ${i + 1} of ${uploadFiles.length}: "${file.name}"...`);

      try {
        const form = new FormData();
        form.append("file", file);

        const res = await apiClient(`/projects/${resourceProject.id}/upload-resource/`, {
          method: "POST",
          body: form,
        });
        uploadedResults.push(res);
      } catch (err) {
        failedFiles.push(`${file.name} (${err.message || "Failed"})`);
      }
    }

    // Update project resources list in state with successfully uploaded files
    if (uploadedResults.length > 0) {
      const updatedProject = {
        ...resourceProject,
        resources: [...(resourceProject.resources || []), ...uploadedResults],
      };
      setResourceProject(updatedProject);
      setProjects((prev) => prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)));
      setUploadFiles([]);
      setSuccessMessage(`${uploadedResults.length} document(s) uploaded successfully.`);
    }

    if (failedFiles.length > 0) {
      setUploadError(`Failed to upload ${failedFiles.length} file(s): ${failedFiles.join(", ")}`);
    } else {
      setUploadError(null);
    }

    setUploadProgress(null);
    setUploadSubmitting(false);
  };

  const handleConfirmDeleteResource = async () => {
    if (!resourceToDelete || !resourceProject) return;
    setDeleteResourceSubmitting(true);
    try {
      await apiClient(`/projects/${resourceProject.id}/resources/${resourceToDelete.id}/`, {
        method: "DELETE",
      });

      const updatedProject = {
        ...resourceProject,
        resources: (resourceProject.resources || []).filter((r) => r.id !== resourceToDelete.id),
      };
      setResourceProject(updatedProject);
      setProjects((prev) => prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)));
      setSuccessMessage(`Document "${resourceToDelete.original_name}" deleted.`);
      setResourceToDelete(null);
    } catch (err) {
      alert(err.message || "Failed to delete document.");
    } finally {
      setDeleteResourceSubmitting(false);
    }
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
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      return (
        <span style={{ color: "#8b5cf6", fontWeight: "700", fontSize: "11px", backgroundColor: "rgba(139, 92, 246, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
          IMG
        </span>
      );
    }
    if (["zip", "rar", "tar", "gz"].includes(ext)) {
      return (
        <span style={{ color: "#eab308", fontWeight: "700", fontSize: "11px", backgroundColor: "rgba(234, 179, 8, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
          ZIP
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
    // Open in dedicated FileViewerPage with encoded download_url and title
    const viewerUrl = `/viewer?url=${encodeURIComponent(res.download_url)}&title=${encodeURIComponent(res.original_name)}`;
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  };

  // ---------------------------------------------------------------------------
  // Soft Delete Handler
  // ---------------------------------------------------------------------------
  const handleOpenDeleteModal = (project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setDeleteSubmitting(true);
    try {
      await apiClient(`/projects/${projectToDelete.id}/`, {
        method: "DELETE",
      });

      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setSuccessMessage(`Project "${projectToDelete.title}" archived successfully.`);
      setShowDeleteModal(false);
      setProjectToDelete(null);
    } catch (err) {
      alert(err.message || "Failed to archive project.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Helper formatting badges
  const getStatusBadge = (status) => {
    switch (status) {
      case "ACTIVE":
        return <span className="badge badge-success">ACTIVE</span>;
      case "COMPLETED":
        return <span className="badge badge-purple">COMPLETED</span>;
      case "ARCHIVED":
        return <span className="badge badge-secondary">ARCHIVED</span>;
      case "DRAFT":
      default:
        return <span className="badge badge-warning">DRAFT</span>;
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case "URGENT":
        return <span className="badge badge-error">URGENT</span>;
      case "HIGH":
        return <span className="badge badge-warning">HIGH</span>;
      case "LOW":
        return <span className="badge badge-secondary">LOW</span>;
      case "MEDIUM":
      default:
        return <span className="badge badge-info">MEDIUM</span>;
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

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
          <button type="button" className="btn btn-secondary" onClick={loadData} style={{ marginLeft: "12px", padding: "4px 10px", fontSize: "12px" }}>
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.5px" }}>
            Total Projects
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--text-main)", marginTop: "4px" }}>
            {metrics.total}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.5px" }}>
            Active Projects
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--status-success)", marginTop: "4px" }}>
            {metrics.active}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.5px" }}>
            Draft Projects
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--status-warning)", marginTop: "4px" }}>
            {metrics.draft}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.5px" }}>
            Total Submissions
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--accent-primary)", marginTop: "4px" }}>
            {metrics.totalSubmissions}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.5px" }}>
            Pending Reviews
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: metrics.pendingReviews > 0 ? "var(--status-warning)" : "var(--text-muted)", marginTop: "4px" }}>
            {metrics.pendingReviews}
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Filters & Create Action */}
      <div className="card" style={{ padding: "18px 20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", flex: "1 1 500px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ minWidth: "220px", flex: "1 1 auto" }}
            />

            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: "130px" }}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
            </select>

            <select
              className="form-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{ width: "130px" }}
            >
              <option value="ALL">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>

            <select
              className="form-select"
              value={trainerFilter}
              onChange={(e) => setTrainerFilter(e.target.value)}
              style={{ width: "150px" }}
            >
              <option value="ALL">All Trainers</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.first_name || t.username} {t.last_name || ""}
                </option>
              ))}
            </select>

            <select
              className="form-select"
              value={learnerFilter}
              onChange={(e) => setLearnerFilter(e.target.value)}
              style={{ width: "150px" }}
            >
              <option value="ALL">All Learners</option>
              {learners.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.first_name || l.username} {l.last_name || ""}
                </option>
              ))}
            </select>

            {(searchQuery || statusFilter !== "ALL" || priorityFilter !== "ALL" || trainerFilter !== "ALL" || learnerFilter !== "ALL") && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("ALL");
                  setPriorityFilter("ALL");
                  setTrainerFilter("ALL");
                  setLearnerFilter("ALL");
                }}
                style={{ padding: "7px 12px", fontSize: "12px" }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadData}
              title="Refresh project listings"
              style={{ padding: "8px 14px", fontSize: "13px" }}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenCreateModal}
              style={{ padding: "8px 16px", fontSize: "13px", fontWeight: "600" }}
            >
              + Create Project
            </button>
          </div>
        </div>
      </div>

      {/* Projects Table / Listing */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Loading projects...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "56px 24px" }}>
          <h3 style={{ fontSize: "16px", color: "var(--text-main)", marginBottom: "8px" }}>
            No Projects Found
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "0 auto 20px", maxWidth: "420px" }}>
            {projects.length === 0
              ? "No projects have been configured yet. Click '+ Create Project' above to launch your first capstone or practical assignment."
              : "No projects match your active search or filter criteria."}
          </p>
          {projects.length === 0 && (
            <button type="button" className="btn btn-primary" onClick={handleOpenCreateModal}>
              + Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", margin: 0, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                  <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Project
                  </th>
                  <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Status
                  </th>
                  <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Priority
                  </th>
                  <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Deadlines
                  </th>
                  <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Assigned
                  </th>
                  <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    Submissions
                  </th>
                  <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", color: "var(--text-secondary)", textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => {
                  const menuActions = [
                    {
                      label: "View Details",
                      icon: (
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      ),
                      onClick: () => {
                        setDetailProject(p);
                        setShowDetailsModal(true);
                      },
                    },
                    {
                      label: "Edit Project",
                      icon: (
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      ),
                      onClick: () => handleOpenEditModal(p),
                    },
                    {
                      label: "Assign Users",
                      icon: (
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      ),
                      onClick: () => handleOpenAssignModal(p),
                    },
                    {
                      label: `Resources (${p.resources?.length || 0})`,
                      icon: (
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      ),
                      onClick: () => handleOpenResourcesModal(p),
                    },
                    {
                      label: "Archive / Delete",
                      danger: true,
                      icon: (
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      ),
                      onClick: () => handleOpenDeleteModal(p),
                    },
                  ];

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <td style={{ padding: "16px 18px", maxWidth: "260px" }}>
                        <div style={{ fontWeight: "600", color: "var(--text-main)", fontSize: "14px", marginBottom: "3px" }}>
                          {p.title}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.description || "No description provided."}
                        </div>
                      </td>

                      <td style={{ padding: "16px 18px", verticalAlign: "middle" }}>
                        {getStatusBadge(p.status)}
                      </td>

                      <td style={{ padding: "16px 18px", verticalAlign: "middle" }}>
                        {getPriorityBadge(p.priority)}
                      </td>

                      <td style={{ padding: "16px 18px", fontSize: "13px", color: "var(--text-secondary)", verticalAlign: "middle" }}>
                        <div>Start: {p.start_date || "—"}</div>
                        <div style={{ color: p.due_date && new Date(p.due_date) < new Date() ? "var(--status-error)" : "var(--text-main)", fontWeight: "500", marginTop: "2px" }}>
                          Due: {p.due_date ? new Date(p.due_date).toLocaleDateString() : "No deadline"}
                        </div>
                      </td>

                      <td style={{ padding: "16px 18px", fontSize: "13px", color: "var(--text-secondary)", verticalAlign: "middle" }}>
                        <div><strong>{p.trainers_count || 0}</strong> Trainers</div>
                        <div style={{ marginTop: "2px" }}><strong>{p.learners_count || 0}</strong> Learners</div>
                      </td>

                      <td style={{ padding: "16px 18px", fontSize: "13px", verticalAlign: "middle" }}>
                        <div><strong>{p.submissions_count || 0}</strong> Submitted</div>
                        {p.pending_reviews_count > 0 && (
                          <div style={{ color: "var(--status-warning)", fontWeight: "600", marginTop: "2px", fontSize: "12px" }}>
                            {p.pending_reviews_count} Pending Review
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "16px 18px", textAlign: "right", verticalAlign: "middle" }}>
                        <ActionMenu actions={menuActions} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 1. CREATE / EDIT PROJECT MODAL                                          */}
      {/* ---------------------------------------------------------------------- */}
      {showFormModal && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !formSubmitting) {
              setShowFormModal(false);
            }
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--border-color)",
              padding: "24px 28px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "var(--text-main)" }}>
                {editingProject ? "Edit Project" : "Create New Project"}
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowFormModal(false)}
                disabled={formSubmitting}
                style={{ padding: "4px 8px", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="card" style={{ padding: "12px", marginBottom: "16px", borderLeft: "4px solid var(--status-error)", backgroundColor: "rgba(239, 68, 68, 0.1)" }}>
                <span style={{ color: "var(--status-error)", fontSize: "13px" }}>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProject}>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                  Project Title <span style={{ color: "var(--status-error)" }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Enterprise Microservices Architecture Capstone"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                  Summary Description
                </label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Brief overview of the project scope and expected outcomes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                    Status
                  </label>
                  <select
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="DRAFT">Draft (Hidden from Learners)</option>
                    <option value="ACTIVE">Active (Accepting Submissions)</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                    Priority
                  </label>
                  <select
                    className="form-select"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                    Submission Due Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                  Detailed Learner Instructions
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="Step-by-step instructions, submission specifications, or format expectations..."
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "13px" }}>
                  Learning Objectives
                </label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Key competencies and skills demonstrated upon completion..."
                  value={formData.objectives}
                  onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: "24px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={formData.allow_late_submissions}
                    onChange={(e) => setFormData({ ...formData, allow_late_submissions: e.target.checked })}
                  />
                  <span>Allow late submissions after due date (flagged as late)</span>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowFormModal(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? "Saving..." : editingProject ? "Update Project" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 2. ASSIGN TRAINERS & LEARNERS MODAL                                     */}
      {/* ---------------------------------------------------------------------- */}
      {showAssignModal && assigningProject && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !assignSubmitting) {
              setShowAssignModal(false);
            }
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "780px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--border-color)",
              padding: "24px 28px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "var(--text-main)" }}>
                  Assign Users — {assigningProject.title}
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Select trainers to review and learners to complete this project.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAssignModal(false)}
                disabled={assignSubmitting}
                style={{ padding: "4px 8px", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>

            {assignError && (
              <div className="card" style={{ padding: "12px", marginBottom: "16px", borderLeft: "4px solid var(--status-error)" }}>
                <span style={{ color: "var(--status-error)", fontSize: "13px" }}>{assignError}</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
              {/* Trainers Column */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)" }}>
                    Trainers ({selectedTrainers.length} selected)
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (selectedTrainers.length === trainers.length) setSelectedTrainers([]);
                      else setSelectedTrainers(trainers.map((t) => t.id));
                    }}
                    style={{ padding: "2px 8px", fontSize: "11px" }}
                  >
                    {selectedTrainers.length === trainers.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <input
                  type="text"
                  className="form-input"
                  placeholder="Filter trainers..."
                  value={trainerSearch}
                  onChange={(e) => setTrainerSearch(e.target.value)}
                  style={{ marginBottom: "10px", padding: "6px 10px", fontSize: "12px" }}
                />

                <div
                  style={{
                    maxHeight: "240px",
                    overflowY: "auto",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "8px",
                    backgroundColor: "rgba(0, 0, 0, 0.15)",
                  }}
                >
                  {trainers
                    .filter(
                      (t) =>
                        !trainerSearch.trim() ||
                        t.username.toLowerCase().includes(trainerSearch.toLowerCase()) ||
                        (t.first_name && t.first_name.toLowerCase().includes(trainerSearch.toLowerCase()))
                    )
                    .map((t) => {
                      const isSelected = selectedTrainers.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggleTrainer(t.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "6px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            backgroundColor: isSelected ? "rgba(99, 102, 241, 0.15)" : "transparent",
                            marginBottom: "2px",
                          }}
                        >
                          <input type="checkbox" checked={isSelected} readOnly />
                          <div style={{ fontSize: "13px" }}>
                            <strong>{t.first_name ? `${t.first_name} ${t.last_name || ""}` : t.username}</strong>
                            <span style={{ color: "var(--text-muted)", fontSize: "11px", marginLeft: "6px" }}>
                              @{t.username}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Learners Column */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <label style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)" }}>
                    Learners ({selectedLearners.length} selected)
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (selectedLearners.length === learners.length) setSelectedLearners([]);
                      else setSelectedLearners(learners.map((l) => l.id));
                    }}
                    style={{ padding: "2px 8px", fontSize: "11px" }}
                  >
                    {selectedLearners.length === learners.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <input
                  type="text"
                  className="form-input"
                  placeholder="Filter learners..."
                  value={learnerSearch}
                  onChange={(e) => setLearnerSearch(e.target.value)}
                  style={{ marginBottom: "10px", padding: "6px 10px", fontSize: "12px" }}
                />

                <div
                  style={{
                    maxHeight: "240px",
                    overflowY: "auto",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "8px",
                    backgroundColor: "rgba(0, 0, 0, 0.15)",
                  }}
                >
                  {learners
                    .filter(
                      (l) =>
                        !learnerSearch.trim() ||
                        l.username.toLowerCase().includes(learnerSearch.toLowerCase()) ||
                        (l.first_name && l.first_name.toLowerCase().includes(learnerSearch.toLowerCase()))
                    )
                    .map((l) => {
                      const isSelected = selectedLearners.includes(l.id);
                      return (
                        <div
                          key={l.id}
                          onClick={() => toggleLearner(l.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "6px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            backgroundColor: isSelected ? "rgba(99, 102, 241, 0.15)" : "transparent",
                            marginBottom: "2px",
                          }}
                        >
                          <input type="checkbox" checked={isSelected} readOnly />
                          <div style={{ fontSize: "13px" }}>
                            <strong>{l.first_name ? `${l.first_name} ${l.last_name || ""}` : l.username}</strong>
                            <span style={{ color: "var(--text-muted)", fontSize: "11px", marginLeft: "6px" }}>
                              @{l.username}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAssignModal(false)}
                disabled={assignSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveAssignments}
                disabled={assignSubmitting}
              >
                {assignSubmitting ? "Saving..." : "Save Assignments"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 3. MANAGE RESOURCES / DOCUMENTS MODAL                                  */}
      {/* ---------------------------------------------------------------------- */}
      {showResourcesModal && resourceProject && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !uploadSubmitting && !deleteResourceSubmitting) {
              setShowResourcesModal(false);
            }
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "760px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--border-color)",
              padding: "24px 28px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "var(--text-main)" }}>
                  Project Documents — {resourceProject.title}
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Upload templates, guides, datasets, or rubrics for this project. Stored securely in AWS S3.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowResourcesModal(false)}
                disabled={uploadSubmitting || deleteResourceSubmitting}
                style={{ padding: "4px 8px", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>

            {uploadError && (
              <div className="card" style={{ padding: "12px", marginBottom: "16px", borderLeft: "4px solid var(--status-error)" }}>
                <span style={{ color: "var(--status-error)", fontSize: "13px" }}>{uploadError}</span>
              </div>
            )}

            {uploadProgress && (
              <div className="card" style={{ padding: "10px 14px", marginBottom: "16px", borderLeft: "4px solid var(--status-info)", backgroundColor: "rgba(59, 130, 246, 0.08)" }}>
                <span style={{ color: "var(--status-info)", fontSize: "13px", fontWeight: "500" }}>{uploadProgress}</span>
              </div>
            )}

            {/* Upload form supporting multiple files */}
            <form onSubmit={handleUploadResource} style={{ marginBottom: "24px", padding: "16px", borderRadius: "8px", border: "1px dashed var(--border-color)", backgroundColor: "rgba(0, 0, 0, 0.15)" }}>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" }}>
                  Attach Document(s) (PDF, DOCX, XLSX, PPTX, Images, Videos, max 100MB per file)
                </label>
                <input
                  type="file"
                  multiple
                  className="form-input"
                  onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                  disabled={uploadSubmitting}
                />
                {uploadFiles.length > 0 && (
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                    Selected {uploadFiles.length} file(s): {uploadFiles.map((f) => f.name).join(", ")}
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary" disabled={uploadSubmitting || uploadFiles.length === 0} style={{ padding: "7px 16px", fontSize: "13px" }}>
                {uploadSubmitting ? "Uploading to S3..." : `Upload ${uploadFiles.length > 1 ? `${uploadFiles.length} Documents` : "Document"}`}
              </button>
            </form>

            {/* Existing Documents List */}
            <h4 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "var(--text-main)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Project Documents ({resourceProject.resources?.length || 0})</span>
            </h4>

            {(!resourceProject.resources || resourceProject.resources.length === 0) ? (
              <div style={{ padding: "32px 16px", textAlign: "center", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 10px 0" }}>
                  No project documents have been uploaded yet.
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "12px", margin: 0 }}>
                  Upload specifications, templates, or instructions above to share them with assigned trainers and learners.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {resourceProject.resources.map((res) => (
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
                        title="Preview document in browser"
                      >
                        Preview
                      </button>
                      <a
                        href={res.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "12px", textDecoration: "none" }}
                        title="Download file securely"
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setResourceToDelete(res)}
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                        title="Delete project document"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resource Deletion Confirmation Modal */}
      {resourceToDelete && (
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
            zIndex: 1400,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteResourceSubmitting) setResourceToDelete(null);
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              border: "1px solid var(--border-color)",
              padding: "24px",
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", fontWeight: "700", color: "var(--status-error)" }}>
              Confirm Document Deletion
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: "0 0 16px 0" }}>
              Are you sure you want to permanently delete document <strong>"{resourceToDelete.original_name}"</strong>?
              This will remove the file from storage and revoke access for all assigned trainers and learners.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setResourceToDelete(null)}
                disabled={deleteResourceSubmitting}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDeleteResource}
                disabled={deleteResourceSubmitting}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                {deleteResourceSubmitting ? "Deleting..." : "Delete Document"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 4. PROJECT DETAILS MODAL                                               */}
      {/* ---------------------------------------------------------------------- */}
      {showDetailsModal && detailProject && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDetailsModal(false);
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "720px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--border-color)",
              padding: "24px 28px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                  <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "var(--text-main)" }}>
                    {detailProject.title}
                  </h3>
                  {getStatusBadge(detailProject.status)}
                  {getPriorityBadge(detailProject.priority)}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Created {new Date(detailProject.created_at).toLocaleDateString()} {detailProject.created_by_name && `by ${detailProject.created_by_name}`}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDetailsModal(false)}
                style={{ padding: "4px 8px", fontSize: "14px" }}
              >
                ✕
              </button>
            </div>

            {/* Metrics cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
              <div style={{ padding: "12px", borderRadius: "6px", backgroundColor: "rgba(0, 0, 0, 0.15)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Assigned Learners</div>
                <div style={{ fontSize: "18px", fontWeight: "700", marginTop: "4px" }}>{detailProject.learners_count || 0}</div>
              </div>
              <div style={{ padding: "12px", borderRadius: "6px", backgroundColor: "rgba(0, 0, 0, 0.15)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Learner Submissions</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--accent-primary)", marginTop: "4px" }}>{detailProject.submissions_count || 0}</div>
              </div>
              <div style={{ padding: "12px", borderRadius: "6px", backgroundColor: "rgba(0, 0, 0, 0.15)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase" }}>Pending Reviews</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--status-warning)", marginTop: "4px" }}>{detailProject.pending_reviews_count || 0}</div>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ fontSize: "13px", textTransform: "uppercase", color: "var(--text-secondary)", margin: "0 0 6px" }}>Description</h4>
              <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.5", color: "var(--text-main)" }}>
                {detailProject.description || "None provided."}
              </p>
            </div>

            {/* Instructions */}
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ fontSize: "13px", textTransform: "uppercase", color: "var(--text-secondary)", margin: "0 0 6px" }}>Instructions</h4>
              <div style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--text-main)", whiteSpace: "pre-line", backgroundColor: "rgba(0, 0, 0, 0.1)", padding: "12px", borderRadius: "6px" }}>
                {detailProject.instructions || "None provided."}
              </div>
            </div>

            {/* Objectives */}
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ fontSize: "13px", textTransform: "uppercase", color: "var(--text-secondary)", margin: "0 0 6px" }}>Objectives</h4>
              <div style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--text-main)", whiteSpace: "pre-line", backgroundColor: "rgba(0, 0, 0, 0.1)", padding: "12px", borderRadius: "6px" }}>
                {detailProject.objectives || "None provided."}
              </div>
            </div>

            {/* Dates & Policies */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <div>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Timeline:</span>
                <div style={{ fontSize: "13px", fontWeight: "600", marginTop: "2px" }}>
                  {detailProject.start_date || "—"} &rarr; {detailProject.due_date ? new Date(detailProject.due_date).toLocaleString() : "No deadline"}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Late Submission Policy:</span>
                <div style={{ fontSize: "13px", fontWeight: "600", marginTop: "2px", color: detailProject.allow_late_submissions ? "var(--status-success)" : "var(--status-error)" }}>
                  {detailProject.allow_late_submissions ? "Allowed (flagged late)" : "Strict deadline (blocked)"}
                </div>
              </div>
            </div>

            {/* Assigned Trainers */}
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ fontSize: "13px", textTransform: "uppercase", color: "var(--text-secondary)", margin: "0 0 8px" }}>
                Assigned Trainers ({detailProject.trainers_detail?.length || 0})
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {detailProject.trainers_detail?.map((t) => (
                  <span key={t.id} className="badge badge-purple" style={{ fontSize: "12px", padding: "4px 10px" }}>
                    {t.full_name} (@{t.username})
                  </span>
                ))}
                {(!detailProject.trainers_detail || detailProject.trainers_detail.length === 0) && (
                  <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>No trainers assigned.</span>
                )}
              </div>
            </div>

            {/* Resources list */}
            <div style={{ marginBottom: "20px" }}>
              <h4 style={{ fontSize: "13px", textTransform: "uppercase", color: "var(--text-secondary)", margin: "0 0 8px" }}>
                Project Resources ({detailProject.resources?.length || 0})
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {detailProject.resources?.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", padding: "6px 10px", border: "1px solid var(--border-color)", borderRadius: "4px" }}>
                    <span>{r.original_name} ({formatFileSize(r.file_size)})</span>
                    <a href={r.download_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: "11px", textDecoration: "none" }}>
                      Download
                    </a>
                  </div>
                ))}
                {(!detailProject.resources || detailProject.resources.length === 0) && (
                  <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>No resources attached.</span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 5. SOFT-DELETE / ARCHIVE CONFIRMATION MODAL                            */}
      {/* ---------------------------------------------------------------------- */}
      {showDeleteModal && projectToDelete && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteSubmitting) {
              setShowDeleteModal(false);
            }
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: "10px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--border-color)",
              padding: "24px",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: "700", color: "var(--status-error)" }}>
              Archive / Delete Project
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "14px", lineHeight: "1.5", color: "var(--text-main)" }}>
              Are you sure you want to delete <strong>"{projectToDelete.title}"</strong>?
            </p>
            <div style={{ padding: "12px", borderRadius: "6px", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", marginBottom: "20px", fontSize: "13px", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--status-error)" }}>Safe Archival:</strong> This operation performs a soft-deletion. Learner submissions and historical review scores will be safely preserved in the database.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Archiving..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
