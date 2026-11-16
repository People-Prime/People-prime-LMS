import { useState, useRef, useMemo } from "react";
import { apiClient, getTrainingFileDownloadUrl } from "../../../services/api";
import ActionMenu from "../../../components/common/ActionMenu";
import SecurePdfViewer from "../../../components/common/SecurePdfViewer";

export default function MaterialRepositoryView({
  selectedCourse,
  files = [],
  mappings = [],
  clusters = [],
  modules = [],
  courses = [],
  onDataRefresh,
  onOpenAttachModal,
  onBackToCatalog,
  onOpenPreviewCourseModal,
}) {
  const [subView, setSubView] = useState(selectedCourse ? "course-files" : "all-files"); // 'course-files' | 'unassigned' | 'all-files'
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [uploadResults, setUploadResults] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Preview overlay state
  const [previewingFile, setPreviewingFile] = useState(null);

  // Deletion modal state
  const [deletingFile, setDeletingFile] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // File mapping counts
  const fileMappingsCount = useMemo(() => {
    const counts = {};
    mappings.forEach((m) => {
      const fid = m.training_file_id || m.file_id || m.training_file;
      if (fid) {
        counts[fid] = (counts[fid] || 0) + 1;
      }
    });
    return counts;
  }, [mappings]);

  // Unassigned / Staging Files (0 mappings or Cluster 9)
  const unassignedFiles = useMemo(() => {
    const cluster9Id = clusters.find((c) => c.code === "CLUSTER-9")?.id;
    return files.filter((f) => {
      const count = fileMappingsCount[f.id] || 0;
      const isCluster9 = mappings.some(
        (m) => (m.training_file_id || m.file_id || m.training_file) === f.id && m.cluster === cluster9Id
      );
      return count === 0 || isCluster9;
    });
  }, [files, fileMappingsCount, mappings, clusters]);

  // Files mapped to the selected course
  const courseFiles = useMemo(() => {
    if (!selectedCourse) return files;
    const courseClusterIds = clusters
      .filter((c) => !c.course || c.course === selectedCourse.id)
      .map((c) => c.id);
    const courseFileIds = new Set(
      mappings
        .filter((m) => courseClusterIds.includes(m.cluster))
        .map((m) => m.training_file_id || m.file_id || m.training_file)
        .filter(Boolean)
    );
    return files.filter((f) => courseFileIds.has(f.id));
  }, [files, mappings, clusters, selectedCourse]);

  // Current display files based on subView
  const currentFilesList = useMemo(() => {
    let baseList = files;
    if (subView === "course-files") baseList = courseFiles;
    else if (subView === "unassigned") baseList = unassignedFiles;
    else if (subView === "all-files") baseList = files;

    return baseList.filter((f) => {
      const matchesSearch =
        !searchQuery.trim() ||
        f.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.relative_path && f.relative_path.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = typeFilter === "ALL" || f.file_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [subView, courseFiles, unassignedFiles, files, searchQuery, typeFilter]);

  // File Preview Handler
  const handlePreviewFile = (file) => {
    const fileType = (file.file_type || "").toUpperCase();
    const downloadUrl = getTrainingFileDownloadUrl(file.id);
    const isDirectPreviewable = ["PDF", "DOCX", "DOC", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(fileType);

    if (isDirectPreviewable) {
      setPreviewingFile({
        id: file.id,
        filename: file.filename,
        fileType,
        url: downloadUrl,
      });
    } else {
      setPreviewingFile({
        id: file.id,
        filename: file.filename,
        fileType,
        unsupported: true,
      });
    }
  };

  // Safe File Deletion Handler
  const handleConfirmDelete = async () => {
    if (!deletingFile) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await apiClient(`/admin/training-files/${deletingFile.file.id}/`, {
        method: "DELETE",
      });

      setSuccessMessage(
        `Training file "${deletingFile.file.filename}" successfully deleted.`
      );
      setDeletingFile(null);
      if (onDataRefresh) {
        await onDataRefresh();
      }
    } catch (err) {
      setDeleteError(err.message || "Failed to delete repository file.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Batch upload logic (batches of 15)
  const processUploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccessMessage("");
    setUploadResults(null);

    const totalFiles = fileList.length;
    let uploadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const allCreated = [];
    const allSkipped = [];
    const allFailed = [];

    const BATCH_SIZE = 15;
    const chunks = [];
    for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
      chunks.push(fileList.slice(i, i + BATCH_SIZE));
    }

    try {
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        const formData = new FormData();

        chunk.forEach((f) => {
          formData.append("files", f);
          const relPath = f.webkitRelativePath || f.name;
          formData.append("relative_paths", relPath);
        });

        setUploadStatusText(
          `Uploading batch ${cIdx + 1} of ${chunks.length} (${Math.min(
            (cIdx + 1) * BATCH_SIZE,
            totalFiles
          )} / ${totalFiles} files)...`
        );

        try {
          const res = await apiClient("/admin/training-files/upload/", {
            method: "POST",
            body: formData,
          });

          if (res) {
            uploadedCount += res.created_count || 0;
            skippedCount += res.skipped_count || 0;
            failedCount += res.failed_count || 0;
            if (Array.isArray(res.created)) allCreated.push(...res.created);
            if (Array.isArray(res.skipped)) allSkipped.push(...res.skipped);
            if (Array.isArray(res.failed)) allFailed.push(...res.failed);
          }
        } catch (batchErr) {
          chunk.forEach((f) => {
            allFailed.push({ filename: f.name, error: batchErr.message });
            failedCount++;
          });
        }

        const pct = Math.round(((cIdx + 1) / chunks.length) * 100);
        setUploadProgress(pct);
      }

      setUploadResults({
        created: allCreated,
        skipped: allSkipped,
        failed: allFailed,
        uploadedCount,
        skippedCount,
        failedCount,
      });

      if (uploadedCount > 0) {
        setSuccessMessage(`Successfully uploaded ${uploadedCount} file(s). Files are placed in library.`);
      }

      if (onDataRefresh) {
        await onDataRefresh();
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred during file upload.");
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
      setUploadStatusText("");
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div>
      {/* Global Mode Back Button */}
      {!selectedCourse && onBackToCatalog && (
        <div style={{ marginBottom: "14px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBackToCatalog}
            style={{ padding: "4px 10px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            &larr; Back to Course Catalog
          </button>
        </div>
      )}

      {/* Upload & Actions Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          {selectedCourse && (
            <button
              type="button"
              className={`btn ${subView === "course-files" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setSubView("course-files")}
              style={{ fontSize: "12px", padding: "6px 12px" }}
            >
              Course Materials ({courseFiles.length})
            </button>
          )}
          <button
            type="button"
            className={`btn ${subView === "all-files" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSubView("all-files")}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            All System Files ({files.length})
          </button>
          <button
            type="button"
            className={`btn ${subView === "unassigned" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSubView("unassigned")}
            style={{ fontSize: "12px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <span>Unassigned & Staging</span>
            {unassignedFiles.length > 0 && (
              <span className="badge badge-warning" style={{ fontSize: "10px" }}>
                {unassignedFiles.length}
              </span>
            )}
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input
            ref={folderInputRef}
            type="file"
            webkitdirectory="true"
            directory="true"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                processUploadFiles(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={isUploading}
            onClick={() => folderInputRef.current && folderInputRef.current.click()}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            Upload Training Batch (Folder)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                processUploadFiles(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isUploading}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{ fontSize: "12px", padding: "6px 12px" }}
          >
            Upload Single Files
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: "14px" }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: "14px" }}>
          {successMessage}
        </div>
      )}

      {/* Upload Progress Bar */}
      {isUploading && (
        <div className="card" style={{ marginBottom: "16px", padding: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px" }}>
            <span style={{ fontWeight: "600", color: "var(--text-main)" }}>Uploading Materials Batch</span>
            <span style={{ color: "var(--accent-primary)", fontWeight: "600" }}>{uploadProgress}%</span>
          </div>
          <div style={{ width: "100%", height: "6px", backgroundColor: "var(--border-color)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${uploadProgress}%`, height: "100%", backgroundColor: "var(--accent-primary)", transition: "width 0.2s ease" }} />
          </div>
          {uploadStatusText && (
            <p style={{ margin: "6px 0 0 0", fontSize: "11px", color: "var(--text-secondary)" }}>
              {uploadStatusText}
            </p>
          )}
        </div>
      )}

      {/* Batch Summary Report */}
      {uploadResults && (
        <div className="card" style={{ marginBottom: "16px", borderLeft: "4px solid var(--accent-primary)", padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "700" }}>Batch Processing Summary</h4>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "1px 6px", fontSize: "10px" }}
              onClick={() => setUploadResults(null)}
            >
              Dismiss
            </button>
          </div>
          <div style={{ display: "flex", gap: "20px", fontSize: "12px" }}>
            <span style={{ color: "var(--text-success, #10b981)" }}>
              <strong>{uploadResults.uploadedCount}</strong> Uploaded
            </span>
            <span style={{ color: "var(--text-warning, #f59e0b)" }}>
              <strong>{uploadResults.skippedCount}</strong> Duplicate(s) Skipped
            </span>
            <span style={{ color: "var(--text-danger, #ef4444)" }}>
              <strong>{uploadResults.failedCount}</strong> Failed
            </span>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div
        className="card"
        style={{
          marginBottom: "16px",
          padding: "12px 14px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search repository files by name or path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "6px 12px", fontSize: "13px" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Format:</span>
          {["ALL", "DOCX", "PDF", "PNG"].map((t) => (
            <button
              key={t}
              type="button"
              className={`btn ${typeFilter === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTypeFilter(t)}
              style={{ fontSize: "11px", padding: "3px 8px" }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Files Grid / Table */}
      <div className="card">
        <h3 className="card-title">
          <span>
            {subView === "course-files"
              ? "Course Attached Materials"
              : subView === "unassigned"
              ? "Unassigned & Incoming Staging Library"
              : "Universal Training Repository"}
          </span>
          <span className="badge badge-purple">{currentFilesList.length} Files</span>
        </h3>

        {currentFilesList.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <div style={{ marginBottom: "12px", color: "var(--text-secondary)" }}>
              <svg width="36" height="36" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: "0 auto", opacity: 0.6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p style={{ color: "var(--text-main)", fontSize: "14px", fontWeight: "600", margin: "0 0 6px 0" }}>
              No Training Materials Available
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "12px", maxWidth: "480px", margin: "0 auto 16px auto", lineHeight: "1.5" }}>
              {searchQuery || typeFilter !== "ALL"
                ? "No training files match the current search or format filters. Clear filters to view all materials."
                : "No files have been added to this view yet. Use the upload buttons above to add single files or entire batch folders from your computer."}
            </p>
            <div style={{ display: "inline-flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isUploading}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                style={{ fontSize: "12px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>Upload Single Files</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isUploading}
                onClick={() => folderInputRef.current && folderInputRef.current.click()}
                style={{ fontSize: "12px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>Upload Training Batch (Folder)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Filename</th>
                  <th>Relative Path</th>
                  <th>Size</th>
                  <th>Mappings</th>
                  <th style={{ width: "240px", minWidth: "240px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentFilesList.map((f) => {
                  const mCount = fileMappingsCount[f.id] || 0;

                  // Find courses linked to this file via its mappings
                  const fileSpecificMappings = mappings.filter(
                    (m) => (m.training_file_id || m.file_id || m.training_file) === f.id
                  );
                  const linkedCourseIds = new Set();
                  fileSpecificMappings.forEach((m) => {
                    if (m.cluster) {
                      const cl = clusters.find((c) => c.id === m.cluster);
                      if (cl?.course) linkedCourseIds.add(cl.course);
                    }
                    if (m.module) {
                      const md = modules.find((mod) => mod.id === m.module);
                      if (md?.course) linkedCourseIds.add(md.course);
                    }
                  });
                  const linkedCourses = courses.filter((c) => linkedCourseIds.has(c.id));

                  return (
                    <tr key={f.id}>
                      <td>
                        <span
                          className={`badge ${
                            f.file_type === "PDF"
                              ? "badge-danger"
                              : f.file_type === "DOCX"
                              ? "badge-primary"
                              : "badge-secondary"
                          }`}
                          style={{ fontSize: "10px" }}
                        >
                          {f.file_type}
                        </span>
                      </td>
                      <td>
                        <strong>{f.filename}</strong>
                      </td>
                      <td style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                        {f.relative_path || "—"}
                      </td>
                      <td style={{ fontSize: "12px" }}>{formatFileSize(f.file_size)}</td>
                      <td>
                        <span className={`badge ${mCount > 0 ? "badge-info" : "badge-warning"}`} style={{ fontSize: "11px" }}>
                          {mCount} {mCount === 1 ? "Mapping" : "Mappings"}
                        </span>
                      </td>
                      <td style={{ width: "240px", minWidth: "240px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end", flexWrap: "nowrap", flexShrink: 0 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => onOpenAttachModal({ file: f })}
                            style={{ padding: "3px 8px", fontSize: "11px" }}
                            title="Attach to a topic cluster, module, or lesson"
                          >
                            + Attach
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handlePreviewFile(f)}
                            style={{ padding: "3px 8px", fontSize: "11px" }}
                          >
                            Preview
                          </button>
                          <ActionMenu
                            align="right"
                            actions={[
                              {
                                label: "Preview",
                                icon: (
                                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                ),
                                onClick: () => handlePreviewFile(f),
                                title: ["PDF", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes((f.file_type || "").toUpperCase())
                                  ? "Preview file directly"
                                  : "Preview unavailable for this format",
                              },
                              {
                                label: "Attach & Preview",
                                icon: (
                                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                ),
                                onClick: () => onOpenAttachModal({ file: f, initialShowPreview: true }),
                                title: "Attach with side-by-side material preview",
                              },
                              {
                                label: "Attach to Lesson",
                                icon: (
                                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                  </svg>
                                ),
                                onClick: () => onOpenAttachModal({ file: f }),
                                title: "Attach to cluster, module, or lesson",
                              },
                              {
                                label: "Delete File",
                                icon: (
                                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                ),
                                danger: true,
                                onClick: () => {
                                  setDeletingFile({
                                    file: f,
                                    mappings: fileSpecificMappings,
                                    linkedCourses,
                                  });
                                  setDeleteError(null);
                                },
                                title: "Safely delete this training repository file",
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* In-Dialog Material Direct Preview Overlay */}
      {previewingFile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "24px",
          }}
          onClick={() => setPreviewingFile(null)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-card, #ffffff)",
              borderRadius: "8px",
              width: "88vw",
              maxWidth: "1200px",
              height: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 25px rgba(0,0,0,0.4)",
              border: "1px solid var(--border-color, #e2e8f0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border-color, #e2e8f0)",
                backgroundColor: "var(--bg-secondary, #f8fafc)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                <span className="badge badge-primary">{previewingFile.fileType}</span>
                <strong
                  style={{
                    fontSize: "14px",
                    color: "var(--text-main, #0f172a)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {previewingFile.filename}
                </strong>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                {!previewingFile.unsupported && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => window.open(`/viewer?fileId=${previewingFile.id}&title=${encodeURIComponent(previewingFile.filename)}`, "_blank")}
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                  >
                    Open in New Tab
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPreviewingFile(null)}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  &times; Close
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                backgroundColor: "var(--bg-primary, #f1f5f9)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                padding: "0",
              }}
            >
              {previewingFile.unsupported ? (
                <div style={{ textAlign: "center", maxWidth: "420px", padding: "20px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>📄</div>
                  <h4 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
                    Preview Unavailable for this Format
                  </h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>
                    Direct inline preview is not supported for <strong>{previewingFile.fileType}</strong> documents, and downloads are restricted across the LMS.
                  </p>
                </div>
              ) : ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(previewingFile.fileType) ? (
                <img
                  src={previewingFile.url}
                  alt={previewingFile.filename}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  onContextMenu={(e) => e.preventDefault()}
                />
              ) : (
                <SecurePdfViewer url={previewingFile.url} title={previewingFile.filename} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Safe File Deletion Confirmation Modal */}
      {deletingFile && (
        <div
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
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() => !isDeleting && setDeletingFile(null)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-card, #ffffff)",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "520px",
              padding: "24px",
              boxShadow: "0 20px 25px rgba(0,0,0,0.3)",
              border: "1px solid var(--border-color, #e2e8f0)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  color: "#ef4444",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: "20px",
                }}
              >
                ⚠️
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "var(--text-main, #0f172a)", fontWeight: "700" }}>
                  Delete Training File
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary, #64748b)", lineHeight: "1.5" }}>
                  Are you sure you want to permanently delete this file from the training materials repository?
                </p>
              </div>
            </div>

            {/* File Metadata Overview */}
            <div
              style={{
                backgroundColor: "var(--bg-secondary, #f8fafc)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "6px",
                padding: "12px 14px",
                marginBottom: "16px",
                fontSize: "12px",
              }}
            >
              <div style={{ marginBottom: "6px" }}>
                <span style={{ color: "var(--text-secondary, #64748b)" }}>Filename: </span>
                <strong style={{ color: "var(--text-main, #0f172a)" }}>{deletingFile.file.filename}</strong>
              </div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "6px" }}>
                <div>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Format: </span>
                  <span className="badge badge-secondary" style={{ fontSize: "10px" }}>{deletingFile.file.file_type}</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Size: </span>
                  <strong style={{ color: "var(--text-main, #0f172a)" }}>{formatFileSize(deletingFile.file.file_size)}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Mappings: </span>
                  <span className={`badge ${deletingFile.mappings.length > 0 ? "badge-danger" : "badge-info"}`} style={{ fontSize: "10px" }}>
                    {deletingFile.mappings.length} {deletingFile.mappings.length === 1 ? "Mapping" : "Mappings"}
                  </span>
                </div>
              </div>
              {deletingFile.file.relative_path && (
                <div style={{ wordBreak: "break-all" }}>
                  <span style={{ color: "var(--text-secondary, #64748b)" }}>Path: </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-main, #0f172a)" }}>{deletingFile.file.relative_path}</span>
                </div>
              )}
            </div>

            {/* Impact Warning if Mappings Exist */}
            {deletingFile.mappings.length > 0 ? (
              <div
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "6px",
                  padding: "12px 14px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "var(--text-main, #0f172a)",
                }}
              >
                <div style={{ fontWeight: "700", color: "#dc2626", marginBottom: "4px" }}>
                  Active Curriculum Attachments Affected
                </div>
                <div style={{ color: "var(--text-secondary, #64748b)", lineHeight: "1.5", marginBottom: "8px" }}>
                  This file is currently attached to <strong>{deletingFile.mappings.length}</strong> lesson(s) or module(s). Deleting it will permanently detach this material from learner views:
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--text-secondary, #64748b)", maxHeight: "100px", overflowY: "auto" }}>
                  {deletingFile.mappings.slice(0, 5).map((m, idx) => {
                    const cl = clusters.find((c) => c.id === m.cluster);
                    const md = modules.find((mod) => mod.id === m.module);
                    return (
                      <li key={idx} style={{ marginBottom: "2px" }}>
                        {cl?.name || "Cluster"} {md ? `→ ${md.name}` : ""}
                      </li>
                    );
                  })}
                  {deletingFile.mappings.length > 5 && (
                    <li>...and {deletingFile.mappings.length - 5} more attachment(s)</li>
                  )}
                </ul>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  borderRadius: "6px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "var(--text-secondary, #64748b)",
                }}
              >
                This file is unassigned and is not attached to any active course curriculum.
              </div>
            )}

            {deleteError && (
              <div
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid #ef4444",
                  color: "#ef4444",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  marginBottom: "16px",
                  fontSize: "12px",
                }}
              >
                {deleteError}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isDeleting}
                onClick={() => setDeletingFile(null)}
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                style={{ fontSize: "12px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {isDeleting ? "Deleting..." : "Confirm & Delete File"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

