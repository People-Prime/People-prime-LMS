# People Prime LMS — Phase 6.2: Learner Course Content & Learning Material Reader Audit Report

**Date:** November 2, 2026  
**Project:** People Prime Learning Management System (LMS)  
**Workspace:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Database:** PostgreSQL (`lms_local` on `localhost:5432`)  
**Scope:** Phase 6.2 — Inspection and Implementation Plan for Learner Course Content & Learning Material Reader  
**Status:** Complete (Strictly Read-Only Audit — No application code, database records, or schema modified)

---

## 1. Executive Summary

In Phase 6.1, the Learner Portal was equipped with the **"My Courses"** tab (`LearnerCoursesTab.jsx`), displaying assigned courses returned by `GET /api/courses/` or an empty state when no courses are assigned.

This audit prepares **Phase 6.2**, which aims to allow an authenticated learner to:
1. Open an assigned course to view its modules.
2. Navigate module submodules and learning materials.
3. Read supported text learning materials.
4. Download authorized binary learning material files (images, videos, spreadsheets, presentations) via the protected download endpoint.

### Primary Audit Verdict
- **Backend Readiness:** The backend already provides fully scoped, secured, and tested REST endpoints (`/api/modules/`, `/api/submodules/`, `/api/materials/`, and `/api/materials/{id}/download/`). Learners can only access content with `status='PUBLISHED'` associated with active training assignments.
- **Frontend Architecture:** The frontend currently lacks a detail/reader view for learners. However, existing patterns from `AdminCurriculumTab.jsx` (such as accordion hierarchies, badge styling, and state management) can be cleanly adapted into a focused, read-only `LearnerCourseDetailModal` or embedded `LearnerCourseReader` view without breaking sidebar navigation or the Admin Portal.
- **Download Security:** Verified that direct media URL downloads are blocked at the Django routing level (`MEDIA_URL` static serving is omitted from `config/urls.py`), ensuring that all file downloads are forced through `/api/materials/{id}/download/`.

---

## 2. Working State & Git Status Check

- Command executed: `git status --short`
- **Result:** Working directory is not managed as a git repository (`fatal: not a git repository`).
- **Files Verified from Phase 6.1:**
  - `frontend/src/pages/learner/LearnerCoursesTab.jsx`: Renders course card grid and empty state.
  - `frontend/src/pages/LearnerPortal.jsx`: Houses tab switching between `"overview"` and `"mycourses"`.
  - `frontend/src/components/DashboardLayout.jsx`: Houses sidebar navigation item `"mycourses"` (Assigned Modules).
- **Integrity Confirmation:** All Phase 6.1 and earlier changes remain intact. No files were overwritten or reverted.

---

## 3. Frontend Architecture Inspection

### A. Navigation & Portal Hierarchy
1. **Routing in `App.jsx`:**
   - Mounts `/learner/*` wrapped by `<RouteGuard allowedRoles={["LEARNER"]}>` which renders `<LearnerPortal />`.
2. **Tab Management in `LearnerPortal.jsx`:**
   - Controls `activeTab` (`"overview"` vs `"mycourses"`).
   - Currently, clicking a course card does not open a course because `LearnerCoursesTab.jsx` renders static non-clickable cards.
3. **Seamless Navigation Strategy for Phase 6.2:**
   - To avoid modifying `DashboardLayout.jsx` or breaking browser back/forward flows, the course reader can be implemented using internal state in `LearnerPortal.jsx` or `LearnerCoursesTab.jsx`:
     - **Selected Course State:** `selectedCourse` (e.g., `null` $\rightarrow$ shows course grid; `courseObject` $\rightarrow$ displays `LearnerCourseDetail` reader view with a clear `← Back to My Courses` breadcrumb/button).
     - This preserves the sidebar structure and does not collide with other tabs.

### B. Existing Reusable Curriculum Patterns (from `AdminCurriculumTab.jsx`)
`AdminCurriculumTab.jsx` contains battle-tested UX patterns that can be reused:
- **Hierarchical tree structure:** Course $\rightarrow$ Modules accordion $\rightarrow$ Submodules list $\rightarrow$ Materials list.
- **Material Type Badges:** Color-coded badges for `TEXT` (purple), `IMAGE` (teal), `VIDEO` (cyan), `EXCEL` (green), and `POWERPOINT` (orange).
- **Text Content Modal / Reader:** Renders sanitized text content formatted with line breaks within a styled card.
- **Download Action Button:** Triggers download of binary files via the session-authenticated client.

---

## 4. Backend API Contracts & Response Shapes

Inspection of `backend/core/serializers.py` and `backend/core/api_views.py` confirmed the exact API contracts:

### A. Endpoints & Serialization

| Endpoint | ViewSet | Serializer & Key Output Fields | Scoping Logic for `LEARNER` |
| :--- | :--- | :--- | :--- |
| **`GET /api/courses/`** | `CourseViewSet` | `id`, `name`, `code`, `description`, `order`, `status`, `program`, `program_name` | `_scope_course_qs`: `PUBLISHED` only, matching active `TrainingAssignment` (directly or via program). |
| **`GET /api/modules/`** | `ModuleViewSet` | `id`, `course`, `course_name`, `name`, `code`, `description`, `order`, `estimated_duration_minutes`, `status` | `_scope_module_qs`: `PUBLISHED` only, belonging to accessible courses. |
| **`GET /api/submodules/`** | `SubmoduleViewSet` | `id`, `module`, `module_name`, `name`, `description`, `order`, `status` | `_scope_submodule_qs`: `PUBLISHED` only, belonging to accessible modules. |
| **`GET /api/materials/`** | `LearningMaterialViewSet` | `id`, `module`, `module_name`, `submodule`, `submodule_name`, `title`, `description`, `material_type`, `text_content`, `file`, `order`, `status` | `_scope_material_qs`: `PUBLISHED` only, belonging to accessible modules. |
| **`GET /api/materials/{id}/download/`** | `LearningMaterialViewSet` | Binary stream (`FileResponse`) with `Content-Disposition: attachment; filename="..."` | Validates entitlement via scoped `get_object_or_404()`, checks `status == 'PUBLISHED'`, validates file existence & path containment. |

### B. Queryset Filtering Behavior
- **Client-Side Filtering:**  
  `ModuleViewSet`, `SubmoduleViewSet`, and `LearningMaterialViewSet` do not declare DRF `DjangoFilterBackend` backends in their class definitions.
  - When a learner calls `GET /api/modules/`, the backend returns all `PUBLISHED` modules across all the learner's assigned courses.
  - **Frontend Recommendation:** The frontend should fetch `/api/modules/`, `/api/submodules/`, and `/api/materials/` and filter client-side:
    ```javascript
    const courseModules = allModules.filter(m => m.course === selectedCourse.id);
    const moduleSubmodules = allSubmodules.filter(s => s.module === selectedModule.id);
    const moduleMaterials = allMaterials.filter(mat => mat.module === selectedModule.id);
    ```
  - This ensures 100% compatibility without modifying any backend code.

---

## 5. Content & Download Behavior Analysis

### 1. Curriculum Hierarchy
$$\text{Course} \xrightarrow{1:N} \text{Module} \xrightarrow{1:N} \text{Submodule} \text{ (optional)}$$
$$\text{Module} \xrightarrow{1:N} \text{LearningMaterial}$$
$$\text{Submodule} \xrightarrow{1:N} \text{LearningMaterial (via submodule FK)}$$

- Every `LearningMaterial` belongs to a parent `Module`.
- A `LearningMaterial` may optionally be assigned to a `Submodule` via `submodule_id` (nullable).
- If `submodule` is `null`, the material belongs directly to the general module level.

### 2. Supported Material Types (`MaterialType.choices`)
- `TEXT` (*"Text Content"*): Stored in `material.text_content` (string). Does not require a file. Directly readable in the browser UI.
- `IMAGE` (*"Image"*): Binary file stored in `material.file`.
- `VIDEO` (*"Video"*): Binary file stored in `material.file`.
- `EXCEL` (*"Excel Spreadsheet"*): Binary file stored in `material.file`.
- `POWERPOINT` (*"PowerPoint Presentation"*): Binary file stored in `material.file`.

### 3. Protected File Download Mechanism
In `backend/core/api_views.py::LearningMaterialViewSet.download()`:
1. `instance = get_object_or_404(self.get_queryset(), pk=pk)`: Enforces that learners can only query materials assigned to their active cohorts. An unauthorized or unassigned material ID returns **`404 Not Found`**.
2. Checks `instance.status == PublicationStatus.PUBLISHED`. Returns `400 Bad Request` if not published.
3. Checks `bool(instance.file)`. If material is `TEXT` without a file, returns `400 Bad Request` (*"This material has no downloadable file."*).
4. **Path Traversal Defense:** Canonicalizes `instance.file.path` and asserts `target_path.relative_to(media_root)`. Returns `403 Forbidden` if containment check fails.
5. **Missing File on Disk:** Checks `target_path.is_file()` and catches `FileNotFoundError`. Returns `404 Not Found` (*"File not found on the server."*).
6. **Streaming:** Streams bytes via `FileResponse(file_handle, as_attachment=True)`.

