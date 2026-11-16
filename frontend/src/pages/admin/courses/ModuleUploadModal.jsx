import React, { useState } from "react";

/**
 * ModuleUploadModal Component
 * Allows Admin to directly upload learning materials (PDF, PPT, DOC, video, audio, etc.)
 * directly into a selected Module and optionally a Submodule.
 */
export default function ModuleUploadModal({
  show,
  module,
  submodules = [],
  submitting,
  onClose,
  onUpload,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedSubmoduleId, setSelectedSubmoduleId] = useState("");
  const [category, setCategory] = useState("PRIMARY_READING");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);

  if (!show || !module) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (selectedSubmoduleId) {
      formData.append("submodule_id", selectedSubmoduleId);
    }
    formData.append("category", category);
    if (notes.trim()) {
      formData.append("notes", notes.trim());
    }

    onUpload(module.id, formData);
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
            backgroundColor: "var(--bg-secondary, #f8fafc)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "18px" }}>📤</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                Upload Content to Module
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                {module.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={submitting}
            style={{ fontSize: "18px", border: "none", background: "none", cursor: "pointer" }}
          >
            &times;
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {error && (
              <div className="alert alert-error" style={{ fontSize: "12px", padding: "8px 12px" }}>
                {error}
              </div>
            )}

            {/* File Picker */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: "600", fontSize: "13px" }}>
                Select File <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="file"
                className="form-input"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] || null);
                  setError(null);
                }}
                disabled={submitting}
                required
                style={{ padding: "8px" }}
              />
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
                Supports PDF, Word, PowerPoint, Text, HTML, Video, Audio. Physical files are SHA-256 deduplicated.
              </span>
            </div>

            {/* Submodule Target (Optional) */}
            {submodules.length > 0 && (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: "600", fontSize: "13px" }}>
                  Attach to Submodule (Optional)
                </label>
                <select
                  className="form-input"
                  value={selectedSubmoduleId}
                  onChange={(e) => setSelectedSubmoduleId(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Attach directly to Module root</option>
                  {submodules.map((sm) => (
                    <option key={sm.id} value={sm.id}>
                      {sm.order}. {sm.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Material Category */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: "600", fontSize: "13px" }}>
                Material Category
              </label>
              <select
                className="form-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
              >
                <option value="PRIMARY_READING">Primary Reading</option>
                <option value="SLIDES">Slides / Presentation</option>
                <option value="HANDOUT">Handout / Reference</option>
                <option value="ASSIGNMENT">Assignment / Task Sheet</option>
                <option value="VIDEO">Video Lecture</option>
                <option value="SUPPLEMENTARY">Supplementary Material</option>
              </select>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: "600", fontSize: "13px" }}>
                Notes / Description (Optional)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Brief note about this material..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
              />
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
              backgroundColor: "var(--bg-secondary, #f8fafc)",
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
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !selectedFile}
              style={{
                padding: "8px 18px",
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {submitting ? "Uploading..." : "Upload Material"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

