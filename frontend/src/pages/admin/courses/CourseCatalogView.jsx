import ActionMenu from "../../../components/common/ActionMenu";

export default function CourseCatalogView({
  courses = [],
  modules = [],
  clusters = [],
  mappings = [],
  courseSearch,
  setCourseSearch,
  courseStatusFilter,
  setCourseStatusFilter,
  onSelectCourse,
  onOpenGlobalRepository,
  onOpenCreateCourseModal,
  onOpenEditCourseModal,
  onOpenPreviewCourseModal,
  onOpenPublishCourseModal,
  onDeleteCourse,
  onDuplicateCourse,
  getStatusBadge,
}) {
  const filteredCourses = courses.filter((c) => {
    const matchesSearch =
      !courseSearch.trim() ||
      c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
      c.code.toLowerCase().includes(courseSearch.toLowerCase());
    const matchesStatus =
      courseStatusFilter === "ALL" || c.status === courseStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
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
            placeholder="Search courses by name or code..."
            value={courseSearch}
            onChange={(e) => setCourseSearch(e.target.value)}
            style={{ width: "240px", padding: "8px 12px", fontSize: "13px" }}
          />

          <select
            className="form-input"
            value={courseStatusFilter}
            onChange={(e) => setCourseStatusFilter(e.target.value)}
            style={{ width: "150px", padding: "8px 12px", fontSize: "13px" }}
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Showing <strong>{filteredCourses.length}</strong> of <strong>{courses.length}</strong> courses
          </div>
          {onOpenGlobalRepository && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenGlobalRepository}
              style={{
                padding: "6px 14px",
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
            onClick={onOpenCreateCourseModal}
            style={{ padding: "6px 14px", fontSize: "13px" }}
          >
            + Create Course
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">
          <span>Course Catalog</span>
          <span className="badge badge-purple">{filteredCourses.length} Records</span>
        </h3>

        {filteredCourses.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
            {courses.length === 0
              ? 'No courses found in curriculum. Click "+ Create Course" above to add the first course.'
              : "No courses match the current search or filter criteria."}
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No.</th>
                  <th>Course Name</th>
                  <th>Code</th>
                  <th>Modules</th>
                  <th>Attached Materials</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((c, index) => {
                  const courseModules = modules.filter((m) => m.course === c.id);
                  const moduleIds = courseModules.map((m) => m.id);
                  const courseClusterIds = clusters.filter((cl) => cl.course === c.id).map((cl) => cl.id);
                  const courseMappings = mappings.filter((mp) =>
                    moduleIds.includes(mp.module) || courseClusterIds.includes(mp.cluster)
                  );

                  return (
                    <tr key={c.id}>
                      <td>{index + 1}</td>
                      <td>
                        <strong
                          style={{ cursor: "pointer", color: "var(--accent-primary, #6366f1)" }}
                          onClick={() => onSelectCourse(c)}
                          title="Open course workspace"
                        >
                          {c.name}
                        </strong>
                      </td>
                      <td><code>{c.code}</code></td>
                      <td>
                        <span className="badge badge-info">
                          {courseModules.length} {courseModules.length === 1 ? "Module" : "Modules"}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-secondary">
                          {courseMappings.length} Materials
                        </span>
                      </td>
                      <td>{getStatusBadge(c.status)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => onSelectCourse(c)}
                            style={{ padding: "5px 12px", fontSize: "12px", whiteSpace: "nowrap" }}
                            title="Manage curriculum, lessons, and training materials"
                          >
                            Manage Course &rarr;
                          </button>
                          <ActionMenu
                            actions={[
                              {
                                label: "Preview Course",
                                icon: "👁",
                                onClick: () => onOpenPreviewCourseModal(c),
                                title: "Preview course curriculum, lessons, and training documents in read-only mode",
                              },
                              {
                                label: "Edit Course",
                                icon: "✎",
                                onClick: () => onOpenEditCourseModal(c),
                                title: "Edit course details and settings",
                              },
                              onDuplicateCourse && {
                                label: "Duplicate Course",
                                icon: "⧉",
                                onClick: () => onDuplicateCourse(c),
                                title: "Create a draft copy of this course with curriculum structure",
                              },
                              onOpenPublishCourseModal && c.status !== "ARCHIVED" && {
                                label: c.status === "PUBLISHED" ? "Publish Content" : "Publish Course",
                                icon: "✓",
                                onClick: () => onOpenPublishCourseModal(c),
                                title: c.status === "PUBLISHED" ? "Publish remaining draft modules and submodules" : "Publish course and all draft content",
                              },
                              c.status !== "ARCHIVED" && {
                                label: "Delete Course",
                                icon: "🗑",
                                danger: true,
                                onClick: () => onDeleteCourse(c),
                                title: "Delete this course and its associated contents",
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

