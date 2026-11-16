import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import LearnerOverviewTab from "./learner/LearnerOverviewTab";
import LearnerCoursesTab from "./learner/LearnerCoursesTab";
import AdminReportsTab from "./admin/AdminReportsTab";

export default function LearnerPortal() {
  const { user, activePortal } = useAuth();
  const isAdminPreview = user?.role === "ADMIN" && activePortal === "LEARNER";

  const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'mycourses' | 'reports'
  const [selectedCourseFromDashboard, setSelectedCourseFromDashboard] = useState(null);

  const learnerDisplayName = user?.first_name || user?.username || "Learner";

  const handleSelectCourseFromDashboard = (course) => {
    setSelectedCourseFromDashboard(course);
    setActiveTab("mycourses");
  };

  const handleNavigateToCourses = () => {
    setSelectedCourseFromDashboard(null);
    setActiveTab("mycourses");
  };

  const handleClearSelectedCourse = () => {
    setSelectedCourseFromDashboard(null);
  };

  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="dashboard-page-header">
        <h1 className="dashboard-title">
          {isAdminPreview
            ? "Learner Portal Preview"
            : activeTab === "overview"
            ? "Learner Dashboard"
            : activeTab === "mycourses"
            ? "My Learning"
            : "My Progress Reports"}
        </h1>
        <p className="dashboard-subtitle">
          {isAdminPreview
            ? "Previewing the Learner portal interface. This generic view illustrates learner dashboard, curriculum layout, and report structures without accessing individual learner records."
            : activeTab === "overview"
            ? `Welcome back, ${learnerDisplayName}! Keep up the momentum and continue your training journey.`
            : activeTab === "mycourses"
            ? `Welcome back, ${learnerDisplayName}. View your assigned courses and modules.`
            : `Welcome back, ${learnerDisplayName}. Track your personal course progress, module completion, and assessment results.`}
        </p>
      </div>

      {/* Render active section tab dynamically */}
      {activeTab === "overview" && (
        <LearnerOverviewTab
          onNavigateToCourses={handleNavigateToCourses}
          onSelectCourse={handleSelectCourseFromDashboard}
        />
      )}

      {activeTab === "mycourses" && (
        <LearnerCoursesTab
          initialSelectedCourse={selectedCourseFromDashboard}
          onClearSelectedCourse={handleClearSelectedCourse}
        />
      )}

      {activeTab === "reports" && (
        isAdminPreview ? (
          <div className="card" style={{ padding: "32px", textAlign: "center" }}>
            <div style={{ maxWidth: "560px", margin: "0 auto" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "#60A5FA",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px", color: "var(--text-main)" }}>
                Learner Reports Preview
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}>
                Enrolled learners can track their personal course progress, completion status, and evaluation history here. Personal learner reports are unavailable in Admin Preview.
              </p>
              <div className="badge badge-info" style={{ padding: "6px 14px", fontSize: "12px" }}>
                Preview Mode • Reporting Data Isolated
              </div>
            </div>
          </div>
        ) : (
          <AdminReportsTab portalRole="LEARNER" />
        )
      )}
    </DashboardLayout>
  );
}
