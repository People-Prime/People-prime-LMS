# LMS Stage 11B — Unified Courses Workspace Implementation Plan (Refined)

**Project:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Scope:** File-by-File Implementation Plan for Consolidating Admin Courses & Training Files into a Unified Courses Workspace  
**Status:** Strictly Planning & Technical Design (Zero Application Code or Database Modifications)  
**Execution Timestamp:** 2026-11-09 09:50:30 IST  
**Source of Truth:** `lms-stage11a-courses-my-trainings-consolidation-inspection-report.md`  
**Revision:** Stage 11B.1 Refinement (Safe Testing, Universal Repository Visibility, Consistent Navigation Hierarchy)  

---

## 1. Executive Summary

This plan provides an implementation-ready roadmap to unify the Admin Portal's **Courses** (curriculum hierarchy) and **Training Files** (source documents, topic clusters, and lesson mappings) into a seamless, contextual **Courses Management Workspace**.

### Core Architecture Principles:
1. **Reuse Existing Engines Without Schema Changes:** All existing backend models (`TrainingFile`, `TrainingCluster`, `TrainingFileMapping`, `Course`, `Module`, `Submodule`) and REST ViewSets will be reused without modifying database tables or running migrations.
2. **Modular Frontend Decomposition:** Rather than copying 1,100 lines of `AdminFilesTab.jsx` into the 1,700-line `AdminCurriculumTab.jsx`, the functionality will be extracted into clean, reusable modular components under `frontend/src/pages/admin/courses/`.
3. **Contextual Access with Universal Repository Oversight:** Administrators can manage training materials directly at the Course level, Module level, and Lesson (Submodule) level, while retaining immediate, unambiguous global access to all files (whether mapped to the current course, other courses, or unassigned).
4. **Non-Destructive Testing Safety:** All testing must strictly preserve existing database records. Existing files (such as TrainingFile ID 63) and existing mappings must never be modified or detached for testing purposes.
5. **Preservation of Safety Boundaries:** Course 6, Module 9, and Submodules 35–36 remain strictly in `DRAFT` status with 0 learner assignments. No changes will touch learner/trainer portals or existing assessment engines.

---

## 2. Unified Navigation & Workspace Layout

To eliminate ambiguity, the navigation follows a strict two-level model separating the **Course Catalog** from the **Selected Course Workspace**, with three dedicated tabs inside the workspace:

```
[Courses Main Entry Point (activeTab === 'curriculum')]
  │
  ├── LEVEL 1: Course Catalog (When no course is selected)
  │     ├── High-level Course Catalog Table / Cards
  │     │     ├── Course Title, Code, Status, Modules Count, Attached Materials Count
  │     │     ├── Search by name/code and Status Filter (ALL, DRAFT, PUBLISHED, ARCHIVED)
  │     │     └── Primary Action: "Manage Course & Materials →" (Selects course and opens Level 2)
  │     ├── "+ Create Course" Modal & Course Edit/Delete (DRAFT only)
  │     └── Global Repository Shortcut: "Browse All Training Files & Staging Library"
  │
  └── LEVEL 2: Course Workspace (When a Course is selected)
        │
        ├── Workspace Header:
        │     ├── Breadcrumb: "Courses > [Course Name] ([Course Code])"
        │     ├── Status Badge (e.g. DRAFT), Modules count, Total materials count
        │     └── Action: "← Back to Course Catalog" (Deselects course, returns to Level 1)
        │
        └── Three Consistent Workspace Tabs:
              │
              ├── Tab 1: Curriculum & Lessons
              │     ├── Module list with "+ Add Module"
              │     └── Module Content Deep-Dive Drawer:
              │           ├── Sub-Tab 1A: Lessons (Submodules) with "+ Add Submodule"
              │           │     └── Inline Lesson Card / Expansion:
              │           │           ├── Lesson description & status
              │           │           ├── Attached Training Materials List (PDFs, DOCX, etc.)
              │           │           ├── "+ Attach Material" button (opens picker modal)
              │           │           └── "Detach" button (removes mapping record only)
              │           └── Sub-Tab 1B: Assessment Gates (Module Questions)
              │
              ├── Tab 2: Course Materials & Topic Clusters
              │     ├── Scoped view of Topic Clusters for this Course (e.g. Clusters 1–9)
              │     ├── Cluster Tree: Cluster > Module > Submodule > File
              │     ├── Format & Category Filters
              │     └── Direct mapping management and secure download actions
              │
              └── Tab 3: Materials Repository & Ingestion (Universal Library Access)
                    ├── Sub-View 3A: Scoped to Current Course (Files mapped to this course)
                    ├── Sub-View 3B: Unassigned & Incoming Staging (Files with 0 mappings or in Cluster 9)
                    ├── Sub-View 3C: All System Files (Universal repository view across all courses)
                    ├── Upload Actions:
                    │     ├── "Upload Training Batch (Folder)" (`webkitdirectory="true"`)
                    │     └── "Upload Single Files"
                    └── Batch Progress Bar & SHA-256 Duplicate Check Results Summary
```

