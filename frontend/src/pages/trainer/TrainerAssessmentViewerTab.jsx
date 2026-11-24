import { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "../../services/api";

/**
 * TrainerAssessmentViewerTab
 *
 * Read-Only Assessment Question and Answer Viewer for Trainer Portal:
 * - Trainers can view all assessment questions, answer options, correct answers, and explanations
 *   for all modules published by Admin (matching the published-module visibility rule).
 * - Read-only: no creation, editing, deleting, or mutation actions.
 * - Supports searching and filtering questions by type or keyword.
 * - Shows module context, tier/level, and question counts.
 */
export default function TrainerAssessmentViewerTab() {
  const [courses, setCourses] = useState([]);
  const [courseLevels, setCourseLevels] = useState([]);
  const [modules, setModules] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState(null);

  // Selected module state
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("ALL"); // ALL | MULTIPLE_CHOICE | YES_NO

  // 1. Fetch published catalog
  const fetchCatalog = useCallback(async () => {
    try {
      setLoadingCatalog(true);
      setCatalogError(null);

      const [coursesRes, levelsRes, modulesRes] = await Promise.all([
        apiClient("/courses/").catch(() => []),
        apiClient("/course-levels/").catch(() => []),
        apiClient("/modules/").catch(() => []),
      ]);

      const courseList = Array.isArray(coursesRes) ? coursesRes : coursesRes?.results || [];
      const levelList = Array.isArray(levelsRes) ? levelsRes : levelsRes?.results || [];
      const moduleList = Array.isArray(modulesRes) ? modulesRes : modulesRes?.results || [];

      setCourses(courseList);
      setCourseLevels(levelList);
      setModules(moduleList);
    } catch (err) {
      setCatalogError(err.message || "Failed to load curriculum catalog.");
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Filter to published courses
  const publishedCourses = useMemo(() => {
    return courses.filter((c) => c.status === "PUBLISHED");
  }, [courses]);

  const publishedCourseIds = useMemo(() => {
    return new Set(publishedCourses.map((c) => c.id));
  }, [publishedCourses]);

  // Filter to published modules whose parent course (if any) is published
  const publishedModules = useMemo(() => {
    return modules
      .filter((m) => m.status === "PUBLISHED" && (!m.course || publishedCourseIds.has(m.course)))
      .sort((a, b) => {
        // Sort by course, level, order
        if (a.course !== b.course) return (a.course || 0) - (b.course || 0);
        if (a.level !== b.level) return (a.level || 0) - (b.level || 0);
        return (a.order || 0) - (b.order || 0);
      });
  }, [modules, publishedCourseIds]);

  // Set default selected module when publishedModules load
  useEffect(() => {
    if (publishedModules.length > 0 && !selectedModuleId) {
      setSelectedModuleId(String(publishedModules[0].id));
    }
  }, [publishedModules, selectedModuleId]);

  // 2. Fetch questions for selected module
  const fetchQuestions = useCallback(async (moduleId) => {
    if (!moduleId) {
      setQuestions([]);
      return;
    }
    try {
      setLoadingQuestions(true);
      setQuestionsError(null);
      const res = await apiClient(`/module-questions/?module=${moduleId}`);
      const list = Array.isArray(res) ? res : res?.results || [];
      // Sort questions by order
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      setQuestions(list);
    } catch (err) {
      setQuestionsError(err.message || "Failed to load assessment questions.");
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    if (selectedModuleId) {
      fetchQuestions(selectedModuleId);
    }
  }, [selectedModuleId, fetchQuestions]);

  // Selected module metadata
  const selectedModule = useMemo(() => {
    return publishedModules.find((m) => String(m.id) === String(selectedModuleId)) || null;
  }, [publishedModules, selectedModuleId]);

  const selectedLevel = useMemo(() => {
    if (!selectedModule?.level) return null;
    return courseLevels.find((l) => l.id === selectedModule.level) || null;
  }, [selectedModule, courseLevels]);

  const selectedCourse = useMemo(() => {
    if (!selectedModule?.course) return null;
    return publishedCourses.find((c) => c.id === selectedModule.course) || null;
  }, [selectedModule, publishedCourses]);

  // Filtered questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (filterType !== "ALL" && q.question_type !== filterType) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inText = (q.question_text || "").toLowerCase().includes(query);
        const inOptions = (q.options || []).some(
          (opt) =>
            (opt.text || "").toLowerCase().includes(query) ||
            (opt.explanation || "").toLowerCase().includes(query)
        );
        return inText || inOptions;
      }
      return true;
    });
  }, [questions, filterType, searchQuery]);

  if (loadingCatalog) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
          Loading assessment catalogue...
        </p>
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--status-error)" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--status-error)", margin: "0 0 8px 0" }}>
          Unable to Load Assessment Catalogue
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "0 0 16px 0" }}>
          {catalogError}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={fetchCatalog}
          style={{ padding: "8px 16px", fontSize: "13px" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Read-Only Notice Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              color: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-main)" }}>
              Read-Only Assessment Question Bank
            </span>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
              Inspection mode: trainers have verified read-only access to all Admin-published module assessments, answer options, and correct answers. Question creation and editing are reserved for Administrators.
            </p>
          </div>
        </div>
        <span className="badge badge-info" style={{ fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>
          Read-Only Mode
        </span>
      </div>

      {/* Module Selector & Filter Header */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end", justifyContent: "space-between" }}>
          {/* Module Dropdown */}
          <div style={{ flex: "1 1 320px", minWidth: "260px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "6px" }}>
              Select Published Module Assessment:
            </label>
            <select
              value={selectedModuleId}
              onChange={(e) => setSelectedModuleId(e.target.value)}
              className="form-control"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                backgroundColor: "var(--bg-main, #ffffff)",
                color: "var(--text-main, #0f172a)",
              }}
            >
              {publishedModules.length === 0 ? (
                <option value="">No published modules available</option>
              ) : (
                publishedModules.map((m) => {
                  const crs = courses.find((c) => c.id === m.course);
                  const lvl = courseLevels.find((l) => l.id === m.level);
                  const prefix = crs ? `${crs.code || crs.name} › ` : lvl ? `${lvl.name} › ` : "";
                  return (
                    <option key={m.id} value={m.id}>
                      {prefix}{m.name} (#{m.order})
                    </option>
                  );
                })
              )}
            </select>
          </div>

          {/* Search Query */}
          <div style={{ flex: "1 1 240px", minWidth: "200px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "6px" }}>
              Search Questions or Answers:
            </label>
            <input
              type="text"
              placeholder="Filter by question text, option, or explanation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-control"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                backgroundColor: "var(--bg-main, #ffffff)",
                color: "var(--text-main, #0f172a)",
              }}
            />
          </div>

          {/* Type Filter */}
          <div style={{ flex: "0 0 160px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "6px" }}>
              Question Type:
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-control"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                backgroundColor: "var(--bg-main, #ffffff)",
                color: "var(--text-main, #0f172a)",
              }}
            >
              <option value="ALL">All Types</option>
              <option value="MULTIPLE_CHOICE">Multiple Choice</option>
              <option value="YES_NO">Yes / No</option>
            </select>
          </div>
        </div>

        {/* Selected Module Summary Pill */}
        {selectedModule && (
          <div
            style={{
              marginTop: "16px",
              paddingTop: "14px",
              borderTop: "1px solid var(--border-color, #e2e8f0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main)" }}>
                {selectedModule.name}
              </span>
              {selectedCourse && (
                <span className="badge badge-purple" style={{ fontSize: "11px" }}>
                  Course: {selectedCourse.name}
                </span>
              )}
              {selectedLevel && (
                <span className="badge badge-secondary" style={{ fontSize: "11px" }}>
                  Level: {selectedLevel.name}
                </span>
              )}
              <span className="badge badge-success" style={{ fontSize: "11px" }}>
                Status: Published
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Total Questions: <strong>{questions.length}</strong>
              {filteredQuestions.length !== questions.length && (
                <span> (Matching: <strong>{filteredQuestions.length}</strong>)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Questions Listing */}
      {loadingQuestions ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
            Loading module assessment questions...
          </p>
        </div>
      ) : questionsError ? (
        <div className="card" style={{ padding: "20px", borderLeft: "4px solid var(--status-error)" }}>
          <p style={{ color: "var(--status-error)", fontSize: "13px", margin: "0 0 12px 0" }}>
            {questionsError}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fetchQuestions(selectedModuleId)}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            Retry
          </button>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "rgba(100, 116, 139, 0.1)",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 6px 0", color: "var(--text-main)" }}>
            {questions.length === 0 ? "No Assessment Questions Configured" : "No Questions Match Filter"}
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
            {questions.length === 0
              ? "This published module currently does not have any assessment questions created by an Administrator."
              : "Try clearing your search query or changing the question type filter."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredQuestions.map((q, idx) => {
            const rawOptions = q.options || [];
            // If YES_NO question has empty options, generate standard Yes/No
            const options =
              q.question_type === "YES_NO" && rawOptions.length === 0
                ? [
                    {"id": "opt_yes", "text": "Yes", "is_correct": true},
                    {"id": "opt_no", "text": "No", "is_correct": false},
                  ]
                : rawOptions;

            return (
              <div
                key={q.id}
                className="card"
                style={{
                  padding: "20px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  backgroundColor: "var(--bg-main, #ffffff)",
                }}
              >
                {/* Question Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "12px",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <div
                      style={{
                        minWidth: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        backgroundColor: "var(--primary-subtle, rgba(59, 130, 246, 0.12))",
                        color: "var(--primary-color, #2563eb)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "700",
                        fontSize: "12px",
                        flexShrink: 0,
                      }}
                    >
                      {q.order || idx + 1}
                    </div>
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "15px",
                          fontWeight: "600",
                          color: "var(--text-main, #0f172a)",
                          lineHeight: "1.4",
                        }}
                      >
                        {q.question_text}
                      </h4>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <span
                      className={`badge ${
                        q.question_type === "MULTIPLE_CHOICE" ? "badge-info" : "badge-secondary"
                      }`}
                      style={{ fontSize: "11px" }}
                    >
                      {q.question_type === "MULTIPLE_CHOICE" ? "Multiple Choice" : "Yes / No"}
                    </span>
                    {q.is_required && (
                      <span className="badge badge-warning" style={{ fontSize: "10px" }}>
                        Mandatory Gate
                      </span>
                    )}
                  </div>
                </div>

                {/* Options List */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginTop: "14px",
                    paddingLeft: "38px",
                  }}
                >
                  {options.map((opt, optIdx) => {
                    const isCorrect = opt.is_correct === true;
                    return (
                      <div
                        key={opt.id || optIdx}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          padding: "10px 14px",
                          borderRadius: "6px",
                          backgroundColor: isCorrect
                            ? "rgba(16, 185, 129, 0.08)"
                            : "var(--bg-subtle, #f8fafc)",
                          border: isCorrect
                            ? "1px solid rgba(16, 185, 129, 0.35)"
                            : "1px solid var(--border-color, #e2e8f0)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {/* Option Index / Checkmark */}
                            <div
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                backgroundColor: isCorrect ? "#10b981" : "rgba(148, 163, 184, 0.2)",
                                color: isCorrect ? "#ffffff" : "var(--text-secondary)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "11px",
                                fontWeight: "700",
                                flexShrink: 0,
                              }}
                            >
                              {isCorrect ? "✓" : String.fromCharCode(65 + optIdx)}
                            </div>
                            <span
                              style={{
                                fontSize: "13px",
                                fontWeight: isCorrect ? "600" : "400",
                                color: isCorrect ? "#065f46" : "var(--text-main)",
                              }}
                            >
                              {opt.text}
                            </span>
                          </div>

                          {isCorrect && (
                            <span
                              className="badge badge-success"
                              style={{
                                fontSize: "10px",
                                padding: "3px 8px",
                                fontWeight: "700",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <span>✓ Correct Answer</span>
                            </span>
                          )}
                        </div>

                        {/* Explanation, if provided */}
                        {opt.explanation && (
                          <div
                            style={{
                              marginTop: "4px",
                              paddingLeft: "30px",
                              fontSize: "12px",
                              color: isCorrect ? "#047857" : "var(--text-secondary)",
                              fontStyle: "italic",
                            }}
                          >
                            <strong>Explanation:</strong> {opt.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
