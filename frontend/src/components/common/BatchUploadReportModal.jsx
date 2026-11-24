import { useState, useMemo } from "react";

export default function BatchUploadReportModal({
  uploadBatch,
  onClose,
  onRetrySingle,
  onRetryAllFailed,
  isRetrying = false,
}) {
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'created' | 'skipped' | 'ignored' | 'failed'
  const [searchQuery, setSearchQuery] = useState("");

  if (!uploadBatch) return null;

  const {
    batchId = "BATCH-" + Date.now().toString(36).toUpperCase(),
    timestamp = new Date().toISOString(),
    totalFiles = 0,
    items = [], // Array of per-file tracked objects
    isHistorical = false,
  } = uploadBatch;

  // Check if any failed items have an in-memory File object available for retry
  const failedWithFileObjects = useMemo(
    () => items.filter((f) => f.status === "FAILED" && Boolean(f.fileObject)),
    [items]
  );
  const isHistoricalReport = isHistorical || (items.some((f) => f.status === "FAILED") && failedWithFileObjects.length === 0);

  // Derive counts
  const successfulItems = useMemo(() => items.filter((f) => f.status === "SUCCESS"), [items]);
  const duplicateItems = useMemo(() => items.filter((f) => f.status === "DUPLICATE"), [items]);
  const ignoredItems = useMemo(() => items.filter((f) => f.status === "IGNORED"), [items]);
  const failedItems = useMemo(() => items.filter((f) => f.status === "FAILED"), [items]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (activeTab === "created") list = successfulItems;
    else if (activeTab === "skipped") list = duplicateItems;
    else if (activeTab === "ignored") list = ignoredItems;
    else if (activeTab === "failed") list = failedItems;

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (item) =>
        (item.filename && item.filename.toLowerCase().includes(q)) ||
        (item.relative_path && item.relative_path.toLowerCase().includes(q)) ||
        (item.error && item.error.toLowerCase().includes(q)) ||
        (item.reason && item.reason.toLowerCase().includes(q))
    );
  }, [items, activeTab, searchQuery, successfulItems, duplicateItems, ignoredItems, failedItems]);

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleExportCSV = () => {
    const headers = [
      "Batch ID",
      "Timestamp",
      "Filename",
      "Relative Path",
      "Size (Bytes)",
      "Status",
      "Error / Duplicate Reason",
      "Category",
      "Repository ID",
      "Retry Count",
    ];

    const rows = items.map((item) => [
      `"${batchId}"`,
      `"${timestamp}"`,
      `"${(item.filename || item.original_filename || "").replace(/"/g, '""')}"`,
      `"${(item.relative_path || "").replace(/"/g, '""')}"`,
      item.file_size || 0,
      `"${item.status}"`,
      `"${(item.error || item.reason || "").replace(/"/g, '""')}"`,
      `"${item.category || ""}"`,
      item.id || item.existing_id || "",
      item.retry_count || 0,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `upload_report_${batchId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "960px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "12px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
          padding: 0,
          background: "var(--bg-surface, #ffffff)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-subtle, #f8fafc)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                Batch Upload & Ingestion Report
              </h3>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  background: failedItems.length > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                  color: failedItems.length > 0 ? "var(--status-error, #ef4444)" : "var(--status-success, #10b981)",
                  fontWeight: "700",
                }}
              >
                {failedItems.length > 0 ? "Action Required" : "Upload Complete"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
              Batch ID: <code>{batchId}</code> • Executed on {new Date(timestamp).toLocaleString()}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCSV}
              style={{ fontSize: "12px", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              title="Download CSV report for auditing"
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: "6px 10px", fontSize: "14px", lineHeight: 1 }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Summary Metric Ribbon */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
            padding: "16px 24px",
            background: "var(--bg-main, #ffffff)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#6366f1", textTransform: "uppercase" }}>Total Selected</div>
            <div style={{ fontSize: "20px", fontWeight: "800", marginTop: "2px" }}>{totalFiles}</div>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--status-success, #10b981)", textTransform: "uppercase" }}>Successfully Uploaded</div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--status-success, #10b981)", marginTop: "2px" }}>{successfulItems.length}</div>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#d97706", textTransform: "uppercase" }}>Duplicates Skipped</div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#d97706", marginTop: "2px" }}>{duplicateItems.length}</div>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(100, 116, 139, 0.08)", border: "1px solid rgba(100, 116, 139, 0.2)" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>System Files Ignored</div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#64748b", marginTop: "2px" }}>{ignoredItems.length}</div>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", textTransform: "uppercase" }}>Failed Files</div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#ef4444", marginTop: "2px" }}>{failedItems.length}</div>
          </div>
        </div>

        {/* Filter Tabs and Actions */}
        <div
          style={{
            padding: "12px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            borderBottom: "1px solid var(--border-color)",
            background: "var(--bg-subtle, #f8fafc)",
          }}
        >
          {/* Segmented Filter Buttons */}
          <div style={{ display: "inline-flex", borderRadius: "8px", padding: "3px", background: "var(--border-color, #e2e8f0)", gap: "2px" }}>
            <button
              type="button"
              className="btn"
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "6px",
                background: activeTab === "all" ? "var(--bg-surface, #ffffff)" : "transparent",
                color: activeTab === "all" ? "var(--text-main)" : "var(--text-secondary)",
                boxShadow: activeTab === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                fontWeight: activeTab === "all" ? "700" : "500",
              }}
              onClick={() => setActiveTab("all")}
            >
              All Files ({items.length})
            </button>
            <button
              type="button"
              className="btn"
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "6px",
                background: activeTab === "created" ? "var(--bg-surface, #ffffff)" : "transparent",
                color: activeTab === "created" ? "var(--status-success, #10b981)" : "var(--text-secondary)",
                boxShadow: activeTab === "created" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                fontWeight: activeTab === "created" ? "700" : "500",
              }}
              onClick={() => setActiveTab("created")}
            >
              Uploaded ({successfulItems.length})
            </button>
            <button
              type="button"
              className="btn"
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "6px",
                background: activeTab === "skipped" ? "var(--bg-surface, #ffffff)" : "transparent",
                color: activeTab === "skipped" ? "#d97706" : "var(--text-secondary)",
                boxShadow: activeTab === "skipped" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                fontWeight: activeTab === "skipped" ? "700" : "500",
              }}
              onClick={() => setActiveTab("skipped")}
            >
              Duplicates ({duplicateItems.length})
            </button>
            <button
              type="button"
              className="btn"
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "6px",
                background: activeTab === "ignored" ? "var(--bg-surface, #ffffff)" : "transparent",
                color: activeTab === "ignored" ? "#64748b" : "var(--text-secondary)",
                boxShadow: activeTab === "ignored" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                fontWeight: activeTab === "ignored" ? "700" : "500",
              }}
              onClick={() => setActiveTab("ignored")}
            >
              Ignored Metadata ({ignoredItems.length})
            </button>
            <button
              type="button"
              className="btn"
              style={{
                fontSize: "12px",
                padding: "4px 12px",
                borderRadius: "6px",
                background: activeTab === "failed" ? "var(--bg-surface, #ffffff)" : "transparent",
                color: activeTab === "failed" ? "#ef4444" : "var(--text-secondary)",
                boxShadow: activeTab === "failed" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                fontWeight: activeTab === "failed" ? "700" : "500",
              }}
              onClick={() => setActiveTab("failed")}
            >
              Failed ({failedItems.length})
            </button>
          </div>

          {/* Search box and Retry Action */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search filename or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ width: "220px", padding: "5px 10px", fontSize: "12px" }}
            />

            {failedItems.length > 0 && onRetryAllFailed && (
              failedWithFileObjects.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onRetryAllFailed}
                  disabled={isRetrying}
                  style={{
                    fontSize: "12px",
                    padding: "5px 14px",
                    background: "var(--status-error, #ef4444)",
                    borderColor: "var(--status-error, #ef4444)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isRetrying ? "Retrying..." : `Retry All Failed (${failedWithFileObjects.length})`}
                </button>
              ) : (
                <span
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background: "var(--bg-subtle, #f1f5f9)",
                    color: "var(--text-muted, #64748b)",
                    border: "1px dashed var(--border-color, #cbd5e1)",
                  }}
                  title="Historical reports store diagnostic audit logs without local file handles. Please select files via the upload button to retry."
                >
                  ℹ️ Historical log: re-select files to retry
                </span>
              )
            )}
          </div>
        </div>

        {/* Detailed Per-File List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px" }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              No files found matching the selected filter or search query.
            </div>
          ) : (
            <table className="table" style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                  <th style={{ padding: "10px 8px", width: "40px" }}>Status</th>
                  <th style={{ padding: "10px 8px" }}>File Name & Relative Path</th>
                  <th style={{ padding: "10px 8px", width: "90px" }}>Size</th>
                  <th style={{ padding: "10px 8px" }}>Details / Diagnostics</th>
                  <th style={{ padding: "10px 8px", width: "100px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const isSuccess = item.status === "SUCCESS";
                  const isDup = item.status === "DUPLICATE";
                  const isIgnored = item.status === "IGNORED";
                  const isFail = item.status === "FAILED";

                  return (
                    <tr
                      key={item.id || `${item.filename}-${idx}`}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        backgroundColor: isFail
                          ? "rgba(239, 68, 68, 0.03)"
                          : isDup
                          ? "rgba(245, 158, 11, 0.02)"
                          : isIgnored
                          ? "rgba(100, 116, 139, 0.03)"
                          : "transparent",
                      }}
                    >
                      {/* Status Icon */}
                      <td style={{ padding: "10px 8px", verticalAlign: "top" }}>
                        {isSuccess && (
                          <span
                            title="Uploaded successfully"
                            style={{
                              display: "inline-block",
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              background: "rgba(16, 185, 129, 0.2)",
                              color: "var(--status-success, #10b981)",
                              textAlign: "center",
                              lineHeight: "20px",
                              fontWeight: "700",
                              fontSize: "11px",
                            }}
                          >
                            ✓
                          </span>
                        )}
                        {isDup && (
                          <span
                            title="Duplicate skipped"
                            style={{
                              display: "inline-block",
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              background: "rgba(245, 158, 11, 0.2)",
                              color: "#d97706",
                              textAlign: "center",
                              lineHeight: "20px",
                              fontWeight: "700",
                              fontSize: "11px",
                            }}
                          >
                            ⊘
                          </span>
                        )}
                        {isIgnored && (
                          <span
                            title="System metadata ignored"
                            style={{
                              display: "inline-block",
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              background: "rgba(100, 116, 139, 0.15)",
                              color: "#64748b",
                              textAlign: "center",
                              lineHeight: "20px",
                              fontWeight: "700",
                              fontSize: "11px",
                            }}
                          >
                            —
                          </span>
                        )}
                        {isFail && (
                          <span
                            title="Upload failed"
                            style={{
                              display: "inline-block",
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              background: "rgba(239, 68, 68, 0.2)",
                              color: "#ef4444",
                              textAlign: "center",
                              lineHeight: "20px",
                              fontWeight: "700",
                              fontSize: "11px",
                            }}
                          >
                            ✕
                          </span>
                        )}
                      </td>

                      {/* File Name & Path */}
                      <td style={{ padding: "10px 8px", verticalAlign: "top" }}>
                        <div style={{ fontWeight: "600", color: "var(--text-main)", wordBreak: "break-all" }}>
                          {item.filename || item.original_filename}
                        </div>
                        {item.relative_path && item.relative_path !== item.filename && (
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", fontFamily: "var(--font-mono, monospace)" }}>
                            📁 {item.relative_path}
                          </div>
                        )}
                      </td>

                      {/* File Size */}
                      <td style={{ padding: "10px 8px", verticalAlign: "top", color: "var(--text-secondary)", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {formatFileSize(item.file_size)}
                      </td>

                      {/* Details / Diagnostics */}
                      <td style={{ padding: "10px 8px", verticalAlign: "top" }}>
                        {isSuccess && (
                          <span style={{ color: "var(--status-success, #10b981)", fontSize: "12px" }}>
                            Assigned Repository ID #{item.id}
                          </span>
                        )}
                        {isDup && (
                          <div style={{ fontSize: "12px", color: "#d97706" }}>
                            {item.reason || "Identical checksum or path already in repository."}
                            {item.existing_id && (
                              <div style={{ fontSize: "11px", marginTop: "2px", color: "var(--text-muted)" }}>
                                Existing Record ID: #{item.existing_id}
                              </div>
                            )}
                          </div>
                        )}
                        {isIgnored && (
                          <div style={{ fontSize: "12px", color: "#64748b" }}>
                            {item.reason || "Operating-system metadata file ignored."}
                            <span
                              style={{
                                display: "inline-block",
                                marginLeft: "6px",
                                fontSize: "10px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: "rgba(100, 116, 139, 0.1)",
                                color: "#475569",
                                fontWeight: "600",
                              }}
                            >
                              OS METADATA
                            </span>
                          </div>
                        )}
                        {isFail && (
                          <div>
                            <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: "600" }}>
                              {item.error || "Upload failed."}
                            </div>
                            {item.category && (
                              <span
                                style={{
                                  display: "inline-block",
                                  marginTop: "3px",
                                  fontSize: "10px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(239, 68, 68, 0.1)",
                                  color: "#b91c1c",
                                  fontWeight: "700",
                                }}
                              >
                                {item.category}
                              </span>
                            )}
                            {item.retry_count > 0 && (
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "8px" }}>
                                Retried {item.retry_count} time(s)
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Row Action (Retry) */}
                      <td style={{ padding: "10px 8px", verticalAlign: "top", textAlign: "right" }}>
                        {isFail && onRetrySingle && item.fileObject && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => onRetrySingle(item)}
                            disabled={isRetrying}
                            style={{ fontSize: "11px", padding: "3px 8px" }}
                          >
                            Retry
                          </button>
                        )}
                        {isFail && !item.fileObject && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              fontStyle: "italic",
                            }}
                            title="File handle not available in historical record. Re-select file from your computer to retry."
                          >
                            Reselect to retry
                          </span>
                        )}
                        {isDup && item.existing_id && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Preserved
                          </span>
                        )}
                        {isIgnored && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Excluded
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-subtle, #f8fafc)",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Tip: Export CSV to keep an audit trail of ingested files or share failure logs with IT.
          </div>

          <button type="button" className="btn btn-primary" onClick={onClose} style={{ padding: "6px 20px" }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
