# People Prime LMS — Phase 5, Step 5.3 Audit Report
## Course Content Management Audit

**Audit Date:** 2026-11-02  
**Auditor Mode:** Read-Only Analysis  
**Repository Location:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Target Architecture:** Course $\longrightarrow$ Module $\longrightarrow$ Submodule / Learning Materials $\longrightarrow$ Required Yes/No Questions

---

### 1. Executive Summary & Context

People Prime LMS requires a simplified course content management workflow (analogous to essential TalentLMS functionality without enterprise bloat like e-commerce, AI generation, or cross-domain course duplication). Following Phase 5 Step 5.2, Courses can now exist independently without mandatory Programs.

This audit assesses the readiness of the codebase to support the direct creation, management, delivery, and tracking of course content at each level of the learning hierarchy:
$$\textbf{Course} \longrightarrow \textbf{Module} \longrightarrow \textbf{Submodule / Learning Materials} \longrightarrow \textbf{Required Yes/No Questions}$$

**Key Verdict:**
- The **Django backend models and REST endpoints are already robust and fully implemented** for Course, Module, Submodule, Learning Materials (with file upload & version snapshots), Module Questions (Yes/No gates), and Learner Responses.
- The **Admin Curriculum frontend (`AdminCurriculumTab.jsx`) currently only provides basic listing and modal creation for Courses and Modules**. It **lacks** interactive management for Submodules, file upload/text creation for Learning Materials, and authoring controls for Required Yes/No Questions.
- The **Learner Portal frontend (`LearnerPortal.jsx`) is currently an operational profile stub**; learners cannot yet view content or submit question answers through the web UI, even though the backend endpoints (`/api/materials/`, `/api/module-questions/`, `/api/question-responses/`) are operational and covered by 162 passing tests.
- **Programs dependency** is almost completely removed from Course management, but a few minor cosmetic artifacts and an extension gap for PDF documents exist.

---

### 2. Comprehensive Model & Data Architecture Inspection

| Model | Purpose | Program Dependent? | Audit Finding |
| :--- | :--- | :---: | :--- |
| **`Course`** | Core learning unit | **NO** (`null=True, blank=True`) | Standalone courses supported via partial unique constraints on `code`. |
| **`Module`** | Unit of study belonging to a Course | **NO** (foreign key to `Course`) | Supports `order`, `estimated_duration_minutes`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`). |
| **`Submodule`** | Granular lesson partition under a Module | **NO** (foreign key to `Module`) | Fully modeled with `module`, `name`, `description`, `order`, `status`. No `created_by` field (clean design). |
| **`LearningMaterial`** | Content asset (text or file) | **NO** (foreign key to `Module`, optional `Submodule`) | Supports `MaterialType` choices (`TEXT`, `IMAGE`, `VIDEO`, `EXCEL`, `POWERPOINT`). Has `text_content` and `file`. |
| **`MaterialVersion`** | Immutable historical snapshot on publish | **NO** (foreign key to `LearningMaterial`) | Automatically snapshots metadata and file bytes on `POST /api/materials/{id}/publish/`. |
| **`ModuleQuestion`** | Non-scored Yes/No completion confirmation | **NO** (foreign key to `Module`) | Has `question_text`, `order`, `is_required` (default `True`), and `is_active` (default `True`). |
| **`ModuleQuestionResponse`** | Learner's Yes/No response | **NO** (foreign key to `ModuleQuestion`, `learner`) | Has `response_value` (Boolean), `submitted_at`, and server-enforced learner binding. |
| **`TrainingAssignment`** | Assigns curriculum to LearnerGroup or CandidateType | **NO** (`course` FK supported) | Can directly assign `course` without `program`. Invariant: either `course` or `program` must be provided. |
| **`AuditLog`** | Immutable event trail | **NO** | Logs actor, action (`CREATE`, `UPDATE`, `DELETE`, `PUBLISH`, etc.), entity, and payload details. |

---

### 3. API Contract, Permissions & Capabilities

| Endpoint | Methods | Authorization | Scope & Notes |
| :--- | :---: | :---: | :--- |
| `/api/courses/` | `GET`, `POST` | Authenticated (POST: Admin) | Scoped by role. Admin creates direct courses. |
| `/api/courses/{id}/` | `GET`, `PUT`, `PATCH`, `DELETE` | Authenticated (Write: Admin) | Draft-only deletion restriction enforced. |
| `/api/modules/` | `GET`, `POST` | Authenticated (POST: Admin) | Scoped by role. Module belongs to `course`. |
| `/api/modules/{id}/` | `GET`, `PUT`, `PATCH`, `DELETE` | Authenticated (Write: Admin) | Draft-only deletion restriction enforced. |
| `/api/submodules/` | `GET`, `POST` | Authenticated (POST: Admin) | Full CRUD available in backend. **Not wired to Admin UI**. |
| `/api/submodules/{id}/` | `GET`, `PUT`, `PATCH`, `DELETE` | Authenticated (Write: Admin) | Draft-only deletion restriction enforced. |
| `/api/materials/` | `GET`, `POST` | Authenticated (POST: Admin) | Supports `multipart/form-data` uploads and text. |
| `/api/materials/{id}/` | `GET`, `PUT`, `PATCH`, `DELETE` | Authenticated (Write: Admin) | Published materials are locked against direct edit. |
| `/api/materials/{id}/publish/` | `POST` | Admin only | Atomic version snapshot generation + status change to `PUBLISHED`. |
| `/api/materials/{id}/download/` | `GET` | Authenticated | Path-traversal safe download of published material files. |
| `/api/materials/{id}/versions/` | `GET` | Authenticated | Read-only list of historical snapshots. |
| `/api/module-questions/` | `GET`, `POST` | Authenticated (POST: Admin) | Admin full CRUD. Learners/Trainers read-only scoped. Filter by `?module=`. |
| `/api/module-questions/{id}/` | `GET`, `PUT`, `PATCH`, `DELETE` | Authenticated (Write: Admin) | Admin full CRUD. |
| `/api/question-responses/` | `GET`, `POST` | Authenticated (POST: Learner) | Learners submit Yes/No answers. `PUT/PATCH/DELETE` are `405 Method Not Allowed`. |
| `/api/question-responses/module-completion-status/` | `GET` | Authenticated | `?module=<id>[&learner=<id>]` evaluates verified Step 3.4 rule: completed if `total_required > 0` and `answered_count == total_required`. |
| `/api/trainer/learners/` | `GET` | Trainer / Admin | Returns assigned learners with module completion metrics and progress percentages. |

---

### 4. Content Type & Document / Media Support Audit

#### A. Supported Material Types in `MaterialType` TextChoices:
1. **Text Content (`TEXT`):**
   - Stored in `LearningMaterial.text_content` (TextField) or optional document file.
   - Serializer requires either `text_content` or `file`.
2. **Video (`VIDEO`):**
   - Validated against extensions: `.mp4`, `.mov`, `.avi`, `.webm`.
   - File size enforced by `settings.MAX_UPLOAD_SIZE_MB` (default 100 MB).
3. **Images (`IMAGE`):**
   - Validated against extensions: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`.
