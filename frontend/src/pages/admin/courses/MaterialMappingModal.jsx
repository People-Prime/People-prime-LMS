import { useState, useEffect, useRef } from "react";
import { apiClient, getTrainingFileDownloadUrl } from "../../../services/api";
import SecurePdfViewer from "../../../components/common/SecurePdfViewer";

const CATEGORY_OPTIONS = [
  { value: "PRIMARY_INSTRUCTIONAL", label: "Primary Instructional" },
  { value: "SUPPLEMENTARY_REFERENCE", label: "Supplementary Reference" },
  { value: "DOWNLOADABLE_PDF", label: "Downloadable PDF" },
  { value: "IMAGE_INFOGRAPHIC", label: "Image / Infographic" },
  { value: "ASSESSMENT_RUBRIC", label: "Assessment / Rubric" },
  { value: "PRACTICAL_EXERCISE", label: "Practical Exercise" },
  { value: "UNCLASSIFIED", label: "Unclassified" },
];

export default function MaterialMappingModal({
  show,
  onClose,
  initialFile = null,
  initialSubmodule = null,
  initialModule = null,
  initialCluster = null,
  clusters = [],
  modules = [],
  submodules = [],
  files = [],
  onMappingSaved,
  initialShowPreview = false,
}) {
  // Source mode: 'repository' (select existing) vs 'upload' (upload from PC)
  const [sourceMode, setSourceMode] = useState("repository");
  const [selectedFileId, setSelectedFileId] = useState(initialFile?.id || "");

  // Upload new file state
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadedFileRecord, setUploadedFileRecord] = useState(null);
  const fileInputRef = useRef(null);

  const [moduleId, setModuleId] = useState(initialModule?.id || (initialSubmodule?.module || ""));
  const [submoduleId, setSubmoduleId] = useState(initialSubmodule?.id || "");
  const [category, setCategory] = useState("PRIMARY_INSTRUCTIONAL");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittingStep, setSubmittingStep] = useState(""); // "uploading" | "attaching"
  const [error, setError] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);
  const [showInlinePreview, setShowInlinePreview] = useState(Boolean(initialShowPreview));

  useEffect(() => {
    if (show) {
      setSourceMode("repository");
      setSelectedFileId(initialFile?.id || "");
      setFileToUpload(null);
      setUploadedFileRecord(null);
      setModuleId(initialModule?.id || (initialSubmodule?.module || ""));
      setSubmoduleId(initialSubmodule?.id || "");
      setCategory("PRIMARY_INSTRUCTIONAL");
      setNotes("");
      setError(null);
      setSuccessInfo(null);
      setSubmittingStep("");
      setShowInlinePreview(Boolean(initialShowPreview));
    }
  }, [show, initialFile, initialSubmodule, initialModule, initialShowPreview]);

  if (!show) return null;

  // Resolved active file for preview
  const activeFile =
    initialFile ||
    (selectedFileId ? files.find((f) => String(f.id) === String(selectedFileId)) : null) ||
    uploadedFileRecord;

  const activeFileType = (activeFile?.file_type || (fileToUpload?.name ? fileToUpload.name.split(".").pop() : "") || "").toUpperCase();
  const activeFileDownloadUrl = activeFile?.id ? getTrainingFileDownloadUrl(activeFile.id) : null;
  const isDirectPreviewable = ["PDF", "DOCX", "DOC", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(activeFileType);
  const activePreviewUrl = isDirectPreviewable && activeFileDownloadUrl
    ? (["PDF", "DOCX", "DOC"].includes(activeFileType)
        ? `${activeFileDownloadUrl}#toolbar=0&navpanes=0&scrollbar=1`
        : activeFileDownloadUrl)
    : null;

  // Filter modules to current cluster if cluster has an associated course, or show all
  const filteredModules = modules;
  const filteredSubmodules = moduleId
    ? submodules.filter((s) => s.module === parseInt(moduleId, 10))
    : submodules;

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const f = e.target.files[0];
      setFileToUpload(f);
      setUploadedFileRecord(null);
      setError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    if (!moduleId) {
      setError("Please select an associated module.");
      return;
    }

    let targetFileId = selectedFileId;

    setSubmitting(true);

    try {
      // Step 1: If in upload mode and a new file is chosen, upload it first (unless already uploaded in prior attempt)
      if (sourceMode === "upload") {
        if (uploadedFileRecord && uploadedFileRecord.id) {
          // Reuse already-uploaded file from previous attempt to avoid creating duplicate
          targetFileId = uploadedFileRecord.id;
        } else {
          if (!fileToUpload) {
            setError("Please select a local file to upload from your computer.");
            setSubmitting(false);
            return;
          }

          setSubmittingStep("uploading");
          const formData = new FormData();
          formData.append("files", fileToUpload);
          formData.append("relative_paths", fileToUpload.name);

          let uploadRes;
          try {
            uploadRes = await apiClient("/admin/training-files/upload/", {
              method: "POST",
              body: formData,
            });
          } catch (uploadErr) {
            setError(`File upload failed: ${uploadErr.message || "Unable to upload file to repository."}`);
            setSubmitting(false);
            setSubmittingStep("");
            return;
          }

          // Inspect upload response
          let resolvedFile = null;
          if (uploadRes && Array.isArray(uploadRes.created) && uploadRes.created.length > 0) {
            resolvedFile = uploadRes.created[0];
          } else if (uploadRes && Array.isArray(uploadRes.skipped) && uploadRes.skipped.length > 0) {
            const skipped = uploadRes.skipped[0];
            resolvedFile = { id: skipped.existing_id, filename: skipped.filename };
          } else if (uploadRes && uploadRes.failed && uploadRes.failed.length > 0) {
            const failedReason = uploadRes.failed[0]?.error || "File validation failed.";
            setError(`Upload rejected: ${failedReason}`);
            setSubmitting(false);
            setSubmittingStep("");
            return;
          }

          if (!resolvedFile || !resolvedFile.id) {
            setError("Upload failed: No file record was returned by the server.");
            setSubmitting(false);
            setSubmittingStep("");
            return;
          }

          setUploadedFileRecord(resolvedFile);
          targetFileId = resolvedFile.id;
        }
      }

      if (!targetFileId) {
        setError("Please choose or upload a training material before attaching.");
        setSubmitting(false);
        setSubmittingStep("");
        return;
      }

      // Step 2: Create TrainingFileMapping
      setSubmittingStep("attaching");
      const payload = {
        file_id: parseInt(targetFileId, 10),
        module: parseInt(moduleId, 10),
        submodule: submoduleId ? parseInt(submoduleId, 10) : null,
        category,
        notes: notes.trim(),
      };

      let mappingResult;
      try {
        mappingResult = await apiClient("/admin/training-file-mappings/", {
          method: "POST",
          body: payload,
        });
      } catch (mapErr) {
        // If file was successfully uploaded but mapping failed
        if (sourceMode === "upload") {
          setError(
            `File was saved to the repository (ID: ${targetFileId}), but attaching it to the curriculum failed: ${
              mapErr.message || "Invalid mapping."
            }. You can retry attaching now without re-uploading.`
          );
        } else {
          setError(mapErr.message || "Failed to attach training material.");
        }
        setSubmitting(false);
        setSubmittingStep("");
        return;
      }

      if (onMappingSaved) {
        onMappingSaved(mappingResult);
      }
      onClose();
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
      setSubmittingStep("");
    }
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
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "20px",
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
          width: showInlinePreview ? "92vw" : "85vw",
          maxWidth: showInlinePreview ? "1200px" : "820px",
          height: "85vh",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--bg-card, #ffffff)",
          borderRadius: "8px",
          boxShadow: "0 20px 25px rgba(0, 0, 0, 0.4)",
          border: "1px solid var(--border-color, #e2e8f0)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
            backgroundColor: "var(--bg-secondary, #f8fafc)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
            <span style={{ fontSize: "18px" }}>📎</span>
            <h3
              className="modal-title"
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "700",
                color: "var(--text-main, #0f172a)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Attach Training Material {initialSubmodule ? `to Lesson #${initialSubmodule.order}: ${initialSubmodule.name}` : ""}
            </h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            {activeFile && (
              <button
                type="button"
                className={`btn ${showInlinePreview ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setShowInlinePreview((prev) => !prev)}
                style={{ padding: "4px 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                title={showInlinePreview ? "Hide Preview panel" : "Show Side-by-side Material Preview"}
              >
                <span>{showInlinePreview ? "👁️ Hide Preview" : "👁️ Preview Material"}</span>
              </button>
            )}
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              disabled={submitting}
              style={{
                background: "none",
                border: "none",
                fontSize: "22px",
                cursor: submitting ? "not-allowed" : "pointer",
                color: "var(--text-secondary, #64748b)",
                lineHeight: 1,
                padding: "2px 6px",
              }}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Main Form Column */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              minWidth: "360px",
              borderRight: showInlinePreview ? "1px solid var(--border-color, #e2e8f0)" : "none",
            }}
          >
            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
              }}
            >
              <div
                className="modal-body"
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {error && (
                  <div className="alert alert-error" role="status">
                    {error}
                  </div>
                )}
                {successInfo && (
                  <div className="alert alert-success" role="status">
                    {successInfo}
                  </div>
                )}

                {/* Source Selection Mode (Existing Repository vs Upload from Computer) */}
                {!initialFile && (
                  <div className="form-group" style={{ marginBottom: "6px" }}>
                    <label className="form-label" style={{ fontWeight: "600", marginBottom: "8px" }}>
                      Material Source
                    </label>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        className={`btn ${sourceMode === "repository" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => {
                          setSourceMode("repository");
                          setError(null);
                        }}
                        style={{ flex: 1, fontSize: "12px", padding: "8px 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                        disabled={submitting}
                      >
                        <span>📚 Select from Repository</span>
                      </button>
                      <button
                        type="button"
                        className={`btn ${sourceMode === "upload" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => {
                          setSourceMode("upload");
                          setError(null);
                        }}
                        style={{ flex: 1, fontSize: "12px", padding: "8px 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                        disabled={submitting}
                      >
                        <span>📤 Upload New Local File</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Mode 1: File Selection from Repository */}
                {sourceMode === "repository" && (
                  <div className="form-group">
                    <label className="form-label">
                      Select Training Material <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    {initialFile ? (
                      <div className="card" style={{ padding: "12px 14px", backgroundColor: "var(--bg-surface)", fontSize: "13px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                          <div>
                            <strong>{initialFile.filename}</strong>
                            <span style={{ marginLeft: "8px", color: "var(--text-secondary)", fontSize: "11px" }}>
                              ({initialFile.file_type} • {initialFile.relative_path || initialFile.filename})
                            </span>
                          </div>
                          {!showInlinePreview && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setShowInlinePreview(true)}
                              style={{ padding: "2px 8px", fontSize: "11px", flexShrink: 0 }}
                            >
                              👁️ Preview
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <select
                        className="form-input"
                        value={selectedFileId}
                        onChange={(e) => setSelectedFileId(e.target.value)}
                        required={sourceMode === "repository"}
                      >
                        <option value="">-- Choose file from Training Repository ({files.length} available) --</option>
                        {files.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.filename} [{f.file_type}]
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Mode 2: Upload New Local File */}
                {sourceMode === "upload" && !initialFile && (
                  <div className="form-group">
                    <label className="form-label">
                      Local File to Ingest &amp; Attach <span style={{ color: "var(--status-error)" }}>*</span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="form-input"
                      onChange={handleFileChange}
                      disabled={submitting}
                      style={{ padding: "8px", fontSize: "12px" }}
                      required={sourceMode === "upload" && !uploadedFileRecord}
                    />
                    {fileToUpload && (
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="badge badge-info" style={{ fontSize: "10px" }}>
                          {fileToUpload.name.split(".").pop().toUpperCase()}
                        </span>
                        <strong>{fileToUpload.name}</strong>
                        <span>({formatFileSize(fileToUpload.size)})</span>
                      </div>
                    )}
                    {uploadedFileRecord && (
                      <div style={{ marginTop: "6px" }}>
                        <span className="badge badge-success" style={{ fontSize: "11px" }}>
                          ✓ File stored in repository (ID: {uploadedFileRecord.id})
                        </span>
                      </div>
                    )}
                    <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--text-secondary)" }}>
                      Supported formats: PDF, DOCX, DOC, PPTX, XLSX, TXT, PNG, JPG, MP4, ZIP (Max 100 MB).
                    </p>
                  </div>
                )}

                {/* Target Module */}
                <div className="form-group">
                  <label className="form-label">
                    Associated Module <span style={{ color: "var(--status-error)" }}>*</span>
                  </label>
                  <select
                    className="form-input"
                    value={moduleId}
                    onChange={(e) => {
                      setModuleId(e.target.value);
                      setSubmoduleId("");
                    }}
                    required
                  >
                    <option value="">-- Select Module --</option>
                    {filteredModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        Module #{m.order || m.id}: {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Submodule / Lesson */}
                <div className="form-group">
                  <label className="form-label">Specific Lesson (Submodule)</label>
                  <select
                    className="form-input"
                    value={submoduleId}
                    onChange={(e) => setSubmoduleId(e.target.value)}
                    disabled={!moduleId}
                  >
                    <option value="">-- Attach to entire module --</option>
                    {filteredSubmodules.map((s) => (
                      <option key={s.id} value={s.id}>
                        Lesson #{s.order}: {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div className="form-group">
                  <label className="form-label">Instructional Category</label>
                  <select
                    className="form-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mapping Notes */}
                <div className="form-group">
                  <label className="form-label">Mapping Notes / Usage Guidance</label>
                  <textarea
                    className="form-input"
                    rows="2"
                    placeholder="Optional notes on how this document should be studied or referenced in this lesson..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div
                className="modal-footer"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  padding: "14px 20px",
                  borderTop: "1px solid var(--border-color, #e2e8f0)",
                  backgroundColor: "var(--bg-secondary, #f8fafc)",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting
                    ? submittingStep === "uploading"
                      ? "Uploading to Library..."
                      : "Attaching Material..."
                    : sourceMode === "upload"
                    ? "Upload & Attach Material"
                    : "Confirm & Attach Material"}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Inline Material Content Preview */}
          {showInlinePreview && (
            <div
              style={{
                flex: 1.2,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                minWidth: "380px",
                backgroundColor: "var(--bg-primary, #f1f5f9)",
              }}
            >
              <div
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border-color, #e2e8f0)",
                  backgroundColor: "var(--bg-card, #ffffff)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                  <span className="badge badge-primary" style={{ fontSize: "10px" }}>{activeFileType || "FILE"}</span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-main, #0f172a)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {activeFile?.filename || fileToUpload?.name || "Material Preview"}
                  </span>
                </div>
                {activeFileDownloadUrl && !["ZIP", "RAR", "7Z"].includes(activeFileType) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      window.open(
                        `/viewer?fileId=${activeFile?.id || ""}&title=${encodeURIComponent(
                          activeFile?.filename || "Material"
                        )}`,
                        "_blank"
                      )
                    }
                    style={{ padding: "2px 8px", fontSize: "11px" }}
                  >
                    Open New Tab
                  </button>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  padding: "0",
                  overflow: "hidden",
                }}
              >
                {!activeFile && !fileToUpload ? (
                  <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "20px" }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
                    <p style={{ margin: 0, fontSize: "13px" }}>Select a material from the left to preview its content.</p>
                  </div>
                ) : !activeFileDownloadUrl ? (
                  <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: "20px" }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>📤</div>
                    <p style={{ margin: "0 0 4px 0", fontSize: "13px", fontWeight: "600" }}>Local File Selected</p>
                    <p style={{ margin: 0, fontSize: "12px" }}>
                      Preview will be available once uploaded and attached to the repository.
                    </p>
                  </div>
                ) : !isDirectPreviewable ? (
                  <div style={{ textAlign: "center", maxWidth: "360px", padding: "20px" }}>
                    <div style={{ fontSize: "36px", marginBottom: "8px" }}>📄</div>
                    <h5 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
                      Preview Unavailable for this Format
                    </h5>
                    <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                      Direct inline preview is not supported for <strong>{activeFileType}</strong> documents.
                    </p>
                  </div>
                ) : ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(activeFileType) ? (
                  <img
                    src={activeFileDownloadUrl}
                    alt={activeFile?.filename}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "4px" }}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                ) : (
                  <SecurePdfViewer url={activeFileDownloadUrl} title={activeFile?.filename} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
