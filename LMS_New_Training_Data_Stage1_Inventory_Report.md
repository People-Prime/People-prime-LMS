# LMS — New Training Dataset: Stage 1 Read-Only Local Inventory Report

**Inspection Date & Time:** 2026-11-10 18:05:00 IST  
**Project Working Directory:** `C:\Users\Lakshmi Prasanna\Projects\lms`  
**Execution Mode:** STRICTLY READ-ONLY (No files modified, extracted to source, uploaded, or transmitted)  

---

## 1. Location & Archive Identification

The specified path `D:\L&D Data - Copy.zip\L&D Data - Copy` was verified:

- **Target Analysis:**
  - `D:\L&D Data - Copy.zip` is a **valid, compressed standard ZIP archive** located on local physical volume `D:\` (File Size: **210,496,294 bytes** / **200.74 MB**).
  - Inside the root of this ZIP archive is a top-level directory named `L&D Data - Copy/`.
  - Windows file explorer paths frequently append the internal root folder to the archive name (`D:\L&D Data - Copy.zip\L&D Data - Copy`).
  - No extracted directory exists on `D:\` under the path `D:\L&D Data - Copy`.
- **Company Data Protection Compliance:**
  - The ZIP archive was inspected **strictly in-place** using Python's standard `zipfile` metadata reader.
  - Zero files were extracted into the source directory or workspace.
  - Zero network transmissions or cloud API calls were made.
  - Zero database records, schemas, migrations, or LMS source files were touched.

---

## 2. Quantitative Inventory

| Metric | Count | Details |
| :--- | :---: | :--- |
| **Total Archive Entries** | **150** | 6 directory records + 144 file records |
| **Total Directories** | **6** | Distinct folder paths within the archive |
| **Total Files** | **144** | Across 5 content subfolders |
| **Total Compressed Archive Size** | **200.74 MB** | `210,496,294 bytes` |
| **Total Uncompressed Size** | **212.59 MB** | `222,913,710 bytes` |

---

## 3. File Type & Extension Breakdown

The dataset contains an extensive collection of corporate learning documents, slide decks, training spreadsheets, visual aids, and multimedia:

| Extension | Category / Description | File Count | Total Size (Bytes) | Total Size (MB) | % of Total Files |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **`.docx`** | Microsoft Word Documents (Training texts, rubrics, guides) | **59** | 7,487,914 B | 7.14 MB | 41.0% |
| **`.pdf`** | Adobe Portable Document Format (Standardized reading & guides) | **41** | 12,329,089 B | 11.76 MB | 28.5% |
| **`.pptx`** | Microsoft PowerPoint Presentations (Modern XML slide decks) | **33** | 135,370,673 B | 129.10 MB | 22.9% |
| **`.ppt`** | Microsoft PowerPoint Legacy Presentations (Binary slide decks) | **4** | 2,884,608 B | 2.75 MB | 2.8% |
| **`.png`** | Portable Network Graphics (Diagrams, visual screening aids) | **3** | 2,848,938 B | 2.72 MB | 2.1% |
| **`.xlsx`** | Microsoft Excel Workbooks (Sourcing trackers, learning paths) | **2** | 23,035 B | 0.02 MB | 1.4% |
| **`.mp4`** | MPEG-4 Video Recording (Naukri portal sourcing tutorial) | **1** | 61,969,373 B | 59.10 MB | 0.7% |
| **`.ini`** | Windows Shell Desktop Configuration (`desktop.ini`) | **1** | 80 B | 0.00 MB | 0.7% |
| **TOTAL** | | **144** | **222,913,710 B** | **212.59 MB** | **100%** |

---

## 4. Folder Hierarchy Breakdown

The archive is organized into 5 primary content folders under the root `L&D Data - Copy/`:

```
D:\L&D Data - Copy.zip
└── L&D Data - Copy/
    ├── As for the Tracker/                       (46 files, slide decks, tracking PDFs, soft skills)
    ├── Training Material/                        (42 files, foundational recruiting DOCX modules)
    │   ├── Full Time Hiring  VS C2H/             (23 files, specialized FTE/C2H guides & PDFs)
    │   └── Images/                               (3 files, screening & JD PNG diagrams)
    └── Training Material Live - Feb 2026/        (30 files, updated Feb 2026 curriculum, BGV, video)
