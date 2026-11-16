import json
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from unittest.mock import patch

from core.models import (
    AuditAction,
    AuditLog,
    CandidateType,
    Course,
    GroupMembership,
    LearnerGroup,
    Module,
    PublicationStatus,
    Submodule,
    TrainingAssignment,
)

User = get_user_model()


class CourseAutoPublishingTests(TestCase):
    """
    Test suite for Course automatic cascade publishing and content synchronization:
    1. Publishing a DRAFT course automatically publishes its DRAFT modules.
    2. Publishing a DRAFT course also publishes its DRAFT submodules.
    3. Existing PUBLISHED modules and submodules remain unchanged.
    4. ARCHIVED modules and submodules remain ARCHIVED.
    5. Synchronizing an already-PUBLISHED course publishes its remaining DRAFT content.
    6. Unauthorized users cannot publish or synchronize content.
    7. A failed operation rolls back all status changes.
    8. Audit logging records the publication action.
    9. Assigned learners can access the published curriculum.
    10. Unassigned learners still cannot access it.
    """

    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin = User.objects.create_user(
            username="admin_pub",
            email="admin_pub@example.com",
            password="adminpassword123",
            role=User.Role.ADMIN,
        )

        # Assigned Learner
        self.assigned_learner = User.objects.create_user(
            username="assigned_learner",
            email="assigned@example.com",
            password="learnerpass123",
            role=User.Role.LEARNER,
        )

        # Unassigned Learner
        self.unassigned_learner = User.objects.create_user(
            username="unassigned_learner",
            email="unassigned@example.com",
            password="learnerpass123",
            role=User.Role.LEARNER,
        )

    def test_publish_draft_course_cascades_to_modules_and_submodules(self):
        """1 & 2 & 3 & 4. Publishing a DRAFT course publishes draft modules and submodules, leaving published and archived intact."""
        course = Course.objects.create(
            name="DevOps Basics",
            code="DEV-101",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )
        mod_draft = Module.objects.create(course=course, name="Mod 1", order=1, status=PublicationStatus.DRAFT)
        mod_published = Module.objects.create(course=course, name="Mod 2", order=2, status=PublicationStatus.PUBLISHED)
        mod_archived = Module.objects.create(course=course, name="Mod 3", order=3, status=PublicationStatus.ARCHIVED)

        sub_draft_1 = Submodule.objects.create(module=mod_draft, name="Lesson 1.1", order=1, status=PublicationStatus.DRAFT)
        sub_pub_1 = Submodule.objects.create(module=mod_draft, name="Lesson 1.2", order=2, status=PublicationStatus.PUBLISHED)
        sub_arch_1 = Submodule.objects.create(module=mod_draft, name="Lesson 1.3", order=3, status=PublicationStatus.ARCHIVED)

        sub_draft_2 = Submodule.objects.create(module=mod_published, name="Lesson 2.1", order=1, status=PublicationStatus.DRAFT)
        sub_pub_2 = Submodule.objects.create(module=mod_published, name="Lesson 2.2", order=2, status=PublicationStatus.PUBLISHED)

        self.client.force_authenticate(user=self.admin)

        # Publish course via PATCH
        resp = self.client.patch(f"/api/courses/{course.id}/", {"status": PublicationStatus.PUBLISHED})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        course.refresh_from_db()
        self.assertEqual(course.status, PublicationStatus.PUBLISHED)

        # Draft module must now be PUBLISHED
        mod_draft.refresh_from_db()
        self.assertEqual(mod_draft.status, PublicationStatus.PUBLISHED)

        # Already published module remains PUBLISHED
        mod_published.refresh_from_db()
        self.assertEqual(mod_published.status, PublicationStatus.PUBLISHED)

        # Archived module remains ARCHIVED
        mod_archived.refresh_from_db()
        self.assertEqual(mod_archived.status, PublicationStatus.ARCHIVED)

        # Draft submodules must now be PUBLISHED
        sub_draft_1.refresh_from_db()
        self.assertEqual(sub_draft_1.status, PublicationStatus.PUBLISHED)

        sub_draft_2.refresh_from_db()
        self.assertEqual(sub_draft_2.status, PublicationStatus.PUBLISHED)

        # Already published submodules remain PUBLISHED
        sub_pub_1.refresh_from_db()
        self.assertEqual(sub_pub_1.status, PublicationStatus.PUBLISHED)
        sub_pub_2.refresh_from_db()
        self.assertEqual(sub_pub_2.status, PublicationStatus.PUBLISHED)

        # Archived submodule remains ARCHIVED
        sub_arch_1.refresh_from_db()
        self.assertEqual(sub_arch_1.status, PublicationStatus.ARCHIVED)

        # Verify audit log was created
        audit = AuditLog.objects.filter(
            action=AuditAction.PUBLISH,
            entity_type="Course",
            entity_id=str(course.id),
        ).latest("timestamp")
        self.assertEqual(audit.details.get("cascaded_modules_count"), 1)
        self.assertEqual(audit.details.get("cascaded_submodules_count"), 2)

    def test_sync_already_published_course_content(self):
        """5 & 8. Synchronizing an already-published course publishes remaining draft modules & submodules."""
        course = Course.objects.create(
            name="Existing Published Course",
            code="EPC-201",
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin,
        )
        mod1 = Module.objects.create(course=course, name="Mod 1", order=1, status=PublicationStatus.PUBLISHED)
        mod2 = Module.objects.create(course=course, name="Mod 2", order=2, status=PublicationStatus.DRAFT)
        mod_arch = Module.objects.create(course=course, name="Mod 3", order=3, status=PublicationStatus.ARCHIVED)

        sub1_draft = Submodule.objects.create(module=mod1, name="Lesson 1.1", order=1, status=PublicationStatus.DRAFT)
        sub2_draft = Submodule.objects.create(module=mod2, name="Lesson 2.1", order=1, status=PublicationStatus.DRAFT)
        sub_arch = Submodule.objects.create(module=mod_arch, name="Lesson 3.1", order=1, status=PublicationStatus.ARCHIVED)

        self.client.force_authenticate(user=self.admin)

        # 1. Test GET preview
        preview_resp = self.client.get(f"/api/courses/{course.id}/publish-content/")
        self.assertEqual(preview_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(preview_resp.data["draft_modules_count"], 1)
        self.assertEqual(preview_resp.data["draft_submodules_count"], 2)
        self.assertEqual(preview_resp.data["already_published_modules_count"], 1)
        self.assertEqual(preview_resp.data["archived_modules_count"], 1)
        self.assertEqual(preview_resp.data["archived_submodules_count"], 1)
        self.assertTrue(preview_resp.data["can_publish"])

        # 2. Test POST execute
        post_resp = self.client.post(f"/api/courses/{course.id}/publish-content/")
        self.assertEqual(post_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(post_resp.data["modules_published_count"], 1)
        self.assertEqual(post_resp.data["submodules_published_count"], 2)

        mod2.refresh_from_db()
        self.assertEqual(mod2.status, PublicationStatus.PUBLISHED)
        sub1_draft.refresh_from_db()
        self.assertEqual(sub1_draft.status, PublicationStatus.PUBLISHED)
        sub2_draft.refresh_from_db()
        self.assertEqual(sub2_draft.status, PublicationStatus.PUBLISHED)

        # Archived remains archived
        mod_arch.refresh_from_db()
        self.assertEqual(mod_arch.status, PublicationStatus.ARCHIVED)
        sub_arch.refresh_from_db()
        self.assertEqual(sub_arch.status, PublicationStatus.ARCHIVED)

        # Verify Audit Log
        audit = AuditLog.objects.filter(
            action=AuditAction.PUBLISH,
            entity_type="Course",
            entity_id=str(course.id),
        ).latest("timestamp")
        self.assertEqual(audit.details.get("action"), "publish_all_course_content")
        self.assertEqual(audit.details.get("modules_published_count"), 1)
        self.assertEqual(audit.details.get("submodules_published_count"), 2)

    def test_unauthorized_users_blocked_from_publishing(self):
        """6. Non-admin users cannot publish or synchronize course content."""
        course = Course.objects.create(
            name="Secret Course",
            code="SEC-001",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )

        # Unauthenticated
        resp1 = self.client.post(f"/api/courses/{course.id}/publish-content/")
        self.assertIn(resp1.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Authenticated as learner
        self.client.force_authenticate(user=self.assigned_learner)
        resp2 = self.client.post(f"/api/courses/{course.id}/publish-content/")
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

        resp3 = self.client.patch(f"/api/courses/{course.id}/", {"status": PublicationStatus.PUBLISHED})
        self.assertEqual(resp3.status_code, status.HTTP_403_FORBIDDEN)

    def test_atomic_rollback_on_publish_failure(self):
        """7. If an unexpected error occurs during synchronization, all changes roll back atomically."""
        course = Course.objects.create(
            name="Rollback Test",
            code="RBT-1",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )
        mod = Module.objects.create(course=course, name="Mod 1", order=1, status=PublicationStatus.DRAFT)
        sub = Submodule.objects.create(module=mod, name="Sub 1", order=1, status=PublicationStatus.DRAFT)

        self.client.force_authenticate(user=self.admin)

        with patch("core.models.Module.objects.filter", side_effect=Exception("Simulated failure")):
            with patch("core.api_views.logger.exception"):
                with patch("django.core.handlers.base.log_response"):
                    resp = self.client.post(f"/api/courses/{course.id}/publish-content/")
                    self.assertEqual(resp.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)

        course.refresh_from_db()
        mod.refresh_from_db()
        sub.refresh_from_db()

        self.assertEqual(course.status, PublicationStatus.DRAFT)
        self.assertEqual(mod.status, PublicationStatus.DRAFT)
        self.assertEqual(sub.status, PublicationStatus.DRAFT)

    def test_learner_visibility_after_publication(self):
        """9 & 10. Assigned learners see published content; unassigned learners cannot access it."""
        course = Course.objects.create(
            name="Assigned Course",
            code="ASN-1",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )
        mod1 = Module.objects.create(course=course, name="Module 1", order=1, status=PublicationStatus.DRAFT)
        sub1 = Submodule.objects.create(module=mod1, name="Lesson 1", order=1, status=PublicationStatus.DRAFT)

        # Assign course to assigned_learner
        TrainingAssignment.objects.create(
            course=course,
            learner=self.assigned_learner,
            assigned_by=self.admin,
            is_active=True,
        )

        # Before publication, assigned_learner cannot see the draft course
        self.client.force_authenticate(user=self.assigned_learner)
        resp_before = self.client.get(f"/api/courses/{course.id}/")
        self.assertEqual(resp_before.status_code, status.HTTP_404_NOT_FOUND)

        # Admin publishes all course content
        self.client.force_authenticate(user=self.admin)
        pub_resp = self.client.post(f"/api/courses/{course.id}/publish-content/")
        self.assertEqual(pub_resp.status_code, status.HTTP_200_OK)

        # Now assigned_learner can see the published course, module, and submodule
        self.client.force_authenticate(user=self.assigned_learner)
        resp_course = self.client.get(f"/api/courses/{course.id}/")
        self.assertEqual(resp_course.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_course.data["name"], "Assigned Course")

        resp_mod = self.client.get(f"/api/modules/{mod1.id}/")
        self.assertEqual(resp_mod.status_code, status.HTTP_200_OK)

        resp_sub = self.client.get(f"/api/submodules/{sub1.id}/")
        self.assertEqual(resp_sub.status_code, status.HTTP_200_OK)

        # Unassigned learner CANNOT see the course or its content
        self.client.force_authenticate(user=self.unassigned_learner)
        resp_unassigned_course = self.client.get(f"/api/courses/{course.id}/")
        self.assertEqual(resp_unassigned_course.status_code, status.HTTP_404_NOT_FOUND)

        resp_unassigned_mod = self.client.get(f"/api/modules/{mod1.id}/")
        self.assertEqual(resp_unassigned_mod.status_code, status.HTTP_404_NOT_FOUND)

        resp_unassigned_sub = self.client.get(f"/api/submodules/{sub1.id}/")
        self.assertEqual(resp_unassigned_sub.status_code, status.HTTP_404_NOT_FOUND)
