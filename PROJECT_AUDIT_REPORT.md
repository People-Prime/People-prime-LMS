# PEOPLE PRIME LMS — COMPLETE PROJECT AUDIT REPORT

**Date of Audit:** October 29, 2026  
**Auditor Role:** Senior Full-Stack Software Engineer, Django Architect, React Developer, PostgreSQL Specialist, and Application Security Auditor  
**Repository Location:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Target Application:** People Prime Worldwide LMS Portal  

---

## 1. Executive Summary

People Prime LMS is currently in its foundational inception stage. While a robust architectural blueprint has been established for PostgreSQL integration and Django session-based authentication with CSRF protection, **the application currently lacks the entire business domain layer**. 

Key verified findings include:
- **Authentication & Security:** Basic session login, session check (`/api/me/`), logout, and registration endpoints exist. However, the registration endpoint has a **critical privilege escalation vulnerability** (allowing public registration as `ADMIN` or `TRAINER`) and bypasses Django's configured password validators. In addition, production security settings (secret key, debug flag, allowed hosts, secure cookie flags) require immediate hardening.
- **Database & Data Layer:** PostgreSQL connectivity is confirmed and healthy (`lms_local`). However, the database only contains Django system tables and a basic `accounts_user` table. **Zero business tables exist**—there are no tables for courses, modules, submodules, learning materials, candidate types, learner groups, Yes/No questions, learner submissions, module completions, or audit logs.
- **Frontend Architecture:** The React + Vite frontend compiles cleanly (`npm run build` succeeds) and passes ESLint with zero errors. However, it consists of a single-file component (`App.jsx`) with no client-side routing (`react-router-dom` is not installed). It renders only a login screen and an unstyled "Welcome" placeholder with a logout button; no dashboards, course views, or role-based interfaces exist.
- **Automated Testing:** There is **zero automated test coverage**. Both `accounts/tests.py` and `core/tests.py` are blank templates. The only test file is `test_session_login.py`, which is an interactive manual script requiring manual console input.

---

## 2. Confirmed Project Structure and Technology Stack

### 2.1 Directory Structure
```
c:\Users\Lakshmi Prasanna\Projects\lms\
├── backend\
│   ├── .env                       # Environment variables (DB credentials, etc.)
│   ├── manage.py                  # Django CLI runner
│   ├── test_session_login.py      # Manual interactive login test script
│   ├── .venv\                     # Python 3.13 Virtual Environment
│   ├── accounts\                  # Custom User model app
│   │   ├── migrations\
│   │   │   └── 0001_initial.py    # Initial migration for custom User model
│   │   ├── admin.py               # Empty (User model NOT registered)
│   │   ├── apps.py                # AccountsConfig
│   │   ├── models.py              # User(AbstractUser) with Role choices
│   │   ├── tests.py               # Empty
│   │   └── views.py               # Empty
│   ├── config\                    # Project configuration
│   │   ├── asgi.py
│   │   ├── settings.py            # Settings (DB, CORS, Middleware, Installed Apps)
│   │   ├── urls.py                # Root URLs (admin/, api/)
│   │   └── wsgi.py
│   └── core\                      # API core endpoints app
│       ├── migrations\            # No migrations
│       ├── admin.py               # Empty
│       ├── apps.py                # CoreConfig
│       ├── models.py              # Empty
│       ├── tests.py               # Empty
│       ├── urls.py                # Routes: status, csrf, login, register, logout, me
│       └── views.py               # API view implementations
└── frontend\
    ├── index.html                 # Vite HTML entry
    ├── package.json               # Frontend dependencies & scripts
    ├── vite.config.js             # Vite configuration
    ├── eslint.config.js           # ESLint configuration
    └── src\
        ├── main.jsx               # React entry point
        ├── App.jsx                # Single monolithic authentication component
        ├── App.css                # Unused boilerplate styles
        └── index.css              # Global styles
```

