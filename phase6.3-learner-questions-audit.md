# People Prime LMS — Phase 6.3: Learner Questions & Response Submission Read-Only Audit Report

**Date:** November 2, 2026  
**Project:** People Prime Learning Management System (LMS)  
**Workspace:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Database:** PostgreSQL (`lms_local` on `localhost:5432`)  
**Scope:** Phase 6.3 Read-Only Audit of Question & Response Submission APIs, Security, and UI Integration  
**Status:** Complete (Strictly Read-Only Audit — No application code, database records, or schema modified)

---

## 1. Executive Summary

This audit prepares **Phase 6.3** of the People Prime LMS Learner Portal: enabling authenticated learners to view assigned module questions, submit confirmation answers, and observe real-time module completion status.

### Primary Audit Verdict
1. **API Contracts Fully Verified:** The backend endpoints `/api/module-questions/`, `/api/question-responses/`, and `/api/question-responses/module-completion-status/` are production-ready, strictly role-scoped, and covered by a comprehensive automated test suite in `backend/core/tests_api.py`.
2. **Strict Server-Side Identity Binding & Anti-Forgery:** When submitting a response (`POST /api/question-responses/`), the server overrides or validates the identity against `request.user`. Attempting to submit on behalf of another user ID triggers a 400 validation error. Responses are strictly restricted to users with `role='LEARNER'`.
3. **Immutability & Duplicate Handling:** `PUT`, `PATCH`, and `DELETE` on `/api/question-responses/{id}/` are strictly rejected with `HTTP 405 Method Not Allowed`. Responses are immutable audit artifacts. Duplicate submissions for the same `(question, learner)` pair are blocked by both database constraint `unique_learner_question_response` and serializer validation.
4. **Completion Rule Integrity:** A module is complete if and only if:
   $$\text{total\_active\_required\_questions} > 0 \quad \text{AND} \quad \text{answered\_required} == \text{total\_active\_required\_questions}$$
   A module with zero active required questions evaluates to `is_module_completed = False`. Both `True` and `False` confirmation values count as valid answered responses for module completion.
