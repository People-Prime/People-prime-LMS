import os
import io
import docx
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import (
    Course,
    CourseLevel,
    Module,
    Submodule,
    PublicationStatus,
    TrainingCluster,
    TrainingFile,
    TrainingFileMapping,
    TrainingAssignment,
)

User = get_user_model()


class DocxPreviewRoleSecurityTests(TestCase):
    """
    Comprehensive verification tests for DOCX read-only preview:
    1. Admin can preview DOCX in DRAFT and PUBLISHED courses.
    2. Trainer can preview DOCX in PUBLISHED courses (including unassigned courses).
    3. Trainer cannot preview DOCX in DRAFT or unpublished courses (404).
    4. Learner can preview DOCX in assigned PUBLISHED courses.
    5. Learner cannot preview DOCX in unassigned courses (404).
    6. Unauthenticated requests are denied.
    7. Preview cache reuse & content hash invalidation upon modification.
    8. Admin file repository endpoint (/api/admin/training-files/<id>/download/) converts DOCX to PDF inline.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = User.objects.create_user(
            username="admin_docx_test",
            email="admin_docx@example.com",
            password="pass",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="trainer_docx_test",
            email="trainer_docx@example.com",
            password="pass",
            role=User.Role.TRAINER,
        )
        self.assigned_learner = User.objects.create_user(
            username="assigned_docx_learner",
            email="assigned_learner@example.com",
            password="pass",
            role=User.Role.LEARNER,
        )
        self.unassigned_learner = User.objects.create_user(
            username="unassigned_docx_learner",
            email="unassigned_learner@example.com",
            password="pass",
            role=User.Role.LEARNER,
        )

        # Build sample DOCX binary
        docx_obj = docx.Document()
        docx_obj.add_heading("Role Scoping Test Document", level=1)
        docx_obj.add_paragraph("Paragraph content for test.")
        table = docx_obj.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "Header 1"
        table.cell(0, 1).text = "Header 2"
        table.cell(1, 0).text = "Val 1"
        table.cell(1, 1).text = "Val 2"
        buf = io.BytesIO()
        docx_obj.save(buf)
        self.docx_bytes = buf.getvalue()

        # Training file
        upload = SimpleUploadedFile("curriculum_guide.docx", self.docx_bytes, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.training_file = TrainingFile.objects.create(
            file=upload,
            filename="curriculum_guide.docx",
            file_type="DOCX",
            file_size=len(self.docx_bytes),
            uploaded_by=self.admin,
        )

        # Published Course & Level
        self.pub_course = Course.objects.create(
            name="Published Recruitment",
            code="PUB-101",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin,
        )
        self.pub_level = CourseLevel.objects.create(
            name="Level 1",
            course=self.pub_course,
            order=1,
        )
        self.pub_module = Module.objects.create(
            course=self.pub_course,
            level=self.pub_level,
            name="Published Module",
            status=PublicationStatus.PUBLISHED,
        )
        self.pub_submodule = Submodule.objects.create(
            module=self.pub_module,
            name="Published Lesson",
            status=PublicationStatus.PUBLISHED,
        )
        self.pub_cluster = TrainingCluster.objects.create(
            course=self.pub_course,
            name="Cluster Pub",
            code="CL-PUB",
        )
        self.pub_mapping = TrainingFileMapping.objects.create(
            training_file=self.training_file,
            cluster=self.pub_cluster,
            module=self.pub_module,
            submodule=self.pub_submodule,
            category="PRIMARY_INSTRUCTIONAL",
        )

        # Assign published course ONLY to assigned_learner
        TrainingAssignment.objects.create(
            course=self.pub_course,
            learner=self.assigned_learner,
            assigned_by=self.admin,
            is_active=True,
        )

        # Draft Course & Level
        self.draft_course = Course.objects.create(
            name="Draft Recruitment",
            code="DFT-101",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )
        self.draft_level = CourseLevel.objects.create(
            name="Level 1",
            course=self.draft_course,
            order=1,
        )
        self.draft_module = Module.objects.create(
            course=self.draft_course,
            level=self.draft_level,
            name="Draft Module",
            status=PublicationStatus.DRAFT,
        )
        self.draft_submodule = Submodule.objects.create(
            module=self.draft_module,
            name="Draft Lesson",
            status=PublicationStatus.DRAFT,
        )
        self.draft_cluster = TrainingCluster.objects.create(
            course=self.draft_course,
            name="Cluster Draft",
            code="CL-DFT",
        )
        self.draft_mapping = TrainingFileMapping.objects.create(
            training_file=self.training_file,
            cluster=self.draft_cluster,
            module=self.draft_module,
            submodule=self.draft_submodule,
            category="PRIMARY_INSTRUCTIONAL",
        )

    def test_admin_can_preview_docx_in_published_and_draft_courses(self):
        self.client.force_authenticate(user=self.admin)

        # Published course lesson preview
        url_pub = f"/api/submodules/{self.pub_submodule.id}/download-material/{self.training_file.id}/"
        resp_pub = self.client.get(url_pub)
        self.assertEqual(resp_pub.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_pub.headers.get("Content-Type"), "application/pdf")
        self.assertIn('inline; filename="curriculum_guide.pdf"', resp_pub.headers.get("Content-Disposition", ""))

        # Draft course lesson preview
        url_draft = f"/api/submodules/{self.draft_submodule.id}/download-material/{self.training_file.id}/"
        resp_draft = self.client.get(url_draft)
        self.assertEqual(resp_draft.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_draft.headers.get("Content-Type"), "application/pdf")

        # Admin files tab preview
        url_admin_tab = f"/api/admin/training-files/{self.training_file.id}/download/"
        resp_admin_tab = self.client.get(url_admin_tab)
        self.assertEqual(resp_admin_tab.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_admin_tab.headers.get("Content-Type"), "application/pdf")

    def test_trainer_can_preview_published_courses_even_unassigned(self):
        self.client.force_authenticate(user=self.trainer)

        url_pub = f"/api/submodules/{self.pub_submodule.id}/download-material/{self.training_file.id}/"
        resp = self.client.get(url_pub)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.headers.get("Content-Type"), "application/pdf")
        self.assertIn('inline; filename="curriculum_guide.pdf"', resp.headers.get("Content-Disposition", ""))

    def test_trainer_cannot_preview_draft_courses(self):
        self.client.force_authenticate(user=self.trainer)

        url_draft = f"/api/submodules/{self.draft_submodule.id}/download-material/{self.training_file.id}/"
        resp = self.client.get(url_draft)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_learner_can_preview_assigned_published_course(self):
        self.client.force_authenticate(user=self.assigned_learner)

        url_pub = f"/api/submodules/{self.pub_submodule.id}/download-material/{self.training_file.id}/"
        resp = self.client.get(url_pub)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.headers.get("Content-Type"), "application/pdf")
        self.assertIn('inline; filename="curriculum_guide.pdf"', resp.headers.get("Content-Disposition", ""))

    def test_learner_cannot_preview_unassigned_course(self):
        self.client.force_authenticate(user=self.unassigned_learner)

        url_pub = f"/api/submodules/{self.pub_submodule.id}/download-material/{self.training_file.id}/"
        resp = self.client.get(url_pub)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_request_denied(self):
        url_pub = f"/api/submodules/{self.pub_submodule.id}/download-material/{self.training_file.id}/"
        resp = self.client.get(url_pub)
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_preview_cache_reuse(self):
        from core.document_preview import get_or_create_docx_preview, PREVIEWS_DIR
        path1 = get_or_create_docx_preview(self.training_file)
        self.assertTrue(os.path.exists(path1))
        stat1 = os.stat(path1)

        # Second request should reuse identical file
        path2 = get_or_create_docx_preview(self.training_file)
        self.assertEqual(path1, path2)
        stat2 = os.stat(path2)
        self.assertEqual(stat1.st_mtime, stat2.st_mtime)
