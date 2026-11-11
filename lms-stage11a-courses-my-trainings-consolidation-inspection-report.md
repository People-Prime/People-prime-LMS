# LMS Stage 11A — Courses & My Trainings Consolidation Inspection Report

**Project:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Scope:** Architectural Inspection of Admin Portal "Courses" and "Training Files" (My Trainings) Consolidation  
**Stage Type:** Strictly Read-Only Technical Audit & Design Specification (Zero Database Writes, Zero File Modifications)  
**Execution Timestamp:** 2026-11-09 09:37:30 IST  

---

## 1. Executive Summary

This read-only inspection examines the technical architecture, data models, API endpoints, and user workflows of the two related admin sections:
1. **Courses (Curriculum):** Managed via `AdminCurriculumTab.jsx` (`/api/courses/`, `/api/modules/`, `/api/submodules/`, `/api/module-questions/`).
2. **Training Files (Repository / "My Trainings"):** Managed via `AdminFilesTab.jsx` (`/api/admin/training-files/`, `/api/admin/training-clusters/`, `/api/admin/training-file-mappings/`).

### Primary Findings:
1. **Separation of Concerns:** Courses, Modules, and Submodules represent the *instructional hierarchy* (what learners read, complete, and get tested on), while TrainingFiles, TrainingClusters, and TrainingFileMappings represent the *raw source document repository* and its logical mapping to curriculum units.
2. **Current Workflow Disconnect:** Currently, an administrator must navigate between two separate top-level sidebar items ("Courses" and "Training Files"). To map a document to a lesson or inspect a lesson's source materials, the admin must leave the Courses tab, go to Training Files, locate the cluster, and manage mappings.
3. **Safe Consolidation Path:** The consolidation does **not** require any database schema changes, migrations, or data alteration. All existing models (`TrainingFile`, `TrainingCluster`, `TrainingFileMapping`) and REST endpoints will remain completely intact. The consolidation is purely a **frontend architectural restructuring within the Courses view** that embeds material management directly into the course/module/lesson hierarchy while providing a centralized course-level materials workspace.
4. **Preservation of Repository:** All 68 raw files, 9 topic clusters, 71 mappings, and unassigned/incoming files are fully preserved.

---

## 2. Existing Courses Section Functionality

### 2.1 Component & Routing Structure
- **Sidebar Nav:** `DashboardLayout.jsx` renders `Courses` (`activeTab === 'curriculum'`).
- **Main View Component:** `AdminCurriculumTab.jsx` (~1,704 lines).
- **Sub-Tabs:** 
  - `Courses`: High-level course catalog table.
  - `Modules`: Flat list of all learning modules across all courses.

### 2.2 Core Capabilities
1. **Course Operations:**
   - List courses with Name, Code, Modules Count, Status (`DRAFT`, `PUBLISHED`, `ARCHIVED`), and action buttons.
   - Filter by status (`ALL`, `DRAFT`, `PUBLISHED`, `ARCHIVED`) and search by title/code.
   - Create and edit courses (`name`, `code`, `description`, `order`, `status`).
   - Delete courses (enforced: only `DRAFT` courses can be deleted; `PUBLISHED`/`ARCHIVED` are locked).
2. **Module Operations:**
   - Filter modules by parent course and status.
   - Create, edit, and delete modules (`name`, `code`, `description`, `course`, `order`, `estimated_duration_minutes`, `status`).
3. **Module Content Deep-Dive (Drawer / Sub-View):**
   - Clicking "Manage Content →" on any module opens an inner deep-dive view with two sub-panels:
     - **1. Submodules (Lessons):** View, order, create, edit, delete lessons (`name`, `description`, `order`, `status`).
     - **2. Questions (Assessment Gates):** View, create, edit, delete `YES_NO` and `MULTIPLE_CHOICE` assessment questions for the module.

### 2.3 Backend APIs & Models
- Models: `Course`, `Module`, `Submodule`, `ModuleQuestion` (`backend/core/models.py`).
- ViewSets: `CourseViewSet`, `ModuleViewSet`, `SubmoduleViewSet`, `ModuleQuestionViewSet` (`backend/core/api_views.py`).
- Endpoints:
  - `GET /api/courses/`, `POST /api/courses/`, `PATCH /api/courses/{id}/`, `DELETE /api/courses/{id}/`
  - `GET /api/modules/`, `POST /api/modules/`, `PATCH /api/modules/{id}/`, `DELETE /api/modules/{id}/`
  - `GET /api/submodules/`, `POST /api/submodules/`, `PATCH /api/submodules/{id}/`, `DELETE /api/submodules/{id}/`
  - `GET /api/module-questions/?module={id}`

