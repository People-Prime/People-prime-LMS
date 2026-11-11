# LMS — Checkpoint 3: Module 9 Answer Key Alternative Access Security Audit Report

**Project:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Target Course:** IT Recruitment Fundamentals & Industry Practices (Course ID: `6`, Code: `IT-REC-01`)  
**Target Module:** Module 9 — Final Assessment & Certification (Module ID: `10`, Code: `MOD-9`)  
**Target Submodule:** Certification Assessment: 15 Interactive Multiple Choice Questions (Submodule ID: `35`)  
**Protected Training Files:**
- TrainingFile ID `12` – DOCX (`18. Assessment - Recruitment Process_ Multiple Choice - PDF.docx`)
- TrainingFile ID `35` – PDF (`18. Assessment - Recruitment Process_ Multiple Choice - PDF.pdf`)

**Audit Timestamp:** 2026-11-10 16:50:00 IST  
**Audit Execution Mode:** Strictly Read-Only (Zero code or database records modified)

---

## 1. Executive Summary

A comprehensive, read-only security audit was performed across the backend routing infrastructure, file-serving mechanisms, direct media URL exposure, serialization pipelines, and frontend interfaces. The objective was to verify whether unauthorized users (**Trainers** and **Learners**) or unauthenticated actors could access the protected Module 9 assessment answer-key documents (TrainingFiles `12` and `35`) through any alternate API endpoint, generic file download/preview route, or direct storage URL.

### Overall Audit Verdict: **PASS — Protection Fully Verified**
- **Zero alternative access paths** expose the protected documents to Trainers or Learners.
- Direct media file serving is **disabled at the root URL routing level** (`config/urls.py`), rendering direct physical disk paths inaccessible over HTTP.
- Administrative training file and mapping endpoints (`/api/admin/training-files/`, `/api/admin/training-file-mappings/`, `/api/admin/training-clusters/`) are protected by server-side permission classes (`IsAuthenticated`, `IsLMSAdmin`) and return HTTP `403 Forbidden` for both Learners and Trainers.
- Parameter tampering (e.g. requesting file `12` or `35` under a different submodule) is rejected server-side with HTTP `403 Forbidden`.
- All 15 interactive MCQs under Module 9 remain intact, and non-protected curriculum materials remain fully accessible to authorized users.

---

## 2. Files and Components Inspected

| Component | Path | Audit Scope |
| :--- | :--- | :--- |
| Root URL Configuration | `backend/config/urls.py` | Media serving, static handlers, top-level routes |
| API URL Router | `backend/core/urls.py`, `backend/core/api_urls.py` | All registered viewsets and paths |
| ViewSets & Endpoints | `backend/core/api_views.py` | `SubmoduleViewSet`, `TrainingFileViewSet`, `TrainingFileMappingViewSet` |
| Serializers | `backend/core/serializers.py` | `TrainingFileSerializer`, `TrainingFileMappingSerializer`, `SubmoduleSerializer` |
| Preview Conversion | `backend/core/document_preview.py` | Cache paths, PDF generation, filesystem leakage |
| Frontend Component | `frontend/src/pages/learner/LearnerCourseReader.jsx` | Materials rendering, fallback behaviors, network calls |

---

## 3. Discovered API Routes & Alternative Path Analysis

Every route registered in the LMS API was analyzed to determine whether TrainingFile `12` or `35` could be queried or streamed:

### A. Submodule Materials Endpoints (`SubmoduleViewSet`)
- `GET /api/submodules/{submodule_id}/materials/`
  - **Audit Finding:** Enforces `PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}`. For Learners and Trainers, the answer key documents are completely excluded from the JSON payload.
  - **Verdict:** **PASS**
