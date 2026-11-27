"""
Tests for Phase 3: Edit User and Admin Password Reset.

Covers:
1. Admin can edit a user's name.
2. Admin can update a corporate email.
3. Invalid external email is rejected.
4. Duplicate email is rejected.
5. Duplicate username is rejected.
6. Profile editing preserves the existing password hash.
7. Profile editing preserves associated training records.
8. Non-admin cannot edit users.
9. Admin can reset another user's password.
10. New password works.
11. Old password no longer works after reset.
12. Invalid passwords are rejected.
13. Password hash is never returned by the API.
14. Non-admin cannot reset passwords.
15. Existing hard-delete functionality still works.
16. Existing authentication tests still pass.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import (
    Course,
    CourseLevel,
    Module,
    Submodule,
    TrainingAssignment,
)

User = get_user_model()


class Phase3EditUserAndResetPasswordTests(APITestCase):
    def setUp(self):
        # 1. Admin user
        self.admin = User.objects.create_superuser(
            username="test_admin_phase3",
            email="admin.phase3@people-prime.com",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )

        # 2. Trainer user
        self.trainer = User.objects.create_user(
            username="test_trainer_phase3",
            email="trainer.phase3@people-prime.com",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )

        # 3. Learner user
        self.learner = User.objects.create_user(
            username="test_learner_phase3",
            email="learner.phase3@people-prime.com",
            password="LearnerPassword123!",
            first_name="Jane",
            last_name="Doe",
            role=User.Role.LEARNER,
        )

        # 4. Another user for uniqueness conflicts
        self.other_user = User.objects.create_user(
            username="other_phase3",
            email="other.phase3@people-prime.com",
            password="OtherPassword123!",
            role=User.Role.LEARNER,
        )

    def test_01_admin_can_edit_user_name(self):
        """Admin can edit a user's first and last name."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/"
        res = self.client.patch(url, {
            "first_name": "Janet",
            "last_name": "Smith",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.learner.refresh_from_db()
        self.assertEqual(self.learner.first_name, "Janet")
        self.assertEqual(self.learner.last_name, "Smith")

    def test_02_admin_can_update_corporate_email(self):
        """Admin can update user email with a valid @people-prime.com domain."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/"
        res = self.client.patch(url, {
            "email": "janet.smith@people-prime.com",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.learner.refresh_from_db()
        self.assertEqual(self.learner.email, "janet.smith@people-prime.com")

    def test_03_invalid_external_email_is_rejected(self):
        """External non-@people-prime.com email addresses are rejected with 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/"
        for bad_email in ["janet@gmail.com", "janet@yahoo.com", "janet@company.org"]:
            res = self.client.patch(url, {"email": bad_email}, format="json")
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("corporate @people-prime.com", str(res.data))

    def test_04_duplicate_email_is_rejected(self):
        """Updating email to an existing email (case-insensitive) is rejected."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/"
        res = self.client.patch(url, {
            "email": "OTHER.PHASE3@PEOPLE-PRIME.COM",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already exists", str(res.data).lower())

    def test_05_duplicate_username_is_rejected(self):
        """Updating username to an existing username (case-insensitive) is rejected."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/"
        res = self.client.patch(url, {
            "username": "OTHER_PHASE3",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already exists", str(res.data).lower())

    def test_06_profile_editing_preserves_existing_password_hash(self):
        """Updating profile fields (name, email, username) does not change password hash."""
        self.client.force_authenticate(user=self.admin)
        initial_hash = self.learner.password
        url = f"/api/admin/users/{self.learner.id}/"
        res = self.client.patch(url, {
            "first_name": "UpdatedName",
            "password": "HackedPassword999!",  # Should be ignored/not processed by profile update
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.learner.refresh_from_db()
        self.assertEqual(self.learner.password, initial_hash)
        self.assertTrue(self.learner.check_password("LearnerPassword123!"))

    def test_07_profile_editing_preserves_associated_training_records(self):
        """Editing user profile does not disrupt or delete user training records."""
        course = Course.objects.create(name="Phase 3 Course", code="P3-001")
        level = CourseLevel.objects.create(course=course, order=1, name="Level 1")
        module = Module.objects.create(level=level, name="Module 1", order=1)
        submodule = Submodule.objects.create(module=module, name="Sub 1", order=1)

        assignment = TrainingAssignment.objects.create(
            learner=self.learner,
            module=module,
        )

        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/"
        res = self.client.patch(url, {
            "first_name": "TrainingLearner",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify assignment remains attached to the user
        self.assertTrue(TrainingAssignment.objects.filter(pk=assignment.pk, learner=self.learner).exists())

    def test_08_non_admin_cannot_edit_users(self):
        """Trainers and Learners cannot edit user profiles."""
        url = f"/api/admin/users/{self.learner.id}/"

        # Trainer -> 403
        self.client.force_authenticate(user=self.trainer)
        res_tr = self.client.patch(url, {"first_name": "TrainerEdit"}, format="json")
        self.assertEqual(res_tr.status_code, status.HTTP_403_FORBIDDEN)

        # Learner -> 403
        self.client.force_authenticate(user=self.learner)
        res_lr = self.client.patch(url, {"first_name": "LearnerEdit"}, format="json")
        self.assertEqual(res_lr.status_code, status.HTTP_403_FORBIDDEN)

    def test_09_admin_can_reset_another_user_password(self):
        """Admin can reset another user's password with matching confirmation."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/reset-password/"
        res = self.client.post(url, {
            "new_password": "BrandNewSecretPassword123!",
            "confirm_password": "BrandNewSecretPassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("reset successfully", res.data.get("message", ""))

    def test_10_new_password_works(self):
        """After password reset, user can authenticate with the new password."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/reset-password/"
        self.client.post(url, {
            "new_password": "NewValidPassword2026!",
            "confirm_password": "NewValidPassword2026!",
        }, format="json")

        self.learner.refresh_from_db()
        self.assertTrue(self.learner.check_password("NewValidPassword2026!"))

        # Test login endpoint
        login_res = self.client.post("/api/login/", {
            "email": self.learner.email,
            "password": "NewValidPassword2026!",
        }, format="json")
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    def test_11_old_password_no_longer_works_after_reset(self):
        """Old password no longer works after password reset."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/reset-password/"
        self.client.post(url, {
            "new_password": "NewSecretPassword2026!",
            "confirm_password": "NewSecretPassword2026!",
        }, format="json")

        self.learner.refresh_from_db()
        self.assertFalse(self.learner.check_password("LearnerPassword123!"))

        login_res = self.client.post("/api/login/", {
            "email": self.learner.email,
            "password": "LearnerPassword123!",
        }, format="json")
        self.assertEqual(login_res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_12_invalid_passwords_are_rejected(self):
        """Mismatched passwords or short/common passwords fail validation."""
        self.client.force_authenticate(user=self.admin)
        url = f"/api/admin/users/{self.learner.id}/reset-password/"

        # 1. Mismatched
        res_mismatch = self.client.post(url, {
            "new_password": "ComplexPassword123!",
            "confirm_password": "DifferentPassword123!",
        }, format="json")
        self.assertEqual(res_mismatch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("match", str(res_mismatch.data).lower())

        # 2. Too short / blank
        res_short = self.client.post(url, {
            "new_password": "123",
            "confirm_password": "123",
        }, format="json")
        self.assertEqual(res_short.status_code, status.HTTP_400_BAD_REQUEST)

    def test_13_password_hash_is_never_returned_by_api(self):
        """Profile update and password reset responses never include password hashes."""
        self.client.force_authenticate(user=self.admin)

        # Profile update response check
        patch_res = self.client.patch(f"/api/admin/users/{self.learner.id}/", {
            "first_name": "CleanName",
        }, format="json")
        self.assertNotIn("password", patch_res.data)

        # Reset password response check
        reset_res = self.client.post(f"/api/admin/users/{self.learner.id}/reset-password/", {
            "new_password": "AnotherSecretPassword123!",
            "confirm_password": "AnotherSecretPassword123!",
        }, format="json")
        self.assertNotIn("password", reset_res.data)

    def test_14_non_admin_cannot_reset_passwords(self):
        """Trainers and learners cannot invoke reset-password endpoint."""
        url = f"/api/admin/users/{self.learner.id}/reset-password/"
        payload = {
            "new_password": "AttackerPassword123!",
            "confirm_password": "AttackerPassword123!",
        }

        # Trainer -> 403
        self.client.force_authenticate(user=self.trainer)
        res_tr = self.client.post(url, payload, format="json")
        self.assertEqual(res_tr.status_code, status.HTTP_403_FORBIDDEN)

        # Learner -> 403
        self.client.force_authenticate(user=self.learner)
        res_lr = self.client.post(url, payload, format="json")
        self.assertEqual(res_lr.status_code, status.HTTP_403_FORBIDDEN)
