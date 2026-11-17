import os
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import (
    CandidateType,
    Course,
    CourseLevel,
    LearnerGroup,
    Module,
    PublicationStatus,
    Submodule,
    TrainingAssignment,
    TrainingCluster,
    TrainingFile,
    TrainingFileMapping,
)

User = get_user_model()


class LearnerMaterialsSecurityTests(TestCase):
    """
    Test suite for Learner Materials access and security restrictions:
    1. Assigned learner can list attached materials for their published submodule.
    2. Assigned learner can download the legitimate attached material.
    3. Unassigned learner cannot list materials or download attached files (404/403).
    4. Learner cannot download a file that is not mapped to the submodule (404).
    5. Draft submodule materials are not exposed to learners (404).
    6. Admin-only endpoints (/api/admin/training-files/) remain forbidden to learners (403).
    7. No server filesystem paths are exposed in API responses.
    """

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username="admin_mat",
            email="admin_mat@example.com",
            password="pass",
            role=User.Role.ADMIN,
        )

        self.assigned_learner = User.objects.create_user(
            username="assigned_learner_mat",
            email="assigned_mat@example.com",
            password="pass",
            role=User.Role.LEARNER,
        )

        self.unassigned_learner = User.objects.create_user(
            username="unassigned_learner_mat",
            email="unassigned_mat@example.com",
            password="pass",
            role=User.Role.LEARNER,
        )

        # Create published course hierarchy
        self.course = Course.objects.create(
            name="Recruitment Mastery",
            code="REC-MAT-1",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin,
        )
        self.level = CourseLevel.objects.create(
            name="Level 1",
            course=self.course,
            order=1,
        )
        self.module = Module.objects.create(
            course=self.course,
            level=self.level,
            name="Module A",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )
        self.submodule = Submodule.objects.create(
            module=self.module,
            name="Lesson 1",
            order=1,
            status=PublicationStatus.PUBLISHED,
            description="## Lesson 1\nLearning content goes here.",
        )

        # Create physical test training file with valid DOCX structure
        import docx, io
        docx_obj = docx.Document()
        docx_obj.add_heading("Recruitment Training Guide", level=1)
        docx_obj.add_paragraph("Comprehensive overview of full-time and contract hiring.")
        table = docx_obj.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "Category"
        table.cell(0, 1).text = "Details"
        table.cell(1, 0).text = "Full-Time"
        table.cell(1, 1).text = "Permanent employee"
        docx_buf = io.BytesIO()
        docx_obj.save(docx_buf)
        test_file_content = docx_buf.getvalue()

        upload = SimpleUploadedFile("sample_guide.docx", test_file_content, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.training_file = TrainingFile.objects.create(
            file=upload,
            filename="sample_guide.docx",
            relative_path="sample_guide.docx",
            file_type="DOCX",
            file_size=len(test_file_content),
            checksum="a" * 64,
            uploaded_by=self.admin,
        )

        # Create unmapped training file
        unmapped_upload = SimpleUploadedFile("secret_admin.pdf", b"Secret admin file", content_type="application/pdf")
        self.unmapped_file = TrainingFile.objects.create(
            file=unmapped_upload,
            filename="secret_admin.pdf",
            relative_path="secret_admin.pdf",
            file_type="PDF",
            file_size=17,
            checksum="b" * 64,
            uploaded_by=self.admin,
        )

        # Create cluster and mapping to submodule
        self.cluster = TrainingCluster.objects.create(
            course=self.course,
            name="Cluster 1",
            code="CL-1",
            order=1,
        )
        self.mapping = TrainingFileMapping.objects.create(
            training_file=self.training_file,
            cluster=self.cluster,
            module=self.module,
            submodule=self.submodule,
            category="PRIMARY_INSTRUCTIONAL",
            notes="Standard course guide",
        )

        # Assign course to assigned_learner
        TrainingAssignment.objects.create(
            course=self.course,
            learner=self.assigned_learner,
            assigned_by=self.admin,
            is_active=True,
        )

    def test_assigned_learner_can_list_and_download_materials(self):
        """1 & 2. Assigned learner can list materials and download the attached file."""
        self.client.force_authenticate(user=self.assigned_learner)

        # 1. List materials
        resp = self.client.get(f"/api/submodules/{self.submodule.id}/materials/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

        item = resp.data[0]
        self.assertEqual(item["filename"], "sample_guide.docx")
        self.assertEqual(item["file_type"], "DOCX")
        self.assertEqual(item["category"], "PRIMARY_INSTRUCTIONAL")
        # Ensure no physical path is exposed
        self.assertNotIn("path", item)
        self.assertNotIn("C:\\", json_str := str(item))
        self.assertNotIn("D:\\", json_str)

        # 2. DOCX documents now convert to inline-viewable PDF previews
        dl_url = item["download_url"]
        dl_resp = self.client.get(dl_url)
        self.assertEqual(dl_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(dl_resp.headers.get("Content-Type"), "application/pdf")
        self.assertIn('inline; filename="sample_guide.pdf"', dl_resp.headers.get("Content-Disposition", ""))
        self.assertEqual(dl_resp.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate")
        self.assertEqual(dl_resp.headers.get("X-Content-Type-Options"), "nosniff")

        # 3. Create a viewable PDF material and verify inline viewing works with safe headers
        pdf_upload = SimpleUploadedFile("guide.pdf", b"%PDF-1.4 mock pdf content", content_type="application/pdf")
        pdf_file = TrainingFile.objects.create(
            filename="guide.pdf",
            file=pdf_upload,
            file_type="PDF",
            file_size=len(b"%PDF-1.4 mock pdf content"),
            uploaded_by=self.admin,
        )
        TrainingFileMapping.objects.create(
            cluster=self.cluster,
            module=self.module,
            submodule=self.submodule,
            training_file=pdf_file,
        )
        pdf_url = f"/api/submodules/{self.submodule.id}/download-material/{pdf_file.id}/"
        pdf_resp = self.client.get(pdf_url)
        self.assertEqual(pdf_resp.status_code, status.HTTP_200_OK)
        self.assertIn("inline; filename=\"guide.pdf\"", pdf_resp.headers.get("Content-Disposition", ""))
        self.assertEqual(pdf_resp.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate")
        self.assertEqual(pdf_resp.headers.get("X-Content-Type-Options"), "nosniff")

    def test_unassigned_learner_cannot_list_or_download_materials(self):
        """3. Unassigned learner cannot list materials or download attached files."""
        self.client.force_authenticate(user=self.unassigned_learner)

        resp_list = self.client.get(f"/api/submodules/{self.submodule.id}/materials/")
        self.assertEqual(resp_list.status_code, status.HTTP_404_NOT_FOUND)

        resp_dl = self.client.get(f"/api/submodules/{self.submodule.id}/download-material/{self.training_file.id}/")
        self.assertEqual(resp_dl.status_code, status.HTTP_404_NOT_FOUND)

    def test_learner_cannot_download_unmapped_file(self):
        """4. Assigned learner cannot download an arbitrary file not mapped to the submodule."""
        self.client.force_authenticate(user=self.assigned_learner)

        resp_dl = self.client.get(f"/api/submodules/{self.submodule.id}/download-material/{self.unmapped_file.id}/")
        self.assertEqual(resp_dl.status_code, status.HTTP_404_NOT_FOUND)

    def test_draft_submodule_materials_denied_to_learner(self):
        """5. Materials for draft submodules return 404 to learners."""
        draft_sub = Submodule.objects.create(
            module=self.module,
            name="Draft Lesson",
            order=2,
            status=PublicationStatus.DRAFT,
        )
        self.client.force_authenticate(user=self.assigned_learner)

        resp = self.client.get(f"/api/submodules/{draft_sub.id}/materials/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_download_endpoint_blocked_for_learners(self):
        """6. The admin-only training-files download endpoint remains strictly 403 for learners."""
        self.client.force_authenticate(user=self.assigned_learner)

        resp = self.client.get(f"/api/admin/training-files/{self.training_file.id}/download/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