```

### Detailed Folder Contents:

1. **`L&D Data - Copy/As for the Tracker/` (46 files):**
   - High concentration of presentations (`.pptx`, `.ppt`): *Resdex Recruiter Productivity, Habits of Highly Effective People, Attitude, Screening Tech Resumes, Salary Negotiation, Factors Influencing Recruitment, Barriers to Communication, Telephone Etiquettes*.
   - Includes 1 configuration file (`desktop.ini`, 80 bytes).
2. **`L&D Data - Copy/Training Material/` (42 files):**
   - The foundational core of the recruitment training program.
   - Dominated by Word documents (`.docx`): *What is recruitment, Recruitment Process, HR Recruitment Comprehensive Overview, SDLC, Tech Stack, Boolean Search, CTC Breakup, Glossary, Candidate Analysis Call Script*.
3. **`L&D Data - Copy/Training Material/Full Time Hiring  VS C2H/` (23 files):**
   - Paired PDF representations of core training modules (*Email Etiquette PDF, Listening Skills PDF, Telephone Etiquette PDF, IT Skills and Domains PDF, Assertive Skills PDF, Assessment Multiple Choice PDF, Key Aspects in Contract Hiring PDF*).
4. **`L&D Data - Copy/Training Material/Images/` (3 files):**
   - High-resolution visual diagrams: `Job Description & Analysis Skills for IT Recruiters - visual selection 1.png` (1.46 MB), `selection 2.png` (1.07 MB), and `Resume Screening Areas.png` (0.32 MB).
5. **`L&D Data - Copy/Training Material Live - Feb 2026/` (30 files):**
   - Latest production iteration (dated February 2026): *About People Prime PPTX, Domestic IT Recruiter Overview, Recruitment Glossary, Naukri Sourcing Video MP4, Tracker format XLSX, Learning Path XLSX, RMS SOP, BGV Process DOCX/PDF, ChatGTP Prompts for JD Analysis*.

---

## 5. File Anomalies, Size Outliers & Zero-Byte Files

### A. Zero-Byte Files: Exactly 1 Found
- **Path:** `L&D Data - Copy/Training Material Live - Feb 2026/15. Naukari Sourcing video.docx`
- **File Size:** **0 bytes**
- **Analysis:** This appears to be a placeholder Word document accompanying the 59.10 MB video file (`15. Naukari Sourcing video.mp4`). It contains no data.

### B. Unusually Large Files (>10 MB): Exactly 2 Found
1. `L&D Data - Copy/Training Material Live - Feb 2026/15. Naukari Sourcing video.mp4`: **61,969,373 bytes (59.10 MB)** — High-definition video screen capture demonstration.
2. `L&D Data - Copy/As for the Tracker/34.Telephone Ettiquettes.pptx`: **55,424,765 bytes (52.86 MB)** — Large PowerPoint deck with embedded multimedia/audio assets.

---

## 6. Duplicate & Paired Document Analysis

Across the internal folders within the archive:
- **Exact Path Collisions:** 0 (all paths are unique).
- **Exact Filename Matches Across Different Folders:** 8 files share identical names across folders (e.g., `About People Prime.docx`, `Resume Screening Areas for IT Recruiters.pdf`, `Sample Job Description...docx`).
- **Paired Format Stems (DOCX and PDF versions):** Exactly **14 document stems** exist in both `.docx` and `.pdf` formats across the folders. For example:
  - `11. Email Etiquette and Sample IT Recruiter Email Formats - PDF` (`.docx` in Training Material, `.pdf` in Full Time Hiring VS C2H).
  - `12. Listening Skills for IT Recruiters - PDF` (`.docx` vs. `.pdf`).
  - `18. Assessment - Recruitment Process_ Multiple Choice - PDF` (`.docx` vs. `.pdf`).
  - `22. Background Verification Process (BGV)` (`.docx` vs. `.pdf` in Feb 2026 folder).

---

## 7. LMS Compatibility Assessment (Metadata Only)

1. **Alignment with Training Structure:**
   - The dataset structure clearly represents enterprise L&D IT recruitment training.
   - Topics systematically progress from:
     - *Foundations & Industry Overview* (What is Recruitment, People Prime Overview)
     - *Staffing Models* (FTE vs. Contract, C2H, Vendor Fees)
     - *Technical Literacy* (SDLC, Tech Stack, IT Domains, Infrastructure)
     - *Talent Sourcing & Boolean Logic* (JD Analysis, Boolean strings, Resdex/Naukri sourcing video)
     - *Candidate Screening & Cold Calling* (Screening areas, red flags, call scripts)
     - *Indian Compensation* (CTC break-up, PF, Gratuity, Allowances)
     - *Communication & Soft Skills* (Email/Phone etiquette, active listening, assertive skills)
     - *Offer & Lifecycle Management* (Offer decline, counter-offers, client SLAs, BGV).
2. **Current LMS File Format Support:**
   - `.docx`: **Supported** (Existing LMS converted read-only preview engine operational via `python-docx` + `PyMuPDF`).
   - `.pdf`: **Supported** (Native inline browser viewing).
   - `.png`: **Supported** (Native inline image viewing).
   - `.mp4`: **Supported** (Native inline HTML5 video streaming).
   - `.pptx` / `.ppt`: **Needs Future Attention** (Existing LMS shows "Preview unavailable for this format" for PowerPoint decks unless converted or viewed in full-page reader).
   - `.xlsx`: **Non-Visual Data** (Sourcing tracker templates).
3. **Prerequisites Prior to Any LMS Integration:**
   - **De-duplication Audit:** Resolve paired DOCX/PDF files to prevent duplicate repository uploads.
   - **Feb 2026 Fresh Content Identification:** The `Training Material Live - Feb 2026` folder contains novel assets not yet present in the LMS repository (e.g., *Background Verification Process (BGV)*, *RMS SOP*, *ChatGPT Prompts for JD Analysis*, and the *Naukri Sourcing video*).
   - **PPTX Strategy:** Determine whether PowerPoint decks will be converted to PDF previews or if DOCX/PDF versions should be prioritized for curriculum attachment.

---

## 8. Confirmation of Strict Safety Compliance

- **Original Data:** The archive `D:\L&D Data - Copy.zip` was accessed strictly in read-only mode and remains bit-for-bit identical to its original state.
- **Source Directory:** No files were extracted into `D:\` or the source location.
- **Application Code:** Zero lines of LMS frontend or backend code were modified.
- **Database:** Zero database queries writing records or modifying schema were performed.

