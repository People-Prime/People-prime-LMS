import { useState } from "react";
import LessonMaterialsPanel from "./LessonMaterialsPanel";
import ActionMenu from "../../../components/common/ActionMenu";

export default function CourseCurriculumView({
  selectedCourse,
  courseLevels = [],
  onOpenCreateLevelModal,
  onDeleteLevel,
  onAssignModuleLevel,
  modules = [],
  activeModule,
  setActiveModule,
  moduleSubTab,
  setModuleSubTab,
  activeSubmodules = [],
  activeQuestions = [],
  contentLoading,
  moduleSearch,
  setModuleSearch,
  moduleStatusFilter,
  setModuleStatusFilter,
  mappings = [],
  onOpenCreateModuleModal,
  onOpenEditModuleModal,
  onDeleteModule,
  onDuplicateModule,
  onOpenModuleContent,
  onCloseModuleContent,
  onOpenCreateSubmoduleModal,
  onOpenEditSubmoduleModal,
  onDeleteSubmodule,
  onDuplicateSubmodule,
  onOpenCreateQuestionModal,
  onOpenEditQuestionModal,
  onDeleteQuestion,
  onOpenAttachModal,
  onMappingDeleted,
  onOpenPreviewCourseModal,
  getStatusBadge,
}) {
  const [selectedLevelFilter, setSelectedLevelFilter] = useState("ALL");
  const [levelCardSelection, setLevelCardSelection] = useState(null); // Level card drill-down state (matches Learner Portal)

  // Filter modules for this course
  const courseModules = selectedCourse
    ? modules.filter((m) => m.course === selectedCourse.id)
    : modules;

  // Filter levels for this course
  const activeCourseLevels = courseLevels
    .filter((lvl) => !selectedCourse || lvl.course === selectedCourse.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const filteredModules = courseModules.filter((m) => {
    const matchesSearch =
      !moduleSearch.trim() ||
      m.name.toLowerCase().includes(moduleSearch.toLowerCase());
    const matchesStatus =
      moduleStatusFilter === "ALL" || m.status === moduleStatusFilter;
    const matchesLevel =
      selectedLevelFilter === "ALL" ||
      (selectedLevelFilter === "UNASSIGNED" && !m.level) ||
      (m.level === parseInt(selectedLevelFilter, 10));
    return matchesSearch && matchesStatus && matchesLevel;
  });

  return (
    <div>
      {activeModule ? (
        /* ------------------------------------------------------------------- */
        /* Module Content Deep-Dive View (Submodules + Materials, Questions)    */
        /* ------------------------------------------------------------------- */
        <div className="card" style={{ marginBottom: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span className="badge badge-purple">Module #{activeModule.id}</span>
                {getStatusBadge(activeModule.status)}
              </div>
              <h3 style={{ margin: 0, fontSize: "18px" }}>{activeModule.name}</h3>
              <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>
                {selectedCourse?.name || activeModule.course_name ? (
                  <>
                    Course: <strong>{selectedCourse?.name || activeModule.course_name}</strong>
                  </>
                ) : (
                  <>
                    Level:{" "}
                    <strong>
                      {activeModule.level_name ||
                        courseLevels.find((lvl) => lvl.id === activeModule.level)?.name ||
                        "Independent Curriculum"}
                    </strong>
                  </>
                )}{" "}
                | Duration: {activeModule.estimated_duration_minutes} min
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {moduleSubTab === "submodules" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onOpenCreateSubmoduleModal}
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                >
                  + Add Submodule
                </button>
              )}
              {moduleSubTab === "questions" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onOpenCreateQuestionModal}
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                >
                  + Add Required Question
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCloseModuleContent}
                style={{ padding: "6px 12px", fontSize: "12px" }}
              >
                &larr; Back to Modules
              </button>
            </div>
          </div>

          {/* Module Inner Subtab Switcher */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              borderBottom: "1px solid var(--border-color)",
              marginBottom: "16px",
              paddingBottom: "8px",
            }}
          >
            <button
              type="button"
              className={`btn ${moduleSubTab === "submodules" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setModuleSubTab("submodules")}
              style={{ fontSize: "12px", padding: "4px 10px" }}
            >
              1. Training Content &amp; Materials ({activeSubmodules.length > 0 ? `${activeSubmodules.length} Lessons` : "Module Level"})
            </button>
            <button
              type="button"
              className={`btn ${moduleSubTab === "questions" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setModuleSubTab("questions")}
              style={{ fontSize: "12px", padding: "4px 10px" }}
            >
              2. Assessment Gates ({activeQuestions.length})
            </button>
          </div>

          {contentLoading ? (
            <div style={{ textAlign: "center", padding: "20px" }}>
              <div className="spinner" style={{ margin: "0 auto 10px" }}></div>
              <p style={{ color: "var(--text-secondary)", fontSize: "12px" }}>Loading content...</p>
            </div>
          ) : (
            <>
              {/* 1. Submodules / Lessons Panel with Inline Attached Training Materials */}
              {moduleSubTab === "submodules" && (
                <div>
                  {activeSubmodules.length === 0 ? (
                    <div>
                      {/* Direct Module-Level Attached Materials */}
                      <LessonMaterialsPanel
                        module={activeModule}
                        mappings={mappings}
                        onOpenAttachModal={() => onOpenAttachModal({ module: activeModule })}
                        onMappingDeleted={onMappingDeleted}
                      />
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {/* Optional Module-level materials header if any */}
                      {mappings.some((m) => m.module === activeModule.id && !m.submodule) && (
                        <div style={{ marginBottom: "8px" }}>
                          <LessonMaterialsPanel
                            module={activeModule}
                            mappings={mappings}
                            onOpenAttachModal={() => onOpenAttachModal({ module: activeModule })}
                            onMappingDeleted={onMappingDeleted}
                          />
                        </div>
                      )}
                      {activeSubmodules.map((sub) => (
                        <div
                          key={sub.id}
                          className="card"
                          style={{
                            padding: "16px",
                            backgroundColor: "var(--bg-card)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                              gap: "8px",
                            }}
                          >
                            <div style={{ flex: 1, minWidth: "200px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <span className="badge badge-purple">Lesson #{sub.order}</span>
                                {getStatusBadge(sub.status)}
                              </div>
                              <h4 style={{ margin: "2px 0 6px 0", fontSize: "15px", fontWeight: "600" }}>
                                {sub.name}
                              </h4>
                              {sub.description && (
                                <p
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--text-secondary)",
                                    margin: "0 0 6px 0",
                                    maxHeight: "60px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {sub.description.slice(0, 180)}...
                                </p>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <ActionMenu
                                actions={[
                                  {
                                    label: "Edit Lesson",
                                    icon: "✎",
                                    onClick: () => onOpenEditSubmoduleModal(sub),
                                    title: "Edit lesson title, order, or content",
                                  },
                                  onDuplicateSubmodule && {
                                    label: "Duplicate Lesson",
                                    icon: "⧉",
                                    onClick: () => onDuplicateSubmodule(sub),
                                    title: "Create a copy of this lesson under the current module",
                                  },
                                  {
                                    label: "+ Attach Training Material",
                                    icon: "📎",
                                    onClick: () => onOpenAttachModal(sub),
                                    title: "Attach reference or instructional files to this lesson",
                                  },
                                  sub.status === "DRAFT"
                                    ? {
                                        label: "Delete Lesson",
                                        icon: "🗑",
                                        danger: true,
                                        onClick: () => onDeleteSubmodule(sub),
                                        title: "Delete this draft lesson",
                                      }
                                    : {
                                        label: "Delete Locked (Published)",
                                        icon: "🔒",
                                        disabled: true,
                                        title: "Only draft submodules can be deleted",
                                      },
                                ]}
                              />
                            </div>
                          </div>

                          {/* Inline Attached Materials for this lesson */}
                          <LessonMaterialsPanel
                            submodule={sub}
                            mappings={mappings}
                            onOpenAttachModal={onOpenAttachModal}
                            onMappingDeleted={onMappingDeleted}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Questions Panel */}
              {moduleSubTab === "questions" && (
                <div>
                  <div className="alert alert-info" style={{ marginBottom: "12px", fontSize: "12px" }}>
                    <strong>Completion Rule:</strong> Learners must answer all active required questions to complete
                    this module. Modules with 0 active required questions remain incomplete.
                  </div>
                  {activeQuestions.length === 0 ? (
                    <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                      No completion questions defined for this module. Click &quot;+ Add Required Question&quot; above
                      to configure completion gates.
                    </p>
                  ) : (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Type</th>
                            <th>Question Prompt</th>
                            <th>Options</th>
                            <th>Required Gate</th>
                            <th>Active</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeQuestions.map((q) => (
                            <tr key={q.id}>
                              <td><code>Q{q.order}</code></td>
                              <td>
                                <span
                                  className={`badge ${q.question_type === "YES_NO" ? "badge-info" : "badge-primary"}`}
                                >
                                  {q.question_type === "YES_NO" ? "Yes/No (2)" : "MCQ (Single)"}
                                </span>
                              </td>
                              <td><strong>{q.question_text}</strong></td>
                              <td>
                                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                  {Array.isArray(q.options) ? `${q.options.length} options` : "No options"}
                                </span>
                              </td>
                              <td>
                                <span className="badge badge-purple">Mandatory Gate</span>
                              </td>
                              <td>
                                {q.is_active ? (
                                  <span className="badge badge-success">Active</span>
                                ) : (
                                  <span className="badge badge-warning">Inactive</span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => onOpenEditQuestionModal(q)}
                                    style={{ padding: "2px 6px", fontSize: "11px" }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => onDeleteQuestion(q)}
                                    style={{ padding: "2px 6px", fontSize: "11px", color: "var(--status-error)" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ------------------------------------------------------------------- */
        /* Modules List Table                                                  */
        /* ------------------------------------------------------------------- */
        <div>
          {/* Course Levels Display: Matching Learner Portal Level Cards Grid */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>
                  Course Levels ({activeCourseLevels.length})
                </h4>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Click a level card to filter modules, or create additional levels as needed.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenCreateLevelModal && onOpenCreateLevelModal(selectedCourse?.id)}
                style={{ padding: "6px 14px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <span>+ Create Level</span>
              </button>
            </div>

            {/* Level Cards Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "14px",
                marginBottom: "16px",
              }}
            >
              {/* All Modules Pill Card */}
              <div
                className="card"
                onClick={() => {
                  setSelectedLevelFilter("ALL");
                  setLevelCardSelection(null);
                }}
                role="button"
                tabIndex={0}
                style={{
                  padding: "16px 18px",
                  cursor: "pointer",
                  borderRadius: "8px",
                  border: selectedLevelFilter === "ALL" ? "2px solid var(--accent-primary, #6366f1)" : "1px solid var(--border-color)",
                  backgroundColor: selectedLevelFilter === "ALL" ? "var(--bg-active, rgba(99, 102, 241, 0.06))" : "#ffffff",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span className="badge badge-info" style={{ fontSize: "10px" }}>All Curriculum</span>
                  <span className="badge badge-purple" style={{ fontSize: "11px" }}>{courseModules.length} Modules</span>
                </div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>
                  All Course Modules
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Complete module listing across all curriculum tiers
                </div>
              </div>

              {activeCourseLevels.map((lvl) => {
                const assignedCount = courseModules.filter((m) => m.level === lvl.id).length;
                const isSelected = selectedLevelFilter === String(lvl.id);

                return (
                  <div
                    key={lvl.id}
                    className="card"
                    onClick={() => {
                      setSelectedLevelFilter(String(lvl.id));
                      setLevelCardSelection(lvl);
                    }}
                    role="button"
                    tabIndex={0}
                    style={{
                      padding: "16px 18px",
                      cursor: "pointer",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid var(--accent-primary, #6366f1)" : "1px solid var(--border-color)",
                      backgroundColor: isSelected ? "var(--bg-active, rgba(99, 102, 241, 0.06))" : "#ffffff",
                      transition: "all 0.15s ease",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className={`badge ${assignedCount > 0 ? "badge-success" : "badge-secondary"}`} style={{ fontSize: "11px" }}>
                            {assignedCount} {assignedCount === 1 ? "Module" : "Modules"}
                          </span>
                          {assignedCount === 0 && onDeleteLevel && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteLevel(lvl);
                              }}
                              title={`Delete empty level "${lvl.name}"`}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--status-error, #ef4444)",
                                fontSize: "14px",
                                padding: "0 2px",
                              }}
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                        {lvl.name}
                      </div>
                    </div>

                    <div style={{ marginTop: "12px", paddingTop: "8px", borderTop: "1px solid var(--border-color, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                      <span style={{ color: "var(--text-muted)" }}>{assignedCount} {assignedCount === 1 ? "Module" : "Modules"} Assigned</span>
                      <span style={{ color: "var(--accent-secondary, #2563eb)", fontWeight: "600" }}>
                        {isSelected ? "Active Filter \u2713" : "View Modules \u2192"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Unassigned Modules Card */}
              {courseModules.some((m) => !m.level) && (
                <div
                  className="card"
                  onClick={() => {
                    setSelectedLevelFilter("UNASSIGNED");
                    setLevelCardSelection(null);
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    padding: "16px 18px",
                    cursor: "pointer",
                    borderRadius: "8px",
                    border: selectedLevelFilter === "UNASSIGNED" ? "2px solid var(--accent-primary, #6366f1)" : "1px dashed var(--border-color)",
                    backgroundColor: selectedLevelFilter === "UNASSIGNED" ? "var(--bg-active, rgba(99, 102, 241, 0.06))" : "#ffffff",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span className="badge badge-warning" style={{ fontSize: "10px" }}>Needs Assignment</span>
                    <span className="badge badge-secondary" style={{ fontSize: "11px" }}>
                      {courseModules.filter((m) => !m.level).length} Unassigned
                    </span>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)" }}>
                    Unassigned Modules
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Modules waiting to be assigned to Level 1, Level 2, or Level 3
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search modules by name or code..."
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                style={{ width: "240px", padding: "8px 12px", fontSize: "13px" }}
              />

              <select
                className="form-input"
                value={moduleStatusFilter}
                onChange={(e) => setModuleStatusFilter(e.target.value)}
                style={{ width: "150px", padding: "8px 12px", fontSize: "13px" }}
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                Showing <strong>{filteredModules.length}</strong> of <strong>{courseModules.length}</strong> modules
              </div>
              {selectedCourse && onOpenPreviewCourseModal && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onOpenPreviewCourseModal(selectedCourse)}
                  style={{ padding: "6px 12px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  title="Preview Course"
                >
                  <span>👁️ Preview Course</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onOpenCreateModuleModal(selectedCourse?.id)}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                + Create Module
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">
              <span>Learning Modules</span>
              <span className="badge badge-purple">{filteredModules.length} Records</span>
            </h3>

            {filteredModules.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                No modules match the current criteria. Click &quot;+ Create Module&quot; above to add a module.
              </p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Module Name</th>
                      <th>Level</th>
                      <th>Duration</th>
                      <th>Order</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModules.map((m) => {
                      const targetCourseId = selectedCourse?.id || m.course || null;
                      const viewerUrl = targetCourseId
                        ? `/learner/module-viewer?courseId=${targetCourseId}&moduleId=${m.id}`
                        : `/learner/module-viewer?moduleId=${m.id}`;
                      const readerUrl = targetCourseId
                        ? `/learner/reader?courseId=${targetCourseId}&moduleId=${m.id}`
                        : `/learner/reader?moduleId=${m.id}`;

                      return (
                      <tr key={m.id}>
                        <td><code>#{m.id}</code></td>
                        <td>
                          <strong
                            style={{ cursor: "pointer", color: "var(--accent-primary, #6366f1)" }}
                            onClick={() => window.open(viewerUrl, "_blank")}
                            title="Open module in new browser tab"
                          >
                            {m.name}
                          </strong>
                        </td>
                        <td>
                          <select
                            value={m.level || ""}
                            onChange={(e) => onAssignModuleLevel && onAssignModuleLevel(m.id, e.target.value)}
                            style={{
                              fontSize: "12px",
                              padding: "3px 6px",
                              borderRadius: "4px",
                              border: "1px solid var(--border-color)",
                              backgroundColor: m.level ? "var(--bg-active, #eff6ff)" : "#fff",
                              color: m.level ? "var(--accent-secondary, #2563eb)" : "var(--text-secondary)",
                              fontWeight: m.level ? "600" : "normal",
                            }}
                            title="Assign or reassign module level"
                          >
                            <option value="">Unassigned</option>
                            {activeCourseLevels.map((lvl) => (
                              <option key={lvl.id} value={lvl.id}>
                                {lvl.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{m.estimated_duration_minutes ? `${m.estimated_duration_minutes} min` : "—"}</td>
                        <td>{m.order}</td>
                        <td>{getStatusBadge(m.status)}</td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => window.open(viewerUrl, "_blank")}
                              style={{ padding: "4px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                              title="Open module learning content in a new browser tab"
                            >
                              &#x2197; Open in Tab
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => onOpenModuleContent(m)}
                              style={{ padding: "4px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                              title="Manage Submodules, Lessons, and Attached Materials"
                            >
                              Manage Content &rarr;
                            </button>
                            <ActionMenu
                              actions={[
                                {
                                  label: "Open in New Tab",
                                  icon: "↗",
                                  onClick: () => window.open(readerUrl, "_blank"),
                                  title: "Launch interactive module reader in a new browser tab",
                                },
                                {
                                  label: "Manage Content",
                                  icon: "📂",
                                  onClick: () => onOpenModuleContent(m),
                                  title: "Open module lessons, attached materials, and questions",
                                },
                                {
                                  label: "Edit Module",
                                  icon: "✎",
                                  onClick: () => onOpenEditModuleModal(m),
                                  title: "Edit module name, code, duration, or order",
                                },
                                onDuplicateModule && {
                                  label: "Duplicate Module",
                                  icon: "⧉",
                                  onClick: () => onDuplicateModule(m),
                                  title: "Create a copy of this module in the current course",
                                },
                                m.status === "DRAFT"
                                  ? {
                                      label: "Delete Module",
                                      icon: "🗑",
                                      danger: true,
                                      onClick: () => onDeleteModule(m),
                                      title: "Delete this draft module",
                                    }
                                  : {
                                      label: "Delete Locked (Published)",
                                      icon: "🔒",
                                      disabled: true,
                                      title: "Only draft modules can be deleted",
                                    },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                    })}
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

