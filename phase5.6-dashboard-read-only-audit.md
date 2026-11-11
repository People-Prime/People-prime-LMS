# People Prime LMS — Phase 5.6: Admin Dashboard Read-Only Audit Report

**Date:** November 2, 2026  
**Project:** People Prime LMS  
**Workspace:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Scope:** Phase 5.6 Read-Only Audit of Admin Dashboard  
**Status:** Complete (Read-Only Inspection — No code, database records, or schema modified)

---

## 1. Executive Summary & Dashboard Architecture

The People Prime LMS Admin Dashboard serves as the central operational overview for platform administrators. Following recent changes that enabled direct, standalone Course management (decoupling courses from mandatory Programs), an audit was conducted to evaluate the accuracy, responsiveness, data integrity, and TalentLMS parity of the Admin Overview dashboard.

### Component & Endpoint Architecture

| Layer | File / Route | Responsibility |
| :--- | :--- | :--- |
| **Frontend Page** | `frontend/src/pages/AdminPortal.jsx` | Hosts top-level navigation tabs (`overview`, `curriculum`, `cohorts`, `reports`, `audit`, `users`). |
| **Frontend Tab** | `frontend/src/pages/admin/AdminOverviewTab.jsx` | Fetches and renders overview metrics (`/api/admin/reports/overview/`) and recent system activity (`/api/admin/reports/activity/`). |
| **Backend ViewSet** | `backend/core/api_views.py` (`AdminOversightViewSet`) | Implements `@action(detail=False)` endpoints: `overview()`, `progress()`, and `activity()`. |
| **Backend Serializer**| `backend/core/serializers.py` (`AdminSystemOverviewSerializer`) | Validates and serializes overview statistics into the JSON payload consumed by `AdminOverviewTab.jsx`. |

---

## 2. User Statistics Audit

### A. Role Differentiation vs. Django Staff Flags
- **Inspection Finding:** The backend endpoint `AdminOversightViewSet.overview()` directly queries the LMS custom user role field on the `User` model (`backend/accounts/models.py`):
  ```python
  total_trainers = User.objects.filter(role=User.Role.TRAINER).count()
  total_learners = User.objects.filter(role=User.Role.LEARNER).count()
  ```
- **Accuracy:** The counts strictly adhere to the domain `role` (`ADMIN`, `TRAINER`, `LEARNER`) and do **not** conflate users with Django's internal `is_staff` or `is_superuser` flags.
- **Current Database Counts (`lms_local`):**
  - **Total Admins:** `1` (`saikrishna.k@people-prime.com`, `role='ADMIN'`)
  - **Total Trainers:** `0` (`role='TRAINER'`)
  - **Total Learners:** `2` (`lakshmiprasannasppw`, `lakshmiprasannas`, both `role='LEARNER'`)
  - **Total Users:** `3`

### B. Display Gaps
1. **Missing Admin Count Card:** While the database has 1 Admin user, the dashboard displays cards only for "Total LMS Learners" and "Total LMS Trainers". There is no dedicated metric card for "Total LMS Admins" or "Total Users".
2. **Active Learners Definition:** The endpoint computes `active_learners_count` as:
   ```python
   User.objects.filter(
       role=User.Role.LEARNER,
       group_memberships__is_active=True,
       group_memberships__group__is_active=True
   ).distinct().count()
   ```
   Learners not yet assigned to an active cohort/group are classified as inactive in the overview subtitle (`0 Active Learners Enrolled`), which is mathematically accurate based on cohort assignment but may confuse administrators expecting simple user status (active vs inactive account).

---

## 3. Course Statistics & "Curriculum Programs" Card Mismatch

### A. The Discrepancy
The dashboard displays a card labeled **"Curriculum Programs"** with the value **`0`**, while its subtitle reports **`1 Courses · 1 Modules`**.

### B. Root Cause Analysis
In `AdminOverviewTab.jsx` (lines 101–105):
```jsx
<div className="stat-card">
  <div className="stat-header">Curriculum Programs</div>
  <div className="stat-value">{metrics?.total_programs ?? 0}</div>
  <div className="stat-footer">
    {metrics?.total_courses ?? 0} Courses &bull; {metrics?.total_modules ?? 0} Modules
  </div>
</div>
```
In `backend/core/api_views.py` (lines 1993–1995):
```python
total_programs = Program.objects.count()   # Result: 0 (No programs exist)
total_courses = Course.objects.count()     # Result: 1 (Course #5: Python Fundamentals)
total_modules = Module.objects.count()     # Result: 1 (Module #1: Intro)
```
- **Explanation:** Standalone courses created in Step 5.2/5.4 have `program_id = NULL`. Because direct course creation no longer requires a Program, `Program.objects.count()` is `0`.
- The primary card statistic displays `total_programs` (`0`), while the auxiliary footer lists total courses (`1`) and total modules (`1`).
- This makes the LMS look empty at a glance despite courses and modules existing in the database.

### C. Status Breakdown Gap (Draft vs. Published)
- Currently, `total_courses` counts all course records regardless of status (`Course.objects.count() = 1`).
- The database contains Course #5 (`Python Fundamentals`), which is in `DRAFT` status.
- The dashboard does not differentiate between **Published** and **Draft** courses. A TalentLMS-style overview requires visibility into whether curriculum content is live and available to learners.

---

## 4. Learner Progress Analysis

