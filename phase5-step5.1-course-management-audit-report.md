# People Prime LMS — Phase 5, Step 5.1 Audit Report & Implementation Plan
## Course Management Module

**Date of Audit & Planning:** November 2, 2026  
**Auditor Role:** Senior Full-Stack Software Engineer, Django Architect, React Developer, Application Security Specialist  
**Project Path:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Target Milestone:** Phase 5, Step 5.1 — Course Management Audit & Planning  
**Execution Mode:** STRICTLY READ-ONLY (Zero application code or database modifications)

---

## 1. Executive Summary

This comprehensive audit inspects the existing People Prime LMS architecture (Django REST Framework + React 19 + PostgreSQL) to formulate a streamlined implementation plan for the **Course Management Module**, using reviewed TalentLMS paradigms as functional reference points.

### Key Conclusions:
1. **Backend Foundation is Robust and Already Built:**
   - The entire relational learning hierarchy (**Program $\rightarrow$ Course $\rightarrow$ Module $\rightarrow$ Submodule**) is already modeled, migrated, and active in `backend/core/models.py`.
   - Complete DRF endpoints for Courses (`CourseViewSet`), Modules (`ModuleViewSet`), Submodules (`SubmoduleViewSet`), and Materials (`LearningMaterialViewSet`) are implemented and active under `/api/courses/`, `/api/modules/`, `/api/submodules/`, and `/api/materials/`.
   - Strict RBAC authorization, publication status restrictions (`DRAFT`, `PUBLISHED`, `ARCHIVED`), and immutable audit logging (`AuditLog`) are already in place.
2. **Primary Gap is on the Frontend Administrative UI:**
   - In `AdminCurriculumTab.jsx`, **Courses** are currently rendered as a read-only data table. There are no UI controls to create a course, edit course metadata, filter/search courses by parent program, or manage course-level module sequences.
   - Course settings and publication status toggles (`DRAFT` $\leftrightarrow$ `PUBLISHED` $\leftrightarrow$ `ARCHIVED`) are missing from the frontend interface.
   - Module creation and management forms are missing from the frontend.
3. **TalentLMS Functional Scope Calibration:**
   - TalentLMS features such as cross-domain course cloning, AI generators, commercial pricing/e-commerce, surveys, and complex SCORM engines are **explicitly out of scope**.
   - The Course Management Module needs only the essential TalentLMS operational workflows:
     - Administrator Course Index (searchable, filterable by Program/Category, badge status indicators).
     - Course Creation & Edit Drawer/Modal (Name, Code, Parent Program, Description, Sequence Order, Status).
     - Course Content Structure view (managing Modules & learning sections within the Course).
     - Module Completion Question association.
4. **Zero Modifications Confirmed:**
   - All tests, migrations, schemas, source code files, and persistent database records in `lms_local` remain strictly untouched.

---

## 2. Existing Implementation Inventory

### 2.1 Backend Models & Data Hierarchy (`backend/core/models.py`)

| Model | Parent Relationship | Key Fields | Constraints / Invariants |
| :--- | :--- | :--- | :--- |
| **`Program`** | Top-level container | `name`, `code`, `description`, `status`, `created_by` | Unique `name`, unique `code`. Statuses: `DRAFT`, `PUBLISHED`, `ARCHIVED`. |
| **`Course`** | `ForeignKey(Program)` | `program`, `name`, `code`, `description`, `order`, `status`, `created_by` | Composite unique constraints: `(program, code)` and `(program, order)`. Statuses: `DRAFT`, `PUBLISHED`, `ARCHIVED`. |
| **`Module`** | `ForeignKey(Course)` | `course`, `name`, `code`, `description`, `order`, `estimated_duration_minutes`, `status`, `created_by` | Composite unique constraints: `(course, code)` and `(course, order)`. Unit of study where completion questions are administered. |
| **`Submodule`** | `ForeignKey(Module)` | `module`, `name`, `description`, `order`, `status` | Composite unique constraint: `(module, order)`. |
| **`LearningMaterial`** | `ForeignKey(Module)` | `module`, `submodule`, `title`, `description`, `material_type`, `text_content`, `file`, `order`, `status` | Types: `TEXT`, `IMAGE`, `VIDEO`, `EXCEL`, `POWERPOINT`. Snapshot versioning via `create_version()`. |
| **`ModuleQuestion`** | `ForeignKey(Module)` | `module`, `question_text`, `order`, `is_required`, `is_active` | Composite unique: `(module, order)`. Non-scored Yes/No completion gates. |
| **`ModuleQuestionResponse`** | `ForeignKey(ModuleQuestion)` | `question`, `learner`, `response_value`, `submitted_at` | Composite unique: `(question, learner)`. Immutable responses. |
| **`TrainingAssignment`** | `Program` / `Course` $\rightarrow$ `LearnerGroup` / `CandidateType` | `program`, `course`, `learner_group`, `candidate_type`, `due_date`, `is_active` | Composite unique target & recipient. Clean validation requires at least 1 target and 1 recipient. |

