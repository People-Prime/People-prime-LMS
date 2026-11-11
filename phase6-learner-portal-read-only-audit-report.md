# People Prime LMS — Phase 6: Learner Portal Read-Only Audit Report

**Date:** November 2, 2026  
**Project:** People Prime Learning Management System (LMS)  
**Workspace:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Database:** PostgreSQL (`lms_local` on localhost:5432)  
**Scope:** Phase 6 — Learner Portal Read-Only Architecture, API, and Security Audit  
**Status:** Completed (Strictly Read-Only — No source code, migrations, or database records modified)

---

## 1. Executive Summary

A comprehensive read-only audit of the People Prime LMS codebase and database was conducted to evaluate the readiness of the **Learner Portal (Phase 6)**. 

### Key Findings
1. **Frontend State (Placeholder Only):**  
   The current Learner Portal ([`frontend/src/pages/LearnerPortal.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/LearnerPortal.jsx)) is a static placeholder displaying basic user profile metadata and static metric cards ("Account Status: Active", "Operational Role: LEARNER"). It does **not** render course listings, module hierarchies, learning materials, questions, or progress trackers.
2. **Backend API Readiness (Robust & Scoped):**  
   The Django REST Framework backend already possesses a mature, object-level entitlement and scoping architecture for learners across `/api/courses/`, `/api/modules/`, `/api/submodules/`, `/api/materials/`, `/api/module-questions/`, and `/api/question-responses/`.
3. **Course Assignment Logic:**  
   Learner entitlement is strictly cohort-driven:  
   `Learner` $\rightarrow$ `GroupMembership` (active) $\rightarrow$ `LearnerGroup` (active) / `CandidateType` $\rightarrow$ `TrainingAssignment` (active) $\rightarrow$ `Course` / `Program`.  
   Standalone courses directly assigned via `TrainingAssignment.course` are fully supported by `_scope_course_qs` and `_get_curriculum_targets`.
4. **Primary Architectural Gap:**  
   While individual module completion can be checked via `/api/question-responses/module-completion-status/?module=<id>`, there is **no dedicated learner-facing overall progress/course summary endpoint** (e.g., `/api/learner/my-courses/` or `/api/learner/progress/`). The existing progress endpoint `/api/trainer/learners/{id}/progress/` strictly forbids learners (HTTP 403 Forbidden).

---

## 2. Database State Verification (Live `lms_local`)

A non-mutating query was executed against the local PostgreSQL database:

| Entity | Count | Live Records |
| :--- | :--- | :--- |
| **Users** | 3 | User 1: `lakshmiprasannasppw` (`LEARNER`, active)<br>User 2: `lakshmiprasannas` (`LEARNER`, active)<br>User 3: `saikrishna.k@people-prime.com` (`ADMIN`, active) |
| **Courses** | 1 | Course #5: `Python Fundamentals` (`code='1'`, `status='DRAFT'`, `program_id=None`) |
| **Modules** | 1 | Module #1: `Intro` (`course_id=5`, `status='DRAFT'`) |
| **Learner Groups** | 0 | None |
| **Group Memberships** | 0 | None |
| **Training Assignments** | 0 | None |
| **Learning Materials** | 0 | None |
| **Module Questions** | 0 | None |
| **Question Responses** | 0 | None |
| **Audit Logs** | 4 | Real course and module creation/deletion events |

> [!IMPORTANT]
> Because Course #5 is currently in `DRAFT` status and no `LearnerGroup` or `TrainingAssignment` records exist, querying the backend as either learner (`lakshmiprasannasppw` or `lakshmiprasannas`) will return an empty list `[]` for courses, modules, and materials. This is mathematically and architecturally correct.

---

## 3. Frontend Inspection & Workflow Classification

Inspection of `frontend/src/` components reveals the following status across required learner workflows:

| Workflow / Feature | Classification | Source Reference | Observations |
| :--- | :--- | :--- | :--- |
| **Learner Routing & Guards** | **Implemented** | [`App.jsx#L74-L80`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/App.jsx#L74-L80)<br>[`RouteGuard.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/components/RouteGuard.jsx) | `/learner/*` is guarded by `allowedRoles={['LEARNER']}`. Unauthenticated users are redirected to `/login`; unauthorized roles to `/unauthorized`. |
| **Navigation & Sidebar** | **Partially Implemented** | [`DashboardLayout.jsx#L118-L132`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/components/DashboardLayout.jsx#L118-L132) | Displays `Assigned Modules` button for `isLearner` that triggers `onTabChange("mycourses")`. However, `LearnerPortal.jsx` ignores `activeTab === "mycourses"` and renders only the static profile. |
| **My Courses List** | **Missing** | [`LearnerPortal.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/LearnerPortal.jsx) | No course card grid, course listing, status filters, or empty-state component for assigned courses. |
| **Course & Module Tree Viewer** | **Missing** | [`LearnerPortal.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/LearnerPortal.jsx) | No UI to view course modules, submodules, or hierarchy. |
| **Learning Material Reader** | **Missing** | [`LearnerPortal.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/LearnerPortal.jsx) | No component to view text materials or trigger file downloads via `/api/materials/{id}/download/`. |
| **Questions & Response Submission**| **Missing** | [`LearnerPortal.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/LearnerPortal.jsx) | No question presentation form or response submission mechanism. |
| **Progress & Completion Indicator**| **Missing** | [`LearnerPortal.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/LearnerPortal.jsx) | No UI to view module completion status or overall progress percentage. |

---

## 4. Backend APIs & Authorization Audit

### A. Scoping Functions & Role Isolation
The core queryset scoping is centralized in `backend/core/api_views.py`:

```
Learner Request
     │
     ▼
_get_role(request.user) == 'LEARNER'
     │
     ▼
_get_active_learner_assignments(user)
  ├─ LearnerGroup (memberships__learner=user, is_active=True)
  └─ CandidateType (matching active groups)
     │
     ▼
_get_curriculum_targets(assignments)
  └─ Returns (assigned_prog_ids, assigned_crs_ids)
     │
     ▼
Filter: status='PUBLISHED' & (program_id in assigned_progs | id in assigned_courses)
```

1. **`_scope_course_qs(user)`** ([`api_views.py#L318-L342`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/backend/core/api_views.py#L318-L342)):
   - Returns only courses with `status='PUBLISHED'`.
   - Accessible if `program_id` is assigned or `id` is directly assigned in `TrainingAssignment`.
   - **Standalone Course Parity:** Courses with `program_id=None` are properly returned when directly assigned via `TrainingAssignment.course`.
2. **`_scope_module_qs(user)`** ([`api_views.py#L345-L368`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/backend/core/api_views.py#L345-L368)):
   - Returns only modules with `status='PUBLISHED'` whose parent course is in assigned scope.
3. **`_scope_submodule_qs(user)`** and **`_scope_material_qs(user)`** ([`api_views.py#L371-L419`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/backend/core/api_views.py#L371-L419)):
   - Scoped strictly to `PUBLISHED` content belonging to accessible parent modules.
4. **File Download Protection (`/api/materials/{id}/download/`)** ([`api_views.py#L710-L768`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/backend/core/api_views.py#L710-L768)):
   - Uses `get_object_or_404(self.get_queryset(), pk=pk)`. If the material is not in the learner's assigned published scope, DRF raises `HTTP 404 Not Found`.
   - Validates that `status == 'PUBLISHED'` and the file exists.
   - Enforces path containment against `MEDIA_ROOT` using `Path.relative_to()`. Direct media URL serving is omitted in `config/urls.py` to prevent bypassing access controls.

---

## 5. Security & IDOR Analysis

| Endpoint | Tested / Analyzed Vulnerability | Protection Mechanism | Assessment |
| :--- | :--- | :--- | :--- |
| **`GET /api/courses/{id}/`** | IDOR: Accessing unassigned or draft course by ID. | `get_queryset()` calls `_scope_course_qs(user)`. Unassigned/draft courses return `404 Not Found`. | **Secure** |
| **`GET /api/modules/{id}/`** | IDOR: Accessing module of another course. | `get_queryset()` calls `_scope_module_qs(user)`. Returns `404 Not Found`. | **Secure** |
| **`GET /api/materials/{id}/`** | IDOR: Accessing unassigned learning materials. | Scoped to active published assignments. Returns `404 Not Found`. | **Secure** |
| **`GET /api/materials/{id}/download/`**| IDOR / Directory Traversal. | Scoped queryset + directory containment verification. | **Secure** |
| **`POST /api/question-responses/`** | Forgery / Spoofing: Submitting response for another learner. | Server ignores client-supplied `learner` field and forces `instance = serializer.save(learner=request.user)`. Validates module entitlement via `_scope_module_qs`. | **Secure** |
| **`GET /api/question-responses/`** | Information Disclosure: Viewing other learners' answers. | Scoped strictly to `learner=user` when role is `LEARNER`. Query param `?learner=<id>` is restricted to Admin/Trainer. | **Secure** |
| **`PUT / PATCH / DELETE /api/question-responses/{id}/`** | Data Tampering: Altering or retracting answers. | ViewSet explicitly raises `MethodNotAllowed` (HTTP 405). Responses are immutable. | **Secure** |
| **`GET /api/trainer/learners/`** | Privilege Escalation: Learner accessing trainer overview. | ViewSet checks `role in ('ADMIN', 'TRAINER')`. Raises `PermissionDenied` (HTTP 403). | **Secure** |
| **`GET /api/trainer/learners/{id}/progress/`** | Privilege Escalation: Learner attempting to view progress via trainer API. | ViewSet explicitly rejects `LEARNER` role with `HTTP 403 Forbidden`. | **Secure** |

---

## 6. Detailed Trace: Course Assignment Logic

The entitlement pipeline follows this exact logic:
```
1. Active Learner Group:
   LearnerGroup.objects.filter(
       memberships__learner=user,
       memberships__is_active=True,
       is_active=True
   )

2. Associated Candidate Types:
   CandidateType.objects.filter(
       learner_groups__in=active_groups,
       is_active=True
   )

3. Active Training Assignments:
   TrainingAssignment.objects.filter(is_active=True).filter(
       Q(learner_group__in=active_groups) |
       Q(candidate_type__in=active_candidate_types)
   )

4. Eligible Courses:
   Course.objects.filter(status='PUBLISHED').filter(
       Q(program_id__in=assigned_prog_ids) |
       Q(id__in=assigned_crs_ids)
   )
```

### Observations on Business Rules
- **No Active Assignments:** When a learner has no active group memberships or training assignments, `_get_active_learner_assignments(user)` returns an empty queryset. Consequently, all curriculum endpoints return `[]` (empty list) or `404 Not Found`.
- **Trainers Are NOT Required for Course Access:** A learner's access depends solely on `LearnerGroup`, `CandidateType`, and `TrainingAssignment`. Trainer assignments (`TrainerGroupAssignment`) are independent and do not block learner curriculum access.
- **Draft Courses Excluded:** Even if an assignment targets a course, if `course.status != 'PUBLISHED'`, the learner cannot see or access it.

---

## 7. Audit of Required Learner Workflows

### A. My Courses Workflow
- **Current Support:** Backend endpoint `GET /api/courses/` works today and automatically returns only assigned, published courses.
- **Frontend Gap:** `LearnerPortal.jsx` does not call `GET /api/courses/`.
- **Recommendation:** Implement a `LearnerCoursesTab` that fetches `/api/courses/`, renders course cards with sequence order, code, name, and description, and displays a friendly empty state (*"No courses are currently assigned to your cohort"*).

### B. Course Content (Modules & Materials) Workflow
- **Current Support:**  
  - Modules: `GET /api/modules/?course=<id>` returns published modules.
  - Submodules: `GET /api/submodules/?module=<id>` returns published submodules.
  - Materials: `GET /api/materials/?module=<id>` returns published learning materials.
  - Download: `GET /api/materials/{id}/download/` downloads files securely.
- **Frontend Gap:** No accordion, tree, or reader interface exists in the learner portal.
- **Recommendation:** Create a Course Detail / Module Learning view allowing learners to select a module, read text content, and download attached materials.

### C. Questions Workflow
- **Current Support:**  
  - Questions: `GET /api/module-questions/?module=<id>&is_active=true` returns active questions.
  - Responses: `POST /api/question-responses/` submits Yes/No responses bound to the authenticated learner.
  - Module Completion Check: `GET /api/question-responses/module-completion-status/?module=<id>` returns:
    ```json
    {
      "module_id": 1,
      "module_name": "Intro",
      "total_required_questions": 1,
      "answered_required_questions": 1,
      "is_module_completed": true
    }
    ```
- **Rule Verification:** A module with 0 active required questions evaluates to `is_module_completed = False` (`total_required > 0 and answered_count == total_required`). This rule is enforced on the server.
- **UI Terminology:** The UI must display **"Questions"** or **"Required Questions"**, adhering to the Phase 5 terminology improvement.

### D. Progress and Results Workflow
- **Source of Truth:** Server-side calculation in `_calculate_learner_progress_metrics(learner, assigned_modules)`.
- **Current API Limitation:**  
  The endpoint `GET /api/trainer/learners/{id}/progress/` computes full progress but restricts access to Admins and Trainers.  
  Learners currently have to query `/api/question-responses/module-completion-status/?module=<id>` on a per-module basis.
- **Recommendation for Implementation Phase:**  
  Expose a self-scoped progress action (e.g. `GET /api/question-responses/my-progress/` or allowing learners to call `/api/question-responses/module-completion-status/` for their assigned curriculum) so learners can view their overall completion percentage and completed module count without privilege escalation.

---

## 8. Automated Test Suite Status

Existing backend tests in `backend/core/tests_api.py` verify learner permissions and scoping:
- `test_learner_sees_only_published_programs` (Passed)
- `test_assigned_learner_can_retrieve_assigned_published_curriculum` (Passed)
- `test_unassigned_learner_cannot_list_or_retrieve_curriculum` (Passed)
- `test_assigned_learner_cannot_retrieve_draft_curriculum` (Passed)
- `test_assigned_learner_can_download_assigned_published_material` (Passed)
- `test_learner_cannot_download_unassigned_material_even_when_published` (Passed)
- `test_learner_response_submission_and_ownership_binding` (Passed)
- `test_learner_response_module_entitlement_enforcement` (Passed)
- `test_response_immutability` (Passed)
- `test_module_completion_another_learner_responses_do_not_count` (Passed)

Full test run of all 163 backend tests previously passed in isolated test databases with zero changes to `lms_local`.

---

## 9. Conclusion & Implementation Roadmap for Phase 6

The backend security, data models, entitlement scoping, and question verification are robust and verified. The missing work is almost entirely on the **frontend Learner Portal interface**:

1. **Phase 6.1 — Learner Course Navigation & "My Courses" Tab:**
   - Implement course list fetching from `GET /api/courses/`.
   - Create responsive course cards with empty states for unassigned learners.
2. **Phase 6.2 — Course Module & Learning Material Reader:**
   - Display module hierarchy, submodules, and text/file learning materials.
   - Wire up secure file downloads via `/api/materials/{id}/download/`.
3. **Phase 6.3 — Questions Interface:**
   - Render module completion questions ("Questions").
   - Handle response submission and reflect immediate completion status.
4. **Phase 6.4 — Learner Progression & Completion Overview:**
   - Provide visual completion badges and module progress tracking.

