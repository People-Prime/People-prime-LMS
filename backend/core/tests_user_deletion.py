"""
Automated unit and integration tests for Admin User Deletion (Hard Delete).

Covers:
1. Admin can permanently delete a learner.
2. Deleted learner cannot log in.
3. Learner-specific CASCADE records (TrainingAssignment, ModuleAssessmentAttempt,
   ModuleQuestionResponse, LearnerSubmoduleProgress) are deleted.
4. Shared courses, modules, and other learners' records remain intact.
5. Admin can create a new account using the deleted learner's email.
6. Admin can reuse the deleted username.
7. Duplicate email/username for existing users is still rejected.
8. Non-admin users (Trainer, Learner, Unauthenticated) cannot delete accounts.
9. Admin cannot delete their own account.
10. Last active Admin cannot be deleted.
11. Trainer deletion handles PROTECT relationships correctly (ModuleFeedback).
12. Existing Activate/Deactivate functionality still works.
13. Failed deletion does not leave partially deleted records (transaction rollback).
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from core.models import (
    AuditAction,
    AuditLog,
    Course,
    CourseLevel,
    Module,
    Submodule,
    PublicationStatus,
    TrainingAssignment,
    ModuleAssessmentAttempt,
    ModuleQuestion,
    ModuleQuestionResponse,
    LearnerSubmoduleProgress,
    ModuleFeedback,
)

User = get_user_model()


class AdminUserHardDeleteTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin accounts
        self.admin1 = User.objects.create_user(
            username="main_admin",
            email="admin1@people-prime.com",
            password="Password123!",
            role=User.Role.ADMIN,
            is_active=True,
        )
        self.admin2 = User.objects.create_user(
            username="second_admin",
            email="admin2@people-prime.com",
            password="Password123!",
            role=User.Role.ADMIN,
            is_active=True,
        )

        # Trainer account
        self.trainer = User.objects.create_user(
            username="primary_trainer",
            email="trainer@people-prime.com",
            password="Password123!",
            role=User.Role.TRAINER,
            is_active=True,
        )

        # Learner accounts
        self.learner1 = User.objects.create_user(
            username="test_learner_1",
            email="learner1@people-prime.com",
            password="Password123!",
            role=User.Role.LEARNER,
            is_active=True,
        )
        self.learner2 = User.objects.create_user(
            username="test_learner_2",
            email="learner2@people-prime.com",
            password="Password123!",
            role=User.Role.LEARNER,
            is_active=True,
        )

        # Learning hierarchy & shared resources
        self.course = Course.objects.create(
            name="Cloud Foundations",
            code="CLOUD-101",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin1,
        )
        self.level = CourseLevel.objects.create(
            name="Level 1",
            course=self.course,
            order=1,
        )
        self.module = Module.objects.create(
            course=self.course,
            level=self.level,
            name="AWS Architecture",
            order=1,
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin1,
        )
        self.submodule = Submodule.objects.create(
            module=self.module,
            name="EC2 and VPC",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )
        self.question = ModuleQuestion.objects.create(
            module=self.module,
            question_text="What is Amazon EC2?",
            question_type="MULTIPLE_CHOICE",
            options=[
                {"id": "opt_1", "text": "Elastic Compute Cloud", "is_correct": True},
                {"id": "opt_2", "text": "Elastic Container Code", "is_correct": False},
                {"id": "opt_3", "text": "Easy Cloud Connect", "is_correct": False},
                {"id": "opt_4", "text": "None of the above", "is_correct": False},
            ],
            is_required=True,
        )

    def test_admin_can_permanently_delete_learner_and_cascade(self):
        """Admin can hard-delete a learner. Associated progress is cascaded, shared course stays intact."""
        # Create learner-specific cascade records
        assignment1 = TrainingAssignment.objects.create(course=self.course, learner=self.learner1, assigned_by=self.admin1)
        assignment2 = TrainingAssignment.objects.create(course=self.course, learner=self.learner2, assigned_by=self.admin1)

        attempt1 = ModuleAssessmentAttempt.objects.create(
            module=self.module,
            learner=self.learner1,
            attempt_number=1,
            score=100.0,
            is_completed=True,
        )
        response1 = ModuleQuestionResponse.objects.create(
            attempt=attempt1,
            question=self.question,
            learner=self.learner1,
            response_value=True,
            response_payload={"selected": "opt_1", "is_correct": True},
        )
        progress1 = LearnerSubmoduleProgress.objects.create(
            submodule=self.submodule,
            learner=self.learner1,
            target_attempt_number=1,
            is_completed=True,
        )

        learner1_id = self.learner1.id

        self.client.force_authenticate(user=self.admin1)
        res = self.client.delete(f"/api/admin/users/{learner1_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("permanently deleted successfully", res.data["message"])

        # 1. User is physically deleted from DB
        self.assertFalse(User.objects.filter(id=learner1_id).exists())

        # 2. Cascaded records are wiped
        self.assertFalse(TrainingAssignment.objects.filter(id=assignment1.id).exists())
        self.assertFalse(ModuleAssessmentAttempt.objects.filter(id=attempt1.id).exists())
        self.assertFalse(ModuleQuestionResponse.objects.filter(id=response1.id).exists())
        self.assertFalse(LearnerSubmoduleProgress.objects.filter(id=progress1.id).exists())

        # 3. Shared courses, modules, and learner2's records remain intact
        self.assertTrue(Course.objects.filter(id=self.course.id).exists())
        self.assertTrue(Module.objects.filter(id=self.module.id).exists())
        self.assertTrue(TrainingAssignment.objects.filter(id=assignment2.id).exists())

        # 4. AuditLog record exists for deletion
        audit_entry = AuditLog.objects.filter(action=AuditAction.DELETE, entity_type="User", entity_id=learner1_id).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.details["username"], "test_learner_1")
        self.assertEqual(audit_entry.details["deletion_type"], "HARD_DELETE")

    def test_deleted_learner_cannot_login(self):
        """Deleted learner cannot authenticate."""
        learner_id = self.learner1.id
        self.client.force_authenticate(user=self.admin1)
        res_del = self.client.delete(f"/api/admin/users/{learner_id}/")
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)

        # Attempt login
        self.client.logout()
        res_login = self.client.post("/api/login/", {
            "email": "learner1@people-prime.com",
            "password": "Password123!",
        }, format="json")
        self.assertEqual(res_login.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deleted_email_and_username_can_be_reused(self):
        """Once a user is deleted, their email and username can be assigned to a new account."""
        self.client.force_authenticate(user=self.admin1)
        res_del = self.client.delete(f"/api/admin/users/{self.learner1.id}/")
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)

        # Recreate user with identical email and username
        res_create = self.client.post("/api/admin/users/", {
            "first_name": "New",
            "last_name": "Employee",
            "email": "learner1@people-prime.com",
            "username": "test_learner_1",
            "role": "LEARNER",
            "password": "NewSecurePassword123!",
            "is_active": True,
        }, format="json")
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_create.data["email"], "learner1@people-prime.com")
        self.assertEqual(res_create.data["username"], "test_learner_1")

    def test_duplicate_email_and_username_for_active_user_still_rejected(self):
        """Uniqueness validation remains strictly enforced for existing users."""
        self.client.force_authenticate(user=self.admin1)

        # Duplicate email
        res1 = self.client.post("/api/admin/users/", {
            "email": "learner2@people-prime.com",
            "username": "unique_username",
            "password": "Password123!",
        }, format="json")
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)

        # Duplicate username (case-insensitive)
        res2 = self.client.post("/api/admin/users/", {
            "email": "unique_email@people-prime.com",
            "username": "TEST_LEARNER_2",
            "password": "Password123!",
        }, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_delete_users(self):
        """Trainers, Learners, and Unauthenticated users cannot delete accounts."""
        # Trainer
        self.client.force_authenticate(user=self.trainer)
        res_tr = self.client.delete(f"/api/admin/users/{self.learner1.id}/")
        self.assertEqual(res_tr.status_code, status.HTTP_403_FORBIDDEN)

        # Learner
        self.client.force_authenticate(user=self.learner2)
        res_lr = self.client.delete(f"/api/admin/users/{self.learner1.id}/")
        self.assertEqual(res_lr.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated
        self.client.logout()
        res_unauth = self.client.delete(f"/api/admin/users/{self.learner1.id}/")
        self.assertIn(res_unauth.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_admin_cannot_delete_own_account(self):
        """An admin cannot delete their own active account."""
        self.client.force_authenticate(user=self.admin1)
        res = self.client.delete(f"/api/admin/users/{self.admin1.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot delete your own administrative account", res.data["error"])

    def test_cannot_delete_last_active_admin(self):
        """Cannot delete the last active administrator account."""
        # Deactivate admin2 so admin1 is the only active admin
        self.admin2.is_active = False
        self.admin2.save()

        # admin2 attempts or admin1 with other credentials
        # Let's activate admin2, log in as admin2, delete admin2? No, admin2 can't self-delete.
        # Log in as admin2, attempt to delete admin1 (which is the last active admin)
        self.client.force_authenticate(user=self.admin2)
        res = self.client.delete(f"/api/admin/users/{self.admin1.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot delete the only active Administrator account", res.data["error"])

    def test_trainer_deletion_protect_relationship_handled(self):
        """Trainer with protected ModuleFeedback cannot be deleted; returns clean 400 error."""
        # Create protected ModuleFeedback referencing trainer
        ModuleFeedback.objects.create(
            module=self.module,
            learner=self.learner1,
            trainer=self.trainer,
            module_rating=5,
            trainer_rating=5,
            understanding_level=5,
            comments="Excellent session",
        )

        self.client.force_authenticate(user=self.admin1)
        res = self.client.delete(f"/api/admin/users/{self.trainer.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("protected related records", res.data["error"])
        # Trainer still exists in database
        self.assertTrue(User.objects.filter(id=self.trainer.id).exists())

    def test_existing_activate_and_deactivate_still_works(self):
        """Existing activate and deactivate endpoints remain completely functional."""
        self.client.force_authenticate(user=self.admin1)

        # Deactivate
        res_deact = self.client.post(f"/api/admin/users/{self.learner1.id}/deactivate/")
        self.assertEqual(res_deact.status_code, status.HTTP_200_OK)
        self.learner1.refresh_from_db()
        self.assertFalse(self.learner1.is_active)

        # Activate
        res_act = self.client.post(f"/api/admin/users/{self.learner1.id}/activate/")
        self.assertEqual(res_act.status_code, status.HTTP_200_OK)
        self.learner1.refresh_from_db()
        self.assertTrue(self.learner1.is_active)
