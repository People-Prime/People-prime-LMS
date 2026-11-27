"""
Automated unit and integration test suite for PeoplePrime LMS Phase 1 Authentication.

Covers:
1. Valid Admin company email login (@people-prime.com).
2. Valid Trainer company email login (@people-prime.com).
3. Valid Learner company email login (@people-prime.com).
4. Username-only login rejected (even when username matches an existing user).
5. Gmail login rejected.
6. Other non-company domain login rejected.
7. Uppercase company email accepted when registered email matches case-insensitively.
8. Incorrect password rejected.
9. Inactive account cannot log in (HTTP 403).
10. Admin cannot create a user with a Gmail or non-company email address (HTTP 400).
11. Admin can create a user with a valid company email address (HTTP 201).
12. Admin cannot create a trainer with a non-company email address (HTTP 400).
13. Public /api/register/ returns 404 Not Found (self-registration disabled).
14. Non-admin users (Trainer, Learner) cannot create users.
15. Existing role information returned upon successful login.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class Phase1AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin = User.objects.create_user(
            username="admin_user",
            email="admin.auth@people-prime.com",
            password="SecurePassword123!",
            role=User.Role.ADMIN,
            is_active=True,
        )

        # Trainer user
        self.trainer = User.objects.create_user(
            username="trainer_user",
            email="trainer.auth@people-prime.com",
            password="SecurePassword123!",
            role=User.Role.TRAINER,
            is_active=True,
        )

        # Learner user (Active)
        self.learner = User.objects.create_user(
            username="learner_user",
            email="learner.auth@people-prime.com",
            password="SecurePassword123!",
            role=User.Role.LEARNER,
            is_active=True,
        )

        # Inactive learner user
        self.inactive_learner = User.objects.create_user(
            username="inactive_learner",
            email="inactive.auth@people-prime.com",
            password="SecurePassword123!",
            role=User.Role.LEARNER,
            is_active=False,
        )

    def test_valid_admin_company_email_login(self):
        """Admin can log in using their registered @people-prime.com email."""
        res = self.client.post("/api/login/", {
            "email": "admin.auth@people-prime.com",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["user"]["role"], "ADMIN")
        self.assertEqual(res.json()["user"]["username"], "admin_user")

    def test_valid_trainer_company_email_login(self):
        """Trainer can log in using their registered @people-prime.com email."""
        res = self.client.post("/api/login/", {
            "email": "trainer.auth@people-prime.com",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["user"]["role"], "TRAINER")

    def test_valid_learner_company_email_login(self):
        """Learner can log in using their registered @people-prime.com email."""
        res = self.client.post("/api/login/", {
            "email": "learner.auth@people-prime.com",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["user"]["role"], "LEARNER")

    def test_username_only_login_rejected(self):
        """Username-only input is rejected even when the username belongs to a valid user."""
        res = self.client.post("/api/login/", {
            "username": "admin_user",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Please sign in using your registered @people-prime.com email address", res.json()["error"])

    def test_gmail_login_rejected(self):
        """Gmail address login is rejected with a domain policy error."""
        res = self.client.post("/api/login/", {
            "email": "someuser@gmail.com",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Please sign in using your registered @people-prime.com email address", res.json()["error"])

    def test_other_domain_login_rejected(self):
        """Any other external email domain is rejected."""
        res = self.client.post("/api/login/", {
            "email": "someuser@externaldomain.org",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Please sign in using your registered @people-prime.com email address", res.json()["error"])

    def test_case_insensitive_company_email_login_accepted(self):
        """Uppercase company email is resolved case-insensitively to the registered account."""
        res = self.client.post("/api/login/", {
            "email": "LEARNER.AUTH@PEOPLE-PRIME.COM",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()["user"]["id"], self.learner.id)

    def test_incorrect_password_rejected(self):
        """Valid company email with incorrect password returns 401 Unauthorized."""
        res = self.client.post("/api/login/", {
            "email": "learner.auth@people-prime.com",
            "password": "WrongPassword999!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.json()["error"], "Invalid username or password.")

    def test_inactive_account_cannot_login(self):
        """Inactive user with valid company credentials returns 403 Forbidden."""
        res = self.client.post("/api/login/", {
            "email": "inactive.auth@people-prime.com",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.json()["error"], "This account is inactive.")

    def test_admin_cannot_create_gmail_user(self):
        """Admin attempting to create a user with a Gmail domain receives 400 Bad Request."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/admin/users/", {
            "first_name": "Test",
            "last_name": "Gmail",
            "email": "test.gmail@gmail.com",
            "username": "test_gmail",
            "role": "LEARNER",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only corporate @people-prime.com email addresses are permitted", str(res.data))

    def test_admin_can_create_company_email_user(self):
        """Admin can create a user with a valid @people-prime.com email address."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/admin/users/", {
            "first_name": "New",
            "last_name": "Employee",
            "email": "new.employee@people-prime.com",
            "username": "new_employee",
            "role": "LEARNER",
            "password": "SecurePassword123!",
            "is_active": True,
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["email"], "new.employee@people-prime.com")
        self.assertTrue(User.objects.filter(email="new.employee@people-prime.com").exists())

    def test_admin_cannot_create_trainer_with_non_company_email(self):
        """Admin attempting to create a trainer with non-company email is rejected."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/admin/trainers/", {
            "username": "trainer_external",
            "email": "trainer@yahoo.com",
            "first_name": "External",
            "last_name": "Trainer",
            "password": "SecurePassword123!",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only corporate @people-prime.com email addresses are permitted", str(res.data))

    def test_public_register_endpoint_returns_404(self):
        """Public self-registration endpoint /api/register/ is disabled and returns 404 Not Found."""
        from django.urls import resolve, Resolver404
        with self.assertRaises(Resolver404):
            resolve("/api/register/")
        with self.assertRaises(Resolver404):
            resolve("/api/register")

    def test_non_admin_cannot_create_users(self):
        """Trainers and Learners cannot access the user creation endpoint."""
        # Trainer -> 403
        self.client.force_authenticate(user=self.trainer)
        res_tr = self.client.post("/api/admin/users/", {
            "email": "unauthorized.create@people-prime.com",
            "password": "Password123!",
        }, format="json")
        self.assertEqual(res_tr.status_code, status.HTTP_403_FORBIDDEN)

        # Learner -> 403
        self.client.force_authenticate(user=self.learner)
        res_lr = self.client.post("/api/admin/users/", {
            "email": "unauthorized.create2@people-prime.com",
            "password": "Password123!",
        }, format="json")
        self.assertEqual(res_lr.status_code, status.HTTP_403_FORBIDDEN)
