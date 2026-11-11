import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../../services/api";

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
}) {
  // Source mode: 'repository' (select existing) vs 'upload' (upload from PC)
  const [sourceMode, setSourceMode] = useState("repository");
  const [selectedFileId, setSelectedFileId] = useState(initialFile?.id || "");

  // Upload new file state
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadedFileRecord, setUploadedFileRecord] = useState(null);
  const fileInputRef = useRef(null);

  const [clusterId, setClusterId] = useState(initialCluster?.id || (clusters.length > 0 ? clusters[0].id : ""));
  const [moduleId, setModuleId] = useState(initialModule?.id || (initialSubmodule?.module || ""));
  const [submoduleId, setSubmoduleId] = useState(initialSubmodule?.id || "");
  const [category, setCategory] = useState("PRIMARY_INSTRUCTIONAL");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittingStep, setSubmittingStep] = useState(""); // "uploading" | "attaching"
  const [error, setError] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  useEffect(() => {
    if (show) {
      setSourceMode("repository");
      setSelectedFileId(initialFile?.id || "");
      setFileToUpload(null);
      setUploadedFileRecord(null);
      setClusterId(initialCluster?.id || (clusters.length > 0 ? clusters[0].id : ""));
      setModuleId(initialModule?.id || (initialSubmodule?.module || ""));
      setSubmoduleId(initialSubmodule?.id || "");
      setCategory("PRIMARY_INSTRUCTIONAL");
      setNotes("");
      setError(null);
      setSuccessInfo(null);
      setSubmittingStep("");
    }
  }, [show, initialFile, initialSubmodule, initialModule, initialCluster, clusters]);

  if (!show) return null;

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

    if (!clusterId) {
      setError("Please select a target topic cluster.");
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
        cluster: parseInt(clusterId, 10),
        module: moduleId ? parseInt(moduleId, 10) : null,
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
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-container" style={{ maxWidth: "580px", width: "100%" }}>
        <div className="modal-header">
          <h3 className="modal-title">
            Attach Training Material {initialSubmodule ? `to Lesson #${initialSubmodule.order}: ${initialSubmodule.name}` : ""}
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

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
                    <span>⬆ Upload New from Computer</span>
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
                  <div className="card" style={{ padding: "10px 14px", backgroundColor: "var(--bg-surface)", fontSize: "13px" }}>
                    <strong>{initialFile.filename}</strong>
                    <span style={{ marginLeft: "8px", color: "var(--text-secondary)", fontSize: "11px" }}>
                      ({initialFile.file_type} • {initialFile.relative_path})
                    </span>
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

            {/* Target Topic Cluster */}
            <div className="form-group">
              <label className="form-label">
                Topic Cluster <span style={{ color: "var(--status-error)" }}>*</span>
              </label>
              <select
                className="form-input"
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
                required
              >
                <option value="">-- Select Target Cluster --</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}: {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Module */}
            <div className="form-group">
              <label className="form-label">Associated Module</label>
              <select
                className="form-input"
                value={moduleId}
                onChange={(e) => {
                  setModuleId(e.target.value);
                  setSubmoduleId("");
                }}
              >
                <option value="">-- None (Cluster-level material) --</option>
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
    </div>
  );
}