4. **Office Spreadsheets (`EXCEL`):**
   - Validated against extensions: `.xlsx`, `.xls`, `.csv`.
5. **Office Presentations (`POWERPOINT`):**
   - Validated against extensions: `.pptx`, `.ppt`.

#### B. Crucial Finding: PDF / Document File Support
- In `backend/core/validators.py`, allowed extensions currently include:
  - `ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}`
  - `ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm"}`
  - `ALLOWED_EXCEL_EXTENSIONS = {".xlsx", ".xls", ".csv"}`
  - `ALLOWED_POWERPOINT_EXTENSIONS = {".pptx", ".ppt"}`
- **Gap Identified:** PDF (`.pdf`) and generic document formats (`.doc`, `.docx`) are **currently rejected** by `validate_learning_material_file()`!
- Requirement specifically asks to support "PDF/documents". To support PDFs cleanly in Step 5.4, either a `DOCUMENT` / `PDF` material type or adding `.pdf` to text/document category will be necessary.

---

### 5. Frontend UI Evaluation (`AdminCurriculumTab.jsx`)

1. **Current State:**
   - Tabs present: **Courses**, **Modules**, **Learning Materials**.
   - **Courses View:** List, search, filter, edit, and create courses directly.
   - **Modules View:** Read-only table of modules (`ID`, `Name`, `Code`, `Parent Course`, `Duration`, `Order`, `Status`).
   - **Learning Materials View:** Read-only table of materials with a "Publish Content" button.
2. **Missing UI Controls in Admin Curriculum:**
   - **Module Editing / Deletion:** Modules table has no "Edit" or "Delete" actions (only `+ Create Module` modal exists).
   - **Submodules Section / View:** No UI tab, table, or modal exists to create, edit, reorder, or list Submodules under a module.
   - **Learning Material Creation & Upload Modal:** No UI exists to create learning materials, write text content, or select and upload video/documents via `multipart/form-data`.
   - **Required Yes/No Questions Management:** No UI exists in Admin Curriculum to view, create, edit, activate/deactivate, or delete completion questions for a module.
   - **Parent Select in Module Modal:** `modCourse` dropdown still references `- {c.program_name}` which can render empty or `undefined` for standalone courses.

