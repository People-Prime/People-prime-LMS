import React from "react";

export default function CourseDeleteModal({
  show,
  course,
  impact,
  loadingImpact,
  submitting,
  onClose,
  onConfirm,
}) {
  if (!show || !course) return null;

  const isPublished = course.status === "PUBLISHED";

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
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
    >
      <div
        className="modal-container"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "540px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#fef2f2",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>⚠️</span>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color: "#991b1b",
              }}
            >
              Confirm Course Deletion
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "none",
              border: "none",
              fontSize: "20px",
              cursor: submitting ? "not-allowed" : "pointer",
              color: "#6b7280",
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: "20px" }}>
          <p style={{ margin: "0 0 14px 0", fontSize: "14px", color: "#374151" }}>
            Are you sure you want to permanently delete this course? This action cannot be undone.
          </p>

          {/* Course Details Card */}
          <div
            style={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              padding: "12px 14px",
              marginBottom: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "13px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Course Name:</span>
              <strong style={{ color: "#111827" }}>{course.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Course Code:</span>
              <span className="badge badge-info" style={{ fontWeight: "600" }}>{course.code}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#6b7280" }}>Publication Status:</span>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  fontWeight: "600",
                  backgroundColor: isPublished ? "#def7ec" : "#f3f4f6",
                  color: isPublished ? "#03543f" : "#374151",
                }}
              >
                {course.status}
              </span>
            </div>
          </div>

          {/* Dependency Impact Section */}
          <div style={{ marginBottom: "16px" }}>
            <h4
              style={{
                margin: "0 0 8px 0",
                fontSize: "13px",
                fontWeight: "600",
                color: "#1f2937",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Affected Child Entities & Records
            </h4>

            {loadingImpact ? (
              <div style={{ padding: "12px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
                Calculating affected dependency records...
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  fontSize: "12px",
                }}
              >
                <div style={{ backgroundColor: "#f3f4f6", padding: "8px 10px", borderRadius: "4px" }}>
                  <span style={{ color: "#6b7280", display: "block" }}>Modules:</span>
                  <strong style={{ color: "#111827", fontSize: "14px" }}>
                    {impact?.modules_count ?? "—"}
                  </strong>
                </div>
                <div style={{ backgroundColor: "#f3f4f6", padding: "8px 10px", borderRadius: "4px" }}>
                  <span style={{ color: "#6b7280", display: "block" }}>Assignments:</span>
                  <strong style={{ color: "#111827", fontSize: "14px" }}>
                    {impact?.assignments_count ?? "—"}
                  </strong>
                </div>
                <div style={{ backgroundColor: "#f3f4f6", padding: "8px 10px", borderRadius: "4px" }}>
                  <span style={{ color: "#6b7280", display: "block" }}>Assessment Questions:</span>
                  <strong style={{ color: "#111827", fontSize: "14px" }}>
                    {impact?.questions_count ?? "—"}
                  </strong>
                </div>
                <div style={{ backgroundColor: "#f3f4f6", padding: "8px 10px", borderRadius: "4px" }}>
                  <span style={{ color: "#6b7280", display: "block" }}>Assessment Attempts:</span>
                  <strong style={{ color: "#111827", fontSize: "14px" }}>
                    {impact?.attempts_count ?? "—"}
                  </strong>
                </div>
                <div style={{ backgroundColor: "#f3f4f6", padding: "8px 10px", borderRadius: "4px" }}>
                  <span style={{ color: "#6b7280", display: "block" }}>Learner Responses:</span>
                  <strong style={{ color: "#111827", fontSize: "14px" }}>
                    {impact?.responses_count ?? "—"}
                  </strong>
                </div>
                <div style={{ backgroundColor: "#f3f4f6", padding: "8px 10px", borderRadius: "4px" }}>
                  <span style={{ color: "#6b7280", display: "block" }}>Feedback Records:</span>
                  <strong style={{ color: "#111827", fontSize: "14px" }}>
                    {impact?.feedback_count ?? "—"}
                  </strong>
                </div>
                <div style={{ backgroundColor: "#f3f4f6", padding: "8px 10px", borderRadius: "4px", gridColumn: "span 2" }}>
                  <span style={{ color: "#6b7280", display: "block" }}>Associated Training Clusters:</span>
                  <strong style={{ color: "#111827", fontSize: "14px" }}>
                    {impact?.clusters_count ?? "—"}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* Warning Banner */}
          <div
            style={{
              backgroundColor: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "6px",
              padding: "10px 12px",
              fontSize: "12px",
              color: "#92400e",
              lineHeight: "1.4",
            }}
          >
            <strong>Warning:</strong> Deleting this course will permanently remove all associated curriculum modules,
            training clusters, assignments, quiz questions, and any recorded learner assessment attempts, responses, and feedback.
          </div>
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
            style={{ padding: "8px 16px", fontSize: "13px" }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={submitting || loadingImpact}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              cursor: (submitting || loadingImpact) ? "not-allowed" : "pointer",
              fontWeight: "600",
            }}
          >
            {submitting ? "Deleting Course..." : "Yes, Delete Course"}
          </button>
        </div>
      </div>
    </div>
  );
}

