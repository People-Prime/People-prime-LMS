import { useState } from "react";
import { getTrainingFileDownloadUrl } from "../../../services/api";

const CATEGORY_COLORS = {
  PRIMARY_INSTRUCTIONAL: "badge-primary",
  SUPPLEMENTARY_REFERENCE: "badge-info",
  DOWNLOADABLE_PDF: "badge-secondary",
  IMAGE_INFOGRAPHIC: "badge-warning",
  ASSESSMENT_RUBRIC: "badge-danger",
  PRACTICAL_EXERCISE: "badge-success",
  UNCLASSIFIED: "badge-secondary",
};

const CATEGORY_LABELS = {
  PRIMARY_INSTRUCTIONAL: "Primary",
  SUPPLEMENTARY_REFERENCE: "Reference",
  DOWNLOADABLE_PDF: "Downloadable PDF",
  IMAGE_INFOGRAPHIC: "Infographic",
  ASSESSMENT_RUBRIC: "Rubric / Assessment",
  PRACTICAL_EXERCISE: "Exercise",
  UNCLASSIFIED: "Unclassified",
};

export default function CoursePreviewModal({
  show,
  course,
  modules = [],
  submodules = [],
  mappings = [],
  clusters = [],
  onClose,
}) {
  if (!show || !course) return null;

  // Filter modules for this course, ordered by sequence
  const courseModules = modules
    .filter((m) => m.course === course.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Active module selection state
  const [activeModuleId, setActiveModuleId] = useState(courseModules[0]?.id || null);

  // Active submodule / lesson selection state
  const activeModule = courseModules.find((m) => m.id === activeModuleId) || courseModules[0];
  const activeSubmodules = submodules
    .filter((s) => s.module === activeModule?.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const [activeSubmoduleId, setActiveSubmoduleId] = useState(activeSubmodules[0]?.id || null);
  const activeSubmodule = activeSubmodules.find((s) => s.id === activeSubmoduleId) || activeSubmodules[0];

  // Material preview modal state (for in-dialog direct viewer)
  const [previewingMaterial, setPreviewingMaterial] = useState(null);

  // Attached materials for the active submodule
  const lessonMaterials = mappings.filter((m) => m.submodule === activeSubmodule?.id);

  // Attached materials for the active module (unassigned to a specific submodule)
  const moduleGeneralMaterials = mappings.filter(
    (m) => m.module === activeModule?.id && !m.submodule
  );

  // Course-level cluster materials
  const courseClusterIds = clusters.filter((cl) => cl.course === course.id).map((cl) => cl.id);
  const clusterMaterials = mappings.filter(
    (m) => courseClusterIds.includes(m.cluster) && !m.module && !m.submodule
  );

  const handleOpenMaterialPreview = (mapping) => {
    const fileType = (mapping.file_type || mapping.training_file_detail?.file_type || "").toUpperCase();
    const fileId = mapping.training_file_id || mapping.file_id || mapping.training_file;
    const downloadUrl = getTrainingFileDownloadUrl(fileId);
    const fileName = mapping.filename || mapping.training_file_detail?.filename || `File #${fileId}`;

    if (["PDF", "DOCX", "DOC", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(fileType)) {
      const previewUrl = ["PDF", "DOCX", "DOC"].includes(fileType)
        ? `${downloadUrl}#toolbar=0&navpanes=0&scrollbar=1`
        : downloadUrl;
      setPreviewingMaterial({
        id: fileId,
        fileName,
        fileType,
        url: previewUrl,
      });
    } else {
      setPreviewingMaterial({
        id: fileId,
        fileName,
        fileType,
        unsupported: true,
      });
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
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "20px",
      }}
    >
      <div
        className="modal-container"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "1100px",
          height: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 30px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
      >
        {/* Preview Top Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                backgroundColor: "#4f46e5",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: "700",
                padding: "3px 8px",
                borderRadius: "4px",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              Admin Read-Only Preview
            </span>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#111827" }}>
              {course.name}
            </h3>
            <span className="badge badge-info">{course.code}</span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: "600",
                backgroundColor: course.status === "PUBLISHED" ? "#def7ec" : "#f3f4f6",
                color: course.status === "PUBLISHED" ? "#03543f" : "#374151",
              }}
            >
              {course.status}
            </span>
            <span style={{ fontSize: "11px", color: "#6b7280" }}>
              • Read-Only Mode (Learner progress and write mutations disabled)
            </span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ padding: "5px 12px", fontSize: "13px" }}
          >
            Close Preview &times;
          </button>
        </div>

        {/* Preview Split Layout Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left Sidebar: Curriculum Navigation */}
          <div
            style={{
              width: "320px",
              backgroundColor: "#f9fafb",
              borderRight: "1px solid #e5e7eb",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              overflowY: "auto",
            }}
          >
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", backgroundColor: "#f3f4f6" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Course Modules ({courseModules.length})
              </span>
            </div>

            {courseModules.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
                No modules created yet under this course.
              </div>
            ) : (
              <div style={{ padding: "8px" }}>
                {courseModules.map((m) => {
                  const isModActive = m.id === activeModule?.id;
                  const modSubmodules = submodules.filter((s) => s.module === m.id);

                  return (
                    <div key={m.id} style={{ marginBottom: "8px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModuleId(m.id);
                          const firstSub = modSubmodules[0];
                          if (firstSub) setActiveSubmoduleId(firstSub.id);
                        }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: isModActive ? "1px solid #6366f1" : "1px solid transparent",
                          backgroundColor: isModActive ? "#eef2ff" : "transparent",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", fontWeight: "600", color: isModActive ? "#4f46e5" : "#6b7280" }}>
                            Module {m.order}: {m.code}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              borderRadius: "10px",
                              backgroundColor: isModActive ? "#c7d2fe" : "#e5e7eb",
                              color: isModActive ? "#312e81" : "#4b5563",
                            }}
                          >
                            {modSubmodules.length} Lessons
                          </span>
                        </div>
                        <strong style={{ fontSize: "13px", color: isModActive ? "#1e1b4b" : "#111827" }}>
                          {m.name}
                        </strong>
                      </button>

                      {/* Submodule List for active module */}
                      {isModActive && modSubmodules.length > 0 && (
                        <div style={{ paddingLeft: "16px", marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                          {modSubmodules.map((sub) => {
                            const isSubActive = sub.id === activeSubmodule?.id;
                            const subMats = mappings.filter((mp) => mp.submodule === sub.id);

                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => setActiveSubmoduleId(sub.id)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "6px 10px",
                                  borderRadius: "4px",
                                  border: isSubActive ? "1px solid #818cf8" : "1px solid transparent",
                                  backgroundColor: isSubActive ? "#ffffff" : "transparent",
                                  cursor: "pointer",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  boxShadow: isSubActive ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: isSubActive ? "600" : "400",
                                    color: isSubActive ? "#4338ca" : "#374151",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {sub.order}. {sub.name}
                                </span>
                                {subMats.length > 0 && (
                                  <span style={{ fontSize: "10px", color: "#6b7280" }}>
                                    📎 {subMats.length}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Main Panel: Lesson Content & Materials View */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: "24px",
              backgroundColor: "#ffffff",
            }}
          >
            {activeSubmodule ? (
              <div style={{ maxWidth: "800px", width: "100%" }}>
                {/* Lesson Header */}
                <div style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: "14px", marginBottom: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span className="badge badge-purple">
                      Module {activeModule?.order} • Lesson {activeSubmodule.order}
                    </span>
                    <span className="badge badge-info">{activeSubmodule.status}</span>
                    {activeSubmodule.estimated_duration_minutes > 0 && (
                      <span className="badge badge-secondary">
                        ⏱️ ~{activeSubmodule.estimated_duration_minutes} min
                      </span>
                    )}
                  </div>
                  <h2 style={{ margin: "4px 0 6px 0", fontSize: "20px", fontWeight: "700", color: "#111827" }}>
                    {activeSubmodule.name}
                  </h2>
                  <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
                    Course: <strong>{course.name}</strong> ({course.code}) &gt; Module: <strong>{activeModule?.name}</strong>
                  </p>
                </div>

                {/* Lesson Written Text / Overview Content */}
                <div style={{ marginBottom: "24px" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "#4b5563" }}>
                    Lesson Content & Overview
                  </h4>
                  <div
                    style={{
                      backgroundColor: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      padding: "16px 18px",
                      fontSize: "14px",
                      lineHeight: "1.65",
                      color: "#1f2937",
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                    }}
                  >
                    {activeSubmodule.description && activeSubmodule.description.trim() ? (
                      activeSubmodule.description
                    ) : (
                      <span style={{ fontStyle: "italic", color: "#9ca3af" }}>
                        No extended written text provided for this submodule.
                      </span>
                    )}
                  </div>
                </div>

                {/* Attached Lesson Training Materials */}
                <div style={{ marginBottom: "24px" }}>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "#4b5563" }}>
                    Attached Training Documents ({lessonMaterials.length})
                  </h4>

                  {lessonMaterials.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "13px", fontStyle: "italic", color: "#9ca3af" }}>
                      No training materials attached to this lesson.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {lessonMaterials.map((m) => {
                        const fileName = m.filename || m.training_file_detail?.filename || `File #${m.training_file_id || m.file_id || m.training_file}`;
                        const fileType = (m.file_type || m.training_file_detail?.file_type || "FILE").toUpperCase();
                        const isPreviewable = ["PDF", "PNG", "JPG", "JPEG", "WEBP", "SVG"].includes(fileType);

                        return (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "10px 14px",
                              backgroundColor: "#f9fafb",
                              border: "1px solid #e5e7eb",
                              borderRadius: "6px",
                              gap: "10px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                              <span className={`badge ${fileType === "PDF" ? "badge-danger" : "badge-primary"}`} style={{ fontSize: "10px" }}>
                                {fileType}
                              </span>
                              <span style={{ fontSize: "13px", fontWeight: "500", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {fileName}
                              </span>
                              <span className={`badge ${CATEGORY_COLORS[m.category] || "badge-secondary"}`} style={{ fontSize: "10px" }}>
                                {CATEGORY_LABELS[m.category] || m.category}
                              </span>
                            </div>

                            <div style={{ display: "flex", gap: "8px" }}>
                              {isPreviewable ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleOpenMaterialPreview(m)}
                                  style={{ padding: "4px 10px", fontSize: "12px", color: "#4f46e5" }}
                                >
                                  Preview File
                                </button>
                              ) : (
                                <span
                                  className="badge badge-secondary"
                                  style={{ fontSize: "11px", padding: "4px 8px", fontStyle: "italic" }}
                                >
                                  Preview unavailable
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Additional Module-level / Cluster Resources if any */}
                {(moduleGeneralMaterials.length > 0 || clusterMaterials.length > 0) && (
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "18px", marginTop: "18px" }}>
                    <h4 style={{ margin: "0 0 10px 0", fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "#6b7280" }}>
                      Additional Supporting Module / Topic Materials
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[...moduleGeneralMaterials, ...clusterMaterials].map((m) => {
                        const fileName = m.filename || m.training_file_detail?.filename || `File #${m.training_file_id || m.file_id || m.training_file}`;
                        const fileType = (m.file_type || m.training_file_detail?.file_type || "FILE").toUpperCase();

                        return (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 10px",
                              backgroundColor: "#f3f4f6",
                              borderRadius: "4px",
                              fontSize: "12px",
                            }}
                          >
                            <span style={{ color: "#374151" }}>📎 {fileName} ({fileType})</span>
                            {["PDF", "PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(fileType) ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleOpenMaterialPreview(m)}
                                style={{ padding: "2px 8px", fontSize: "11px" }}
                              >
                                Preview
                              </button>
                            ) : (
                              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
                                Preview unavailable
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
                Select a module and lesson from the navigation sidebar to preview content.
              </div>
            )}
          </div>
        </div>

        {/* In-Dialog Material Direct Preview Overlay */}
        {previewingMaterial && (
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
              zIndex: 1200,
              padding: "24px",
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                width: "100%",
                maxWidth: "900px",
                height: "85vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 20px 25px rgba(0,0,0,0.3)",
              }}
            >
              <div
                style={{
                  padding: "12px 18px",
                  borderBottom: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="badge badge-primary">{previewingMaterial.fileType}</span>
                  <strong style={{ fontSize: "14px", color: "#111827" }}>{previewingMaterial.fileName}</strong>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {!previewingMaterial.unsupported && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => window.open(previewingMaterial.url, "_blank")}
                      style={{ padding: "4px 10px", fontSize: "12px" }}
                    >
                      Open in New Tab
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPreviewingMaterial(null)}
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                  >
                    &times; Close
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, backgroundColor: "#f3f4f6", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
                {previewingMaterial.unsupported ? (
                  <div style={{ textAlign: "center", maxWidth: "420px" }}>
                    <div style={{ fontSize: "36px", marginBottom: "12px" }}>📄</div>
                    <h4 style={{ fontSize: "16px", fontWeight: "600", color: "#111827", marginBottom: "8px" }}>
                      Preview Unavailable for this Format
                    </h4>
                    <p style={{ fontSize: "13px", color: "#6b7280", lineHeight: "1.5", margin: 0 }}>
                      Direct inline preview is not supported for <strong>{previewingMaterial.fileType}</strong> documents, and downloads are restricted across the LMS.
                    </p>
                  </div>
                ) : ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(previewingMaterial.fileType) ? (
                  <img
                    src={previewingMaterial.url}
                    alt={previewingMaterial.fileName}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <iframe
                    src={previewingMaterial.url}
                    title={previewingMaterial.fileName}
                    className="lms-document-viewer-container"
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ width: "100%", height: "100%", border: "none" }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