---

### 6. Learner & Trainer Readiness Audit

1. **Learner Experience:**
   - **Backend:** Completely implemented. Learners assigned to a direct Course can query published modules, fetch published materials, download authorized files, query active questions, and submit responses (`/api/question-responses/`).
   - **Frontend:** `LearnerPortal.jsx` currently displays only account stats and operational metadata. It does not yet render assigned courses, module lessons, embedded text/video, or question answering forms.
2. **Trainer Experience:**
   - **Backend:** Trainer progress monitoring (`/api/trainer/learners/`) handles standalone courses seamlessly via `Q(course__program_id__in=assigned_prog_ids) | Q(course_id__in=assigned_crs_ids)`.
   - **Frontend:** `TrainerLearnersTab.jsx` displays assigned learners and per-module completion percentages. Works whether the course belongs to a program or was assigned directly.

---

### 7. Remaining Program Dependencies Check

| Location | Status | Action Needed for Course Content |
| :--- | :---: | :--- |
| `Course.program` | Optional (`null=True`) | None (resolved in Step 5.2). |
| `TrainingAssignment` | Supports `course` directly | None. Assignment can target course alone. |
| `_scope_module_qs` | Scoped by `course_id` OR `program_id` | Fully functional for direct courses. |
| `_scope_material_qs` | Scoped through `module__course_id` | Fully functional for direct courses. |
| `AdminCurriculumTab.jsx` line 753 | UI Cosmetic reference: `{c.name} ({c.code}) - {c.program_name}` | Minor cleanup: show `c.program_name || 'Direct Course'`. |

**Verdict:** There are **zero blocking backend Program dependencies** preventing course content from being created, published, or accessed.

---

### 8. Security & Data Integrity Considerations

1. **Role-Based Access Control (RBAC):**
   - Course, Module, Submodule, LearningMaterial, and ModuleQuestion mutations are strictly restricted to `ADMIN`.
   - Question response submissions are strictly restricted to `LEARNER`.
2. **Immutability Rules:**
   - Published learning materials cannot be directly overwritten; publishing generates a historical `MaterialVersion` copy.
   - ModuleQuestion responses are strictly immutable (`PUT`, `PATCH`, `DELETE` are disallowed; unique per `(question, learner)`).
3. **File Upload Security:**
   - Extension allowlists enforced via server-side validators.
   - Path-traversal protection via `Path.resolve()` and directory containment validation inside `download()`.
   - File sizes capped at 100 MB.
4. **Draft-Only Deletion:**
   - Courses, Modules, Submodules, and Materials enforce that only items with `status='DRAFT'` can be deleted.

---

### 9. Prioritized Implementation Recommendations (Phase 5 Step 5.4+)

To implement the simplified Course Content Management without unnecessary complexity:

1. **Priority 1: Admin Curriculum Module & Submodule Management:**
   - Add Module Edit & Delete actions in the Modules table.
   - Add Submodules authoring (modal or accordion under each Module) allowing Admins to create and order lesson partitions.
2. **Priority 2: Learning Material Authoring & File Upload UI:**
   - Create a `Create Learning Material` modal in `AdminCurriculumTab.jsx`.
   - Support selecting Parent Module and optional Submodule.
   - Support Text content (textarea) and File Upload (drag-and-drop or file input).
   - Add `.pdf` support to backend validators and frontend upload types.
3. **Priority 3: Required Yes/No Question Authoring UI:**
   - Add a Questions manager modal or tab for Admins to view, create, toggle `is_required`, and reorder Yes/No completion questions for any selected module.
4. **Priority 4: Learner Content Delivery & Completion Interface:**
   - Enhance the Learner Portal to allow learners to click into assigned modules, view text materials, watch videos / download documents, and submit their Yes/No completion confirmation answers.

---

### 10. Audit Sign-Off

- **Files Inspected:**
  - `backend/core/models.py`
  - `backend/core/validators.py`
  - `backend/core/serializers.py`
  - `backend/core/api_views.py`
  - `backend/core/api_urls.py`
  - `frontend/src/pages/admin/AdminCurriculumTab.jsx`
  - `frontend/src/pages/LearnerPortal.jsx`
  - `frontend/src/pages/trainer/TrainerLearnersTab.jsx`
  - `frontend/src/services/api.js`
- **Database Safety:** Zero records created, updated, or deleted during this audit.
- **Migration State:** Clean; no migrations required or executed.
- **Backend Test Status:** 162/162 passing.