---

## 3. Universal Repository Visibility Rules

Selecting a specific course must **never** hide or lock away globally stored files. The interface enforces clear visibility boundaries across Tab 3:

1. **Course-Scoped Materials (Sub-View 3A):** Displays files currently associated with the active course (via `TrainingFileMapping.cluster__course_id`).
2. **Unassigned & Incoming Staging Library (Sub-View 3B):**
   - Displays files with exactly 0 mappings across the entire LMS (e.g. File ID 63) as well as files mapped to Cluster 9 (`CLUSTER-9` Staging Cluster).
   - Prominently displays a count badge (e.g., `Unassigned (1)`).
   - Allows an administrator to easily select any unassigned file and attach it to the current course, a module, or a lesson.
3. **All System Files (Sub-View 3C):**
   - Complete tabular list of all 68 files in the repository regardless of course assignment.
   - Includes full metadata: Filename, Relative Path, Format Badge, File Size, SHA-256 Checksum, Upload Date, and Total Associated Mappings Count.
   - Enables global search (`?q=`), type filtering, and authenticated downloads.
   - Files mapped to other courses remain fully visible, downloadable, and eligible for cross-course mapping.

---

## 4. Modular Component Architecture

To maintain code health and avoid bloated files, `AdminCurriculumTab.jsx` will be decomposed into focused subcomponents under `frontend/src/pages/admin/courses/`:

```
frontend/src/pages/admin/
  ├── AdminCurriculumTab.jsx             <-- Main container & orchestrator (~350 lines)
  │
  └── courses/                           <-- Dedicated sub-package
        ├── CourseCatalogView.jsx        <-- Level 1: Catalog list, search, filters, course modal
        ├── CourseCurriculumView.jsx     <-- Level 2 Tab 1: Modules & submodules, question gates
        ├── LessonMaterialsPanel.jsx     <-- Level 2 Tab 1: Inline attached documents on submodules
        ├── CourseMaterialsView.jsx      <-- Level 2 Tab 2: Topic clusters & mapping tree
        ├── MaterialRepositoryView.jsx   <-- Level 2 Tab 3: Uploaders, batch progress, unassigned staging, all files
        └── MaterialMappingModal.jsx     <-- Modal to attach any file to cluster/module/lesson
```

### Component Breakdown:
- **`AdminCurriculumTab.jsx`**: Coordinates state: `selectedCourse` (null = Level 1 Catalog, object = Level 2 Workspace), active workspace tab (`curriculum`, `materials`, `repository`), global notifications, and shared refresh triggers.
- **`CourseCatalogView.jsx`**: Displays course cards/table, handles Course CRUD modals, and fires `onSelectCourse(course)`.
- **`CourseCurriculumView.jsx`**: Module and Submodule CRUD, module content deep-dive drawer, and embeds `LessonMaterialsPanel` inside lesson rows.
- **`LessonMaterialsPanel.jsx`**: Displays files attached to a specific `submodule.id`, category badges, download trigger, and "+ Attach Material" button.
- **`CourseMaterialsView.jsx`**: Displays the 9 topic clusters, tree expansion, and category filtering.
- **`MaterialRepositoryView.jsx`**: Houses the batch folder upload (`webkitdirectory`), single file upload, SHA-256 duplicate reporting, and sub-view switcher (`Current Course`, `Unassigned Staging`, `All System Files`).
- **`MaterialMappingModal.jsx`**: Reusable modal receiving `selectedFile`, target course clusters, modules, and submodules, submitting to `POST /api/admin/training-file-mappings/`.

