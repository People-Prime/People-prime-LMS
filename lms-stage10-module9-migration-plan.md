# LMS Stage 10D — Module 9 Controlled Migration Plan

**Project:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Course Code:** `IT-REC-01`  
**Course Title:** `IT Recruitment Fundamentals & Industry Practices` (`Course ID: 6`)  
**Target Module:** Module 9 — Final Assessment & Certification (`Module ID: 10`)  
**Target Submodules:** Submodule 35 & Submodule 36  
**Stage Type:** Planning & Read-Only Technical Architecture Specification (Zero Database Writes)  
**Execution Timestamp:** 2026-11-07 12:55:00 IST  

---

## 1. Current Database & System State

A live read-only verification was executed across the PostgreSQL database to establish the exact baseline prior to planning:

```
Course 6: ID=6, Code=IT-REC-01, Name='IT Recruitment Fundamentals & Industry Practices', Status=DRAFT
Course 6 Learner Assignments: 0
Course 5: ID=5, Name='Python Fundamentals', Status=PUBLISHED, Modules=1
Module 9: ID=10, Order=9, Name='Final Assessment & Certification', Status=DRAFT
  Submodule 35: Order=1, Name='Certification Assessment: 15 Interactive Multiple Choice Questions', Status=DRAFT, Description Length=0 chars
  Submodule 36: Order=2, Name='Comprehensive Scenario & Technical Knowledge Evaluation Rubric (Q&A)', Status=DRAFT, Description Length=0 chars
Module 10 (Module 9) ModuleQuestion Count: 0 records
Modules 1–8: 25 populated Submodule records, all intact
```

- **Safety Compliance:** Course 6 is in `DRAFT` status with exactly `0` learner assignments. Submodules 35 and 36 are empty (`0` characters) and in `DRAFT` status. No `ModuleQuestion` records exist for Module 10.

---

## 2. Lesson Content Migration Plan

The instructional lesson content will be transferred directly from the finalized, audited Stage 10C.1 draft files into the existing `Submodule.description` database columns:

| Draft Source File | Target Submodule DB ID | Target Lesson Title | Order | Content Scope Transferred |
|:---|:---:|:---|:---:|:---|
| `lms-stage10-module9-lesson9.1-content-draft.md` (17,796 bytes) | **35** | `Certification Assessment: 15 Interactive Multiple Choice Questions` | 1 | Complete learner preparation guide, 5-column lifecycle diagram, 4-step MCQ strategy, comprehensive study guidance across all 15 question topics (without answer keys), and 14-item revision matrix. |
| `lms-stage10-module9-lesson9.2-content-draft.md` (17,231 bytes) | **36** | `Comprehensive Scenario & Technical Knowledge Evaluation Rubric (Q&A)` | 2 | Complete descriptive evaluation rubric containing all 12 questions and model answers across 4 recruitment stages, practical guidance callouts (Q8 cultural fit & Q9 red flags), transparent incomplete Q12 with editorial alert, and labeled revision checklist. |

### Transfer Mechanics & Content Preservation
1. **Verbatim Content Ingestion:** The complete markdown text from each file will be ingested into `Submodule.description`.
2. **Preserved Elements:**
   - All 15 MCQ topic guides in Lesson 9.1 remain neutral, providing conceptual preparation while strictly concealing answer keys.
   - All 12 descriptive questions and model answers in Lesson 9.2 remain intact.
   - The open-ended termination of Question 12 (`A12: Metrics to measure onboarding success include:`) is preserved verbatim along with the GitHub-style alert callout (`> [!NOTE] Editorial / Source Preservation Note`).
   - The labeled distinction between approved source text and supplementary operational guidance is maintained.
3. **Database Field Restrictions:** Only `description` and `updated_at` will be updated on the Submodule model. Submodule titles, IDs, orders, parent module foreign keys, and publication statuses (`DRAFT`) remain completely untouched.

---

## 3. Interactive MCQ Assessment Design (15 Approved Questions)