### 2.2 Technology Stack
- **Frontend:** React 19.3.1, React DOM 19.3.1, Vite 8.3.5, ESLint 10.13.0.
- **Backend:** Python 3.13, Django 5.2.18, Django REST Framework 3.18.3, `django-cors-headers` 4.9.0, `django-filter` 26.2, `python-dotenv` 1.2.4.
- **Database Engine:** PostgreSQL (driver: `psycopg` 3.3.6 and `psycopg-binary` 3.3.6).
- **Supporting Libraries Installed in venv:** `pillow` 13.0.0, `boto3` 1.43.120, `botocore` 1.43.120 (AWS S3 file storage ready, but unconfigured in `settings.py`).

---

## 3. Feature Status Table

| Feature / Component | Status | Location | Evidence / Notes |
| :--- | :--- | :--- | :--- |
| **CSRF Generation** | **Complete** | `backend/core/views.py` (`csrf_token`) | Returns `{ "csrfToken": token }` with CSRF cookie. |
| **Session Login** | **Complete** | `backend/core/views.py` (`session_login`) | Authenticates username/password, sets Django session cookie, responds with role & user object. |
| **Session Verification (`/me/`)** | **Complete** | `backend/core/views.py` (`session_me`) | Checks `request.user.is_authenticated`, returns user ID, username, and role. |
| **Session Logout** | **Complete** | `backend/core/views.py` (`session_logout`) | Flushes session via `django.contrib.auth.logout`. |
| **User Registration** | **Partial / Broken** | `backend/core/views.py` (`session_register`) | Functional but allows arbitrary role assignment (including `ADMIN`), allowing privilege escalation. Bypasses Django password validation. |
| **Custom User Model** | **Complete** | `backend/accounts/models.py` (`User`) | Subclasses `AbstractUser`, defines `Role` (`ADMIN`, `TRAINER`, `LEARNER`), defaults to `LEARNER`. |
| **Django Admin Integration** | **Broken** | `backend/accounts/admin.py` | `User` is not registered in `admin.py`. No admin interface exists for managing LMS users. |
| **Role-Based Access Control (RBAC)** | **Missing** | Backend / Frontend | No permission classes, decorators, or route guards restrict API access or views based on `user.role`. |
| **Frontend Authentication UI** | **Partial** | `frontend/src/App.jsx` | Renders a basic login form and welcome/logout state. Registration UI, role redirection, and session refresh logic are incomplete. |
| **Frontend Routing** | **Missing** | `frontend/package.json`, `App.jsx` | `react-router-dom` is not installed; no URL routing or nested views exist. |
| **Role-Specific Dashboards** | **Missing** | `frontend/src/` | No screens for Admin, Trainer, or Learner exist. |
| **Course & Program Management** | **Missing** | Backend & Frontend | No models, views, or endpoints exist for courses or programs. |
| **Module & Submodule Management** | **Missing** | Backend & Frontend | No models, views, or endpoints exist for modules or submodules. |
| **Learning Materials & File Uploads** | **Missing** | Backend & Frontend | No models for documents, videos, Excel, or PPT. `MEDIA_ROOT` and `MEDIA_URL` are not configured in `settings.py`. |
| **Learner Groups & Candidate Types** | **Missing** | Backend & Frontend | No models or assignment logic for candidate groups. |
| **Module Yes/No Questions** | **Missing** | Backend & Frontend | No models for question prompts or submission handling. |
| **Module Completion Enforcement** | **Missing** | Backend & Frontend | No logic to gate module completion behind question submissions. |
| **Progress & Activity Monitoring** | **Missing** | Backend & Frontend | No models or endpoints for tracking learner progress or timestamps. |
| **Trainer/Admin Reporting** | **Missing** | Backend & Frontend | No reporting services, queries, or UI. |
| **Audit History & Read-Only Locks** | **Missing** | Backend & Frontend | No versioning, change logging, or publishing lock logic. |
| **Automated Test Suite** | **Missing** | Backend & Frontend | `accounts/tests.py` and `core/tests.py` are blank. No Vitest/Jest configured on frontend. |

---

## 4. Authentication and Security Audit