---

## 5. Reusing Existing Backend APIs & Zero Database Changes

### Complete API Reuse Matrix:
| Workspace Action | Endpoint | HTTP Method | Payload / Query Params |
|:---|:---|:---:|:---|
| Fetch Courses | `/api/courses/` | `GET` | — |
| Fetch Modules | `/api/modules/` | `GET` | — |
| Fetch Submodules | `/api/submodules/` | `GET` | — |
| Fetch Questions | `/api/module-questions/?module={id}` | `GET` | `module={id}` |
| Fetch Course Clusters | `/api/admin/training-clusters/` | `GET` | Scoped by `course={id}` |
| Fetch Mappings | `/api/admin/training-file-mappings/` | `GET` | Supports `?course={id}`, `?module={id}`, `?submodule={id}` |
| Attach File to Lesson | `/api/admin/training-file-mappings/` | `POST` | `{file_id, cluster, module, submodule, category, notes}` |
| Detach File from Lesson | `/api/admin/training-file-mappings/{id}/` | `DELETE` | Removes mapping record only; physical file retained |
| Upload Folder / Files | `/api/admin/training-files/upload/` | `POST` | `multipart/form-data` with `files` and `relative_paths` |
| Stream File Download | `/api/admin/training-files/{id}/download/` | `GET` | Authenticated binary stream |
| Fetch All / Unassigned Files | `/api/admin/training-files/` | `GET` | Supports search `?q=` and type filter `?type=` |

> [!NOTE]
> All endpoints, permissions (`IsLMSAdmin`), serializers, and model constraints already exist and have been verified. Zero backend modifications or database migrations are required.

---

## 6. Comprehensive Feature & Regression Checklist

The implementation must preserve 100% of the existing capabilities verified during Stage 11A:

- [x] **Folder Uploading (`webkitdirectory="true"`):** Batch folder ingestion preserving relative paths.
- [x] **Batch Chunking:** Uploading in chunks of 15 files to prevent connection or payload timeout.
- [x] **Batch Summary & Progress Bar:** Real-time percentage indicator and summary modal (Uploaded / Skipped / Failed counters).
- [x] **Partial Failure Handling:** Individual file failures in a batch do not abort the entire batch.
- [x] **SHA-256 Duplicate Check:** Automatic duplicate rejection based on checksum and relative path.
- [x] **File Validation:** Support for `.pdf`, `.docx`, `.doc`, `.png`, `.jpg`, `.jpeg`, `.pptx` up to 50 MB.
- [x] **All 7 Mapping Categories:** `PRIMARY_INSTRUCTIONAL`, `SUPPLEMENTARY_REFERENCE`, `DOWNLOADABLE_PDF`, `IMAGE_INFOGRAPHIC`, `ASSESSMENT_RUBRIC`, `PRACTICAL_EXERCISE`, `UNCLASSIFIED`.
- [x] **Multi-Lesson Mappings:** Files can be mapped to multiple submodules/modules (e.g. Files 15, 21, 24, 27).
- [x] **Decoupled Deletion:** Detaching a mapping deletes ONLY the `TrainingFileMapping` record.
- [x] **Unassigned Staging Area:** Unmapped files (like File ID 63) remain 100% visible and assignable.
- [x] **Secure Streaming Downloads:** Authenticated `FileResponse` downloads with MIME headers.
- [x] **Search & Filters:** Search by filename/topic, filter by format and category across all views.
- [x] **Error & Loading States:** Non-blocking spinners, error banners, and dismissible alerts.
- [x] **Data Refresh:** Automatic reloading of mappings and files upon upload, attach, or detach.
- [x] **Status Integrity:** Course 6, Module 9, and Submodules 35–36 remain in `DRAFT` status with 0 learner assignments.

