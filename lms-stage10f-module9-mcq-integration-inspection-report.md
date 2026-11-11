# LMS Stage 10F — Module 9 Interactive MCQ Integration Read-Only Inspection Report

**Project:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Course Code:** `IT-REC-01`  
**Course Title:** `IT Recruitment Fundamentals & Industry Practices` (`Course ID: 6`)  
**Target Module:** Module 9 — `Final Assessment & Certification` (`Module ID: 10`)  
**Scope:** Read-Only Architectural Inspection for 15 Interactive Multiple-Choice Questions  
**Execution Timestamp:** 2026-11-07 13:25:30 IST  
**Execution Safety Status:** Strictly Read-Only (Zero Database Writes, Zero File Edits, Zero Schema Changes)  

---

## 1. Executive Summary

This read-only inspection evaluates how the existing LMS assessment subsystem can support the 15 approved Multiple-Choice Questions (MCQs) for Module 9 (`Final Assessment & Certification`, `Module ID: 10`).

### Key Findings:
1. **Architecture Ready for Single-Answer MCQs:** The existing Django backend (`ModuleQuestion`, `ModuleAssessmentAttempt`, `ModuleQuestionResponse`) and React frontend (`LearnerCourseReader.jsx`, `AdminCurriculumTab.jsx`) fully support single-choice MCQs with 3+ options and exactly one correct answer.
2. **100% MCQ Verification:** All 15 approved questions from `TrainingFile #12` (DOCX) and `TrainingFile #35` (PDF) contain exactly four answer options and exactly one verified correct answer (`is_correct: True`).
3. **Answer Explanation Handling:** The `ModuleQuestion` database model has **no dedicated explanation column**. Furthermore, `ModuleQuestionSerializer.to_representation` explicitly sanitizes options for learners by stripping everything except `id` and `text`. As a result, explanations cannot be passed through `options` to learners without custom schema modifications. Fortunately, complete pedagogical explanations are already published to learners in the Lesson 9.1 study guide (`Submodule 35`).
4. **Retake & Attempt Engine Compatibility:** The voluntary retake engine (`POST /api/question-responses/retake/`) and attempt tracking (`ModuleAssessmentAttempt`) are fully functional and will automatically manage attempt scoring, review prerequisites (Submodules 35 and 36), and attempt history.
5. **Certification Gaps Remain:** Assessment completion records `is_completed = True` and a percentage score, but does **not** equal automated certification. Passing thresholds (`pass_mark`), certificate data models, and PDF generation do not exist in the codebase.

---

## 2. Existing Assessment System Architecture

### 2.1 Backend Implementation

#### A. Models (`backend/core/models.py`)
- **`ModuleQuestion`**:
  - `module`: `ForeignKey` to `Module` (attaches at the Module level, not Submodule).
  - `question_text`: `TextField`.
  - `question_type`: `CharField(choices=QuestionType.choices)` (`YES_NO`, `MULTIPLE_CHOICE`, `SINGLE_LINE`, `LONG_ANSWER`).
  - `options`: `JSONField(default=list)` — stores option objects: `[{"id": "opt_1", "text": "...", "is_correct": True/False}]`.
  - `order`: `PositiveIntegerField` — unique together with `module` (`UniqueTogetherValidator`).
  - `is_required`: `BooleanField` (default `True`).
  - `is_active`: `BooleanField` (default `True`).
- **`ModuleAssessmentAttempt`**:
  - `module`: `ForeignKey` to `Module`.
  - `learner`: `ForeignKey` to `User`.
  - `attempt_number`: `PositiveIntegerField` (1-indexed).
  - `score`: `FloatField` (sum of correct marks).
  - `total_possible`: `FloatField` (count of active questions).
  - `percentage`: `FloatField` (`round((score / total) * 100, 1)`).
  - `is_completed`: `BooleanField` (set to `True` when all active questions in the module are answered).
  - `started_at`, `completed_at`: `DateTimeField`.
