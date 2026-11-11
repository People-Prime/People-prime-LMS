# People Prime Learning Management System (LMS)

A robust, enterprise-grade Learning Management System built for **People Prime**, featuring dedicated portals for **Learners**, **Trainers**, and **Administrators**.

---

## 🌟 Key Features

### 1. 🎓 Learner Portal
- **Level-Based Curriculum Exploration**: Sequential learning levels (Level 1, Level 2, Level 3).
- **Standalone Module Viewer**: Clean, distraction-free document viewer for course materials.
- **Strict View-Only Protection**: Learning materials (PDF, DOCX previews, images) are served with zero Save, Print, or Download options. Built-in suppression for `Ctrl+S`, `Ctrl+P`, context menus, and printing stylesheets.
- **Interactive Assessments**: 15 Multiple Choice Question (MCQ) assessment bank on certification modules with scoring, attempt history, and retake eligibility.
- **Module Feedback & Trainer Ratings**: Post-completion evaluation of module usefulness, trainer effectiveness, and learner comprehension.

### 2. 👨‍🏫 Trainer Portal
- **Course & Module Overview**: Full read-only curriculum inspection across all courses.
- **Cohort & Learner Progress Tracking**: Monitor learner module completion, score distributions, and attempt logs.
- **View-Only Content Access**: Consistent view-only access without document download or print permissions.

### 3. 🛠️ Administrator Portal
- **Curriculum Levels & Course Navigation**: Direct drill-down into Level modules with full editing, publishing, and reordering capabilities.
- **69 Standalone Modules Structure**: Restructured 1-to-1 mapping across training documents and learning modules.
- **Training Files Ingestion & Repository**: Universal material repository management with deduplication checksums.
- **Cohort & User Management**: Role-based access control (Admin, Trainer, Learner) and cohort assignments.
- **Security & Answer-Key Protection**: Strict defense-in-depth preventing unauthorized access to assessment answer keys.

---

## 🏗️ Architecture & Tech Stack

- **Backend**:
  - Python 3.10+ / Django 4.2+ / Django REST Framework
  - PostgreSQL with `psycopg2`
  - JWT Authentication (`djangorestframework-simplejwt`)
  - Local PyMuPDF / `python-docx` for on-the-fly read-only document conversions
- **Frontend**:
  - React 19 + Vite
  - React Router v7
  - Pure modern CSS with responsive design system (People Prime enterprise styling)

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10 or higher
- Node.js 18+ and npm
- PostgreSQL database server

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Run database migrations
python manage.py migrate

# Start the Django development server
python manage.py runserver 8000
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

The frontend will run at `http://localhost:5173` and proxy/connect to the backend API at `http://localhost:8000`.

---

## 🔒 Security & Material Protection

- All learning materials are served strictly with `Content-Disposition: inline`.
- Direct file download attempts (`?download=true`, `?inline=false`) return `403 Forbidden` across all endpoints for all user roles.
- Proprietary DOCX materials are converted into view-only PDF streams without exposing source binaries.
- Client-side keyboard shortcuts (`Ctrl+S`, `Cmd+S`, `Ctrl+P`, `Cmd+P`) and browser printing (@media print) are actively suppressed.
