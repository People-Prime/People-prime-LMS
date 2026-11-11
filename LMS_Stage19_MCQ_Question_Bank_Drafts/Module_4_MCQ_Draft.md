# Course 6, Module 4: Sourcing, Boolean Logic & JD Analysis
## Interactive MCQ Question Bank Draft

**Course:** IT Recruitment Fundamentals & Industry Practices (Course ID: 6)  
**Module:** Sourcing, Boolean Logic & JD Analysis (Module ID: 5, Order: 4)  
**Total Proposed Questions:** 6  
**Question Type:** `MULTIPLE_CHOICE` (Single Answer, 4 Options)  
**Status:** DRAFT FOR REVIEW — NOT INSERTED IN DATABASE  

---

### Question 1 (Order: 1)
**Topic / Category:** Job Description (JD) Analysis: Must-Have vs. Nice-to-Have  
**Difficulty:** Easy  
**Source Lesson:** Submodule 1 (Analyzing Technical Job Descriptions) & File `4. Job Description (JD) analysis skills for an IT Recruiter.docx`  

**Question Statement:**  
Why is it essential for an IT recruiter to distinguish between "Must-Have" (mandatory) and "Nice-to-Have" (preferred) skills during technical JD analysis?

- **A.** Because must-have skills determine whether the candidate is legally allowed to work in India.
- **B.** Because must-have skills are non-negotiable core competencies required for immediate job execution, while nice-to-have skills represent secondary advantages that should not cause an otherwise qualified candidate to be rejected.
- **C.** Because nice-to-have skills determine the candidate's exact provident fund contribution percentage.
- **D.** Because recruiters should only search for candidates who possess 100% of the nice-to-have skills and ignore the core technologies.

**Correct Answer:** **B**

**Explanation:**  
- **Why B is correct:** Over-filtering for optional skills (creating "purple squirrel" searches) shrinks the available candidate talent pool. Distinguishing mandatory core technical skills from optional bonus skills enables recruiters to build accurate sourcing search strings, ensure realistic candidate matches, and optimize time-to-fill.
- **Why other options are incorrect:**  
  - *A is incorrect* because legal employment eligibility is determined by citizenship, visas, and legal statutory documents, not technical skill sets.  
  - *C is incorrect* because statutory PF deductions are calculated based on basic wage formulas, independent of skill classifications.  
  - *D is incorrect* because prioritizing optional skills over core competencies leads to unqualified candidate submissions and high rejection rates.

---

### Question 2 (Order: 2)
**Topic / Category:** Boolean Logic: Operator Fundamentals  
**Difficulty:** Medium  
**Source Lesson:** Submodule 2 (Boolean Search String Mastery: Operators, Groupings & Wildcards) & File `6. Boolean Search string for an IT role.docx`  

**Question Statement:**  
An IT recruiter wants to search a job board database for resumes that mention either `Python` or `Django` or both. Which Boolean operator must be placed between the two keywords?

- **A.** `AND`
- **B.** `NOT`
- **C.** `OR`
- **D.** `NEAR`

**Correct Answer:** **C**

**Explanation:**  
- **Why C is correct:** The `OR` operator broadens a search query by returning search results containing at least one of the specified terms (or both). It is universally used when combining synonyms, alternate skill designations, or related frameworks (e.g., `Python OR Django`).
- **Why other options are incorrect:**  
  - *A is incorrect* because `AND` narrows the search by strictly requiring both terms to be present in every single resume.  
  - *B is incorrect* because `NOT` excludes resumes that contain the subsequent term.  
  - *D is incorrect* because `NEAR` is a proximity operator specifying physical distance between words, not a logical union.

---

### Question 3 (Order: 3)
**Topic / Category:** Boolean Syntax: Exact Phrase Quotation Marks  
**Difficulty:** Easy  
**Source Lesson:** Submodule 2 (Boolean Search String Mastery) & File `6. Boolean Search string for an IT role.docx`  

**Question Statement:**  
What happens when an IT recruiter searches for multi-word phrases like `Machine Learning` or `Data Science` inside double quotation marks (`"Machine Learning"`) on job portals like Naukri or LinkedIn?

- **A.** The portal automatically deletes the search query from the recruiter's account.
- **B.** The search engine treats the words as an exact, contiguous phrase, returning only resumes where the words appear together in that exact sequence.
- **C.** The search engine translates the keywords into German or Spanish.
- **D.** The search engine converts the keywords into an exclusion (`NOT`) filter.

**Correct Answer:** **B**

**Explanation:**  
- **Why B is correct:** Enclosing multi-word technical concepts in double quotes (`""`) instructs portal search algorithms to search for the exact phrase rather than matching "Machine" on page 1 and "Learning" on page 4 in completely unrelated contexts.
- **Why other options are incorrect:**  
  - *A is incorrect* because quotes are standard, officially supported search syntax across all major ATS and job platforms.  
  - *C is incorrect* because quotes enforce phrase matching, not multilingual translation.  
  - *D is incorrect* because exclusions are handled strictly by the `NOT` or `-` operator.

---