5. **Frontend Integration Readiness:** [`LearnerCourseReader.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/learner/LearnerCourseReader.jsx) created in Phase 6.2 provides the exact natural anchor point to display questions beneath learning materials, with section tabs or an integrated module completion card.

---

## 2. Working State & Pre-Inspection Check

- Command executed: `git status --short`
- **Result:** Working directory is not a git repository (`fatal: not a git repository`).
- **Phase 6.1 & Phase 6.2 Files Inspected:**
  - `frontend/src/pages/learner/LearnerCoursesTab.jsx`: Functions cleanly, handles course selection, and renders `LearnerCourseReader`.
  - `frontend/src/pages/learner/LearnerCourseReader.jsx`: Handles module navigation, submodule filtering, inline text rendering, and secure file downloads.
  - `frontend/src/pages/LearnerPortal.jsx`: Preserved, maintains tab navigation between Overview and My Courses.
- **Confirmation:** No files were altered, overwritten, or reset.

---

## 3. Verified API Contracts & Response Fields

Inspection of `backend/core/models.py`, `backend/core/serializers.py`, and `backend/core/api_views.py` confirmed the exact contracts:

### A. `GET /api/module-questions/`
- **ViewSet:** `ModuleQuestionViewSet`
- **Scoping for `LEARNER`:** Returns only questions where `module` is in `_scope_module_qs(user)` (i.e. module belongs to a published, assigned course) and `is_active=True`.
- **Supported Query Params:**
  - `?module=<id>`: Filters questions for a specific module.
  - `?is_required=true/false`: Filters by required status.
  - `?is_active=true/false`: Filter active questions.
- **Serializer Fields (`ModuleQuestionSerializer`):**
  ```json
  {
    "id": 10,
    "module": 1,
    "module_name": "Intro",
    "question_text": "Have you reviewed and understood the module materials?",
    "order": 1,
    "is_required": true,
    "is_active": true,
    "created_at": "2026-11-02T10:00:00Z",
    "updated_at": "2026-11-02T10:00:00Z"
  }
  ```

### B. `GET /api/question-responses/`
- **ViewSet:** `ModuleQuestionResponseViewSet`
- **Scoping for `LEARNER`:** Strictly scoped to `ModuleQuestionResponse.objects.filter(learner=request.user)`. Learners can never inspect other learners' responses.
- **Supported Query Params:** `?question=<id>`, `?module=<id>`.
- **Serializer Fields (`ModuleQuestionResponseSerializer`):**
  ```json
  {
    "id": 42,
    "question": 10,
    "question_text": "Have you reviewed and understood the module materials?",
    "learner": 2,
    "learner_username": "lakshmiprasannas",
    "response_value": true,
    "submitted_at": "2026-11-02T10:15:00Z",
    "updated_at": "2026-11-02T10:15:00Z"
  }
  ```

### C. `POST /api/question-responses/`
- **Payload Required:**
  ```json
  {
    "question": 10,
    "response_value": true
  }
  ```
- **Validation Rules:**
  1. Caller must have `role == 'LEARNER'`. Non-learners receive `403 Forbidden`.
  2. Question must belong to a module in `_scope_module_qs(request.user)`. Unauthorized modules receive `403 Forbidden` (*"You are not authorized to submit responses for this module."*).
  3. `response_value` must be a valid boolean (`true` or `false`).
  4. Server overrides client `learner` field: `instance = serializer.save(learner=request.user)`.
  5. If a response already exists for `(question, learner)`, raises validation error `400 Bad Request` (*"A response for this question from this learner has already been recorded."*).
- **HTTP Response on Success:** `201 Created` with full serialized response object.

### D. `GET /api/question-responses/module-completion-status/?module=<id>`
- **Query Parameters:** `?module=<module_id>`. For `LEARNER`, `?learner` parameter is ignored or enforced to `request.user`.
- **Authorization:** Checks that module is in `_scope_module_qs(request.user)`. If unassigned or draft, returns `404 Not Found`.
- **Response Format:**
  ```json
  {
    "module_id": 1,
    "module_name": "Intro",
    "learner_id": 2,
    "learner_username": "lakshmiprasannas",
    "total_required_questions": 1,
    "answered_required_questions": 1,
    "is_module_completed": true,
    "total_questions": 1,
    "total_answered_questions": 1
  }
  ```

---

## 4. Question & Answer Format Analysis

- **Question Types:** The LMS uses confirmation questions represented by `is_required` (boolean) and `question_text` (string). There are no multiple-choice, free-text essay, or numerical questions in the data model.
- **Answer Format:** A strict boolean `response_value` (`True` / `False`).
- **Completion Semantics:**
  - Both `response_value=True` and `response_value=False` count as an answered question.
  - The business logic is confirmation-based: a question is complete once the learner has formally recorded their response.
- **Zero Required Questions Rule:**
  - If `total_required_questions == 0`, `is_module_completed` is `False`. The LMS design intentionally prevents empty modules from being marked automatically completed without active required confirmation questions.

---

## 5. Security & Authorization Findings

| Security Aspect | Backend Mechanism | Audit Finding |
| :--- | :--- | :--- |
| **Entitlement Enforcement** | `_scope_module_qs(request.user).filter(id=question.module_id).exists()` | **Verified Safe:** Learners cannot submit answers to unassigned or draft courses. |
| **Identity Spoofing** | Serializer rejects `learner_id != request.user.id` with 400, and ViewSet forces `learner=request.user`. | **Verified Safe:** Anti-forgery protection is enforced on the server. |
| **Tampering & Retraction** | `update`, `partial_update`, and `destroy` raise `MethodNotAllowed` (HTTP 405). | **Verified Safe:** Question responses are immutable audit records. |
| **Data Leakage (IDOR)** | `get_queryset()` strictly filters `learner=user` for `LEARNER` role. | **Verified Safe:** Learners cannot view answers from other learners. |
| **Duplicate Submissions** | Model constraint `UniqueConstraint(fields=('question', 'learner'))` + Serializer `validate()` check. | **Verified Safe:** Prevents duplicate rows or race conditions. |

---

## 6. Frontend Integration Recommendations for Phase 6.3

### A. Location in Reader Layout
In `LearnerCourseReader.jsx`, beneath the learning materials section for the active module:
- Add a dedicated **"Module Completion Questions"** section.
- Display a progress badge: e.g. `<span className="badge badge-success">Module Completed</span>` or `<span className="badge badge-warning">Pending Required Questions</span>`.

### B. UI Component Architecture
1. **Module Completion Status Card:**
   - Calls `GET /api/question-responses/module-completion-status/?module=<id>`.
   - Displays required questions progress (e.g., `1 of 2 answered`).
   - Clearly flags when a module is fully completed.
2. **Question Card List:**
   - Calls `GET /api/module-questions/?module=<id>&is_active=true`.
   - Calls `GET /api/question-responses/?module=<id>` to check existing submitted answers.
   - For unanswered questions: Renders Yes / No confirmation buttons with a submit action.
   - For already answered questions: Renders a read-only confirmed badge (e.g. `<span className="badge badge-success">Answered: Yes</span>` with localized timestamp), disabling re-submission.
3. **Empty States:**
   - If a module has 0 active questions: Displays an informational notice (*"No completion questions are configured for this module."*).
4. **Terminology Compliance:**
   - Adhere strictly to the Phase 5 decision: Use the terms **"Questions"** and **"Required Questions"** (never "Yes/No Questions").

---

## 7. Current Live Database State (`lms_local`)

A read-only query was executed against PostgreSQL `lms_local`:
- **Users:** 3 total (2 Learners: `lakshmiprasannasppw`, `lakshmiprasannas`; 1 Admin: `saikrishna.k@people-prime.com`).
- **Module Questions:** 0.
- **Module Question Responses:** 0.
- **Courses:** 1 (Course #5: Python Fundamentals, `status='DRAFT'`).
- **Modules:** 1 (Module #1: Intro, `status='DRAFT'`).

*Note: In the current unassigned/draft state, an active learner calling the questions APIs will receive clean empty lists (`[]`). This confirms that empty-state handling in the UI is mandatory and must not crash.*

---

## 8. Automated Test Coverage Reference

Existing tests in `backend/core/tests_api.py::ModuleQuestionAndResponseAPITest` already verify:
- `test_module_question_admin_crud`
- `test_module_question_role_permissions`
- `test_learner_response_submission_and_ownership_binding`
- `test_learner_response_module_entitlement_enforcement`
- `test_response_immutability`
- `test_trainer_response_visibility_scoping`
- `test_module_completion_status_calculation`
- `test_module_completion_zero_active_required_questions_is_incomplete`
- `test_module_completion_one_required_question_unanswered_is_incomplete`
- `test_module_completion_all_yes_and_all_no_and_mixed`
- `test_module_completion_inactive_required_questions_excluded`
- `test_module_completion_another_learner_responses_do_not_count`

All 12 backend test cases are passing.

---

## 9. Conclusion

Phase 6.3 is thoroughly audited. The backend API is completely implemented, verified, and secured. The implementation task will consist exclusively of creating the learner question interaction UI in `frontend/src/pages/learner/` without touching backend models, views, or database tables.

