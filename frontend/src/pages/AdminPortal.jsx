import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import AdminOverviewTab from "./admin/AdminOverviewTab";
import AdminUsersTab from "./admin/AdminUsersTab";
import AdminCurriculumTab from "./admin/AdminCurriculumTab";
import AdminCohortsTab from "./admin/AdminCohortsTab";
import AdminReportsTab from "./admin/AdminReportsTab";
import AdminTrainerWorkloadTab from "./admin/AdminTrainerWorkloadTab";

export default function AdminPortal() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Inspect URL on initial load for legacy or direct sub-paths / query parameters
  const getInitialState = () => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab");
    const viewParam = searchParams.get("view");
    const pathname = location.pathname.toLowerCase();

    // 1. Legacy /admin/training-files path or ?tab=training-files
    if (pathname.includes("/training-files") || tabParam === "training-files" || (tabParam === "curriculum" && viewParam === "repository")) {
      return { tab: "curriculum", view: "repository" };
    }

    // 2. Direct query param tab matching
    if (tabParam && ["overview", "users", "curriculum", "cohorts", "learners", "trainer-workload"].includes(tabParam)) {
      return { tab: tabParam, view: viewParam || null };
    }

    return { tab: "overview", view: null };
  };

  const initialConfig = getInitialState();
  const [activeTab, setActiveTab] = useState(initialConfig.tab);
  const [curriculumView, setCurriculumView] = useState(initialConfig.view);

  // Synchronize on browser history (Back / Forward) or URL path/query changes
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab");
    const viewParam = searchParams.get("view");
    const pathname = location.pathname.toLowerCase();

    if (pathname.includes("/training-files") || tabParam === "training-files") {
      // Cleanly replace legacy URL with canonical URL in history
      navigate("/admin?tab=curriculum&view=repository", { replace: true });
      setActiveTab("curriculum");
      setCurriculumView("repository");
      return;
    }

    if (tabParam === "curriculum" && viewParam === "repository") {
      setActiveTab("curriculum");
      setCurriculumView("repository");
      return;
    }

    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
      setCurriculumView(viewParam || null);
    }
  }, [location.pathname, location.search, navigate]);

  // Handle sidebar navigation changes and update URL query params
  const handleTabChange = (targetTab) => {
    if (targetTab === "training-files") {
      // Legacy sidebar fallback if ever triggered
      setActiveTab("curriculum");
      setCurriculumView("repository");
      navigate("/admin?tab=curriculum&view=repository");
      return;
    }

    setActiveTab(targetTab);
    setCurriculumView(null);
    if (targetTab === "overview") {
      navigate("/admin");
    } else {
      navigate(`/admin?tab=${targetTab}`);
    }
  };

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={handleTabChange}>
      <div className="dashboard-page-header">
        <h1 className="dashboard-title">Administrator Command Center</h1>
        <p className="dashboard-subtitle">
          Welcome back, {user?.username}. You are authenticated as an LMS Administrator with full system privileges.
        </p>
      </div>

      {/* Render active section tab dynamically */}
      {activeTab === "overview" && <AdminOverviewTab />}
      {activeTab === "users" && <AdminUsersTab />}
      {activeTab === "curriculum" && (
        <AdminCurriculumTab
          initialWorkspaceTab={curriculumView}
          onWorkspaceTabChange={({ course, tab }) => {
            if (!course && tab === "repository") {
              navigate("/admin?tab=curriculum&view=repository");
              setCurriculumView("repository");
            } else if (!course && tab === "catalog") {
              navigate("/admin?tab=curriculum");
              setCurriculumView(null);
            }
          }}
        />
      )}
      {activeTab === "cohorts" && <AdminCohortsTab />}
      {activeTab === "learners" && <AdminReportsTab portalRole="ADMIN" />}
      {activeTab === "trainer-workload" && <AdminTrainerWorkloadTab />}
    </DashboardLayout>
  );
}
