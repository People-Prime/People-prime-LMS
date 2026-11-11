from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import TestCase
from accounts.admin import UserAdmin

User = get_user_model()


class AccountsModelAndAdminTest(TestCase):
    """
    Unit tests for accounts.User custom model and UserAdmin integration.
    """

    def test_default_role_is_learner(self):
        user = User.objects.create_user(
            username="default_user",
            password="StrongPassword!123",
        )
        self.assertEqual(user.role, User.Role.LEARNER)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_role_choices(self):
        self.assertEqual(User.Role.ADMIN, "ADMIN")
        self.assertEqual(User.Role.TRAINER, "TRAINER")
        self.assertEqual(User.Role.LEARNER, "LEARNER")

    def test_user_admin_is_registered(self):
        self.assertIn(User, admin.site._registry)
        registered_admin = admin.site._registry[User]
        self.assertIsInstance(registered_admin, UserAdmin)

    def test_user_admin_includes_role_in_list_display_and_filter(self):
        registered_admin = admin.site._registry[User]
        self.assertIn("role", registered_admin.list_display)
        self.assertIn("role", registered_admin.list_filter)

    def test_staff_and_superuser_privileges_are_distinct_from_lms_admin(self):
        admin_user = User.objects.create_user(
            username="lms_admin_user",
            password="StrongPassword!123",
            role=User.Role.ADMIN,
        )
        # Verify creating an LMS ADMIN does NOT grant staff or superuser access
        self.assertEqual(admin_user.role, User.Role.ADMIN)
        self.assertFalse(admin_user.is_staff)
        self.assertFalse(admin_user.is_superuser)