- `GET /api/submodules/{submodule_id}/download-material/{file_id}/`
  - **Audit Finding:** Enforces server-side `user_role != User.Role.ADMIN` check. Any non-admin request targeting file ID `12` or `35` (or filename matching the answer key) immediately raises `PermissionDenied` and yields HTTP `403 Forbidden`.
  - **Cross-Submodule Parameter Tampering Check:** Tested requesting file `12` using unrelated submodules (`submodule_id=1`, `submodule_id=36`). The role-based filter intercepts the request prior to attachment mapping and returns HTTP `403 Forbidden`.
  - **Verdict:** **PASS**

### B. Admin Training Repository Endpoints (`TrainingFileViewSet`)
- `GET /api/admin/training-files/`
- `GET /api/admin/training-files/{id}/`
- `GET /api/admin/training-files/{id}/download/`
  - **Audit Finding:** Enforces `permission_classes = [IsAuthenticated, IsLMSAdmin]`. Only users with `role == 'ADMIN'` are permitted. Requests from Trainers, Learners, and unauthenticated actors return HTTP `403 Forbidden`.
  - **Verdict:** **PASS**

### C. Admin Curriculum File Mapping Endpoints (`TrainingFileMappingViewSet`)
- `GET /api/admin/training-file-mappings/`
- `GET /api/admin/training-file-mappings/?file={id}`
- `GET /api/admin/training-file-mappings/{id}/`
  - **Audit Finding:** Enforces `permission_classes = [IsAuthenticated, IsLMSAdmin]`. Trainers and Learners cannot inspect file mappings or obtain references to mapped answer-key IDs.
  - **Verdict:** **PASS**

### D. Generic / Public File Download Routes
- **Audit Finding:** Exhaustive inspection of `core/urls.py`, `core/api_urls.py`, and `config/urls.py` confirmed that **no public, generic, or unauthenticated file-download endpoints exist in the system**.
- **Verdict:** **PASS**

---

## 4. Direct Media & Storage Exposure Findings

### A. Django Static / Media URL Serving
In `backend/config/urls.py`:
```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]

# Note: Direct MEDIA_URL file serving is intentionally omitted to prevent bypassing
# the protected /api/materials/{id}/download/ authorization and entitlement endpoint.
```
- **Audit Finding:** Direct `MEDIA_URL` static serving (e.g. `django.conf.urls.static.static(settings.MEDIA_URL, ...)`) is **completely omitted**.
- **Test Executed:**
  - `GET /media/training_materials/c36c869483_18-assessment-recruitment-process_-multiple-choice-pdf.docx` → Returns **HTTP 404 Not Found**
  - `GET /media/training_materials/7f6096af5d_18-assessment-recruitment-process_-multiple-choice-pdf.pdf` → Returns **HTTP 404 Not Found**
- **Verdict:** **PASS**

### B. Serializer Exposure
In `backend/core/serializers.py`:
- Neither `CourseSerializer`, `ModuleSerializer`, nor `SubmoduleSerializer` exposes file paths, disk locations, or embedded file arrays.
- The `TrainingFileSerializer` generates download URLs pointing to `/api/admin/training-files/{id}/download/`, which is blocked for non-admins.
- **Verdict:** **PASS**

### C. DOCX Preview Cache Directory
In `backend/core/document_preview.py`:
- Generated preview PDFs are stored at `backend/media/document_previews/preview_{file_id}_{hash}.pdf`.
- Because `/media/` is not routed by Django, these generated PDFs cannot be fetched directly via HTTP without going through `download_material`.
- **Verdict:** **PASS**

---

## 5. Filename and ID Protection Findings

The protection implemented in `backend/core/api_views.py` employs defense-in-depth checks:
1. **Numeric ID Allowlist Check:** `PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}`. Directly blocks IDs `12` and `35`.
2. **Submodule Scoping:** `submodule.id == 35 and target_file_id in {12, 35}`.
3. **Filename String Matching:** `"18. Assessment - Recruitment Process_ Multiple Choice" in tf.filename`. Blocks access even if the ID were altered or re-uploaded with the same title.
- **Verdict:** **PASS**

---

