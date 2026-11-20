import { useEffect, useState, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";

export default function ReportsView({ portalRole = "ADMIN" }) {
  const [activeSection, setActiveSection] = useState("overview"); // 'overview' | 'performance'

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
  const [courseLevels, setCourseLevels] = useState([]);
  const [modulesList, setModulesList] = useState([]);

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
        if (String(courseFilter).startsWith("level:")) {
          params.push(`level=${String(courseFilter).slice(6)}`);
        } else {
          params.push(`course=${courseFilter}`);
        }
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
      // Populate unique course/independent-level filter options
      setCoursesList(
        list.map((c) => ({
          id: c.course_id != null ? String(c.course_id) : `level:${c.level_id ?? c.course_name}`,
          name: c.course_name || c.level_name,
        }))
      );
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
        const [ovRes, perfRes, cpRes, lvlRes, modRes] = await Promise.allSettled([
          apiClient("/reports/overview/"),
          apiClient("/reports/learner-performance/"),
          apiClient("/reports/course-progress/"),
          apiClient("/course-levels/"),
          apiClient("/modules/"),
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
          setCoursesList(
            list.map((c) => ({
              id: c.course_id != null ? String(c.course_id) : `level:${c.level_id ?? c.course_name}`,
              name: c.course_name || c.level_name,
            }))
          );
          setCourseProgressLoading(false);
        } else {
          setCourseProgressError(cpRes.reason?.message || "Failed to load course progress report.");
          setCourseProgressLoading(false);
        }

        if (lvlRes.status === "fulfilled") {
          const list = Array.isArray(lvlRes.value) ? lvlRes.value : (lvlRes.value?.results || []);
          setCourseLevels(list);
        }

        if (modRes.status === "fulfilled") {
          const list = Array.isArray(modRes.value) ? modRes.value : (modRes.value?.results || []);
          setModulesList(list);
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

  // Helper to dynamically resolve the accurate level name for a learner's course or progress record
  const getLearnerLevelName = useCallback(
    (lp, learnerId = null) => {
      if (lp?.level_name) {
        return lp.level_name;
      }
      if (!courseLevels || courseLevels.length === 0) {
        return lp?.course_name || "Level 1";
      }

      const targetLearnerId = learnerId || lp?.learner_id || lp?.id;

      // 1. Check if learner has modules with progress or assessment attempts in lp.modules_progress
      const modProgress = lp?.modules_progress || [];
      const activeMod =
        modProgress.find((m) => m.status === "IN PROGRESS") ||
        modProgress.find((m) => m.status === "COMPLETED") ||
        modProgress[0];

      if (activeMod && modulesList && modulesList.length > 0) {
        const foundMod = modulesList.find((m) => m.id === activeMod.module_id);
        if (foundMod) {
          const lvlId = foundMod.level_id || (typeof foundMod.level === "object" ? foundMod.level?.id : foundMod.level);
          const matchedLvl = courseLevels.find((lvl) => lvl.id === lvlId);
          if (matchedLvl?.name) {
            return matchedLvl.name;
          }
        }
      }

      // 2. Check performanceData for this learner & course to find their actual active/submitted modules
      if (targetLearnerId && performanceData && performanceData.length > 0 && modulesList && modulesList.length > 0) {
        const learnerItems = performanceData.filter(
          (p) => String(p.learner_id) === String(targetLearnerId) && (lp?.course_id ? String(p.course_id) === String(lp.course_id) : true)
        );
        for (const item of learnerItems) {
          const foundMod = modulesList.find((m) => m.id === item.module_id);
          if (foundMod) {
            const lvlId = foundMod.level_id || (typeof foundMod.level === "object" ? foundMod.level?.id : foundMod.level);
            const matchedLvl = courseLevels.find((lvl) => lvl.id === lvlId);
            if (matchedLvl?.name) {
              return matchedLvl.name;
            }
          }
        }
      }

      // 3. Direct course level lookup for this course with lowest order
      const courseLvls = courseLevels
        .filter((lvl) => String(lvl.course) === String(lp?.course_id))
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      if (courseLvls.length > 0 && courseLvls[0]?.name) {
        return courseLvls[0].name;
      }

      // 4. Any matched level in courseLevels
      const fallbackLvl = courseLevels.find((lvl) => String(lvl.course) === String(lp?.course_id)) || courseLevels[0];
      return fallbackLvl?.name || "Level 1";
    },
    [courseLevels, modulesList, performanceData]
  );

  // Filtered and aggregated performance records:
  // Consolidated one row per learner per module using their applicable assessment attempt
  const filteredPerformance = useMemo(() => {
    // 1. Group records by (learner_id, module_id)
    const groups = new Map();
    (performanceData || []).forEach((item) => {
      const key = `${item.learner_id}_${item.module_id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(item);
    });

    const aggregated = [];
    groups.forEach((items) => {
      // Group items by attempt_number to avoid combining scores across different attempts
      const attemptsMap = new Map();
      items.forEach((it) => {
        const attNum = it.attempt_number || 1;
        if (!attemptsMap.has(attNum)) {
          attemptsMap.set(attNum, []);
        }
        attemptsMap.get(attNum).push(it);
      });

      // Find the applicable attempt: attempt with highest total score, or highest attempt number
      let bestAttempt = null;
      let highestScore = -1;
      attemptsMap.forEach((attItems, attNum) => {
        const totalMarksObtained = attItems.reduce(
          (sum, i) => sum + (typeof i.marks_obtained === "number" ? i.marks_obtained : 0),
          0
        );
        if (totalMarksObtained > highestScore || bestAttempt === null) {
          highestScore = totalMarksObtained;
          bestAttempt = {
            attemptNumber: attNum,
            items: attItems,
            score: totalMarksObtained,
          };
        }
      });

      const applicableItems = bestAttempt?.items || items;
      const primaryItem = applicableItems[0] || items[0];

      // Calculate total marks for the module (e.g., 3/5)
      const marksObtained = bestAttempt ? bestAttempt.score : 0;
      const totalMarks =
        applicableItems.reduce(
          (sum, i) => sum + (typeof i.total_marks === "number" ? i.total_marks : 1),
          0
        ) || 5;

      // PASS/FAIL result based on existing 3/5 (60%) threshold
      const result = marksObtained >= 3 ? "PASS" : "FAIL";

      // Submission date of the applicable attempt
      const submissionDate =
        applicableItems.find((i) => i.submission_date)?.submission_date ||
        primaryItem.submission_date;

      // Resolve Level name / number
      // Check matching level from courseLevels or primaryItem.level / level_name
      let levelDisplay = "Level 1";
      if (primaryItem.level_name) {
        levelDisplay = primaryItem.level_name;
      } else if (courseLevels.length > 0) {
        const matchedLevel =
          courseLevels.find((lvl) => lvl.id === primaryItem.level_id || lvl.id === primaryItem.level) ||
          courseLevels.find((lvl) => lvl.course === primaryItem.course_id);
        if (matchedLevel) {
          levelDisplay = matchedLevel.name || `Level ${matchedLevel.order || 1}`;
        }
      }

      aggregated.push({
        learner_id: primaryItem.learner_id,
        learner_name: primaryItem.learner_name,
        email: primaryItem.email,
        course_id: primaryItem.course_id,
        course_name: primaryItem.course_name,
        level_id: primaryItem.level_id,
        level_display: levelDisplay,
        module_id: primaryItem.module_id,
        module_name: primaryItem.module_name,
        marks_obtained: marksObtained,
        total_marks: totalMarks,
        result: result,
        submission_date: submissionDate,
      });
    });

    // Sort by latest submission date
    aggregated.sort((a, b) => new Date(b.submission_date || 0) - new Date(a.submission_date || 0));

    // 2. Apply search and course filters
    return aggregated.filter((item) => {
      if (selectedCourseFilter !== "ALL") {
        if (String(selectedCourseFilter).startsWith("level:")) {
          const targetLvlId = String(selectedCourseFilter).slice(6);
          if (String(item.level_id) !== targetLvlId && String(item.level_display) !== targetLvlId) {
            return false;
          }
        } else if (String(item.course_id) !== String(selectedCourseFilter)) {
          return false;
        }
      }
      if (learnerSearch.trim()) {
        const q = learnerSearch.toLowerCase().trim();
        const name = (item.learner_name || "").toLowerCase();
        const email = (item.email || "").toLowerCase();
        const level = (item.level_display || "").toLowerCase();
        const course = (item.course_name || "").toLowerCase();
        const module = (item.module_name || "").toLowerCase();
        if (
          !name.includes(q) &&
          !email.includes(q) &&
          !level.includes(q) &&
          !course.includes(q) &&
          !module.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [performanceData, courseLevels, selectedCourseFilter, learnerSearch]);

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
      {/* Section Sub-navigation Tabs */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "20px" }}>
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
              {/* Learner Progress Overview */}
              <div className="card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                      Learner Progress Overview
                    </h3>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0 }}>
                      Individual learner progress, module enrollment status breakdown, and assessment results.
                    </p>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: "12px", padding: "4px 10px" }}>
                    {overviewData?.learners_progress?.length || 0} {overviewData?.learners_progress?.length === 1 ? "Learner Record" : "Learner Records"}
                  </span>
                </div>

                {(!overviewData?.learners_progress || overviewData.learners_progress.length === 0) ? (
                  <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-secondary)", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-color)" }}>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: "500" }}>No learner progress records found.</p>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                      {portalRole === "TRAINER"
                        ? "No learners are currently assigned to your active training groups."
                        : "No active learners or course allocations were found."}
                    </p>
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
                        {/* Learner Info Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "14px" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                              <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>
                                {lp.learner_name}
                              </h4>
                              {lp.learner_username && lp.learner_username !== lp.learner_name && (
                                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                  ({lp.learner_username})
                                </span>
                              )}
                              <span
                                className={`badge ${
                                  lp.enrollment_status === "COMPLETED"
                                    ? "badge-success"
                                    : lp.enrollment_status === "IN_PROGRESS"
                                    ? "badge-info"
                                    : "badge-secondary"
                                }`}
                                style={{ fontSize: "11px", fontWeight: "600" }}
                              >
                                {lp.enrollment_status === "COMPLETED" ? "Completed" : lp.enrollment_status === "IN_PROGRESS" ? "In Progress" : "Not Started"}
                              </span>
                            </div>
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                              Course:{" "}
                              <strong style={{ color: "var(--text-main)" }}>
                                {getLearnerLevelName(lp)}
                              </strong>
                              {lp.learner_email && (
                                <span style={{ marginLeft: "10px", color: "var(--text-muted)", fontSize: "12px" }}>
                                  &bull; {lp.learner_email}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Progress summary pill */}
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: "600" }}>
                                Overall Course Progress
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

                        {/* Breakdown Grid: Course Enrollment Status Breakdown & Assessment Results */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                          {/* Course Enrollment Status Breakdown (Individual) */}
                          <div style={{ background: "var(--bg-surface, #f8fafc)", padding: "14px 16px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                            <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "10px" }}>
                              Course Enrollment Status Breakdown
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                                  <th style={{ padding: "6px 0", color: "var(--text-secondary)", fontWeight: "600" }}>Status</th>
                                  <th style={{ padding: "6px 0", color: "var(--text-secondary)", fontWeight: "600", textAlign: "right" }}>Count</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                  <td style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--status-success)" }}></span>
                                    <span>Completed</span>
                                  </td>
                                  <td style={{ padding: "8px 0", textAlign: "right", fontWeight: "700", color: "var(--status-success)" }}>
                                    {lp.completed_modules}
                                  </td>
                                </tr>
                                <tr>
                                  <td style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#94a3b8" }}></span>
                                    <span>Not Started</span>
                                  </td>
                                  <td style={{ padding: "8px 0", textAlign: "right", fontWeight: "700", color: "#64748b" }}>
                                    {lp.not_started_modules}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Assessment Results — All Modules */}
                          <div style={{ background: "var(--bg-surface, #f8fafc)", padding: "14px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", overflow: "hidden" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
                              <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                                Assessment Results — All Modules {lp.assessment_results && lp.assessment_results.length > 0 && `(${lp.assessment_results.length})`}
                              </div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                Pass threshold: 60% (3/5)
                              </span>
                            </div>
                            <div style={{ overflowX: "auto", maxHeight: "320px", overflowY: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left", background: "var(--bg-surface, #f8fafc)", position: "sticky", top: 0, zIndex: 1 }}>
                                    <th style={{ padding: "6px 8px", color: "var(--text-secondary)", fontWeight: "600" }}>Module</th>
                                    <th style={{ padding: "6px 8px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "center" }}>Score</th>
                                    <th style={{ padding: "6px 8px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "center" }}>Percentage</th>
                                    <th style={{ padding: "6px 8px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "center" }}>Result</th>
                                    <th style={{ padding: "6px 8px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "center" }}>Attempts</th>
                                    <th style={{ padding: "6px 8px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "center" }}>Status</th>
                                    <th style={{ padding: "6px 8px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "right" }}>Last Attempt</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(lp.assessment_results && lp.assessment_results.length > 0) ? (
                                    lp.assessment_results.map((ar) => (
                                      <tr key={ar.module_id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                        <td style={{ padding: "8px", fontWeight: "500", color: "var(--text-main)", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ar.module_name}>
                                          {ar.module_name}
                                        </td>
                                        <td style={{ padding: "8px", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                                          {ar.score_display}
                                        </td>
                                        <td style={{ padding: "8px", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-main)" }}>
                                          {ar.percentage !== null && ar.percentage !== undefined ? `${ar.percentage}%` : "—"}
                                        </td>
                                        <td style={{ padding: "8px", textAlign: "center" }}>
                                          <span
                                            className={`badge ${
                                              ar.result === "PASS"
                                                ? "badge-success"
                                                : ar.result === "FAIL"
                                                ? "badge-error"
                                                : ar.result === "IN PROGRESS"
                                                ? "badge-info"
                                                : "badge-secondary"
                                            }`}
                                            style={{ fontSize: "10px", padding: "2px 6px" }}
                                          >
                                            {ar.result}
                                          </span>
                                        </td>
                                        <td style={{ padding: "8px", textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                                          {ar.attempts_count > 0 ? ar.attempts_count : 0}
                                        </td>
                                        <td style={{ padding: "8px", textAlign: "center" }}>
                                          <span style={{ fontSize: "11px", color: ar.is_completed ? "var(--status-success)" : "var(--text-secondary)", fontWeight: ar.is_completed ? "600" : "normal" }}>
                                            {ar.completion_status}
                                          </span>
                                        </td>
                                        <td style={{ padding: "8px", textAlign: "right", fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                          {ar.last_attempt_at ? formatDate(ar.last_attempt_at) : "—"}
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={7} style={{ padding: "12px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                                        No assessment modules configured for this course.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                        {/* Module-wise Learning Progress (Available only on Learner Portal) */}
                        {portalRole === "LEARNER" && lp.modules_progress && lp.modules_progress.length > 0 && (
                          <div style={{ marginTop: "16px", background: "var(--bg-surface, #f8fafc)", padding: "14px 16px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                              <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
                                Module-wise Learning Progress ({lp.modules_progress.length} Modules)
                              </div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                Passing threshold: 3/5 marks
                              </span>
                            </div>
                            <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "4px", backgroundColor: "#ffffff" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                <thead>
                                  <tr style={{ background: "var(--bg-surface, #f8fafc)", borderBottom: "1px solid var(--border-color)", position: "sticky", top: 0, zIndex: 1 }}>
                                    <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-secondary)", fontWeight: "600" }}>Module Name</th>
                                    <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)", fontWeight: "600" }}>Questions Status</th>
                                    <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)", fontWeight: "600" }}>Assessment Score</th>
                                    <th style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)", fontWeight: "600" }}>Result</th>
                                    <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-secondary)", fontWeight: "600" }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lp.modules_progress.map((mp, mIdx) => (
                                    <tr key={mp.module_id || mIdx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                                      <td style={{ padding: "8px 12px", fontWeight: "500", color: "var(--text-main)" }}>
                                        {mp.module_name}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-secondary)" }}>
                                        {mp.total_required_questions > 0 ? (
                                          <span style={{ fontFamily: "var(--font-mono)" }}>
                                            {mp.answered_required_questions}/{mp.total_required_questions} answered
                                          </span>
                                        ) : (
                                          <span style={{ color: "var(--text-muted)" }}>Reading material</span>
                                        )}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                                        {mp.is_tested_module ? mp.score_display : "—"}
                                      </td>
                                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                        {mp.is_tested_module ? (
                                          <span
                                            className={`badge ${
                                              mp.result === "PASS"
                                                ? "badge-success"
                                                : mp.result === "FAIL"
                                                ? "badge-error"
                                                : "badge-secondary"
                                            }`}
                                            style={{ fontSize: "10px", padding: "2px 6px" }}
                                          >
                                            {mp.result}
                                          </span>
                                        ) : (
                                          <span style={{ color: "var(--text-muted)" }}>—</span>
                                        )}
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
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Marks Obtained</th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>Result</th>
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
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>{item.level_display}</td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-secondary)" }}>{item.module_name}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontWeight: "700", color: "var(--accent-primary)" }}>
                            {item.marks_obtained} / {item.total_marks ?? 5}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {item.result === "PASS" ? (
                            <span className="badge badge-success" style={{ fontWeight: "700", fontSize: "11px", padding: "3px 8px" }}>
                              PASS
                            </span>
                          ) : (
                            <span className="badge badge-error" style={{ fontWeight: "700", fontSize: "11px", padding: "3px 8px" }}>
                              FAIL
                            </span>
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
                        {inspectedLearnerData.courses.map((c, idx) => (
                          <div
                            key={c.course_id != null ? `crs-${c.course_id}-${c.level_id ?? idx}` : `lvl-${c.level_id ?? idx}`}
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
                                {getLearnerLevelName(c, inspectedLearnerData.id)}
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
    </div>
  );
}

