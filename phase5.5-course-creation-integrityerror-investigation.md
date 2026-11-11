# People Prime LMS — Phase 5.5 Investigation Report
## Course Creation `IntegrityError` at `/api/courses/`

**Date:** 2026-11-02  
**Investigation Mode:** Strictly Read-Only  
**Database:** `lms_local` (PostgreSQL localhost:5432)  
**Endpoint:** `POST /api/courses/`

---

### 1. Executive Summary

When creating a standalone course with:
- **Course Name:** `test`
- **Course Code:** `1`
- **Sequence Order:** `1`
- **Publication Status:** `Draft`
- **Description:** `test course`
- **Program:** `None` (Standalone direct course)

The request triggered a Django `IntegrityError at /api/courses/`.

**Direct Cause:**
In the physical database table `core_course`, the column `program_id` still has the **`NOT NULL`** constraint (`core_course_program_id_not_null`), and the foreign key is set to `ON DELETE CASCADE`.

When the backend attempts `course = serializer.save(created_by=request.user)`, Django executes an `INSERT INTO core_course ("name", "code", "description", "order", "status", "created_by_id", "program_id", ...) VALUES ('test', '1', 'test course', 1, 'DRAFT', 3, NULL, ...)`. PostgreSQL immediately rejects the insertion with:
```text
django.db.utils.IntegrityError: null value in column "program_id" of relation "core_course" violates not-null constraint
DETAIL: Failing row contains (..., test, 1, test course, 1, DRAFT, ..., 3, null).
```

---

### 2. Evidence & Inspection Details

#### A. Database Schema Verification (`lms_local`)
Inspection of `information_schema.columns` and `pg_constraint` on `core_course`:
```text
Column: 'program_id' | is_nullable: 'NO' | data_type: 'bigint'

Constraints on core_course:
- ('core_course_program_id_not_null', 'n', 'NOT NULL program_id')
- ('core_course_program_id_c7e16f92_fk_core_program_id', 'f', 'FOREIGN KEY (program_id) REFERENCES core_program(id)')
- ('unique_course_code_per_program', 'u', 'UNIQUE (program_id, code)')
- ('unique_course_order_per_program', 'u', 'UNIQUE (program_id, "order")')
```

#### B. Migration Status (`manage.py showmigrations`)
Running `python backend/manage.py showmigrations core`:
```text
core
 [X] 0001_initial
 [ ] 0002_remove_course_unique_course_code_per_program_and_more
```
- **Finding:** Migration `0002_remove_course_unique_course_code_per_program_and_more` exists in the repository code, but has **NOT** been applied to the local PostgreSQL database `lms_local`.
- **Reason:** In Phase 5 Step 5.2 and 5.4, safety restrictions explicitly mandated:
  > *"If a migration is required, create it and verify it without applying it to the actual database unless separately authorized"* and *"Do not apply migrations to the actual database without separate authorization."*
- Consequently, while Django test suites (`manage.py test`) passed 100% because the test runner automatically applies all pending migrations to the temporary isolated test database, the running development server connected to `lms_local` was still running on the old `0001_initial` schema where `program_id` is mandatory (`NOT NULL`).

#### C. Conflicting Record Check
- Query: `SELECT count(*) FROM core_course;` returned `0`.
- There are no conflicting records in `core_course`. Course code `1` does not conflict with any existing rows.

---

### 3. Root Cause Analysis

1. **Schema Mismatch:**
   - In Django code (`models.py`, `serializers.py`): `Course.program` is `null=True, blank=True, on_delete=models.SET_NULL`.
   - In `lms_local` PostgreSQL table `core_course`: column `program_id` is `NOT NULL`.
2. **Payload Execution:**
   - The frontend sent a payload without `program` (or `program: null`).
   - DRF serializer validated successfully (since `program` is optional).
   - DRF called `serializer.save()`, executing SQL with `program_id = NULL`.
   - PostgreSQL rejected the query due to the unapplied `0002` migration.

---

### 4. Smallest Safe Fix (Awaiting User Authorization)

The migration file already exists and was generated cleanly by Django:
`backend/core/migrations/0002_remove_course_unique_course_code_per_program_and_more.py`

Inspection of `python backend/manage.py sqlmigrate core 0002` confirms the exact non-destructive SQL that will run:
```sql
ALTER TABLE "core_course" DROP CONSTRAINT "unique_course_code_per_program";
ALTER TABLE "core_course" DROP CONSTRAINT "unique_course_order_per_program";
ALTER TABLE "core_course" ALTER COLUMN "program_id" DROP NOT NULL;
ALTER TABLE "core_course" ADD CONSTRAINT "core_course_program_id_c7e16f92_fk_core_program_id" 
    FOREIGN KEY ("program_id") REFERENCES "core_program" ("id") DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX "unique_course_code_per_program" ON "core_course" ("program_id", "code") WHERE "program_id" IS NOT NULL;
CREATE UNIQUE INDEX "unique_standalone_course_code" ON "core_course" ("code") WHERE "program_id" IS NULL;
CREATE UNIQUE INDEX "unique_course_order_per_program" ON "core_course" ("program_id", "order") WHERE "program_id" IS NOT NULL;
```

**Proposed Action:**
Run:
```powershell
python backend/manage.py migrate core
```
This safely drops the `NOT NULL` constraint on `program_id` in `lms_local` without touching any other tables, columns, or user accounts.

*(Per instructions, no migration has been applied. Awaiting user authorization.)*