The LMS platform features an interactive assessment engine driven by `ModuleQuestion`, `ModuleAssessmentAttempt`, and `ModuleQuestionResponse`. 

Based on approved source documents `TrainingFile #12` (DOCX) and `TrainingFile #35` (PDF), the 15 Multiple-Choice Questions are mapped below with their exact source question stems, four choices, explicitly marked correct option, and pedagogical explanations:

| Q# | Source Question Stem & Lifecycle Domain | Option A | Option B | Option C | Option D | Approved Source Answer & Correct Option | Source Pedagogical Explanation |
|:---:|:---|:---|:---|:---|:---|:---|:---|
| **1** | Which of the following is the FIRST step in the recruitment process?<br>*(Requisition Initiation)* | Conducting interviews | Identifying and defining the need | Screening applications | Making a job offer | **Option B** (`opt_b`)<br>*Identifying and defining the need* | Before any recruitment activity can begin, it's crucial to understand the specific requirements of the role, including the skills, experience, and qualifications needed. |
| **2** | What is a job description primarily used for?<br>*(Role Calibration)* | To evaluate employee performance | To attract potential candidates and outline the role's responsibilities | To determine salary ranges | To track employee attendance | **Option B** (`opt_b`)<br>*To attract potential candidates and outline the role's responsibilities* | A well-written job description serves as a marketing tool to attract qualified candidates and provides a clear understanding of the job's duties and expectations. |
| **3** | Which of the following is an example of an internal recruitment method?<br>*(Talent Sourcing)* | Advertising on job boards | Employee referrals | Campus recruitment | Using recruitment agencies | **Option B** (`opt_b`)<br>*Employee referrals* | Internal recruitment focuses on filling vacancies with existing employees, and employee referrals are a common way to tap into the network of current staff. |
| **4** | What is the purpose of screening applications?<br>*(Application Validation)* | To select the best candidate for the job | To eliminate unqualified candidates and create a shortlist | To conduct background checks | To negotiate salary | **Option B** (`opt_b`)<br>*To eliminate unqualified candidates and create a shortlist* | Screening helps to efficiently narrow down the pool of applicants by identifying those who meet the minimum requirements for the position. |
| **5** | Which type of interview involves asking all candidates the same set of questions in the same order?<br>*(Interview Methodology)* | Unstructured interview | Behavioral interview | Structured interview | Panel interview | **Option C** (`opt_c`)<br>*Structured interview* | Structured interviews ensure consistency and fairness by using a standardized set of questions for all candidates, making it easier to compare responses. |
| **6** | What is the purpose of behavioral interview questions?<br>*(Performance Prediction)* | To assess technical skills | To predict future performance based on past behavior | To evaluate personality traits | To test knowledge of industry trends | **Option B** (`opt_b`)<br>*To predict future performance based on past behavior* | Behavioral questions explore how candidates have handled specific situations in the past, providing insights into their skills and abilities. |
| **7** | Which of the following is an example of a behavioral interview question?<br>*(STAR Inquiry)* | "What are your strengths and weaknesses?" | "Where do you see yourself in five years?" | "Tell me about a time you had to deal with a difficult customer." | "What is your salary expectation?" | **Option C** (`opt_c`)<br>*"Tell me about a time you had to deal with a difficult customer."* | This question asks the candidate to describe a specific situation, their actions, and the outcome, revealing their problem-solving and interpersonal skills. |
| **8** | What is a panel interview?<br>*(Collaborative Evaluation)* | An interview conducted over the phone | An interview conducted by a group of interviewers | An interview that focuses on technical skills | An interview that is unstructured | **Option B** (`opt_b`)<br>*An interview conducted by a group of interviewers* | Panel interviews involve multiple interviewers assessing a candidate simultaneously, providing a broader perspective and reducing individual bias. |
| **9** | What is a background check used for?<br>*(Risk Mitigation)* | To verify information provided by the candidate and assess their suitability for the role | To determine salary expectations | To assess technical skills | To evaluate personality traits | **Option A** (`opt_a`)<br>*To verify information provided by the candidate and assess their suitability for the role* | Background checks help to confirm the accuracy of information provided by the candidate, such as employment history, education, and criminal records. |
| **10** | Which of the following is a key consideration when making a job offer?<br>*(Offer Formulation)* | The candidate's personal life | The company's budget and the candidate's expectations | The candidate's social media presence | The candidate's political views | **Option B** (`opt_b`)<br>*The company's budget and the candidate's expectations* | A job offer should be competitive and fair, taking into account the company's financial constraints and the candidate's desired compensation and benefits. |
| **11** | What is onboarding?<br>*(Employee Assimilation)* | The process of terminating an employee | The process of training existing employees | The process of integrating a new employee into the organization | The process of recruiting new employees | **Option C** (`opt_c`)<br>*The process of integrating a new employee into the organization* | Onboarding helps new hires adjust to their new role, company culture, and team, ensuring a smooth transition and increased productivity. |
| **12** | Which of the following is a benefit of effective onboarding?<br>*(Retention Impact)* | Reduced employee turnover | Increased recruitment costs | Decreased employee engagement | Lower productivity | **Option A** (`opt_a`)<br>*Reduced employee turnover* | Effective onboarding helps new hires feel welcome, supported, and prepared, leading to higher job satisfaction and retention. |
| **13** | What is the purpose of an exit interview?<br>*(Offboarding Feedback)* | To recruit new employees | To train existing employees | To gather feedback from departing employees | To conduct performance reviews | **Option C** (`opt_c`)<br>*To gather feedback from departing employees* | Exit interviews provide valuable insights into employee experiences, helping organizations identify areas for improvement and reduce future turnover. |
| **14** | Which of the following is a metric used to measure the effectiveness of the recruitment process?<br>*(Staffing Metrics)* | Employee satisfaction | Time to fill | Revenue per employee | Customer satisfaction | **Option B** (`opt_b`)<br>*Time to fill* | Time to fill measures the duration it takes to fill a vacant position, indicating the efficiency of the recruitment process. |
| **15** | What is the meaning of "Employer Branding"?<br>*(Market Reputation)* | The process of creating a logo for the company | The company's reputation as an employer | The process of advertising job openings | The company's marketing strategy | **Option B** (`opt_b`)<br>*The company's reputation as an employer* | Employer branding encompasses the company's image and reputation as a desirable place to work, attracting top talent. |

