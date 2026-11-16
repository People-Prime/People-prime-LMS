import React from "react";

/**
 * LevelDeleteModal Component
 * Provides an explicit, permanent delete confirmation dialog for CourseLevels.
 * Explicitly warns that all modules, submodules, questions, responses, attempts,
 * learner progress, and feedback records will be permanently deleted.
 */
export default function LevelDeleteModal({
  show,
  level,
  modulesCount = 0,
  submitting,
  onClose,
  onConfirm,
}) {
  if (!show || !level) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
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
        zIndex: 1200,
        padding: "16px",
      }}
    >
      <div
        className="modal-container"
        style={{
          backgroundColor: "var(--bg-card, #ffffff)",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "540px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "700",
                color: "var(--status-error, #dc2626)",
              }}
            >
              Confirm Permanent Level Deletion
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "18px",
              cursor: submitting ? "not-allowed" : "pointer",
              color: "var(--text-secondary)",
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: "20px" }}>
          <p style={{ margin: "0 0 14px 0", fontSize: "14px", lineHeight: "1.5", color: "var(--text-main)" }}>
            Are you sure you want to permanently delete <strong>&quot;{level.name}&quot;</strong> (Tier #{level.order})?
          </p>

          <div
            className="alert alert-error"
            style={{
              marginBottom: "16px",
              padding: "14px 16px",
              fontSize: "13px",
              lineHeight: "1.6",
              borderRadius: "6px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#b91c1c",
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <strong>Critical Permanent Deletion Warning:</strong>
            <div style={{ marginTop: "6px" }}>
              This action will permanently delete <strong>{level.name}</strong>, along with all{" "}
              <strong>{modulesCount} module(s)</strong> within this level, their submodules, uploaded learning
              content, assessment questions, learner assessment responses, assessment attempts, progress records,
              and associated feedback.
            </div>
            <div style={{ marginTop: "8px", fontWeight: "700" }}>
              This action cannot be undone.
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--bg-secondary, #f8fafc)",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              fontSize: "12px",
            }}
          >
            <div><strong>Level Name:</strong> {level.name}</div>
            <div><strong>Tier Sequence:</strong> #{level.order}</div>
            <div><strong>Modules Affected:</strong> {modulesCount} module(s)</div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
            style={{ padding: "6px 14px", fontSize: "13px" }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={submitting}
            style={{
              padding: "6px 18px",
              fontSize: "13px",
              backgroundColor: "var(--status-error, #dc2626)",
              borderColor: "var(--status-error, #dc2626)",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: "600",
            }}
          >
            {submitting ? (
              <>
                <div className="spinner" style={{ width: "12px", height: "12px" }}></div>
                Deleting Level &amp; Content...
              </>
            ) : (
              "Permanently Delete Level"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

