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
  onDeleteLevel,
  onAssignModuleLevel,
  onOpenCreateModuleModal,
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
    window.open(`/learner/module-viewer?courseId=${courseId}&moduleId=${moduleId}`, "_blank");
  };

  // ---------------------------------------------------------------------------
  // SCREEN 3: MODULES INSIDE COURSE & LEVEL
  // ---------------------------------------------------------------------------
  if (selectedLevel && selectedCourseInLevel) {
    const levelModules = modules
      .filter((m) => m.course === selectedCourseInLevel.id && m.level === selectedLevel.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const filteredModules = levelModules.filter((m) => {
      const matchesSearch =
        !moduleSearch.trim() ||
        m.name.toLowerCase().includes(moduleSearch.toLowerCase()) ||
        m.code.toLowerCase().includes(moduleSearch.toLowerCase());
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="badge badge-purple" style={{ fontFamily: "var(--font-mono)" }}>
                Tier #{selectedLevel.order}: {selectedLevel.name}
              </span>
              <span style={{ color: "var(--text-muted)" }}>&rsaquo;</span>
              <strong style={{ fontSize: "16px", color: "var(--text-main)" }}>
                {selectedCourseInLevel.name}
              </strong>
              <span className="badge badge-info">{selectedCourseInLevel.code}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onSelectCourse(selectedCourseInLevel)}
              style={{ padding: "6px 12px", fontSize: "12px" }}
              title="Open full course workspace (Curriculum, Materials, Repository)"
            >
              Manage Full Course &rarr;
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenCreateModuleModal && onOpenCreateModuleModal(selectedCourseInLevel.id)}
              style={{ padding: "6px 12px", fontSize: "12px" }}
            >
              + Create Module
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
            <span>{selectedLevel.name} Modules &bull; {selectedCourseInLevel.name}</span>
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
                onClick={() => onOpenCreateModuleModal && onOpenCreateModuleModal(selectedCourseInLevel.id)}
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
                    <th>ID</th>
                    <th>Module Name</th>
                    <th>Code</th>
                    <th>Level Assignment</th>
                    <th>Duration</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModules.map((m) => (
                    <tr key={m.id}>
                      <td><code>#{m.id}</code></td>
                      <td>
                        <strong
                          style={{ cursor: "pointer", color: "var(--accent-primary, #6366f1)" }}
                          onClick={() => handleOpenModuleInNewTab(selectedCourseInLevel.id, m.id)}
                          title="Open learning content in new browser tab"
                        >
                          {m.name}
                        </strong>
                      </td>
                      <td><code>{m.code}</code></td>
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
                      <td>{m.order}</td>
                      <td>{getStatusBadge(m.status)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleOpenModuleInNewTab(selectedCourseInLevel.id, m.id)}
                            style={{ padding: "4px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                            title="Open module learning content in a new browser tab"
                          >
                            &#x2197; Open in Tab
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              onSelectCourse(selectedCourseInLevel);
                              if (onOpenModuleContent) onOpenModuleContent(m);
                            }}
                            style={{ padding: "4px 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                            title="Manage lessons, materials, and assessment gates"
                          >
                            Manage Content &rarr;
                          </button>
                          <ActionMenu
                            actions={[
                              {
                                label: "Open in New Tab",
                                icon: "↗",
                                onClick: () => handleOpenModuleInNewTab(selectedCourseInLevel.id, m.id),
                                title: "Launch interactive module reader in a new browser tab",
                              },
                              {
                                label: "Manage Content",
                                icon: "📂",
                                onClick: () => {
                                  onSelectCourse(selectedCourseInLevel);
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // SCREEN 2: COURSES INSIDE SELECTED LEVEL
  // ---------------------------------------------------------------------------
  if (selectedLevel) {
    // Find courses that have modules in this level (or all courses if level belongs to course)
    const levelModules = modules.filter((m) => m.level === selectedLevel.id);
    const assignedCourseIds = new Set(levelModules.map((m) => m.course));
    if (selectedLevel.course) {
      assignedCourseIds.add(selectedLevel.course);
    }
    const levelCourses = courses.filter((c) => assignedCourseIds.has(c.id));

    return (
      <div>
        {/* Navigation Breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSelectedLevel(null)}
              style={{ padding: "6px 14px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span>&larr; Back to All Levels</span>
            </button>
            <div>
              <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-secondary)" }}>
                Curriculum Level &bull; Tier #{selectedLevel.order}
              </div>
              <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                {selectedLevel.name} Courses
              </h2>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span className="badge badge-purple" style={{ fontSize: "12px" }}>
              {levelModules.length} {levelModules.length === 1 ? "Module" : "Modules"} Total
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onDeleteLevel && onDeleteLevel(selectedLevel)}
              disabled={levelModules.length > 0}
              title={levelModules.length > 0 ? "Cannot delete level with assigned modules" : "Delete empty level"}
              style={{ padding: "6px 12px", fontSize: "12px", color: levelModules.length === 0 ? "var(--status-error)" : "var(--text-muted)" }}
            >
              Delete Level
            </button>
          </div>
        </div>

        {/* Course Cards inside this Level */}
        {levelCourses.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px", border: "1px dashed var(--border-color)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "6px" }}>
              No Courses Configured for {selectedLevel.name}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 16px 0" }}>
              {selectedLevel.name} currently contains 0 modules. You can assign existing modules or create new courses.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (courses.length > 0) {
                    setSelectedCourseInLevel(courses[0]);
                  } else {
                    onOpenCreateCourseModal();
                  }
                }}
                style={{ padding: "8px 16px", fontSize: "13px" }}
              >
                {courses.length > 0 ? `Assign Modules from ${courses[0].name}` : "+ Create New Course"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "20px" }}>
            {levelCourses.map((c) => {
              const courseLevelMods = levelModules.filter((m) => m.course === c.id);
              const courseMappings = mappings.filter((mp) => courseLevelMods.some((m) => m.id === mp.module));

              return (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "24px 20px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span className="badge badge-info" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                        {c.code}
                      </span>
                      {getStatusBadge(c.status)}
                    </div>

                    <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: "0 0 8px 0" }}>
                      {c.name}
                    </h3>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>
                      {c.description || "Comprehensive professional training curriculum."}
                    </p>

                    <div style={{ marginTop: "14px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <span className="badge badge-purple" style={{ fontSize: "11px" }}>
                        {courseLevelMods.length} {courseLevelMods.length === 1 ? "Module" : "Modules"} in {selectedLevel.name}
                      </span>
                      <span className="badge badge-secondary" style={{ fontSize: "11px" }}>
                        {courseMappings.length} Materials Attached
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "20px",
                      paddingTop: "14px",
                      borderTop: "1px solid var(--border-color)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onSelectCourse(c)}
                      style={{ padding: "5px 12px", fontSize: "12px" }}
                      title="Manage course in full workspace"
                    >
                      Workspace &rarr;
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setSelectedCourseInLevel(c)}
                      style={{ padding: "6px 14px", fontSize: "13px", fontWeight: "600" }}
                      title={`View ${courseLevelMods.length} modules assigned to ${selectedLevel.name}`}
                    >
                      View Modules ({courseLevelMods.length}) &rarr;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
            Select a learning level to view assigned courses and modules, or manage repository materials.
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
            className="btn btn-secondary"
            onClick={() => onOpenCreateLevelModal && onOpenCreateLevelModal(courses[0]?.id)}
            style={{ padding: "7px 14px", fontSize: "13px", fontWeight: "600" }}
          >
            + Create Level
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenCreateCourseModal}
            style={{ padding: "7px 14px", fontSize: "13px" }}
          >
            + Create Course
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
          const assignedCoursesCount = new Set(assignedMods.map((m) => m.course)).size || (lvl.course ? 1 : 0);
          const targetCourse =
            courses.find((c) => assignedMods.some((m) => m.course === c.id)) ||
            courses.find((c) => c.id === lvl.course) ||
            courses[0] ||
            null;

          const handleOpenLevelModules = () => {
            setSelectedLevel(lvl);
            if (targetCourse) {
              setSelectedCourseInLevel(targetCourse);
            }
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <span className="badge badge-purple" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                    Tier #{lvl.order}
                  </span>
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
                  {assignedMods.length > 0 ? `${assignedMods.length} Modules \u2022 ${assignedCoursesCount} Course` : "0 Modules (Empty)"}
                </span>
                <span style={{ color: "var(--accent-secondary)", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                  View Courses &rarr;
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