- **`ModuleQuestionResponse`**:
  - `attempt`: `ForeignKey` to `ModuleAssessmentAttempt`.
  - `question`: `ForeignKey` to `ModuleQuestion`.
  - `learner`: `ForeignKey` to `User`.
  - `response_value`: `BooleanField` (`True` if correct, `False` if incorrect).
  - `response_payload`: `JSONField` — captures `selected_option_id`, `selected_option_text`, `is_correct`, `score`, and `total_marks`.
  - Immutability enforced: responses cannot be updated or deleted (`PUT`/`PATCH`/`DELETE` return 405/403).

#### B. Serializers (`backend/core/serializers.py`)
- **`ModuleQuestionSerializer`**:
  - Validates `MULTIPLE_CHOICE`: requires `options` array with at least 3 options, non-empty text, and **strictly one** `is_correct: True`.
  - Enforces `is_required = True`.
  - **Learner Option Sanitization (`to_representation`):** If `request.user.role == 'LEARNER'`, strips `is_correct` and outputs only `{"id": opt["id"], "text": opt["text"]}`.
- **`ModuleQuestionResponseSerializer`**:
  - Restricts submission to `LEARNER` role only.
  - Validates that `selected_option_id` matches an option in `question.options`.
  - Looks up the active `ModuleAssessmentAttempt`; automatically creates Attempt 1 if absent, or rejects if previous attempt is completed without initiating a retake.
  - Automatically scores response: `1.0` if `matched_option.is_correct` is `True`, else `0.0`.
  - Recomputes attempt aggregate score and marks `attempt.is_completed = True` when all questions are answered.

#### C. API Endpoints (`backend/core/api_urls.py` & `api_views.py`)
- `GET /api/module-questions/?module=<module_id>`: Retrieves active questions. Scoped by role (`ADMIN` sees all; `TRAINER` sees assigned draft/published; `LEARNER` sees active questions in published modules assigned to them).
- `POST /api/module-questions/`: Admin-only question creation.
- `POST /api/question-responses/`: Learner-only single question response submission.
- `POST /api/question-responses/retake/`: Starts attempt `N+1` after verifying all published submodules in the module have been opened and reviewed.
- `GET /api/question-responses/attempts/?module=<module_id>`: Returns attempt history.
- `GET /api/question-responses/retake-eligibility/?module=<module_id>`: Checks whether the learner has completed the previous attempt and reviewed all submodules.

---

### 2.2 Frontend Implementation

#### A. Admin Interface (`frontend/src/pages/admin/AdminCurriculumTab.jsx`)
- Supports adding, editing, reordering, and deleting `MULTIPLE_CHOICE` questions.
- UI provides option rows with radio buttons to toggle exactly one `is_correct` option.
- Validates option text and single-correct selection before dispatching `POST`/`PATCH /api/module-questions/`.

#### B. Learner Interface (`frontend/src/pages/learner/LearnerCourseReader.jsx`)
- Renders questions in an interactive card list below lesson submodules.
- Options rendered as radio buttons (`A.`, `B.`, `C.`, `D.`).
- "Select one answer" interaction with submission confirmation.
- Once submitted, dynamically renders:
  - Selected answer text.
  - Correct / Incorrect badge with mark breakdown (`Correct (+1 mark)` or `Incorrect (0 marks)`).
  - Attempt scorecard table showing Attempt #, Started At, Score / Total, Percentage, and Status (`Completed` / `In Progress`).
  - Retake button with prerequisite warning if submodules need re-reading.

---

## 3. Detailed Inspection of the 15 Approved MCQs

All 15 questions from `TrainingFile #12` (DOCX), `TrainingFile #35` (PDF), and `lms-stage10-module9-migration-plan.md` were verified against the backend schema rules:

| Q# | Question Text | Four Answer Options | Approved Correct Option | Source Pedagogical Explanation | Exactly 1 Correct? | LMS Model Storage Compatible? |
|:---:|:---|:---|:---|:---|:---:|:---:|
| **1** | Which of the following is the FIRST step in the recruitment process? | **A:** Conducting interviews<br>**B:** Identifying and defining the need<br>**C:** Screening applications<br>**D:** Making a job offer | **Option B** (`opt_b`) | Before any recruitment activity can begin, it's crucial to understand the specific requirements of the role, including the skills, experience, and qualifications needed. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **2** | What is a job description primarily used for? | **A:** To evaluate employee performance<br>**B:** To attract potential candidates and outline the role's responsibilities<br>**C:** To determine salary ranges<br>**D:** To track employee attendance | **Option B** (`opt_b`) | A well-written job description serves as a marketing tool to attract qualified candidates and provides a clear understanding of the job's duties and expectations. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **3** | Which of the following is an example of an internal recruitment method? | **A:** Advertising on job boards<br>**B:** Employee referrals<br>**C:** Campus recruitment<br>**D:** Using recruitment agencies | **Option B** (`opt_b`) | Internal recruitment focuses on filling vacancies with existing employees, and employee referrals are a common way to tap into the network of current staff. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **4** | What is the purpose of screening applications? | **A:** To select the best candidate for the job<br>**B:** To eliminate unqualified candidates and create a shortlist<br>**C:** To conduct background checks<br>**D:** To negotiate salary | **Option B** (`opt_b`) | Screening helps to efficiently narrow down the pool of applicants by identifying those who meet the minimum requirements for the position. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **5** | Which type of interview involves asking all candidates the same set of questions in the same order? | **A:** Unstructured interview<br>**B:** Behavioral interview<br>**C:** Structured interview<br>**D:** Panel interview | **Option C** (`opt_c`) | Structured interviews ensure consistency and fairness by using a standardized set of questions for all candidates, making it easier to compare responses. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **6** | What is the purpose of behavioral interview questions? | **A:** To assess technical skills<br>**B:** To predict future performance based on past behavior<br>**C:** To evaluate personality traits<br>**D:** To test knowledge of industry trends | **Option B** (`opt_b`) | Behavioral questions explore how candidates have handled specific situations in the past, providing insights into their skills and abilities. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **7** | Which of the following is an example of a behavioral interview question? | **A:** "What are your strengths and weaknesses?"<br>**B:** "Where do you see yourself in five years?"<br>**C:** "Tell me about a time you had to deal with a difficult customer."<br>**D:** "What is your salary expectation?" | **Option C** (`opt_c`) | This question asks the candidate to describe a specific situation, their actions, and the outcome, revealing their problem-solving and interpersonal skills. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **8** | What is a panel interview? | **A:** An interview conducted over the phone<br>**B:** An interview conducted by a group of interviewers<br>**C:** An interview that focuses on technical skills<br>**D:** An interview that is unstructured | **Option B** (`opt_b`) | Panel interviews involve multiple interviewers assessing a candidate simultaneously, providing a broader perspective and reducing individual bias. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **9** | What is a background check used for? | **A:** To verify information provided by the candidate and assess their suitability for the role<br>**B:** To determine salary expectations<br>**C:** To assess technical skills<br>**D:** To evaluate personality traits | **Option A** (`opt_a`) | Background checks help to confirm the accuracy of information provided by the candidate, such as employment history, education, and criminal records. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **10** | Which of the following is a key consideration when making a job offer? | **A:** The candidate's personal life<br>**B:** The company's budget and the candidate's expectations<br>**C:** The candidate's social media presence<br>**D:** The candidate's political views | **Option B** (`opt_b`) | A job offer should be competitive and fair, taking into account the company's financial constraints and the candidate's desired compensation and benefits. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **11** | What is onboarding? | **A:** The process of terminating an employee<br>**B:** The process of training existing employees<br>**C:** The process of integrating a new employee into the organization<br>**D:** The process of recruiting new employees | **Option C** (`opt_c`) | Onboarding helps new hires adjust to their new role, company culture, and team, ensuring a smooth transition and increased productivity. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **12** | Which of the following is a benefit of effective onboarding? | **A:** Reduced employee turnover<br>**B:** Increased recruitment costs<br>**C:** Decreased employee engagement<br>**D:** Lower productivity | **Option A** (`opt_a`) | Effective onboarding helps new hires feel welcome, supported, and prepared, leading to higher job satisfaction and retention. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **13** | What is the purpose of an exit interview? | **A:** To recruit new employees<br>**B:** To train existing employees<br>**C:** To gather feedback from departing employees<br>**D:** To conduct performance reviews | **Option C** (`opt_c`) | Exit interviews provide valuable insights into employee experiences, helping organizations identify areas for improvement and reduce future turnover. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **14** | Which of the following is a metric used to measure the effectiveness of the recruitment process? | **A:** Employee satisfaction<br>**B:** Time to fill<br>**C:** Revenue per employee<br>**D:** Customer satisfaction | **Option B** (`opt_b`) | Time to fill measures the duration it takes to fill a vacant position, indicating the efficiency of the recruitment process. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |
| **15** | What is the meaning of "Employer Branding"? | **A:** The process of creating a logo for the company<br>**B:** The company's reputation as an employer<br>**C:** The process of advertising job openings<br>**D:** The company's marketing strategy | **Option B** (`opt_b`) | Employer branding encompasses the company's image and reputation as a desirable place to work, attracting top talent. | Yes | Yes (`MULTIPLE_CHOICE`, 4 options) |