### 4.1 Strengths
1. **CSRF Protection:** `@csrf_protect` decorator is applied to mutating POST endpoints (`/api/login/`, `/api/register/`, `/api/logout/`).
2. **CORS Isolation:** `CORS_ALLOWED_ORIGINS` explicitly whitelists only `http://localhost:5173` and `http://127.0.0.1:5173`, with `CORS_ALLOW_CREDENTIALS = True`.
3. **Session Cookies:** `SESSION_COOKIE_HTTPONLY = True`, `SESSION_COOKIE_SAMESITE = 'Lax'`, and `CSRF_COOKIE_SAMESITE = 'Lax'` are configured.

### 4.2 Security Deficiencies and Vulnerabilities

#### A. Critical: Role Privilege Escalation in `/api/register/`
- **Location:** `backend/core/views.py` (`session_register`)
- **Finding:** Any unauthenticated caller can send `{"username": "attacker", "password": "...", "role": "ADMIN"}`. The view extracts `role` from the request payload and directly creates an `ADMIN` user.
- **Risk:** Complete system compromise. A public user can elevate their account to `ADMIN` or `TRAINER` without restriction.
- **Remediation:** Self-registration must strictly default to `LEARNER` only. Creation of `ADMIN` or `TRAINER` accounts must be restricted to authenticated administrators via a dedicated admin API or Django admin.

#### B. High: Bypass of Django Password Validators
- **Location:** `backend/core/views.py` (`session_register`)
- **Finding:** Registration only enforces `len(password) < 6`. It completely bypasses Django's configured `AUTH_PASSWORD_VALIDATORS` (`MinimumLengthValidator` set to 8 characters, `CommonPasswordValidator`, `NumericPasswordValidator`, `UserAttributeSimilarityValidator`).
- **Remediation:** Validate passwords using `django.contrib.auth.password_validation.validate_password(password, user)`.

#### C. High: Hardcoded Secrets and Insecure Configuration in `settings.py`
- **Location:** `backend/config/settings.py` (Lines 29, 33, 34)
- **Finding:**
  - `SECRET_KEY` is hardcoded in the codebase rather than loaded from `os.getenv("SECRET_KEY")`.
  - `DEBUG = True` is hardcoded.
  - `ALLOWED_HOSTS = []` is empty.
  - In a production environment, `DEBUG=False` will immediately fail requests with `HTTP 400 Bad Request` due to empty `ALLOWED_HOSTS`.
  - `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` are missing (must be `True` under HTTPS).

#### D. Medium: Missing DRF Global Permissions
- **Location:** `backend/config/settings.py`
- **Finding:** No `REST_FRAMEWORK` configuration dictionary is defined. By default, DRF endpoints default to `AllowAny` permission unless explicitly guarded.

#### E. Medium: Separation of Django Admin vs. LMS Application Roles
- **Finding:** A user with `role = "ADMIN"` in `accounts.User` cannot log into `/admin/` unless `is_staff = True` is manually granted. In the existing database, the single user `lakshmiprasannasppw` has `is_staff = True`, but their LMS role is set to `LEARNER`. This disconnect creates role confusion between administrative portal access and LMS application domain authority.

---

## 5. Database and Migration Audit

### 5.1 Verification Commands and Findings
- **Command:** `manage.py showmigrations`
  - Result: Connected successfully to PostgreSQL database `lms_local`.
  - `accounts`: Migration `0001_initial` is applied (`[X]`).
  - `admin`, `auth`, `contenttypes`, `sessions`: All core Django migrations are applied (`[X]`).
  - `core`: `(no migrations)`.
- **Command:** `manage.py inspectdb`
  - Result: Generated schema confirmed exactly 10 tables in PostgreSQL:
    - `accounts_user`, `accounts_user_groups`, `accounts_user_user_permissions`
    - `auth_group`, `auth_group_permissions`, `auth_permission`
    - `django_admin_log`, `django_content_type`, `django_migrations`, `django_session`
  - Confirmed: **No business domain tables exist.**

