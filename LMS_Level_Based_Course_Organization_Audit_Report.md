# LMS Level-Based Course Organization — Technical Audit & Impact Analysis Report

**Date:** November 10, 2026  
**Project:** People Prime LMS (`C:\Users\Lakshmi Prasanna\Projects\lms`)  
**Mode:** Strictly Read-Only Audit & Architectural Impact Analysis  
**Status:** Completed (No code or database modifications made)

---

## Executive Summary

The organization has requested simplifying the Learner Portal course experience by organizing modules into **Levels** (`Level 1`, `Level 2`, and `Level 3` initially, with `Level 3` having 0 modules), while providing the Admin Portal with the capability to dynamically add further levels (`Level 4`, etc.) as needed. Additionally, learners should navigate directly into module instructional content without submodule intermediaries.

This audit analyzed the LMS database models, Django REST Framework viewsets/APIs, frontend components (`LearnerCoursesTab`, `LearnerCourseReader`, `AdminCurriculumTab`), and assessment/feedback flows.

### Key Conclusions:
1. **Zero Data Destruction:** The current architecture allows seamless addition of a `CourseLevel` model and an optional foreign key on `core.Module` (`level_id`) with zero data loss and full backward compatibility.
2. **Submodules Preserved Under the Hood:** Modules currently store lesson text and file associations across 34 submodules. In the Learner Portal, submodules can be seamlessly consolidated into a direct module view or rendered without submodule list/navigation overhead, while preserving all database records and satisfying retake eligibility criteria automatically.
3. **Admin Portal Naming Intact:** The section name **"Manage Courses"** in the Admin Portal remains untouched (not renamed to "Manage Levels"). Admin can configure levels, create new levels dynamically, and assign modules to levels via intuitive controls.
4. **Assessments & Progress Untouched:** MCQs (`ModuleQuestion`), assessment attempts (`ModuleAssessmentAttempt`), scoring, retakes, and feedback (`ModuleFeedback`) are already scoped directly to `Module` at the database level. They are completely independent of Level organization and remain 100% operational.

---

## 1. Current LMS Architecture Audit

### 1.1 Course, Module, and Submodule Hierarchy
The active database state for Course 6 (`IT Recruitment Fundamentals & Industry Practices` / `IT-REC-01`):

| Hierarchy Tier | Entity Model | Total Records | Role & Storage Details |
|---|---|---|---|
| **Course** | `core.Course` | 1 active (`id=6`) | Top-level container. Fields: `id`, `name`, `code`, `description`, `order`, `status`, `created_by`. |
| **Cluster** | `core.TrainingCluster` | 9 active (`id=1..9`) | Course 6 clusters (`CLUSTER-1` through `CLUSTER-9`). Currently used exclusively for repository file tagging (`TrainingFileMapping`), not general module level grouping. |
| **Module** | `core.Module` | 9 active (`id=2..10`) | Course modules (Modules 1 to 9). Fields: `id`, `course_id`, `name`, `code`, `description`, `order`, `estimated_duration_minutes`, `status`, `created_by`. Currently has **no level foreign key or level field**. |
| **Submodule** | `core.Submodule` | 34 active records | Sub-units of modules (e.g. 3 to 5 submodules per module). Fields: `id`, `module_id`, `name`, `description`, `order`, `status`. Contains markdown lesson content in `description`. |
| **File Mapping** | `core.TrainingFileMapping` | 35 mappings | Maps `training_file` to `cluster`, optional `module`, and optional `submodule`. |
| **Assessment** | `core.ModuleQuestion` | 15 active (Module 9) | Questions scoped directly to `module_id`. Completely independent of submodules. |
| **Feedback** | `core.ModuleFeedback` | Scoped to Module | Student feedback scoped directly to `module_id`. |

### 1.2 Learner Portal Flow (As-Is)
1. **Entry (`LearnerCoursesTab.jsx`):** Fetches `/api/courses/`. Renders a card for Course 6.
2. **Clicking Course:** Routes to `/learner/reader?courseId=6`.
3. **Reader Layout (`LearnerCourseReader.jsx`):**
   - Left Sidebar: Lists all 9 Modules with a badge showing submodule counts (`modSubCount = submodules.filter(s => s.module === mod.id).length`).
   - Center Panel: When a module is selected, displays the module header and a vertical card list of all submodules belonging to that module.
   - Clicking a Submodule: Opens `activeViewingSubmodule` full-page reader with lesson markdown and attached materials.
   - Retake Gating: Checks `LearnerSubmoduleProgress` records for every submodule under the module before permitting retake attempts.