### Technical Schema Compatibility & Limitations:
1. **Model Support:** Model `ModuleQuestion` fully supports `question_text`, `question_type='MULTIPLE_CHOICE'`, `order`, and `options` (JSON array: `[{'id': 'opt_1', 'text': '...', 'is_correct': True/False}]`).
2. **Explanation Limitation:** `ModuleQuestion` has **no dedicated explanation field** (e.g., `explanation` or `rationale`).
   - *Technical Solution:* The explanation can either be stored inside the option JSON payload (e.g., `{'id': 'opt_b', 'text': '...', 'is_correct': True, 'explanation': '...'}`) or omitted from the interactive question modal, as the full explanation is already available in the Lesson 9.1/9.2 reference documentation.
3. **Correct Option Distribution:** Across the 15 questions, the approved answer key distributes as follows:
   - **Option A:** 2 questions (Q9, Q12)
   - **Option B:** 9 questions (Q1, Q2, Q3, Q4, Q6, Q8, Q10, Q14, Q15)
   - **Option C:** 4 questions (Q5, Q7, Q11, Q13)
   - **Option D:** 0 questions
   - *Validation:* Every question has **exactly one** correct option (`is_correct: True`), strictly satisfying `ModuleQuestionSerializer.validate()`.

---

## 4. Descriptive Q&A Evaluation Design (12 Approved Questions)

