import React from "react";

/**
 * ModuleDeleteModal Component
 * Provides a clear, detailed confirmation dialog before deleting DRAFT or PUBLISHED modules.
 * Displays live dependency counts (submodules, attached materials, questions, attempts, feedback, assignments).
 */
export default function ModuleDeleteModal({
  show,
  module,
  impact,
  loadingImpact,
  submitting,
  onClose,
  onConfirm,
}) {
  if (!show || !module) return null;

  const isPublished = module.status === "PUBLISHED";

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
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
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
            backgroundColor: isPublished ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "700",
                color: isPublished ? "var(--status-error, #dc2626)" : "var(--status-warning, #d97706)",
              }}
            >
              Confirm Module Deletion
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
            Are you sure you want to permanently delete module <strong>&quot;{module.name}&quot;</strong> (Code: <code>{module.code}</code>)?
          </p>

          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--bg-secondary, #f8fafc)",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              marginBottom: "16px",
              fontSize: "12px",
            }}
          >
            <div><strong>Parent Course:</strong> {impact?.course_name || "Current Course"}</div>
            <div>
              <strong>Current Status:</strong>{" "}
              <span className={`badge ${isPublished ? "badge-success" : "badge-secondary"}`}>
                {module.status}
              </span>
            </div>
          </div>

          {/* Strong Warning for Published Modules */}
          {isPublished && (
            <div
              className="alert alert-error"
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                fontSize: "12px",
                lineHeight: "1.5",
                borderRadius: "6px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#b91c1c",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              <strong>Critical Warning — Published Module:</strong>
              <div style={{ marginTop: "4px" }}>
                This module is currently <strong>PUBLISHED</strong>. Deleting it will permanently remove all associated lessons,
                curriculum materials, and any learner evaluation records linked to this module. This action is irreversible.
              </div>
            </div>
          )}

          {/* Impact Breakdown */}
          <div style={{ marginBottom: "16px" }}>
            <h4
              style={{
                margin: "0 0 8px 0",
                fontSize: "13px",
                fontWeight: "600",
                color: "var(--text-main)",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              Deletion Impact Assessment:
            </h4>

            {loadingImpact ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                <div className="spinner" style={{ width: "14px", height: "14px" }}></div>
                Calculating dependent module records...
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "8px",
                  fontSize: "12px",
                }}
              >
                <div style={{ padding: "8px", backgroundColor: "var(--bg-secondary, #f8fafc)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Submodules / Lessons:</span>{" "}
                  <strong>{impact?.submodules_count ?? 0}</strong>
                </div>
                <div style={{ padding: "8px", backgroundColor: "var(--bg-secondary, #f8fafc)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Attached Files:</span>{" "}
                  <strong>{impact?.materials_mappings_count ?? 0}</strong>
                </div>
                <div style={{ padding: "8px", backgroundColor: "var(--bg-secondary, #f8fafc)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Assessment Questions:</span>{" "}
                  <strong>{impact?.questions_count ?? 0}</strong>
                </div>
                <div style={{ padding: "8px", backgroundColor: "var(--bg-secondary, #f8fafc)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Learner Attempts:</span>{" "}
                  <strong>{impact?.attempts_count ?? 0}</strong>
                </div>
                <div style={{ padding: "8px", backgroundColor: "var(--bg-secondary, #f8fafc)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Submitted Responses:</span>{" "}
                  <strong>{impact?.responses_count ?? 0}</strong>
                </div>
                <div style={{ padding: "8px", backgroundColor: "var(--bg-secondary, #f8fafc)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Direct Assignments:</span>{" "}
                  <strong>{impact?.assignments_count ?? 0}</strong>
                </div>
              </div>
            )}
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
            disabled={submitting || loadingImpact}
            style={{
              padding: "6px 16px",
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
                Deleting Module...
              </>
            ) : (
              `Delete ${isPublished ? "Published " : ""}Module`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

