import { useState, useMemo } from "react";
import { getTrainingFileDownloadUrl, apiClient } from "../../../services/api";
import ActionMenu from "../../../components/common/ActionMenu";
import SecurePdfViewer from "../../../components/common/SecurePdfViewer";

const CATEGORY_COLORS = {
  PRIMARY_INSTRUCTIONAL: "badge-primary",
  SUPPLEMENTARY_REFERENCE: "badge-info",
  DOWNLOADABLE_PDF: "badge-secondary",
  IMAGE_INFOGRAPHIC: "badge-warning",
  ASSESSMENT_RUBRIC: "badge-danger",
  PRACTICAL_EXERCISE: "badge-success",
  UNCLASSIFIED: "badge-secondary",
};

const CATEGORY_LABELS = {
  PRIMARY_INSTRUCTIONAL: "Primary Instructional",
  SUPPLEMENTARY_REFERENCE: "Supplementary Reference",
  DOWNLOADABLE_PDF: "Downloadable PDF",
  IMAGE_INFOGRAPHIC: "Image / Infographic",
  ASSESSMENT_RUBRIC: "Assessment / Rubric",
  PRACTICAL_EXERCISE: "Practical Exercise",
  UNCLASSIFIED: "Unclassified",
};

export default function CourseMaterialsView({
  selectedCourse,
  clusters = [],
  modules = [],
  submodules = [],
  mappings = [],
  files = [],
  courses = [],
  onDataRefresh,
  onOpenAttachModal,
  onMappingDeleted,
  onOpenPreviewCourseModal,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [expandedClusters, setExpandedClusters] = useState({ 1: true, 2: true });
  const [expandedModules, setExpandedModules] = useState({});
  const [detachingId, setDetachingId] = useState(null);

  // Direct preview overlay state
  const [previewingFile, setPreviewingFile] = useState(null);

  // Safe file deletion modal state
  const [deletingFile, setDeletingFile] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Filter clusters for selectedCourse if applicable
  const courseClusters = useMemo(() => {
    if (!selectedCourse) return clusters;
    return clusters.filter((c) => !c.course || c.course === selectedCourse.id);
  }, [clusters, selectedCourse]);

  const toggleCluster = (id) => {
    setExpandedClusters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleModule = (id) => {
    setExpandedModules((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePreview = (mapping) => {
    const fileType = (mapping.file_type || mapping.training_file_detail?.file_type || "").toUpperCase();
    const fileId = mapping.training_file_id || mapping.file_id || mapping.training_file;
    const fileName = mapping.filename || mapping.training_file_detail?.filename || `File #${fileId}`;
    const downloadUrl = getTrainingFileDownloadUrl(fileId);
    const isDirectPreviewable = ["PDF", "DOCX", "DOC", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(fileType);

    if (isDirectPreviewable) {
      setPreviewingFile({
        id: fileId,
        filename: fileName,
        fileType,
        url: downloadUrl,
      });
    } else {
      setPreviewingFile({
        id: fileId,
        filename: fileName,
        fileType,
        unsupported: true,
      });
    }
  };

  const handleDetach = async (mapping) => {
    const fileName = mapping.filename || mapping.training_file_detail?.filename || `File #${mapping.training_file_id || mapping.file_id || mapping.training_file}`;
    if (!window.confirm(`Are you sure you want to remove this mapping for "${fileName}"? The physical file will NOT be deleted.`)) {
      return;
    }
    setDetachingId(mapping.id);
    try {
      if (onMappingDeleted) {
        await onMappingDeleted(mapping.id);
      }
    } finally {
      setDetachingId(null);
    }
  };

  const handlePromptDelete = (mapping) => {
    const fileId = mapping.training_file_id || mapping.file_id || mapping.training_file;
    const fileObj = files.find((f) => f.id === fileId) || {
      id: fileId,
      filename: mapping.filename || mapping.training_file_detail?.filename || `File #${fileId}`,
      file_type: (mapping.file_type || mapping.training_file_detail?.file_type || "").toUpperCase(),
      file_size: mapping.file_size || mapping.training_file_detail?.file_size || 0,
      relative_path: mapping.relative_path || mapping.training_file_detail?.relative_path || "",
    };

    const fileSpecificMappings = mappings.filter(
      (m) => (m.training_file_id || m.file_id || m.training_file) === fileId
    );

    setDeletingFile({
      file: fileObj,
      mappings: fileSpecificMappings,
    });
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingFile) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await apiClient(`/admin/training-files/${deletingFile.file.id}/`, {
        method: "DELETE",
      });

      setDeletingFile(null);
      if (onDataRefresh) {
        await onDataRefresh();
      }
    } catch (err) {
      setDeleteError(err.message || "Failed to delete repository file.");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return "—";
    const num = Number(bytes);
    if (isNaN(num) || num <= 0) return "0 B";
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      const fileName = m.filename || m.training_file_detail?.filename || "";
      const notes = m.notes || "";
      const subName = m.submodule_name || "";

      const matchesSearch =
        !searchQuery.trim() ||
        fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
        subName.toLowerCase().includes(searchQuery.toLowerCase());

      const fileType = m.file_type || m.training_file_detail?.file_type || "";
      const matchesType = typeFilter === "ALL" || fileType === typeFilter;
      const matchesCategory = categoryFilter === "ALL" || m.category === categoryFilter;

      return matchesSearch && matchesType && matchesCategory;
    });
  }, [mappings, searchQuery, typeFilter, categoryFilter]);

  return (
    <div>
      {/* Search and Filters Toolbar */}
      <div
        className="card"
        style={{
          marginBottom: "16px",
          padding: "14px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search materials by filename, topic, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "6px 12px", fontSize: "13px" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Format:</span>
          {["ALL", "DOCX", "PDF", "PNG"].map((t) => (
            <button
              key={t}
              type="button"
              className={`btn ${typeFilter === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTypeFilter(t)}
              style={{ fontSize: "11px", padding: "3px 8px" }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Category:</span>
          <select
            className="form-input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ fontSize: "12px", padding: "4px 8px" }}
          >
            <option value="ALL">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([val, lbl]) => (
              <option key={val} value={val}>
                {lbl}
              </option>
            ))}
          </select>
        </div>

        {selectedCourse && onOpenPreviewCourseModal && (
          <div style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onOpenPreviewCourseModal(selectedCourse)}
              style={{ fontSize: "12px", padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              title="Preview Course"
            >
              <span>👁️ Preview Course</span>
            </button>
          </div>
        )}
      </div>

      {/* Topic Clusters Tree */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {courseClusters.map((cluster) => {
          const clusterMappings = filteredMappings.filter((m) => m.cluster === cluster.id);
          const isExpanded = Boolean(expandedClusters[cluster.id]);

          // Find distinct modules mapped inside this cluster
          const clusterModuleIds = Array.from(new Set(clusterMappings.map((m) => m.module).filter(Boolean)));
          const unassignedToModuleMappings = clusterMappings.filter((m) => !m.module);

          return (
            <div
              key={cluster.id}
              className="card"
              style={{ padding: "0", overflow: "hidden", border: "1px solid var(--border-color)" }}
            >
              {/* Cluster Header */}
              <div
                onClick={() => toggleCluster(cluster.id)}
                style={{
                  padding: "12px 16px",
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "14px", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                    ▶
                  </span>
                  <div>
                    <span className="badge badge-purple" style={{ marginRight: "8px", fontSize: "10px" }}>
                      {cluster.code}
                    </span>
                    <strong style={{ fontSize: "14px", color: "var(--text-main)" }}>{cluster.name}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="badge badge-info" style={{ fontSize: "11px" }}>
                    {clusterMappings.length} Materials
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAttachModal({ cluster });
                    }}
                    style={{ padding: "2px 8px", fontSize: "11px" }}
                  >
                    + Attach File
                  </button>
                </div>
              </div>

              {/* Cluster Content */}
              {isExpanded && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-color)" }}>
                  {clusterMappings.length === 0 ? (
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--text-muted)" }}>
                      No training materials mapped in this cluster matching current filters.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Cluster-level unassigned to module */}
                      {unassignedToModuleMappings.length > 0 && (
                        <div style={{ padding: "8px 12px", backgroundColor: "var(--bg-surface)", borderRadius: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>
                            General Cluster Reference Documents:
                          </span>
                          <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                            {unassignedToModuleMappings.map((m) =>
                              renderMaterialRow(m, handlePreview, onOpenAttachModal, handlePromptDelete, handleDetach, detachingId)
                            )}
                          </div>
                        </div>
                      )}

                      {/* Modules inside this cluster */}
                      {clusterModuleIds.map((modId) => {
                        const mod = modules.find((m) => m.id === modId);
                        const modMappings = clusterMappings.filter((m) => m.module === modId);
                        const isModExpanded = Boolean(expandedModules[modId]);

                        return (
                          <div
                            key={modId}
                            style={{
                              border: "1px solid var(--border-color)",
                              borderRadius: "4px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              onClick={() => toggleModule(modId)}
                              style={{
                                padding: "8px 12px",
                                backgroundColor: "rgba(255, 255, 255, 0.01)",
                                display: "flex",
                                justifyCourse: "space-between",
                                justifyContent: "space-between",
                                alignItems: "center",
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)" }}>
                                {isModExpanded ? "▼" : "▶"} Module #{mod?.order || modId}: {mod?.name || `Module #${modId}`}
                              </span>
                              <span className="badge badge-secondary" style={{ fontSize: "10px" }}>
                                {modMappings.length} Materials
                              </span>
                            </div>

                            {isModExpanded && (
                              <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "6px" }}>
                                {modMappings.map((m) =>
                                  renderMaterialRow(m, handlePreview, onOpenAttachModal, handlePromptDelete, handleDetach, detachingId)
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* In-Dialog Material Direct Preview Overlay */}
      {previewingFile && (
        <div
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
            zIndex: 10000,
            padding: "24px",
          }}
          onClick={() => setPreviewingFile(null)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-card, #ffffff)",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "920px",
              height: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 25px rgba(0,0,0,0.4)",
              border: "1px solid var(--border-color, #e2e8f0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border-color, #e2e8f0)",
                backgroundColor: "var(--bg-secondary, #f8fafc)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                <span className="badge badge-primary">{previewingFile.fileType}</span>
                <strong
                  style={{
                    fontSize: "14px",
                    color: "var(--text-main, #0f172a)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {previewingFile.filename}
                </strong>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                {!previewingFile.unsupported && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      window.open(
                        `/viewer?fileId=${previewingFile.id}&title=${encodeURIComponent(
                          previewingFile.filename
                        )}`,
                        "_blank"
                      )
                    }
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                  >
                    Open in New Tab
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPreviewingFile(null)}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  &times; Close
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                backgroundColor: "var(--bg-primary, #f1f5f9)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                padding: "0",
              }}
            >
              {previewingFile.unsupported ? (
                <div style={{ textAlign: "center", maxWidth: "420px", padding: "20px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>📄</div>
                  <h4 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
                    Preview Unavailable for this Format
                  </h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>
                    Direct inline preview is not supported for <strong>{previewingFile.fileType}</strong> documents, and downloads are restricted across the LMS.
                  </p>
                </div>
              ) : ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(previewingFile.fileType) ? (
                <img
                  src={previewingFile.url}
                  alt={previewingFile.filename}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  onContextMenu={(e) => e.preventDefault()}
                />
              ) : (
                <SecurePdfViewer url={previewingFile.url} title={previewingFile.filename} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Safe File Deletion Confirmation Modal */}
      {deletingFile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() => !isDeleting && setDeletingFile(null)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-card, #ffffff)",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "520px",
              padding: "24px",
              boxShadow: "0 20px 25px rgba(0,0,0,0.3)",
              border: "1px solid var(--border-color, #e2e8f0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  color: "#ef4444",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "20px",
                }}
              >
                ⚠️
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "var(--text-main, #0f172a)", fontWeight: "700" }}>
                  Delete Training File
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary, #64748b)", lineHeight: "1.5" }}>
                  Are you sure you want to permanently delete this file from the training materials repository?
                </p>
              </div>
            </div>

            {/* File Metadata Overview */}
            <div
              style={{
                backgroundColor: "var(--bg-secondary, #f8fafc)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "6px",
                padding: "12px 14px",
                marginBottom: "16px",
                fontSize: "12px",
              }}
            >
              <div style={{ marginBottom: "6px" }}>
                <span style={{ color: "var(--text-secondary, #64748b)" }}>Filename: </span>
                <strong style={{ color: "var(--text-main, #0f172a)" }}>{deletingFile.file.filename}</strong>
              </div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "6px" }}>
                <div>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Format: </span>
                  <span className="badge badge-secondary" style={{ fontSize: "10px" }}>{deletingFile.file.file_type}</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Size: </span>
                  <strong style={{ color: "var(--text-main, #0f172a)" }}>{formatFileSize(deletingFile.file.file_size)}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Mappings: </span>
                  <span className={`badge ${deletingFile.mappings.length > 0 ? "badge-danger" : "badge-info"}`} style={{ fontSize: "10px" }}>
                    {deletingFile.mappings.length} {deletingFile.mappings.length === 1 ? "Mapping" : "Mappings"}
                  </span>
                </div>
              </div>
              {deletingFile.file.relative_path && (
                <div style={{ wordBreak: "break-all" }}>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Path: </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-main, #0f172a)" }}>{deletingFile.file.relative_path}</span>
                </div>
              )}
            </div>

            {/* Impact Warning if Mappings Exist */}
            {deletingFile.mappings.length > 0 ? (
              <div
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "6px",
                  padding: "12px 14px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <div style={{ fontWeight: "700", color: "#dc2626", marginBottom: "4px" }}>
                  Active Curriculum Attachments Affected
                </div>
                <div style={{ color: "var(--text-secondary, #64748b)", lineHeight: "1.5", marginBottom: "8px" }}>
                  This file is currently attached to <strong>{deletingFile.mappings.length}</strong> lesson(s) or module(s). Deleting it will permanently detach this material from learner views:
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--text-secondary, #64748b)", maxHeight: "100px", overflowY: "auto" }}>
                  {deletingFile.mappings.slice(0, 5).map((m, idx) => {
                    const cl = clusters.find((c) => c.id === m.cluster);
                    const md = modules.find((mod) => mod.id === m.module);
                    return (
                      <li key={idx} style={{ marginBottom: "2px" }}>
                        {cl?.name || "Cluster"} {md ? `→ ${md.name}` : ""}
                      </li>
                    );
                  })}
                  {deletingFile.mappings.length > 5 && (
                    <li>...and {deletingFile.mappings.length - 5} more attachment(s)</li>
                  )}
                </ul>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "var(--text-secondary, #64748b)",
                }}
              >
                This file is unassigned and is not attached to any active course curriculum.
              </div>
            )}

            {deleteError && (
              <div
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  marginBottom: "16px",
                  fontSize: "12px",
                }}
              >
                {deleteError}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isDeleting}
                onClick={() => setDeletingFile(null)}
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                style={{ fontSize: "12px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {isDeleting ? "Deleting..." : "Confirm & Delete File"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderMaterialRow(
  m,
  handlePreview,
  onOpenAttachModal,
  handlePromptDelete,
  handleDetach,
  detachingId
) {
  const fileName = m.filename || m.training_file_detail?.filename || `File #${m.training_file_id || m.file_id || m.training_file}`;
  const fileType = (m.file_type || m.training_file_detail?.file_type || "FILE").toUpperCase();
  const categoryBadge = CATEGORY_COLORS[m.category] || "badge-secondary";
  const categoryLabel = CATEGORY_LABELS[m.category] || m.category;
  const isDirectPreviewable = ["PDF", "PNG", "JPG", "JPEG", "WEBP", "SVG"].includes(fileType);

  return (
    <div
      key={m.id}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 10px",
        backgroundColor: "var(--bg-card)",
        borderRadius: "4px",
        fontSize: "12px",
        border: "1px solid var(--border-color)",
        gap: "8px",
        flexWrap: "nowrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1, overflow: "hidden" }}>
        <span className={`badge ${fileType === "PDF" ? "badge-danger" : "badge-primary"}`} style={{ fontSize: "10px" }}>
          {fileType}
        </span>
        <span style={{ fontWeight: "500", color: "var(--text-main)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {fileName}
        </span>
        <span className={`badge ${categoryBadge}`} style={{ fontSize: "10px" }}>
          {categoryLabel}
        </span>
        {m.submodule_name && (
          <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            &rarr; Lesson: {m.submodule_name}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => handlePreview(m)}
          style={{ padding: "2px 8px", fontSize: "11px" }}
        >
          Preview
        </button>
        {handleDetach && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleDetach(m)}
            disabled={detachingId === m.id}
            style={{ padding: "2px 8px", fontSize: "11px", color: "var(--status-error)" }}
            title="Detach file mapping"
          >
            {detachingId === m.id ? "Detaching..." : "Detach"}
          </button>
        )}
        <ActionMenu
          align="right"
          actions={[
            {
              label: "Preview",
              icon: (
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ),
              onClick: () => handlePreview(m),
              title: isDirectPreviewable ? "Preview file directly" : "Preview unavailable for this format",
            },
            {
              label: "Attach to Lesson",
              icon: (
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              ),
              onClick: () => onOpenAttachModal && onOpenAttachModal({
                file: {
                  id: m.training_file_id || m.file_id || m.training_file,
                  filename: fileName,
                  file_type: fileType,
                }
              }),
              title: "Attach to another cluster, module, or lesson",
            },
            {
              label: "Delete File",
              icon: (
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              ),
              danger: true,
              onClick: () => handlePromptDelete(m),
              title: "Safely delete this repository file",
            },
          ]}
        />
      </div>
    </div>
  );
}