### Existing LMS Architecture for `LONG_ANSWER`:
- The enum `QuestionType.LONG_ANSWER` exists in `core/models.py`.
- However, **the current question serializer and response submission view (`ModuleQuestionResponseSerializer`) strictly require `selected_option_id`** and attempt to match against `question.options`.
- **Current Limitation:** There is currently **zero backend or frontend support for free-text submission or manual trainer grading**:
  - No `trainer_score` or `graded_by` field exists on `ModuleQuestionResponse`.
  - No grading interface exists in `TrainerPortal.jsx` or `AdminCurriculumTab.jsx`.
  - Submitting a free-text response currently triggers a validation error (`"An answer must be selected"`).

### Recommended Architectural Strategy for the 12 Q&As:
1. **Instructional & Self-Evaluation Mode (Recommended for Stage 10):**
   - Ingest all 12 questions and model answers directly into **Submodule 36 (Lesson 9.2)** as an interactive reference study guide and evaluation rubric.
   - Learners study the comprehensive answers, compare their own reasoning against the model answers, and use the revision checklist to gauge competence.
   - This delivers complete pedagogical value immediately **without requiring schema changes or breaking the existing automated assessment pipeline**.
2. **Future Interactive Implementation (Requires New Code Development):**
   - If interactive submission of descriptive questions is required in the future:
     - Add `response_text` (TextField), `trainer_score` (FloatField), and `trainer_feedback` (TextField) to `ModuleQuestionResponse`.
     - Create a Trainer Grading Queue in `TrainerPortal.jsx`.
     - Implement manual review workflows where model answers remain hidden from learners until trainer evaluation is finalized.
3. **Handling Incomplete Question 12:**
   - In Submodule 36, Question 12 is preserved open-endedly with its explanatory editorial callout.
   - Under no circumstances should Question 12 be configured as an automated interactive graded question until an approved model answer is formally supplied by curriculum management.

---

## 5. Certification Policy Limitations & System Gaps

The LMS was audited to evaluate readiness for automated course certification:

| Capability | Current Status in Codebase | Analysis & Required Business Decisions |
|:---|:---:|:---|
| **Pass Mark Threshold** | **NOT IMPLEMENTED** | Neither `Course`, `Module`, nor `ModuleQuestion` has a `pass_mark` or `minimum_percentage` field. Attempts record `percentage = round((score / total) * 100, 1)` and `is_completed = True`, but there is no mechanism to determine if a score is passing or failing. |
| **Assessment Completion Gating** | **PARTIALLY IMPLEMENTED** | Attempt completion requires answering all active module questions (`is_completed = True`). However, passing Course 6 overall has no threshold logic. |
| **Retake Policies** | **IMPLEMENTED** | Voluntary retakes are fully supported via `POST /api/question-responses/retake/`. The retake policy enforces that all published submodules in the module must be reviewed before starting attempt `N+1`. |
| **Certificate Data Model** | **NOT IMPLEMENTED** | There is no `Certificate` model in `core/models.py`. Attributes such as certificate ID, issue date, expiry date, credential hash, and issuing authority do not exist. |
| **Certificate PDF Generation** | **NOT IMPLEMENTED** | No PDF rendering library (e.g. WeasyPrint or ReportLab) is integrated into `backend/`. |
| **Verification & Public Registry** | **NOT IMPLEMENTED** | No public credential verification endpoint exists in `backend/core/api_urls.py`. |

### Summary Recommendation on Certification:
Certification references in Lesson 9.1 should remain framed as **academic completion of curriculum requirements** (reviewing all 9 modules and completing the final assessment). Automated certificate issuance and threshold gating require a dedicated feature development phase.

---

## 6. Proposed Backup & Migration Execution Strategy

When authorized to execute the migration, the operation will follow a strict, multi-layer safety protocol:

### Phase A: Pre-Migration Backup (Mandatory)
1. Generate an explicit, timestamped full PostgreSQL dump:
   `python backend/manage.py dumpdata --indent 2 > backend/backups/lms_backup_stage10e_pre_migration_YYYYMMDD_HHMM.json`
2. Verify that the backup file is non-empty (>300 KB) and contains valid JSON.

### Phase B: Controlled Atomic Write Transaction
The database write will execute inside a single atomic transaction (`with transaction.atomic():`):