---

## 7. Phased Implementation Roadmap

### Stage 11C — Modular Component Architecture & Inline Lesson Materials
1. Create `frontend/src/pages/admin/courses/` directory.
2. Implement `LessonMaterialsPanel.jsx` and `MaterialMappingModal.jsx`.
3. Integrate `LessonMaterialsPanel` into the Submodule row/drawer in `AdminCurriculumTab.jsx`.
4. Verification: Read-only verification of existing attached materials (e.g. verifying that Lessons 33 and 34 show File ID 15).

### Stage 11D — Course Workspace Integration (Materials & Repository Tabs)
1. Implement `CourseCatalogView.jsx`, `CourseMaterialsView.jsx`, and `MaterialRepositoryView.jsx`.
2. Refactor `AdminCurriculumTab.jsx` to manage Level 1 (Catalog) vs. Level 2 (Selected Course Workspace).
3. Connect Tab 1 (`Curriculum`), Tab 2 (`Course Materials`), and Tab 3 (`Repository & Ingestion`).
4. Verification: Verify cluster browsing, universal repository search, and authenticated download triggers.

### Stage 11E — Sidebar Navigation Retirement & Graceful Fallback
1. Update `DashboardLayout.jsx` and `AdminPortal.jsx` to retire the standalone `training-files` tab.
2. Ensure any access to `training-files` routes directly to `curriculum` repository view.
3. Run frontend Vite production build: `npm --prefix frontend run build`.
4. Run backend automated regression tests.

### Stage 11F — Final End-to-End Audit & Verification Report
1. Verify that all 68 files, 9 clusters, and 71 mappings are intact.
2. Verify that Course 6 and Module 9 remain `DRAFT` with 0 assignments.
3. Generate `lms-stage11-consolidation-final-report.md`.

---

## 8. Safe Non-Destructive Testing Strategy

To eliminate any risk to live training assets:
1. **Zero Modification of Existing Records:**
   - Existing TrainingFiles (including File ID 63), Clusters (1–9), and Mappings (1–71) must **never** be updated, detached, or deleted for testing.
2. **Read-Only Verification for Existing Mappings:**
   - Verify existing multi-lesson attachments (e.g. File 15 on Lessons 33 & 34, File 24 on Lessons 22 & 24) purely by confirming they render accurately in the new UI components.
3. **Isolated Disposable Testing (If Write Testing Is Required):**
   - Any live write verification must use a dedicated, synthetic disposable file (e.g. `test_temp_verify.pdf`) uploaded to a designated test cluster/lesson, and cleaned up within an automated test runner or isolated staging transaction.
4. **Automated Unit Tests:**
   - Validate API endpoints using Django TestCase runner (`backend/manage.py test core.tests`).

---

## 9. Protected Areas & Immutability Confirmation

The following areas are strictly protected and will not be modified:
- Trainer Portal (`TrainerPortal.jsx`, `TrainerOverviewTab.jsx`, `TrainerLearnersTab.jsx`)
- Learner Portal (`LearnerPortal.jsx`, `LearnerCourseReader.jsx`, `LearnerCoursesTab.jsx`)
- Updated Dashboard Layout & Header User Menu (`DashboardLayout.jsx`)
- Module Feedback & Instructor Rating (`ModuleFeedbackSerializer`, `ModuleFeedbackViewSet`)
- Assessment & Retake Functionality (`ModuleAssessmentAttempt`, `ModuleQuestionResponse`)
- Course 5 (`Python Fundamentals`) and Modules 1–8 of Course 6
- Live database records of `TrainingFile`, `TrainingCluster`, and `TrainingFileMapping`

Course 6, Module 9, and Submodules 35–36 remain strictly in **`DRAFT`** status with **0** learner assignments.

*(Refined implementation plan complete. Strictly planning only. Zero application code or database records have been modified. Awaiting authorization).*
