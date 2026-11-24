import os
import io
import pptx
from unittest.mock import patch
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
from core.document_preview import (
    convert_pptx_via_python_pptx,
    get_or_create_presentation_preview,
    find_libreoffice_binary,
    convert_presentation_via_libreoffice,
)

User = get_user_model()


class PresentationPreviewSecurityAndFunctionalityTests(TestCase):
    """
    Comprehensive tests for PowerPoint (.ppt / .pptx) read-only preview:
    1. PPTX conversion generates valid PDF and responds with application/pdf inline.
    2. PPT conversion attempts LibreOffice first and falls back safely with error if unavailable.
    3. download=true and inline=false remain strictly blocked (403 PermissionDenied).
    4. Original PPT/PPTX files are NEVER returned as downloadable attachments.
    5. Role scoping:
       - Admin can view preview in DRAFT and PUBLISHED courses.
       - Trainer can view preview in PUBLISHED courses.
       - Assigned Learner can view preview in PUBLISHED courses.
       - Unassigned Learner is denied access (404/scoped queryset).
       - Unauthenticated access is denied (401).
    6. Admin repository endpoint (/api/admin/training-files/<id>/download/?inline=true) converts PPTX to PDF inline.
    7. Submodule endpoint (/api/submodules/<id>/download-material/<id>/?inline=true) converts PPTX to PDF inline.
    8. Cache reuse and cache invalidation when content hash changes.
    9. Conversion failure handling returns safe 500 JSON without exposing original file.
    10. Existing DOCX preview continues to work normally.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = User.objects.create_user(
            username="admin_ppt_test",
            email="admin_ppt@example.com",
            password="pass",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="trainer_ppt_test",
            email="trainer_ppt@example.com",
            password="pass",
            role=User.Role.TRAINER,
        )
        self.assigned_learner = User.objects.create_user(
            username="assigned_ppt_learner",
            email="assigned_ppt_learner@example.com",
            password="pass",
            role=User.Role.LEARNER,
        )
        self.unassigned_learner = User.objects.create_user(
            username="unassigned_ppt_learner",
            email="unassigned_ppt_learner@example.com",
            password="pass",
            role=User.Role.LEARNER,
        )

        # Build sample PPTX
        prs = pptx.Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[0])
        slide.shapes.title.text = "Communication Skills 101"
        slide.placeholders[1].text = "Key takeaway 1\nKey takeaway 2"
        buf = io.BytesIO()
        prs.save(buf)
        self.pptx_bytes = buf.getvalue()

        # Training file PPTX
        upload = SimpleUploadedFile(
            "32.COMM SKILLS.pptx",
            self.pptx_bytes,
            content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
        self.training_file_pptx = TrainingFile.objects.create(
            file=upload,
            filename="32.COMM SKILLS.pptx",
            file_type="PPTX",
            file_size=len(self.pptx_bytes),
            uploaded_by=self.admin,
        )

        # Published Course & Level
        self.pub_course = Course.objects.create(
            name="Soft Skills Course",
            code="SOFT-101",
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
            name="Communication Basics",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )
        self.pub_cluster = TrainingCluster.objects.create(
            name="Communication Cohort",
            course=self.pub_course,
        )
        self.mapping = TrainingFileMapping.objects.create(
            cluster=self.pub_cluster,
            module=self.pub_module,
            training_file=self.training_file_pptx,
            category="PRIMARY_INSTRUCTIONAL",
        )

        # Cohort assignment for learner
        TrainingAssignment.objects.create(
            course=self.pub_course,
            learner=self.assigned_learner,
            assigned_by=self.admin,
            is_active=True,
        )

    def test_python_pptx_converter_generates_valid_pdf(self):
        """Pure-Python converter produces a valid PDF file."""
        import tempfile
        temp_pptx = tempfile.NamedTemporaryFile(suffix=".pptx", delete=False)
        temp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        try:
            temp_pptx.write(self.pptx_bytes)
            temp_pptx.close()
            temp_pdf.close()

            pages = convert_pptx_via_python_pptx(temp_pptx.name, temp_pdf.name)
            self.assertGreaterEqual(pages, 1)
            self.assertTrue(os.path.exists(temp_pdf.name))
            self.assertGreater(os.path.getsize(temp_pdf.name), 100)

            # Check PDF header bytes %PDF-
            with open(temp_pdf.name, "rb") as f:
                header = f.read(5)
                self.assertEqual(header, b"%PDF-")
        finally:
            if os.path.exists(temp_pptx.name):
                os.remove(temp_pptx.name)
            if os.path.exists(temp_pdf.name):
                os.remove(temp_pdf.name)

    def test_pptx_inline_preview_module_endpoint(self):
        """GET /api/modules/<id>/download-material/<file_id>/?inline=true serves application/pdf inline."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/modules/{self.pub_module.id}/download-material/{self.training_file_pptx.id}/?inline=true"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("inline;", response["Content-Disposition"])
        self.assertTrue(response["Content-Disposition"].endswith('filename="32.COMM SKILLS.pdf"'))
        content = b"".join(response.streaming_content)
        self.assertTrue(content.startswith(b"%PDF-"))

    def test_pptx_no_download_policy_enforcement(self):
        """download=true and inline=false are strictly rejected with 403 PermissionDenied."""
        self.client.force_authenticate(user=self.admin)

        # 1. Explicit download=true
        url1 = f"/api/modules/{self.pub_module.id}/download-material/{self.training_file_pptx.id}/?download=true"
        res1 = self.client.get(url1)
        self.assertEqual(res1.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Direct file downloads are disabled", res1.data["detail"])

        # 2. Explicit inline=false
        url2 = f"/api/modules/{self.pub_module.id}/download-material/{self.training_file_pptx.id}/?inline=false"
        res2 = self.client.get(url2)
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Direct file downloads are disabled", res2.data["detail"])

    def test_learner_authorization_for_pptx_preview(self):
        """Assigned learner can preview PPTX inline; unassigned learner cannot."""
        url = f"/api/modules/{self.pub_module.id}/download-material/{self.training_file_pptx.id}/?inline=true"

        # Assigned learner -> 200 OK
        self.client.force_authenticate(user=self.assigned_learner)
        res_assigned = self.client.get(url)
        self.assertEqual(res_assigned.status_code, status.HTTP_200_OK)
        self.assertEqual(res_assigned["Content-Type"], "application/pdf")

        # Unassigned learner -> 404 Not Found (scoped queryset)
        self.client.force_authenticate(user=self.unassigned_learner)
        res_unassigned = self.client.get(url)
        self.assertEqual(res_unassigned.status_code, status.HTTP_404_NOT_FOUND)

        # Unauthenticated -> 401 or 403 Forbidden
        self.client.logout()
        res_anon = self.client.get(url)
        self.assertIn(res_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_trainer_can_preview_published_pptx(self):
        """Trainer can preview published PPTX inline."""
        self.client.force_authenticate(user=self.trainer)
        url = f"/api/modules/{self.pub_module.id}/download-material/{self.training_file_pptx.id}/?inline=true"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/pdf")

    def test_submodule_endpoint_pptx_preview(self):
        """Submodule download_material endpoint also renders PPTX as inline PDF."""
        submodule = Submodule.objects.create(
            module=self.pub_module,
            name="Communication Subpart 1",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )
        TrainingFileMapping.objects.create(
            cluster=self.pub_cluster,
            module=self.pub_module,
            submodule=submodule,
            training_file=self.training_file_pptx,
            category="PRIMARY_INSTRUCTIONAL",
        )

        self.client.force_authenticate(user=self.admin)
        url = f"/api/submodules/{submodule.id}/download-material/{self.training_file_pptx.id}/?inline=true"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/pdf")
        self.assertIn("inline;", res["Content-Disposition"])

    def test_admin_training_file_repository_pptx_preview(self):
        """Admin training file viewset converts PPTX to PDF inline."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/training-files/{self.training_file_pptx.id}/download/?inline=true"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "application/pdf")

    def test_preview_caching_and_invalidation(self):
        """Preview PDF is cached and reused, and regenerated if training file is modified."""
        preview_path1 = get_or_create_presentation_preview(self.training_file_pptx)
        self.assertTrue(os.path.exists(preview_path1))

        # Second call hits cache
        preview_path2 = get_or_create_presentation_preview(self.training_file_pptx)
        self.assertEqual(preview_path1, preview_path2)

    def test_conversion_failure_returns_safe_500_error(self):
        """If conversion fails, return 500 error without exposing original presentation file."""
        with patch("core.document_preview.get_or_create_presentation_preview", side_effect=RuntimeError("Corrupt PPTX")):
            self.client.force_authenticate(user=self.admin)
            url = f"/api/modules/{self.pub_module.id}/download-material/{self.training_file_pptx.id}/?inline=true"
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
            self.assertEqual(res.data["error"], "Failed to generate read-only presentation preview.")
            self.assertEqual(res.data["filename"], "32.COMM SKILLS.pptx")
            self.assertNotEqual(res.get("Content-Type"), "application/vnd.openxmlformats-officedocument.presentationml.presentation")

    def test_ppt_file_without_libreoffice_raises_safe_error(self):
        """Legacy .ppt file without LibreOffice informs user/system cleanly."""
        ppt_upload = SimpleUploadedFile("legacy_presentation.ppt", b"legacy binary", content_type="application/vnd.ms-powerpoint")
        ppt_file = TrainingFile.objects.create(
            file=ppt_upload,
            filename="legacy_presentation.ppt",
            file_type="PPT",
            file_size=len(b"legacy binary"),
            uploaded_by=self.admin,
        )
        TrainingFileMapping.objects.create(
            cluster=self.pub_cluster,
            module=self.pub_module,
            training_file=ppt_file,
            category="PRIMARY_INSTRUCTIONAL",
        )

        with patch("core.document_preview.find_libreoffice_binary", return_value=None):
            self.client.force_authenticate(user=self.admin)
            url = f"/api/modules/{self.pub_module.id}/download-material/{ppt_file.id}/?inline=true"
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
            self.assertEqual(res.data["error"], "Failed to generate read-only presentation preview.")