### 1.3 Admin Portal Flow (As-Is)
1. **Entry Navigation:** Sidebar navigation label is **Manage Courses** (`activeTab === 'curriculum'`).
2. **View (`AdminCurriculumTab.jsx` / `CourseCurriculumView.jsx`):**
   - Course overview and metadata cards.
   - Modules Table: Shows module order, name, code, duration, status, and action buttons.
   - Submodules Table: Displays submodules per module with Add/Edit submodule modals.
   - Assessment Gates: Displays MCQs and assessment configuration for the selected module.

---

## 2. Gap Analysis for Level-Based Organization

| Company Requirement | Current Implementation | Gap / Required Addition |
|---|---|---|
| **Learner Courses shows Level cards (Level 1, 2, 3)** | Shows single Course card ("IT Recruitment...") | Needs to render Level cards with name and module counts instead of top-level course card. |
| **Initial levels: Level 1, 2, 3 (Level 3 has 0 modules)** | No level entity exists in DB | Need default `CourseLevel` records seeded for Course 6. |
| **Dynamic Level Creation in Admin Portal** | No level CRUD exists | Admin requires API and modal/form to create new levels (`POST /api/course-levels/`). |
| **Admin Manage Courses preserves section name** | Section is named **Manage Courses** | Retain exact section name; add level management tabs or level assignment controls within Manage Courses. |
| **Module Assignment to Levels** | Modules only have `course_id` | Add nullable `level` Foreign Key (`level_id`) to `core.Module`. |
| **Learner clicks Module $\rightarrow$ direct content, NO submodules** | Reader forces submodule selection to see lesson text | Reader directly presents the module's unified instructional content and materials without listing or requiring navigation through submodules. |
| **Preserve Retakes & Assessment Eligibility** | Checks submodule review count for retakes | Unified module view automatically logs review progress so retake eligibility is preserved seamlessly. |

---

## 3. Recommended Architectural Design

### 3.1 Database Layer (Clean, Relational & Backward Compatible)

#### New Model: `CourseLevel` in `backend/core/models.py`
```python
class CourseLevel(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='levels')
    name = models.CharField(max_length=100) # e.g. "Level 1", "Level 2", "Level 3"
    order = models.PositiveIntegerField(default=1)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_course_level'
        ordering = ['order', 'id']
        unique_together = [['course', 'name']]

    def __str__(self):
        return f"{self.course.code} - {self.name}"
```

#### Field Addition to `core.Module`
```python
class Module(models.Model):
    # existing fields: course, name, code, description, order, estimated_duration_minutes, status, created_by...
    level = models.ForeignKey(
        CourseLevel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='modules'
    )
```

**Why this design?**
- `null=True, blank=True` ensures zero disruption to existing database rows or queries.
- `on_delete=models.SET_NULL` prevents accidental module deletion if an empty level is deleted.
- Supports unlimited levels per course dynamically.
- `level.modules.count()` instantly provides exact module counts.

### 3.2 Dynamic Level Creation & Management (Admin Portal)
- **API Endpoints:**
  - `GET /api/course-levels/?course_id=6` $\rightarrow$ Lists all levels for Course 6 with `module_count`.
  - `POST /api/course-levels/` $\rightarrow$ Admin creates a new level (`name`, `order`, `description`).
  - `PATCH /api/course-levels/{id}/` $\rightarrow$ Admin renames or reorders levels.
  - `DELETE /api/course-levels/{id}/` $\rightarrow$ Admin deletes an empty level.
  - `PATCH /api/modules/{id}/` $\rightarrow$ Admin assigns or reassigns `level_id`.
- **Admin UI within "Manage Courses":**
  - Section name remains **Manage Courses**.
  - A Level filter/tabs bar (e.g. `All`, `Level 1`, `Level 2`, `Level 3`, `+ Add Level`).
  - A "+ Create New Level" button opens a lightweight modal to add Level 4, Level 5, etc.
  - Module cards or rows include a simple Level selector dropdown allowing instantaneous assignment without breaking any curriculum data.

