import { useState, useEffect } from "react";
import { apiClient } from "../../../services/api";

export default function CoursePublishModal({
  show,
  course,
  onClose,
  onPublishSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (show && course) {
      setLoading(true);
      setError(null);
      apiClient(`/courses/${course.id}/publish-content/`)
        .then((data) => {
          setPreviewData(data);
        })
        .catch((err) => {
          setError(err.message || "Failed to load publication impact details.");
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setPreviewData(null);
      setError(null);
    }
  }, [show, course]);

  if (!show || !course) return null;

  const handleConfirmPublish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiClient(`/courses/${course.id}/publish-content/`, {
        method: "POST",
      });
      if (onPublishSuccess) {
        onPublishSuccess(result);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to publish course content.");
    } finally {
      setSubmitting(false);
    }
  };

  const isAlreadyPublished = course.status === "PUBLISHED";
  const draftModulesCount = previewData?.draft_modules_count ?? 0;
  const draftSubmodulesCount = previewData?.draft_submodules_count ?? 0;
  const alreadyPublishedModules = previewData?.already_published_modules_count ?? 0;
  const alreadyPublishedSubmodules = previewData?.already_published_submodules_count ?? 0;
  const archivedModules = previewData?.archived_modules_count ?? 0;
  const archivedSubmodules = previewData?.archived_submodules_count ?? 0;
  const totalDraftContent = draftModulesCount + draftSubmodulesCount;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-container" style={{ maxWidth: "560px", width: "100%" }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isAlreadyPublished ? "Publish All Course Content" : "Publish Course & All Content"}
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
              {course.name}
            </span>
            <span className="badge badge-info">{course.code}</span>
            <span className={`badge ${course.status === "PUBLISHED" ? "badge-success" : "badge-warning"}`}>
              {course.status}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
            {isAlreadyPublished
              ? "This course is already PUBLISHED. This action will synchronize and publish all remaining DRAFT modules and submodules in a single transaction, making them visible to assigned learners."
              : "Publishing this course will automatically transition all associated DRAFT modules and submodules to PUBLISHED in a single atomic transaction."}
          </p>

          {error && (
            <div className="alert alert-error" style={{ fontSize: "12px", padding: "8px 12px" }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: "20px" }}>
              <div className="spinner" style={{ margin: "0 auto 8px" }}></div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Inspecting curriculum content statuses...
              </p>
            </div>
          ) : previewData ? (
            <div
              style={{
                backgroundColor: "var(--bg-surface)",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                padding: "12px 16px",
              }}
            >
              <h4 style={{ margin: "0 0 10px 0", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
                Publication Synchronization Summary
              </h4>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>
                <div style={{ padding: "8px", backgroundColor: "rgba(16, 185, 129, 0.08)", borderRadius: "4px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                  <div style={{ fontSize: "11px", color: "var(--status-success)", fontWeight: "600" }}>
                    DRAFT Modules to Publish
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--status-success)", marginTop: "2px" }}>
                    {draftModulesCount}
                  </div>
                </div>

                <div style={{ padding: "8px", backgroundColor: "rgba(16, 185, 129, 0.08)", borderRadius: "4px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                  <div style={{ fontSize: "11px", color: "var(--status-success)", fontWeight: "600" }}>
                    DRAFT Submodules to Publish
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--status-success)", marginTop: "2px" }}>
                    {draftSubmodulesCount}
                  </div>
                </div>

                <div style={{ padding: "8px", backgroundColor: "rgba(99, 102, 241, 0.06)", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    Already Published Modules
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)", marginTop: "2px" }}>
                    {alreadyPublishedModules}
                  </div>
                </div>

                <div style={{ padding: "8px", backgroundColor: "rgba(99, 102, 241, 0.06)", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    Already Published Submodules
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)", marginTop: "2px" }}>
                    {alreadyPublishedSubmodules}
                  </div>
                </div>
              </div>

              {(archivedModules > 0 || archivedSubmodules > 0) && (
                <div style={{ marginTop: "10px", padding: "6px 10px", backgroundColor: "rgba(156, 163, 175, 0.1)", borderRadius: "4px", fontSize: "11px", color: "var(--text-secondary)" }}>
                  ℹ️ <strong>{archivedModules}</strong> archived modules and <strong>{archivedSubmodules}</strong> archived submodules will remain untouched (ARCHIVED).
                </div>
              )}

              {totalDraftContent === 0 && isAlreadyPublished && (
                <div style={{ marginTop: "10px", padding: "8px 12px", backgroundColor: "rgba(16, 185, 129, 0.15)", borderRadius: "4px", fontSize: "12px", color: "var(--status-success)" }}>
                  ✓ All modules and submodules in this course are already PUBLISHED. No content requires synchronization.
                </div>
              )}
            </div>
          ) : null}

          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            <strong>Safety & Isolation Guarantees:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              <li>Atomic database transaction ensures all changes succeed or none do.</li>
              <li>Learner assignments, assessment attempts, and feedback records are never modified.</li>
              <li>Only learners with active assignments to this course or its modules will gain access.</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmPublish}
            disabled={submitting || loading || (isAlreadyPublished && totalDraftContent === 0)}
            style={{
              backgroundColor: "var(--accent-primary, #6366f1)",
              borderColor: "var(--accent-primary, #6366f1)",
            }}
          >
            {submitting
              ? "Publishing Content..."
              : isAlreadyPublished
              ? "Publish All Course Content"
              : "Confirm & Publish Course"}
          </button>
        </div>
      </div>
    </div>
  );
}