### A. System-Wide Completion Metric
In `backend/core/api_views.py` (`overview` action):
- The backend iterates over `active_learners_qs` (learners in active cohorts) and calculates the percentage of distinct assigned modules completed.
- When `total_assigned_sum == 0` (e.g. no cohorts created or no modules assigned via training assignments), it defaults to `0.0%`.
- In `AdminOverviewTab.jsx`:
  ```jsx
  <div className="stat-card">
    <div className="stat-header">Avg Learner Progress</div>
    <div className="stat-value">{metrics?.system_wide_completion_rate ?? "0.0%"}</div>
    <div className="stat-footer">{metrics?.active_learners_count ?? 0} Active Learners Enrolled</div>
  </div>
  ```

### B. Display Gaps
- **Empty State Ambiguity:** Showing `0.0%` with `0 Active Learners Enrolled` can be interpreted as 0% completion by active students rather than "No active enrollments / assignments".
- **Cohort Granularity:** The `overview` endpoint provides only a single aggregate percentage. Learner distribution counts (e.g., *Completed: 0*, *In Progress: 0*, *Not Started: 0*) are calculated in the secondary `/api/admin/reports/progress/` endpoint per cohort, but are not summarized on the primary overview tab.

---

## 5. Login & Activity Overview

### A. Existing Data Sources
1. **`User.last_login`:** Standard Django timestamp stored on `accounts_user`.
   - Inspecting `lms_local` shows verified timestamps:
     - `saikrishna.k@people-prime.com`: `2026-11-02 05:03:08.570180+00`
     - `lakshmiprasannas`: `2026-10-30 08:34:25.751680+00`
     - `lakshmiprasannasppw`: `2026-10-29 07:44:03.957640+00`
2. **`core.models.AuditLog`:**
   - Tracks governance events (`CREATE`, `UPDATE`, `DELETE`, `PUBLISH`, `ARCHIVE`, `ASSIGN`, `CORRECT`).
   - Four audit log records exist in `lms_local` capturing recent course and module creation/deletion events.
   - `/api/login/` and `/api/logout/` update Django session and `last_login`, but do **not** write an `AuditLog` row (the `AuditAction` enum currently covers curriculum and assignment domain actions, not auth events).

### B. Recent System Activity Table
- Rendered in `AdminOverviewTab.jsx` from `GET /api/admin/reports/activity/` (up to 15 records).
- Accurately displays actor name, entity type, action badge (`CREATE`, `UPDATE`, etc.), human-readable details, and localized timestamp.
- Verified working and backed by real database events.

---

## 6. Charting Capabilities & Recommendations

### A. Dependencies Audit
- Inspection of `frontend/package.json` confirms **no third-party charting libraries** are installed:
  ```json
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.5"
  }
  ```
- No Chart.js, Recharts, Victory, or Canvas libraries are present.

### B. Charting Recommendation (Lightweight CSS / SVG)
To maintain zero external bundle dependencies and avoid React 19 peer-dependency conflicts:
1. **Horizontal Progress Bars (CSS):**
   - Clean, accessible `<div className="progress-bar">` and `<div className="progress-fill" style={{ width: `${pct}%` }}>`.
   - Excellent for displaying Course Status breakdown (Published vs. Draft) and Learner Progress distribution (Completed vs. In Progress vs. Not Started).
2. **Lightweight SVG Donut / Ring Meters:**
   - Native SVG `<svg viewBox="0 0 36 36">` with `stroke-dasharray`.
   - Renders crisp circular completion meters using existing CSS custom properties (`var(--accent-primary)`, `var(--status-success)`, `var(--border-subtle)`).
   - Zero bundle overhead, responsive, and completely theme-compatible (light/dark modes).

---

## 7. Responsive Layout Evaluation

### A. Current CSS Layout (`frontend/src/App.css`)
- **Metric Grid:**
  ```css
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
    margin-bottom: 24px;
  }
  ```
- **Table Container:**
  ```css
  .table-container {
    overflow-x: auto;
    border-radius: 8px;
    background: var(--surface-card);
  }
  ```
- **Breakpoints:** Media queries at `768px` and `480px` adjust padding and header layouts.

### B. Responsive Behavior
- **Mobile (< 600px):** Cards stack gracefully into 1 or 2 columns without clipping. The activity table scrolls horizontally with a minimum width of 480px.
- **Tablet (600px – 1024px):** 2 to 3 cards per row.
- **Desktop (> 1024px):** 5 to 6 cards in a single row.

---

## 8. Summary of Findings & Next Steps

### Verified Facts
1. Standalone courses have decoupled learning from Programs; displaying "Curriculum Programs: 0" prominently when courses exist creates a misleading user experience.
2. User counts correctly filter by domain `role` and match live database records (1 Admin, 0 Trainers, 2 Learners).
3. The dashboard lacks visibility into Admin count, Total Users, and Course Publication Status (Draft vs Published).
4. No charting libraries are installed; pure CSS meters and lightweight SVGs are optimal for React 19 compatibility.

### Recommended Next Steps for Phase 5 Implementation
1. **Rename & Re-anchor Curriculum Card:**
   - Replace the primary "Curriculum Programs" card with a **"Total Courses"** card showing the total count as the primary figure (e.g. `1`), with a subtitle indicating status breakdown (e.g. `0 Published · 1 Draft · 1 Modules`).
2. **Add User Breakdown Card:**
   - Display a consolidated **"User Community"** or **"Total Users"** card showing `3 Users` with subtext `1 Admin · 0 Trainers · 2 Learners`.
3. **Enhance Completion Rate Display:**
   - When active enrollments equal 0, display a clear label such as `No Active Cohorts` instead of an ambiguous `0.0%`.
4. **Introduce Visual Progress Indicators:**
   - Use lightweight CSS horizontal bars or SVG rings for course status and module completion.

