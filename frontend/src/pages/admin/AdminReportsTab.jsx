import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";

export default function ReportsView({ portalRole = "ADMIN" }) {
  const [activeSection, setActiveSection] = useState("overview"); // 'overview' | 'performance' | 'progress'

  // Overview Data
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);

  // Learner Performance Data
  const [performanceData, setPerformanceData] = useState([]);
  const [scoringNotice, setScoringNotice] = useState("");
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState(null);

  // Course Progress Data
  const [courseProgressData, setCourseProgressData] = useState([]);
  const [courseProgressLoading, setCourseProgressLoading] = useState(true);
  const [courseProgressError, setCourseProgressError] = useState(null);

  // Filters & Search
  const [learnerSearch, setLearnerSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCourseFilter, setSelectedCourseFilter] = useState("ALL");
  const [coursesList, setCoursesList] = useState([]);

  // Inspect Individual Learner Modal/Drawer
  const [inspectLearnerId, setInspectLearnerId] = useState(null);
  const [inspectedLearnerData, setInspectedLearnerData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // 1. Fetch Overview Data
  const fetchOverview = useCallback(async () => {
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
  }, []);

  // 2. Fetch Learner Performance Data
  const fetchPerformance = useCallback(async (courseFilter = "ALL") => {
    setPerformanceLoading(true);
    setPerformanceError(null);
    try {
      let endpoint = "/reports/learner-performance/";
      const params = [];
      if (courseFilter && courseFilter !== "ALL") {
        params.push(`course=${courseFilter}`);
      }
      if (params.length > 0) {
        endpoint += `?${params.join("&")}`;
      }
      const data = await apiClient(endpoint);
      setPerformanceData(data?.results || []);
      setScoringNotice(data?.notice || "");
    } catch (err) {
      setPerformanceError(err.message || "Failed to load learner performance reports.");
    } finally {
      setPerformanceLoading(false);
    }
  }, []);

  // 3. Fetch Course Progress Data
  const fetchCourseProgress = useCallback(async () => {
    setCourseProgressLoading(true);
    setCourseProgressError(null);
    try {
      const data = await apiClient("/reports/course-progress/");
      const list = Array.isArray(data) ? data : [];
      setCourseProgressData(list);
      // Populate unique course filter options
      setCoursesList(list.map((c) => ({ id: c.course_id, name: c.course_name })));
    } catch (err) {
      setCourseProgressError(err.message || "Failed to load course progress reports.");
    } finally {
      setCourseProgressLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    async function loadAll() {
      try {
        const [ovRes, perfRes, cpRes] = await Promise.allSettled([
          apiClient("/reports/overview/"),
          apiClient("/reports/learner-performance/"),
          apiClient("/reports/course-progress/"),
        ]);

        if (!isMounted) return;

        if (ovRes.status === "fulfilled") {
          setOverviewData(ovRes.value);
          setOverviewLoading(false);
        } else {
          setOverviewError(ovRes.reason?.message || "Failed to load overview report.");
          setOverviewLoading(false);
        }

        if (perfRes.status === "fulfilled") {
          setPerformanceData(perfRes.value?.results || []);
          setScoringNotice(perfRes.value?.notice || "");
          setPerformanceLoading(false);
        } else {
          setPerformanceError(perfRes.reason?.message || "Failed to load performance report.");
          setPerformanceLoading(false);
        }

        if (cpRes.status === "fulfilled") {
          const list = Array.isArray(cpRes.value) ? cpRes.value : [];
          setCourseProgressData(list);
          setCoursesList(list.map((c) => ({ id: c.course_id, name: c.course_name })));
          setCourseProgressLoading(false);
        } else {
          setCourseProgressError(cpRes.reason?.message || "Failed to load course progress report.");
          setCourseProgressLoading(false);
        }
      } catch {
        if (isMounted) {
          setOverviewLoading(false);
          setPerformanceLoading(false);
          setCourseProgressLoading(false);
        }
      }
    }
    loadAll();
    return () => {
      isMounted = false;
    };
  }, []);

  // Inspect individual learner performance history
  const handleInspectLearner = async (learnerId) => {
    setInspectLearnerId(learnerId);
    setInspectLoading(true);
    try {
      const data = await apiClient(`/reports/learner-performance/?inspect_learner=${learnerId}`);
      setInspectedLearnerData(data?.inspected_learner || null);
    } catch {
      setInspectedLearnerData(null);
    } finally {
      setInspectLoading(false);
    }
  };

  // Filtered performance records
  const filteredPerformance = useMemo(() => {
    return performanceData.filter((item) => {
      if (selectedCourseFilter !== "ALL" && String(item.course_id) !== String(selectedCourseFilter)) {
        return false;
      }
      if (learnerSearch.trim()) {
        const q = learnerSearch.toLowerCase().trim();
        const name = (item.learner_name || "").toLowerCase();
        const email = (item.email || "").toLowerCase();
        const course = (item.course_name || "").toLowerCase();
        const module = (item.module_name || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !course.includes(q) && !module.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [performanceData, selectedCourseFilter, learnerSearch]);

  // Filtered course progress records
  const filteredCourseProgress = useMemo(() => {
    return courseProgressData.filter((item) => {
      if (courseSearch.trim()) {
        const q = courseSearch.toLowerCase().trim();
        const name = (item.course_name || "").toLowerCase();
        const program = (item.program_name || "").toLowerCase();
        if (!name.includes(q) && !program.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [courseProgressData, courseSearch]);

  const formatDate = (isoString) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  return (
    <div className="reports-container">
      {/* Header & Sub-navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
            {portalRole === "LEARNER" ? "My Learning Reports" : portalRole === "TRAINER" ? "Trainer Performance & Progress Reports" : "Enterprise Reports"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px", margin: 0 }}>
            {portalRole === "LEARNER"
              ? "Track your individual course progress, completion status, and evaluation history."
              : portalRole === "TRAINER"
              ? "Monitor training progress, module completions, and scores for your assigned learners."
              : "System-wide reporting for learner progress, assessment evaluation, and course completion."}
          </p>
        </div>

        {/* Section Tabs */}
        <div style={{ display: "inline-flex", background: "var(--bg-card)", padding: "4px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
          <button
            type="button"
            className={`btn ${activeSection === "overview" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveSection("overview")}
            style={{ padding: "6px 14px", fontSize: "13px", borderRadius: "var(--radius-sm)" }}
          >
            Overview
          </button>
          <button
            type="button"
            className={`btn ${activeSection === "performance" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveSection("performance")}
            style={{ padding: "6px 14px", fontSize: "13px", borderRadius: "var(--radius-sm)" }}
          >
            Learner Performance
          </button>
          <button
            type="button"
            className={`btn ${activeSection === "progress" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveSection("progress")}
            style={{ padding: "6px 14px", fontSize: "13px", borderRadius: "var(--radius-sm)" }}
          >
            Course Progress
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION A: OVERVIEW
         ========================================================================= */}
      {activeSection === "overview" && (
        <div>
          {overviewLoading ? (
            <div className="card" style={{ textAlign: "center", padding: "50px" }}>
              <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
              <p style={{ color: "var(--text-secondary)" }}>Aggregating overview report metrics...</p>
            </div>
          ) : overviewError ? (
            <div className="alert alert-error" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{overviewError}</span>
              <button type="button" className="btn btn-secondary" onClick={fetchOverview} style={{ padding: "4px 10px", fontSize: "12px" }}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Stat Cards Grid */}
              <div className="stats-grid" style={{ marginBottom: "20px" }}>
                <div className="stat-card">
                  <div className="stat-header">Overall Completion Rate</div>
                  <div className="stat-value" style={{ color: "var(--status-success)" }}>
                    {overviewData?.overall_completion_percentage ?? 0}%
                  </div>
                  <div className="stat-footer">Across verified required questions</div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">Total Learners</div>
                  <div className="stat-value">{overviewData?.total_learners ?? 0}</div>
                  <div className="stat-footer">
                    {portalRole === "LEARNER" ? "Enrolled learner account" : portalRole === "TRAINER" ? "In assigned cohorts" : "Active in system"}
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">Total Courses</div>
                  <div className="stat-value">{overviewData?.total_courses ?? 0}</div>
                  <div className="stat-footer">Published curriculum courses</div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">Total Enrollments</div>
                  <div className="stat-value">{overviewData?.total_assigned_enrollments ?? 0}</div>
                  <div className="stat-footer">Active training allocations</div>
                </div>
              </div>

              {/* Course Status Breakdown Card */}
              <div className="card" style={{ padding: "20px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", marginBottom: "16px" }}>
                  Course Enrollment Status Breakdown
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                  <div style={{ background: "rgba(34, 197, 94, 0.08)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--status-success)", textTransform: "uppercase" }}>Completed</div>
                    <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)", marginTop: "4px" }}>
                      {overviewData?.completed_courses ?? 0}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>All required module questions answered</div>
                  </div>

                  <div style={{ background: "rgba(56, 189, 248, 0.08)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(56, 189, 248, 0.2)" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "#38bdf8", textTransform: "uppercase" }}>In Progress</div>
                    <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)", marginTop: "4px" }}>
                      {overviewData?.in_progress_courses ?? 0}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>Partially completed or ongoing</div>
                  </div>

                  <div style={{ background: "rgba(148, 163, 184, 0.08)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(148, 163, 184, 0.2)" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase" }}>Not Started</div>
                    <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)", marginTop: "4px" }}>
                      {overviewData?.not_started_courses ?? 0}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>Zero questions answered yet</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          SECTION B: LEARNER PERFORMANCE
         ========================================================================= */}
      {activeSection === "performance" && (
        <div>
          {/* Informational Scoring Notice */}
          <div className="card" style={{ padding: "14px 18px", marginBottom: "16px", background: "rgba(99, 102, 241, 0.06)", borderColor: "rgba(99, 102, 241, 0.25)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#818cf8", flexShrink: 0, marginTop: "2px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                <strong style={{ color: "var(--text-main)" }}>Assessment & Scoring Architecture Notice:</strong>{" "}
                {scoringNotice || "The LMS displays actual recorded assessment scores. Module completion gates and Yes/No comprehension confirmations are tracked distinctly from scored assessments without inventing artificial pass/fail criteria."}
              </div>
            </div>
          </div>

          {/* Search and Filters Bar */}
          <div className="card" style={{ padding: "14px 18px", marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 240px", maxWidth: "380px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search by learner, email, course, module..."
                  value={learnerSearch}
                  onChange={(e) => setLearnerSearch(e.target.value)}
                  style={{ width: "100%", fontSize: "13px" }}
                />
                {learnerSearch && (
                  <button type="button" className="btn btn-secondary" onClick={() => setLearnerSearch("")} style={{ padding: "6px 10px", fontSize: "12px" }}>
                    Clear
                  </button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label htmlFor="rep-course-filter" style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: "500" }}>Course:</label>
                <select
                  id="rep-course-filter"
                  className="form-input"
                  value={selectedCourseFilter}
                  onChange={(e) => setSelectedCourseFilter(e.target.value)}
                  style={{ width: "auto", minWidth: "160px", fontSize: "13px" }}
                >
                  <option value="ALL">All Courses</option>
                  {coursesList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fetchPerformance(selectedCourseFilter)}
                  disabled={performanceLoading}
                  style={{ padding: "6px 12px", fontSize: "13px" }}
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Performance Table */}
          {performanceError && (
            <div className="alert alert-error" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{performanceError}</span>
              <button type="button" className="btn btn-secondary" onClick={() => fetchPerformance(selectedCourseFilter)} style={{ padding: "4px 8px", fontSize: "12px" }}>
                Retry
              </button>
            </div>
          )}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {performanceLoading ? (
              <div style={{ padding: "50px 20px", textAlign: "center" }}>
                <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading learner performance records...</p>
              </div>
            ) : filteredPerformance.length === 0 ? (
              <div style={{ padding: "50px 20px", textAlign: "center" }}>
                <svg width="36" height="36" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: "0 auto 12px", color: "var(--text-muted)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h4 style={{ color: "var(--text-main)", fontSize: "15px", marginBottom: "4px" }}>No assessment records found</h4>
                <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                  {learnerSearch || selectedCourseFilter !== "ALL"
                    ? "No records matched your search criteria. Try adjusting filters."
                    : "No module question submissions or scored assessment responses have been recorded yet."}
                </p>
              </div>
            ) : (
              <div className="table-responsive" style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", background: "rgba(255,255,255,0.02)" }}>
                      <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Learner</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Course</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Module</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Assessment / Item</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Score</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Percentage</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Submission Date</th>
                      {portalRole !== "LEARNER" && (
                        <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", textAlign: "right" }}>Inspect</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPerformance.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "12px 18px" }}>
                          <div style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)" }}>{item.learner_name}</div>
                          {item.email && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{item.email}</div>}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>{item.course_name}</td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>{item.module_name}</td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.assessment_name}>
                          {item.assessment_name || "Module Completion Question"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {item.is_scored ? (
                            <span style={{ fontWeight: "700", color: "var(--accent-primary)" }}>
                              {item.marks_obtained} / {item.total_marks ?? "-"}
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                              Non-scored completion
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {item.percentage !== null ? (
                            <span style={{ fontWeight: "600", color: "var(--status-success)" }}>
                              {item.percentage}%
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-secondary)" }}>
                          {formatDate(item.submission_date)}
                        </td>
                        {portalRole !== "LEARNER" && (
                          <td style={{ padding: "12px 18px", textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleInspectLearner(item.learner_id)}
                              style={{ padding: "4px 8px", fontSize: "12px" }}
                            >
                              Inspect
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Individual Learner Inspection Drawer / Modal */}
          {inspectLearnerId && (
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
              <div className="card" style={{ maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                    Learner Profile & Course-Wise Breakdown
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectLearnerId(null);
                      setInspectedLearnerData(null);
                    }}
                    style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "20px" }}
                  >
                    ×
                  </button>
                </div>

                {inspectLoading ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                    <p style={{ color: "var(--text-secondary)" }}>Loading learner course breakdown...</p>
                  </div>
                ) : !inspectedLearnerData ? (
                  <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "20px" }}>
                    Learner records unavailable or not found.
                  </p>
                ) : (
                  <div>
                    <div style={{ marginBottom: "16px", padding: "12px", background: "var(--bg-main)", borderRadius: "var(--radius-sm)" }}>
                      <div style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-main)" }}>
                        {inspectedLearnerData.name}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {inspectedLearnerData.email || "No email address registered"}
                      </div>
                    </div>

                    <h4 style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)", marginBottom: "10px" }}>
                      Course-Wise Progress
                    </h4>
                    {inspectedLearnerData.courses?.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>No assigned courses found for this learner.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {inspectedLearnerData.courses.map((c) => (
                          <div
                            key={c.course_id}
                            style={{
                              padding: "12px 14px",
                              border: "1px solid var(--border-color)",
                              borderRadius: "var(--radius-sm)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)" }}>
                                {c.course_name}
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                                Modules: {c.completed_modules} / {c.total_modules} completed
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: "10px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  background: c.status === "COMPLETED" ? "rgba(34, 197, 94, 0.15)" : c.status === "IN_PROGRESS" ? "rgba(56, 189, 248, 0.15)" : "rgba(148, 163, 184, 0.15)",
                                  color: c.status === "COMPLETED" ? "var(--status-success)" : c.status === "IN_PROGRESS" ? "#38bdf8" : "var(--text-secondary)",
                                }}
                              >
                                {c.status} ({c.completion_percentage}%)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          SECTION C: COURSE PROGRESS
         ========================================================================= */}
      {activeSection === "progress" && (
        <div>
          {/* Search Bar */}
          <div className="card" style={{ padding: "14px 18px", marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1 1 240px", maxWidth: "380px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Filter courses by name or program..."
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  style={{ width: "100%", fontSize: "13px" }}
                />
                {courseSearch && (
                  <button type="button" className="btn btn-secondary" onClick={() => setCourseSearch("")} style={{ padding: "6px 10px", fontSize: "12px" }}>
                    Clear
                  </button>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchCourseProgress}
                disabled={courseProgressLoading}
                style={{ padding: "6px 12px", fontSize: "13px" }}
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Course Progress Table */}
          {courseProgressError && (
            <div className="alert alert-error" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{courseProgressError}</span>
              <button type="button" className="btn btn-secondary" onClick={fetchCourseProgress} style={{ padding: "4px 8px", fontSize: "12px" }}>
                Retry
              </button>
            </div>
          )}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {courseProgressLoading ? (
              <div style={{ padding: "50px 20px", textAlign: "center" }}>
                <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
                <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading course progress metrics...</p>
              </div>
            ) : filteredCourseProgress.length === 0 ? (
              <div style={{ padding: "50px 20px", textAlign: "center" }}>
                <svg width="36" height="36" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ margin: "0 auto 12px", color: "var(--text-muted)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <h4 style={{ color: "var(--text-main)", fontSize: "15px", marginBottom: "4px" }}>No courses found</h4>
                <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                  {courseSearch
                    ? "No courses matched your search criteria."
                    : "No published curriculum courses have been assigned to learners yet."}
                </p>
              </div>
            ) : (
              <div className="table-responsive" style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", background: "rgba(255,255,255,0.02)" }}>
                      <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Course</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Program</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Assigned Learners</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Completed</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>In Progress</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Not Started</th>
                      <th style={{ padding: "12px 18px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Average Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourseProgress.map((c) => (
                      <tr key={c.course_id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td style={{ padding: "12px 18px" }}>
                          <span style={{ fontWeight: "600", fontSize: "13px", color: "var(--text-main)" }}>
                            {c.course_name}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                          {c.program_name || "-"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontWeight: "600", color: "var(--text-main)" }}>
                            {c.assigned_learners_count}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ color: "var(--status-success)", fontWeight: "600" }}>
                            {c.completed_learners_count}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ color: "#38bdf8", fontWeight: "600" }}>
                            {c.in_progress_learners_count}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "var(--text-muted)" }}>
                          {c.not_started_learners_count}
                        </td>
                        <td style={{ padding: "12px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ flex: 1, backgroundColor: "var(--bg-main)", height: "8px", borderRadius: "4px", overflow: "hidden", minWidth: "80px" }}>
                              <div
                                style={{
                                  width: `${Math.min(100, Math.max(0, c.average_completion_percentage))}%`,
                                  backgroundColor: c.average_completion_percentage === 100 ? "var(--status-success)" : "var(--accent-primary)",
                                  height: "100%",
                                }}
                              />
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: "700", minWidth: "40px" }}>
                              {c.average_completion_percentage}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

