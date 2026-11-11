# People Prime LMS — Phase 4 Implementation Roadmap
## Frontend Routing & Role-Based Portals

**Status:** Planning & Roadmap Specification  
**Date:** October 30, 2026  
**Prerequisites:** Phase 3 completely verified (152 backend tests passing, 0 schema drift)  

---

## 1. Architectural Blueprint & Target Directory Structure

To transition from the single-file state machine in `frontend/src/App.jsx` to an enterprise, modular React application, Phase 4 will establish the following structure:

```text
frontend/src/
├── api/
│   ├── client.js             # Centralized fetch wrapper (CSRF, cookies, error handling)
│   ├── auth.js               # Auth API calls (login, logout, session/me, csrf)
│   ├── curriculum.js         # Programs, Courses, Modules, Submodules, Materials
│   ├── cohorts.js            # CandidateTypes, LearnerGroups, Memberships, Assignments
│   ├── progression.js        # Questions, Responses, Module Status
│   ├── trainer.js            # Trainer Learner Roster & Progress drill-down
│   └── reports.js            # Admin system overview, progress, and audit logs
├── components/
│   ├── common/               # StatCard, DataTable, Modal, LoadingSpinner, Alert, Badge
│   ├── layout/               # Header, Sidebar, DashboardLayout, RouteGuard
│   ├── viewers/              # VideoPlayer, ImageViewer, DocumentDownloadLink, TextViewer
│   └── forms/                # QuestionResponseForm, ProgramForm, CohortForm
├── context/
│   └── AuthContext.jsx       # Global auth state, login/logout actions, role verification
├── pages/
│   ├── auth/
│   │   ├── LoginPage.jsx
│   │   └── UnauthorizedPage.jsx
│   ├── admin/
│   │   ├── AdminDashboard.jsx
│   │   ├── CurriculumManager.jsx
│   │   ├── CohortManager.jsx
│   │   └── ReportsPage.jsx
│   ├── trainer/
│   │   ├── TrainerDashboard.jsx
│   │   └── LearnerProgressDetail.jsx
│   └── learner/
│       ├── LearnerDashboard.jsx
│       ├── ModuleStudyView.jsx
│       └── QuestionSubmissionView.jsx
├── routes/
│   └── AppRoutes.jsx         # react-router-dom route configuration & protection
├── App.jsx                   # Router provider & high-level layout
├── main.jsx
├── App.css                   # Enterprise dark theme styles
└── index.css                 # Base resets & font variables
```

---

## 2. Phase 4 Step-by-Step Implementation Sequence

### Step 4.1: Routing Infrastructure & Centralized API Client [COMPLETED]
- **Status:** **Completed and Verified** (See `PHASE4_STEP4.1_IMPLEMENTATION_REPORT.md`)
- **Verified Outcomes:**
  - Installed `react-router-dom` v7.18.5 in `frontend/package.json`.
  - Implemented centralized API client in `frontend/src/services/api.js` with credentials inclusion, automated CSRF fetching, cookie extraction, and normalized error handling.
  - Implemented global session authentication in `frontend/src/context/AuthContext.jsx` and `frontend/src/hooks/useAuth.js`.
  - Implemented `frontend/src/components/RouteGuard.jsx` enforcing role boundaries (`ADMIN`, `TRAINER`, `LEARNER`).
  - Configured declarative routing in `frontend/src/App.jsx` with routes for `/login`, `/admin/*`, `/trainer/*`, `/learner/*`, `/unauthorized`, and `*`.
  - Retained shared dark theme layout and company branding in `frontend/src/components/DashboardLayout.jsx`.
  - Both `npm run lint` and `npm run build` pass with 0 errors.
  - Full backend test suite passes 152/152 tests.
  - Zero database records or user accounts were modified.
- **Scope:**
  1. Add `react-router-dom` to `frontend/package.json`.
  2. Implement `api/client.js` with automated CSRF extraction, `credentials: "include"`, unified error JSON parsing, and HTTP status handling (401 triggers session invalidation; 403 triggers forbidden navigation).
  3. Create `context/AuthContext.jsx` to provide session state (`currentUser`, `role`, `isAuthenticated`, `login`, `logout`) across all routes.
  4. Create `components/layout/RouteGuard.jsx` enforcing role restrictions (`ADMIN`, `TRAINER`, `LEARNER`).
  5. Setup `routes/AppRoutes.jsx` mapping:
     - `/login` -> `LoginPage`
     - `/unauthorized` -> `UnauthorizedPage`
     - `/admin/*` -> Guarded by `ADMIN`
     - `/trainer/*` -> Guarded by `TRAINER` or `ADMIN`
     - `/learner/*` -> Guarded by `LEARNER`
- **Files Modified/Created:**
  - `frontend/package.json`
  - `frontend/src/api/client.js`, `frontend/src/api/auth.js`
  - `frontend/src/context/AuthContext.jsx`
  - `frontend/src/components/layout/RouteGuard.jsx`
  - `frontend/src/routes/AppRoutes.jsx`
  - `frontend/src/App.jsx`
- **APIs Required:**
  - `GET /api/csrf/`
  - `GET /api/me/`
  - `POST /api/login/`
  - `POST /api/logout/`
