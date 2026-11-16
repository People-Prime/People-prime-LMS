import React, { useState } from "react";

/**
 * ModuleInsertModal Component
 * Allows Admin to insert a new module at any position in a level:
 * - At beginning of level
 * - Before existing module
 * - After existing module
 * - At end of level
 */
export default function ModuleInsertModal({
  show,
  course,
  level,
  levelModules = [],
  submitting,
  onClose,
  onInsert,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [statusVal, setStatusVal] = useState("DRAFT");
  const [position, setPosition] = useState("end"); // "beginning" | "before" | "after" | "end"
  const [refModuleId, setRefModuleId] = useState(levelModules[0]?.id || "");
  const [error, setError] = useState(null);

  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a module name.");
      return;
    }

    const resolvedCourseId = course?.id ?? level?.course ?? null;
    const parsedDuration =
      duration === "" || duration === null || duration === undefined
        ? 0
        : parseInt(duration, 10);

    onInsert({
      course: resolvedCourseId,
      level: level?.id || null,
      name: name.trim(),
      description: description.trim(),
      estimated_duration_minutes: isNaN(parsedDuration) ? 0 : Math.max(0, parsedDuration),
      status: statusVal,
      position,
      reference_module_id: (position === "before" || position === "after") ? parseInt(refModuleId, 10) : null,
    });
  };

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
          maxWidth: "520px",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          className="modal-header"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
            + Add / Insert Module in {level?.name || "Curriculum"}
          </h3>
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

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: "20px" }}>
            {error && (
              <div
                className="alert alert-error"
                style={{
                  marginBottom: "14px",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  color: "#b91c1c",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                Module Name <span style={{ color: "var(--status-error)" }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Executive Search & Mapping Strategies"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                required
                style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>?
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                  Estimated Duration (Minutes, Optional)
                </label>
                <input
                  type="number"
                  min="0"
                  max="480"
                  className="form-input"
                  placeholder="e.g. 30 (optional)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
                />
              </div>
            </div>

            {/* Insertion Position Controls */}
            <div
              style={{
                padding: "12px 14px",
                backgroundColor: "var(--bg-secondary, #f8fafc)",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                marginBottom: "14px",
              }}
            >
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "8px", color: "var(--text-main)" }}>
                Insert Position in {level?.name || "Level"}
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="position"
                    value="beginning"
                    checked={position === "beginning"}
                    onChange={(e) => setPosition(e.target.value)}
                  />
                  <span>At Beginning of Level</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="position"
                    value="end"
                    checked={position === "end"}
                    onChange={(e) => setPosition(e.target.value)}
                  />
                  <span>At End of Level</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="position"
                    value="before"
                    checked={position === "before"}
                    onChange={(e) => setPosition(e.target.value)}
                    disabled={levelModules.length === 0}
                  />
                  <span>Before an existing module</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="position"
                    value="after"
                    checked={position === "after"}
                    onChange={(e) => setPosition(e.target.value)}
                    disabled={levelModules.length === 0}
                  />
                  <span>After an existing module</span>
                </label>
              </div>

              {(position === "before" || position === "after") && levelModules.length > 0 && (
                <div style={{ marginTop: "8px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "600", marginBottom: "4px", color: "var(--text-secondary)" }}>
                    Reference Module:
                  </label>
                  <select
                    className="form-input"
                    value={refModuleId}
                    onChange={(e) => setRefModuleId(e.target.value)}
                    style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                  >
                    {levelModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        Module #{m.order}: {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                Status
              </label>
              <select
                className="form-input"
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
              >
                <option value="DRAFT">DRAFT (Recommended while authoring)</option>
                <option value="PUBLISHED">PUBLISHED (Immediately accessible to enrolled learners)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                Description (Optional)
              </label>
              <textarea
                className="form-input"
                rows="2"
                placeholder="Brief summary of learning goals covered in this module..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", fontSize: "13px" }}
              />
            </div>
          </div>

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
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ padding: "6px 18px", fontSize: "13px" }}
            >
              {submitting ? "Inserting Module..." : "Insert Module"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

