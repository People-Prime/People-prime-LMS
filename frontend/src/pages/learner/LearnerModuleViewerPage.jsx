import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { apiClient } from "../../services/api";
import SecurePdfViewer from "../../components/common/SecurePdfViewer";

/**
 * LearnerModuleViewerPage Component
 *
 * Dedicated clean new-tab page for viewing module training materials:
 * - Reads ?courseId=...&moduleId=...
 * - Fetches materials mapped to this module (/api/modules/:id/materials/).
 * - If single mapped file: directly renders full-screen browser preview without intermediate cards.
 * - If multiple mapped files: displays a clean file selector/tabs with previews of each mapped file.
 * - Does NOT display other modules or a crowded sidebar.
 * - Does NOT display module descriptions or course descriptions.
 * - Downloads are completely disabled for learners and trainers.
 * - Preserves a link to the Assessment & Certification Gate for completion tracking.
 */
export default function LearnerModuleViewerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, activePortal } = useAuth();
  const isAdmin = user?.role === "ADMIN" && activePortal !== "TRAINER" && activePortal !== "LEARNER";

  const courseIdParam = searchParams.get("courseId");
  const moduleIdParam = searchParams.get("moduleId");

  const [moduleData, setModuleData] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadModuleAndMaterials() {
      if (!moduleIdParam) {
        setError("No module was specified. Please return to your learning portal.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch module details and mapped materials concurrently
        const [modRes, matsRes] = await Promise.all([
          apiClient(`/modules/${moduleIdParam}/`),
          apiClient(`/modules/${moduleIdParam}/materials/`).catch(() => []),
        ]);

        if (!isMounted) return;

        setModuleData(modRes);
        const matsList = Array.isArray(matsRes) ? matsRes : [];
        setMaterials(matsList);

        if (matsList.length > 0) {
          setSelectedFileId(matsList[0].file_id);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load module materials.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadModuleAndMaterials();

    return () => {
      isMounted = false;
    };
  }, [moduleIdParam]);

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

  const handleOpenAssessment = () => {
    // Opens the interactive module assessment directly in reader mode
    const targetModuleId = moduleIdParam || moduleData?.id;
    const rawCourseId =
      courseIdParam && courseIdParam !== "null" && courseIdParam !== "undefined"
        ? courseIdParam
        : moduleData?.course;
    const params = new URLSearchParams();
    if (rawCourseId) {
      params.set("courseId", String(rawCourseId));
    }
    if (targetModuleId) {
      params.set("moduleId", String(targetModuleId));
    }
    if (moduleData?.level) {
      params.set("levelId", String(moduleData.level));
    }
    params.set("target", "assessment");
    window.location.href = `/learner/reader?${params.toString()}#assessment`;
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div className="spinner" style={{ width: "32px", height: "32px", marginBottom: "16px" }}></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", fontWeight: "500" }}>
          Opening training document...
        </p>
      </div>
    );
  }

  if (error || !moduleData) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: "520px",
            width: "100%",
            padding: "32px",
            textAlign: "center",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#EF4444",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
            Unable to Load Module Material
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px", lineHeight: "1.5" }}>
            {error || "The requested module could not be found."}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            style={{ padding: "8px 18px", fontSize: "13px" }}
          >
            Close Tab
          </button>
        </div>
      </div>
    );
  }

  // Active file object
  const activeFile = materials.find((m) => m.file_id === selectedFileId) || materials[0];
  const rawFileUrl = activeFile?.download_url ? `${activeFile.download_url}?inline=true` : null;
  // Append PDF viewer hash parameters to suppress default browser toolbar and navigation panes
  const fileUrl = rawFileUrl ? `${rawFileUrl}#toolbar=0&navpanes=0&scrollbar=1` : null;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0f172a",
        overflow: "hidden",
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          backgroundColor: "#1e293b",
          borderBottom: "1px solid #334155",
          padding: "10px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
          gap: "14px",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span
            style={{
              fontWeight: "600",
              fontSize: "15px",
              color: "#f8fafc",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={moduleData.name}
          >
            {moduleData.name}
          </span>
          {activeFile && (
            <span
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              &bull; 📄 {activeFile.filename}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {/* Assessment & Rating Shortcut - Strictly visible only for Learners */}
          {user?.role === "LEARNER" && !isAdmin && activePortal !== "TRAINER" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleOpenAssessment}
              style={{
                padding: "5px 12px",
                fontSize: "12px",
                backgroundColor: "rgba(99, 102, 241, 0.15)",
                color: "#a5b4fc",
                borderColor: "rgba(99, 102, 241, 0.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              title="Open Module Assessment, Retakes & Feedback"
            >
              <span>📝 Assessment &amp; Feedback</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              backgroundColor: "#334155",
              color: "#f8fafc",
              borderColor: "#475569",
            }}
            title="Close this learning tab"
          >
            &times; Close
          </button>
        </div>
      </header>

      {/* Multi-File Tab Bar (Displayed when module has multiple mapped training files) */}
      {materials.length > 1 && (
        <div
          style={{
            backgroundColor: "#0f172a",
            borderBottom: "1px solid #1e293b",
            padding: "8px 20px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: "700", letterSpacing: "0.05em", marginRight: "6px", flexShrink: 0 }}>
            Training Files ({materials.length}):
          </span>
          {materials.map((mat) => {
            const isSelected = mat.file_id === selectedFileId;
            return (
              <button
                key={mat.file_id}
                type="button"
                onClick={() => setSelectedFileId(mat.file_id)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: isSelected ? "600" : "400",
                  backgroundColor: isSelected ? "#2563eb" : "#1e293b",
                  color: isSelected ? "#ffffff" : "#94a3b8",
                  border: isSelected ? "1px solid #3b82f6" : "1px solid #334155",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
                title={mat.filename}
              >
                <span>{mat.file_type || "DOC"}</span>
                <span style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {mat.filename}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main File Preview Area */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", backgroundColor: "#f1f5f9", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {materials.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>📂</div>
            <h3 style={{ color: "#f8fafc", margin: "0 0 6px 0", fontSize: "16px" }}>
              No Training Documents Attached
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", maxWidth: "420px" }}>
              No reference materials have been mapped to this module yet. You can still complete the module questions and verification gate.
            </p>
            {user?.role === "LEARNER" && !isAdmin && activePortal !== "TRAINER" && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenAssessment}
                style={{ padding: "8px 16px", fontSize: "13px" }}
              >
                Open Module Assessment &rarr;
              </button>
            )}
          </div>
        ) : activeFile && rawFileUrl ? (
          ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes((activeFile.file_type || "").toUpperCase()) ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                overflow: "auto",
                backgroundColor: "#1e293b",
              }}
            >
              <img
                src={rawFileUrl}
                alt={activeFile.filename}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                  borderRadius: "4px",
                }}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          ) : (
            <SecurePdfViewer url={rawFileUrl} title={activeFile.filename} />
          )
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
            }}
          >
            Select a document above to preview
          </div>
        )}
      </div>
    </div>
  );
}