---

## 3. Existing My Trainings (Training Files) Section Functionality

### 3.1 Component & Routing Structure
- **Sidebar Nav:** `DashboardLayout.jsx` renders `Training Files` (`activeTab === 'training-files'`).
- **Main View Component:** `AdminFilesTab.jsx` (~1,106 lines).
- **View Modes:**
  - `clusters`: "Topic Clusters & Lessons" — tree view of 9 clusters, nested modules, and mapped submodules.
  - `all-files`: "All Uploaded Files" — tabular grid of all 68 files in repository with type, size, checksum, and date.
  - `unclassified`: "Incoming / Unclassified" — files with 0 mappings or mapped to Cluster 9.

### 3.2 Core Capabilities
1. **Batch & Folder Uploads:**
   - Multi-file folder ingestion via HTML5 directory picker (`webkitdirectory="true"`).
   - Single file upload picker.
   - Client-side chunking in batches of 15 files (`BATCH_SIZE = 15`).
   - Server-side SHA-256 duplicate detection (skips existing files without failing the batch).
   - Real-time progress bar and detailed batch results summary (Uploaded / Skipped / Failed).
2. **File Formats & Validation:**
   - Supported extensions: `.pdf`, `.docx`, `.doc`, `.png`, `.jpg`, `.jpeg`, `.pptx`.
   - Size limit: 50 MB per file (`validate_learning_material_file`).
3. **Topic Clusters & Lesson Mappings:**
   - 9 Topic Clusters logically group training files according to curriculum topics.
   - Modal to attach any file to a Cluster, Module, and Submodule with a Category (`PRIMARY_INSTRUCTIONAL`, `SUPPLEMENTARY_REFERENCE`, `DOWNLOADABLE_PDF`, `IMAGE_INFOGRAPHIC`, `ASSESSMENT_RUBRIC`, `PRACTICAL_EXERCISE`, `UNCLASSIFIED`) and optional notes.
   - Detach mapping (`DELETE /api/admin/training-file-mappings/{id}/`) with explicit confirmation confirming the physical file is NOT deleted.
4. **File Inspection & Download:**
   - Streaming authenticated download via `GET /api/admin/training-files/{id}/download/`.
   - File details modal showing full path, checksum, size, and mapping count.

### 3.3 Backend APIs & Models
- Models: `TrainingFile`, `TrainingCluster`, `TrainingFileMapping` (`backend/core/models.py`).
- ViewSets: `TrainingFileViewSet`, `TrainingClusterViewSet`, `TrainingFileMappingViewSet` (`backend/core/api_views.py`).
- Endpoints:
  - `GET /api/admin/training-files/`, `POST /api/admin/training-files/upload/`, `GET /api/admin/training-files/{id}/download/`
  - `GET /api/admin/training-clusters/`
  - `GET /api/admin/training-file-mappings/`, `POST /api/admin/training-file-mappings/`, `DELETE /api/admin/training-file-mappings/{id}/`

---

## 4. Analysis of Relationships Between the Two Sections

| Relationship Dimension | Live Database & Architecture Status | Technical Analysis & Findings |
|:---|:---|:---|
| **Foreign Key Linkages** | `TrainingCluster.course -> Course`<br>`TrainingFileMapping.cluster -> TrainingCluster`<br>`TrainingFileMapping.module -> Module`<br>`TrainingFileMapping.submodule -> Submodule`<br>`TrainingFileMapping.training_file -> TrainingFile` | `TrainingFile` itself does **not** link directly to Course or Module. The association is mediated exclusively through `TrainingFileMapping`. This enables clean N:M relationships. |
| **Many-to-Many Mapping** | **Supported and Verified** | A single `TrainingFile` can be mapped to multiple lessons/modules. In the live database, 4 files are mapped to multiple lessons (e.g. File 15 mapped to Lessons 33 and 34; File 24 mapped to Lessons 22 and 24). |
| **Deletion Decoupling** | **Independent Lifecycles** | Deleting a `TrainingFileMapping` record removes only the association. The underlying `TrainingFile` record and physical file in storage remain untouched. |
| **Unmapped & Orphan Files** | **Supported** | `TrainingFile` records can exist completely unmapped (File ID 63 in live DB currently has 0 mappings). Cluster 9 (`CLUSTER-9`) serves as the designated staging area for unclassified documents. |
| **Database Schema Impact** | **ZERO SCHEMA CHANGES REQUIRED** | All foreign keys (`course`, `module`, `submodule`) already exist on `TrainingCluster` and `TrainingFileMapping`. No migrations or table alterations are needed. |