### 2.2 Backend DRF ViewSets & Endpoints (`backend/core/api_views.py`)

| Endpoint | ViewSet | Allowed HTTP Methods | Role Permissions & Scoping |
| :--- | :--- | :--- | :--- |
| `/api/courses/` | `CourseViewSet` | `GET`, `POST` | `GET`: Scoped by role (`ADMIN`: all; `TRAINER`: PUBLISHED/DRAFT assigned; `LEARNER`: PUBLISHED assigned).<br>`POST`: **ADMIN only** (`_require_admin`). Creates course & audit log. |
| `/api/courses/{id}/` | `CourseViewSet` | `GET`, `PUT`, `PATCH`, `DELETE` | `PUT`/`PATCH`/`DELETE`: **ADMIN only**.<br>`DELETE`: Enforces that only `DRAFT` courses can be deleted. |
| `/api/modules/` | `ModuleViewSet` | `GET`, `POST` | `GET`: Scoped by role.<br>`POST`: **ADMIN only**. Creates module & audit log. |
| `/api/modules/{id}/` | `ModuleViewSet` | `GET`, `PUT`, `PATCH`, `DELETE` | `PUT`/`PATCH`/`DELETE`: **ADMIN only**.<br>`DELETE`: Enforces that only `DRAFT` modules can be deleted. |
| `/api/materials/` | `LearningMaterialViewSet` | `GET`, `POST` | `GET`: Scoped by role.<br>`POST`: **ADMIN only**. Enforces cross-field validations against `material_type`. |
| `/api/materials/{id}/publish/`| `LearningMaterialViewSet` | `POST` | **ADMIN only**. Detail action creating historical snapshot and setting status `PUBLISHED`. |
| `/api/module-questions/` | `ModuleQuestionViewSet` | `GET`, `POST` | `GET`: Scoped by role.<br>`POST`: **ADMIN only**. Associates Yes/No questions to module. |
| `/api/question-responses/module-completion-status/` | `ModuleQuestionResponseViewSet` | `GET` | All authenticated users. Computes verified completion rule: `is_completed = (total_required > 0 and answered == total_required)`. |

### 2.3 Frontend Existing State (`frontend/src/pages/admin/AdminCurriculumTab.jsx`)
- **Programs Sub-tab:** Connected to `GET /api/programs/` and `POST /api/programs/` (Create modal implemented).
- **Courses Sub-tab:** Connected to `GET /api/courses/` only. Displays ID, Name, Code, Parent Program, Order, Status. **No Create, Edit, or Delete actions are present**.
- **Modules Sub-tab:** Connected to `GET /api/modules/` only. Displays ID, Name, Code, Parent Course, Duration, Status. **No Create, Edit, or Delete actions are present**.
- **Materials Sub-tab:** Connected to `GET /api/materials/` and `POST /api/materials/{id}/publish/`.

---

## 3. Requirement-to-Implementation Gap Analysis