## 6. Role-Based Authorization Test Results

Safe, GET-only automated probes were executed across all relevant roles:

| Access Method / Endpoint | Unauthenticated | Learner (`lakshmiprasannasppw`) | Trainer (`trainer2`) | Admin (`saikrishna.k`) | Verdict |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `GET /api/submodules/35/materials/` | 403 Forbidden | 200 OK *(files 12 & 35 hidden)* | 200 OK *(files 12 & 35 hidden)* | 200 OK *(files 12 & 35 present)* | **PASS** |
| `GET /api/submodules/35/download-material/12/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK *(inline preview served)* | **PASS** |
| `GET /api/submodules/35/download-material/35/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK *(inline preview served)* | **PASS** |
| `GET /api/admin/training-files/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK | **PASS** |
| `GET /api/admin/training-files/12/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK | **PASS** |
| `GET /api/admin/training-files/35/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK | **PASS** |
| `GET /api/admin/training-files/12/download/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK | **PASS** |
| `GET /api/admin/training-files/35/download/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK | **PASS** |
| `GET /api/admin/training-file-mappings/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK | **PASS** |
| `GET /api/admin/training-clusters/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 200 OK | **PASS** |
| Direct Media URL `/media/...12.docx` | 404 Not Found | 404 Not Found | 404 Not Found | 404 Not Found | **PASS** |
| Direct Media URL `/media/...35.pdf` | 404 Not Found | 404 Not Found | 404 Not Found | 404 Not Found | **PASS** |
| Cross-submodule Tampering `/submodules/1/.../12/` | 403 Forbidden | 403 Forbidden | 403 Forbidden | 404 Not Found *(not mapped)* | **PASS** |

---

## 7. Frontend Exposure Findings

Inspection of [`LearnerCourseReader.jsx`](file:///c:/Users/Lakshmi%20Prasanna/Projects/lms/frontend/src/pages/learner/LearnerCourseReader.jsx):
- When rendering attached materials under Submodule 35:
  - If `isAdminPreview` is false, documents `12`, `35`, and any matching `"18. Assessment - Recruitment Process_ Multiple Choice"` are filtered out from the component state before display.
  - The Learner UI displays `"No supplementary training files attached directly to this lesson."`
  - In Admin Preview mode (`isAdminPreview === true`), the administrator can view all attached files for full curriculum verification.
  - No physical URLs or disk paths are embedded in JSX or client-side assets.
- **Verdict:** **PASS**

---

## 8. Non-Regression Verification

1. **Other Submodule Materials:** Tested Submodule `1` (File `1`: `0. About People Prime.docx`) and Submodule `36` (Files `13` & `36`: Scenario Evaluation Rubric). All permitted roles (Admin, Trainer, Learner) retain full access.
2. **DOCX Preview Capability:** Operational across all other permitted DOCX documents.
3. **Assessment Integrity:** All 15 interactive MCQs under Module 9 remain in `core.ModuleQuestion`.
4. **Database Records:** Zero records altered, moved, or deleted.

---

## 9. Security Vulnerabilities Discovered

**Zero security vulnerabilities discovered.**  
No alternative bypass routes, direct media file leaks, or authorization flaws were identified.

---

## 10. Recommended Actions

None required at this time. The security boundaries are enforced server-side, reinforced by defense-in-depth frontend filtering, and verified across all roles.

---

## 11. Final Security Assessment

| Checkpoint | Scope | Status |
| :--- | :--- | :---: |
| **Checkpoint 1** | Inspection & Question Mapping | **COMPLETED** |
| **Checkpoint 2** | Implementation & Verification of Protections | **COMPLETED** |
| **Checkpoint 3** | Read-Only Alternative Access Security Audit | **PASS (100% SECURE)** |

The Module 9 MCQ answer-key documents (DOCX and PDF) are strictly isolated to LMS Administrators and are inaccessible to Learners and Trainers across all endpoints, direct URLs, and client interfaces.

