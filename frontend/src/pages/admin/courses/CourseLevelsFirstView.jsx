import { useState } from "react";
import ActionMenu from "../../../components/common/ActionMenu";

/**
 * CourseLevelsFirstView Component
 *
 * Implements Level-First Navigation for Admin Portal -> Courses:
 * Navigation Hierarchy: Courses -> Levels -> Course Name -> Modules -> Learning Content
 *
 * Screen 1: Level Cards Grid (Level 1, Level 2, Level 3, + Create Level) + Global Actions
 * Screen 2: Courses assigned to the selected Level (Course Card / Details)
 * Screen 3: Modules assigned to that Course and Level with full Admin management controls
 *           and one-click "Open in New Tab" to view sequential learning content.
 */
export default function CourseLevelsFirstView({
  courses = [],
  courseLevels = [],
  modules = [],
  clusters = [],
  mappings = [],
  onOpenGlobalRepository,
  onOpenCreateCourseModal,
  onOpenCreateLevelModal,
  onOpenEditLevelModal,
  onDeleteLevel,
  onAssignModuleLevel,
  onOpenCreateModuleModal,
  onOpenInsertModuleModal,
  onOpenUploadModuleModal,
  onReorderModules,
  onOpenEditModuleModal,
  onDeleteModule,
  onDuplicateModule,
  onOpenModuleContent,
  onOpenPreviewCourseModal,
  onSelectCourse,
  getStatusBadge,
}) {
  // Navigation drill-down state inside Level-First view:
  // selectedLevel: CourseLevel object | null
  // selectedCourseInLevel: Course object | null
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedCourseInLevel, setSelectedCourseInLevel] = useState(null);
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleStatusFilter, setModuleStatusFilter] = useState("ALL");

  // Sorted levels list
  const sortedLevels = [...courseLevels].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Handler to open module in a new tab across Admin, Trainer, and Learner
  const handleOpenModuleInNewTab = (courseId, moduleId) => {
    const query = courseId
      ? `?courseId=${courseId}&moduleId=${moduleId}`
      : `?moduleId=${moduleId}`;
    window.open(`/learner/module-viewer${query}`, "_blank");
  };

  // ---------------------------------------------------------------------------
  // SCREEN 2: MODULES INSIDE SELECTED LEVEL (LEVEL-FIRST DIRECT ACCESS)
  // ---------------------------------------------------------------------------
  if (selectedLevel) {
    const effectiveCourse =
      selectedCourseInLevel ||
      (selectedLevel.course ? courses.find((c) => c.id === selectedLevel.course) : null) ||
      null;

    const levelModules = modules
      .filter((m) => m.level === selectedLevel.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const filteredModules = levelModules.filter((m) => {
      const matchesSearch =
        !moduleSearch.trim() ||
        m.name.toLowerCase().includes(moduleSearch.toLowerCase());
      const matchesStatus =
        moduleStatusFilter === "ALL" || m.status === moduleStatusFilter;
      return matchesSearch && matchesStatus;
    });

    return (
      <div>
        {/* Breadcrumb Navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelectedCourseInLevel(null);
                setSelectedLevel(null);
              }}
              style={{ padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span>&larr; Back to All Levels</span>
            </button>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {onOpenEditLevelModal && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenEditLevelModal(selectedLevel)}
                title="Edit level name, description, and sequence order"
                style={{ padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                ✎ Edit Level
              </button>
            )}
            {onDeleteLevel && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onDeleteLevel(selectedLevel)}
                title="Permanently delete this level and all associated modules, questions, attempts, responses, and records"
                style={{ padding: "6px 12px", fontSize: "12px", color: "var(--status-error, #ef4444)", borderColor: "var(--status-error, #ef4444)" }}
              >
                🗑 Delete Level
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (onOpenInsertModuleModal) {
                  onOpenInsertModuleModal({ course: effectiveCourse, level: selectedLevel, levelModules });
                } else if (onOpenCreateModuleModal) {
                  onOpenCreateModuleModal(effectiveCourse?.id);
                }
              }}
              style={{ padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
              title="Insert a module at any position in this level"
            >
              + Insert Module
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
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
              placeholder="Search modules in this level..."
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

          <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Showing <strong>{filteredModules.length}</strong> of <strong>{levelModules.length}</strong> modules in {selectedLevel.name}
          </div>
        </div>

        {/* Modules Table */}
        <div className="card">
          <h3 className="card-title">
            <span>{selectedLevel.name} Modules</span>
            <span className="badge badge-purple">{filteredModules.length} Modules</span>
          </h3>

          {filteredModules.length === 0 ? (
            <div style={{ textAlign: "center", padding: "36px 16px" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "0 0 12px 0" }}>
                {levelModules.length === 0
                  ? `No modules are currently assigned to ${selectedLevel.name} in this course.`
                  : "No modules match the current filter criteria."}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  onOpenCreateModuleModal &&
                  onOpenCreateModuleModal(effectiveCourse?.id || null, selectedLevel.id)
                }
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                + Create Module in {selectedLevel.name}
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: "60px" }}>S.No.</th>
                    <th>Module Name</th>
                    <th>Level Assignment</th>
                    <th>Duration</th>
                    <th style={{ width: "110px", textAlign: "center" }}>Order & Reorder</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModules.map((m, idx) => {
                    const canMoveUp = idx > 0;
                    const canMoveDown = idx < filteredModules.length - 1;

                    const handleMove = (direction) => {
                      if (!onReorderModules) return;
                      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
                      if (targetIdx < 0 || targetIdx >= filteredModules.length) return;
                      const newOrderedList = [...filteredModules];
                      const [moved] = newOrderedList.splice(idx, 1);
                      newOrderedList.splice(targetIdx, 0, moved);
                      const moduleIds = newOrderedList.map((mod) => mod.id);
                      onReorderModules(selectedLevel.id, moduleIds);
                    };

                    return (
                      <tr key={m.id}>
                        <td>{idx + 1}</td>
                        <td>
                          <strong
                            style={{ cursor: "pointer", color: "var(--accent-primary, #6366f1)" }}
                            onClick={() => handleOpenModuleInNewTab(effectiveCourse?.id || m.course, m.id)}
                            title="Open learning content in new browser tab"
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
                            {sortedLevels.map((lvl) => (
                              <option key={lvl.id} value={lvl.id}>
                                {lvl.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{m.estimated_duration_minutes ? `${m.estimated_duration_minutes} min` : "—"}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleMove("up")}
                              disabled={!canMoveUp}
                              style={{
                                padding: "2px 6px",
                                fontSize: "11px",
                                lineHeight: "1",
                                opacity: canMoveUp ? 1 : 0.35,
                                cursor: canMoveUp ? "pointer" : "default",
                              }}
                              title={canMoveUp ? "Move module up" : "Already at top"}
                            >
                              &uarr;
                            </button>
                            <span style={{ fontWeight: "600", fontSize: "12px", minWidth: "22px", textAlign: "center" }}>
                              {m.order}
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleMove("down")}
                              disabled={!canMoveDown}
                              style={{
                                padding: "2px 6px",
                                fontSize: "11px",
                                lineHeight: "1",
                                opacity: canMoveDown ? 1 : 0.35,
                                cursor: canMoveDown ? "pointer" : "default",
                              }}
                              title={canMoveDown ? "Move module down" : "Already at bottom"}
                            >
                              &darr;
                            </button>
                          </div>
                        </td>
                        <td>{getStatusBadge(m.status)}</td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleOpenModuleInNewTab(effectiveCourse?.id || m.course, m.id)}
                              style={{ padding: "4px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                              title="Open module learning content in a new browser tab"
                            >
                              &#x2197; Open in Tab
                            </button>
                            <ActionMenu
                              actions={[
                                {
                                  label: "Upload Content",
                                  icon: "📤",
                                  onClick: () => onOpenUploadModuleModal && onOpenUploadModuleModal(m),
                                  title: "Upload file directly into this module",
                                },
                                {
                                  label: "Open in New Tab",
                                  icon: "↗",
                                  onClick: () => handleOpenModuleInNewTab(effectiveCourse?.id || m.course, m.id),
                                  title: "Launch interactive module reader in a new browser tab",
                                },
                                {
                                  label: "Manage Content",
                                  icon: "📂",
                                  onClick: () => {
                                    const modCourse =
                                      (m.course ? courses.find((c) => c.id === m.course) : null) ||
                                      effectiveCourse;
                                    if (modCourse) onSelectCourse(modCourse);
                                    if (onOpenModuleContent) onOpenModuleContent(m);
                                  },
                                  title: "Open module lessons, attached materials, and questions",
                                },
                                {
                                  label: "Edit Module",
                                  icon: "✎",
                                  onClick: () => onOpenEditModuleModal(m),
                                  title: "Edit module details and settings",
                                },
                                onDuplicateModule && {
                                  label: "Duplicate Module",
                                  icon: "⧉",
                                  onClick: () => onDuplicateModule(m),
                                  title: "Duplicate module structure",
                                },
                                {
                                  label: "Permanently Delete Module",
                                  icon: "🗑",
                                  danger: true,
                                  onClick: () => onDeleteModule(m),
                                  title: "Permanently delete module and all related questions, attempts, responses, progress, feedback and orphaned files",
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
    );
  }

  // ---------------------------------------------------------------------------
  // SCREEN 1: LEVEL CARDS FIRST VIEW (DEFAULT)
  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* Top Header & Repository / Ingestion Button */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 4px 0", color: "var(--text-main)" }}>
            Curriculum Levels &amp; Course Navigation
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
            Select a learning level to view and manage its modules, or manage repository materials.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {onOpenGlobalRepository && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenGlobalRepository}
              style={{
                padding: "7px 14px",
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: "600",
              }}
              title="Access universal training files repository, batch folder uploads, and single file uploads"
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Materials Repository &amp; Ingestion</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onOpenCreateLevelModal && onOpenCreateLevelModal()}
            style={{ padding: "7px 14px", fontSize: "13px", fontWeight: "600" }}
          >
            + Create Level
          </button>
        </div>
      </div>

      {/* Levels Grid (Level 1, Level 2, Level 3, etc.) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "20px",
          marginBottom: "24px",
        }}
      >
        {sortedLevels.map((lvl) => {
          const assignedMods = modules.filter((m) => m.level === lvl.id);
          const targetCourse =
            (lvl.course ? courses.find((c) => c.id === lvl.course) : null) ||
            courses.find((c) => assignedMods.some((m) => m.course === c.id)) ||
            null;

          const handleOpenLevelModules = () => {
            setSelectedLevel(lvl);
            setSelectedCourseInLevel(targetCourse || null);
          };

          return (
            <div
              key={lvl.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "24px 20px",
                cursor: "pointer",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onClick={handleOpenLevelModules}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenLevelModules();
                }
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "14px" }}>
                  <span
                    className={`badge ${assignedMods.length > 0 ? "badge-success" : "badge-secondary"}`}
                    style={{ fontSize: "11px" }}
                  >
                    {assignedMods.length} {assignedMods.length === 1 ? "Module" : "Modules"}
                  </span>
                </div>

                <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                  {lvl.name}
                </h3>
              </div>

              <div
                style={{
                  marginTop: "20px",
                  paddingTop: "14px",
                  borderTop: "1px solid var(--border-color)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                <span>
                  {assignedMods.length > 0 ? `${assignedMods.length} Modules` : "0 Modules (Empty)"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {onOpenEditLevelModal && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEditLevelModal(lvl);
                      }}
                      title="Edit level details"
                      style={{ padding: "3px 8px", fontSize: "11px", lineHeight: "1" }}
                    >
                      ✎ Edit
                    </button>
                  )}
                  <span style={{ color: "var(--accent-secondary)", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                    View Modules &rarr;
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