---

## 5. Proposed Unified Courses Management Architecture

### 5.1 Design Philosophy: Contextual Curriculum + Repository Access
Instead of forcing administrators to switch between "Courses" and a separate "Training Files" tab, the unified experience embeds training material workflows directly inside **Courses**, matching how curriculum designers think:

```
Courses (Admin Navigation Item)
  │
  ├── 1. Course Catalog (List of courses with progress, status, module count, materials count)
  │
  └── 2. Course Workspace (When a Course is selected)
        ├── Tab A: Overview & Details (Course metadata, description, publication controls)
        ├── Tab B: Curriculum & Lessons (Modules, Submodules/Lessons, Required Questions)
        │     └── In-line Lesson Drawer: "Attached Training Materials" (+ Attach / Detach files)
        ├── Tab C: Course Materials & Clusters (Topic Clusters, Mappings, Category tags)
        └── Tab D: Material Repository & Ingestion (Upload Folder/Batch, Staging, All Files, Unassigned Library)
```

### 5.2 Administrator User Journey in the Unified Layout

1. **Open Courses:** Administrator clicks "Courses" in the sidebar.
2. **Select Course:** Admin sees Course 6 (`IT-REC-01`), Course 5 (`Python Fundamentals`), etc., each showing module count and attached material counts. Admin clicks **"Manage Course"** or selects Course 6.
3. **View Modules & Lessons (Curriculum Tab):**
   - Admin views the 9 modules and 36 submodules.
   - When inspecting any submodule (e.g. Submodule 35 or 36), the panel displays:
     - Lesson text / description.
     - **Attached Materials list** (e.g. `18. Assessment - Recruitment Process...pdf`, `18. Assessment...docx`).
     - One-click **"+ Attach Material"** button allowing immediate association with any repository file.
     - One-click **"Detach"** button to remove mapping without affecting the file.
4. **Access Course Materials & Clusters (Materials Tab):**
   - View the 9 topic clusters scoped to this course.
   - Inspect which documents belong to each cluster and their instructional categories.
5. **Upload & Repository (Repository Tab):**
   - Direct access to folder batch upload (`webkitdirectory`) and single file upload.
   - Duplicate prevention, SHA-256 checksumming, and batch summaries.
   - **"Incoming / Unassigned Materials"** table showing files not yet mapped to any lesson (e.g. File ID 63), ensuring zero file loss.

---

## 6. Disposition of the "My Trainings" (Training Files) Navigation

### Recommendations:
1. **Sidebar Navigation Simplification:**
   - Once all functionality is embedded inside Courses, the top-level sidebar item `Training Files` in `DashboardLayout.jsx` can be deprecated or replaced with a direct link/tab inside Courses.
   - This aligns with the TalentLMS enterprise layout: **Home, Users, Courses, Groups, Reports**.
2. **Component Integration Strategy:**
   - Keep `AdminFilesTab.jsx` as a modular sub-component (or refactor into `CourseMaterialsView.jsx` and `MaterialUploadModal.jsx`) consumed by `AdminCurriculumTab.jsx`.
   - Do NOT delete any backend models, serializers, or ViewSets (`/api/admin/training-files/`, etc.). They remain the dedicated, robust engine powering training library features.
3. **Global Repository Access:**
   - Inside Courses, provide an "All Repository Files" sub-view so administrators can browse all uploaded documents across all courses without losing global repository oversight.

---

## 7. Features That Must Be Preserved (Zero Degradation)

