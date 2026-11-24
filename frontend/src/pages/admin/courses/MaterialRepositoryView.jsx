import { useState, useRef, useMemo, useEffect } from "react";
import { apiClient, getTrainingFileDownloadUrl } from "../../../services/api";
import ActionMenu from "../../../components/common/ActionMenu";
import SecurePdfViewer from "../../../components/common/SecurePdfViewer";
import BatchUploadReportModal from "../../../components/common/BatchUploadReportModal";

const UPLOAD_HISTORY_KEY = "lms_admin_upload_batches";

// Operating-system metadata / desktop indexing file matcher
export const isOSMetadataFile = (fileOrPath) => {
  const pathStr = typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.webkitRelativePath || fileOrPath?.name || "";
  if (!pathStr) return false;

  const norm = pathStr.replace(/\\/g, "/").trim();
  const segments = norm.split("/").map((s) => s.trim()).filter(Boolean);

  // Check parent segments (e.g. __MACOSX, .Trash-1000)
  for (const seg of segments) {
    const sLower = seg.toLowerCase();
    if (["__macosx", ".trash", ".trashes", ".fseventsd", ".spotlight-v100"].includes(sLower) || sLower.startsWith(".trash-")) {
      return true;
    }
  }

  // Check filename
  const baseName = segments.length > 0 ? segments[segments.length - 1] : norm;
  const baseLower = baseName.toLowerCase();

  if (["desktop.ini", "thumbs.db", "ehthumbs.db", ".ds_store", ".localized", ".directory"].includes(baseLower) || baseLower.startsWith(".trash-")) {
    return true;
  }

  // AppleDouble metadata (starts with ._)
  if (baseName.startsWith("._")) {
    return true;
  }

  return false;
};

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
  const [showReportModal, setShowReportModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Load persistent upload history
  useEffect(() => {
    try {
      const stored = localStorage.getItem(UPLOAD_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setUploadHistory(parsed.slice(0, 10)); // Keep last 10 batches
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveBatchToHistory = (batchRecord) => {
    try {
      // Do not store circular fileObject in localStorage
      const cleanRecord = {
        ...batchRecord,
        isHistorical: true,
        items: (batchRecord.items || []).map((it) => {
          const { fileObject, ...rest } = it;
          return rest;
        }),
      };
      // Keep state updater pure: execute localStorage side effect outside setter
      try {
        const stored = localStorage.getItem(UPLOAD_HISTORY_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        const existingList = Array.isArray(parsed) ? parsed : [];
        const updatedStorage = [cleanRecord, ...existingList.filter((b) => b.batchId !== cleanRecord.batchId)].slice(0, 10);
        localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(updatedStorage));
      } catch {
        // Ignore localStorage quota/serialization errors
      }

      setUploadHistory((prev) => {
        return [cleanRecord, ...prev.filter((b) => b.batchId !== cleanRecord.batchId)].slice(0, 10);
      });
    } catch {
      // Ignore quota or serializing errors
    }
  };

  // Preview overlay state
  const [previewingFile, setPreviewingFile] = useState(null);

  // Deletion modal state
  const [deletingFile, setDeletingFile] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Bulk Selection state
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteSummary, setBulkDeleteSummary] = useState(null);

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

  // Batch upload logic (batches of 15) with per-file tracking and retry
  const processUploadFiles = async (fileList, existingBatch = null) => {
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccessMessage("");

    const batchId = existingBatch?.batchId || "BATCH-" + Date.now().toString(36).toUpperCase();
    const timestamp = existingBatch?.timestamp || new Date().toISOString();
    const totalFiles = existingBatch ? existingBatch.totalFiles : fileList.length;

    // 1. Separate legitimate training files from operating-system metadata files
    const legitimateFiles = [];
    const osMetadataItems = [];

    if (existingBatch) {
      legitimateFiles.push(...fileList);
    } else {
      fileList.forEach((f, idx) => {
        const clientRelPath = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
        if (isOSMetadataFile(f)) {
          osMetadataItems.push({
            client_id: `meta_${Date.now()}_${idx}`,
            fileObject: null,
            filename: f.name,
            original_filename: f.name,
            relative_path: clientRelPath,
            file_size: f.size,
            status: "IGNORED",
            reason: "Operating-system metadata file automatically excluded.",
            category: "OS_METADATA",
            retry_count: 0,
          });
        } else {
          legitimateFiles.push(f);
        }
      });
    }

    // Map initial items with unique client_id and normalized relative_path
    const trackedItems = existingBatch
      ? [...existingBatch.items]
      : [
          ...legitimateFiles.map((f, idx) => {
            const clientRelPath = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
            return {
              client_id: `file_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
              idx,
              fileObject: f,
              filename: f.name,
              original_filename: f.name,
              relative_path: clientRelPath,
              file_size: f.size,
              status: "PENDING", // 'PENDING' | 'SUCCESS' | 'DUPLICATE' | 'IGNORED' | 'FAILED'
              retry_count: 0,
            };
          }),
          ...osMetadataItems,
        ];

    const BATCH_SIZE = 15;
    const filesToUpload = legitimateFiles;
    const chunks = [];
    for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
      chunks.push(filesToUpload.slice(i, i + BATCH_SIZE));
    }

    try {
      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        const formData = new FormData();

        chunk.forEach((f) => {
          formData.append("files", f);
          const relPath = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
          formData.append("relative_paths", relPath);
        });

        setUploadStatusText(
          `Uploading batch ${cIdx + 1} of ${chunks.length} (${Math.min(
            (cIdx + 1) * BATCH_SIZE,
            filesToUpload.length
          )} / ${filesToUpload.length} files)...`
        );

        // Helper to match response records using normalized relative_path first, then filename disambiguation
        const matchItem = (record, itemsPool) => {
          const recRel = (record.relative_path || "").replace(/\\/g, "/").trim();
          const recName = (record.original_filename || record.filename || "").trim();

          // 1. Exact match on relative_path
          if (recRel) {
            const byPath = itemsPool.find(
              (it) => it.relative_path && it.relative_path.replace(/\\/g, "/").trim() === recRel
            );
            if (byPath) return byPath;
          }

          // 2. Match within the current uploaded chunk by filename
          const byChunkName = itemsPool.find(
            (it) =>
              (it.filename === recName || it.original_filename === recName) &&
              chunk.some((cf) => cf === it.fileObject)
          );
          if (byChunkName) return byChunkName;

          // 3. Fallback match by filename
          return itemsPool.find(
            (it) => it.filename === recName || it.original_filename === recName
          );
        };

        try {
          const res = await apiClient("/admin/training-files/upload/", {
            method: "POST",
            body: formData,
          });

          if (res) {
            // Reconcile created files
            if (Array.isArray(res.created)) {
              res.created.forEach((c) => {
                const target = matchItem(c, trackedItems);
                if (target) {
                  target.status = "SUCCESS";
                  target.id = c.id;
                  target.checksum = c.checksum;
                  if (c.relative_path) target.relative_path = c.relative_path.replace(/\\/g, "/");
                  target.file_size = c.file_size || target.file_size;
                }
              });
            }

            // Reconcile skipped duplicates
            if (Array.isArray(res.skipped)) {
              res.skipped.forEach((s) => {
                const target = matchItem(s, trackedItems);
                if (target) {
                  target.status = "DUPLICATE";
                  target.reason = s.reason;
                  target.existing_id = s.existing_id;
                  if (s.relative_path) target.relative_path = s.relative_path.replace(/\\/g, "/");
                  target.file_size = s.file_size || target.file_size;
                }
              });
            }

            // Reconcile failed files
            if (Array.isArray(res.failed)) {
              res.failed.forEach((fail) => {
                const target = matchItem(fail, trackedItems);
                if (target) {
                  target.status = "FAILED";
                  target.error = fail.error;
                  target.category = fail.category || "UPLOAD_ERROR";
                  target.retry_count = (target.retry_count || 0) + (existingBatch ? 1 : 0);
                }
              });
            }
          }
        } catch (batchErr) {
          chunk.forEach((f) => {
            const fRel = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
            const target = trackedItems.find(
              (it) => it.fileObject === f || (it.relative_path && it.relative_path === fRel)
            );
            if (target && target.status !== "SUCCESS" && target.status !== "DUPLICATE") {
              target.status = "FAILED";
              target.error = batchErr.message || "Network request failed.";
              target.category = "NETWORK_ERROR";
              target.retry_count = (target.retry_count || 0) + (existingBatch ? 1 : 0);
            }
          });
        }

        const pct = Math.round(((cIdx + 1) / chunks.length) * 100);
        setUploadProgress(pct);
      }

      // Calculate reconciled summary
      const finalSuccess = trackedItems.filter((i) => i.status === "SUCCESS");
      const finalDup = trackedItems.filter((i) => i.status === "DUPLICATE");
      const finalIgnored = trackedItems.filter((i) => i.status === "IGNORED");
      const finalFail = trackedItems.filter((i) => i.status === "FAILED");

      const batchSummary = {
        batchId,
        timestamp,
        totalFiles,
        items: trackedItems,
        uploadedCount: finalSuccess.length,
        skippedCount: finalDup.length,
        ignoredCount: finalIgnored.length,
        failedCount: finalFail.length,
      };

      setUploadResults(batchSummary);
      setShowReportModal(true);
      saveBatchToHistory(batchSummary);

      let msg = "";
      if (finalSuccess.length > 0) {
        msg += `Successfully uploaded ${finalSuccess.length} file(s). `;
      }
      if (finalIgnored.length > 0) {
        msg += `${finalIgnored.length} system/metadata file(s) ignored.`;
      }
      if (msg) {
        setSuccessMessage(msg.trim());
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

  // Retry a single failed file
  const handleRetrySingle = async (failedItem) => {
    if (!failedItem || !failedItem.fileObject || isRetrying) return;
    setIsRetrying(true);
    try {
      const formData = new FormData();
      formData.append("files", failedItem.fileObject);
      formData.append("relative_paths", failedItem.relative_path || failedItem.filename);

      const res = await apiClient("/admin/training-files/upload/", {
        method: "POST",
        body: formData,
      });

      if (res && uploadResults) {
        const updatedItems = uploadResults.items.map((it) => {
          const isTarget =
            (failedItem.client_id && it.client_id === failedItem.client_id) ||
            (it.relative_path && failedItem.relative_path && it.relative_path === failedItem.relative_path) ||
            it.filename === failedItem.filename;

          if (isTarget) {
            if (res.created && res.created.length > 0) {
              const c = res.created[0];
              return {
                ...it,
                status: "SUCCESS",
                id: c.id,
                error: null,
                checksum: c.checksum,
                relative_path: c.relative_path ? c.relative_path.replace(/\\/g, "/") : it.relative_path,
                retry_count: (it.retry_count || 0) + 1,
              };
            }
            if (res.skipped && res.skipped.length > 0) {
              const s = res.skipped[0];
              return {
                ...it,
                status: "DUPLICATE",
                reason: s.reason,
                existing_id: s.existing_id,
                error: null,
                checksum: s.checksum,
                relative_path: s.relative_path ? s.relative_path.replace(/\\/g, "/") : it.relative_path,
                retry_count: (it.retry_count || 0) + 1,
              };
            }
            if (res.failed && res.failed.length > 0) {
              const f = res.failed[0];
              return {
                ...it,
                status: "FAILED",
                error: f.error,
                category: f.category,
                retry_count: (it.retry_count || 0) + 1,
              };
            }
          }
          return it;
        });

        const newSuccess = updatedItems.filter((i) => i.status === "SUCCESS").length;
        const newDup = updatedItems.filter((i) => i.status === "DUPLICATE").length;
        const newFail = updatedItems.filter((i) => i.status === "FAILED").length;

        const updatedBatch = {
          ...uploadResults,
          items: updatedItems,
          uploadedCount: newSuccess,
          skippedCount: newDup,
          failedCount: newFail,
        };
        setUploadResults(updatedBatch);
        saveBatchToHistory(updatedBatch);
        if (onDataRefresh) await onDataRefresh();
      }
    } catch (err) {
      setError(err.message || "Failed to retry upload.");
    } finally {
      setIsRetrying(false);
    }
  };

  // Retry all failed files
  const handleRetryAllFailed = async () => {
    if (!uploadResults || isRetrying) return;
    const failedWithFiles = uploadResults.items.filter((i) => i.status === "FAILED" && i.fileObject);
    if (failedWithFiles.length === 0) return;

    setIsRetrying(true);
    try {
      const filesToRetry = failedWithFiles.map((i) => i.fileObject);
      await processUploadFiles(filesToRetry, uploadResults);
    } finally {
      setIsRetrying(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return (
      parseFloat((bytes / Math.pow(k, i)).toFixed(1)) +
      " " +
      sizes[i]
    );
  };

  // Bulk Selection and Deletion Handlers
  const handleToggleSelectAll = () => {
    if (selectedFileIds.size === currentFilesList.length && currentFilesList.length > 0) {
      setSelectedFileIds(new Set());
    } else {
      const allIds = new Set(currentFilesList.map((f) => f.id));
      setSelectedFileIds(allIds);
    }
  };

  const handleToggleSelectRow = (fileId) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedFileIds(new Set());
  };

  // Selected files metrics for bulk delete confirmation
  const selectedFilesList = useMemo(() => {
    return files.filter((f) => selectedFileIds.has(f.id));
  }, [files, selectedFileIds]);

  const selectedMappedCount = useMemo(() => {
    return selectedFilesList.filter((f) => (fileMappingsCount[f.id] || 0) > 0).length;
  }, [selectedFilesList, fileMappingsCount]);

  const selectedUnmappedCount = useMemo(() => {
    return selectedFilesList.length - selectedMappedCount;
  }, [selectedFilesList, selectedMappedCount]);

  // Execute Bulk Delete
  const handleConfirmBulkDelete = async () => {
    if (selectedFileIds.size === 0 || isBulkDeleting) return;
    setIsBulkDeleting(true);
    setDeleteError(null);

    const idsToDelete = Array.from(selectedFileIds);

    try {
      const res = await apiClient("/admin/training-files/bulk-delete/", {
        method: "POST",
        body: { ids: idsToDelete },
      });

      if (res) {
        setBulkDeleteSummary(res);
        setShowBulkDeleteModal(false);

        // Remove deleted IDs from current selection
        const successfullyDeletedIds = new Set((res.deleted || []).map((d) => d.id));
        setSelectedFileIds((prev) => {
          const next = new Set(prev);
          successfullyDeletedIds.forEach((id) => next.delete(id));
          return next;
        });

        if (res.deleted_count > 0) {
          setSuccessMessage(
            `Successfully deleted ${res.deleted_count} training file(s) and removed ${res.total_mappings_removed || 0} associated curriculum mapping(s).`
          );
        }

        if (res.failed_count > 0) {
          setError(`Failed to delete ${res.failed_count} file(s). They remain selected for review.`);
        }

        if (onDataRefresh) {
          await onDataRefresh();
        }
      }
    } catch (err) {
      setDeleteError(err.message || "Failed to execute bulk deletion.");
    } finally {
      setIsBulkDeleting(false);
    }
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

      {/* Batch Summary Report Banner & Modal Trigger */}
      {uploadResults && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            borderLeft: `4px solid ${uploadResults.failedCount > 0 ? "var(--status-error, #ef4444)" : "var(--status-success, #10b981)"}`,
            padding: "14px 18px",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>Batch Upload Summary</h4>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                ID: <code>{uploadResults.batchId}</code>
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: "4px 12px", fontSize: "12px", fontWeight: "600" }}
                onClick={() => setShowReportModal(true)}
              >
                View Detailed Report ({uploadResults.items?.length || uploadResults.totalFiles} Files)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => setUploadResults(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "24px", fontSize: "13px", flexWrap: "wrap" }}>
            <span style={{ color: "var(--text-secondary)" }}>
              Total: <strong>{uploadResults.totalFiles || uploadResults.items?.length || 0}</strong>
            </span>
            <span style={{ color: "var(--status-success, #10b981)" }}>
              Uploaded: <strong>{uploadResults.uploadedCount}</strong>
            </span>
            <span style={{ color: "#d97706" }}>
              Duplicates Skipped: <strong>{uploadResults.skippedCount}</strong>
            </span>
            <span style={{ color: "var(--status-error, #ef4444)" }}>
              Failed: <strong>{uploadResults.failedCount}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Persistent Upload History Banner / Quick Launcher */}
      {!uploadResults && uploadHistory.length > 0 && (
        <div style={{ marginBottom: "14px", display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "11px", padding: "3px 10px", color: "var(--text-secondary)" }}
            onClick={() => {
              setUploadResults(uploadHistory[0]);
              setShowReportModal(true);
            }}
          >
            📋 View Latest Upload Batch Report ({new Date(uploadHistory[0].timestamp).toLocaleTimeString()})
          </button>
        </div>
      )}

      {/* Detailed Modal Dialog */}
      {showReportModal && uploadResults && (
        <BatchUploadReportModal
          uploadBatch={uploadResults}
          onClose={() => setShowReportModal(false)}
          onRetrySingle={handleRetrySingle}
          onRetryAllFailed={handleRetryAllFailed}
          isRetrying={isRetrying}
        />
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

      {/* Bulk Action Toolbar */}
      {selectedFileIds.size > 0 && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            padding: "12px 18px",
            backgroundColor: "rgba(239, 68, 68, 0.05)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            borderRadius: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main)" }}>
              {selectedFileIds.size} {selectedFileIds.size === 1 ? "file" : "files"} selected
            </span>
            <span style={{ color: "var(--border-color, #cbd5e1)" }}>|</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleToggleSelectAll}
              style={{ padding: "3px 10px", fontSize: "11px" }}
            >
              {selectedFileIds.size === currentFilesList.length ? "Deselect All Visible" : "Select All Visible"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClearSelection}
              style={{ padding: "3px 10px", fontSize: "11px" }}
            >
              Clear Selection
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              ({selectedMappedCount} mapped, {selectedUnmappedCount} unmapped)
            </span>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setShowBulkDeleteModal(true)}
              style={{
                backgroundColor: "var(--status-error, #ef4444)",
                borderColor: "var(--status-error, #ef4444)",
                color: "#ffffff",
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: "700",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Delete Selected ({selectedFileIds.size})
            </button>
          </div>
        </div>
      )}

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
                  <th style={{ width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      aria-label="Select all visible files"
                      checked={currentFilesList.length > 0 && selectedFileIds.size === currentFilesList.length}
                      onChange={handleToggleSelectAll}
                    />
                  </th>
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
                  const isRowSelected = selectedFileIds.has(f.id);
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
                    <tr
                      key={f.id}
                      style={{
                        backgroundColor: isRowSelected ? "rgba(239, 68, 68, 0.04)" : "transparent",
                      }}
                    >
                      <td style={{ width: "36px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${f.filename}`}
                          checked={isRowSelected}
                          onChange={() => handleToggleSelectRow(f.id)}
                        />
                      </td>
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

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && selectedFileIds.size > 0 && (
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
          onClick={() => !isBulkDeleting && setShowBulkDeleteModal(false)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-card, #ffffff)",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "560px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
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
                  Delete {selectedFileIds.size} Selected Training Files?
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary, #64748b)", lineHeight: "1.5" }}>
                  This operation permanently removes physical training files and all associated curriculum mappings.
                </p>
              </div>
            </div>

            {/* Mappings Impact Alert */}
            <div
              style={{
                backgroundColor: selectedMappedCount > 0 ? "rgba(239, 68, 68, 0.08)" : "rgba(59, 130, 246, 0.08)",
                border: `1px solid ${selectedMappedCount > 0 ? "rgba(239, 68, 68, 0.25)" : "rgba(59, 130, 246, 0.25)"}`,
                borderRadius: "6px",
                padding: "12px 14px",
                marginBottom: "16px",
                fontSize: "12px",
              }}
            >
              <div style={{ fontWeight: "700", marginBottom: "4px", color: selectedMappedCount > 0 ? "#b91c1c" : "#1d4ed8" }}>
                Mapping Impact Summary:
              </div>
              <div style={{ color: "var(--text-main)" }}>
                • <strong>{selectedMappedCount}</strong> file(s) are currently attached to active curriculum lessons or topic clusters.
              </div>
              <div style={{ color: "var(--text-main)" }}>
                • <strong>{selectedUnmappedCount}</strong> file(s) are unassigned library staging items.
              </div>
              {selectedMappedCount > 0 && (
                <div style={{ marginTop: "6px", color: "#b91c1c", fontWeight: "600" }}>
                  ⚠️ Warning: Deleting these files will immediately unlink them from their respective course lessons. This operation cannot be undone.
                </div>
              )}
            </div>

            {/* Selected Files List Preview */}
            <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "6px" }}>
              Selected Files ({selectedFilesList.length}):
            </div>
            <div
              style={{
                flex: 1,
                minHeight: "80px",
                maxHeight: "180px",
                overflowY: "auto",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "6px",
                padding: "8px 12px",
                backgroundColor: "var(--bg-subtle, #f8fafc)",
                fontSize: "12px",
                marginBottom: "16px",
              }}
            >
              {selectedFilesList.map((sf) => (
                <div key={sf.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <span style={{ fontWeight: "600", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "340px" }}>
                    {sf.filename}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                    {(fileMappingsCount[sf.id] || 0) > 0 ? `${fileMappingsCount[sf.id]} mapping(s)` : "Unassigned"}
                  </span>
                </div>
              ))}
            </div>

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
                disabled={isBulkDeleting}
                onClick={() => setShowBulkDeleteModal(false)}
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isBulkDeleting}
                onClick={handleConfirmBulkDelete}
                style={{
                  fontSize: "12px",
                  padding: "6px 14px",
                  backgroundColor: "var(--status-error, #ef4444)",
                  borderColor: "var(--status-error, #ef4444)",
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: "700",
                }}
              >
                {isBulkDeleting ? "Deleting..." : `Delete ${selectedFileIds.size} Selected Files`}
              </button>
            </div>
          </div>
        </div>
      )}
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

