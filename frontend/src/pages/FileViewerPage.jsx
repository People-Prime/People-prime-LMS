import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiClient, getTrainingFileDownloadUrl } from "../services/api";
import SecurePdfViewer from "../components/common/SecurePdfViewer";

/**
 * FileViewerPage Component
 *
 * Dedicated clean new-tab preview page for individual training files:
 * - Reads query params: ?fileId=... or ?url=...&title=...
 * - Authenticated access check.
 * - Application-controlled SecurePdfViewer for PDFs and converted DOCX.
 * - Clean view for supported images with right-click disabled.
 * - Completely removes browser native PDF toolbar (No Save, Download, or Print).
 */
export default function FileViewerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, activePortal } = useAuth();
  const isAdmin = user?.role === "ADMIN" && activePortal !== "TRAINER" && activePortal !== "LEARNER";

  const fileIdParam = searchParams.get("fileId");
  const rawUrlParam = searchParams.get("url");
  const titleParam = searchParams.get("title");

  const [fileDetails, setFileDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function resolveFile() {
      if (fileIdParam) {
        try {
          setLoading(true);
          setError(null);
          // Attempt to fetch file metadata if available
          let detail = null;
          if (isAdmin) {
            try {
              detail = await apiClient(`/admin/training-files/${fileIdParam}/`);
            } catch {
              // Non-admin or direct query
            }
          }
          if (isMounted) {
            setFileDetails(detail);
          }
        } catch (err) {
          if (isMounted) {
            setError(err.message || "Failed to load file details.");
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      } else if (rawUrlParam) {
        setLoading(false);
      } else {
        setError("No training document was specified for preview.");
        setLoading(false);
      }
    }

    resolveFile();

    return () => {
      isMounted = false;
    };
  }, [fileIdParam, rawUrlParam, isAdmin]);

  const rawPreviewUrl = fileIdParam ? getTrainingFileDownloadUrl(fileIdParam) : rawUrlParam;
  const fileName =
    titleParam ||
    fileDetails?.filename ||
    (rawPreviewUrl ? decodeURIComponent(rawPreviewUrl.split("/").pop().split("?")[0]) : "Training Document");

  const ext = (fileName.split(".").pop() || "").toUpperCase();
  const isImage = ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(ext);
  const isDocx = ["DOCX", "DOC"].includes(ext);
  const isPdf = ext === "PDF";
  const isSupportedPreview = isPdf || isDocx || isImage;

  // For Project resources/submissions or training files that require server-side DOCX preview conversion,
  // append ?preview=true if not already present
  const previewUrl = (() => {
    if (!rawPreviewUrl) return "";
    if (isDocx && !rawPreviewUrl.includes("preview=")) {
      return rawPreviewUrl.includes("?") ? `${rawPreviewUrl}&preview=true` : `${rawPreviewUrl}?preview=true`;
    }
    return rawPreviewUrl;
  })();

  // Original download URL without preview flag for direct file download
  const downloadUrl = (() => {
    if (!rawPreviewUrl) return "";
    // Remove preview=true if present
    try {
      const parsed = new URL(rawPreviewUrl, window.location.origin);
      parsed.searchParams.delete("preview");
      return parsed.pathname + (parsed.search ? parsed.search : "");
    } catch {
      return rawPreviewUrl.replace(/[?&]preview=true/g, "").replace(/\?$/, "");
    }
  })();

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      if (user?.role === "TRAINER" || activePortal === "TRAINER") {
        navigate("/trainer");
      } else if (isAdmin) {
        navigate("/admin");
      } else {
        navigate("/learner");
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#f8fafc",
        color: "#0f172a",
        overflow: "hidden",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Application Bar (Light Theme) */}
      <header
        style={{
          height: "52px",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span
            style={{
              fontSize: "11px",
              padding: "3px 8px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              borderRadius: "4px",
              fontWeight: "700",
              letterSpacing: "0.5px",
            }}
          >
            {ext || "DOC"}
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: "600",
              color: "#0f172a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={fileName}
          >
            {fileName}
          </h2>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>&bull; Read-Only Preview</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={fileName}
              className="btn btn-secondary"
              style={{
                padding: "5px 12px",
                fontSize: "12px",
                backgroundColor: "#f1f5f9",
                color: "#1e293b",
                borderColor: "#cbd5e1",
                fontWeight: "500",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
              title="Download original document file"
            >
              <span>⬇</span> Download
            </a>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            style={{
              padding: "5px 14px",
              fontSize: "12px",
              backgroundColor: "#f1f5f9",
              color: "#1e293b",
              borderColor: "#cbd5e1",
              fontWeight: "500",
            }}
            title="Close this document tab"
          >
            &times; Close
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, minHeight: 0, height: "calc(100vh - 52px)", position: "relative", backgroundColor: "#f1f5f9", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {loading ? (
          <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#475569" }}>
            <div className="spinner" style={{ marginRight: "12px" }}></div>
            <span>Loading document viewer...</span>
          </div>
        ) : error ? (
          <div
            style={{
              display: "flex",
              height: "100%",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#991b1b",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#991b1b" }}>Preview Error</h3>
            <p style={{ margin: 0, fontSize: "13px" }}>{error}</p>
          </div>
        ) : !isSupportedPreview ? (
          <div
            style={{
              display: "flex",
              height: "100%",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#334155",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "44px", marginBottom: "16px" }}>📄</div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "17px", color: "#0f172a", fontWeight: "600" }}>
              Preview is not available for this file type
            </h3>
            <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#64748b", maxWidth: "440px", lineHeight: "1.5" }}>
              Direct inline preview is not supported for <strong>{ext || "this format"}</strong> documents. You can download the original file to view it on your device.
            </p>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={fileName}
                className="btn btn-primary"
                style={{
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: "600",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>⬇</span> Download {ext ? `${ext} File` : "File"}
              </a>
            )}
          </div>
        ) : isImage ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              overflow: "auto",
              backgroundColor: "#f1f5f9",
            }}
          >
            <img
              src={previewUrl}
              alt={fileName}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
                borderRadius: "4px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
              }}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        ) : (
          <SecurePdfViewer url={previewUrl} title={fileName} />
        )}
      </main>
    </div>
  );
}
