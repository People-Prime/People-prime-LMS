import React, { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Set worker source to the local static worker file in /public
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Individual PDF Page Renderer
 * Renders a specific page canvas with high-DPI scaling and cancellation safety.
 */
function PdfPageItem({ pdfDoc, pageNum, scale }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdfDoc) return;
    let isCancelled = false;

    pdfDoc.getPage(pageNum).then((page) => {
      if (isCancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext("2d");
      const viewport = page.getViewport({ scale });

      // Support high DPI screens
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      // Cancel previous render task if active
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const renderContext = {
        canvasContext: context,
        transform,
        viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      renderTask.promise
        .then(() => {
          if (!isCancelled) {
            setRendered(true);
          }
        })
        .catch((err) => {
          if (err.name !== "RenderingCancelledException") {
            console.error(`PDF page ${pageNum} render error:`, err);
          }
        });
    });

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div
      style={{
        marginBottom: "20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)",
          borderRadius: "4px",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "#94a3b8",
          marginTop: "6px",
          fontWeight: "500",
        }}
      >
        Page {pageNum}
      </div>
    </div>
  );
}

/**
 * SecurePdfViewer Component
 *
 * Light-themed application-controlled PDF.js viewer:
 * - Continuous vertical scrolling for all document pages.
 * - NO browser native PDF toolbar.
 * - NO Save, Download, or Print buttons.
 * - Clean light theme toolbar and canvas container.
 * - Zoom controls (Zoom In, Zoom Out, Reset 100%, Fit Width).
 * - Right-click disabled on document canvas container to prevent native context save menus.
 */
export default function SecurePdfViewer({ url, title }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const containerRef = useRef(null);

  // Load the PDF document
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const loadingTask = pdfjsLib.getDocument({
      url,
      withCredentials: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (!isCancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("PDF.js loading error:", err);
          setError(err.message || "Failed to load document preview.");
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      if (loadingTask) {
        loadingTask.destroy();
      }
    };
  }, [url]);

  const handleZoomIn = () => {
    setScale((s) => Math.min(3.0, +(s + 0.2).toFixed(1)));
  };

  const handleZoomOut = () => {
    setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)));
  };

  const handleResetZoom = () => {
    setScale(1.2);
  };

  const handleFitWidth = () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 64; // account for margins/padding
    if (containerWidth > 300) {
      // Standard PDF page width is around 612-800 points
      setScale(+(containerWidth / 780).toFixed(2));
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        maxHeight: "100%",
        minHeight: 0,
        backgroundColor: "#f1f5f9",
        userSelect: "none",
        position: "relative",
        overflow: "hidden",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Light Theme Viewer Toolbar (NO Save, Download, or Print controls) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 20px",
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          color: "#0f172a",
          fontSize: "13px",
          flexWrap: "wrap",
          gap: "10px",
          zIndex: 10,
          flexShrink: 0,
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
        }}
      >
        {/* Left: Document Info & Total Pages */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {title && (
            <span
              style={{
                fontWeight: "600",
                color: "#1e293b",
                maxWidth: "320px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "13px",
              }}
              title={title}
            >
              {title}
            </span>
          )}
          {numPages > 0 && (
            <span
              style={{
                fontSize: "12px",
                color: "#64748b",
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: "2px 8px",
                borderRadius: "12px",
              }}
            >
              {numPages} {numPages === 1 ? "Page" : "Pages"}
            </span>
          )}
        </div>

        {/* Right: Zoom Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleZoomOut}
            disabled={scale <= 0.5 || loading}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              backgroundColor: "#ffffff",
              color: "#334155",
              borderColor: "#cbd5e1",
              fontWeight: "600",
            }}
            title="Zoom Out"
          >
            &minus;
          </button>
          <span
            style={{
              fontSize: "12px",
              color: "#334155",
              minWidth: "48px",
              textAlign: "center",
              cursor: "pointer",
              fontWeight: "500",
              userSelect: "none",
            }}
            onClick={handleResetZoom}
            title="Click to reset zoom to 100%"
          >
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleZoomIn}
            disabled={scale >= 3.0 || loading}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              backgroundColor: "#ffffff",
              color: "#334155",
              borderColor: "#cbd5e1",
              fontWeight: "600",
            }}
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleFitWidth}
            disabled={loading}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              backgroundColor: "#ffffff",
              color: "#334155",
              borderColor: "#cbd5e1",
              marginLeft: "6px",
            }}
            title="Fit to Width"
          >
            Fit Width
          </button>
        </div>
      </div>

      {/* Main Continuous Scroll Viewport */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          height: "100%",
          maxHeight: "100%",
          overflowY: "scroll",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "24px 16px",
          backgroundColor: "#f1f5f9",
          minHeight: 0,
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", color: "#475569", padding: "60px 20px" }}>
            <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: "500" }}>Loading document preview...</p>
          </div>
        )}

        {error && (
          <div
            style={{
              textAlign: "center",
              color: "#991b1b",
              backgroundColor: "#fee2e2",
              border: "1px solid #f87171",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "500px",
              margin: "40px auto",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚠️</div>
            <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", color: "#991b1b" }}>Unable to Display Document</h4>
            <p style={{ margin: 0, fontSize: "13px" }}>{error}</p>
          </div>
        )}

        {!loading && !error && pdfDoc && numPages > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            {Array.from({ length: numPages }, (_, idx) => idx + 1).map((pageNum) => (
              <PdfPageItem
                key={`page-${pageNum}`}
                pdfDoc={pdfDoc}
                pageNum={pageNum}
                scale={scale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