### Correct Option Distribution Verification:
- **Option A:** 2 questions (Q9, Q12)
- **Option B:** 9 questions (Q1, Q2, Q3, Q4, Q6, Q8, Q10, Q14, Q15)
- **Option C:** 4 questions (Q5, Q7, Q11, Q13)
- **Option D:** 0 questions
- **Integrity Compliance:** The approved distribution is preserved verbatim. No artificial answer-key scrambling has been performed.

---

## 4. Module 9 Integration & Security Analysis

1. **Association with Module 9 (`ID: 10`):**
   - In the LMS schema, `ModuleQuestion` records foreign-key directly to `Module` (`module_id=10`).
   - They do **not** link to Submodules (Submodules 35 and 36 deliver the reading material, while questions belong to Module 10 as a whole).
2. **Access Control & Scoping:**
   - As implemented in `api_views.py` (`_scope_module_qs`):
     - Learners can only retrieve questions for modules where `module.status == 'PUBLISHED'` **AND** the course/module is assigned to them via active `TrainingAssignment` records.
     - Because Course 6 and Module 9 are currently in **`DRAFT`** status with **0** learner assignments, learners have zero access to Module 9 questions if populated.
     - Admins can view and preview questions at any time.
3. **Isolation from Modules 1–8:**
   - `ModuleQuestion` records are filtered strictly by `module_id`. Adding questions to Module 10 has zero impact on Modules 1–8.
4. **Retake Compatibility:**
   - Retake logic checks that all published submodules under the module have been completed (`LearnerSubmoduleProgress`).
   - If Module 9 has 2 published submodules (35 and 36), a learner taking a retake will be required to review both Submodules 35 and 36 before Attempt #2 can begin.
5. **Answer Explanations Compatibility:**
   - The database model `ModuleQuestion` has **no dedicated explanation column**.
   - `ModuleQuestionSerializer.to_representation` strips all unknown option keys for learners, meaning even if `explanation` was embedded in `options: [{"id": "opt_b", "text": "...", "explanation": "..."}]`, the backend would sanitize it and omit it from the learner response.
   - **Non-Breaking Solution:** Learners receive explanations through the published Lesson 9.1 study guide (`Submodule 35`). The interactive question widget focuses purely on objective assessment.

---

## 5. Existing vs. Missing Functionality Matrix

