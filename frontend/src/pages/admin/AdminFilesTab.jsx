import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { apiClient } from "../../services/api";

const CATEGORY_LABELS = {
  PRIMARY_INSTRUCTIONAL: "Primary Instructional",
  SUPPLEMENTARY_REFERENCE: "Supplementary Reference",
  DOWNLOADABLE_PDF: "Downloadable PDF",
  IMAGE_INFOGRAPHIC: "Image / Infographic",
  ASSESSMENT_RUBRIC: "Assessment / Rubric",
  PRACTICAL_EXERCISE: "Practical Exercise",
  UNCLASSIFIED: "Unclassified",
};

const CATEGORY_COLORS = {
  PRIMARY_INSTRUCTIONAL: "badge-primary",
  SUPPLEMENTARY_REFERENCE: "badge-info",
  DOWNLOADABLE_PDF: "badge-secondary",
  IMAGE_INFOGRAPHIC: "badge-warning",
  ASSESSMENT_RUBRIC: "badge-danger",
  PRACTICAL_EXERCISE: "badge-success",
  UNCLASSIFIED: "badge-secondary",
};

export default function AdminFilesTab() {
  const [viewMode, setViewMode] = useState("clusters"); // 'clusters' | 'all-files' | 'unclassified'
  const [files, setFiles] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modules, setModules] = useState([]);
  const [submodules, setSubmodules] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Navigation state in cluster view
  const [expandedClusters, setExpandedClusters] = useState({});
  const [expandedModules, setExpandedModules] = useState({});

  // Mapping modal state (attach file to cluster/module/lesson)
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [selectedFileForMapping, setSelectedFileForMapping] = useState(null);
  const [mapClusterId, setMapClusterId] = useState("");
  const [mapModuleId, setMapModuleId] = useState("");
  const [mapSubmoduleId, setMapSubmoduleId] = useState("");
  const [mapCategory, setMapCategory] = useState("SUPPLEMENTARY_REFERENCE");
  const [mapNotes, setMapNotes] = useState("");
  const [submittingMapping, setSubmittingMapping] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [uploadResults, setUploadResults] = useState(null);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [filesRes, clustersRes, mappingsRes, coursesRes, modulesRes, submodulesRes] = await Promise.all([
        apiClient("/admin/training-files/"),
        apiClient("/admin/training-clusters/"),
        apiClient("/admin/training-file-mappings/"),
        apiClient("/courses/"),
        apiClient("/modules/"),
        apiClient("/submodules/"),
      ]);

      setFiles(Array.isArray(filesRes) ? filesRes : filesRes?.results || []);
      setClusters(Array.isArray(clustersRes) ? clustersRes : clustersRes?.results || []);
      setMappings(Array.isArray(mappingsRes) ? mappingsRes : mappingsRes?.results || []);
      setCourses(Array.isArray(coursesRes) ? coursesRes : coursesRes?.results || []);
      setModules(Array.isArray(modulesRes) ? modulesRes : modulesRes?.results || []);
      setSubmodules(Array.isArray(submodulesRes) ? submodulesRes : submodulesRes?.results || []);

      // By default expand Cluster 1 & Cluster 2
      const initialClustExp = {};
      (Array.isArray(clustersRes) ? clustersRes : clustersRes?.results || []).forEach((c, idx) => {
        if (idx < 2) initialClustExp[c.id] = true;
      });
      setExpandedClusters(initialClustExp);
    } catch (err) {
      setError(err.message || "Failed to load training materials and library organization.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleCluster = (clusterId) => {
    setExpandedClusters((prev) => ({ ...prev, [clusterId]: !prev[clusterId] }));
  };

  const toggleModule = (moduleId) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  // Open modal to attach a file to another module or lesson
  const handleOpenAttachModal = (file) => {
    setSelectedFileForMapping(file);
    setMapClusterId(clusters.length > 0 ? clusters[0].id : "");
    setMapModuleId("");
    setMapSubmoduleId("");
    setMapCategory("SUPPLEMENTARY_REFERENCE");
    setMapNotes("");
    setError(null);
    setShowMappingModal(true);
  };

  const handleSaveMapping = async (e) => {
    e.preventDefault();
    if (!selectedFileForMapping || !mapClusterId) {
      setError("Please select a target cluster.");
      return;
    }

    setSubmittingMapping(true);
    setError(null);
    setSuccessMessage("");

    try {
      const payload = {
        file_id: selectedFileForMapping.id,
        cluster: parseInt(mapClusterId, 10),
        module: mapModuleId ? parseInt(mapModuleId, 10) : null,
        submodule: mapSubmoduleId ? parseInt(mapSubmoduleId, 10) : null,
        category: mapCategory,
        notes: mapNotes.trim(),
      };

      await apiClient("/admin/training-file-mappings/", {
        method: "POST",
        body: payload,
      });

      setSuccessMessage(`File "${selectedFileForMapping.filename}" attached successfully.`);
      setShowMappingModal(false);
      // Refresh mappings
      const updatedMappings = await apiClient("/admin/training-file-mappings/");
      setMappings(Array.isArray(updatedMappings) ? updatedMappings : updatedMappings?.results || []);
    } catch (err) {
      setError(err.message || "Failed to attach file to lesson.");
    } finally {
      setSubmittingMapping(false);
    }
  };

  const handleRemoveMapping = async (mappingId, filename) => {
    if (!window.confirm(`Are you sure you want to remove this mapping for "${filename}"? The physical file will NOT be deleted.`)) {
      return;
    }

    setError(null);
    setSuccessMessage("");

    try {
      await apiClient(`/admin/training-file-mappings/${mappingId}/`, {
        method: "DELETE",
      });
      setSuccessMessage(`Mapping removed successfully.`);
      const updatedMappings = await apiClient("/admin/training-file-mappings/");
      setMappings(Array.isArray(updatedMappings) ? updatedMappings : updatedMappings?.results || []);
    } catch (err) {
      setError(err.message || "Failed to remove mapping.");
    }
  };

  // Process uploads in batches
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

      await loadData();
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

  const getBadgeClassForType = (type) => {
    switch (type?.toUpperCase()) {
      case "PDF":
        return "badge-danger";
      case "DOCX":
      case "DOC":
        return "badge-primary";
      case "PNG":
      case "JPG":
      case "JPEG":
        return "badge-warning";
      case "PPTX":
        return "badge-info";
      default:
        return "badge-secondary";
    }
  };

  // Filtered files for All-Files View
  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const matchesSearch =
        !searchQuery.trim() ||
        f.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.relative_path.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === "ALL" || f.file_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [files, searchQuery, typeFilter]);

  // Map of fileId to its assigned mappings count
  const fileMappingsCount = useMemo(() => {
    const counts = {};
    mappings.forEach((m) => {
      counts[m.file_id || m.training_file] = (counts[m.file_id || m.training_file] || 0) + 1;
    });
    return counts;
  }, [mappings]);

  // Unclassified files (files with 0 mappings or mapped to Cluster 9)
  const unclassifiedFiles = useMemo(() => {
    const unclassClusterId = clusters.find((c) => c.code === "CLUSTER-9")?.id;
    return files.filter((f) => {
      const count = fileMappingsCount[f.id] || 0;
      const isMappedToCluster9 = mappings.some(
        (m) => (m.file_id || m.training_file) === f.id && m.cluster === unclassClusterId
      );
      return count === 0 || isMappedToCluster9;
    });
  }, [files, fileMappingsCount, mappings, clusters]);

  // Filtered mappings for Cluster View
  const filteredMappings = useMemo(() => {
    return mappings.filter((m) => {
      const matchesSearch =
        !searchQuery.trim() ||
        m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.notes && m.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.submodule_name && m.submodule_name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = typeFilter === "ALL" || m.file_type === typeFilter;
      const matchesCategory = categoryFilter === "ALL" || m.category === categoryFilter;
      return matchesSearch && matchesType && matchesCategory;
    });
  }, [mappings, searchQuery, typeFilter, categoryFilter]);

  return (
    <div>
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "20px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 6px 0", color: "var(--text-main)" }}>
            Training Library & Materials Repository
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
            Topic-based organization of training materials, reference PDFs, infographics, and incoming documents.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadData}
            disabled={loading || isUploading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            Refresh
          </button>

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
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
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
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            Upload Single Files
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: "16px" }}>
          {successMessage}
        </div>
      )}

      {/* Uploading Status Progress Bar */}
      {isUploading && (
        <div className="card" style={{ marginBottom: "20px", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px" }}>
            <span style={{ fontWeight: "600", color: "var(--text-main)" }}>Uploading Materials Batch</span>
            <span style={{ color: "var(--accent-primary)", fontWeight: "600" }}>{uploadProgress}%</span>
          </div>
          <div
            style={{
              width: "100%",
              height: "8px",
              backgroundColor: "var(--border-color)",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${uploadProgress}%`,
                height: "100%",
                backgroundColor: "var(--accent-primary)",
                transition: "width 0.2s ease",
              }}
            ></div>
          </div>
          {uploadStatusText && (
            <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
              {uploadStatusText}
            </p>
          )}
        </div>
      )}

      {/* Upload Summary Modal */}
      {uploadResults && (
        <div className="card" style={{ marginBottom: "20px", borderLeft: "4px solid var(--accent-primary)", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>Batch Processing Summary</h4>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "2px 8px", fontSize: "11px" }}
              onClick={() => setUploadResults(null)}
            >
              Dismiss
            </button>
          </div>
          <div style={{ display: "flex", gap: "24px", fontSize: "13px" }}>
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

      {/* Sub-navigation View Modes */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
        <button
          type="button"
          className={`btn ${viewMode === "clusters" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setViewMode("clusters")}
          style={{ fontSize: "13px", padding: "6px 14px" }}
        >
          Topic Clusters & Lessons ({mappings.length} mappings)
        </button>
        <button
          type="button"
          className={`btn ${viewMode === "all-files" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setViewMode("all-files")}
          style={{ fontSize: "13px", padding: "6px 14px" }}
        >
          All Uploaded Files ({files.length} total)
        </button>
        <button
          type="button"
          className={`btn ${viewMode === "unclassified" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setViewMode("unclassified")}
          style={{ fontSize: "13px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          Incoming / Unclassified
          {unclassifiedFiles.length > 0 && (
            <span className="badge badge-warning" style={{ fontSize: "10px" }}>
              {unclassifiedFiles.length}
            </span>
          )}
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div
        className="card"
        style={{
          marginBottom: "20px",
          padding: "16px",
          display: "flex",
          gap: "14px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <input
            type="text"
            className="input"
            placeholder="Search by filename, topic, or lesson..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        {/* Format Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Format:</span>
          {["ALL", "DOCX", "PDF", "PNG"].map((t) => (
            <button
              key={t}
              type="button"
              className={`btn btn-secondary ${typeFilter === t ? "active" : ""}`}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                backgroundColor: typeFilter === t ? "var(--accent-primary)" : "transparent",
                color: typeFilter === t ? "#ffffff" : "var(--text-main)",
                borderColor: typeFilter === t ? "var(--accent-primary)" : "var(--border-color)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Category Filter for Cluster View */}
        {viewMode === "clusters" && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Category:</span>
            <select
              className="input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              <option value="ALL">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: TOPIC CLUSTERS HIERARCHY */}
      {viewMode === "clusters" && (
        <div>
          {loading ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
                Loading topic clusters and library hierarchy...
              </p>
            </div>
          ) : clusters.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
                No training clusters configured.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {clusters.map((cluster) => {
                const clusterMappings = filteredMappings.filter((m) => m.cluster === cluster.id);
                const isExpanded = !!expandedClusters[cluster.id];

                return (
                  <div
                    key={cluster.id}
                    className="card"
                    style={{
                      padding: 0,
                      overflow: "hidden",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    {/* Cluster Header */}
                    <div
                      onClick={() => toggleCluster(cluster.id)}
                      style={{
                        padding: "14px 18px",
                        backgroundColor: "var(--bg-surface)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        borderBottom: isExpanded ? "1px solid var(--border-color)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                          {isExpanded ? "▼" : "▶"}
                        </span>
                        <div>
                          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--accent-secondary)", display: "block" }}>
                            {cluster.code}
                          </span>
                          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>
                            {cluster.name}
                          </h3>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span className="badge badge-info" style={{ fontSize: "11px" }}>
                          {clusterMappings.length} document(s)
                        </span>
                      </div>
                    </div>

                    {/* Cluster Content Body */}
                    {isExpanded && (
                      <div style={{ padding: "16px 20px" }}>
                        {cluster.description && (
                          <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                            {cluster.description}
                          </p>
                        )}

                        {clusterMappings.length === 0 ? (
                          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>
                            No training files mapped under this cluster matching search filters.
                          </p>
                        ) : (
                          <div className="table-responsive">
                            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: "12px" }}>Document Filename</th>
                                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: "12px" }}>Module & Lesson Attachment</th>
                                  <th style={{ textAlign: "center", padding: "8px 12px", fontSize: "12px" }}>Category</th>
                                  <th style={{ textAlign: "center", padding: "8px 12px", fontSize: "12px" }}>Format</th>
                                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: "12px" }}>Size</th>
                                  <th style={{ textAlign: "right", padding: "8px 12px", fontSize: "12px" }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {clusterMappings.map((m) => (
                                  <tr key={m.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                                    <td style={{ padding: "10px 12px" }}>
                                      <div style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)" }}>
                                        {m.filename}
                                      </div>
                                      {m.notes && (
                                        <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                                          Note: {m.notes}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ padding: "10px 12px" }}>
                                      {m.submodule_name ? (
                                        <div>
                                          <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block" }}>
                                            {m.module_name}
                                          </span>
                                          <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-main)" }}>
                                            Lesson {m.submodule_order}: {m.submodule_name}
                                          </span>
                                        </div>
                                      ) : m.module_name ? (
                                        <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-main)" }}>
                                          {m.module_name} (Module-Level)
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                                          Cluster-Level General Asset
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ textAlign: "center", padding: "10px 12px" }}>
                                      <span className={`badge ${CATEGORY_COLORS[m.category] || "badge-secondary"}`} style={{ fontSize: "10px" }}>
                                        {CATEGORY_LABELS[m.category] || m.category}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "center", padding: "10px 12px" }}>
                                      <span className={`badge ${getBadgeClassForType(m.file_type)}`} style={{ fontSize: "10px" }}>
                                        {m.file_type}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "right", padding: "10px 12px", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                                      {formatFileSize(m.file_size)}
                                    </td>
                                    <td style={{ textAlign: "right", padding: "10px 12px" }}>
                                      <div style={{ display: "inline-flex", gap: "6px" }}>
                                        {["PDF", "DOCX", "DOC", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes((m.file_type || "").toUpperCase()) ? (
                                          <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ padding: "3px 8px", fontSize: "11px" }}
                                            onClick={() => window.open(m.download_url, "_blank")}
                                            title="Preview material"
                                          >
                                            Preview
                                          </button>
                                        ) : (
                                          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic", alignSelf: "center" }}>
                                            Preview unavailable
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          style={{ padding: "3px 8px", fontSize: "11px", color: "var(--text-danger, #ef4444)" }}
                                          onClick={() => handleRemoveMapping(m.id, m.filename)}
                                          title="Remove this mapping"
                                        >
                                          Detach
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: ALL UPLOADED FILES VIEW */}
      {viewMode === "all-files" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
                Loading physical training files...
              </p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "56px 24px" }}>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                No training documents found matching search criteria.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "12px 16px" }}>Filename</th>
                    <th style={{ textAlign: "left", padding: "12px 16px" }}>Original Relative Path</th>
                    <th style={{ textAlign: "center", padding: "12px 16px" }}>Format</th>
                    <th style={{ textAlign: "right", padding: "12px 16px" }}>Size</th>
                    <th style={{ textAlign: "center", padding: "12px 16px" }}>Attachments</th>
                    <th style={{ textAlign: "right", padding: "12px 16px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => {
                    const mapCount = fileMappingsCount[file.id] || 0;
                    return (
                      <tr key={file.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontWeight: "600", color: "var(--text-main)", fontSize: "13px" }}>
                            {file.filename}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>
                            {file.relative_path || "Root"}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", padding: "12px 16px" }}>
                          <span className={`badge ${getBadgeClassForType(file.file_type)}`} style={{ fontSize: "11px" }}>
                            {file.file_type}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", padding: "12px 16px", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                          {formatFileSize(file.file_size)}
                        </td>
                        <td style={{ textAlign: "center", padding: "12px 16px" }}>
                          <span className={`badge ${mapCount > 0 ? "badge-success" : "badge-secondary"}`} style={{ fontSize: "11px" }}>
                            {mapCount} Lesson(s)
                          </span>
                        </td>
                        <td style={{ textAlign: "right", padding: "12px 16px" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleOpenAttachModal(file)}
                              style={{ padding: "4px 8px", fontSize: "12px" }}
                              title="Attach file to a cluster, module or lesson"
                            >
                              Attach / Categorize
                            </button>
                            {["PDF", "DOCX", "DOC", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes((file.file_type || "").toUpperCase()) ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => window.open(file.download_url, "_blank")}
                                style={{ padding: "4px 8px", fontSize: "12px" }}
                                title="Preview file"
                              >
                                Preview
                              </button>
                            ) : (
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic", alignSelf: "center" }}>
                                Preview unavailable
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)", fontSize: "12px", color: "var(--text-muted)" }}>
            Total {filteredFiles.length} file(s) displayed in repository
          </div>
        </div>
      )}

      {/* VIEW MODE 3: UNCLASSIFIED / INCOMING BUFFER */}
      {viewMode === "unclassified" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)", backgroundColor: "var(--bg-surface)" }}>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: "700" }}>
              Incoming / Unclassified Staging Area
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
              Files uploaded into the system that have not yet been assigned to a lesson or topic cluster.
            </p>
          </div>

          {unclassifiedFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px" }}>
              <span style={{ fontSize: "32px", display: "block", marginBottom: "12px" }}>✓</span>
              <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", fontWeight: "600", color: "var(--text-main)" }}>
                All training files are classified!
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
                Every single uploaded file is actively mapped to a topic cluster or curriculum lesson. New uploads will appear here.
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "12px 16px" }}>Filename</th>
                    <th style={{ textAlign: "left", padding: "12px 16px" }}>Folder Location</th>
                    <th style={{ textAlign: "center", padding: "12px 16px" }}>Format</th>
                    <th style={{ textAlign: "right", padding: "12px 16px" }}>Size</th>
                    <th style={{ textAlign: "right", padding: "12px 16px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {unclassifiedFiles.map((file) => (
                    <tr key={file.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "12px 16px", fontWeight: "600" }}>{file.filename}</td>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                        {file.relative_path || "Root"}
                      </td>
                      <td style={{ textAlign: "center", padding: "12px 16px" }}>
                        <span className={`badge ${getBadgeClassForType(file.file_type)}`}>{file.file_type}</span>
                      </td>
                      <td style={{ textAlign: "right", padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                        {formatFileSize(file.file_size)}
                      </td>
                      <td style={{ textAlign: "right", padding: "12px 16px" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleOpenAttachModal(file)}
                          style={{ padding: "4px 10px", fontSize: "12px" }}
                        >
                          Categorize & Attach
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ATTACH FILE TO CLUSTER / MODULE / LESSON */}
      {showMappingModal && selectedFileForMapping && (
        <div
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
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "540px",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>
                Attach Material to Curriculum
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowMappingModal(false)}
                style={{ padding: "4px 8px" }}
              >
                &times;
              </button>
            </div>

            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "var(--text-secondary)" }}>
              Attaching <strong>{selectedFileForMapping.filename}</strong> to a topic cluster and lesson.
            </p>

            <form onSubmit={handleSaveMapping}>
              {/* Cluster Selection */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                  Target Topic Cluster *
                </label>
                <select
                  className="input"
                  value={mapClusterId}
                  onChange={(e) => setMapClusterId(e.target.value)}
                  required
                  style={{ width: "100%" }}
                >
                  <option value="">Select Cluster...</option>
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Module Selection (Optional) */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                  Target Module (Optional)
                </label>
                <select
                  className="input"
                  value={mapModuleId}
                  onChange={(e) => {
                    setMapModuleId(e.target.value);
                    setMapSubmoduleId("");
                  }}
                  style={{ width: "100%" }}
                >
                  <option value="">None (Cluster-level general material)</option>
                  {modules
                    .filter((m) => m.course === 6 || m.course_name?.includes("IT Recruitment"))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        Module {m.order}: {m.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Lesson Selection (Optional) */}
              {mapModuleId && (
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                    Target Lesson (Optional)
                  </label>
                  <select
                    className="input"
                    value={mapSubmoduleId}
                    onChange={(e) => setMapSubmoduleId(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="">None (Module-level general material)</option>
                    {submodules
                      .filter((s) => s.module === parseInt(mapModuleId, 10))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          Lesson {s.order}: {s.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Category */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                  Document Category *
                </label>
                <select
                  className="input"
                  value={mapCategory}
                  onChange={(e) => setMapCategory(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                  Administrative Notes / Description
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Recommended reading for Lesson 3.1..."
                  value={mapNotes}
                  onChange={(e) => setMapNotes(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowMappingModal(false)}
                  disabled={submittingMapping}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingMapping}
                >
                  {submittingMapping ? "Attaching..." : "Save Attachment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
