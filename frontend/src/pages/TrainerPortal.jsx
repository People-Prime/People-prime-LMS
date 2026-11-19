import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import TrainerOverviewTab from "./trainer/TrainerOverviewTab";
import TrainerCoursesTab from "./trainer/TrainerCoursesTab";
import TrainerProjectsTab from "./trainer/TrainerProjectsTab";
import AdminReportsTab from "./admin/AdminReportsTab";

export default function TrainerPortal() {
  const { user, activePortal } = useAuth();
  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'courses' | 'learners' | 'projects'

  const isAdminPreview = user?.role === "ADMIN" && activePortal === "TRAINER";

  const handleNavigateToLearners = () => {
    setActiveTab("learners");
  };

  const handleNavigateToCourses = () => {
    setActiveTab("courses");
  };

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="dashboard-page-header">
        <h1 className="dashboard-title">
          {isAdminPreview
            ? "Instructor Portal Preview"
            : activeTab === "overview"
            ? "Trainer Oversight Command Center"
            : activeTab === "courses"
            ? "Published Curriculum Catalogue"
            : activeTab === "projects"
            ? "Assigned Projects & Submissions Oversight"
            : "Trainer Reports & Completion Analytics"}
        </h1>
        <p className="dashboard-subtitle">
          {isAdminPreview
            ? "Previewing the Instructor portal interface. This generic view illustrates layout and structure without accessing individual trainer records."
            : activeTab === "overview"
            ? `Welcome back, ${user?.username}. You are authenticated as an LMS Trainer with cohort-scoped access.`
            : activeTab === "courses"
            ? "Inspect all Administrator-published courses, modules, submodules, and supplementary learning documents in read-only mode."
            : activeTab === "projects"
            ? "Inspect assigned projects, download guidance materials, and evaluate learner submissions."
            : "Review cohort completion records, module evaluations, and learner performance statistics."}
        </p>
      </div>

      {/* Render active section tab dynamically */}
      {activeTab === "overview" && (
        <TrainerOverviewTab
          onNavigateToLearners={handleNavigateToLearners}
          onSelectLearner={handleNavigateToLearners}
        />
      )}

      {activeTab === "courses" && (
        <TrainerCoursesTab />
      )}

      {activeTab === "projects" && (
        <TrainerProjectsTab />
      )}

      {activeTab === "learners" && (
        isAdminPreview ? (
          <div className="card" style={{ padding: "32px", textAlign: "center" }}>
            <div style={{ maxWidth: "560px", margin: "0 auto" }}>
              <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(59, 130, 246, 0.15)",
                color: "#60A5FA",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px"
              }}>
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px", color: "var(--text-main)" }}>
                Instructor Reports Preview
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}>
                Instructors access tracking reports and completion oversight for their assigned cohorts here. Individual trainer and learner report data is not queried in preview mode.
              </p>
              <div className="badge badge-info" style={{ padding: "6px 14px", fontSize: "12px" }}>
                Preview Mode • Reporting Data Isolated
              </div>
            </div>
          </div>
        ) : (
          <AdminReportsTab portalRole="TRAINER" />
        )
      )}
    </DashboardLayout>
  );
}