| Requirement Category | Requirement Specification | Current Implementation Status | Gap & Required Implementation |
| :--- | :--- | :---: | :--- |
| **A. Course Listing & Filtering** | Administrator-friendly course list with search, status filters, and category/program organization. | **Partial** | Backend supports full filtering. Frontend only renders a flat table without search bar or program filter dropdown. |
| **A. Course Creation** | Administrators can create new courses with name, code, parent program, order, and initial description. | **Backend Ready / Frontend Missing** | Backend `POST /api/courses/` is fully operational with audit logging. Frontend has no "+ Create Course" modal or form. |
| **A. Course Editing** | View and edit course details (description, name, code, order, status). | **Backend Ready / Frontend Missing** | Backend `PUT` / `PATCH /api/courses/{id}/` is fully operational. Frontend has no Edit modal or inline editor. |
| **A. Course Deletion** | Delete draft courses safely with server-side validation. | **Backend Ready / Frontend Missing** | Backend `DELETE /api/courses/{id}/` blocks deletion of published courses. Frontend has no Delete trigger. |
| **B. Learning Hierarchy** | Maintain Program $\rightarrow$ Course $\rightarrow$ Module $\rightarrow$ Submodule structure. | **Complete & Verified** | Exactly aligned in models and serializers. No competing hierarchy exists. |
| **B. Learning Materials Content** | Support Text, Document, PDF, Video, Image, and Presentation materials. | **Complete & Verified** | Supported in `MaterialType` and `validators.py`. |
| **B. Module Sections & Organization** | Organize modules within courses with clear sequence ordering. | **Partial** | `order` field enforced with uniqueness per course. Frontend lacks drag-and-drop or reorder controls. |
| **C. Completion Rules** | A module is complete only if $\ge 1$ active required question exists and all are answered. Zero questions = incomplete. | **Complete & Verified** | Fully implemented in `_calculate_learner_progress_metrics` and `module_completion_status`. |
| **D. Simplified Settings** | Keep basic course metadata (name, code, description, status). Defer complex TalentLMS limits/e-commerce. | **Aligned** | Current `Course` model contains exactly the required fields. |
| **E. Security & Permissions** | Admin-only course mutation; role-scoped viewing for trainers/learners; CSRF; immutable audit trail. | **Complete & Verified** | `CourseViewSet` enforces `_require_admin()` and writes to `AuditLog`. |

---

## 4. Security and Permission Findings

1. **Role Boundary Integrity:**
   - `CourseViewSet.create()`, `update()`, `partial_update()`, and `destroy()` strictly invoke `self._require_admin()`, which verifies `request.user.role == User.Role.ADMIN`. Trainers and Learners attempting direct HTTP mutations receive `403 Forbidden`.
   - Verified that horizontal scoping prevents unauthorized disclosure: `_scope_course_qs` guarantees learners only see published courses assigned to their active cohorts.
2. **Publication State Protection:**
   - `CourseViewSet.destroy()` explicitly prevents deleting `PUBLISHED` or `ARCHIVED` courses (`{"error": "Only DRAFT courses can be deleted."}`).
3. **Audit Trail Verification:**
   - Every course mutation (`CREATE`, `UPDATE`, `DELETE`) generates an immutable `AuditLog` row capturing the actor, entity ID, action type, IP address, and changed parameters.
4. **CSRF & Session Validation:**
   - Centralized `apiClient` enforces CSRF headers for state-changing requests and preserves `credentials: "include"`.

---

## 5. Recommended Minimal Design (TalentLMS-Inspired)

To satisfy the People Prime business requirements with minimal complexity, we recommend enhancing the existing `AdminCurriculumTab.jsx` component rather than rewriting routing or adding unnecessary dependencies:

```
Admin Portal -> Curriculum & Programs Tab
├── Programs Sub-Tab (Existing + Program Selection)
├── Courses Management Sub-Tab (ENHANCED)
│   ├── Top Bar: Search Input | Filter by Program | Status Filter | "+ Create Course" Button
│   ├── Courses Table / Grid:
│   │   ├── Columns: Code, Course Name, Program, Modules Count, Status Badge, Order, Actions
│   │   └── Actions: [View Modules] [Edit Details] [Delete (Draft only)]
│   ├── Create/Edit Course Modal:
│   │   ├── Program (Dropdown of existing programs)
│   │   ├── Course Name & Course Code (Unique per program)
│   │   ├── Order (Integer sequence)
│   │   ├── Status (Draft / Published / Archived)
│   │   └── Description (Textarea)
│   └── Course Detail / Structure Drawer:
│       └── Lists Modules under the Course with quick links to Modules Sub-Tab
```

---

## 6. Proposed Implementation Steps

### Step 5.2: Course Management Frontend Enhancement
1. **Enhance `AdminCurriculumTab.jsx` (Courses Section):**
   - Add Search query filter state and Parent Program filter dropdown.
   - Implement **Create Course Modal** submitting to `POST /api/courses/` with error feedback and validation.
   - Implement **Edit Course Modal** submitting to `PATCH /api/courses/{id}/` for updating title, description, order, and status.
   - Implement **Delete Course Action** calling `DELETE /api/courses/{id}/` with confirmation dialog (safely gated for draft courses).
   - Add module count indicator for each course.
2. **Enhance Module Management in Curriculum Tab:**
   - Add "+ Create Module" modal submitting to `POST /api/modules/` linked to a selected course.
   - Add Edit and Delete actions for draft modules.
3. **Responsive Layout Hardening:**
   - Verify modal forms, filter inputs, and table layouts across 320px, 375px, 430px, 768px, 1024px, 1280px, 1440px, and 1920px.

---

## 7. Verification Criteria & Automated Testing Plan

### Automated Test Coverage (Backend):
- Verify existing `CurriculumParentChildTest` in `tests_api.py`:
  - Course requires valid program (`POST /api/courses/` $\rightarrow$ 400 on invalid program ID).
  - Duplicate course code per program rejected with 400.
  - Duplicate course order per program rejected with 400.
  - Admin permission enforcement (`CurriculumAPIPermissionTest`).
- Verify draft deletion constraints and audit logging.

### Frontend Quality Gates:
- `npm run lint`: 0 errors, 0 warnings.
- `npm run build`: Production bundle compiles cleanly with 0 errors.

### Manual Verification Checklist:
1. Log in as Administrator (`saikrishna.k@people-prime.com`).
2. Navigate to Admin Portal $\rightarrow$ Curriculum & Programs $\rightarrow$ Courses.
3. Click "+ Create Course", fill valid details, verify new course appears with `DRAFT` badge.
4. Filter by Program and verify list updates reactively.
5. Search by name/code and verify real-time table filtering.
6. Edit the course to update description and change status to `PUBLISHED`.
7. Attempt deleting the published course $\rightarrow$ verify backend rejection error is gracefully displayed.
8. Set status back to `DRAFT` and delete $\rightarrow$ verify course disappears and list refreshes.

---

## 8. Risks, Dependencies & Unresolved Decisions

1. **Dependency on Parent Programs:**
   - A Course must belong to a Program. If zero programs exist in a new deployment, the UI must prompt the administrator to create a Program first.
2. **TalentLMS Category Taxonomy:**
   - In People Prime LMS, `Program` effectively serves as the top-level Category/Folder container. Introducing a separate "Category" model would create redundancy. Recommendation: Use `Program` as the organizing category.
3. **Course Duplication (Future Consideration):**
   - Explicitly deferred per prompt instructions.

---

## 9. Integrity Confirmation

- **Application Code Modified:** **NONE (0)**.
- **Database Records Modified:** **NONE (0)**.
- **Migrations Created or Executed:** **NONE (0)**.
- **LMS User Accounts / Roles Altered:** **NONE (0)**.
- **Automated Verification Executed:**
  - `npm run lint`: **0 errors, 0 warnings**.
  - `npm run build`: **Built cleanly in 352ms**.
  - `python manage.py check`: **0 issues**.
  - `python manage.py makemigrations --check --dry-run`: **No changes detected**.