### Question 4 (Order: 4)
**Topic / Category:** Boolean String Structuring: Parentheses Groupings  
**Difficulty:** Hard  
**Source Lesson:** Submodule 2 (Boolean Search String Mastery) & File `Online tools for Boolean search strings.docx`  

**Question Statement:**  
A recruiter needs to source a candidate who has hands-on experience in either React or Angular, AND must also know either Java or Node.js. Which Boolean string structure correctly applies operator precedence using parentheses?

- **A.** `React OR Angular AND Java OR Node.js`
- **B.** `(React OR Angular) AND (Java OR "Node.js" OR Node)`
- **C.** `React AND Angular AND Java AND Node.js`
- **D.** `NOT (React AND Angular) OR (Java AND Node.js)`

**Correct Answer:** **B**

**Explanation:**  
- **Why B is correct:** Parentheses `()` enforce algebraic grouping and operator precedence in Boolean query builders. `(React OR Angular) AND (Java OR "Node.js" OR Node)` ensures that the search engine first finds candidates with at least one frontend skill and then intersects that group with candidates possessing at least one backend skill.
- **Why other options are incorrect:**  
  - *A is incorrect* because lacking parentheses causes search engines to evaluate operators inconsistently, leading to irrelevant search results (e.g., matching someone with only React or someone with only Node.js).  
  - *C is incorrect* because chaining all terms with `AND` requires a single candidate to possess all four distinct frameworks simultaneously, excessively narrowing the candidate pool.  
  - *D is incorrect* because it uses negation (`NOT`), which actively excludes candidates with React and Angular skills.

---

### Question 5 (Order: 5)
**Topic / Category:** Boolean Logic: Exclusion Operator (`NOT`)  
**Difficulty:** Medium  
**Source Lesson:** Submodule 2 (Boolean Search String Mastery) & File `6. Boolean Search string for an IT role.docx`  

**Question Statement:**  
A client has an urgent requirement for a hands-on "Java Developer" but explicitly states they do not want candidates whose primary current role is "QA", "Tester", or "Automation Testing". Which Boolean operator should the recruiter apply to filter out testing resumes?

- **A.** `AND`
- **B.** `OR`
- **C.** `NOT`
- **D.** `LIKE`

**Correct Answer:** **C**

**Explanation:**  
- **Why C is correct:** The `NOT` (or `-` in some search portals) operator eliminates irrelevant profiles containing specified terms from the search results (e.g., `Java AND ("Spring Boot") NOT (QA OR Tester OR Testing OR "Quality Assurance")`).
- **Why other options are incorrect:**  
  - *A is incorrect* because using `AND (QA OR Tester)` would specifically mandate that candidates have testing skills.  
  - *B is incorrect* because `OR` would expand results to include anyone with testing experience.  
  - *D is incorrect* because `LIKE` is an SQL wildcard pattern operator, not a portal Boolean search operator.

---

### Question 6 (Order: 6)
**Topic / Category:** Practical JD Sourcing Workshop Scenario  
**Difficulty:** Hard  
**Source Lesson:** Submodule 4 (Practical Workshop: Analyzing Real-World IT Job Descriptions) & File `JD's For Practice.docx`  

**Question Statement:**  
A recruiter is sourcing for a "Senior Data Engineer" requisition. The JD lists the following:  
- *Mandatory:* 5+ years experience, PySpark, Python, AWS (S3, Glue, Athena or EMR), SQL.  
- *Preferred:* Snowflake, Databricks, Airflow, CI/CD.  
Candidate A has 6 years total IT experience: 4.5 years hands-on with Python, PySpark, AWS S3/Glue, and SQL, but has never used Snowflake or Airflow.  
Candidate B has 3 years of experience: knows Snowflake, Airflow, and Tableau, but has zero Python or PySpark experience.  
Which candidate is the legitimate match for profile submission to the client?

- **A.** Candidate B, because they know modern tools like Snowflake and Airflow.
- **B.** Neither candidate, because recruiters must only submit profiles with 100% of all listed keywords.
- **C.** Candidate A, because they satisfy all mandatory core technical requirements (Python, PySpark, AWS, SQL) and match the required seniority, whereas Candidate B lacks the core must-have technologies.
- **D.** Both candidates, because any candidate with data keywords can learn PySpark on the job.

**Correct Answer:** **C**

**Explanation:**  
- **Why C is correct:** Candidate A fulfills all primary mandatory competencies (Python, PySpark, AWS data stack, SQL) and matches the seniority threshold. Snowflake and Airflow are nice-to-have skills that an experienced PySpark engineer can rapidly adopt. Submitting Candidate B would lead to immediate technical rejection because they lack the core engine (PySpark/Python).
- **Why other options are incorrect:**  
  - *A is incorrect* because nice-to-have tools cannot substitute for foundational core programming and big data engine requirements.  
  - *B is incorrect* because waiting for a 100% match on every optional keyword causes severe hiring delays without adding technical value.  
  - *D is incorrect* because senior client roles require verified hands-on production experience in core stack tools, not speculative on-the-job training.