1. **Folder & Batch Uploading:** Batch upload via `webkitdirectory`, batch chunking (15 files/batch), and progress tracking.
2. **SHA-256 Duplicate Check:** Automatic duplicate rejection based on file checksum and relative path.
3. **Secure Streaming Downloads:** Authenticated `download_file` endpoint serving binary streams with correct MIME types.
4. **N:M Lesson Mappings:** Capability for a single file to be attached to multiple submodules/modules.
5. **Categorization Taxonomy:** Preservation of all 7 categories (`PRIMARY_INSTRUCTIONAL`, `SUPPLEMENTARY_REFERENCE`, etc.).
6. **Decoupled Deletion:** Detaching a mapping never deletes the underlying `TrainingFile`.
7. **Unassigned Staging Area:** Safe visibility of files with 0 mappings (preventing orphaned/lost assets).
8. **Draft & Published State Rules:** Preserving `DRAFT` protections for Course 6, Module 9, and Submodules 35–36.

---

## 8. Risks, Dependencies & Safeguards

| Risk | Level | Technical Mitigation |
|:---|:---:|:---|
| **Data Loss during Consolidation** | **NONE** | No database changes, deletions, or data migrations are involved. The consolidation is purely UI routing and component composition. |
| **Broken File Downloads / Uploads** | **LOW** | Preserve the exact existing REST endpoints (`/api/admin/training-files/upload/`, `/api/admin/training-files/{id}/download/`). |
| **Loss of Unmapped Files** | **LOW** | The unified interface must include an explicit "Unassigned / Staging Library" tab so unmapped files (like File ID 63) remain immediately accessible. |
| **Component Bloat in AdminCurriculumTab** | **MEDIUM** | Rather than pasting 1,100 lines of `AdminFilesTab.jsx` into `AdminCurriculumTab.jsx`, compose `AdminFilesTab` or dedicated modular subcomponents (`CourseCurriculumView`, `CourseMaterialsView`, `MaterialAttachModal`). |

---

## 9. Recommended Implementation Stages (For Future Execution)

- **Stage 11B (Component Preparation & Sub-Tabs):** Refactor `AdminCurriculumTab.jsx` to introduce unified Course Workspace tabs (`Curriculum`, `Training Materials`, `Upload Repository`).
- **Stage 11C (In-Line Lesson Material Attachments):** Add attached training materials list and "+ Attach File" modal directly into the Submodule management drawer.
- **Stage 11D (Sidebar Navigation Update):** Update `DashboardLayout.jsx` and `AdminPortal.jsx` to route training material management through the unified Courses section.
- **Stage 11E (End-to-End Verification & Audit):** Verify that upload, download, cluster browsing, lesson mapping, and detachment work seamlessly from within Courses without any regressions.

---

## 10. Exact Files and Records Inspected

### Frontend Files Inspected:
- `frontend/src/components/DashboardLayout.jsx` (Sidebar navigation definitions)
- `frontend/src/pages/AdminPortal.jsx` (Tab routing and switching)
- `frontend/src/pages/admin/AdminCurriculumTab.jsx` (Courses, modules, submodules, questions)
- `frontend/src/pages/admin/AdminFilesTab.jsx` (Training files, clusters, mappings, batch uploads)

### Backend Files Inspected:
- `backend/core/models.py` (`TrainingFile`, `TrainingCluster`, `TrainingFileMapping`, `Course`, `Module`, `Submodule`)
- `backend/core/serializers.py` (`TrainingFileSerializer`, `TrainingClusterSerializer`, `TrainingFileMappingSerializer`)
- `backend/core/api_urls.py` (`courses`, `modules`, `submodules`, `admin/training-files`, `admin/training-clusters`, `admin/training-file-mappings`)
- `backend/core/api_views.py` (`CourseViewSet`, `ModuleViewSet`, `SubmoduleViewSet`, `TrainingFileViewSet`, `TrainingClusterViewSet`, `TrainingFileMappingViewSet`)

### Database Records Inspected:
- `Course` (ID `6`, Code `IT-REC-01`, Status: `DRAFT`, Assignments: `0`)
- `Course` (ID `5`, Name `Python Fundamentals`, Status: `PUBLISHED`)
- `TrainingFile` (68 total records; 1 unmapped: ID 63)
- `TrainingCluster` (9 records: Clusters 1–9)
- `TrainingFileMapping` (71 total records; 4 files mapped to multiple lessons)

---

## 11. Immutability & Safety Confirmation

- **Database Modifications:** Zero database records created, updated, or deleted.
- **Application Files Modified:** Zero application code files modified (`git diff --stat` is clean).
- **Course Statuses:** Course 6, Module 9, Submodules 35 and 36 remain in **`DRAFT`** status with **0** learner assignments.
- **Execution Mode:** Read-only inspection complete. Zero implementation work has been executed.