### 3.3 Direct Module Access Without Submodules (Learner Portal)
- **Learner View Hierarchy:**
  1. **Courses Section:** Learner sees Level cards:
     - **Level 1** — X Modules
     - **Level 2** — Y Modules
     - **Level 3** — 0 Modules
     - *(Any admin-created levels)*
  2. **Level Detail View:** Clicking a level reveals the list of modules assigned to that level (displaying title, code, description, duration, and assessment status).
  3. **Direct Module Content Viewer:** Clicking a module opens the module reader directly:
     - No submodule selector, no submodule badges, no submodule navigation hierarchy.
     - The reader combines the instructional content of the module (rendered cleanly with markdown and embedded materials).
     - Gating / Retakes: The backend endpoint or reader automatically marks progress for retake prerequisites when the module is reviewed, ensuring assessment retakes operate smoothly.

---

## 4. Impact Analysis on Existing Systems

| Subsystem | Impact | Risk Level | Mitigation / Preservation Strategy |
|---|---|---|---|
| **Assessment Questions (`ModuleQuestion`)** | **None** | Zero | Questions are linked to `Module.id`. Level changes do not touch assessment schemas. |
| **Assessment Attempts (`ModuleAssessmentAttempt`)** | **None** | Zero | Attempts are linked to `(Module.id, Learner.id)`. Completely decoupled from levels. |
| **Assessment Retakes & Scoring** | **None** | Zero | Retake logic checks `ModuleAssessmentAttempt.attempt_number` and score thresholds. Unaffected. |
| **Student Feedback (`ModuleFeedback`)** | **None** | Zero | Feedback is linked to `Module.id`. Unaffected. |
| **Trainer Portal** | **None** | Low | Trainer curriculum view can display modules grouped by level or preserve existing module list. |
| **Submodule Database Records** | **None** | Zero | All 34 submodule records remain intact in database. Only the presentation layer bypasses submodule hierarchy. |

---

## 5. Files Requiring Modification (Upon Approval)

### Backend
1. `backend/core/models.py` — Add `CourseLevel` model and `Module.level` foreign key.
2. `backend/core/serializers.py` — Add `CourseLevelSerializer`; add `level_id` and `level_name` to `ModuleSerializer`.
3. `backend/core/views.py` (or viewsets) — Add `CourseLevelViewSet` with standard CRUD permissions (IsAdmin for write, authenticated for read).
4. `backend/core/urls.py` — Register `router.register(r'course-levels', CourseLevelViewSet)`.
5. Django Migration script — Auto-generated clean migration to create `core_course_level` and add `level_id` column to `core_module`.

### Frontend
1. `frontend/src/api/client.js` (or course api helper) — Add `courseLevelsAPI` helper functions.
2. `frontend/src/pages/learner/LearnerCoursesTab.jsx` — Render Level cards (Level 1, Level 2, Level 3) with module counts; clicking shows level's modules.
3. `frontend/src/pages/learner/LearnerCourseReader.jsx` — Streamline reader to display direct module content without exposing submodule lists or requiring submodule drilldown.
4. `frontend/src/pages/admin/AdminCurriculumTab.jsx` — Maintain **Manage Courses** header; add Level management controls, "+ Add Level" modal, and level assignment dropdowns for modules.

---

## 6. Verification and Rollout Plan

Once formal approval is received from the user, implementation will follow these steps:
1. **Migration & Seeding:** Run Django migration to create `CourseLevel` and default records:
   - `Level 1` (order 1)
   - `Level 2` (order 2)
   - `Level 3` (order 3, 0 modules initially)
2. **Backend API Testing:** Verify `GET /api/course-levels/` returns levels with accurate `modules_count`, and `POST` creates dynamic levels.
3. **Admin Module Assignment:** Enable Admin to assign modules to levels (no random assignments; manager will assign modules).
4. **Learner Portal UI:** Implement Level cards $\rightarrow$ Level modules $\rightarrow$ Direct module content reader.
5. **Regression Verification:** Run complete test suite (`ModuleQuestionAndResponseAPITest`, file permissions, retakes, Vite frontend build).

