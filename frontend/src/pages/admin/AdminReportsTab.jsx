import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";

export default function ReportsView({ portalRole = "ADMIN" }) {
  // If rendered in Learner Portal, maintain the exact legacy view and behavior
  const isLearnerPortal = portalRole === "LEARNER";

  const [activeSection, setActiveSection] = useState("overview"); // 'overview' | 'performance'

  // =========================================================================
  // SECTION A: OVERVIEW STATE (OPTIMIZED KPI & ANALYTICS)
  // =========================================================================
  const [kpiData, setKpiData] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState(null);

  // Legacy overview data state (strictly for Learner Portal backward-compatibility)
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);

  // =========================================================================
  // SECTION B: PAGINATED LEARNER PERFORMANCE TABLE STATE
  // =========================================================================
  const [tableData, setTableData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("ALL");
  const [selectedLevelFilter, setSelectedLevelFilter] = useState("ALL");
  const [selectedTrainerFilter, setSelectedTrainerFilter] = useState("ALL");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("ALL");
  const [selectedEnrollmentStatus, setSelectedEnrollmentStatus] = useState("ALL");
  const [selectedAssessmentStatus, setSelectedAssessmentStatus] = useState("ALL");

  // Metadata dropdown options
  const [coursesList, setCoursesList] = useState([]);
  const [levelsList, setLevelsList] = useState([]);
  const [trainersList, setTrainersList] = useState([]);
  const [groupsList, setGroupsList] = useState([]);

  // =========================================================================
  // ON-DEMAND DETAILED LEARNER REPORT MODAL STATE
  // =========================================================================
  const [activeLearnerDetail, setActiveLearnerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // -------------------------------------------------------------------------
  // 1. Fetch Overview KPIs (Section A)
  // -------------------------------------------------------------------------
  const fetchKPIs = useCallback(async () => {
    if (isLearnerPortal) return;
    setKpiLoading(true);
    setKpiError(null);
    try {
      const data = await apiClient("/reports/summary-kpis/");
      setKpiData(data);
    } catch (err) {
      setKpiError(err.message || "Failed to load overview report metrics.");
    } finally {
      setKpiLoading(false);
    }
  }, [isLearnerPortal]);

  // Legacy overview fetch (strictly for Learner Portal)
  const fetchLegacyOverview = useCallback(async () => {
    if (!isLearnerPortal) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await apiClient("/reports/overview/");
      setOverviewData(data);
    } catch (err) {
      setOverviewError(err.message || "Failed to load overview report metrics.");
    } finally {
      setOverviewLoading(false);
    }
  }, [isLearnerPortal]);

  // -------------------------------------------------------------------------
  // 2. Fetch Learner Enrollments Table (Section B - Scalable & Paginated)
  // -------------------------------------------------------------------------
  const fetchTableData = useCallback(
    async (pageToLoad = currentPage, customPageSize = pageSize) => {
      if (isLearnerPortal) return;
      setTableLoading(true);
      setTableError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", pageToLoad);
        params.set("page_size", customPageSize);

        if (searchQuery.trim()) params.set("search", searchQuery.trim());
        if (selectedCourseFilter !== "ALL") params.set("course", selectedCourseFilter);
        if (selectedLevelFilter !== "ALL") params.set("level", selectedLevelFilter);
        if (selectedTrainerFilter !== "ALL") params.set("trainer", selectedTrainerFilter);
        if (selectedGroupFilter !== "ALL") params.set("group", selectedGroupFilter);
        if (selectedEnrollmentStatus !== "ALL") params.set("enrollment_status", selectedEnrollmentStatus);
        if (selectedAssessmentStatus !== "ALL") params.set("assessment_status", selectedAssessmentStatus);

        const data = await apiClient(`/reports/learner-enrollments-table/?${params.toString()}`);
        setTableData(data.results || []);
        setTotalCount(data.total_count || 0);
        setTotalPages(data.total_pages || 1);
        setCurrentPage(data.page || 1);
      } catch (err) {
        setTableError(err.message || "Failed to load learner performance table.");
      } finally {
        setTableLoading(false);
      }
    },
    [
      isLearnerPortal,
      currentPage,
      pageSize,
      searchQuery,
      selectedCourseFilter,
      selectedLevelFilter,
      selectedTrainerFilter,
      selectedGroupFilter,
      selectedEnrollmentStatus,
      selectedAssessmentStatus,
    ]
  );

  // -------------------------------------------------------------------------
  // 3. Load Dropdown Metadata (Courses, Levels, Groups, Trainers)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isLearnerPortal) return;
    async function loadMetadata() {
      try {
        const [crss, lvls, grps, trns] = await Promise.allSettled([
          apiClient("/reports/course-progress/"),
          apiClient("/course-levels/"),
          apiClient("/learner-groups/"),
          portalRole === "ADMIN" ? apiClient("/admin/trainers/") : Promise.resolve([]),
        ]);

        if (crss.status === "fulfilled") {
          const list = Array.isArray(crss.value) ? crss.value : [];
          setCoursesList(
            list.map((c) => ({
              id: c.course_id != null ? String(c.course_id) : `level:${c.level_id ?? c.course_name}`,
              name: c.course_name || c.level_name,
            }))
          );
        }

        if (lvls.status === "fulfilled") {
          const raw = Array.isArray(lvls.value) ? lvls.value : lvls.value?.results || [];
          setLevelsList(raw);
        }

        if (grps.status === "fulfilled") {
          const raw = Array.isArray(grps.value) ? grps.value : grps.value?.results || [];
          setGroupsList(raw);
        }

        if (trns.status === "fulfilled") {
          const raw = Array.isArray(trns.value) ? trns.value : trns.value?.results || [];
          setTrainersList(raw);
        }
      } catch {
        // Non-blocking metadata error
      }
    }
    loadMetadata();
  }, [isLearnerPortal, portalRole]);

  // Initial load
  useEffect(() => {
    if (isLearnerPortal) {
      fetchLegacyOverview();
    } else {
      fetchKPIs();
      fetchTableData(1, pageSize);
    }
  }, [isLearnerPortal, fetchKPIs, fetchLegacyOverview]);

  // Handle Search / Filter Trigger (resets to page 1)
  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    setCurrentPage(1);
    fetchTableData(1, pageSize);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCourseFilter("ALL");
    setSelectedLevelFilter("ALL");
    setSelectedTrainerFilter("ALL");
    setSelectedGroupFilter("ALL");
    setSelectedEnrollmentStatus("ALL");
    setSelectedAssessmentStatus("ALL");
    setCurrentPage(1);
    setTimeout(() => {
      fetchTableData(1, pageSize);
    }, 0);
  };

  // Handle Page Change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      fetchTableData(newPage, pageSize);
    }
  };

  // Handle Page Size Change
  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchTableData(1, newSize);
  };

  // -------------------------------------------------------------------------
  // 4. Open On-Demand Detailed Learner Report
  // -------------------------------------------------------------------------
  const handleViewLearnerDetails = async (row) => {
    setDetailLoading(true);
    setDetailError(null);
    setActiveLearnerDetail({
      learner_id: row.learner_id,
      learner_name: row.learner_name,
      email: row.email,
      course_name: row.course_name,
      level_name: row.level_name,
      enrollments: [],
    });

    try {
      const params = new URLSearchParams();
      params.set("learner_id", row.learner_id);
      if (row.course_id) params.set("course_id", row.course_id);
      else if (row.level_id) params.set("level_id", row.level_id);

      const res = await apiClient(`/reports/learner-detail/?${params.toString()}`);
      setActiveLearnerDetail(res);
    } catch (err) {
      setDetailError(err.message || "Failed to load individual learner details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  // =========================================================================
  // LEANER PORTAL STRICT BACKWARD COMPATIBILITY RENDER
  // =========================================================================
  if (isLearnerPortal) {
    return (
      <div className="reports-container">
        {overviewLoading ? (
          <div className="card" style={{ textAlign: "center", padding: "50px" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
            <p style={{ color: "var(--text-secondary)" }}>Aggregating progress metrics...</p>
          </div>
        ) : overviewError ? (
          <div className="alert alert-error" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{overviewError}</span>
            <button type="button" className="btn btn-secondary" onClick={fetchLegacyOverview} style={{ padding: "4px 10px", fontSize: "12px" }}>
              Retry
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                  My Course Progress Overview
                </h3>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0 }}>
                  Detailed course level progress, assessment results, and module-wise reading status.
                </p>
              </div>
            </div>

            {(!overviewData?.learners_progress || overviewData.learners_progress.length === 0) ? (
              <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-secondary)", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-color)" }}>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: "500" }}>No curriculum progress records found.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {overviewData.learners_progress.map((lp, idx) => (
                  <div
                    key={`${lp.learner_id}-${lp.course_id ?? `lvl-${lp.level_id}`}-${idx}`}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm, 8px)",
                      padding: "18px 20px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "14px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>
                            {lp.course_name || lp.level_name || "Level 1"}
                          </h4>
                          <span className={`badge ${lp.enrollment_status === "COMPLETED" ? "badge-success" : lp.enrollment_status === "IN_PROGRESS" ? "badge-info" : "badge-secondary"}`}>
                            {lp.enrollment_status === "COMPLETED" ? "Completed" : lp.enrollment_status === "IN_PROGRESS" ? "In Progress" : "Not Started"}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: "600" }}>
                            Overall Progress
                          </div>
                          <div style={{ fontSize: "18px", fontWeight: "700", color: lp.overall_progress_percentage === 100 ? "var(--status-success)" : "var(--color-primary, #2563eb)" }}>
                            {lp.overall_progress_percentage}%
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", background: "var(--bg-surface)", padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                          <strong>{lp.completed_modules}</strong> of <strong>{lp.total_required_modules}</strong> Modules Completed
                        </div>
                      </div>
                    </div>

                    {/* Assessment Results */}
                    {lp.assessment_results && lp.assessment_results.length > 0 && (
                      <div style={{ background: "var(--bg-surface, #f8fafc)", padding: "14px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", marginBottom: "16px" }}>
                        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "10px" }}>
                          Assessment Results
                        </div>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                                <th style={{ padding: "6px 8px", color: "var(--text-secondary)" }}>Module</th>
                                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--text-secondary)" }}>Score</th>
                                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--text-secondary)" }}>Result</th>
                                <th style={{ padding: "6px 8px", textAlign: "center", color: "var(--text-secondary)" }}>Attempts</th>
                                <th style={{ padding: "6px 8px", textAlign: "right", color: "var(--text-secondary)" }}>Last Attempt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lp.assessment_results.map((ar) => (
                                <tr key={ar.module_id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                  <td style={{ padding: "8px", fontWeight: "500", color: "var(--text-main)" }}>{ar.module_name}</td>
                                  <td style={{ padding: "8px", textAlign: "center", fontFamily: "var(--font-mono)" }}>{ar.score_display}</td>
                                  <td style={{ padding: "8px", textAlign: "center" }}>
                                    <span className={`badge ${ar.result === "PASS" ? "badge-success" : ar.result === "FAIL" ? "badge-error" : "badge-secondary"}`} style={{ fontSize: "10px", padding: "2px 6px" }}>
                                      {ar.result}
                                    </span>
                                  </td>
                                  <td style={{ padding: "8px", textAlign: "center", fontFamily: "var(--font-mono)" }}>{ar.attempts_count}</td>
                                  <td style={{ padding: "8px", textAlign: "right", color: "var(--text-muted)" }}>{formatDate(ar.last_attempt_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Module Learning Progress */}
                    {lp.modules_progress && lp.modules_progress.length > 0 && (
                      <div style={{ background: "var(--bg-surface, #f8fafc)", padding: "14px 16px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "10px" }}>
                          Module-wise Progress ({lp.modules_progress.length} Modules)
                        </div>
                        <div style={{ maxHeight: "300px", overflowY: "auto", backgroundColor: "#fff", border: "1px solid var(--border-color)", borderRadius: "4px" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-surface)" }}>
                                <th style={{ padding: "8px 12px", textAlign: "left" }}>Module Name</th>
                                <th style={{ padding: "8px 12px", textAlign: "center" }}>Questions Status</th>
                                <th style={{ padding: "8px 12px", textAlign: "right" }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lp.modules_progress.map((mp, mIdx) => (
                                <tr key={mp.module_id || mIdx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                  <td style={{ padding: "8px 12px", fontWeight: "500" }}>{mp.module_name}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                    {mp.total_required_questions > 0 ? `${mp.answered_required_questions}/${mp.total_required_questions} answered` : "Reading material"}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                    <span className={`badge ${mp.status === "COMPLETED" ? "badge-success" : mp.status === "IN PROGRESS" ? "badge-info" : "badge-secondary"}`} style={{ fontSize: "10px", padding: "2px 6px" }}>
                                      {mp.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // ADMIN & TRAINER OPTIMIZED EXPANDABLE REPORTS VIEW
  // =========================================================================
  return (
    <div className="reports-container">
      {/* Top Section Navigation Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
            {portalRole === "TRAINER" ? "Cohort Performance & Analytics" : "Organization Training & Completion Reports"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            {portalRole === "TRAINER"
              ? "Comprehensive progress tracking and completion analytics scoped to your assigned training groups."
              : "High-level overview KPIs, enrollment status distributions, and scalable learner performance table."}
          </p>
        </div>

        <div style={{ display: "inline-flex", background: "var(--bg-card)", padding: "4px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
          <button
            type="button"
            className={`btn ${activeSection === "overview" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveSection("overview")}
            style={{ padding: "6px 16px", fontSize: "13px", borderRadius: "var(--radius-sm)" }}
          >
            Overview Analytics
          </button>
          <button
            type="button"
            className={`btn ${activeSection === "performance" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setActiveSection("performance");
              fetchTableData(currentPage, pageSize);
            }}
            style={{ padding: "6px 16px", fontSize: "13px", borderRadius: "var(--radius-sm)" }}
          >
            Learner Performance ({totalCount})
          </button>
        </div>
      </div>

      {/* =====================================================================
          SECTION A: OVERVIEW ANALYTICS (COMPACT KPIS & DISTRIBUTIONS)
         ===================================================================== */}
      {activeSection === "overview" && (
        <div>
          {kpiLoading ? (
            <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
              <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Calculating organization-wide performance KPIs...</p>
            </div>
          ) : kpiError ? (
            <div className="alert alert-error" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{kpiError}</span>
              <button type="button" className="btn btn-secondary" onClick={fetchKPIs} style={{ padding: "4px 10px", fontSize: "12px" }}>
                Retry
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Section Header: Unique Learner Counts */}
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  Unique Learner Metrics (No Double-Counting)
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "14px",
                  }}
                >
                  {/* 1. Total Learners */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #3b82f6" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Total Learners
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main)", marginTop: "6px" }}>
                      {kpiData?.total_learners ?? 0}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Unique learners in scope
                    </div>
                  </div>

                  {/* 2. Active Learners */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #0284c7" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Active Learners
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#0284c7", marginTop: "6px" }}>
                      {kpiData?.active_learners ?? 0}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      In progress on courses
                    </div>
                  </div>

                  {/* 3. Completed Learners */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid var(--status-success, #16a34a)" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Completed Learners
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "var(--status-success, #16a34a)", marginTop: "6px" }}>
                      {kpiData?.completed_learners ?? 0}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      All enrollments 100%
                    </div>
                  </div>

                  {/* 4. Learners Not Started */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #94a3b8" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Learners Not Started
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#64748b", marginTop: "6px" }}>
                      {kpiData?.not_started_learners ?? 0}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Zero activity recorded
                    </div>
                  </div>

                  {/* 5. Needs Attention */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #ef4444" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Needs Attention
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#ef4444", marginTop: "6px" }}>
                      {kpiData?.needing_attention_learners ?? 0}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Latest test fail or &lt;25% active
                    </div>
                  </div>
                </div>
              </div>

              {/* Section Header: Enrollment Progress & Assessment KPIs */}
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  Enrollment & Assessment Performance (Latest Attempt Basis)
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "14px",
                  }}
                >
                  {/* Total Enrollments */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #6366f1" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Total Enrollments
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#6366f1", marginTop: "6px" }}>
                      {kpiData?.total_enrollments ?? 0}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Learner-course assignments
                    </div>
                  </div>

                  {/* Average Course Progress */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #8b5cf6" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Avg Course Progress
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#8b5cf6", marginTop: "6px" }}>
                      {kpiData?.average_course_progress ?? 0}%
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Across all enrollments
                    </div>
                  </div>

                  {/* Average Assessment Score */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #f59e0b" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Avg Assessment Score
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#f59e0b", marginTop: "6px" }}>
                      {kpiData?.average_assessment_score_pct !== null && kpiData?.average_assessment_score_pct !== undefined
                        ? `${kpiData.average_assessment_score_pct}%`
                        : "—"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Latest unique scored attempts
                    </div>
                  </div>

                  {/* Pass Rate */}
                  <div className="card" style={{ padding: "16px", borderLeft: "4px solid #10b981" }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                      Assessment Pass Rate
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: "800", color: "#10b981", marginTop: "6px" }}>
                      {kpiData?.pass_rate_pct !== null && kpiData?.pass_rate_pct !== undefined
                        ? `${kpiData.pass_rate_pct}%`
                        : "—"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      {kpiData?.assessment_stats?.passed ?? 0} of {kpiData?.assessment_stats?.unique_assessed_modules ?? 0} passed
                    </div>
                  </div>
                </div>
              </div>

              {/* Analytics Summaries Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "16px" }}>
                {/* Enrollment & Completion Status Breakdown */}
                <div className="card" style={{ padding: "20px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px" }}>
                    Enrollment Status Distribution
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "600", color: "var(--status-success)" }}>Completed</span>
                        <span style={{ fontWeight: "700" }}>{kpiData?.completed_enrollments ?? 0}</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--bg-surface)", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${kpiData?.total_enrollments ? (kpiData.completed_enrollments / kpiData.total_enrollments) * 100 : 0}%`,
                            background: "var(--status-success)",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "600", color: "#0284c7" }}>In Progress</span>
                        <span style={{ fontWeight: "700" }}>{kpiData?.in_progress_enrollments ?? 0}</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--bg-surface)", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${kpiData?.total_enrollments ? (kpiData.in_progress_enrollments / kpiData.total_enrollments) * 100 : 0}%`,
                            background: "#0284c7",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "600", color: "#64748b" }}>Not Started</span>
                        <span style={{ fontWeight: "700" }}>{kpiData?.not_started_enrollments ?? 0}</span>
                      </div>
                      <div style={{ width: "100%", height: "8px", background: "var(--bg-surface)", borderRadius: "4px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${kpiData?.total_enrollments ? (kpiData.not_started_enrollments / kpiData.total_enrollments) * 100 : 0}%`,
                            background: "#94a3b8",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assessment Pass / Fail Distribution */}
                <div className="card" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <h3 style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                      Latest Assessment Results Distribution
                    </h3>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Pass threshold: Dynamic 50%
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", textAlign: "center", marginBottom: "16px" }}>
                    <div style={{ padding: "14px", background: "rgba(34, 197, 94, 0.08)", borderRadius: "6px", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                      <div style={{ fontSize: "22px", fontWeight: "800", color: "var(--status-success)" }}>
                        {kpiData?.assessment_stats?.passed ?? 0}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Passed Modules
                      </div>
                    </div>

                    <div style={{ padding: "14px", background: "rgba(239, 68, 68, 0.08)", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                      <div style={{ fontSize: "22px", fontWeight: "800", color: "#ef4444" }}>
                        {kpiData?.assessment_stats?.failed ?? 0}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginTop: "2px" }}>
                        Failed Modules
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                    <span>Unique Learner-Module Tests:</span>
                    <strong>{kpiData?.assessment_stats?.unique_assessed_modules ?? 0}</strong>
                  </div>
                </div>
              </div>

              {/* Course / Level Progress Table Summary */}
              {kpiData?.course_distributions && kpiData.course_distributions.length > 0 && (
                <div className="card" style={{ padding: "20px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px" }}>
                    Average Progress by Curriculum Level
                  </h3>
                  <div className="table-responsive">
                    <table className="table" style={{ width: "100%", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                          <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>Curriculum Course / Level</th>
                          <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Enrollments</th>
                          <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Completed</th>
                          <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>In Progress</th>
                          <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Not Started</th>
                          <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)" }}>Avg Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kpiData.course_distributions.map((c) => (
                          <tr key={c.key} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                            <td style={{ padding: "10px 12px", fontWeight: "600", color: "var(--text-main)" }}>
                              {c.name}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                              {c.total_enrollments}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--status-success)", fontWeight: "600" }}>
                              {c.completed}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "center", color: "#0284c7" }}>
                              {c.in_progress}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "center", color: "#64748b" }}>
                              {c.not_started}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "700", color: "var(--color-primary, #2563eb)" }}>
                              {c.average_progress}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SECTION B: SEARCHABLE, FILTERABLE, PAGINATED LEARNER PERFORMANCE TABLE
         ===================================================================== */}
      {activeSection === "performance" && (
        <div>
          {/* Filter Bar */}
          <div className="card" style={{ padding: "16px 20px", marginBottom: "16px" }}>
            <form onSubmit={handleApplyFilters}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "14px" }}>
                {/* Search */}
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Search Learner
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Name, username, or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: "100%", fontSize: "13px" }}
                  />
                </div>

                {/* Course Filter */}
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Course / Level
                  </label>
                  <select
                    className="form-input"
                    value={selectedCourseFilter}
                    onChange={(e) => setSelectedCourseFilter(e.target.value)}
                    style={{ width: "100%", fontSize: "13px" }}
                  >
                    <option value="ALL">All Courses & Levels</option>
                    {coursesList.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Trainer Filter (Admin Only) */}
                {portalRole === "ADMIN" && (
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Assigned Trainer
                    </label>
                    <select
                      className="form-input"
                      value={selectedTrainerFilter}
                      onChange={(e) => setSelectedTrainerFilter(e.target.value)}
                      style={{ width: "100%", fontSize: "13px" }}
                    >
                      <option value="ALL">All Trainers</option>
                      {trainersList.map((t) => (
                        <option key={t.id} value={t.id}>{t.full_name || t.username}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Group / Cohort Filter */}
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Cohort / Group
                  </label>
                  <select
                    className="form-input"
                    value={selectedGroupFilter}
                    onChange={(e) => setSelectedGroupFilter(e.target.value)}
                    style={{ width: "100%", fontSize: "13px" }}
                  >
                    <option value="ALL">All Cohorts</option>
                    {groupsList.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                {/* Enrollment Status */}
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Enrollment Status
                  </label>
                  <select
                    className="form-input"
                    value={selectedEnrollmentStatus}
                    onChange={(e) => setSelectedEnrollmentStatus(e.target.value)}
                    style={{ width: "100%", fontSize: "13px" }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="NOT_STARTED">Not Started</option>
                  </select>
                </div>

                {/* Assessment Status */}
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Current Assessment Status
                  </label>
                  <select
                    className="form-input"
                    value={selectedAssessmentStatus}
                    onChange={(e) => setSelectedAssessmentStatus(e.target.value)}
                    style={{ width: "100%", fontSize: "13px" }}
                  >
                    <option value="ALL">All Assessment Statuses</option>
                    <option value="PASS">Pass (All latest passed)</option>
                    <option value="FAIL">Fail (Latest attempt failed)</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="NOT_STARTED">Not Started</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="submit" className="btn btn-primary" style={{ padding: "6px 16px", fontSize: "13px" }}>
                    Apply Filters
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleResetFilters} style={{ padding: "6px 14px", fontSize: "13px" }}>
                    Reset Filters
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                  <span>Rows per page:</span>
                  <select
                    className="form-input"
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    style={{ width: "auto", padding: "4px 8px", fontSize: "12px" }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </form>
          </div>

          {/* Table Container */}
          {tableError && (
            <div className="alert alert-error" style={{ marginBottom: "16px" }}>
              {tableError}
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {tableLoading ? (
              <div style={{ padding: "50px 20px", textAlign: "center" }}>
                <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading learner performance records...</p>
              </div>
            ) : tableData.length === 0 ? (
              <div style={{ padding: "50px 20px", textAlign: "center" }}>
                <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: "0 auto 12px", color: "var(--text-muted)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h4 style={{ color: "var(--text-main)", fontSize: "16px", marginBottom: "4px" }}>No matching learners found</h4>
                <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                  Try clearing your search terms or adjusting active status filters.
                </p>
              </div>
            ) : (
              <div className="table-responsive" style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", background: "rgba(255,255,255,0.02)" }}>
                      <th style={{ padding: "12px 16px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px" }}>Learner</th>
                      <th style={{ padding: "12px 16px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px" }}>Course / Level</th>
                      <th style={{ padding: "12px 14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px" }}>Trainer / Cohort</th>
                      <th style={{ padding: "12px 14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px" }}>Progress</th>
                      <th style={{ padding: "12px 14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px", textAlign: "center" }}>Modules</th>
                      <th style={{ padding: "12px 14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px", textAlign: "center" }}>Current Assessment</th>
                      <th style={{ padding: "12px 14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px", textAlign: "center" }}>Enrollment Status</th>
                      <th style={{ padding: "12px 14px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px" }}>Last Activity</th>
                      <th style={{ padding: "12px 16px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", fontSize: "11px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, idx) => (
                      <tr key={`${row.learner_id}-${row.course_id ?? row.level_id}-${idx}`} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        {/* Learner */}
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: "700", color: "var(--text-main)" }}>{row.learner_name}</div>
                          {row.email && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{row.email}</div>}
                        </td>

                        {/* Course */}
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: "600", color: "var(--text-main)" }}>{row.course_name || row.level_name}</div>
                          {row.level_name && row.level_name !== row.course_name && (
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{row.level_name}</div>
                          )}
                        </td>

                        {/* Trainer / Cohort */}
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontSize: "12px", color: "var(--text-main)" }}>{row.trainer_names}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Cohort: {row.group_name}</div>
                        </td>

                        {/* Overall Progress */}
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ width: "70px", height: "6px", background: "var(--bg-surface)", borderRadius: "3px", overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%",
                                  width: `${row.overall_progress_percentage}%`,
                                  background: row.overall_progress_percentage === 100 ? "var(--status-success)" : "var(--color-primary, #2563eb)",
                                  borderRadius: "3px",
                                }}
                              />
                            </div>
                            <span style={{ fontWeight: "700", fontSize: "12px", color: "var(--text-main)" }}>
                              {row.overall_progress_percentage}%
                            </span>
                          </div>
                        </td>

                        {/* Modules */}
                        <td style={{ padding: "12px 14px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                          {row.completed_modules}/{row.total_required_modules}
                        </td>

                        {/* Current Assessment */}
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          {row.assessment_status === "PASS" ? (
                            <span className="badge badge-success" style={{ fontSize: "10px", padding: "2px 8px", fontWeight: "700" }}>
                              PASS {row.assessment_average_pct !== null && row.assessment_average_pct !== undefined ? `(${row.assessment_average_pct}%)` : ""}
                            </span>
                          ) : row.assessment_status === "FAIL" ? (
                            <span className="badge badge-error" style={{ fontSize: "10px", padding: "2px 8px", fontWeight: "700" }}>
                              FAIL {row.assessment_average_pct !== null && row.assessment_average_pct !== undefined ? `(${row.assessment_average_pct}%)` : ""}
                            </span>
                          ) : row.assessment_status === "IN_PROGRESS" ? (
                            <span className="badge badge-info" style={{ fontSize: "10px", padding: "2px 6px" }}>
                              In Progress
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>—</span>
                          )}
                        </td>

                        {/* Enrollment Status */}
                        <td style={{ padding: "12px 14px", textAlign: "center" }}>
                          <span
                            className={`badge ${
                              row.enrollment_status === "COMPLETED"
                                ? "badge-success"
                                : row.enrollment_status === "IN_PROGRESS"
                                ? "badge-info"
                                : "badge-secondary"
                            }`}
                            style={{ fontSize: "10px", padding: "2px 8px" }}
                          >
                            {row.enrollment_status === "COMPLETED" ? "Completed" : row.enrollment_status === "IN_PROGRESS" ? "In Progress" : "Not Started"}
                          </span>
                        </td>

                        {/* Last Activity */}
                        <td style={{ padding: "12px 14px", fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {formatDate(row.last_activity)}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleViewLearnerDetails(row)}
                            style={{ padding: "4px 10px", fontSize: "12px" }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls Footer */}
            {tableData.length > 0 && (
              <div
                style={{
                  padding: "12px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--border-color)",
                  background: "var(--bg-surface)",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} total matching records
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={currentPage <= 1 || tableLoading}
                    onClick={() => handlePageChange(currentPage - 1)}
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                  >
                    &larr; Prev
                  </button>

                  <span style={{ fontSize: "12px", color: "var(--text-main)", margin: "0 6px" }}>
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                  </span>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={currentPage >= totalPages || tableLoading}
                    onClick={() => handlePageChange(currentPage + 1)}
                    style={{ padding: "4px 10px", fontSize: "12px" }}
                  >
                    Next &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION C: ON-DEMAND DETAILED LEARNER REPORT MODAL
         ===================================================================== */}
      {activeLearnerDetail && (
        <div
          role="dialog"
          aria-modal="true"
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
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "850px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                  Detailed Learner Progress & Assessment Report
                </h3>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Learner: <strong style={{ color: "var(--text-main)" }}>{activeLearnerDetail.learner_name}</strong>
                  {activeLearnerDetail.learner_email && (
                    <span style={{ marginLeft: "8px", color: "var(--text-muted)" }}>&bull; {activeLearnerDetail.learner_email}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveLearnerDetail(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "24px",
                  lineHeight: "1",
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading ? (
              <div style={{ padding: "50px 20px", textAlign: "center" }}>
                <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading detailed progress & assessment history...</p>
              </div>
            ) : detailError ? (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                {detailError}
              </div>
            ) : (!activeLearnerDetail.enrollments || activeLearnerDetail.enrollments.length === 0) ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--text-secondary)" }}>
                No active enrollment data found for this learner.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {activeLearnerDetail.enrollments.map((enr, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-sm)",
                      padding: "18px",
                      background: "var(--bg-surface)",
                    }}
                  >
                    {/* Enrollment Progress Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <h4 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                          {enr.course_name || enr.level_name}
                        </h4>
                        <span
                          className={`badge ${
                            enr.enrollment_status === "COMPLETED"
                              ? "badge-success"
                              : enr.enrollment_status === "IN_PROGRESS"
                              ? "badge-info"
                              : "badge-secondary"
                          }`}
                          style={{ fontSize: "11px", marginTop: "4px" }}
                        >
                          {enr.enrollment_status} ({enr.overall_progress_percentage}%)
                        </span>
                      </div>

                      <div style={{ fontSize: "13px", color: "var(--text-secondary)", textAlign: "right" }}>
                        Modules Completed: <strong>{enr.completed_modules}</strong> / <strong>{enr.total_required_modules}</strong>
                      </div>
                    </div>

                    {/* Assessment Results Table */}
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                          Assessment Submissions ({enr.assessment_results?.length ?? 0})
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          Current Result based on Latest Attempt &bull; Pass Threshold: 60%
                        </span>
                      </div>
                      <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: "4px", background: "#fff" }}>
                        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                              <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>Module Name</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Latest Score</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Best Score</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Current Result</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Attempts</th>
                              <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)" }}>Latest Attempt Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {enr.assessment_results && enr.assessment_results.length > 0 ? (
                              enr.assessment_results.map((ar) => (
                                <tr key={ar.module_id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                  <td style={{ padding: "8px 12px", fontWeight: "500" }}>{ar.module_name}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: "600" }}>
                                    {ar.score_display} {ar.percentage !== null && ar.percentage !== undefined ? `(${ar.percentage}%)` : ""}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                                    {ar.best_score_display ?? "—"}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                    <span
                                      className={`badge ${
                                        ar.result === "PASS"
                                          ? "badge-success"
                                          : ar.result === "FAIL"
                                          ? "badge-error"
                                          : "badge-secondary"
                                      }`}
                                      style={{ fontSize: "10px", padding: "2px 6px" }}
                                    >
                                      {ar.result}
                                    </span>
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-mono)" }}>{ar.attempts_count}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)" }}>{formatDate(ar.last_attempt_at)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)" }}>
                                  No assessment modules configured for this curriculum.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Module Learning Progress Table */}
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px" }}>
                        All Modules Learning Breakdown ({enr.modules_progress?.length ?? 0})
                      </div>
                      <div style={{ maxHeight: "250px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "4px", background: "#fff" }}>
                        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-color)", textAlign: "left", position: "sticky", top: 0 }}>
                              <th style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>Module</th>
                              <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>Comprehension Status</th>
                              <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)" }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {enr.modules_progress && enr.modules_progress.length > 0 ? (
                              enr.modules_progress.map((mp, mIdx) => (
                                <tr key={mp.module_id || mIdx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                  <td style={{ padding: "8px 12px", fontWeight: "500" }}>{mp.module_name}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                    {mp.total_required_questions > 0
                                      ? `${mp.answered_required_questions}/${mp.total_required_questions} answered`
                                      : "Learning reading material"}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                                    <span
                                      className={`badge ${
                                        mp.status === "COMPLETED"
                                          ? "badge-success"
                                          : mp.status === "IN PROGRESS"
                                          ? "badge-info"
                                          : "badge-secondary"
                                      }`}
                                      style={{ fontSize: "10px", padding: "2px 6px" }}
                                    >
                                      {mp.status}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={3} style={{ padding: "12px", textAlign: "center", color: "var(--text-muted)" }}>
                                  No modules found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal Footer */}
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveLearnerDetail(null)}
                style={{ padding: "6px 16px", fontSize: "13px" }}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