### 5.2 Schema Deficiencies Against Requirements
To satisfy the People Prime LMS business requirements, the database schema must be expanded to include:
1. **Programs / Courses:** Program metadata, title, code, description, created_by, timestamps.
2. **Modules & Submodules:** Course foreign key, sequence order, title, description, estimated duration.
3. **Learning Materials:** Module foreign key, material type (`TEXT`, `IMAGE`, `VIDEO`, `EXCEL`, `PPT`), file path/URL, content text, file size, mime type, publishing status (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
4. **Candidate Types & Learner Groups:** Group name, code, target fresher profile, assigned trainer foreign key.
5. **Group Assignments:** Mapping learner groups to specific courses or modules with enrollment dates and deadlines.
6. **Module Questions:** Module foreign key, question prompt, required answer type (`YES_NO`), sequence order.
7. **Learner Question Responses:** Learner foreign key, question foreign key, response value (`YES`/`NO`), submitted timestamp.
8. **Module Completion Records:** Learner foreign key, module foreign key, completed status (Boolean), completed timestamp, verified-by (trainer/system).
9. **Audit Trail / Correction Logs:** Log of changes made to learning materials, assignments, or completed records with actor, timestamp, and before/after snapshot.

---

## 6. Business Requirements Coverage Matrix

| Requirement | Specification | Implementation Status | Gap Analysis |
| :--- | :--- | :--- | :--- |
| **Role: Admin** | Manage users, trainers, learners, content, assignments. | **Missing** | No user management API or UI. Model has role string, but no administration capabilities exist. |
| **Role: Trainer** | Manage/deliver training, monitor assigned learners. | **Missing** | No trainer dashboard, no trainer-to-learner assignment link, no progress viewing views. |
| **Role: Learner** | Access assigned training, study content, answer questions, view progress. | **Missing** | No learner portal, no course enrollment view, no content viewer, no question submission view. |
| **Training Structure** | Courses/programs, modules, submodules. | **Missing** | Zero models, endpoints, or UI components. |
| **Learning Materials** | Support text, images, videos, Excel, PPT. | **Missing** | No file handling infrastructure, no models, no media upload endpoints. |
| **Learner Groups** | Assign training to learner groups based on candidate type. | **Missing** | Candidate type classification and grouping models do not exist. |
| **Yes/No Questions** | Learners must answer required Yes/No questions after studying a module. | **Missing** | Question bank and response capture logic are completely unimplemented. |
| **Completion Gate** | Module marked complete only after required answers are submitted. | **Missing** | No completion verification workflow or business rule validation exists. |
| **Completion Tracking** | Store completion status and timestamps for Trainer/Admin tracking. | **Missing** | No tracking models or endpoints. |
| **Monitoring & Reporting** | Trainers track assigned learners; Admins have an overall view. | **Missing** | No aggregation endpoints or dashboard metrics. |
| **Read-Only / Integrity** | Prevent unauthorized editing of published materials and submitted records; audit history. | **Missing** | No state-machine controls (`DRAFT` vs `PUBLISHED`) or immutable response history. |

---

## 7. Test Commands and Actual Results

All verification commands executed cleanly and safely without modifying database state or application files:

| # | Command Executed | Context | Exit Code | Observed Output / Verification Result |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `manage.py check` | Django configuration validation | `0` | `System check identified no issues (0 silenced).` Backend code is syntactically valid. |
| 2 | `manage.py showmigrations` | Database migration check | `0` | Connected to PostgreSQL `lms_local`. `accounts.0001_initial` applied. `core` has no migrations. |
| 3 | `manage.py inspectdb` | Live database schema inspection | `0` | Confirmed 10 system/auth tables. Zero LMS domain tables exist. |
| 4 | `npm run build` | Frontend Vite production build | `0` | Built 16 modules into `dist/assets/index-ahfJJk_H.js` (222.50 kB) in 439ms. Zero build errors. |
| 5 | `npm run lint` | ESLint static code analysis | `0` | Zero lint warnings or errors. |
| 6 | `manage.py test` | Backend automated test discovery | N/A | Inspected `accounts/tests.py` and `core/tests.py`. Both files are blank (0 test cases defined). |

---

## 8. Critical Issues That Block Further Development

1. **Complete Absence of Business Domain Models:** No courses, modules, materials, questions, or completions exist in either code or database. No training workflow can proceed without this foundational schema.
2. **Privilege Escalation on User Registration (`session_register`):** Unrestricted public registration permits any user to create `ADMIN` accounts by passing `"role": "ADMIN"`.
3. **No Frontend Client-Side Routing:** The React app is currently a single component without `react-router-dom`. Building role-specific dashboards (Admin, Trainer, Learner) requires installing and configuring a routing architecture first.
4. **Django Admin Model Registration Missing:** `accounts.User` is not registered in `accounts/admin.py`, leaving the built-in Django admin interface unable to view or edit user accounts or roles.
5. **Missing Media Storage Architecture:** The business requirement demands storing and serving videos, images, Excel files, and PowerPoint presentations, but `MEDIA_ROOT` and `MEDIA_URL` are not defined in `settings.py`, and no file validation or storage strategy is implemented.

---

## 9. Other Issues, Risks, and Technical Debt

1. **Security Settings Hardcoded in `settings.py`:** `SECRET_KEY` and `DEBUG = True` are hardcoded rather than read from `.env`. `ALLOWED_HOSTS` is empty.
2. **Password Validation Bypass:** `session_register` relies on a simple character length check (`len(password) < 6`), bypassing Django's configured `AUTH_PASSWORD_VALIDATORS`.
3. **Automated Testing Debt:** Zero unit or integration tests exist in the backend. No test runner (e.g., Vitest) is set up for the frontend.
4. **State Management & API Layer in Frontend:** `App.jsx` handles raw `fetch` calls inline with duplicated CSRF acquisition logic. As features expand, a centralized API client module and state management approach are required to avoid code bloat and inconsistency.
5. **Disconnect between `is_staff` and LMS `ADMIN` role:** The relationship between Django admin access (`is_staff`) and LMS operational roles must be clearly delineated so permissions do not conflict.

---

## 10. Prioritized Implementation Roadmap

### Phase 1: Authentication Hardening, Role Authorization, and Admin Setup
- Restrict `/api/register/` to `LEARNER` accounts only, or gate administrative account creation behind authenticated admin privileges.
- Integrate Django's `validate_password` in the registration view.
- Register `accounts.User` in `accounts/admin.py` with custom list displays, filters for `role`, and user creation/change forms.
- Configure `settings.py` to pull `SECRET_KEY`, `DEBUG`, and `ALLOWED_HOSTS` from environment variables.
- Implement DRF role-based permission classes (`IsLMSAdmin`, `IsLMSTrainer`, `IsLMSLearner`).

### Phase 2: Domain Schema & Database Migrations
- Create models in `core` (or a dedicated `courses` app):
  - `Program` / `Course`
  - `Module` and `Submodule`
  - `LearningMaterial` (supporting Text, Image, Video, Excel, PPT)
  - `CandidateGroup` / `LearnerGroup`
  - `GroupEnrollment` / `CourseAssignment`
  - `ModuleQuestion` (Yes/No prompts)
  - `LearnerQuestionResponse`
  - `ModuleCompletion` (recording learner, module, status, timestamp)
  - `AuditLog`
- Configure `MEDIA_ROOT` and `MEDIA_URL` with secure upload validators for permitted file extensions.
- Generate and apply Django migrations to PostgreSQL.

### Phase 3: REST API Endpoints & Business Logic
- Course & Module CRUD endpoints with role-based write permissions (Admin/Trainer write, Learner read-only).
- Learner assignment APIs (assigning candidate groups to training modules).
- Module study & submission API:
  - Submit answers to required Yes/No questions.
  - Verification logic: automatically mark module complete **only** when all required questions have been submitted.
- Trainer tracking APIs:
  - Query assigned learners, their module status, pending activities, and completion timestamps.
- Admin oversight APIs:
  - System-wide completion statistics and user activity reports.

### Phase 4: Frontend Routing & Role-Based Portals
- Install and configure `react-router-dom`.
- Build a centralized API service module handling CSRF tokens, credentials, and error responses.
- Implement Route Guards based on `currentUser.role`.
- Develop role-specific layouts and views:
  - **Admin Portal:** User management, role assignment, course authoring, group assignments, overall reporting.
  - **Trainer Portal:** Assigned training modules, assigned learner roster, progress monitoring dashboard.
  - **Learner Portal:** Assigned courses/modules, material viewer (text, video, documents), Yes/No question submission screen, completion status indicator.

### Phase 5: Audit History, Read-Only Enforcement, and Testing
- Implement publication state machine (`DRAFT`, `PUBLISHED`, `ARCHIVED`) for courses and materials. Ensure learners can only access `PUBLISHED` content.
- Enforce immutability on submitted question responses and completion records.
- Write backend test suites covering authentication, role permissions, module completion gating, and progress queries.
- Set up frontend unit tests with Vitest for core auth and submission components.

---

## 11. Recommended Next Task

### Highest-Priority Next Step
**Task:** Harden Authentication, Fix Role Privilege Escalation, and Register the Custom User Model in Django Admin.

### Reason it Must be Completed First
Before constructing courses, modules, or candidate groups, the security foundation and user administration must be sound:
1. The privilege escalation bug currently allows any user to self-promote to `ADMIN`. Building administrative views on top of an insecure registration flow introduces severe vulnerabilities.
2. Registering `accounts.User` in Django Admin immediately enables the project owner to manage trainers, learners, and administrators via a secure, built-in interface without having to build a custom user management UI first.
3. Aligning Django's password validators ensures test and production accounts adhere to security standards.

### Exact Files Likely to be Affected
- `backend/core/views.py`: Enforce `role = User.Role.LEARNER` during public registration, or eliminate arbitrary role specification; invoke `validate_password`.
- `backend/accounts/admin.py`: Register `User` model using `django.contrib.auth.admin.UserAdmin` with custom fieldsets displaying `role`.
- `backend/config/settings.py`: Refactor `SECRET_KEY`, `DEBUG`, and `ALLOWED_HOSTS` to read securely from `.env`.

---

## 12. Acceptance Criteria for Each Phase

### Phase 1 Acceptance Criteria
- [ ] Attempting to register via `/api/register/` with `"role": "ADMIN"` either rejects the request or defaults the created user's role to `LEARNER`.
- [ ] Submitting a weak password (e.g., `12345`) to `/api/register/` returns a `400 Bad Request` with descriptive validation errors from Django's `AUTH_PASSWORD_VALIDATORS`.
- [ ] Navigating to `http://127.0.0.1:8000/admin/` allows an authorized staff user to view, edit, filter, and assign LMS roles (`ADMIN`, `TRAINER`, `LEARNER`) to users.
- [ ] `settings.py` contains no hardcoded secrets or insecure defaults when environment variables are provided.

### Phase 2 Acceptance Criteria
- [ ] Models for Courses, Modules, Materials, Learner Groups, Yes/No Questions, Responses, and Module Completions are defined in Django.
- [ ] `manage.py makemigrations` and `manage.py migrate` execute without warnings or conflicts against PostgreSQL `lms_local`.
- [ ] File uploads for permitted formats (video, image, Excel, PPT) are stored in the designated media directory and rejected if invalid.

### Phase 3 Acceptance Criteria
- [ ] Learners can only view courses and modules assigned to their candidate group.
- [ ] A learner cannot mark a module as completed without submitting answers to all required Yes/No questions.
- [ ] Submitting answers records the response and timestamps, and marks the module complete.
- [ ] An authenticated Trainer can query `/api/trainer/learners/` and receive the list of assigned learners with real-time completion status and pending items.
- [ ] Unauthenticated requests or unauthorized roles receive `401 Unauthorized` or `403 Forbidden` across all protected endpoints.

### Phase 4 Acceptance Criteria
- [ ] The React application supports clean navigation with browser URL history (`/login`, `/admin`, `/trainer`, `/learner`).
- [ ] Logging in as a `LEARNER` automatically routes the user to the Learner Portal; logging in as `TRAINER` routes to the Trainer Portal; logging in as `ADMIN` routes to the Admin Portal.
- [ ] Unauthorized URL navigation (e.g., a learner visiting `/admin`) triggers a redirect or access-denied screen.
- [ ] Learners can view learning materials and submit module questions through an intuitive, accessible UI.

### Phase 5 Acceptance Criteria
- [ ] Once published, materials cannot be altered without creating an audit record.
- [ ] Submitted question responses cannot be overwritten or deleted by learners.
- [ ] `python manage.py test` executes an automated test suite verifying all permissions, completion gates, and API responses with 100% pass rate.

