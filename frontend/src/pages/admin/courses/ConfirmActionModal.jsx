import React from "react";

/**
 * ConfirmActionModal Component
 * Reusable modal popup to provide a final confirmation step before an Admin
 * executes an important curriculum/module operation (e.g. changing level assignment,
 * reordering, creating, editing, or uploading content).
 */
export default function ConfirmActionModal({
  show,
  title = "Confirm Operation",
  message,
  affectedItem,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isDanger = false,
  submitting = false,
  onConfirm,
  onClose,
}) {
  if (!show) return null;

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
        zIndex: 1300,
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        className="modal-container"
        style={{
          backgroundColor: "var(--bg-card, #ffffff)",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
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
            backgroundColor: isDanger ? "rgba(239, 68, 68, 0.08)" : "var(--bg-surface, #f8fafc)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>
              {isDanger ? "⚠️" : "ℹ️"}
            </span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: isDanger ? "var(--status-error, #ef4444)" : "var(--text-main)" }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: submitting ? "not-allowed" : "pointer",
              color: "var(--text-secondary)",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: "20px" }}>
          <p style={{ margin: "0 0 12px 0", fontSize: "14px", lineHeight: "1.5", color: "var(--text-main)" }}>
            {message}
          </p>

          {affectedItem && (
            <div
              style={{
                backgroundColor: "var(--bg-active, #eff6ff)",
                border: "1px solid var(--border-color, #dbeafe)",
                borderRadius: "6px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "var(--text-main)",
                marginBottom: "8px",
              }}
            >
              <strong>Affected Item:</strong> {affectedItem}
            </div>
          )}
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
            backgroundColor: "var(--bg-surface, #f8fafc)",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
            style={{ padding: "8px 16px", fontSize: "13px" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={isDanger ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
            disabled={submitting}
            style={{
              padding: "8px 20px",
              fontSize: "13px",
              fontWeight: "600",
              minWidth: "90px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isDanger ? "var(--status-error, #ef4444)" : undefined,
              borderColor: isDanger ? "var(--status-error, #ef4444)" : undefined,
              color: "#ffffff",
            }}
          >
            {submitting ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
