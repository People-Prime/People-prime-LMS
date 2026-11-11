import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import RouteGuard from "./components/RouteGuard";
import LoginPage from "./pages/LoginPage";
import AdminPortal from "./pages/AdminPortal";
import TrainerPortal from "./pages/TrainerPortal";
import LearnerPortal from "./pages/LearnerPortal";
import LearnerReaderPage from "./pages/learner/LearnerReaderPage";
import LearnerModuleViewerPage from "./pages/learner/LearnerModuleViewerPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import NotFoundPage from "./pages/NotFoundPage";
import "./App.css";

/**
 * Root Redirector component
 * Inspects active authenticated user and smoothly routes to their home portal.
 */
function RootRedirect() {
  const { user, isAuthenticated, isLoading, activePortal } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <div className="spinner"></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          Initializing People Prime LMS...
        </p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = user.role;
  if (role === "ADMIN") {
    if (activePortal === "TRAINER") return <Navigate to="/trainer" replace />;
    if (activePortal === "LEARNER") return <Navigate to="/learner" replace />;
    return <Navigate to="/admin" replace />;
  }
  if (role === "TRAINER") return <Navigate to="/trainer" replace />;
  if (role === "LEARNER") return <Navigate to="/learner" replace />;

  return <Navigate to="/unauthorized" replace />;
}

export default function App() {
  // Global shortcut prevention for Save (Ctrl+S / Cmd+S) and Print (Ctrl+P / Cmd+P)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (!isCtrlOrMeta) return;

      const key = (e.key || "").toLowerCase();
      // Block Ctrl/Cmd + S (Save)
      // Block Ctrl/Cmd + P (Print)
      if (key === "s" || key === "p") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, { capture: true });
    };
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Root Redirect based on session */}
          <Route path="/" element={<RootRedirect />} />

          {/* Role-Protected Portals */}
          <Route
            path="/admin/*"
            element={
              <RouteGuard allowedRoles={["ADMIN"]}>
                <AdminPortal />
              </RouteGuard>
            }
          />

          <Route
            path="/trainer/*"
            element={
              <RouteGuard allowedRoles={["TRAINER", "ADMIN"]}>
                <TrainerPortal />
              </RouteGuard>
            }
          />

          {/* Dedicated Full-Page Standalone Learning Tab */}
          <Route
            path="/learner/reader"
            element={
              <RouteGuard allowedRoles={["LEARNER", "TRAINER", "ADMIN"]}>
                <LearnerReaderPage />
              </RouteGuard>
            }
          />

          {/* Dedicated Clean Single/Multi-File Training Material Viewer */}
          <Route
            path="/learner/module-viewer"
            element={
              <RouteGuard allowedRoles={["LEARNER", "TRAINER", "ADMIN"]}>
                <LearnerModuleViewerPage />
              </RouteGuard>
            }
          />

          <Route
            path="/learner/*"
            element={
              <RouteGuard allowedRoles={["LEARNER", "ADMIN"]}>
                <LearnerPortal />
              </RouteGuard>
            }
          />

          {/* Access Denied Route */}
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* 404 Catch-All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
