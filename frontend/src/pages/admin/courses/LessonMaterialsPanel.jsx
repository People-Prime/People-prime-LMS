import { useState } from "react";
import { apiClient, getTrainingFileDownloadUrl } from "../../../services/api";

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
  PRIMARY_INSTRUCTIONAL: "Primary",
  SUPPLEMENTARY_REFERENCE: "Reference",
  DOWNLOADABLE_PDF: "Downloadable PDF",
  IMAGE_INFOGRAPHIC: "Infographic",
  ASSESSMENT_RUBRIC: "Rubric / Assessment",
  PRACTICAL_EXERCISE: "Exercise",
  UNCLASSIFIED: "Unclassified",
};

export default function LessonMaterialsPanel({
  submodule,
  module,
  mappings = [],
  onOpenAttachModal,
  onMappingDeleted,
}) {
  const [detachingId, setDetachingId] = useState(null);
  const [error, setError] = useState(null);

  // Filter mappings for this specific submodule or parent module
  const targetMappings = submodule
    ? mappings.filter((m) => m.submodule === submodule.id)
    : module
    ? mappings.filter((m) => m.module === module.id && !m.submodule)
    : [];

  const handleDetach = async (mapping) => {
    const filename = mapping.filename || mapping.training_file_detail?.filename || `File #${mapping.training_file_id || mapping.file_id || mapping.training_file}`;
    const targetLabel = submodule ? "this lesson" : "this module";
    if (
      !window.confirm(
        `Are you sure you want to detach "${filename}" from ${targetLabel}? The physical file will NOT be deleted.`
      )
    ) {
      return;
    }

    setDetachingId(mapping.id);
    setError(null);

    try {
      await apiClient(`/admin/training-file-mappings/${mapping.id}/`, {
        method: "DELETE",
      });
      if (onMappingDeleted) {
        onMappingDeleted(mapping.id);
      }
    } catch (err) {
      setError(err.message || "Failed to detach training material.");
    } finally {
      setDetachingId(null);
    }
  };

  const handlePreview = (mapping) => {
    const fileId = mapping.training_file_id || mapping.file_id || mapping.training_file;
    const fileName = mapping.filename || mapping.training_file_detail?.filename || `File #${fileId}`;
    if (fileId) {
      window.open(`/viewer?fileId=${fileId}&title=${encodeURIComponent(fileName)}`, "_blank");
    }
  };

  return (
    <div
      style={{
        marginTop: submodule ? "10px" : "0",
        padding: "14px 16px",
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        borderRadius: "var(--radius-sm, 6px)",
        border: "1px solid var(--border-color, #333)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: targetMappings.length > 0 ? "10px" : "0",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)" }}>
            Attached Training Materials ({targetMappings.length})
          </span>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onOpenAttachModal(submodule || { module })}
          style={{ padding: "3px 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <span>+ Attach Material</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ padding: "4px 8px", fontSize: "11px", marginBottom: "8px" }}>
          {error}
        </div>
      )}

      {targetMappings.length === 0 ? (
        <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
          {submodule
            ? "No source documents attached to this lesson yet. Click \"+ Attach Material\" to link a training file."
            : "No source documents attached to this module yet. Click \"+ Attach Material\" to link a training file."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {targetMappings.map((m) => {
            const fileName = m.filename || m.training_file_detail?.filename || `File #${m.training_file_id || m.file_id || m.training_file}`;
            const fileType = m.file_type || m.training_file_detail?.file_type || "FILE";
            const categoryBadge = CATEGORY_COLORS[m.category] || "badge-secondary";
            const categoryLabel = CATEGORY_LABELS[m.category] || m.category;

            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "4px",
                  fontSize: "12px",
                  border: "1px solid var(--border-color)",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "200px" }}>
                  <span className={`badge ${categoryBadge}`} style={{ fontSize: "10px" }}>
                    {categoryLabel}
                  </span>
                  <span className="badge badge-secondary" style={{ fontSize: "10px" }}>
                    {fileType}
                  </span>
                  <strong
                    style={{
                      color: "var(--text-main)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "350px",
                    }}
                    title={fileName}
                  >
                    {fileName}
                  </strong>
                </div>

                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handlePreview(m)}
                    style={{ padding: "2px 8px", fontSize: "11px" }}
                    title="Preview file in browser"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleDetach(m)}
                    disabled={detachingId === m.id}
                    style={{ padding: "2px 8px", fontSize: "11px", color: "var(--status-error)" }}
                    title="Detach material (preserves physical file)"
                  >
                    {detachingId === m.id ? "Detaching..." : "Detach"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

