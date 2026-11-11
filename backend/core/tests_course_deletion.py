import json
from unittest.mock import patch
from django.db import IntegrityError
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from core.models import (
    AuditAction,
    AuditLog,
    Course,
    Module,
    PublicationStatus,
    Submodule,
    TrainingAssignment,
    ModuleQuestion,
    ModuleAssessmentAttempt,
    ModuleQuestionResponse,
    ModuleFeedback,
    LearnerGroup,
    CandidateType,
)


class AdminCourseDeletionTests(APITestCase):
    """
    Automated test suite verifying the improved Admin Delete Course functionality.
    Runs against an isolated test database.
    """

    def setUp(self):
        # 1. Admin user
        self.admin = User.objects.create_user(
            username="admin_test@example.com",
            password="Password123!",
            role=User.Role.ADMIN,
            is_active=True,
        )
        # 2. Trainer user
        self.trainer = User.objects.create_user(
            username="trainer_test@example.com",
            password="Password123!",
            role=User.Role.TRAINER,
            is_active=True,
        )
        # 3. Learner user
        self.learner = User.objects.create_user(
            username="learner_test@example.com",
            password="Password123!",
            role=User.Role.LEARNER,
            is_active=True,
        )
        # Candidate Type & Group
        self.cand_type = CandidateType.objects.create(name="Engineering", code="ENG")
        self.group = LearnerGroup.objects.create(
            name="Alpha Cohort", code="ALP-01", candidate_type=self.cand_type
        )

    def test_admin_can_delete_draft_course(self):
        """1. Admin can successfully delete a DRAFT course and audit log is created."""
        draft_course = Course.objects.create(
            name="Draft Python",
            code="DP-101",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/courses/{draft_course.id}/")

        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Course.objects.filter(id=draft_course.id).exists())

        # Verify Audit Log
        audit = AuditLog.objects.filter(
            action=AuditAction.DELETE,
            entity_type="Course",
            entity_id=str(draft_course.id),
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.admin)
        self.assertEqual(audit.details.get("code"), "DP-101")
        self.assertEqual(audit.details.get("status"), PublicationStatus.DRAFT)

    def test_admin_can_delete_published_course(self):
        """2. Admin can successfully delete a PUBLISHED course without manual status change."""
        pub_course = Course.objects.create(
            name="Published Go",
            code="PGO-201",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/courses/{pub_course.id}/")

        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Course.objects.filter(id=pub_course.id).exists())

        # Verify Audit Log
        audit = AuditLog.objects.filter(
            action=AuditAction.DELETE,
            entity_type="Course",
            entity_id=str(pub_course.id),
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.admin)
        self.assertEqual(audit.details.get("code"), "PGO-201")
        self.assertEqual(audit.details.get("status"), PublicationStatus.PUBLISHED)

    def test_deletion_impact_endpoint_returns_accurate_metrics(self):
        """3. Deletion impact endpoint returns accurate counts of all child and dependent entities."""
        course = Course.objects.create(
            name="Full Stack React",
            code="FSR-301",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin,
        )
        mod = Module.objects.create(course=course, name="React Hooks", code="RH-1", order=1)
        sub = Submodule.objects.create(module=mod, name="useEffect Deep Dive", order=1)
        assign = TrainingAssignment.objects.create(course=course, learner_group=self.group)
        q = ModuleQuestion.objects.create(module=mod, question_text="What is a hook?", is_required=True)
        attempt = ModuleAssessmentAttempt.objects.create(module=mod, learner=self.learner, attempt_number=1)
        resp = ModuleQuestionResponse.objects.create(attempt=attempt, question=q, learner=self.learner, response_value=True)
        fb = ModuleFeedback.objects.create(module=mod, learner=self.learner, trainer=self.trainer, module_rating=5, trainer_rating=5)

        self.client.force_authenticate(user=self.admin)
        impact_resp = self.client.get(f"/api/courses/{course.id}/deletion-impact/")
        self.assertEqual(impact_resp.status_code, status.HTTP_200_OK)

        data = impact_resp.data
        self.assertEqual(data["course_id"], course.id)
        self.assertEqual(data["name"], "Full Stack React")
        self.assertEqual(data["code"], "FSR-301")
        self.assertEqual(data["status"], PublicationStatus.PUBLISHED)
        self.assertEqual(data["modules_count"], 1)
        self.assertEqual(data["assignments_count"], 1)
        self.assertEqual(data["questions_count"], 1)
        self.assertEqual(data["attempts_count"], 1)
        self.assertEqual(data["responses_count"], 1)
        self.assertEqual(data["feedback_count"], 1)

    def test_unauthorized_deletion_rejected(self):
        """4. Unauthorized users (learners, trainers, anonymous) cannot delete courses or view impact."""
        course = Course.objects.create(
            name="Protected Course",
            code="PROT-1",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )

        # 4a. Anonymous
        self.client.force_authenticate(user=None)
        resp_anon = self.client.delete(f"/api/courses/{course.id}/")
        self.assertIn(resp_anon.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # 4b. Learner
        self.client.force_authenticate(user=self.learner)
        resp_learner = self.client.delete(f"/api/courses/{course.id}/")
        self.assertEqual(resp_learner.status_code, status.HTTP_403_FORBIDDEN)

        # 4c. Trainer
        self.client.force_authenticate(user=self.trainer)
        resp_trainer = self.client.delete(f"/api/courses/{course.id}/")
        self.assertEqual(resp_trainer.status_code, status.HTTP_403_FORBIDDEN)

        # Verify course still exists
        self.assertTrue(Course.objects.filter(id=course.id).exists())

    def test_deletion_cascades_cleanly_through_all_dependencies(self):
        """5. Deletion of course cascades to modules, assignments, questions, attempts, responses, and feedbacks."""
        course = Course.objects.create(
            name="Complex Course",
            code="COMP-500",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin,
        )
        mod = Module.objects.create(course=course, name="Mod 1", code="M1", order=1)
        assign = TrainingAssignment.objects.create(course=course, learner=self.learner)
        q = ModuleQuestion.objects.create(module=mod, question_text="Quiz Q1", is_required=True)
        attempt = ModuleAssessmentAttempt.objects.create(module=mod, learner=self.learner, attempt_number=1)
        resp = ModuleQuestionResponse.objects.create(attempt=attempt, question=q, learner=self.learner, response_value=True)
        fb = ModuleFeedback.objects.create(module=mod, learner=self.learner, trainer=self.trainer, module_rating=4, trainer_rating=4)

        self.client.force_authenticate(user=self.admin)
        del_resp = self.client.delete(f"/api/courses/{course.id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

        # Confirm all children deleted
        self.assertFalse(Course.objects.filter(id=course.id).exists())
        self.assertFalse(Module.objects.filter(id=mod.id).exists())
        self.assertFalse(TrainingAssignment.objects.filter(id=assign.id).exists())
        self.assertFalse(ModuleQuestion.objects.filter(id=q.id).exists())
        self.assertFalse(ModuleAssessmentAttempt.objects.filter(id=attempt.id).exists())
        self.assertFalse(ModuleQuestionResponse.objects.filter(id=resp.id).exists())
        self.assertFalse(ModuleFeedback.objects.filter(id=fb.id).exists())

        # Unrelated entities must be preserved
        self.assertTrue(LearnerGroup.objects.filter(id=self.group.id).exists())
        self.assertTrue(User.objects.filter(id=self.learner.id).exists())

    def test_archived_course_deletion_rejected(self):
        """7. Deleting an ARCHIVED course is rejected with HTTP 400."""
        arch_course = Course.objects.create(
            name="Archived Kotlin",
            code="AK-800",
            status=PublicationStatus.ARCHIVED,
            created_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/courses/{arch_course.id}/")

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Archived courses cannot be deleted", resp.data["error"])
        self.assertTrue(Course.objects.filter(id=arch_course.id).exists())

    def test_transaction_rollback_when_deletion_fails(self):
        """6. When an unexpected error occurs during deletion, transaction rolls back and records are preserved."""
        course = Course.objects.create(
            name="Rollback Course",
            code="RB-999",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin,
        )
        mod = Module.objects.create(course=course, name="Mod RB", code="MRB", order=1)

        self.client.force_authenticate(user=self.admin)

        with patch.object(Course, "delete", side_effect=IntegrityError("Simulated database failure")):
            with patch("core.api_views.logger.exception"):
                with patch("django.core.handlers.base.log_response"):
                    resp = self.client.delete(f"/api/courses/{course.id}/")
                    self.assertEqual(resp.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
                    self.assertIn("Failed to delete course", resp.data["error"])

        # Assert transaction was rolled back and course/module still exist
        self.assertTrue(Course.objects.filter(id=course.id).exists())
        self.assertTrue(Module.objects.filter(id=mod.id).exists())

        # Assert no DELETE audit log was persisted
        self.assertFalse(
            AuditLog.objects.filter(
                action=AuditAction.DELETE,
                entity_type="Course",
                entity_id=str(course.id),
            ).exists()
        )