- **Acceptance Criteria:**
  - Clean URL history navigation without full page reloads.
  - Logging in automatically routes to `/admin`, `/trainer`, or `/learner`.
  - Unauthenticated access to protected routes redirects to `/login`.
  - Unauthorized role access redirects to `/unauthorized` or role portal.

---

### Step 4.2: Admin Portal Integration (Curriculum, Cohorts & Oversight)
- **Scope:**
  1. **Overview & Reports Screen:** Wire `GET /api/admin/reports/overview/` to dynamic stat cards. Wire `GET /api/admin/reports/progress/` and `GET /api/admin/reports/activity/` to real-time summary tables.
  2. **Curriculum Manager Screen:**
     - Data table of Programs, Courses, Modules, Submodules (`GET /api/programs/`, `/api/courses/`, `/api/modules/`).
     - Publishing status badges (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
     - Modals/forms to create and edit curriculum entities (`POST`, `PUT`, `PATCH`).
     - Publishing action bound to `POST /api/materials/{id}/publish/`.
  3. **Cohort & Assignment Manager Screen:**
     - Table of Candidate Types and Learner Groups (`GET /api/candidate-types/`, `/api/learner-groups/`).
     - Trainer assignment manager (`GET`/`POST` `/api/trainer-assignments/`).
     - Training assignment manager (`GET`/`POST` `/api/training-assignments/`).
- **Files Modified/Created:**
  - `frontend/src/pages/admin/*`
  - `frontend/src/api/curriculum.js`, `frontend/src/api/cohorts.js`, `frontend/src/api/reports.js`
  - Form & modal components.
- **APIs Required:**
  - `/api/admin/reports/*`
  - `/api/programs/`, `/api/courses/`, `/api/modules/`, `/api/submodules/`, `/api/materials/`
  - `/api/candidate-types/`, `/api/learner-groups/`, `/api/trainer-assignments/`, `/api/training-assignments/`
- **Acceptance Criteria:**
  - Metrics cards display live aggregated data from PostgreSQL.
  - Admin can view, create, edit, and publish curriculum elements.
  - Admin can create cohorts and assign courses to groups.

---

### Step 4.3: Trainer Portal Integration (Roster, Progress Tracking & Drill-Down)
- **Scope:**
  1. **Assigned Groups & Learner Roster:**
     - Wire `GET /api/trainer/learners/` to display active learners across assigned groups.
     - Progress bars showing per-learner `completion_percentage`, `completed_modules`, and `total_assigned_modules`.
     - Filter/search by cohort name or learner name.
  2. **Individual Learner Progress Drill-Down View:**
     - Wire `GET /api/trainer/learners/{id}/progress/`.
     - Display module-by-module breakdown with completion badges and required questions answered counts.
- **Files Modified/Created:**
  - `frontend/src/pages/trainer/*`
  - `frontend/src/api/trainer.js`
- **APIs Required:**
  - `GET /api/trainer/learners/`
  - `GET /api/trainer/learners/{id}/progress/`
- **Acceptance Criteria:**
  - Trainers see only learners within their actively assigned groups.
  - Clicking a learner opens their progress breakdown showing verified module completion statuses.

---

### Step 4.4: Learner Portal Integration (Assigned Modules, Viewer & Yes/No Questions)
- **Scope:**
  1. **Learner Dashboard & Catalog:**
     - Fetch assigned courses and published modules (`GET /api/courses/`, `GET /api/modules/`).
     - Real-time module completion badges reflecting `GET /api/question-responses/module_status/?module={id}`.
  2. **Learning Material Viewer:**
     - Multi-format viewer supporting text content, images, embedded video, and secure file download links (`GET /api/materials/{id}/download/`).
  3. **Module Completion Questions & Yes/No Submission Screen:**
     - Fetch required active questions (`GET /api/module-questions/?module={id}`).
     - Display intuitive Yes/No toggle inputs.
     - Submit responses to `POST /api/question-responses/`.
     - Automatically trigger completion status recalculation upon submission.
     - Enforce response immutability: answered questions switch to disabled, read-only state.
- **Files Modified/Created:**
  - `frontend/src/pages/learner/*`
  - `frontend/src/components/viewers/*`
  - `frontend/src/api/progression.js`
- **APIs Required:**
  - `GET /api/courses/`, `GET /api/modules/`, `GET /api/materials/`
  - `GET /api/materials/{id}/download/`
  - `GET /api/module-questions/?module={id}`
  - `POST /api/question-responses/`
  - `GET /api/question-responses/module_status/?module={id}`
- **Acceptance Criteria:**
  - Learners view only published content assigned to their groups.
  - All required questions must be submitted before the module displays "Completed".
  - Responses become permanent and cannot be modified or re-submitted.

---

### Step 4.5: Cross-Browser, Responsive & End-to-End Verification
- **Scope:**
  1. Execute responsive audits at 320px, 375px, 430px, 768px, 1024px, 1440px, 1920px.
  2. Execute frontend linting (`npm run lint`) and production build (`npm run build`).
  3. Run end-to-end user journey tests across Admin, Trainer, and Learner personas.
- **Acceptance Criteria:**
  - Zero build or lint errors.
  - Zero layout breaks across standard viewports.
  - 100% preservation of enterprise dark theme and corporate logo branding.