### 4. Direct Media URL Bypass Prevention
In `backend/config/urls.py`:
```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]
# Direct MEDIA_URL file serving is intentionally omitted to prevent bypassing
# the protected /api/materials/{id}/download/ authorization and entitlement endpoint.
```
- Django's `static(settings.MEDIA_URL, ...)` is **not registered**.
- Requesting `/media/<filename>` directly results in a 404 from Django.
- **Frontend Safeguard:** The frontend must never attempt `<a href={material.file}>` directly. All downloads must use `apiClient(`/materials/${material.id}/download/`)` or trigger browser download via `/api/materials/${material.id}/download/` with session credentials.

---

## 6. Live Database State Inspection

A read-only query was executed against `lms_local`:
- **Users:** 3 total (2 Learners: `lakshmiprasannasppw`, `lakshmiprasannas`; 1 Admin: `saikrishna.k@people-prime.com`).
- **Courses:** 1 (`Course #5`: Python Fundamentals, `status='DRAFT'`, `program_id=None`).
- **Modules:** 1 (`Module #1`: Intro, `status='DRAFT'`).
- **Submodules:** 0.
- **Learning Materials:** 0.
- **Training Assignments:** 0.

> [!NOTE]
> In this database state, an authenticated learner will see the clean empty state ("No courses are currently assigned to you."). The UI must handle both populated and unpopulated/empty states without crashing.

---

## 7. Incremental Implementation Plan for Phase 6.2

### Step 6.2.1: Course Selection & Navigation in `LearnerCoursesTab.jsx`
- Add `selectedCourse` state to `LearnerCoursesTab.jsx`.
- When a learner clicks on a course card, set `selectedCourse = course`.
- Render a header with a **"← Back to All Courses"** button, course title, code, description, and status.

### Step 6.2.2: Create `LearnerCourseReader.jsx`
Create a modular component: `frontend/src/pages/learner/LearnerCourseReader.jsx`:
- Props: `course`, `onBack`.
- Data Fetching:
  - Fetches `/api/modules/`, `/api/submodules/`, and `/api/materials/` in parallel on mount.
  - Filters entities matching `course.id`.
- Layout:
  - **Left / Top Sidebar:** Module list / Accordion showing module order, name, estimated duration, and submodules.
  - **Main Content Area:** Selected module/submodule header and associated learning materials list.

### Step 6.2.3: Learning Material Display & Reader
Within `LearnerCourseReader.jsx`:
- **For `TEXT` materials:**
  - Render an inline reader card displaying title, description, and `text_content` with preserved line breaks and typography.
- **For file materials (`IMAGE`, `VIDEO`, `EXCEL`, `POWERPOINT`):**
  - Render a file attachment card displaying material type icon/badge, title, description, and a **"Download File"** action button.
- **Download Action Handler:**
  - Triggers a secure blob download via session-authenticated fetch to `/api/materials/${material.id}/download/`.
  - Gracefully handles missing files (HTTP 404) or API errors by displaying a clear toast or alert banner.

### Step 6.2.4: Comprehensive State Handling
- **Loading State:** Centered spinner while curriculum modules and materials are loading.
- **Error State:** Error banner with a "Retry" button.
- **Empty Modules State:** *"This course does not have any published modules yet."*
- **Empty Materials State:** *"No learning materials are available for this module yet."*

---

## 8. Recommended Test Cases for Phase 6.2 Verification

1. **Course Opening & Navigation:**
   - Verify clicking a course card navigates to the course reader view.
   - Verify clicking "Back to All Courses" returns to the course list with existing state preserved.
2. **Entitlement & Scoping:**
   - Verify learners only see modules, submodules, and materials belonging to published, assigned courses.
   - Verify draft materials/modules are never rendered for learners.
3. **Text Material Reader:**
   - Verify text content is formatted cleanly, without rendering raw HTML or crashing on multiline strings.
4. **File Download Authorization & Integrity:**
   - Verify downloading a published file attachment succeeds with proper filename.
   - Verify downloading a text material or non-existent file returns a user-friendly error without a white screen.
5. **Responsiveness:**
   - Verify layout is responsive on desktop, tablet, and 320px-wide mobile screens.
6. **Lint & Build:**
   - Run `npm run lint` and `npm run build` to confirm zero regressions.

---

## 9. Conclusion

Phase 6.2 is thoroughly audited and ready for implementation. The proposed design operates entirely within existing frontend patterns, reuses existing Django REST Framework endpoints without requiring backend modifications, and enforces strict download security.

*As requested by the strict constraints, no application code, database records, or schema migrations were modified during this audit step.*

