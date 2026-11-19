"""
Comprehensive test suite for the LMS Projects Module.
Validates:
- Admin Project CRUD, assignment, and resource management.
- Role-based permissions: Trainer assignment scoping, Learner assignment scoping.
- Deadline and late-submission policy enforcement.
- Learner submission and version history preservation (resubmissions do not overwrite).
- File upload validation and authorized secure download endpoints.
- Trainer review, feedback, and score updates.
- Soft-deletion safety.
"""

from datetime import timedelta
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import (
    AuditLog,
    Project,
    ProjectResource,
    ProjectSubmission,
    ProjectSubmissionFile,
)

User = get_user_model()


class ProjectsBackendTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = User.objects.create_user(
            username="admin_user",
            email="admin@test.com",
            password="Password123!",
            role=User.Role.ADMIN,
        )
        self.trainer_1 = User.objects.create_user(
            username="trainer_1",
            email="trainer1@test.com",
            password="Password123!",
            role=User.Role.TRAINER,
        )
        self.trainer_2 = User.objects.create_user(
            username="trainer_2",
            email="trainer2@test.com",
            password="Password123!",
            role=User.Role.TRAINER,
        )
        self.learner_1 = User.objects.create_user(
            username="learner_1",
            email="learner1@test.com",
            password="Password123!",
            role=User.Role.LEARNER,
        )
        self.learner_2 = User.objects.create_user(
            username="learner_2",
            email="learner2@test.com",
            password="Password123!",
            role=User.Role.LEARNER,
        )

        # Base Project
        self.project = Project.objects.create(
            title="Full-Stack Talent Portal",
            description="Build a production LMS portal",
            instructions="Follow the architecture guidelines",
            objectives="Master Django & React",
            start_date=timezone.now().date(),
            due_date=timezone.now() + timedelta(days=7),
            status=Project.ProjectStatus.ACTIVE,
            priority=Project.Priority.HIGH,
            allow_late_submissions=True,
            created_by=self.admin,
        )
        self.project.trainers.add(self.trainer_1)
        self.project.learners.add(self.learner_1)

    # -------------------------------------------------------------------------
    # 1. Admin Capabilities & Scoping
    # -------------------------------------------------------------------------
    def test_admin_can_create_and_manage_project(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "title": "Cloud DevOps Pipeline",
            "description": "Deploy infrastructure on AWS",
            "instructions": "Use terraform and docker",
            "objectives": "Automated deployments",
            "status": "ACTIVE",
            "priority": "HIGH",
            "trainers": [self.trainer_1.id],
            "learners": [self.learner_1.id, self.learner_2.id],
        }
        res = self.client.post("/api/projects/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data["title"], "Cloud DevOps Pipeline")
        self.assertEqual(len(data["trainers_detail"]), 1)
        self.assertEqual(len(data["learners_detail"]), 2)

        # Verify audit log
        self.assertTrue(AuditLog.objects.filter(entity_type="Project", entity_id=data["id"]).exists())

    def test_admin_can_assign_users(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            f"/api/projects/{self.project.id}/assign/",
            {"trainers": [self.trainer_1.id, self.trainer_2.id], "learners": [self.learner_2.id]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.project.refresh_from_db()
        self.assertEqual(self.project.trainers.count(), 2)
        self.assertEqual(self.project.learners.count(), 1)
        self.assertTrue(self.project.learners.filter(id=self.learner_2.id).exists())

    def test_admin_soft_delete_preserves_submissions(self):
        self.client.force_authenticate(user=self.admin)
        # Create a submission
        sub = ProjectSubmission.objects.create(
            project=self.project,
            learner=self.learner_1,
            version=1,
            status=ProjectSubmission.SubmissionStatus.SUBMITTED,
        )
        res = self.client.delete(f"/api/projects/{self.project.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.project.refresh_from_db()
        self.assertTrue(self.project.is_deleted)
        self.assertEqual(self.project.status, Project.ProjectStatus.ARCHIVED)
        # Submission record is preserved
        self.assertTrue(ProjectSubmission.objects.filter(id=sub.id).exists())

    # -------------------------------------------------------------------------
    # 2. Role-Based Scoping Tests (Trainers & Learners)
    # -------------------------------------------------------------------------
    def test_trainer_can_only_see_assigned_projects(self):
        # trainer_1 is assigned to self.project, trainer_2 is not
        self.client.force_authenticate(user=self.trainer_1)
        res1 = self.client.get("/api/projects/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        res_data_1 = res1.json()
        items_1 = res_data_1.get("results", res_data_1) if isinstance(res_data_1, dict) else res_data_1
        ids_1 = [p["id"] for p in items_1]
        self.assertIn(self.project.id, ids_1)

        self.client.force_authenticate(user=self.trainer_2)
        res2 = self.client.get("/api/projects/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        res_data_2 = res2.json()
        items_2 = res_data_2.get("results", res_data_2) if isinstance(res_data_2, dict) else res_data_2
        ids_2 = [p["id"] for p in items_2]
        self.assertNotIn(self.project.id, ids_2)

    def test_trainer_cannot_create_or_delete_project(self):
        self.client.force_authenticate(user=self.trainer_1)
        res_create = self.client.post("/api/projects/", {"title": "Unauthorized"}, format="json")
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        res_delete = self.client.delete(f"/api/projects/{self.project.id}/")
        self.assertEqual(res_delete.status_code, status.HTTP_403_FORBIDDEN)

    def test_learner_can_only_see_assigned_active_projects(self):
        # learner_1 is assigned, learner_2 is not
        self.client.force_authenticate(user=self.learner_1)
        res1 = self.client.get("/api/projects/")
        res_data_1 = res1.json()
        items_1 = res_data_1.get("results", res_data_1) if isinstance(res_data_1, dict) else res_data_1
        ids_1 = [p["id"] for p in items_1]
        self.assertIn(self.project.id, ids_1)

        self.client.force_authenticate(user=self.learner_2)
        res2 = self.client.get("/api/projects/")
        res_data_2 = res2.json()
        items_2 = res_data_2.get("results", res_data_2) if isinstance(res_data_2, dict) else res_data_2
        ids_2 = [p["id"] for p in items_2]
        self.assertNotIn(self.project.id, ids_2)


    # -------------------------------------------------------------------------
    # 3. Submissions & Version History
    # -------------------------------------------------------------------------
    def test_learner_submission_and_resubmission_version_history(self):
        self.client.force_authenticate(user=self.learner_1)

        dummy_file_1 = SimpleUploadedFile("project_doc.pdf", b"%PDF-1.4 test dummy content", content_type="application/pdf")
        res1 = self.client.post(
            "/api/project-submissions/",
            {
                "project": self.project.id,
                "comments": "First draft submission",
                "files": [dummy_file_1],
            },
            format="multipart",
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        data1 = res1.json()
        self.assertEqual(data1["version"], 1)
        self.assertEqual(data1["status"], "SUBMITTED")
        self.assertEqual(len(data1["files"]), 1)

        # Resubmit (e.g. after trainer review)
        dummy_file_2 = SimpleUploadedFile("project_final.pdf", b"%PDF-1.4 test final version", content_type="application/pdf")
        res2 = self.client.post(
            "/api/project-submissions/",
            {
                "project": self.project.id,
                "comments": "Second revised version",
                "files": [dummy_file_2],
            },
            format="multipart",
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        data2 = res2.json()
        self.assertEqual(data2["version"], 2)
        self.assertEqual(data2["comments"], "Second revised version")

        # Both versions exist in DB
        submissions = ProjectSubmission.objects.filter(project=self.project, learner=self.learner_1).order_by("version")
        self.assertEqual(submissions.count(), 2)
        self.assertEqual(submissions[0].version, 1)
        self.assertEqual(submissions[1].version, 2)

    def test_unassigned_learner_cannot_submit(self):
        self.client.force_authenticate(user=self.learner_2)
        dummy_file = SimpleUploadedFile("test.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        res = self.client.post(
            "/api/project-submissions/",
            {
                "project": self.project.id,
                "comments": "Should be rejected",
                "files": [dummy_file],
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # 4. Deadline & Late Submission Policy
    # -------------------------------------------------------------------------
    def test_late_submission_blocked_when_disallowed(self):
        self.project.due_date = timezone.now() - timedelta(days=1)
        self.project.allow_late_submissions = False
        self.project.save()

        self.client.force_authenticate(user=self.learner_1)
        dummy_file = SimpleUploadedFile("late.pdf", b"%PDF-1.4 late", content_type="application/pdf")
        res = self.client.post(
            "/api/project-submissions/",
            {
                "project": self.project.id,
                "comments": "Attempting late submission",
                "files": [dummy_file],
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("deadline", res.json()["error"].lower())

    def test_late_submission_marked_late_when_allowed(self):
        self.project.due_date = timezone.now() - timedelta(days=1)
        self.project.allow_late_submissions = True
        self.project.save()

        self.client.force_authenticate(user=self.learner_1)
        dummy_file = SimpleUploadedFile("late_allowed.pdf", b"%PDF-1.4 late allowed", content_type="application/pdf")
        res = self.client.post(
            "/api/project-submissions/",
            {
                "project": self.project.id,
                "comments": "Submitting after deadline with allowance",
                "files": [dummy_file],
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.json()["is_late"])

    # -------------------------------------------------------------------------
    # 5. Trainer Review & Evaluation
    # -------------------------------------------------------------------------
    def test_trainer_can_review_assigned_submission(self):
        # Create submission
        sub = ProjectSubmission.objects.create(
            project=self.project,
            learner=self.learner_1,
            version=1,
            status=ProjectSubmission.SubmissionStatus.SUBMITTED,
        )

        # trainer_1 reviews
        self.client.force_authenticate(user=self.trainer_1)
        review_payload = {
            "status": "REVIEWED",
            "feedback": "Excellent structure and clean code.",
            "score": 92.5,
        }
        res = self.client.post(f"/api/project-submissions/{sub.id}/review/", review_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        sub.refresh_from_db()
        self.assertEqual(sub.status, "REVIEWED")
        self.assertEqual(float(sub.score), 92.5)
        self.assertEqual(sub.reviewed_by, self.trainer_1)
        self.assertIsNotNone(sub.reviewed_at)

    def test_unassigned_trainer_cannot_review(self):
        sub = ProjectSubmission.objects.create(
            project=self.project,
            learner=self.learner_1,
            version=1,
            status=ProjectSubmission.SubmissionStatus.SUBMITTED,
        )
        self.client.force_authenticate(user=self.trainer_2)
        res = self.client.post(
            f"/api/project-submissions/{sub.id}/review/",
            {"status": "REVIEWED", "feedback": "Sneaky review", "score": 50},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # 6. Secure Authorized File Downloads
    # -------------------------------------------------------------------------
    def test_secure_submission_file_download_permissions(self):
        sub = ProjectSubmission.objects.create(
            project=self.project,
            learner=self.learner_1,
            version=1,
            status=ProjectSubmission.SubmissionStatus.SUBMITTED,
        )
        sub_file = ProjectSubmissionFile.objects.create(
            submission=sub,
            file=SimpleUploadedFile("code.txt", b"print('Hello LMS')", content_type="text/plain"),
            original_name="code.txt",
            file_size=18,
        )

        url = f"/api/project-submissions/{sub.id}/files/{sub_file.id}/download/"

        # 1. Owner learner can download
        self.client.force_authenticate(user=self.learner_1)
        res1 = self.client.get(url)
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # 2. Assigned trainer can download
        self.client.force_authenticate(user=self.trainer_1)
        res2 = self.client.get(url)
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

        # 3. Admin can download
        self.client.force_authenticate(user=self.admin)
        res3 = self.client.get(url)
        self.assertEqual(res3.status_code, status.HTTP_200_OK)

        # 4. Unassigned learner CANNOT download (Forbidden)
        self.client.force_authenticate(user=self.learner_2)
        res4 = self.client.get(url)
        self.assertEqual(res4.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Unassigned trainer CANNOT download (Forbidden)
        self.client.force_authenticate(user=self.trainer_2)
        res5 = self.client.get(url)
        self.assertEqual(res5.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------------------
    # 7. Project Resource Upload, Download, and Deletion Tests
    # -------------------------------------------------------------------------
    def test_project_resource_management_and_scoping(self):
        """
        Validates ProjectResource upload, download, and deletion:
        - Admin can upload PDF/DOCX resource.
        - Assigned Trainer can access & download resource.
        - Assigned Learner can access & download resource.
        - Unassigned Trainer cannot download (403).
        - Unassigned Learner cannot download (403).
        - Learner cannot upload (403).
        - Learner cannot delete (403).
        - Admin can delete resource safely.
        """
        upload_url = f"/api/projects/{self.project.id}/upload-resource/"

        # 1. Admin uploads resource file
        pdf_file = SimpleUploadedFile("guide.pdf", b"%PDF-1.4 project guide content", content_type="application/pdf")
        self.client.force_authenticate(user=self.admin)
        res_upload = self.client.post(upload_url, {"file": pdf_file}, format="multipart")
        self.assertEqual(res_upload.status_code, status.HTTP_201_CREATED)
        resource_id = res_upload.data["id"]
        self.assertEqual(res_upload.data["original_name"], "guide.pdf")
        self.assertTrue(ProjectResource.objects.filter(id=resource_id).exists())

        download_url = f"/api/projects/{self.project.id}/resources/{resource_id}/download/"

        # 2. Admin can download resource
        self.client.force_authenticate(user=self.admin)
        res_admin_dl = self.client.get(download_url)
        self.assertEqual(res_admin_dl.status_code, status.HTTP_200_OK)

        # 3. Assigned Trainer can download resource
        self.client.force_authenticate(user=self.trainer_1)
        res_tr_dl = self.client.get(download_url)
        self.assertEqual(res_tr_dl.status_code, status.HTTP_200_OK)

        # 4. Assigned Learner can download resource
        self.client.force_authenticate(user=self.learner_1)
        res_lr_dl = self.client.get(download_url)
        self.assertEqual(res_lr_dl.status_code, status.HTTP_200_OK)

        # 5. Unassigned Trainer CANNOT download (Forbidden)
        self.client.force_authenticate(user=self.trainer_2)
        res_unassigned_tr = self.client.get(download_url)
        self.assertEqual(res_unassigned_tr.status_code, status.HTTP_403_FORBIDDEN)

        # 6. Unassigned Learner CANNOT download (Forbidden)
        self.client.force_authenticate(user=self.learner_2)
        res_unassigned_lr = self.client.get(download_url)
        self.assertEqual(res_unassigned_lr.status_code, status.HTTP_403_FORBIDDEN)

        # 7. Learner CANNOT upload resource (Forbidden)
        self.client.force_authenticate(user=self.learner_1)
        res_lr_upload = self.client.post(
            upload_url,
            {"file": SimpleUploadedFile("hack.pdf", b"%PDF-1.4 hack", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(res_lr_upload.status_code, status.HTTP_403_FORBIDDEN)

        # 8. Learner CANNOT delete resource (Forbidden)
        delete_url = f"/api/projects/{self.project.id}/resources/{resource_id}/"
        self.client.force_authenticate(user=self.learner_1)
        res_lr_del = self.client.delete(delete_url)
        self.assertEqual(res_lr_del.status_code, status.HTTP_403_FORBIDDEN)

        # 9. Admin deletes resource
        self.client.force_authenticate(user=self.admin)
        res_admin_del = self.client.delete(delete_url)
        self.assertEqual(res_admin_del.status_code, status.HTTP_200_OK)
        self.assertFalse(ProjectResource.objects.filter(id=resource_id).exists())