| Capability / Feature | Status | Existing Architecture Details | Missing / Required Enhancements |
|:---|:---:|:---|:---|
| **Question Creation & Schema** | **EXISTS** | Supported via `ModuleQuestion` and Admin Curriculum modal (`MULTIPLE_CHOICE`). | None required. |
| **Single-Correct Selection** | **EXISTS** | Validated in serializer (`validate`) and admin form. | None required. |
| **Answer Explanations** | **PARTIAL** | Fully provided in Lesson 9.1 (`Submodule 35`) description. | No dedicated DB field or post-submission popup in the interactive quiz widget. |
| **Learner Assessment Display** | **EXISTS** | `LearnerCourseReader.jsx` renders options with radio inputs and order indicators. | None required. |
| **Automatic Scoring** | **EXISTS** | `ModuleQuestionResponseSerializer` automatically awards 1.0 mark per correct answer and calculates attempt percentage. | None required. |
| **Attempt History** | **EXISTS** | `ModuleAssessmentAttempt` tracks attempt number, score, total possible, percentage, and completion timestamp. | None required. |
| **Voluntary Retakes** | **EXISTS** | `POST /api/question-responses/retake/` creates Attempt `N+1` enforcing submodule review gating. | None required. |
| **Pass Mark Threshold** | **MISSING** | Attempt records percentage, but has no concept of pass/fail. | Neither `Course` nor `Module` has a `pass_mark` field. |
| **Automated Certification** | **MISSING** | Completing an assessment sets `is_completed = True`. | No `Certificate` model, PDF generation library, or public verification URL exists. |

> [!IMPORTANT]
> Assessment completion must not be conflated with certificate issuance. In the current platform, taking the 15 questions records academic attempt scores; official certification remains governed by curriculum completion policies.

---

## 6. Recommended Implementation Approach (Stage 10G)

When authorized to migrate the 15 MCQs into the database:
1. **Direct Database Ingestion via Atomic Transaction:**
   - Use a scripted Django transaction (`transaction.atomic()`).
   - Populate 15 `ModuleQuestion` records with `module_id=10`, `order=1..15`, `question_type='MULTIPLE_CHOICE'`, `is_required=True`, and `is_active=True`.
   - Store clean option dictionaries: `[{"id": "opt_a", "text": "...", "is_correct": False}, ...]`.
2. **Pre-Migration Safety Backup:**
   - Create a full timestamped JSON backup under `backend/backups/`.
3. **Preserve Draft Status:**
   - Maintain Module 9 and Course 6 in `DRAFT` status with zero learner assignments.

---

## 7. Exact Files and Records Inspected

### Application Files Inspected:
- `backend/core/models.py` (Lines 340–490: `ModuleQuestion`, `ModuleAssessmentAttempt`, `ModuleQuestionResponse`)
- `backend/core/serializers.py` (Lines 470–670: `ModuleAssessmentAttemptSerializer`, `ModuleQuestionSerializer`, `ModuleQuestionResponseSerializer`)
- `backend/core/api_urls.py` (Lines 55–60: `module-questions`, `question-responses`)
- `backend/core/api_views.py` (Lines 1190–1450: `ModuleQuestionViewSet`, `ModuleQuestionResponseViewSet`)
- `frontend/src/pages/learner/LearnerCourseReader.jsx` (Lines 580–680, 1200–1430: Assessment & Retake UI)
- `frontend/src/pages/admin/AdminCurriculumTab.jsx` (Lines 510–590, 1520–1630: Question CRUD Modal)

### Project Root Source Documents:
- `lms-stage10-module9-lesson9.1-content-draft.md`
- `lms-stage10-module9-migration-plan.md`
- `lms-stage10e-module9-content-migration-report.md`

### Database Records Inspected:
- `Course` (ID `6`, Code `IT-REC-01`, Status: `DRAFT`, Assignments: `0`)
- `Course` (ID `5`, Name `Python Fundamentals`, Status: `PUBLISHED`)
- `Module` (ID `10`, Order `9`, Status: `DRAFT`, ModuleQuestions count: `0`)
- `Submodule` (ID `35`, Status: `DRAFT`, Desc Length: `16,780` chars)
- `Submodule` (ID `36`, Status: `DRAFT`, Desc Length: `17,225` chars)
- `ModuleQuestion` (Total system count: `2` records in Module 1; `0` in Module 10)

---

## 8. Safety & Immutability Confirmation

- **Database Modifications:** Zero records created, updated, or deleted during this inspection.
- **Application Files Modified:** Zero application code files modified (`git diff --stat` is clean).
- **Migration Status:** Zero migrations run.
- **Publishing & Assignments:** Course 6 remains `DRAFT` with `0` learner assignments.