```python
with transaction.atomic():
    # 1. Resolve Course 6 and Module 9 dynamically
    course = Course.objects.get(code='IT-REC-01')
    module9 = Module.objects.get(course=course, order=9)
    
    # 2. Update Submodule 35 (Lesson 9.1)
    sub35 = Submodule.objects.get(module=module9, order=1)
    sub35.description = lesson9_1_content
    sub35.save(update_fields=['description', 'updated_at'])
    
    # 3. Update Submodule 36 (Lesson 9.2)
    sub36 = Submodule.objects.get(module=module9, order=2)
    sub36.description = lesson9_2_content
    sub36.save(update_fields=['description', 'updated_at'])
    
    # 4. (Optional - if approved) Ingest 15 ModuleQuestions for Module 10
    # for idx, q_data in enumerate(approved_mcqs):
    #     ModuleQuestion.objects.create(module=module9, order=idx+1, ...)
```

- **Rollback Guarantee:** If any error, character mismatch, or constraint violation occurs, the transaction automatically rolls back 100% of changes, leaving the database in its original state.

### Phase C: Post-Migration Audit
1. Query Submodules 35 and 36; confirm non-zero character counts matching the drafts.
2. Confirm both submodules remain in `DRAFT` status.
3. Confirm Course 6 remains in `DRAFT` status with `0` learner assignments.
4. Run automated backend regression tests (`core.tests.CoreLearningHierarchyTest`, `core.tests.CoreCurriculumSerializersTest`).
5. Run the frontend production build (`npm run build`).

---

## 7. Impact Analysis: Affected Files & Database Tables

### If Content-Only Migration (Submodules 35 & 36 Descriptions):
- **Database Tables Affected:** `core_submodule` only (exactly 2 rows updated: `id=35` and `id=36`, updating `description` and `updated_at`).
- **Files Affected:** `0` application code files modified.

### If Interactive MCQs Are Also Migrated (`ModuleQuestion` Population):
- **Database Tables Affected:**
  - `core_submodule`: 2 rows updated.
  - `core_modulequestion`: 15 rows inserted (linked to `module_id=10`).
- **Files Affected:** `0` application code files modified (uses existing supported `MULTIPLE_CHOICE` schema).

### What Is Strictly Unaffected:
- Course 5 (`Python Fundamentals`) and Modules 1–8.
- `TrainingFile`, `TrainingCluster`, and `TrainingFileMapping` tables.
- Frontend source files, routes, and components.
- Backend models, migrations, views, and serializers.

---

## 8. Risks, Dependencies & Decisions Requiring Approval

1. **Decision 1: Migration Scope (Submodule Descriptions vs. Interactive MCQs):**
   - *Option A (Content Only):* Populate Submodules 35 and 36 descriptions only. Learners study the full guides in the Course Reader.
   - *Option B (Full Migration - Recommended):* Populate Submodules 35 and 36 descriptions **AND** populate the 15 approved MCQs into `ModuleQuestion` for Module 10 so learners can take the interactive assessment.
2. **Decision 2: Interactive MCQ Explanations:**
   - Because `ModuleQuestion` has no dedicated `explanation` column, should the pedagogical explanations be stored inside the option JSON dictionary (`{'id': 'opt_b', 'text': '...', 'is_correct': True, 'explanation': '...'}`), or omitted from the question model since they already appear in the Lesson 9.1 study guide?
3. **Decision 3: Descriptive Q&A Format:**
   - Confirm that the 12 descriptive Q&As will be delivered as an instructional study and evaluation rubric in Submodule 36 (Lesson 9.2), without attempting unsupported free-text interactive grading.

---

## 9. Final Planning Outcome

# **READY FOR CONTROLLED MIGRATION**

The technical plan is fully specified, the data models are verified, the source documents and answer keys are cross-checked, and the atomic transaction safeguards are in place. Migration can proceed immediately upon user selection of Decision 1 (Content-Only vs. Content + Interactive MCQs).

*(Planning complete. Zero database writes, zero file edits, and zero migrations have been executed. Awaiting instructions).*

