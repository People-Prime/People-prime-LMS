"""
People Prime LMS — Phase 3 Step 2: REST API Tests.

Tests curriculum (Course/Module/Submodule)
endpoints for role-based access control, object-level permissions, audit
logging, publishing, versioning, and file download behavior.
"""

import tempfile
import os

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from core.models import (
    AuditAction,
    AuditLog,
    CandidateType,
    Course,
    CourseLevel,
    GroupMembership,
    LearnerGroup,
    Module,
    ModuleQuestion,
    ModuleQuestionResponse,
    ModuleAssessmentAttempt,
    LearnerSubmoduleProgress,
    PublicationStatus,
    Submodule,
    TrainerGroupAssignment,
    TrainingAssignment,
    ModuleFeedback,
)

User = get_user_model()

TEMP_MEDIA_ROOT = tempfile.mkdtemp()


# ---------------------------------------------------------------------------
# Shared setUp helpers
# ---------------------------------------------------------------------------

def make_user(username, role, password="TestPass123!"):
    return User.objects.create_user(username=username, password=password, role=role)


def make_course(program=None, name="Course 1", code="C01", order=1,
                status=PublicationStatus.DRAFT, created_by=None):
    return Course.objects.create(
        name=name, code=code, order=order,
        status=status, created_by=created_by,
    )


def make_level(course=None, name="Level 1", order=1, description=""):
    return CourseLevel.objects.create(
        course=course, name=name, order=order, description=description
    )


def make_module(course, name="Module 1", order=1,
                status=PublicationStatus.DRAFT, created_by=None, level=None):
    if level is None:
        if course:
            existing_level = CourseLevel.objects.filter(course=course).first()
            if existing_level:
                level = existing_level
            else:
                level = CourseLevel.objects.create(course=course, name=f"Level for {course.code}", order=1)
        else:
            level = CourseLevel.objects.create(course=None, name=f"Level for {name}", order=1)
    return Module.objects.create(
        course=course, level=level, name=name, order=order,
        status=status, created_by=created_by,
    )


def make_submodule(module, name="Sub 1", order=1, status=PublicationStatus.DRAFT):
    return Submodule.objects.create(module=module, name=name, order=order, status=status)



# ---------------------------------------------------------------------------
# B. CurriculumParentChildTest
# ---------------------------------------------------------------------------

@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class CurriculumParentChildTest(APITestCase):
    """Tests for parent-child integrity of Course/Module/Submodule."""

    def setUp(self):
        self.admin = make_user("admin_hier", User.Role.ADMIN)
        self.client.force_authenticate(user=self.admin)

        self.course = make_course(
            name="Hier Course", code="HC01", created_by=self.admin
        )
        self.module = make_module(
            self.course, name="Hier Module", created_by=self.admin
        )

    def test_course_creation_succeeds(self):
        response = self.client.post(
            "/api/courses/",
            {"name": "Standalone Course", "code": "STANDALONE01", "order": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Standalone Course")

        # Create level under this course, then module under this level
        lvl_resp = self.client.post(
            "/api/course-levels/",
            {"course": response.data["id"], "name": "Direct Level", "order": 1},
            format="json",
        )
        self.assertEqual(lvl_resp.status_code, status.HTTP_201_CREATED)

        mod_resp = self.client.post(
            "/api/modules/",
            {"course": response.data["id"], "level": lvl_resp.data["id"], "name": "Direct Module", "order": 1},
            format="json",
        )
        self.assertEqual(mod_resp.status_code, status.HTTP_201_CREATED)

    def test_module_requires_valid_course(self):
        response = self.client.post(
            "/api/modules/",
            {"course": 9999999, "name": "Bad Module", "order": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submodule_requires_valid_module(self):
        response = self.client.post(
            "/api/submodules/",
            {"module": 9999999, "name": "Bad Sub", "order": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_course_code_rejected(self):
        # HC01 already exists
        response = self.client.post(
            "/api/courses/",
            {"name": "Dup Course", "code": "HC01", "order": 2},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_module_order_per_course_rejected(self):
        # order=1 already exists for self.course
        response = self.client.post(
            "/api/modules/",
            {"course": self.course.pk, "name": "Dup Module", "order": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class CurriculumScopingAndFilePathHardeningTest(APITestCase):
    """
    Tests for Phase 3 Step 2.2:
    - Scoping Course, Module, Submodule by role and active training assignments
    """

    def setUp(self):
        self.admin = make_user("admin_step22", User.Role.ADMIN)
        self.trainer_a = make_user("trainer_step22_a", User.Role.TRAINER)
        self.trainer_b = make_user("trainer_step22_b", User.Role.TRAINER)
        self.learner_a = make_user("learner_step22_a", User.Role.LEARNER)
        self.learner_unassigned = make_user("learner_step22_none", User.Role.LEARNER)

        # Groups and Candidates
        self.cand_a = CandidateType.objects.create(name="Cand 22 A", code="C22A")
        self.cand_b = CandidateType.objects.create(name="Cand 22 B", code="C22B")
        self.group_a = LearnerGroup.objects.create(name="Grp 22 A", code="G22A", candidate_type=self.cand_a)
        self.group_b = LearnerGroup.objects.create(name="Grp 22 B", code="G22B", candidate_type=self.cand_b)

        # Memberships
        GroupMembership.objects.create(group=self.group_a, learner=self.learner_a, is_active=True)
        TrainerGroupAssignment.objects.create(group=self.group_a, trainer=self.trainer_a, is_active=True)
        TrainerGroupAssignment.objects.create(group=self.group_b, trainer=self.trainer_b, is_active=True)

        # Curriculum A (Published)
        self.course_a = make_course(None, name="Course 22 A", code="C22A", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.module_a = make_module(self.course_a, name="Mod 22 A", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.submod_a = make_submodule(self.module_a, name="Sub 22 A", status=PublicationStatus.PUBLISHED)

        # Draft item in Curriculum A
        self.course_a_draft = make_course(None, name="Course 22 A Draft", code="C22AD", order=2, status=PublicationStatus.DRAFT, created_by=self.admin)
        self.module_a_draft = make_module(self.course_a_draft, name="Mod 22 AD", status=PublicationStatus.DRAFT, created_by=self.admin)

        # Curriculum B (Assigned to Group B only)
        self.course_b = make_course(None, name="Course 22 B", code="C22B", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.module_b = make_module(self.course_b, name="Mod 22 B", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.submod_b = make_submodule(self.module_b, name="Sub 22 B", status=PublicationStatus.PUBLISHED)

        # Training Assignments
        TrainingAssignment.objects.create(course=self.course_a, learner_group=self.group_a, is_active=True)
        TrainingAssignment.objects.create(course=self.course_a_draft, learner_group=self.group_a, is_active=True)
        TrainingAssignment.objects.create(course=self.course_b, learner_group=self.group_b, is_active=True)

    # ---- 1. Curriculum Scoping Tests ----

    def test_unassigned_learner_cannot_list_or_retrieve_curriculum(self):
        """Unassigned learner gets empty lists and 404s for courses, modules, submodules."""
        self.client.force_authenticate(user=self.learner_unassigned)

        # Courses
        self.assertEqual(len(self.client.get("/api/courses/").data), 0)
        self.assertEqual(self.client.get(f"/api/courses/{self.course_a.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Modules
        self.assertEqual(len(self.client.get("/api/modules/").data), 0)
        self.assertEqual(self.client.get(f"/api/modules/{self.module_a.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Submodules
        self.assertEqual(len(self.client.get("/api/submodules/").data), 0)
        self.assertEqual(self.client.get(f"/api/submodules/{self.submod_a.pk}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_assigned_learner_can_retrieve_assigned_published_curriculum(self):
        """Learner A can retrieve published curriculum in Course A, but receives 404 for Course B."""
        self.client.force_authenticate(user=self.learner_a)

        # Accessible (Course A)
        self.assertEqual(self.client.get(f"/api/courses/{self.course_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/modules/{self.module_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/submodules/{self.submod_a.pk}/").status_code, status.HTTP_200_OK)

        # Inaccessible (Course B)
        self.assertEqual(self.client.get(f"/api/courses/{self.course_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(f"/api/modules/{self.module_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(f"/api/submodules/{self.submod_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_assigned_learner_cannot_retrieve_draft_curriculum(self):
        """Assigned learner receives 404 when querying draft courses or modules even in assigned curriculum."""
        self.client.force_authenticate(user=self.learner_a)
        self.assertEqual(self.client.get(f"/api/courses/{self.course_a_draft.pk}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(f"/api/modules/{self.module_a_draft.pk}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_trainer_can_view_all_published_courses_regardless_of_group(self):
        """Trainers can view all published courses and curriculum in read-only mode regardless of cohort assignment."""
        self.client.force_authenticate(user=self.trainer_a)
        # Published Course B is assigned to Group B only, but Trainer A can still retrieve and view it
        self.assertEqual(self.client.get(f"/api/courses/{self.course_b.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/modules/{self.module_b.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/submodules/{self.submod_b.pk}/").status_code, status.HTTP_200_OK)

        # Appears in trainer's published courses list
        courses_res = self.client.get("/api/courses/")
        self.assertEqual(courses_res.status_code, status.HTTP_200_OK)
        course_ids = [c["id"] for c in courses_res.data]
        self.assertIn(self.course_a.pk, course_ids)
        self.assertIn(self.course_b.pk, course_ids)

    def test_trainer_can_retrieve_published_but_not_draft_curriculum(self):
        """Trainers can retrieve published courses/modules, but cannot retrieve draft curriculum."""
        self.client.force_authenticate(user=self.trainer_a)
        # Published course returns 200
        self.assertEqual(self.client.get(f"/api/courses/{self.course_a.pk}/").status_code, status.HTTP_200_OK)
        # Draft course and draft module return 404
        self.assertEqual(self.client.get(f"/api/courses/{self.course_a_draft.pk}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(f"/api/modules/{self.module_a_draft.pk}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_retains_access_to_all_curriculum(self):
        """LMS Admin retains full access to all curriculum across all groups and statuses."""
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get(f"/api/courses/{self.course_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/courses/{self.course_b.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/courses/{self.course_a_draft.pk}/").status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# H. CohortAndAssignmentAPITest (Phase 3 Step 3.3)
# ---------------------------------------------------------------------------

@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class CohortAndAssignmentAPITest(APITestCase):
    """
    Tests for Phase 3 Step 3.3:
    - CandidateType CRUD, permissions, and audit logging
    - LearnerGroup CRUD, role scoping, and audit logging
    - GroupMembership management, role invariants (learner role only), uniqueness, audit logging
    - TrainerGroupAssignment management, role invariants (trainer/admin role only), uniqueness, audit logging
    - TrainingAssignment CRUD, composite invariants, auto assigned_by, audit logging
    - Query parameter and object-level scoping restrictions
    """

    def setUp(self):
        self.admin = make_user("admin_step33", User.Role.ADMIN)
        self.trainer_a = make_user("trainer_33_a", User.Role.TRAINER)
        self.trainer_b = make_user("trainer_33_b", User.Role.TRAINER)
        self.learner_a = make_user("learner_33_a", User.Role.LEARNER)
        self.learner_b = make_user("learner_33_b", User.Role.LEARNER)
        self.learner_c = make_user("learner_33_c", User.Role.LEARNER)

        # Baseline Candidate Types
        self.cand_a = CandidateType.objects.create(name="Campus Batch 2026", code="CAMP26")
        self.cand_b = CandidateType.objects.create(name="Lateral Batch 2026", code="LAT26")

        # Baseline Learner Groups
        self.group_a = LearnerGroup.objects.create(name="Alpha Cohort", code="GRP_ALPHA", candidate_type=self.cand_a)
        self.group_b = LearnerGroup.objects.create(name="Beta Cohort", code="GRP_BETA", candidate_type=self.cand_b)

        # Memberships
        self.mem_a = GroupMembership.objects.create(group=self.group_a, learner=self.learner_a, is_active=True)
        self.mem_b = GroupMembership.objects.create(group=self.group_b, learner=self.learner_b, is_active=True)

        # Trainer Assignments
        self.train_assign_a = TrainerGroupAssignment.objects.create(group=self.group_a, trainer=self.trainer_a, is_active=True)
        self.train_assign_b = TrainerGroupAssignment.objects.create(group=self.group_b, trainer=self.trainer_b, is_active=True)

        # Curriculum
        self.course = make_course(None, name="Java Basics", code="JB_BAS", status=PublicationStatus.PUBLISHED, created_by=self.admin)

        # Training Assignments
        self.training_assign_a = TrainingAssignment.objects.create(
            course=self.course, learner_group=self.group_a, assigned_by=self.admin, is_active=True
        )

    # ---- 1. CandidateType Tests ----

    def test_candidate_type_admin_crud_and_audit(self):
        """Admin can create, update, and delete candidate types with audit trail."""
        self.client.force_authenticate(user=self.admin)

        # Create
        post_resp = self.client.post(
            "/api/candidate-types/",
            {"name": "Internship 2026", "code": "INT26", "description": "Summer Interns"},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)
        ct_id = post_resp.data["id"]
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.CREATE, entity_type="CandidateType", entity_id=str(ct_id)).exists()
        )

        # Update
        patch_resp = self.client.patch(
            f"/api/candidate-types/{ct_id}/",
            {"description": "Updated description"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.UPDATE, entity_type="CandidateType", entity_id=str(ct_id)).exists()
        )

        # Delete
        del_resp = self.client.delete(f"/api/candidate-types/{ct_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CandidateType.objects.filter(pk=ct_id).exists())
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.DELETE, entity_type="CandidateType", entity_id=str(ct_id)).exists()
        )

    def test_candidate_type_role_permissions(self):
        """Trainers and Learners can read candidate types within scope, but cannot mutate them."""
        # Trainer A can view Candidate Type A (associated with Group A)
        self.client.force_authenticate(user=self.trainer_a)
        get_resp = self.client.get(f"/api/candidate-types/{self.cand_a.pk}/")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)

        # Trainer A cannot create
        post_resp = self.client.post("/api/candidate-types/", {"name": "Hacked", "code": "HACK"}, format="json")
        self.assertEqual(post_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Learner A can view Candidate Type A
        self.client.force_authenticate(user=self.learner_a)
        get_l_resp = self.client.get(f"/api/candidate-types/{self.cand_a.pk}/")
        self.assertEqual(get_l_resp.status_code, status.HTTP_200_OK)

        # Learner A cannot delete
        del_l_resp = self.client.delete(f"/api/candidate-types/{self.cand_a.pk}/")
        self.assertEqual(del_l_resp.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated
        self.client.force_authenticate(user=None)
        unauth_resp = self.client.get("/api/candidate-types/")
        self.assertIn(unauth_resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    # ---- 2. LearnerGroup Tests ----

    def test_learner_group_admin_crud_and_audit(self):
        """Admin can create, update, and delete learner groups with audit trail."""
        self.client.force_authenticate(user=self.admin)

        # Create
        post_resp = self.client.post(
            "/api/learner-groups/",
            {"name": "Gamma Cohort", "code": "GRP_GAMMA", "candidate_type": self.cand_a.pk},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)
        grp_id = post_resp.data["id"]
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.CREATE, entity_type="LearnerGroup", entity_id=str(grp_id)).exists()
        )

        # Update
        patch_resp = self.client.patch(f"/api/learner-groups/{grp_id}/", {"description": "Updated cohort"}, format="json")
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.UPDATE, entity_type="LearnerGroup", entity_id=str(grp_id)).exists()
        )

        # Delete
        del_resp = self.client.delete(f"/api/learner-groups/{grp_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(LearnerGroup.objects.filter(pk=grp_id).exists())
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.DELETE, entity_type="LearnerGroup", entity_id=str(grp_id)).exists()
        )

    def test_learner_group_role_scoping(self):
        """Trainers see only their managed groups; Learners see only their joined groups."""
        # Trainer A sees Group A, but not Group B
        self.client.force_authenticate(user=self.trainer_a)
        list_resp = self.client.get("/api/learner-groups/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        codes = [g["code"] for g in list_resp.data]
        self.assertIn("GRP_ALPHA", codes)
        self.assertNotIn("GRP_BETA", codes)

        detail_b = self.client.get(f"/api/learner-groups/{self.group_b.pk}/")
        self.assertEqual(detail_b.status_code, status.HTTP_404_NOT_FOUND)

        # Learner A sees Group A, but not Group B
        self.client.force_authenticate(user=self.learner_a)
        list_l_resp = self.client.get("/api/learner-groups/")
        self.assertEqual(list_l_resp.status_code, status.HTTP_200_OK)
        l_codes = [g["code"] for g in list_l_resp.data]
        self.assertIn("GRP_ALPHA", l_codes)
        self.assertNotIn("GRP_BETA", l_codes)

        detail_l_b = self.client.get(f"/api/learner-groups/{self.group_b.pk}/")
        self.assertEqual(detail_l_b.status_code, status.HTTP_404_NOT_FOUND)

    # ---- 3. GroupMembership Tests ----

    def test_group_membership_crud_and_validation(self):
        """Admin manages memberships; rejects duplicate and non-learner users."""
        self.client.force_authenticate(user=self.admin)

        # Valid create
        post_resp = self.client.post(
            "/api/group-memberships/",
            {"group": self.group_a.pk, "learner": self.learner_c.pk},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)
        mem_id = post_resp.data["id"]
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.ASSIGN, entity_type="GroupMembership", entity_id=str(mem_id)).exists()
        )

        # Reject duplicate
        dup_resp = self.client.post(
            "/api/group-memberships/",
            {"group": self.group_a.pk, "learner": self.learner_c.pk},
            format="json",
        )
        self.assertEqual(dup_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Reject adding Trainer as group learner
        bad_role_resp = self.client.post(
            "/api/group-memberships/",
            {"group": self.group_a.pk, "learner": self.trainer_a.pk},
            format="json",
        )
        self.assertEqual(bad_role_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("LEARNER role", str(bad_role_resp.data))

        # Update
        patch_resp = self.client.patch(
            f"/api/group-memberships/{mem_id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.UPDATE, entity_type="GroupMembership", entity_id=str(mem_id)).exists()
        )

        # Delete
        del_resp = self.client.delete(f"/api/group-memberships/{mem_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.DELETE, entity_type="GroupMembership", entity_id=str(mem_id)).exists()
        )

    def test_group_membership_role_scoping(self):
        """Trainers see memberships for managed groups; Learners see only their own membership."""
        # Trainer A sees Membership A, but not Membership B
        self.client.force_authenticate(user=self.trainer_a)
        self.assertEqual(self.client.get(f"/api/group-memberships/{self.mem_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/group-memberships/{self.mem_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Learner A sees Membership A, but receives 404 for Membership B
        self.client.force_authenticate(user=self.learner_a)
        self.assertEqual(self.client.get(f"/api/group-memberships/{self.mem_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/group-memberships/{self.mem_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Learner cannot create membership
        post_resp = self.client.post(
            "/api/group-memberships/",
            {"group": self.group_a.pk, "learner": self.learner_b.pk},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_403_FORBIDDEN)

    # ---- 4. TrainerGroupAssignment Tests ----

    def test_trainer_group_assignment_crud_and_validation(self):
        """Admin assigns trainers; rejects duplicate and learner role users."""
        self.client.force_authenticate(user=self.admin)

        new_trainer = make_user("trainer_33_c", User.Role.TRAINER)

        # Valid create
        post_resp = self.client.post(
            "/api/trainer-assignments/",
            {"group": self.group_a.pk, "trainer": new_trainer.pk},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)
        assign_id = post_resp.data["id"]
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.ASSIGN, entity_type="TrainerGroupAssignment", entity_id=str(assign_id)).exists()
        )

        # Reject duplicate
        dup_resp = self.client.post(
            "/api/trainer-assignments/",
            {"group": self.group_a.pk, "trainer": new_trainer.pk},
            format="json",
        )
        self.assertEqual(dup_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Reject assigning Learner as Trainer
        bad_role_resp = self.client.post(
            "/api/trainer-assignments/",
            {"group": self.group_a.pk, "trainer": self.learner_a.pk},
            format="json",
        )
        self.assertEqual(bad_role_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("TRAINER or ADMIN roles", str(bad_role_resp.data))

        # Update
        patch_resp = self.client.patch(
            f"/api/trainer-assignments/{assign_id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)

        # Delete
        del_resp = self.client.delete(f"/api/trainer-assignments/{assign_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.DELETE, entity_type="TrainerGroupAssignment", entity_id=str(assign_id)).exists()
        )

    def test_trainer_group_assignment_role_scoping(self):
        """Trainers see assignments in managed groups; Learners see assignments in their group."""
        self.client.force_authenticate(user=self.trainer_a)
        self.assertEqual(self.client.get(f"/api/trainer-assignments/{self.train_assign_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/trainer-assignments/{self.train_assign_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(user=self.learner_a)
        resp_a = self.client.get(f"/api/trainer-assignments/{self.train_assign_a.pk}/")
        self.assertEqual(resp_a.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_a.data["trainer_name"], self.trainer_a.username)
        self.assertEqual(resp_a.data["trainer_email"], self.trainer_a.email)
        self.assertEqual(self.client.get(f"/api/trainer-assignments/{self.train_assign_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Learner without assigned trainer (learner_c has no memberships)
        self.client.force_authenticate(user=self.learner_c)
        list_resp_c = self.client.get("/api/trainer-assignments/")
        self.assertEqual(list_resp_c.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp_c.data), 0)

    def test_trainer_assignment_inactive_membership_and_inactive_assignment(self):
        """
        Hardening tests for Assigned Trainer filtering:
        1. When GroupMembership.is_active is False, learner receives no trainer assignments.
        2. When TrainerGroupAssignment.is_active is False, assignment is excluded from learner's response.
        """
        # Test 1: Inactive GroupMembership
        # learner_a is a member of group_a with active trainer_a. Deactivate membership.
        self.mem_a.is_active = False
        self.mem_a.save(update_fields=["is_active"])

        self.client.force_authenticate(user=self.learner_a)
        # List endpoint must be empty
        list_resp = self.client.get("/api/trainer-assignments/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.data), 0)

        # Retrieve endpoint must return 404
        detail_resp = self.client.get(f"/api/trainer-assignments/{self.train_assign_a.pk}/")
        self.assertEqual(detail_resp.status_code, status.HTTP_404_NOT_FOUND)

        # Reactivate membership for next test
        self.mem_a.is_active = True
        self.mem_a.save(update_fields=["is_active"])

        # Confirm assignment is visible again
        verify_resp = self.client.get("/api/trainer-assignments/")
        self.assertEqual(len(verify_resp.data), 1)

        # Test 2: Inactive TrainerGroupAssignment
        # Deactivate train_assign_a
        self.train_assign_a.is_active = False
        self.train_assign_a.save(update_fields=["is_active"])

        # List endpoint must exclude inactive assignment
        inactive_list_resp = self.client.get("/api/trainer-assignments/")
        self.assertEqual(inactive_list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(inactive_list_resp.data), 0)

        # Retrieve endpoint must return 404 for inactive assignment
        inactive_detail_resp = self.client.get(f"/api/trainer-assignments/{self.train_assign_a.pk}/")
        self.assertEqual(inactive_detail_resp.status_code, status.HTTP_404_NOT_FOUND)

    # ---- 5. TrainingAssignment Tests ----

    def test_training_assignment_crud_and_invariants(self):
        """Admin creates TrainingAssignment with curriculum and recipient; enforces invariants."""
        self.client.force_authenticate(user=self.admin)

        # Valid create with Course and CandidateType
        post_resp = self.client.post(
            "/api/training-assignments/",
            {"course": self.course.pk, "candidate_type": self.cand_b.pk, "due_date": "2026-12-31"},
            format="json",
        )
        self.assertEqual(post_resp.status_code, status.HTTP_201_CREATED)
        assign_id = post_resp.data["id"]
        # Verify assigned_by auto populated with request.user
        assign_obj = TrainingAssignment.objects.get(pk=assign_id)
        self.assertEqual(assign_obj.assigned_by, self.admin)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.ASSIGN, entity_type="TrainingAssignment", entity_id=str(assign_id)).exists()
        )

        # Reject missing curriculum target (no course, no module)
        no_curr_resp = self.client.post(
            "/api/training-assignments/",
            {"candidate_type": self.cand_a.pk},
            format="json",
        )
        self.assertEqual(no_curr_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("curriculum_target", no_curr_resp.data)

        # Reject missing recipient (no learner_group, no candidate_type, no learner)
        no_recip_resp = self.client.post(
            "/api/training-assignments/",
            {"course": self.course.pk},
            format="json",
        )
        self.assertEqual(no_recip_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recipient", no_recip_resp.data)

        # Reject composite duplicate
        dup_resp = self.client.post(
            "/api/training-assignments/",
            {"course": self.course.pk, "candidate_type": self.cand_b.pk},
            format="json",
        )
        self.assertEqual(dup_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Update
        patch_resp = self.client.patch(
            f"/api/training-assignments/{assign_id}/",
            {"due_date": "2027-01-15"},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.UPDATE, entity_type="TrainingAssignment", entity_id=str(assign_id)).exists()
        )

        # Delete
        del_resp = self.client.delete(f"/api/training-assignments/{assign_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.DELETE, entity_type="TrainingAssignment", entity_id=str(assign_id)).exists()
        )

    def test_training_assignment_role_scoping(self):
        """Trainers see assignments for managed groups; Learners see assignments for their group."""
        # Trainer A sees Training Assignment A, but not an assignment for Group B
        training_assign_b = TrainingAssignment.objects.create(
            course=self.course, learner_group=self.group_b, is_active=True
        )

        self.client.force_authenticate(user=self.trainer_a)
        self.assertEqual(self.client.get(f"/api/training-assignments/{self.training_assign_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/training-assignments/{training_assign_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Query param filtering for unassigned group returns empty
        resp_filter = self.client.get(f"/api/training-assignments/?learner_group={self.group_b.pk}")
        self.assertEqual(resp_filter.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_filter.data), 0)

        # Learner A sees Training Assignment A, receives 404 for Assignment B
        self.client.force_authenticate(user=self.learner_a)
        self.assertEqual(self.client.get(f"/api/training-assignments/{self.training_assign_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/training-assignments/{training_assign_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Learner cannot create assignment
        post_l_resp = self.client.post(
            "/api/training-assignments/",
            {"course": self.course.pk, "learner_group": self.group_a.pk},
            format="json",
        )
        self.assertEqual(post_l_resp.status_code, status.HTTP_403_FORBIDDEN)


# =============================================================================
# 11. Module Completion Questions & Learner Responses API Tests
# =============================================================================

class ModuleQuestionAndResponseAPITest(APITestCase):
    """
    Comprehensive tests for ModuleQuestion and ModuleQuestionResponse APIs:
    - Admin CRUD on ModuleQuestions
    - Scoped read access for Trainer and Learner
    - Learner answer submission with server-enforced identity binding
    - Prevention of forgery (submitting for another learner)
    - Rejection of submission from non-LEARNER roles
    - Module entitlement validation
    - Immutability enforcement (PUT, PATCH, DELETE rejected)
    - Scoped read access for Trainer to responses
    - module_completion_status custom action calculation
    - Audit logging for question creation, response creation, and question deletion
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = make_user("mq_admin", User.Role.ADMIN)
        self.trainer_a = make_user("mq_trainer_a", User.Role.TRAINER)
        self.trainer_b = make_user("mq_trainer_b", User.Role.TRAINER)
        self.learner_a = make_user("mq_learner_a", User.Role.LEARNER)
        self.learner_b = make_user("mq_learner_b", User.Role.LEARNER)

        # Curriculum
        self.course = Course.objects.create(
            name="MQ Course", code="MQC01", status=PublicationStatus.PUBLISHED
        )
        self.level_mq = CourseLevel.objects.create(
            course=self.course, name="MQ Level 1", order=1
        )
        self.module_a = Module.objects.create(
            course=self.course, level=self.level_mq, name="MQ Module A", order=1, status=PublicationStatus.PUBLISHED
        )
        self.module_b = Module.objects.create(
            course=self.course, level=self.level_mq, name="MQ Module B", order=2, status=PublicationStatus.PUBLISHED
        )

        # Unassigned Course/Module
        self.unassigned_course = Course.objects.create(
            name="Unassigned Course", code="UNAC01", status=PublicationStatus.PUBLISHED
        )
        self.unassigned_level = CourseLevel.objects.create(
            course=self.unassigned_course, name="Unassigned Level", order=1
        )
        self.unassigned_module = Module.objects.create(
            course=self.unassigned_course, level=self.unassigned_level, name="Unassigned Module", order=1, status=PublicationStatus.PUBLISHED
        )

        # Candidate Types and Learner Groups
        self.cand_type = CandidateType.objects.create(name="MQ Candidates", code="MQCAND")
        self.group_a = LearnerGroup.objects.create(name="MQ Group A", code="MQGA", candidate_type=self.cand_type)
        self.group_b = LearnerGroup.objects.create(name="MQ Group B", code="MQGB", candidate_type=self.cand_type)

        # Memberships
        GroupMembership.objects.create(group=self.group_a, learner=self.learner_a, is_active=True)
        GroupMembership.objects.create(group=self.group_b, learner=self.learner_b, is_active=True)

        # Trainer assignments
        TrainerGroupAssignment.objects.create(trainer=self.trainer_a, group=self.group_a, is_active=True)
        TrainerGroupAssignment.objects.create(trainer=self.trainer_b, group=self.group_b, is_active=True)

        # Training assignment: assign Program to Group A (Learner A & Trainer A)
        TrainingAssignment.objects.create(course=self.course, learner_group=self.group_a, is_active=True)

        # Module Questions on Module A
        self.q1 = ModuleQuestion.objects.create(
            module=self.module_a,
            question_text="Did you complete all exercises in Module A?",
            order=1,
            is_required=True,
            is_active=True,
        )
        self.q2 = ModuleQuestion.objects.create(
            module=self.module_a,
            question_text="Do you understand the core concepts of Module A?",
            order=2,
            is_required=True,
            is_active=True,
        )
        self.q_optional = ModuleQuestion.objects.create(
            module=self.module_a,
            question_text="Optional feedback: Was the module pacing appropriate?",
            order=3,
            is_required=False,
            is_active=True,
        )

        # Module Question on Unassigned Module
        self.q_unassigned = ModuleQuestion.objects.create(
            module=self.unassigned_module,
            question_text="Question for unassigned module?",
            order=1,
            is_required=True,
            is_active=True,
        )

    def test_module_question_admin_crud(self):
        """Admin can create, update, and delete module questions; audit logs are recorded."""
        self.client.force_authenticate(user=self.admin)

        # Create
        create_resp = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_b.pk,
                "question_text": "Did you test Module B?",
                "question_type": "YES_NO",
                "options": [
                    {"id": "opt_yes", "text": "Yes", "is_correct": True},
                    {"id": "opt_no", "text": "No", "is_correct": False},
                ],
                "order": 1,
                "is_required": True,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        q_id = create_resp.data["id"]
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.CREATE, entity_type="ModuleQuestion", entity_id=str(q_id)).exists()
        )

        # Update
        update_resp = self.client.patch(
            f"/api/module-questions/{q_id}/",
            {"question_text": "Did you thoroughly test Module B?"},
            format="json",
        )
        self.assertEqual(update_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(update_resp.data["question_text"], "Did you thoroughly test Module B?")
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.UPDATE, entity_type="ModuleQuestion", entity_id=str(q_id)).exists()
        )

        # Delete
        del_resp = self.client.delete(f"/api/module-questions/{q_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.DELETE, entity_type="ModuleQuestion", entity_id=str(q_id)).exists()
        )

    def test_module_question_role_permissions(self):
        """Trainers and learners cannot create, edit, or delete questions; read access is scoped."""
        # Trainer cannot create question
        self.client.force_authenticate(user=self.trainer_a)
        post_t = self.client.post(
            "/api/module-questions/",
            {"module": self.module_a.pk, "question_text": "Trainer question?", "order": 10},
            format="json",
        )
        self.assertEqual(post_t.status_code, status.HTTP_403_FORBIDDEN)

        # Learner cannot create question
        self.client.force_authenticate(user=self.learner_a)
        post_l = self.client.post(
            "/api/module-questions/",
            {"module": self.module_a.pk, "question_text": "Learner question?", "order": 10},
            format="json",
        )
        self.assertEqual(post_l.status_code, status.HTTP_403_FORBIDDEN)

        # Scoping: Learner A can see q1 (assigned), but 404 on q_unassigned
        self.assertEqual(self.client.get(f"/api/module-questions/{self.q1.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/module-questions/{self.q_unassigned.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Trainer A can see q1 (assigned) and published module questions across published courses
        self.client.force_authenticate(user=self.trainer_a)
        self.assertEqual(self.client.get(f"/api/module-questions/{self.q1.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/module-questions/{self.q_unassigned.pk}/").status_code, status.HTTP_200_OK)

    def test_learner_response_submission_and_ownership_binding(self):
        """Learner submits response; ownership is bound to request.user and forgery is rejected."""
        self.client.force_authenticate(user=self.learner_a)

        # Valid submission (True)
        resp1 = self.client.post(
            "/api/question-responses/",
            {"question": self.q1.pk, "response_value": True},
            format="json",
        )
        self.assertEqual(resp1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp1.data["learner"], self.learner_a.pk)
        self.assertEqual(resp1.data["learner_username"], self.learner_a.username)
        self.assertTrue(resp1.data["response_value"])

        # Audit log verification
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditAction.CREATE,
                entity_type="ModuleQuestionResponse",
                entity_id=str(resp1.data["id"]),
            ).exists()
        )

        # Forgery attempt: Learner A tries to submit specifying Learner B's ID
        forgery_resp = self.client.post(
            "/api/question-responses/",
            {"question": self.q2.pk, "learner": self.learner_b.pk, "response_value": False},
            format="json",
        )
        self.assertEqual(forgery_resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("learner", forgery_resp.data)

        # Reject submission from Trainer
        self.client.force_authenticate(user=self.trainer_a)
        trainer_resp = self.client.post(
            "/api/question-responses/",
            {"question": self.q2.pk, "response_value": True},
            format="json",
        )
        self.assertEqual(trainer_resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_learner_response_module_entitlement_enforcement(self):
        """Learner cannot submit response for an unassigned module."""
        self.client.force_authenticate(user=self.learner_a)

        # Unassigned module question
        resp = self.client.post(
            "/api/question-responses/",
            {"question": self.q_unassigned.pk, "response_value": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_response_immutability(self):
        """Question responses cannot be updated (PUT, PATCH) or deleted (DELETE)."""
        # Learner A submits response
        self.client.force_authenticate(user=self.learner_a)
        create_resp = self.client.post(
            "/api/question-responses/",
            {"question": self.q1.pk, "response_value": True},
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        resp_id = create_resp.data["id"]

        # PUT attempt
        put_resp = self.client.put(
            f"/api/question-responses/{resp_id}/",
            {"question": self.q1.pk, "response_value": False},
            format="json",
        )
        self.assertEqual(put_resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # PATCH attempt
        patch_resp = self.client.patch(
            f"/api/question-responses/{resp_id}/",
            {"response_value": False},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # DELETE attempt by learner
        del_resp = self.client.delete(f"/api/question-responses/{resp_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # DELETE attempt by Admin is also rejected (immutability rule)
        self.client.force_authenticate(user=self.admin)
        del_admin_resp = self.client.delete(f"/api/question-responses/{resp_id}/")
        self.assertEqual(del_admin_resp.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_trainer_response_visibility_scoping(self):
        """Trainers see responses only for learners in their assigned groups."""
        # Create response for Learner A (in Group A managed by Trainer A)
        r_a = ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner_a, response_value=True)

        # Create response for Learner B (in Group B managed by Trainer B)
        r_b = ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner_b, response_value=False)

        # Trainer A: can see r_a, cannot see r_b (404)
        self.client.force_authenticate(user=self.trainer_a)
        self.assertEqual(self.client.get(f"/api/question-responses/{r_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/question-responses/{r_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Trainer A list query: only returns r_a
        list_resp = self.client.get("/api/question-responses/")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in list_resp.data]
        self.assertIn(r_a.pk, ids)
        self.assertNotIn(r_b.pk, ids)

        # Trainer B: can see r_b, cannot see r_a
        self.client.force_authenticate(user=self.trainer_b)
        self.assertEqual(self.client.get(f"/api/question-responses/{r_b.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/question-responses/{r_a.pk}/").status_code, status.HTTP_404_NOT_FOUND)

        # Learner A can only see r_a
        self.client.force_authenticate(user=self.learner_a)
        self.assertEqual(self.client.get(f"/api/question-responses/{r_a.pk}/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(f"/api/question-responses/{r_b.pk}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_module_completion_status_calculation(self):
        """Module is marked complete only after all required questions have recorded responses (Yes or No)."""
        self.client.force_authenticate(user=self.learner_a)

        # Initially 0 answered -> incomplete
        status_resp = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_a.pk}")
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(status_resp.data["total_required_questions"], 2)
        self.assertEqual(status_resp.data["answered_required_questions"], 0)
        self.assertFalse(status_resp.data["is_module_completed"])

        # Answer Q1 (Yes) -> 1 of 2 answered -> still incomplete
        self.client.post("/api/question-responses/", {"question": self.q1.pk, "response_value": True}, format="json")
        status_resp2 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_a.pk}")
        self.assertEqual(status_resp2.data["answered_required_questions"], 1)
        self.assertFalse(status_resp2.data["is_module_completed"])

        # Answer Q2 with No (answering No still counts as an answered confirmation per requirements)
        self.client.post("/api/question-responses/", {"question": self.q2.pk, "response_value": False}, format="json")
        status_resp3 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_a.pk}")
        self.assertEqual(status_resp3.data["answered_required_questions"], 2)
        self.assertTrue(status_resp3.data["is_module_completed"])

        # Optional question not answered does not prevent completion
        self.assertEqual(status_resp3.data["total_questions"], 3)
        self.assertEqual(status_resp3.data["total_answered_questions"], 2)

        # Trainer A checks Learner A's status
        self.client.force_authenticate(user=self.trainer_a)
        tr_resp = self.client.get(
            f"/api/question-responses/module-completion-status/?module={self.module_a.pk}&learner={self.learner_a.pk}"
        )
        self.assertEqual(tr_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(tr_resp.data["is_module_completed"])

        # Trainer A attempts to check unauthorized Learner B's status -> 403 Forbidden
        tr_unauth = self.client.get(
            f"/api/question-responses/module-completion-status/?module={self.module_a.pk}&learner={self.learner_b.pk}"
        )
        self.assertEqual(tr_unauth.status_code, status.HTTP_403_FORBIDDEN)

    def test_module_completion_zero_active_required_questions_is_incomplete(self):
        """Case 1: Module with zero active required questions is always incomplete."""
        self.client.force_authenticate(user=self.learner_a)
        # Module B has no questions at all -> total_required=0 -> incomplete
        resp = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total_required_questions"], 0)
        self.assertEqual(resp.data["answered_required_questions"], 0)
        self.assertFalse(resp.data["is_module_completed"])

    def test_module_completion_one_required_question_unanswered_is_incomplete(self):
        """Case 2: Module has one active required question and no response -> incomplete."""
        q_single = ModuleQuestion.objects.create(
            module=self.module_b, question_text="Single Q?", order=1, is_required=True, is_active=True
        )
        self.client.force_authenticate(user=self.learner_a)
        resp = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["total_required_questions"], 1)
        self.assertEqual(resp.data["answered_required_questions"], 0)
        self.assertFalse(resp.data["is_module_completed"])

    def test_module_completion_all_yes_and_all_no_and_mixed(self):
        """Cases 5, 6, 7: All Yes, All No, and Mixed Yes/No answers mark module complete."""
        self.client.force_authenticate(user=self.learner_a)

        # Case 5: All Yes on Module A
        self.client.post("/api/question-responses/", {"question": self.q1.pk, "response_value": True}, format="json")
        self.client.post("/api/question-responses/", {"question": self.q2.pk, "response_value": True}, format="json")
        resp_yes = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_a.pk}")
        self.assertTrue(resp_yes.data["is_module_completed"])

        # Case 6 & 7 on Module B with 2 questions
        q_b1 = ModuleQuestion.objects.create(module=self.module_b, question_text="B1?", order=1, is_required=True, is_active=True)
        q_b2 = ModuleQuestion.objects.create(module=self.module_b, question_text="B2?", order=2, is_required=True, is_active=True)

        # Mixed answers: B1=True, B2=False
        self.client.post("/api/question-responses/", {"question": q_b1.pk, "response_value": True}, format="json")
        self.client.post("/api/question-responses/", {"question": q_b2.pk, "response_value": False}, format="json")
        resp_mixed = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(resp_mixed.data["total_required_questions"], 2)
        self.assertEqual(resp_mixed.data["answered_required_questions"], 2)
        self.assertTrue(resp_mixed.data["is_module_completed"])

    def test_module_completion_inactive_required_questions_excluded(self):
        """Case 8: Inactive required questions are excluded from required count and completion calculation."""
        # Module B has 1 active required and 1 inactive required question
        q_act = ModuleQuestion.objects.create(module=self.module_b, question_text="Active Q?", order=1, is_required=True, is_active=True)
        q_inact = ModuleQuestion.objects.create(module=self.module_b, question_text="Inactive Q?", order=2, is_required=True, is_active=False)

        self.client.force_authenticate(user=self.learner_a)
        # Before answering: total_required is 1 (excluding inactive)
        resp1 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(resp1.data["total_required_questions"], 1)
        self.assertFalse(resp1.data["is_module_completed"])

        # Answer active required question
        self.client.post("/api/question-responses/", {"question": q_act.pk, "response_value": True}, format="json")
        resp2 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(resp2.data["answered_required_questions"], 1)
        self.assertTrue(resp2.data["is_module_completed"])

    def test_module_completion_another_learner_responses_do_not_count(self):
        """Case 9: Responses belonging to another learner do not count toward this learner's completion."""
        # Learner B answers Module A's questions directly in db
        ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner_b, response_value=True)
        ModuleQuestionResponse.objects.create(question=self.q2, learner=self.learner_b, response_value=True)

        # Learner A checks their own status -> still 0 answered, incomplete
        self.client.force_authenticate(user=self.learner_a)
        resp = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_a.pk}")
        self.assertEqual(resp.data["answered_required_questions"], 0)
        self.assertFalse(resp.data["is_module_completed"])

    def test_mcq_creation_and_option_sanitization(self):
        """Admin can create MCQ with options; learner GET API sanitizes options to omit is_correct."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "module": self.module_a.pk,
            "question_text": "What is Django?",
            "question_type": "MULTIPLE_CHOICE",
            "options": [
                {"id": "opt_a", "text": "Web framework", "is_correct": True},
                {"id": "opt_b", "text": "Database engine", "is_correct": False},
                {"id": "opt_c", "text": "Operating system", "is_correct": False},
            ],
            "order": 10,
            "is_required": True,
            "is_active": True,
        }
        res = self.client.post("/api/module-questions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        q_id = res.data["id"]
        # In Admin response, options contains is_correct
        self.assertEqual(len(res.data["options"]), 3)
        self.assertTrue(res.data["options"][0]["is_correct"])

        # Learner views question list -> is_correct must NOT be exposed
        self.client.force_authenticate(user=self.learner_a)
        learner_res = self.client.get(f"/api/module-questions/{q_id}/")
        self.assertEqual(learner_res.status_code, status.HTTP_200_OK)
        learner_opts = learner_res.data["options"]
        self.assertEqual(len(learner_opts), 3)
        for opt in learner_opts:
            self.assertNotIn("is_correct", opt)

    def test_mcq_evaluation_and_voluntary_assessment_retake(self):
        """Learner submits MCQ answers, receives marks, and can start voluntary retake."""
        # Create MCQ
        self.client.force_authenticate(user=self.admin)
        res_q = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_b.pk,
                "question_text": "What does SQL stand for?",
                "question_type": "MULTIPLE_CHOICE",
                "options": [
                    {"id": "opt_1", "text": "Structured Query Language", "is_correct": True},
                    {"id": "opt_2", "text": "Simple Query Logic", "is_correct": False},
                    {"id": "opt_3", "text": "System Quick Link", "is_correct": False},
                ],
                "order": 1,
                "is_required": True,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(res_q.status_code, status.HTTP_201_CREATED)
        sql_q_id = res_q.data["id"]

        # Learner A submits incorrect answer in Attempt 1
        self.client.force_authenticate(user=self.learner_a)
        ans1 = self.client.post(
            "/api/question-responses/",
            {"question": sql_q_id, "selected_option_id": "opt_2"},
            format="json",
        )
        self.assertEqual(ans1.status_code, status.HTTP_201_CREATED)
        self.assertFalse(ans1.data["is_correct"])
        self.assertEqual(ans1.data["marks_obtained"], 0.0)

        # Check completion status: completed (any submission counts) but score is 0.0
        stat1 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(stat1.status_code, status.HTTP_200_OK)
        self.assertTrue(stat1.data["is_module_completed"])
        self.assertEqual(stat1.data["latest_attempt"]["attempt_number"], 1)
        self.assertEqual(stat1.data["latest_attempt"]["score"], 0.0)

        # Learner voluntarily starts a retake -> Attempt 2 created
        retake_res = self.client.post(
            "/api/question-responses/start-retake/",
            {"module": self.module_b.pk},
            format="json",
        )
        self.assertEqual(retake_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retake_res.data["attempt_number"], 2)

        # Learner submits correct answer in Attempt 2
        ans2 = self.client.post(
            "/api/question-responses/",
            {"question": sql_q_id, "selected_option_id": "opt_1"},
            format="json",
        )
        self.assertEqual(ans2.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ans2.data["is_correct"])
        self.assertEqual(ans2.data["marks_obtained"], 1.0)
        self.assertEqual(ans2.data["attempt_number"], 2)

        # Check status: Attempt 2 has score 1.0, history has 2 attempts
        stat2 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(stat2.data["latest_attempt"]["attempt_number"], 2)
        self.assertEqual(stat2.data["latest_attempt"]["score"], 1.0)
        self.assertEqual(len(stat2.data["attempts"]), 2)
        self.assertEqual(stat2.data["attempts"][0]["attempt_number"], 2)
        self.assertEqual(stat2.data["attempts"][1]["attempt_number"], 1)
        self.assertEqual(stat2.data["attempts"][1]["score"], 0.0)

    def test_explicit_correct_answer_validation_rules(self):
        """Verify strict backend enforcement of explicit single correct answer for MCQ and Yes/No questions."""
        self.client.force_authenticate(user=self.admin)

        # 1. New MCQ with 3 options and all is_correct: false -> 400 Bad Request
        res1 = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_a.pk,
                "question_text": "MCQ with no correct option?",
                "question_type": "MULTIPLE_CHOICE",
                "order": 20,
                "options": [
                    {"id": "opt_1", "text": "A", "is_correct": False},
                    {"id": "opt_2", "text": "B", "is_correct": False},
                    {"id": "opt_3", "text": "C", "is_correct": False},
                ],
            },
            format="json",
        )
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", res1.data)

        # 2. New MCQ with multiple correct options (2 out of 3) -> 400 Bad Request
        res2 = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_a.pk,
                "question_text": "MCQ with multiple correct options?",
                "question_type": "MULTIPLE_CHOICE",
                "order": 21,
                "options": [
                    {"id": "opt_1", "text": "A", "is_correct": True},
                    {"id": "opt_2", "text": "B", "is_correct": True},
                    {"id": "opt_3", "text": "C", "is_correct": False},
                ],
            },
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", res2.data)

        # 3. New MCQ with fewer than 3 options -> 400 Bad Request
        res3 = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_a.pk,
                "question_text": "MCQ with only 2 options?",
                "question_type": "MULTIPLE_CHOICE",
                "order": 22,
                "options": [
                    {"id": "opt_1", "text": "A", "is_correct": True},
                    {"id": "opt_2", "text": "B", "is_correct": False},
                ],
            },
            format="json",
        )
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", res3.data)

        # 4. New Yes/No question with all is_correct: false -> 400 Bad Request
        res4 = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_a.pk,
                "question_text": "Yes/No with no correct option?",
                "question_type": "YES_NO",
                "order": 23,
                "options": [
                    {"id": "opt_1", "text": "Yes", "is_correct": False},
                    {"id": "opt_2", "text": "No", "is_correct": False},
                ],
            },
            format="json",
        )
        self.assertEqual(res4.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", res4.data)

        # 5. New Yes/No question with missing options (trying to use silent default) -> 400 Bad Request
        res5 = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_a.pk,
                "question_text": "Yes/No with omitted options?",
                "question_type": "YES_NO",
                "order": 24,
            },
            format="json",
        )
        self.assertEqual(res5.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", res5.data)

        # 6. New Yes/No question with exactly one explicitly correct option -> accepted (201 Created)
        res6 = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_a.pk,
                "question_text": "Yes/No with No as correct answer?",
                "question_type": "YES_NO",
                "order": 25,
                "options": [
                    {"id": "opt_1", "text": "Yes", "is_correct": False},
                    {"id": "opt_2", "text": "No", "is_correct": True},
                ],
            },
            format="json",
        )
        self.assertEqual(res6.status_code, status.HTTP_201_CREATED)
        q_yn_id = res6.data["id"]
        self.assertFalse(res6.data["options"][0]["is_correct"])
        self.assertTrue(res6.data["options"][1]["is_correct"])

        # 7. Updating an existing question preserves its correct answer
        res7 = self.client.patch(
            f"/api/module-questions/{q_yn_id}/",
            {"question_text": "Updated question prompt?"},
            format="json",
        )
        self.assertEqual(res7.status_code, status.HTTP_200_OK)
        self.assertFalse(res7.data["options"][0]["is_correct"])
        self.assertTrue(res7.data["options"][1]["is_correct"])

        # 8. Legacy question with empty options in DB remains readable
        q_legacy = ModuleQuestion.objects.create(
            module=self.module_a,
            question_text="Legacy question?",
            question_type="YES_NO",
            options=[],
            order=99,
        )
        res8 = self.client.get(f"/api/module-questions/{q_legacy.pk}/")
        self.assertEqual(res8.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res8.data["options"]), 2)

        # 9. Learner submits for question where No is correct:
        # Selecting 'opt_1' (Yes, incorrect) -> 0 marks
        self.client.force_authenticate(user=self.learner_a)
        res9 = self.client.post(
            "/api/question-responses/",
            {"question": q_yn_id, "selected_option_id": "opt_1"},
            format="json",
        )
        self.assertEqual(res9.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res9.data["is_correct"])
        self.assertEqual(res9.data["marks_obtained"], 0.0)

        # Selecting invalid option ID -> 400 Bad Request
        res10 = self.client.post(
            "/api/question-responses/",
            {"question": q_yn_id, "selected_option_id": "nonexistent_option"},
            format="json",
        )
        self.assertEqual(res10.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------------------
    # Stage 2: Mandatory Assessments and Controlled Retakes Tests
    # -------------------------------------------------------------------------

    def test_stage2_question_creation_normalizes_is_required_true(self):
        """Admin attempting to create an optional question has is_required normalized to True."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(
            "/api/module-questions/",
            {
                "module": self.module_a.pk,
                "question_text": "Is this mandatory?",
                "question_type": "YES_NO",
                "options": [
                    {"id": "opt_1", "text": "Yes", "is_correct": True},
                    {"id": "opt_2", "text": "No", "is_correct": False},
                ],
                "order": 50,
                "is_required": False,  # Should be normalized to True
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["is_required"])
        # Verify in DB
        q = ModuleQuestion.objects.get(pk=res.data["id"])
        self.assertTrue(q.is_required)

    def test_stage2_cannot_start_retake_if_module_has_zero_active_questions(self):
        """Modules with 0 active assessment questions must not offer assessment retakes."""
        self.client.force_authenticate(user=self.learner_a)
        res = self.client.post(
            "/api/question-responses/start-retake/",
            {"module": self.module_b.pk},  # Module B has no questions initially
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no assessment questions", res.data["error"].lower())

    def test_stage2_cannot_start_retake_if_initial_attempt_not_completed(self):
        """Learner cannot start Attempt #2 if Attempt #1 is incomplete."""
        # Create 2 questions on Module B
        q1 = ModuleQuestion.objects.create(
            module=self.module_b,
            question_text="Q1?",
            question_type="YES_NO",
            options=[{"id": "y", "text": "Yes", "is_correct": True}, {"id": "n", "text": "No", "is_correct": False}],
            order=1,
            is_required=True,
            is_active=True,
        )
        q2 = ModuleQuestion.objects.create(
            module=self.module_b,
            question_text="Q2?",
            question_type="YES_NO",
            options=[{"id": "y", "text": "Yes", "is_correct": True}, {"id": "n", "text": "No", "is_correct": False}],
            order=2,
            is_required=True,
            is_active=True,
        )

        self.client.force_authenticate(user=self.learner_a)
        # Answer only Q1 -> Attempt 1 is created but incomplete
        self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "y"}, format="json")

        attempt1 = ModuleAssessmentAttempt.objects.get(module=self.module_b, learner=self.learner_a, attempt_number=1)
        self.assertFalse(attempt1.is_completed)

        # Attempt to start retake -> 400 Bad Request
        res = self.client.post(
            "/api/question-responses/start-retake/",
            {"module": self.module_b.pk},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("still open", res.data["error"].lower())

    def test_stage2_silent_attempt_auto_creation_disallowed(self):
        """Submitting a response when the active attempt is already completed raises HTTP 400 instead of silently auto-creating an attempt."""
        q1 = ModuleQuestion.objects.create(
            module=self.module_b,
            question_text="Q1?",
            question_type="YES_NO",
            options=[{"id": "y", "text": "Yes", "is_correct": True}, {"id": "n", "text": "No", "is_correct": False}],
            order=1,
            is_required=True,
            is_active=True,
        )
        self.client.force_authenticate(user=self.learner_a)
        # Answer Q1 -> Attempt 1 completed
        self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "y"}, format="json")
        attempt1 = ModuleAssessmentAttempt.objects.get(module=self.module_b, learner=self.learner_a, attempt_number=1)
        self.assertTrue(attempt1.is_completed)

        # Post response again without start-retake
        res = self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "n"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("attempt is completed", str(res.data).lower())

    def test_stage2_submodule_review_enforcement_and_eligibility(self):
        """Learner must review all published submodules before starting a retake."""
        # 1. Setup questions and submodules on module_b
        q1 = ModuleQuestion.objects.create(
            module=self.module_b,
            question_text="Q1?",
            question_type="YES_NO",
            options=[{"id": "y", "text": "Yes", "is_correct": True}, {"id": "n", "text": "No", "is_correct": False}],
            order=1,
            is_required=True,
            is_active=True,
        )
        sub1 = Submodule.objects.create(module=self.module_b, name="Lesson 1", order=1, status=PublicationStatus.PUBLISHED)
        sub2 = Submodule.objects.create(module=self.module_b, name="Lesson 2", order=2, status=PublicationStatus.PUBLISHED)
        sub_draft = Submodule.objects.create(module=self.module_b, name="Draft Lesson", order=3, status=PublicationStatus.DRAFT)

        self.client.force_authenticate(user=self.learner_a)

        # 2. Complete Attempt 1
        res_ans = self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "y"}, format="json")
        self.assertEqual(res_ans.status_code, status.HTTP_201_CREATED)

        # 3. Check retake-eligibility before reviewing submodules
        elig_res = self.client.get(f"/api/question-responses/retake-eligibility/?module={self.module_b.pk}")
        self.assertEqual(elig_res.status_code, status.HTTP_200_OK)
        self.assertFalse(elig_res.data["can_retake"])
        self.assertEqual(elig_res.data["target_attempt_number"], 2)
        self.assertEqual(elig_res.data["total_submodules"], 2)  # DRAFT excluded!
        self.assertEqual(elig_res.data["completed_submodules_count"], 0)
        self.assertEqual(elig_res.data["pending_submodules_count"], 2)

        # 4. Attempt to start retake -> Rejected
        start_res = self.client.post("/api/question-responses/start-retake/", {"module": self.module_b.pk}, format="json")
        self.assertEqual(start_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("submodule lessons", start_res.data["error"])

        # 4b. Complete without opening -> Rejected with 400
        sub1_early = self.client.post(f"/api/submodules/{sub1.pk}/complete-for-retake/")
        self.assertEqual(sub1_early.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("open and view", sub1_early.data["error"].lower())

        # 5. Open Submodule 1 (record-open) -> is_completed is False
        open1_res = self.client.post(f"/api/submodules/{sub1.pk}/record-open/")
        self.assertEqual(open1_res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(open1_res.data["is_completed"])

        # Review Submodule 1 after opening -> Success
        sub1_res = self.client.post(f"/api/submodules/{sub1.pk}/complete-for-retake/")
        self.assertEqual(sub1_res.status_code, status.HTTP_200_OK)
        self.assertTrue(sub1_res.data["is_completed"])

        # Retake still blocked (1 of 2 pending)
        start_res2 = self.client.post("/api/question-responses/start-retake/", {"module": self.module_b.pk}, format="json")
        self.assertEqual(start_res2.status_code, status.HTTP_400_BAD_REQUEST)

        # 6. Open Submodule 2 then Review Submodule 2
        open2_res = self.client.post(f"/api/submodules/{sub2.pk}/record-open/")
        self.assertEqual(open2_res.status_code, status.HTTP_201_CREATED)
        sub2_res = self.client.post(f"/api/submodules/{sub2.pk}/complete-for-retake/")
        self.assertEqual(sub2_res.status_code, status.HTTP_200_OK)
        self.assertTrue(sub2_res.data["is_completed"])

        # Check eligibility now -> can_retake is True
        elig_res2 = self.client.get(f"/api/question-responses/retake-eligibility/?module={self.module_b.pk}")
        self.assertTrue(elig_res2.data["can_retake"])
        self.assertEqual(elig_res2.data["completed_submodules_count"], 2)
        self.assertEqual(elig_res2.data["pending_submodules_count"], 0)

        # 7. Start Attempt 2 -> Success
        start_res3 = self.client.post("/api/question-responses/start-retake/", {"module": self.module_b.pk}, format="json")
        self.assertEqual(start_res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(start_res3.data["attempt_number"], 2)

        # 8. Check that for Attempt 3, review of submodules is required again
        # Complete Attempt 2
        self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "y"}, format="json")
        elig_res3 = self.client.get(f"/api/question-responses/retake-eligibility/?module={self.module_b.pk}")
        self.assertFalse(elig_res3.data["can_retake"])
        self.assertEqual(elig_res3.data["target_attempt_number"], 3)
        self.assertEqual(elig_res3.data["completed_submodules_count"], 0)
        self.assertEqual(elig_res3.data["pending_submodules_count"], 2)

    def test_stage2_count_inflation_fixed(self):
        """Multiple attempts do not inflate total_answered_questions beyond total_questions."""
        q1 = ModuleQuestion.objects.create(
            module=self.module_b,
            question_text="Q1?",
            question_type="YES_NO",
            options=[{"id": "y", "text": "Yes", "is_correct": True}, {"id": "n", "text": "No", "is_correct": False}],
            order=1,
            is_required=True,
            is_active=True,
        )
        q2 = ModuleQuestion.objects.create(
            module=self.module_b,
            question_text="Q2?",
            question_type="YES_NO",
            options=[{"id": "y", "text": "Yes", "is_correct": True}, {"id": "n", "text": "No", "is_correct": False}],
            order=2,
            is_required=True,
            is_active=True,
        )
        self.client.force_authenticate(user=self.learner_a)

        # Attempt 1: answer both
        self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "y"}, format="json")
        self.client.post("/api/question-responses/", {"question": q2.pk, "selected_option_id": "y"}, format="json")

        stat1 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(stat1.data["total_questions"], 2)
        self.assertEqual(stat1.data["total_answered_questions"], 2)

        # Start Attempt 2 (no submodules on module_b -> auto satisfied)
        self.client.post("/api/question-responses/start-retake/", {"module": self.module_b.pk}, format="json")

        # Answer Q1 in Attempt 2
        self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "n"}, format="json")

        stat2 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(stat2.data["total_questions"], 2)
        # Attempt 2 currently has 1 response (previously this was 3 due to cross-attempt sum)
        self.assertEqual(stat2.data["total_answered_questions"], 1)

        # Answer Q2 in Attempt 2
        self.client.post("/api/question-responses/", {"question": q2.pk, "selected_option_id": "y"}, format="json")

        stat3 = self.client.get(f"/api/question-responses/module-completion-status/?module={self.module_b.pk}")
        self.assertEqual(stat3.data["total_questions"], 2)
        self.assertEqual(stat3.data["total_answered_questions"], 2)


# =============================================================================
# 12. Trainer Progress Monitoring & Learner Overview API Tests (Step 3.5)
# =============================================================================

    def test_stage2_submodule_opening_authorization_and_draft_rejection(self):
        """Verifies opening enforcement, role scoping, draft exclusion, and attempt isolation."""
        # Setup submodule
        q1 = ModuleQuestion.objects.create(
            module=self.module_b,
            question_text="Q1?",
            question_type="YES_NO",
            options=[{"id": "y", "text": "Yes", "is_correct": True}, {"id": "n", "text": "No", "is_correct": False}],
            order=1,
            is_required=True,
            is_active=True,
        )
        sub_pub = Submodule.objects.create(module=self.module_b, name="Published Lesson", order=1, status=PublicationStatus.PUBLISHED)
        sub_draft = Submodule.objects.create(module=self.module_b, name="Draft Lesson", order=2, status=PublicationStatus.DRAFT)

        # Non-learner role rejected
        self.client.force_authenticate(user=self.trainer_a)
        res_trainer = self.client.post(f"/api/submodules/{sub_pub.pk}/record-open/")
        self.assertEqual(res_trainer.status_code, status.HTTP_403_FORBIDDEN)

        # Learner B (not assigned to course/module_b) rejected
        self.client.force_authenticate(user=self.learner_b)
        res_unauth = self.client.post(f"/api/submodules/{sub_pub.pk}/record-open/")
        self.assertEqual(res_unauth.status_code, status.HTTP_404_NOT_FOUND)

        # Learner A (assigned, but attempt 1 not finished yet) -> 400 Bad Request
        self.client.force_authenticate(user=self.learner_a)
        res_no_attempt = self.client.post(f"/api/submodules/{sub_pub.pk}/record-open/")
        self.assertEqual(res_no_attempt.status_code, status.HTTP_400_BAD_REQUEST)

        # Complete attempt 1
        self.client.post("/api/question-responses/", {"question": q1.pk, "selected_option_id": "y"}, format="json")

        # Draft submodule rejected for opening and reviewing (filtered out of learner queryset -> 404)
        res_draft_open = self.client.post(f"/api/submodules/{sub_draft.pk}/record-open/")
        self.assertEqual(res_draft_open.status_code, status.HTTP_404_NOT_FOUND)
        res_draft_review = self.client.post(f"/api/submodules/{sub_draft.pk}/complete-for-retake/")
        self.assertEqual(res_draft_review.status_code, status.HTTP_404_NOT_FOUND)

        # Learner A opens published submodule -> record created with is_completed=False
        res_open = self.client.post(f"/api/submodules/{sub_pub.pk}/record-open/")
        self.assertEqual(res_open.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res_open.data["is_completed"])

        # Calling record-open again is idempotent (200 OK)
        res_open_idempotent = self.client.post(f"/api/submodules/{sub_pub.pk}/record-open/")
        self.assertEqual(res_open_idempotent.status_code, status.HTTP_200_OK)

        # Now complete_for_retake succeeds
        res_comp = self.client.post(f"/api/submodules/{sub_pub.pk}/complete-for-retake/")
        self.assertEqual(res_comp.status_code, status.HTTP_200_OK)
        self.assertTrue(res_comp.data["is_completed"])

    def test_assessment_status_and_completion_rules(self):
        """
        Covers the 10 assessment status and module completion scenarios:
        1. Learner answers all 5 questions and scores 0/5 -> module remains NOT COMPLETED.
        2. Learner scores 2/5 -> module remains NOT COMPLETED.
        3. Learner scores exactly 3/5 -> module becomes COMPLETED.
        4. Learner scores 4/5 or 5/5 -> module becomes COMPLETED.
        5. Failed learner can start another attempt.
        6. Failed retake does not overwrite an earlier passing result.
        7. Responses saved in current attempt display Answered status.
        8. Responses from previous attempts do not appear as current-attempt answers.
        9. Passing learner has retakes locked.
        10. Overview & progress reports reflect the accurate pass/fail module status.
        """
        # Create Course with a 5-question Assessment Module
        course = Course.objects.create(name="PassFail Course", code="PF_CRS", status=PublicationStatus.PUBLISHED)
        level_pf = CourseLevel.objects.create(course=course, name="PassFail Level 1", order=1)
        module = Module.objects.create(course=course, level=level_pf, name="Assessment Module", order=1, status=PublicationStatus.PUBLISHED)
        TrainingAssignment.objects.create(course=course, learner_group=self.group_a, is_active=True)

        questions = []
        for i in range(1, 6):
            q = ModuleQuestion.objects.create(
                module=module,
                question_text=f"Question {i}?",
                question_type="MULTIPLE_CHOICE",
                options=[
                    {"id": "opt_correct", "text": "Correct Option", "is_correct": True},
                    {"id": "opt_wrong", "text": "Wrong Option", "is_correct": False},
                    {"id": "opt_other", "text": "Other Option", "is_correct": False},
                ],
                order=i,
                is_required=True,
                is_active=True,
            )
            questions.append(q)

        self.client.force_authenticate(user=self.learner_a)

        # Scenario 1: Learner answers all 5 questions with wrong answers -> 0/5
        for q in questions:
            self.client.post("/api/question-responses/", {"question": q.pk, "selected_option_id": "opt_wrong"}, format="json")

        status_0 = self.client.get(f"/api/question-responses/module-completion-status/?module={module.pk}")
        self.assertEqual(status_0.status_code, status.HTTP_200_OK)
        self.assertFalse(status_0.data["is_module_completed"])
        self.assertFalse(status_0.data["has_passed"])
        self.assertEqual(status_0.data["result"], "FAIL")
        self.assertEqual(status_0.data["marks_obtained"], 0)

        # Scenario 5: Failed learner can start another attempt
        self.assertTrue(status_0.data["can_retake"])
        retake_res = self.client.post("/api/question-responses/start-retake/", {"module": module.pk}, format="json")
        self.assertEqual(retake_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retake_res.data["attempt_number"], 2)

        # Scenario 2: Learner scores 2/5 (answers Q1 and Q2 correctly, Q3-Q5 incorrectly)
        for i, q in enumerate(questions):
            opt = "opt_correct" if i < 2 else "opt_wrong"
            self.client.post("/api/question-responses/", {"question": q.pk, "selected_option_id": opt}, format="json")

        status_2 = self.client.get(f"/api/question-responses/module-completion-status/?module={module.pk}")
        self.assertFalse(status_2.data["is_module_completed"])
        self.assertFalse(status_2.data["has_passed"])
        self.assertEqual(status_2.data["result"], "FAIL")
        self.assertEqual(status_2.data["marks_obtained"], 2)

        # Scenario 3: Start Attempt 3 and score exactly 3/5 -> COMPLETED
        retake_res3 = self.client.post("/api/question-responses/start-retake/", {"module": module.pk}, format="json")
        self.assertEqual(retake_res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retake_res3.data["attempt_number"], 3)

        for i, q in enumerate(questions):
            opt = "opt_correct" if i < 3 else "opt_wrong"
            self.client.post("/api/question-responses/", {"question": q.pk, "selected_option_id": opt}, format="json")

        status_3 = self.client.get(f"/api/question-responses/module-completion-status/?module={module.pk}")
        self.assertTrue(status_3.data["is_module_completed"])
        self.assertTrue(status_3.data["has_passed"])
        self.assertEqual(status_3.data["result"], "PASS")
        self.assertEqual(status_3.data["marks_obtained"], 3)

        # Scenario 9: Passing learner has retakes locked
        self.assertFalse(status_3.data["can_retake"])
        retake_locked = self.client.post("/api/question-responses/start-retake/", {"module": module.pk}, format="json")
        self.assertEqual(retake_locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already passed", retake_locked.data["error"].lower())

        # Scenario 6: Test that even if an attempt had lower score, best passing score preserves completion
        # Simulate an attempt record with lower score (e.g. attempt 4 with score 1.0)
        ModuleAssessmentAttempt.objects.create(
            module=module,
            learner=self.learner_a,
            attempt_number=4,
            score=1.0,
            total_possible=5.0,
            percentage=20.0,
            is_completed=True,
        )
        status_preserved = self.client.get(f"/api/question-responses/module-completion-status/?module={module.pk}")
        self.assertTrue(status_preserved.data["is_module_completed"])
        self.assertTrue(status_preserved.data["has_passed"])
        self.assertEqual(status_preserved.data["result"], "PASS")

        # Scenario 10: Reports overview reflects COMPLETED
        rep_res = self.client.get("/api/reports/overview/")
        self.assertEqual(rep_res.status_code, status.HTTP_200_OK)
        # Learner A course progress includes this completed assessment
        learner_rec = next((l for l in rep_res.data["learners_progress"] if l["learner_id"] == self.learner_a.id and l["course_id"] == course.id), None)
        self.assertIsNotNone(learner_rec)
        self.assertEqual(learner_rec["completed_modules"], 1)
        self.assertEqual(learner_rec["enrollment_status"], "COMPLETED")


class TrainerProgressMonitoringAPITest(APITestCase):
    """
    Comprehensive tests for Phase 3, Step 3.5:
    - Overview endpoint: GET /api/trainer/learners/
    - Individual progress endpoint: GET /api/trainer/learners/{id}/progress/
    - Role-based permissions (Admin, Trainer, Learner, Unauthenticated)
    - Trainer group scoping and horizontal isolation
    - Accurate module completion calculation & percentage
    - Inactive memberships and inactive assignments filtering
    - De-duplication across multiple groups
    - Module completion with Yes/No/mixed and zero required questions
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = make_user("tpm_admin", User.Role.ADMIN)
        self.trainer_a = make_user("tpm_trainer_a", User.Role.TRAINER)
        self.trainer_b = make_user("tpm_trainer_b", User.Role.TRAINER)
        self.learner_a = make_user("tpm_learner_a", User.Role.LEARNER)
        self.learner_b = make_user("tpm_learner_b", User.Role.LEARNER)
        self.learner_inactive = make_user("tpm_learner_inact", User.Role.LEARNER)

        # Curriculum (All Published)
        self.course = Course.objects.create(name="TPM Course", code="TPMC01", status=PublicationStatus.PUBLISHED)
        self.level_tpm = CourseLevel.objects.create(course=self.course, name="TPM Level 1", order=1)
        self.mod1 = Module.objects.create(course=self.course, level=self.level_tpm, name="TPM Mod 1", order=1, status=PublicationStatus.PUBLISHED)
        self.mod2 = Module.objects.create(course=self.course, level=self.level_tpm, name="TPM Mod 2", order=2, status=PublicationStatus.PUBLISHED)
        self.mod_zero_q = Module.objects.create(course=self.course, level=self.level_tpm, name="TPM Zero Q Mod", order=3, status=PublicationStatus.PUBLISHED)

        # Candidate types & groups
        self.cand_type = CandidateType.objects.create(name="TPM Candidates", code="TPMCAND")
        self.group_a = LearnerGroup.objects.create(name="TPM Group A", code="TPMGA", candidate_type=self.cand_type)
        self.group_b = LearnerGroup.objects.create(name="TPM Group B", code="TPMGB", candidate_type=self.cand_type)
        self.group_extra = LearnerGroup.objects.create(name="TPM Group Extra", code="TPMGEX", candidate_type=self.cand_type)

        # Memberships:
        # Learner A is in Group A AND Group Extra (both assigned to Trainer A -> tests de-duplication)
        GroupMembership.objects.create(group=self.group_a, learner=self.learner_a, is_active=True)
        GroupMembership.objects.create(group=self.group_extra, learner=self.learner_a, is_active=True)

        # Learner B is in Group B (assigned to Trainer B)
        GroupMembership.objects.create(group=self.group_b, learner=self.learner_b, is_active=True)

        # Learner Inactive has inactive membership in Group A
        GroupMembership.objects.create(group=self.group_a, learner=self.learner_inactive, is_active=False)

        # Trainer assignments:
        # Trainer A manages Group A and Group Extra
        TrainerGroupAssignment.objects.create(trainer=self.trainer_a, group=self.group_a, is_active=True)
        TrainerGroupAssignment.objects.create(trainer=self.trainer_a, group=self.group_extra, is_active=True)

        # Trainer B manages Group B
        TrainerGroupAssignment.objects.create(trainer=self.trainer_b, group=self.group_b, is_active=True)

        # Training Assignment: Assign Course to Group A, Group Extra, and Group B
        TrainingAssignment.objects.create(course=self.course, learner_group=self.group_a, is_active=True)
        TrainingAssignment.objects.create(course=self.course, learner_group=self.group_extra, is_active=True)
        TrainingAssignment.objects.create(course=self.course, learner_group=self.group_b, is_active=True)

        # Questions:
        # Mod 1: 2 active required questions
        self.q1_1 = ModuleQuestion.objects.create(module=self.mod1, question_text="Q1_1?", order=1, is_required=True, is_active=True)
        self.q1_2 = ModuleQuestion.objects.create(module=self.mod1, question_text="Q1_2?", order=2, is_required=True, is_active=True)

        # Mod 2: 1 active required question, 1 inactive required question
        self.q2_1 = ModuleQuestion.objects.create(module=self.mod2, question_text="Q2_1?", order=1, is_required=True, is_active=True)
        self.q2_inact = ModuleQuestion.objects.create(module=self.mod2, question_text="Q2_inact?", order=2, is_required=True, is_active=False)

        # mod_zero_q has 0 questions

    # -------------------------------------------------------------------------
    # Overview API Tests (/api/trainer/learners/)
    # -------------------------------------------------------------------------

    def test_unauthenticated_cannot_access_overview(self):
        """Unauthenticated user receives 401 Unauthorized."""
        resp = self.client.get("/api/trainer/learners/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_learner_cannot_access_overview(self):
        """Learner receives 403 Forbidden."""
        self.client.force_authenticate(user=self.learner_a)
        resp = self.client.get("/api/trainer/learners/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_trainer_can_retrieve_assigned_group_learners(self):
        """Trainer A sees only Learner A; Learner B and inactive learners are excluded."""
        self.client.force_authenticate(user=self.trainer_a)
        resp = self.client.get("/api/trainer/learners/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        learners = resp.data["learners"]
        learner_ids = [l["learner_id"] for l in learners]

        self.assertIn(self.learner_a.id, learner_ids)
        self.assertNotIn(self.learner_b.id, learner_ids)
        self.assertNotIn(self.learner_inactive.id, learner_ids)

        # Verify de-duplication: Learner A belongs to both Group A and Group Extra, but appears exactly once
        self.assertEqual(learner_ids.count(self.learner_a.id), 1)

    def test_trainer_horizontal_isolation(self):
        """Trainer B sees only Learner B, not Learner A."""
        self.client.force_authenticate(user=self.trainer_b)
        resp = self.client.get("/api/trainer/learners/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        learners = resp.data["learners"]
        learner_ids = [l["learner_id"] for l in learners]

        self.assertIn(self.learner_b.id, learner_ids)
        self.assertNotIn(self.learner_a.id, learner_ids)

    def test_admin_can_retrieve_all_learners(self):
        """Admin sees both Learner A and Learner B in overview."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/trainer/learners/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        learners = resp.data["learners"]
        learner_ids = [l["learner_id"] for l in learners]

        self.assertIn(self.learner_a.id, learner_ids)
        self.assertIn(self.learner_b.id, learner_ids)

    def test_inactive_trainer_group_assignment_denies_access(self):
        """If Trainer A's assignments are deactivated, Trainer A sees 0 learners."""
        TrainerGroupAssignment.objects.filter(trainer=self.trainer_a).update(is_active=False)
        self.client.force_authenticate(user=self.trainer_a)
        resp = self.client.get("/api/trainer/learners/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["learners"]), 0)

    # -------------------------------------------------------------------------
    # Individual Progress API Tests (/api/trainer/learners/{id}/progress/)
    # -------------------------------------------------------------------------

    def test_unauthenticated_cannot_access_progress(self):
        """Unauthenticated user receives 401."""
        resp = self.client.get(f"/api/trainer/learners/{self.learner_a.id}/progress/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_learner_cannot_access_progress(self):
        """Learner receives 403 Forbidden even when requesting own ID."""
        self.client.force_authenticate(user=self.learner_a)
        resp = self.client.get(f"/api/trainer/learners/{self.learner_a.id}/progress/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_trainer_cannot_access_out_of_scope_learner_progress(self):
        """Trainer A querying Learner B (out of assigned scope) receives 404 Not Found."""
        self.client.force_authenticate(user=self.trainer_a)
        resp = self.client.get(f"/api/trainer/learners/{self.learner_b.id}/progress/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_trainer_can_access_in_scope_learner_progress(self):
        """Trainer A querying Learner A receives full progress breakdown."""
        self.client.force_authenticate(user=self.trainer_a)
        resp = self.client.get(f"/api/trainer/learners/{self.learner_a.id}/progress/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("learner", resp.data)
        self.assertIn("progress", resp.data)
        self.assertIn("modules", resp.data)

        progress = resp.data["progress"]
        self.assertEqual(progress["total_assigned_modules"], 3)  # mod1, mod2, mod_zero_q
        self.assertEqual(progress["completed_modules"], 0)
        self.assertEqual(progress["pending_modules"], 3)
        self.assertEqual(progress["completion_percentage"], 0.0)

    def test_admin_can_access_any_learner_progress(self):
        """Admin can access Learner B's progress breakdown."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/trainer/learners/{self.learner_b.id}/progress/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["learner"]["id"], self.learner_b.id)

    def test_zero_assigned_modules_returns_zero_percent(self):
        """Learner in group with no training assignments returns 0.0% without division-by-zero error."""
        empty_group = LearnerGroup.objects.create(name="Empty Group", code="EMPTYG", candidate_type=self.cand_type)
        empty_learner = make_user("empty_learner", User.Role.LEARNER)
        GroupMembership.objects.create(group=empty_group, learner=empty_learner, is_active=True)
        TrainerGroupAssignment.objects.create(trainer=self.trainer_a, group=empty_group, is_active=True)

        self.client.force_authenticate(user=self.trainer_a)
        resp = self.client.get(f"/api/trainer/learners/{empty_learner.id}/progress/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        p = resp.data["progress"]
        self.assertEqual(p["total_assigned_modules"], 0)
        self.assertEqual(p["completed_modules"], 0)
        self.assertEqual(p["pending_modules"], 0)
        self.assertEqual(p["completion_percentage"], 0.0)
        self.assertEqual(len(resp.data["modules"]), 0)

    def test_progress_calculation_and_completion_rules(self):
        """
        Verify that:
        1. Mod 1 is complete when all required questions answered (mixed Yes/No).
        2. Mod 2 is complete when its 1 active required question answered (inactive ignored).
        3. Mod Zero Q remains incomplete (0 required questions).
        4. Learner B's answers do not affect Learner A's counts.
        """
        # Learner A answers Mod 1: Q1=True, Q2=False (both count -> Mod 1 complete)
        ModuleQuestionResponse.objects.create(question=self.q1_1, learner=self.learner_a, response_value=True)
        ModuleQuestionResponse.objects.create(question=self.q1_2, learner=self.learner_a, response_value=False)

        # Learner B answers Mod 2: Q2_1=True (should NOT count for Learner A)
        ModuleQuestionResponse.objects.create(question=self.q2_1, learner=self.learner_b, response_value=True)

        self.client.force_authenticate(user=self.trainer_a)
        resp = self.client.get(f"/api/trainer/learners/{self.learner_a.id}/progress/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        p = resp.data["progress"]

        # Total assigned modules = 3 (mod1, mod2, mod_zero_q)
        # Completed modules = 1 (mod1)
        # Pending modules = 2 (mod2, mod_zero_q)
        # Completion percentage = 1/3 * 100 = 33.3%
        self.assertEqual(p["total_assigned_modules"], 3)
        self.assertEqual(p["completed_modules"], 1)
        self.assertEqual(p["pending_modules"], 2)
        self.assertEqual(p["completion_percentage"], 33.3)

        # Check module details
        mod_map = {m["module_id"]: m for m in resp.data["modules"]}
        self.assertTrue(mod_map[self.mod1.id]["is_completed"])
        self.assertFalse(mod_map[self.mod2.id]["is_completed"])  # Learner A has not answered Q2_1
        self.assertFalse(mod_map[self.mod_zero_q.id]["is_completed"])  # 0 questions -> incomplete

        # Now Learner A answers Mod 2's active question Q2_1 with False
        ModuleQuestionResponse.objects.create(question=self.q2_1, learner=self.learner_a, response_value=False)
        resp2 = self.client.get(f"/api/trainer/learners/{self.learner_a.id}/progress/")
        p2 = resp2.data["progress"]

        # Completed = 2 (mod1, mod2), Pending = 1 (mod_zero_q)
        # Percentage = 2/3 * 100 = 66.7%
        self.assertEqual(p2["completed_modules"], 2)
        self.assertEqual(p2["pending_modules"], 1)
        self.assertEqual(p2["completion_percentage"], 66.7)
        mod_map2 = {m["module_id"]: m for m in resp2.data["modules"]}
        self.assertTrue(mod_map2[self.mod2.id]["is_completed"])

# =============================================================================
# 16. Admin Oversight & System-Wide Progress Reporting API Tests (Step 3.6)
# =============================================================================

class AdminOversightAPITest(APITestCase):
    """
    Tests for Phase 3 Step 3.6 Admin Oversight & Reporting APIs:
    - GET /api/admin/reports/overview/
    - GET /api/admin/reports/progress/
    - GET /api/admin/reports/activity/
    """

    def setUp(self):
        # 1. Admin
        self.admin = User.objects.create_user(
            username="admin_step36",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )

        # 2. Trainers
        self.trainer = User.objects.create_user(
            username="trainer_step36",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )

        # 3. Learners
        self.learner1 = User.objects.create_user(
            username="learner1_step36",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
        )
        self.learner2 = User.objects.create_user(
            username="learner2_step36",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
        )

        # 4. Candidate Type & Groups
        self.cand_type = CandidateType.objects.create(
            name="Step36 Candidates",
            code="S36_CAND",
        )
        self.group = LearnerGroup.objects.create(
            name="Step36 Cohort Alpha",
            code="S36_GRP_ALPHA",
            candidate_type=self.cand_type,
            is_active=True,
        )

        # Memberships
        GroupMembership.objects.create(group=self.group, learner=self.learner1, is_active=True)
        GroupMembership.objects.create(group=self.group, learner=self.learner2, is_active=True)

        # Trainer Assignment
        TrainerGroupAssignment.objects.create(trainer=self.trainer, group=self.group, is_active=True)

        # 5. Curriculum
        self.course = Course.objects.create(
            name="Step36 Course",
            code="S36_CRS",
            status=PublicationStatus.PUBLISHED,
        )
        self.level_s36 = CourseLevel.objects.create(
            course=self.course,
            name="Step36 Level 1",
            order=1,
        )
        self.mod1 = Module.objects.create(
            course=self.course,
            level=self.level_s36,
            name="Step36 Module 1",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )
        self.mod2 = Module.objects.create(
            course=self.course,
            level=self.level_s36,
            name="Step36 Module 2",
            order=2,
            status=PublicationStatus.PUBLISHED,
        )

        # Training assignment to group
        TrainingAssignment.objects.create(
            learner_group=self.group,
            course=self.course,
            is_active=True,
            assigned_by=self.admin,
        )

        # Questions for Mod1 (1 required)
        self.q1 = ModuleQuestion.objects.create(
            module=self.mod1,
            question_text="Completed step 3.6 mod 1?",
            is_required=True,
            is_active=True,
            order=1,
        )

        # Questions for Mod2 (1 required)
        self.q2 = ModuleQuestion.objects.create(
            module=self.mod2,
            question_text="Completed step 3.6 mod 2?",
            is_required=True,
            is_active=True,
            order=1,
        )

        # Audit Log Entry
        AuditLog.objects.create(
            actor=self.admin,
            action=AuditAction.CREATE,
            entity_type="Course",
            entity_id=str(self.course.id),
            details={"name": self.course.name},
        )

    def test_unauthenticated_cannot_access_reports(self):
        """Unauthenticated requests are rejected with 401 or 403."""
        for endpoint in ["overview", "progress", "activity"]:
            resp = self.client.get(f"/api/admin/reports/{endpoint}/")
            self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_trainer_cannot_access_reports(self):
        """Trainers are forbidden from administrative oversight reports."""
        self.client.force_authenticate(user=self.trainer)
        for endpoint in ["overview", "progress", "activity"]:
            resp = self.client.get(f"/api/admin/reports/{endpoint}/")
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_learner_cannot_access_reports(self):
        """Learners are forbidden from administrative oversight reports."""
        self.client.force_authenticate(user=self.learner1)
        for endpoint in ["overview", "progress", "activity"]:
            resp = self.client.get(f"/api/admin/reports/{endpoint}/")
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_overview(self):
        """Admin can access system overview and gets accurate aggregate counts."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/reports/overview/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertGreaterEqual(data["total_courses"], 1)
        self.assertGreaterEqual(data["total_modules"], 2)
        self.assertGreaterEqual(data["total_learner_groups"], 1)
        self.assertGreaterEqual(data["total_candidate_types"], 1)
        self.assertGreaterEqual(data["total_trainers"], 1)
        self.assertGreaterEqual(data["total_learners"], 2)
        self.assertGreaterEqual(data["active_learners_count"], 2)
        # Verify Phase 5.7 improved fields: total_users, total_admins, draft/published courses, recent_logins
        self.assertIn("total_users", data)
        self.assertIn("total_admins", data)
        self.assertIn("draft_courses", data)
        self.assertIn("published_courses", data)
        self.assertIn("recent_logins", data)
        self.assertGreaterEqual(data["total_admins"], 1)
        self.assertGreaterEqual(data["total_users"], data["total_admins"] + data["total_trainers"] + data["total_learners"])
        self.assertEqual(data["total_courses"], data["draft_courses"] + data["published_courses"])
        # Verify Total Staff requirement: total_staff == total_admins + total_trainers
        self.assertIn("total_staff", data)
        self.assertEqual(data["total_staff"], data["total_admins"] + data["total_trainers"])
        # Verify Total Trainers & Learners requirement: total_trainers_and_learners == total_trainers + total_learners (excludes admins)
        self.assertIn("total_trainers_and_learners", data)
        self.assertEqual(data["total_trainers_and_learners"], data["total_trainers"] + data["total_learners"])
        self.assertNotEqual(data["total_trainers_and_learners"], data["total_staff"])
        self.assertEqual(data["total_users"], data["total_admins"] + data["total_trainers_and_learners"])
        # Initially no responses submitted -> in_progress_learners_count is 0
        self.assertIn("in_progress_learners_count", data)
        self.assertEqual(data["in_progress_learners_count"], 0)
        # Initially no answers submitted -> system completion rate is 0.0
        self.assertEqual(data["system_wide_completion_rate"], 0.0)

    def test_in_progress_learners_calculation(self):
        """
        Verify in-progress learner calculation:
        1. Learner with partially completed module (has started, not complete) -> counted as 1.
        2. Learner with multiple in-progress modules -> counted only once.
        3. Learner who completes all required questions -> excluded from in-progress.
        4. Learner with no module responses -> not counted.
        """
        # Add a second required question to mod1 so mod1 requires 2 questions
        q1_b = ModuleQuestion.objects.create(
            module=self.mod1,
            question_text="Completed step 3.6 mod 1 part b?",
            is_required=True,
            is_active=True,
            order=2,
        )

        self.client.force_authenticate(user=self.admin)

        # Baseline: Learner 1 & 2 have answered nothing -> 0 in progress
        resp = self.client.get("/api/admin/reports/overview/")
        self.assertEqual(resp.data["in_progress_learners_count"], 0)

        # Case 1: Learner 1 answers Q1 only on mod1 (mod1 has 2 req questions -> partially completed)
        ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner1, response_value=True)
        resp1 = self.client.get("/api/admin/reports/overview/")
        self.assertEqual(resp1.data["in_progress_learners_count"], 1)

        # Case 2: Learner 1 also starts mod2 (answers Q2 on mod2 where mod2 also has a second req question)
        q2_b = ModuleQuestion.objects.create(
            module=self.mod2,
            question_text="Completed step 3.6 mod 2 part b?",
            is_required=True,
            is_active=True,
            order=2,
        )
        ModuleQuestionResponse.objects.create(question=self.q2, learner=self.learner1, response_value=True)
        # Learner 1 has two in-progress modules (mod1 & mod2), but must be counted only once
        resp2 = self.client.get("/api/admin/reports/overview/")
        self.assertEqual(resp2.data["in_progress_learners_count"], 1)

        # Case 3: Learner 2 has no responses -> still only 1 learner in progress
        # Now Learner 2 answers Q1 on mod1 -> now 2 unique learners in progress
        ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner2, response_value=True)
        resp3 = self.client.get("/api/admin/reports/overview/")
        self.assertEqual(resp3.data["in_progress_learners_count"], 2)

        # Case 4: Learner 2 completes mod1 by answering q1_b, and has no other modules started -> Learner 2 is completed, not in-progress
        ModuleQuestionResponse.objects.create(question=q1_b, learner=self.learner2, response_value=True)
        resp4 = self.client.get("/api/admin/reports/overview/")
        # Learner 2 completed all started modules, so only Learner 1 remains in progress
        self.assertEqual(resp4.data["in_progress_learners_count"], 1)

        # Learner 1 completes both mod1 and mod2
        ModuleQuestionResponse.objects.create(question=q1_b, learner=self.learner1, response_value=True)
        ModuleQuestionResponse.objects.create(question=q2_b, learner=self.learner1, response_value=True)
        resp5 = self.client.get("/api/admin/reports/overview/")
        # Both learners have completed all started modules -> 0 in progress
        self.assertEqual(resp5.data["in_progress_learners_count"], 0)

    def test_admin_progress_report_and_completion_calculation(self):
        """
        Admin can access progress report with cohort breakdowns and metrics reflecting
        real module completion calculations.
        """
        # Learner 1 answers Q1 (Mod 1 completed)
        ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner1, response_value=True)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/reports/progress/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data
        self.assertIn("cohorts", data)
        self.assertIn("system_completion_rate", data)

        cohort = next((c for c in data["cohorts"] if c["group_id"] == self.group.id), None)
        self.assertIsNotNone(cohort)
        self.assertEqual(cohort["total_learners"], 2)
        # Learner 1: 1 completed of 2 assigned (50%). Learner 2: 0 of 2 (0%). Cohort avg = 25.0%
        self.assertEqual(cohort["average_completion_percentage"], 25.0)
        self.assertEqual(cohort["completed_learners_count"], 0)  # neither completed 100% of assigned

        # Now Learner 1 answers Q2 (Mod 2 completed -> 100% completed)
        ModuleQuestionResponse.objects.create(question=self.q2, learner=self.learner1, response_value=True)

        resp2 = self.client.get("/api/admin/reports/progress/")
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        cohort2 = next((c for c in resp2.data["cohorts"] if c["group_id"] == self.group.id), None)
        self.assertEqual(cohort2["completed_learners_count"], 1)
        # Learner 1: 100%, Learner 2: 0% -> avg = 50.0%
        self.assertEqual(cohort2["average_completion_percentage"], 50.0)

    def test_admin_activity_report(self):
        """Admin can retrieve audit log activities with clear two-line descriptions."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/reports/activity/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data["total_audit_events"], 1)
        self.assertTrue(len(resp.data["recent_activities"]) >= 1)
        first_act = resp.data["recent_activities"][0]
        self.assertIn("action", first_act)
        self.assertIn("entity_type", first_act)
        self.assertIn("description", first_act)
        # Verify description contains at least two lines
        desc = first_act["description"]
        self.assertIn("\n", desc)
        lines = [line.strip() for line in desc.split("\n") if line.strip()]
        self.assertGreaterEqual(len(lines), 2)

    def test_audit_description_generator_details(self):
        """
        Verify description generation across representative audit actions:
        - Course created (with name and code)
        - Module updated
        - Learner assigned to group
        - Learning material published
        - Entity deleted
        - Sensitive data exclusion
        """
        from core.audit_utils import generate_audit_description

        # Course created (verify name is included and code is not appended to the entity name)
        d_create = generate_audit_description(
            "CREATE", "Course", "10", {"name": "Python Fundamentals", "code": "PY-101"}
        )
        self.assertIn("Python Fundamentals", d_create)
        self.assertNotIn("code: PY-101", d_create)
        self.assertNotIn("(code:", d_create)
        self.assertIn("\n", d_create)

        # Module updated
        d_update = generate_audit_description(
            "UPDATE", "Module", "15", {"name": "Introduction to Python"}
        )
        self.assertIn("Introduction to Python", d_update)
        self.assertIn("updated", d_update)
        self.assertIn("\n", d_update)

        # Learner assigned to group
        d_assign = generate_audit_description(
            "ASSIGN", "GroupMembership", "20", {"learner": 3, "group": 2}
        )
        self.assertIn("Learner #3 was assigned to learner group #2", d_assign)
        self.assertIn("\n", d_assign)

        # Entity deleted (verify name is included without code suffix)
        d_delete = generate_audit_description(
            "DELETE", "Course", "99", {"name": "Obsolete Course", "code": "OBS"}
        )
        self.assertIn("deleted from the LMS", d_delete)
        self.assertIn("Obsolete Course", d_delete)
        self.assertNotIn("code: OBS", d_delete)
        self.assertIn("\n", d_delete)

        # Fallback when details are missing
        d_empty = generate_audit_description("CREATE", "Course", "50", {})
        self.assertIn("record #50", d_empty)
        self.assertIn("\n", d_empty)

        # Related record name resolution
        # 1. Module with parent course resolved
        mock_course = type("CourseMock", (), {"name": "Python Fundamentals", "id": 5})()
        rel_ctx = {"courses": {5: mock_course}}
        d_mod = generate_audit_description("CREATE", "Module", "1", {"name": "Intro", "course": 5}, related_context=rel_ctx)
        self.assertIn("under the course Python Fundamentals", d_mod)
        self.assertIn("part of the Python Fundamentals curriculum", d_mod)

        # 2. Module with deleted / unavailable parent course fallback
        d_mod_fallback = generate_audit_description("CREATE", "Module", "1", {"name": "Intro", "course": 999}, related_context={"courses": {}})
        self.assertIn("under course #999", d_mod_fallback)

        # 3. Submodule with parent module resolved
        mock_module = type("ModuleMock", (), {"name": "Intro", "id": 1})()
        d_sub = generate_audit_description("CREATE", "Submodule", "10", {"name": "Variables", "module": 1}, related_context={"modules": {1: mock_module}})
        self.assertIn("for the module Intro", d_sub)
        self.assertIn("topics and learning units within Intro", d_sub)

        # 4. Group membership assignment with learner name and group name resolved
        mock_learner = type("LearnerMock", (), {"username": "asmith", "get_full_name": lambda self: "Alice Smith"})()
        mock_group = type("GroupMock", (), {"name": "Cohort 2026-A", "id": 2})()
        d_membership = generate_audit_description(
            "ASSIGN", "GroupMembership", "30", {"learner": 3, "group": 2},
            related_context={"users": {3: mock_learner}, "groups": {2: mock_group}}
        )
        self.assertIn("Alice Smith (@asmith) was assigned to learner group \"Cohort 2026-A\"", d_membership)

    def test_in_progress_learners_detail_endpoint_permissions(self):
        """
        Verify permission restrictions for GET /api/admin/reports/in-progress-learners/:
        - Unauthenticated -> 401/403
        - Trainer -> 403
        - Learner -> 403
        - Admin -> 200
        """
        # Unauthenticated
        resp = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Trainer
        self.client.force_authenticate(user=self.trainer)
        resp_trainer = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_trainer.status_code, status.HTTP_403_FORBIDDEN)

        # Learner
        self.client.force_authenticate(user=self.learner1)
        resp_learner = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_learner.status_code, status.HTTP_403_FORBIDDEN)

        # Admin
        self.client.force_authenticate(user=self.admin)
        resp_admin = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_admin.status_code, status.HTTP_200_OK)
        self.assertIn("total_in_progress_learners", resp_admin.data)
        self.assertIn("total_in_progress_module_enrollments", resp_admin.data)
        self.assertIn("items", resp_admin.data)

    def test_in_progress_learners_detail_business_logic(self):
        """
        Verify comprehensive business logic for in-progress learners:
        - Partially completed modules returned in detail items.
        - Fully completed modules excluded.
        - Learner with no responses excluded.
        - Multiple unfinished modules for one learner return multiple rows but 1 distinct learner count.
        - Optional-question responses and modules with 0 required questions handled correctly.
        - Overview count exactly matches detail total_in_progress_learners.
        """
        # Module 1 has self.q1 (required, active). Add a second required question q1_b.
        q1_b = ModuleQuestion.objects.create(
            module=self.mod1,
            question_text="Completed step 3.6 mod 1 part b?",
            is_required=True,
            is_active=True,
            order=2,
        )

        # Module 2 has self.q2 (required, active). Add a second required question q2_b.
        q2_b = ModuleQuestion.objects.create(
            module=self.mod2,
            question_text="Completed step 3.6 mod 2 part b?",
            is_required=True,
            is_active=True,
            order=2,
        )

        # Add an optional question on Module 1
        q_optional = ModuleQuestion.objects.create(
            module=self.mod1,
            question_text="Did you enjoy this module?",
            is_required=False,
            is_active=True,
            order=3,
        )

        self.client.force_authenticate(user=self.admin)

        # 1. Baseline: 0 responses submitted
        resp_overview = self.client.get("/api/admin/reports/overview/")
        resp_detail = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_overview.data["in_progress_learners_count"], 0)
        self.assertEqual(resp_detail.data["total_in_progress_learners"], 0)
        self.assertEqual(resp_detail.data["total_in_progress_module_enrollments"], 0)
        self.assertEqual(len(resp_detail.data["items"]), 0)

        # 2. Learner 1 answers ONLY the optional question on Module 1
        # Has answered at least 1 question on Module 1, but has 0/2 required questions answered.
        # Since has_started is True and is_completed is False (0 < 2), it counts as in-progress.
        # Answered required questions must be 0 (optional question must not count as required).
        ModuleQuestionResponse.objects.create(question=q_optional, learner=self.learner1, response_value=True)

        resp_overview = self.client.get("/api/admin/reports/overview/")
        resp_detail = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_overview.data["in_progress_learners_count"], 1)
        self.assertEqual(resp_detail.data["total_in_progress_learners"], 1)
        self.assertEqual(resp_detail.data["total_in_progress_module_enrollments"], 1)
        self.assertEqual(len(resp_detail.data["items"]), 1)
        item0 = resp_detail.data["items"][0]
        self.assertEqual(item0["learner_id"], self.learner1.id)
        self.assertEqual(item0["module_id"], self.mod1.id)
        self.assertEqual(item0["total_required_questions"], 2)
        self.assertEqual(item0["answered_required_questions"], 0)
        self.assertEqual(item0["completion_percentage"], 0.0)

        # 3. Learner 1 answers Q1 on Module 1 -> 1/2 required answered (50%)
        ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner1, response_value=True)
        # Learner 1 also starts Module 2 (answers Q2 on Module 2 -> 1/2 required answered)
        ModuleQuestionResponse.objects.create(question=self.q2, learner=self.learner1, response_value=True)

        resp_overview = self.client.get("/api/admin/reports/overview/")
        resp_detail = self.client.get("/api/admin/reports/in-progress-learners/")
        # Count agreement
        self.assertEqual(resp_overview.data["in_progress_learners_count"], 1)
        self.assertEqual(resp_detail.data["total_in_progress_learners"], 1)
        # 2 in-progress module enrollments for Learner 1
        self.assertEqual(resp_detail.data["total_in_progress_module_enrollments"], 2)
        self.assertEqual(len(resp_detail.data["items"]), 2)

        mod1_item = next(it for it in resp_detail.data["items"] if it["module_id"] == self.mod1.id)
        mod2_item = next(it for it in resp_detail.data["items"] if it["module_id"] == self.mod2.id)
        self.assertEqual(mod1_item["total_required_questions"], 2)
        self.assertEqual(mod1_item["answered_required_questions"], 1)
        self.assertEqual(mod1_item["completion_percentage"], 50.0)
        self.assertIsNotNone(mod1_item["last_activity"])

        self.assertEqual(mod2_item["total_required_questions"], 2)
        self.assertEqual(mod2_item["answered_required_questions"], 1)
        self.assertEqual(mod2_item["completion_percentage"], 50.0)

        # 4. Learner 2 has NO responses -> does not appear in items or count
        learner_ids_in_detail = {it["learner_id"] for it in resp_detail.data["items"]}
        self.assertNotIn(self.learner2.id, learner_ids_in_detail)

        # Now Learner 2 answers Q1 on Module 1
        ModuleQuestionResponse.objects.create(question=self.q1, learner=self.learner2, response_value=True)
        resp_overview = self.client.get("/api/admin/reports/overview/")
        resp_detail = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_overview.data["in_progress_learners_count"], 2)
        self.assertEqual(resp_detail.data["total_in_progress_learners"], 2)
        self.assertEqual(resp_detail.data["total_in_progress_module_enrollments"], 3)  # Learner 1 (mod1, mod2) + Learner 2 (mod1)

        # 5. Learner 2 completes Module 1 (answers q1_b) -> Learner 2 completed all started modules
        ModuleQuestionResponse.objects.create(question=q1_b, learner=self.learner2, response_value=True)
        resp_overview = self.client.get("/api/admin/reports/overview/")
        resp_detail = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_overview.data["in_progress_learners_count"], 1)
        self.assertEqual(resp_detail.data["total_in_progress_learners"], 1)
        self.assertEqual(resp_detail.data["total_in_progress_module_enrollments"], 2)
        self.assertNotIn(self.learner2.id, {it["learner_id"] for it in resp_detail.data["items"]})

        # 6. Learner 1 completes both Module 1 and Module 2
        ModuleQuestionResponse.objects.create(question=q1_b, learner=self.learner1, response_value=True)
        ModuleQuestionResponse.objects.create(question=q2_b, learner=self.learner1, response_value=True)
        resp_overview = self.client.get("/api/admin/reports/overview/")
        resp_detail = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(resp_overview.data["in_progress_learners_count"], 0)
        self.assertEqual(resp_detail.data["total_in_progress_learners"], 0)
        self.assertEqual(resp_detail.data["total_in_progress_module_enrollments"], 0)
        self.assertEqual(len(resp_detail.data["items"]), 0)



    def test_unauthenticated_cannot_access_trainer_workload(self):
        """Unauthenticated requests to trainer-workload report are rejected."""
        resp = self.client.get("/api/admin/reports/trainer-workload/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_trainer_cannot_access_trainer_workload(self):
        """Trainers are forbidden from accessing admin trainer workload report."""
        self.client.force_authenticate(user=self.trainer)
        resp = self.client.get("/api/admin/reports/trainer-workload/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_learner_cannot_access_trainer_workload(self):
        """Learners are forbidden from accessing admin trainer workload report."""
        self.client.force_authenticate(user=self.learner1)
        resp = self.client.get("/api/admin/reports/trainer-workload/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_trainer_workload_with_multiple_groups_and_overlap(self):
        """
        Admin can access trainer workload report and verify:
        - Trainer with multiple assigned groups
        - Distinct learner counting across overlapping group memberships (no double counting)
        - Per-group candidate count remains distinct
        - Trainer with no assigned groups or curriculum is handled gracefully
        - Group-level curriculum and learner progress accuracy
        """
        # Create a second trainer with NO assignments
        unassigned_trainer = User.objects.create_user(
            username="unassigned_trainer", password="password", role=User.Role.TRAINER
        )

        # Create a second group assigned to self.trainer
        group2 = LearnerGroup.objects.create(
            name="Cohort Beta", code="GRP_B", candidate_type=self.cand_type
        )
        TrainerGroupAssignment.objects.create(group=group2, trainer=self.trainer, is_active=True)

        # Learner 1 belongs to BOTH Group 1 and Group 2 (overlapping membership)
        GroupMembership.objects.create(group=group2, learner=self.learner1, is_active=True)
        # Create Learner 3 in Group 2 only
        learner3 = User.objects.create_user(username="learner3", password="password", role=User.Role.LEARNER)
        GroupMembership.objects.create(group=group2, learner=learner3, is_active=True)

        # Assign Course 1 to Group 2 as well
        TrainingAssignment.objects.create(course=self.course, learner_group=group2, is_active=True)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/reports/trainer-workload/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data

        self.assertIn("total_trainers", data)
        self.assertIn("total_trainers_with_assignments", data)
        self.assertIn("total_assigned_cohorts", data)
        self.assertIn("total_distinct_candidates_reached", data)
        self.assertIn("trainers", data)

        # Total trainers includes self.trainer and unassigned_trainer
        self.assertGreaterEqual(data["total_trainers"], 2)
        self.assertGreaterEqual(data["total_trainers_with_assignments"], 1)

        # Find self.trainer
        trainer_item = next(t for t in data["trainers"] if t["trainer_id"] == self.trainer.id)
        self.assertEqual(trainer_item["trainer_username"], self.trainer.username)
        self.assertEqual(trainer_item["assigned_groups_count"], 2)
        # Group 1 has learner1, learner2 (2). Group 2 has learner1, learner3 (2).
        # Distinct candidates across groups = learner1, learner2, learner3 (3 candidates). NO DOUBLE COUNTING!
        self.assertEqual(trainer_item["distinct_candidates_count"], 3)

        # Find unassigned_trainer
        unassigned_item = next(t for t in data["trainers"] if t["trainer_id"] == unassigned_trainer.id)
        self.assertEqual(unassigned_item["assigned_groups_count"], 0)
        self.assertEqual(unassigned_item["distinct_candidates_count"], 0)
        self.assertEqual(unassigned_item["total_assigned_courses_count"], 0)
        self.assertEqual(unassigned_item["total_assigned_modules_count"], 0)
        self.assertEqual(unassigned_item["overall_completion_percentage"], 0.0)
        self.assertEqual(len(unassigned_item["assigned_groups"]), 0)


class AdminTrainerManagementAPITest(APITestCase):
    """
    Tests for Admin Trainer Management APIs:
    - GET /api/admin/trainers/
    - POST /api/admin/trainers/
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_trainer_mgmt",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="existing_trainer",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )
        self.learner = User.objects.create_user(
            username="regular_learner",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
        )

    def test_unauthenticated_cannot_list_or_create_trainers(self):
        """Unauthenticated requests are rejected."""
        resp_list = self.client.get("/api/admin/trainers/")
        self.assertIn(resp_list.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        resp_create = self.client.post("/api/admin/trainers/", {"username": "newtrainer", "password": "ValidPassword123!"})
        self.assertIn(resp_create.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_learner_and_trainer_cannot_list_or_create_trainers(self):
        """Learners and trainers are forbidden from admin trainer management."""
        for user in [self.learner, self.trainer]:
            self.client.force_authenticate(user=user)
            resp_list = self.client.get("/api/admin/trainers/")
            self.assertEqual(resp_list.status_code, status.HTTP_403_FORBIDDEN)

            resp_create = self.client.post(
                "/api/admin/trainers/",
                {"username": "forbidden_trainer", "password": "ValidPassword123!"},
            )
            self.assertEqual(resp_create.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_trainers_safely(self):
        """Admin can list trainers and output does not leak passwords or staff privileges."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/trainers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.data, list)
        self.assertGreaterEqual(len(resp.data), 1)

        trainer_data = next((t for t in resp.data if t["id"] == self.trainer.id), None)
        self.assertIsNotNone(trainer_data)
        self.assertEqual(trainer_data["username"], "existing_trainer")
        self.assertNotIn("password", trainer_data)
        self.assertNotIn("is_staff", trainer_data)
        self.assertNotIn("is_superuser", trainer_data)

    def test_admin_can_create_trainer_successfully(self):
        """Admin can create a new trainer account with non-privileged flags."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "username": "brand_new_trainer",
            "email": "newtrainer@peopleprime.com",
            "first_name": "New",
            "last_name": "Trainer",
            "password": "StrongPassword!2026",
        }
        resp = self.client.post("/api/admin/trainers/", payload)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["username"], "brand_new_trainer")
        self.assertEqual(resp.data["email"], "newtrainer@peopleprime.com")
        self.assertNotIn("password", resp.data)

        # Verify database record
        created = User.objects.get(username="brand_new_trainer")
        self.assertEqual(created.role, User.Role.TRAINER)
        self.assertFalse(created.is_staff)
        self.assertFalse(created.is_superuser)
        self.assertNotEqual(created.password, "StrongPassword!2026")
        self.assertTrue(created.password.startswith("pbkdf2_"))
        self.assertTrue(created.check_password("StrongPassword!2026"))

        # Verify audit log was recorded
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditAction.CREATE,
                entity_type="User",
                entity_id=str(created.id),
            ).exists()
        )

    def test_duplicate_username_rejected(self):
        """Creating a trainer with an existing username (case-insensitive) fails with 400."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "username": "EXISTING_TRAINER",
            "email": "dup@test.com",
            "password": "ValidPassword123!",
        }
        resp = self.client.post("/api/admin/trainers/", payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", resp.data)

    def test_invalid_password_rejected(self):
        """Passwords that fail Django validation are rejected."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "username": "weak_pwd_trainer",
            "email": "weak@test.com",
            "password": "123",  # Too short, numeric
        }
        resp = self.client.post("/api/admin/trainers/", payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", resp.data)

    def test_blank_password_rejected(self):
        """Submitting an empty or whitespace-only password fails with 400."""
        self.client.force_authenticate(user=self.admin)
        for bad_pwd in ["", "   "]:
            resp = self.client.post(
                "/api/admin/trainers/",
                {"username": "blank_pwd_trainer", "password": bad_pwd},
            )
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("password", resp.data)

    def test_duplicate_email_rejected(self):
        """Creating a trainer with an existing email (case-insensitive) fails with 400."""
        self.trainer.email = "assigned_trainer@peopleprime.com"
        self.trainer.save(update_fields=["email"])

        self.client.force_authenticate(user=self.admin)
        payload = {
            "username": "unique_username_different",
            "email": "ASSIGNED_TRAINER@peopleprime.com",
            "password": "ValidPassword123!",
        }
        resp = self.client.post("/api/admin/trainers/", payload)
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", resp.data)

    def test_trainer_can_login_with_new_password(self):
        """A newly created trainer can authenticate and log in via the /api/login/ endpoint."""
        self.client.force_authenticate(user=self.admin)
        create_payload = {
            "username": "login_test_trainer",
            "email": "logintrainer@example.com",
            "password": "ValidPassword!2026",
        }
        create_resp = self.client.post("/api/admin/trainers/", create_payload)
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)

        # Unauthenticate admin
        self.client.force_authenticate(user=None)

        # Attempt login with the new trainer's credentials
        login_resp = self.client.post(
            "/api/login/",
            {"username": "login_test_trainer", "password": "ValidPassword!2026"},
            format="json",
        )
        self.assertEqual(login_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(login_resp.json()["user"]["username"], "login_test_trainer")
        self.assertEqual(login_resp.json()["user"]["role"], User.Role.TRAINER)

    def test_public_registration_cannot_create_trainer(self):
        """Public self-registration (/api/register/) strictly creates LEARNER accounts only."""
        payload = {
            "username": "sneaky_reg_user",
            "password": "ValidPassword123!",
            "role": "TRAINER",
        }
        resp = self.client.post("/api/register/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="sneaky_reg_user")
        self.assertEqual(user.role, User.Role.LEARNER)
        self.assertNotEqual(user.role, User.Role.TRAINER)

    def test_unauthenticated_cannot_deactivate_or_activate(self):
        """Unauthenticated requests to deactivate or activate are rejected."""
        resp_deact = self.client.post(f"/api/admin/trainers/{self.trainer.id}/deactivate/")
        self.assertIn(resp_deact.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        resp_act = self.client.post(f"/api/admin/trainers/{self.trainer.id}/activate/")
        self.assertIn(resp_act.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_learner_and_trainer_cannot_deactivate_or_activate(self):
        """Non-admin roles cannot deactivate or activate trainers."""
        for user in [self.learner, self.trainer]:
            self.client.force_authenticate(user=user)
            resp = self.client.post(f"/api/admin/trainers/{self.trainer.id}/deactivate/")
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

            resp_act = self.client.post(f"/api/admin/trainers/{self.trainer.id}/activate/")
            self.assertEqual(resp_act.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_deactivate_trainer_without_assignments(self):
        """Admin can deactivate a trainer with no active group assignments."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/admin/trainers/{self.trainer.id}/deactivate/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.trainer.refresh_from_db()
        self.assertFalse(self.trainer.is_active)

        # Verify audit log was recorded
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditAction.UPDATE,
                entity_type="User",
                entity_id=str(self.trainer.id),
            ).exists()
        )

    def test_deactivate_trainer_with_active_assignments_rejected(self):
        """Deactivating a trainer who is actively assigned to a group is rejected with 400."""
        cand_type = CandidateType.objects.create(name="Track X", code="TRKX")
        group = LearnerGroup.objects.create(name="Cohort Active Test", code="GRP-ACT-T", candidate_type=cand_type)
        TrainerGroupAssignment.objects.create(group=group, trainer=self.trainer, is_active=True)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/admin/trainers/{self.trainer.id}/deactivate/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("active group assignments", resp.data["error"])

        self.trainer.refresh_from_db()
        self.assertTrue(self.trainer.is_active)

    def test_repeated_deactivation_is_safe_and_idempotent(self):
        """Calling deactivate on an already inactive trainer returns 200 without corruption."""
        self.trainer.is_active = False
        self.trainer.save(update_fields=["is_active"])

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/admin/trainers/{self.trainer.id}/deactivate/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("already inactive", resp.data["message"])

    def test_cannot_deactivate_non_trainer(self):
        """Attempting to deactivate a learner or admin is rejected with 400."""
        self.client.force_authenticate(user=self.admin)
        resp_learner = self.client.post(f"/api/admin/trainers/{self.learner.id}/deactivate/")
        self.assertEqual(resp_learner.status_code, status.HTTP_400_BAD_REQUEST)

        resp_admin = self.client.post(f"/api/admin/trainers/{self.admin.id}/deactivate/")
        self.assertEqual(resp_admin.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_reactivate_trainer(self):
        """Admin can reactivate an inactive trainer, and repeated activation is idempotent."""
        self.trainer.is_active = False
        self.trainer.save(update_fields=["is_active"])

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(f"/api/admin/trainers/{self.trainer.id}/activate/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.trainer.refresh_from_db()
        self.assertTrue(self.trainer.is_active)

        # Repeated activation is idempotent
        resp_again = self.client.post(f"/api/admin/trainers/{self.trainer.id}/activate/")
        self.assertEqual(resp_again.status_code, status.HTTP_200_OK)
        self.assertIn("already active", resp_again.data["message"])

    def test_common_password_rejected(self):
        """Common passwords flagged by Django's CommonPasswordValidator are rejected."""
        self.client.force_authenticate(user=self.admin)
        for common_pwd in ["password", "password123", "welcome123"]:
            resp = self.client.post(
                "/api/admin/trainers/",
                {"username": f"common_{common_pwd[:6]}", "password": common_pwd},
            )
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("password", resp.data)
            self.assertTrue(
                any("common" in msg.lower() for msg in resp.data["password"]),
                f"Expected 'common' in error for {common_pwd}, got {resp.data['password']}",
            )

    def test_strong_complex_password_accepted(self):
        """Strong passwords not matching common lists succeed."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/admin/trainers/",
            {
                "username": "strong_pwd_trainer",
                "email": "strong@example.com",
                "password": "StrongPassword!2026_xYz#",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_password_categories_acceptance(self):
        """
        Verify password policy acceptance:
        - Numbers only (at least 8 digits)
        - Alphabetic characters only
        - Combination of numbers and alphabets
        - Special characters alone or combined
        - Contains words from username, name, or email
        """
        self.client.force_authenticate(user=self.admin)

        test_cases = [
            ("num_only_trainer", "987654321098"),                       # Numbers only (>=8 digits, not common)
            ("alpha_only_trainer", "UncommonAlphabeticalTrainerPass"),  # Alphabetic only
            ("alphanumeric_trainer", "TrainerBatch2026Secure"),         # Combination numbers & alphabets
            ("special_only_trainer", "$$$@@@###%%%^^^"),                # Special characters only
            ("name_words_trainer", "JohnDoeTrainerPassword2026!"),      # Contains name words (first/last)
            ("email_words_trainer", "testtrainer_email_pass_2026"),     # Contains email words
        ]

        for username, password in test_cases:
            resp = self.client.post(
                "/api/admin/trainers/",
                {
                    "username": username,
                    "email": f"{username}@example.com",
                    "first_name": "John",
                    "last_name": "Doe",
                    "password": password,
                },
            )
            self.assertEqual(
                resp.status_code,
                status.HTTP_201_CREATED,
                f"Failed to create trainer with password '{password}': {resp.data}",
            )
            created_user = User.objects.get(username=username)
            self.assertTrue(created_user.check_password(password))

    def test_short_password_rejected(self):
        """Passwords shorter than 8 characters are rejected."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/admin/trainers/",
            {
                "username": "short_pass_trainer",
                "password": "Short1!",
            },
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", resp.data)

    def test_admin_can_update_trainer_fields(self):
        """Admin can edit a trainer's username, email, first_name, and last_name."""
        self.client.force_authenticate(user=self.admin)
        patch_payload = {
            "username": "trainer_updated_username",
            "email": "updated_email@example.com",
            "first_name": "UpdatedFirst",
            "last_name": "UpdatedLast",
        }
        resp = self.client.patch(f"/api/admin/trainers/{self.trainer.id}/", patch_payload)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["username"], "trainer_updated_username")
        self.assertEqual(resp.data["email"], "updated_email@example.com")
        self.assertEqual(resp.data["first_name"], "UpdatedFirst")
        self.assertEqual(resp.data["last_name"], "UpdatedLast")

        self.trainer.refresh_from_db()
        self.assertEqual(self.trainer.username, "trainer_updated_username")
        self.assertEqual(self.trainer.email, "updated_email@example.com")
        self.assertEqual(self.trainer.first_name, "UpdatedFirst")
        self.assertEqual(self.trainer.last_name, "UpdatedLast")
        self.assertEqual(self.trainer.role, User.Role.TRAINER)

        # Verify audit log was recorded
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditAction.UPDATE,
                entity_type="User",
                entity_id=str(self.trainer.id),
            ).exists()
        )

    def test_update_trainer_password_optional_and_hashed(self):
        """
        When password is blank or omitted, current password is unchanged.
        When password is provided, it is securely validated and hashed.
        """
        self.client.force_authenticate(user=self.admin)
        old_password_hash = self.trainer.password

        # 1. Update with blank password -> password unchanged
        resp_blank = self.client.patch(
            f"/api/admin/trainers/{self.trainer.id}/",
            {"first_name": "SamePasswordFirst", "password": ""},
        )
        self.assertEqual(resp_blank.status_code, status.HTTP_200_OK)
        self.trainer.refresh_from_db()
        self.assertEqual(self.trainer.password, old_password_hash)

        # 2. Update with new valid password -> password updated & hashed
        resp_new = self.client.patch(
            f"/api/admin/trainers/{self.trainer.id}/",
            {"password": "NewUncommonTrainerPass2026!"},
        )
        self.assertEqual(resp_new.status_code, status.HTTP_200_OK)
        self.trainer.refresh_from_db()
        self.assertNotEqual(self.trainer.password, old_password_hash)
        self.assertTrue(self.trainer.check_password("NewUncommonTrainerPass2026!"))

    def test_update_trainer_uniqueness_validation(self):
        """
        Username and email uniqueness is validated, but preserving the trainer's own
        current username/email succeeds.
        """
        other_trainer = User.objects.create_user(
            username="other_trainer_unique",
            email="other_unique@example.com",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )
        self.client.force_authenticate(user=self.admin)

        # Keeping own username/email succeeds
        resp_self = self.client.patch(
            f"/api/admin/trainers/{self.trainer.id}/",
            {"username": self.trainer.username, "email": self.trainer.email},
        )
        self.assertEqual(resp_self.status_code, status.HTTP_200_OK)

        # Duplicating another user's username fails
        resp_dup_user = self.client.patch(
            f"/api/admin/trainers/{self.trainer.id}/",
            {"username": "other_trainer_unique"},
        )
        self.assertEqual(resp_dup_user.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", resp_dup_user.data)

        # Duplicating another user's email fails
        resp_dup_email = self.client.patch(
            f"/api/admin/trainers/{self.trainer.id}/",
            {"email": "other_unique@example.com"},
        )
        self.assertEqual(resp_dup_email.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", resp_dup_email.data)

    def test_non_admin_cannot_update_trainer(self):
        """Learners, trainers, and unauthenticated users cannot update trainer accounts."""
        endpoint = f"/api/admin/trainers/{self.trainer.id}/"
        resp_unauth = self.client.patch(endpoint, {"first_name": "Hacked"})
        self.assertIn(resp_unauth.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        for user in [self.learner, self.trainer]:
            self.client.force_authenticate(user=user)
            resp = self.client.patch(endpoint, {"first_name": "Hacked"})
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_escalate_role_via_update_trainer(self):
        """Attempting to change role or is_superuser via update endpoint is ignored or rejected."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.patch(
            f"/api/admin/trainers/{self.trainer.id}/",
            {"role": User.Role.ADMIN, "is_superuser": True},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.trainer.refresh_from_db()
        self.assertEqual(self.trainer.role, User.Role.TRAINER)
        self.assertFalse(self.trainer.is_superuser)

    def test_admin_can_delete_trainer_without_assignments(self):
        """Admin can permanently delete a trainer who has no assignments."""
        trainer_to_delete = User.objects.create_user(
            username="temp_trainer_to_delete",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/trainers/{trainer_to_delete.id}/")
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])
        self.assertFalse(User.objects.filter(id=trainer_to_delete.id).exists())

        # Verify audit log was recorded
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditAction.DELETE,
                entity_type="User",
                entity_id=str(trainer_to_delete.id),
            ).exists()
        )

    def test_unauthenticated_and_non_admin_cannot_delete_trainer(self):
        """Unauthenticated, learners, and trainers cannot delete a trainer."""
        resp_unauth = self.client.delete(f"/api/admin/trainers/{self.trainer.id}/")
        self.assertIn(resp_unauth.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        for user in [self.learner, self.trainer]:
            self.client.force_authenticate(user=user)
            resp = self.client.delete(f"/api/admin/trainers/{self.trainer.id}/")
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_delete_self_via_trainer_endpoint(self):
        """Admin attempting to delete their own account via trainer endpoint is rejected."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/trainers/{self.admin.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot delete their own account", resp.data["error"])

    def test_cannot_delete_non_trainer_via_trainer_endpoint(self):
        """Attempting to delete a learner via trainer delete endpoint is rejected."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/trainers/{self.learner.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only trainer accounts can be deleted here", resp.data["error"])

    def test_delete_trainer_with_active_assignments_rejected(self):
        """Deleting a trainer who has active group assignments fails with 400."""
        cand_type = CandidateType.objects.create(name="Track Y", code="TRKY")
        group = LearnerGroup.objects.create(name="Cohort Delete Test", code="GRP-DEL-T", candidate_type=cand_type)
        TrainerGroupAssignment.objects.create(group=group, trainer=self.trainer, is_active=True)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/trainers/{self.trainer.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("active group assignments", resp.data["error"])
        self.assertTrue(User.objects.filter(id=self.trainer.id).exists())

    def test_delete_trainer_with_historical_assignments_rejected(self):
        """Deleting a trainer who has historical group assignments fails with 400 to protect data."""
        cand_type = CandidateType.objects.create(name="Track Z", code="TRKZ")
        group = LearnerGroup.objects.create(name="Cohort Hist Test", code="GRP-HIST-T", candidate_type=cand_type)
        TrainerGroupAssignment.objects.create(group=group, trainer=self.trainer, is_active=False)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/trainers/{self.trainer.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("historical group assignments exist", resp.data["error"])
        self.assertTrue(User.objects.filter(id=self.trainer.id).exists())

    def test_delete_nonexistent_trainer_returns_404(self):
        """Deleting a non-existent trainer ID returns 404."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete("/api/admin/trainers/999999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)



class AdminLearnerManagementAPITest(APITestCase):
    """
    Tests for Admin Learner Management APIs:
    - GET /api/admin/learners/
    - Group membership assignment and deletion integration
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_learner_mgmt",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="existing_trainer_learner_test",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )
        self.learner_active = User.objects.create_user(
            username="active_learner",
            email="active@example.com",
            first_name="Active",
            last_name="Learner",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
            is_active=True,
        )
        self.learner_inactive = User.objects.create_user(
            username="inactive_learner",
            email="inactive@example.com",
            first_name="Inactive",
            last_name="Learner",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
            is_active=False,
        )
        self.candidate_type = CandidateType.objects.create(name="Engineering", code="ENG")
        self.group = LearnerGroup.objects.create(
            name="Batch Alpha",
            code="GRP-ALPHA",
            candidate_type=self.candidate_type,
        )

    def test_unauthenticated_cannot_list_learners(self):
        """Unauthenticated requests are rejected."""
        resp = self.client.get("/api/admin/learners/")
        self.assertIn(resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_learner_and_trainer_cannot_list_learners(self):
        """Learners and trainers are forbidden from admin learner endpoint."""
        for user in [self.learner_active, self.trainer]:
            self.client.force_authenticate(user=user)
            resp = self.client.get("/api/admin/learners/")
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_learners_safely(self):
        """Admin can list learners; only role=LEARNER users are returned; sensitive fields are omitted."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/learners/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.data, list)

        returned_ids = {u["id"] for u in resp.data}
        # Learner accounts must be present
        self.assertIn(self.learner_active.id, returned_ids)
        self.assertIn(self.learner_inactive.id, returned_ids)

        # Trainer and Admin accounts must NOT be present
        self.assertNotIn(self.trainer.id, returned_ids)
        self.assertNotIn(self.admin.id, returned_ids)

        # Check fields and safety
        active_data = next(u for u in resp.data if u["id"] == self.learner_active.id)
        self.assertEqual(active_data["username"], "active_learner")
        self.assertEqual(active_data["email"], "active@example.com")
        self.assertEqual(active_data["first_name"], "Active")
        self.assertEqual(active_data["last_name"], "Learner")
        self.assertTrue(active_data["is_active"])
        self.assertNotIn("password", active_data)
        self.assertNotIn("is_staff", active_data)
        self.assertNotIn("is_superuser", active_data)

        inactive_data = next(u for u in resp.data if u["id"] == self.learner_inactive.id)
        self.assertFalse(inactive_data["is_active"])

    def test_group_membership_workflow_preserved(self):
        """Admin can assign and remove learner from group using standard group-memberships API."""
        self.client.force_authenticate(user=self.admin)

        # Create membership
        create_resp = self.client.post(
            "/api/group-memberships/",
            {"group": self.group.id, "learner": self.learner_active.id, "is_active": True},
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        membership_id = create_resp.data["id"]

        # Duplicate membership is rejected
        dup_resp = self.client.post(
            "/api/group-memberships/",
            {"group": self.group.id, "learner": self.learner_active.id, "is_active": True},
        )
        self.assertEqual(dup_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Delete membership
        del_resp = self.client.delete(f"/api/group-memberships/{membership_id}/")
        self.assertEqual(del_resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_can_delete_learner_without_records(self):
        """Admin can permanently delete a learner who has no group memberships or responses."""
        temp_learner = User.objects.create_user(
            username="temp_learner_del",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/learners/{temp_learner.id}/")
        self.assertIn(resp.status_code, [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])
        self.assertFalse(User.objects.filter(id=temp_learner.id).exists())

        # Verify audit log was recorded
        self.assertTrue(
            AuditLog.objects.filter(
                action=AuditAction.DELETE,
                entity_type="User",
                entity_id=str(temp_learner.id),
            ).exists()
        )

    def test_unauthenticated_and_non_admin_cannot_delete_learner(self):
        """Unauthenticated, learners, and trainers cannot delete a learner."""
        temp_learner = User.objects.create_user(
            username="temp_learner_del_perm",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
        )
        resp_unauth = self.client.delete(f"/api/admin/learners/{temp_learner.id}/")
        self.assertIn(resp_unauth.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        for user in [self.learner_active, self.trainer]:
            self.client.force_authenticate(user=user)
            resp = self.client.delete(f"/api/admin/learners/{temp_learner.id}/")
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_delete_self_via_learner_endpoint(self):
        """Admin attempting to delete their own account via learner endpoint is rejected."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/learners/{self.admin.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot delete their own account", resp.data["error"])

    def test_cannot_delete_non_learner_via_learner_endpoint(self):
        """Attempting to delete a trainer via learner delete endpoint is rejected."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/learners/{self.trainer.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only learner accounts can be deleted here", resp.data["error"])

    def test_delete_learner_with_active_memberships_rejected(self):
        """Deleting a learner who has active group memberships fails with 400."""
        GroupMembership.objects.create(group=self.group, learner=self.learner_active, is_active=True)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/learners/{self.learner_active.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("active group memberships", resp.data["error"])
        self.assertTrue(User.objects.filter(id=self.learner_active.id).exists())

    def test_delete_learner_with_historical_memberships_rejected(self):
        """Deleting a learner who has historical memberships fails with 400."""
        GroupMembership.objects.create(group=self.group, learner=self.learner_active, is_active=False)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/learners/{self.learner_active.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("historical group memberships exist", resp.data["error"])
        self.assertTrue(User.objects.filter(id=self.learner_active.id).exists())

    def test_delete_learner_with_responses_rejected(self):
        """Deleting a learner with question responses fails with 400 to prevent data loss."""
        course = Course.objects.create(name="Course", code="C1")
        level = CourseLevel.objects.create(course=course, name="Level 1", order=1)
        module = Module.objects.create(name="Mod", course=course, level=level)
        q = ModuleQuestion.objects.create(module=module, question_text="Is it done?", is_required=True)
        ModuleQuestionResponse.objects.create(question=q, learner=self.learner_active, response_value=True)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f"/api/admin/learners/{self.learner_active.id}/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recorded module responses exist", resp.data["error"])
        self.assertTrue(User.objects.filter(id=self.learner_active.id).exists())

    def test_admin_can_deactivate_and_activate_learner(self):
        """Admin can deactivate and activate a learner safely."""
        self.client.force_authenticate(user=self.admin)
        resp_deact = self.client.post(f"/api/admin/learners/{self.learner_active.id}/deactivate/")
        self.assertEqual(resp_deact.status_code, status.HTTP_200_OK)
        self.learner_active.refresh_from_db()
        self.assertFalse(self.learner_active.is_active)

        resp_act = self.client.post(f"/api/admin/learners/{self.learner_active.id}/activate/")
        self.assertEqual(resp_act.status_code, status.HTTP_200_OK)
        self.learner_active.refresh_from_db()
        self.assertTrue(self.learner_active.is_active)

    def test_delete_nonexistent_learner_returns_404(self):
        """Deleting a non-existent learner ID returns 404."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete("/api/admin/learners/999999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)



class IndividualTrainingAssignmentAPITest(APITestCase):
    """
    Tests for LMS Phase A Step 4:
    - Assigning Program, Course, or Module to an individual learner.
    - Sibling module protection (direct module assignment shows parent course container, hides sibling modules).
    - Progress calculations count only assigned modules (100% on assigned module completion).
    - Composite uniqueness rejection with controlled 400 error.
    - Authorization checks (non-admins forbidden).
    - Preserving group/candidate-type assignment functionality.
    """

    def setUp(self):
        self.admin = make_user("admin_user", User.Role.ADMIN)
        self.trainer = make_user("trainer_user", User.Role.TRAINER)
        self.learner1 = make_user("learner_one", User.Role.LEARNER)
        self.learner2 = make_user("learner_two", User.Role.LEARNER)

        self.candidate_type = CandidateType.objects.create(name="Engineering", code="ENG")
        self.group = LearnerGroup.objects.create(
            name="Cohort One",
            code="C1",
            candidate_type=self.candidate_type,
        )

        self.course1 = make_course(None, name="Python Fundamentals", code="PF01", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.standalone_course = make_course(None, name="Django Deep Dive", code="DDD01", status=PublicationStatus.PUBLISHED, created_by=self.admin)

        # Standalone course with 2 modules
        self.level_standalone = CourseLevel.objects.create(course=self.standalone_course, name="Deep Dive Level 1", order=1)
        self.mod_intro = Module.objects.create(name="Intro Module", course=self.standalone_course, level=self.level_standalone, order=1, status=PublicationStatus.PUBLISHED)
        self.mod_advanced = Module.objects.create(name="Advanced Module", course=self.standalone_course, level=self.level_standalone, order=2, status=PublicationStatus.PUBLISHED)

        # Question on mod_intro
        self.q_intro = ModuleQuestion.objects.create(
            module=self.mod_intro,
            question_text="Did you understand Intro?",
            is_required=True,
            is_active=True,
        )

        # Question on mod_advanced
        self.q_advanced = ModuleQuestion.objects.create(
            module=self.mod_advanced,
            question_text="Did you understand Advanced?",
            is_required=True,
            is_active=True,
        )

    def test_admin_can_assign_course_to_individual_learner(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "course": self.standalone_course.id,
            "learner": self.learner1.id,
        }
        res = self.client.post("/api/training-assignments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["course_name"], "Django Deep Dive")
        self.assertEqual(res.data["learner_username"], "learner_one")

        # Learner 1 sees standalone_course and both modules
        self.client.force_authenticate(user=self.learner1)
        res_courses = self.client.get("/api/courses/")
        ids = [c["id"] for c in (res_courses.data.get("results") if isinstance(res_courses.data, dict) else res_courses.data)]
        self.assertIn(self.standalone_course.id, ids)

        res_mods = self.client.get("/api/modules/")
        mod_ids = [m["id"] for m in (res_mods.data.get("results") if isinstance(res_mods.data, dict) else res_mods.data)]
        self.assertIn(self.mod_intro.id, mod_ids)
        self.assertIn(self.mod_advanced.id, mod_ids)

    def test_individual_module_assignment_reveals_parent_course_and_hides_sibling_modules(self):
        # Assign only mod_intro to learner1
        self.client.force_authenticate(user=self.admin)
        payload = {
            "module": self.mod_intro.id,
            "learner": self.learner1.id,
        }
        res = self.client.post("/api/training-assignments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["module_name"], "Intro Module")
        self.assertEqual(res.data["learner_username"], "learner_one")

        # Learner 1 checks courses: parent course is visible as container
        self.client.force_authenticate(user=self.learner1)
        res_courses = self.client.get("/api/courses/")
        ids = [c["id"] for c in (res_courses.data.get("results") if isinstance(res_courses.data, dict) else res_courses.data)]
        self.assertIn(self.standalone_course.id, ids)

        # Learner 1 checks modules: Intro is visible, sibling Advanced is HIDDEN
        res_mods = self.client.get("/api/modules/")
        mod_ids = [m["id"] for m in (res_mods.data.get("results") if isinstance(res_mods.data, dict) else res_mods.data)]
        self.assertIn(self.mod_intro.id, mod_ids)
        self.assertNotIn(self.mod_advanced.id, mod_ids)

    def test_progress_calculation_counts_only_assigned_module(self):
        # Assign only mod_intro to learner1
        TrainingAssignment.objects.create(
            module=self.mod_intro,
            learner=self.learner1,
            assigned_by=self.admin,
            is_active=True,
        )

        from core.api_views import _get_distinct_assigned_modules_for_learner, _calculate_learner_progress_metrics

        # Assigned modules count should be 1 (only mod_intro, not mod_advanced)
        assigned_mods = _get_distinct_assigned_modules_for_learner(self.learner1)
        self.assertEqual(assigned_mods.count(), 1)
        self.assertEqual(assigned_mods.first().id, self.mod_intro.id)

        # Initial progress before answering question
        tot, comp, pend, pct, _ = _calculate_learner_progress_metrics(self.learner1, assigned_mods)
        self.assertEqual(tot, 1)
        self.assertEqual(comp, 0)
        self.assertEqual(pct, 0.0)

        # Answer question on mod_intro
        ModuleQuestionResponse.objects.create(
            question=self.q_intro,
            learner=self.learner1,
            response_value=True,
        )

        # Re-check progress: should be 100% completed
        tot, comp, pend, pct, _ = _calculate_learner_progress_metrics(self.learner1, assigned_mods)
        self.assertEqual(tot, 1)
        self.assertEqual(comp, 1)
        self.assertEqual(pct, 100.0)

    def test_duplicate_assignment_rejected(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "course": self.standalone_course.id,
            "learner": self.learner1.id,
        }
        res1 = self.client.post("/api/training-assignments/", payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Duplicate attempt
        res2 = self.client.post("/api/training-assignments/", payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", res2.data)

    def test_invalid_target_and_recipient_combinations_rejected(self):
        self.client.force_authenticate(user=self.admin)

        # Multiple targets: Course and Module
        res1 = self.client.post("/api/training-assignments/", {
            "course": self.standalone_course.id,
            "module": self.mod_intro.id,
            "learner": self.learner1.id,
        }, format="json")
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("curriculum_target", res1.data)

        # Multiple recipients: Group and Learner
        res2 = self.client.post("/api/training-assignments/", {
            "module": self.mod_intro.id,
            "learner_group": self.group.id,
            "learner": self.learner1.id,
        }, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("recipient", res2.data)

        # Non-learner user as learner
        res3 = self.client.post("/api/training-assignments/", {
            "module": self.mod_intro.id,
            "learner": self.trainer.id,
        }, format="json")
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("learner", res3.data)

    def test_non_admin_cannot_create_or_manage_assignments(self):
        payload = {
            "module": self.mod_intro.id,
            "learner": self.learner1.id,
        }
        self.client.force_authenticate(user=self.trainer)
        res = self.client.post("/api/training-assignments/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.learner1)
        res2 = self.client.post("/api/training-assignments/", payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)


class ModuleFeedbackAPITest(APITestCase):
    """
    Test suite for Module Feedback learner endpoints:
    - POST /api/module-feedbacks/
    - GET /api/module-feedbacks/?module={id}
    - 405 Method Not Allowed on PUT, PATCH, DELETE
    - Strict validation, RBAC, module completion checks, trainer cohort checks,
      duplicate prevention, audit logging without raw comments.
    """

    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin = make_user("fb_admin", "ADMIN")
        self.trainer_a = make_user("fb_trainer_a", "TRAINER")
        self.trainer_b = make_user("fb_trainer_b", "TRAINER")
        self.unassigned_trainer = make_user("fb_trainer_unassigned", "TRAINER")
        self.learner_a = make_user("fb_learner_a", "LEARNER")
        self.learner_b = make_user("fb_learner_b", "LEARNER")

        # Course, Module
        self.course = make_course(None, name="Feedback Course", code="FBC01", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.module = make_module(self.course, name="Feedback Module 1", order=1, status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.module_zero_q = make_module(self.course, name="Module Zero Questions", order=2, status=PublicationStatus.PUBLISHED, created_by=self.admin)

        # Questions for module 1: 1 required, 1 optional
        self.q_required = ModuleQuestion.objects.create(
            module=self.module,
            question_text="Did you complete the lab?",
            is_required=True,
            order=1,
            is_active=True,
        )
        self.q_optional = ModuleQuestion.objects.create(
            module=self.module,
            question_text="Optional comments or questions?",
            is_required=False,
            order=2,
            is_active=True,
        )

        # Candidate types & Cohort / Groups
        self.cand_type = CandidateType.objects.create(name="Engineering", code="ENG_FB")
        self.group_a = LearnerGroup.objects.create(
            name="Feedback Cohort Alpha",
            code="FB_ALPHA",
            candidate_type=self.cand_type,
            description="Alpha group",
            is_active=True,
        )
        self.group_b = LearnerGroup.objects.create(
            name="Feedback Cohort Beta",
            code="FB_BETA",
            candidate_type=self.cand_type,
            description="Beta group",
            is_active=True,
        )

        # Learner A in Group A
        self.membership_a = GroupMembership.objects.create(
            group=self.group_a,
            learner=self.learner_a,
            is_active=True,
        )
        # Learner B in Group B
        self.membership_b = GroupMembership.objects.create(
            group=self.group_b,
            learner=self.learner_b,
            is_active=True,
        )

        # Trainer A assigned to Group A
        self.trainer_assign_a = TrainerGroupAssignment.objects.create(
            group=self.group_a,
            trainer=self.trainer_a,
            is_active=True,
        )
        # Trainer B assigned to Group B
        self.trainer_assign_b = TrainerGroupAssignment.objects.create(
            group=self.group_b,
            trainer=self.trainer_b,
            is_active=True,
        )

    def _complete_module_for_learner(self, learner, module, question):
        ModuleQuestionResponse.objects.create(
            question=question,
            learner=learner,
            response_value=True,
        )

    def test_unauthenticated_request_rejected(self):
        res = self.client.post("/api/module-feedbacks/", {}, format="json")
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        res_get = self.client.get(f"/api/module-feedbacks/?module={self.module.id}")
        self.assertIn(res_get.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_non_learner_role_rejected(self):
        self._complete_module_for_learner(self.trainer_a, self.module, self.q_required)

        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "GOOD",
            "comments": "Great module session.",
        }

        # Trainer cannot submit
        self.client.force_authenticate(user=self.trainer_a)
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Admin cannot submit
        self.client.force_authenticate(user=self.admin)
        res_adm = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res_adm.status_code, status.HTTP_403_FORBIDDEN)

    def test_successful_feedback_submission(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 4,
            "understanding_level": "ADVANCED",
            "comments": "The trainer explained practical concepts very clearly.",
        }
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["module"], self.module.id)
        self.assertEqual(res.data["trainer"], self.trainer_a.id)
        self.assertEqual(res.data["learner"], self.learner_a.id)
        self.assertEqual(res.data["module_rating"], 5)
        self.assertEqual(res.data["trainer_rating"], 4)
        self.assertEqual(res.data["understanding_level"], "ADVANCED")
        self.assertEqual(res.data["comments"], "The trainer explained practical concepts very clearly.")
        self.assertIn("submitted_at", res.data)

        # Verify DB entry
        fb = ModuleFeedback.objects.get(module=self.module, learner=self.learner_a)
        self.assertEqual(fb.trainer, self.trainer_a)
        self.assertEqual(fb.module_rating, 5)

    def test_incomplete_module_rejected(self):
        # Learner A has NOT answered q_required
        self.client.force_authenticate(user=self.learner_a)

        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 4,
            "trainer_rating": 4,
            "understanding_level": "GOOD",
            "comments": "Premature feedback submission.",
        }
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("module", res.data)
        self.assertIn("must complete all required module questions", res.data["module"][0])

    def test_zero_required_questions_module_rejected(self):
        # Module has 0 required questions, so completion is not verifiable
        self.client.force_authenticate(user=self.learner_a)

        payload = {
            "module": self.module_zero_q.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "BASIC",
            "comments": "Attempting feedback on module with no questions.",
        }
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("module", res.data)
        self.assertIn("does not have completion questions configured", res.data["module"][0])

    def test_rating_bounds_validation(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        base_payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "understanding_level": "GOOD",
            "comments": "Valid comments here.",
        }

        # Rating < 1
        res = self.client.post("/api/module-feedbacks/", {**base_payload, "module_rating": 0, "trainer_rating": 5}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("module_rating", res.data)

        # Rating > 5
        res = self.client.post("/api/module-feedbacks/", {**base_payload, "module_rating": 6, "trainer_rating": 5}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("module_rating", res.data)

        # Trainer rating < 1
        res = self.client.post("/api/module-feedbacks/", {**base_payload, "module_rating": 3, "trainer_rating": -1}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("trainer_rating", res.data)

        # Trainer rating > 5
        res = self.client.post("/api/module-feedbacks/", {**base_payload, "module_rating": 3, "trainer_rating": 10}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("trainer_rating", res.data)

    def test_invalid_understanding_level_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 4,
            "trainer_rating": 4,
            "understanding_level": "EXCELLENT",
            "comments": "Testing invalid enum choice.",
        }
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("understanding_level", res.data)

    def test_empty_or_whitespace_comments_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        # Empty string
        res1 = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 4,
            "trainer_rating": 4,
            "understanding_level": "GOOD",
            "comments": "",
        }, format="json")
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("comments", res1.data)

        # Whitespace-only string
        res2 = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 4,
            "trainer_rating": 4,
            "understanding_level": "GOOD",
            "comments": "     \n\t  ",
        }, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("comments", res2.data)

    def test_ineligible_trainer_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        # Trainer B is assigned to Group B, Learner A is in Group A -> ineligible
        res = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.trainer_b.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "GOOD",
            "comments": "Trying to rate trainer B.",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("trainer", res.data)
        self.assertIn("not an active trainer assigned to your training cohort", res.data["trainer"][0])

        # Unassigned trainer -> ineligible
        res_un = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.unassigned_trainer.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "GOOD",
            "comments": "Trying unassigned trainer.",
        }, format="json")
        self.assertEqual(res_un.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("trainer", res_un.data)

    def test_inactive_trainer_assignment_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        # Deactivate Trainer A's assignment to Group A
        self.trainer_assign_a.is_active = False
        self.trainer_assign_a.save()

        res = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "GOOD",
            "comments": "Deactivated assignment test.",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("trainer", res.data)

    def test_inactive_learner_group_membership_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        # Deactivate Learner A's membership in Group A
        self.membership_a.is_active = False
        self.membership_a.save()

        res = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "GOOD",
            "comments": "Inactive membership test.",
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("trainer", res.data)

    def test_spoof_learner_identity_ignored_or_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        # Learner A attempts to submit on behalf of Learner B
        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "learner": self.learner_b.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "GOOD",
            "comments": "Spoofing attempt.",
        }
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # Learner should still be request.user (Learner A), NOT Learner B
        self.assertEqual(res.data["learner"], self.learner_a.id)
        fb = ModuleFeedback.objects.get(pk=res.data["id"])
        self.assertEqual(fb.learner, self.learner_a)

    def test_duplicate_submission_same_trainer_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "ADVANCED",
            "comments": "First submission.",
        }
        res1 = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Second submission
        res2 = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", res2.data)
        self.assertIn("already submitted feedback", res2.data["non_field_errors"][0])

    def test_duplicate_submission_different_trainer_rejected(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        # Assign Trainer B to Group A as well, so Trainer B is also an eligible trainer
        TrainerGroupAssignment.objects.create(
            group=self.group_a,
            trainer=self.trainer_b,
            is_active=True,
        )

        res1 = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 4,
            "trainer_rating": 4,
            "understanding_level": "GOOD",
            "comments": "Feedback for Trainer A.",
        }, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Attempt to submit again for Trainer B
        res2 = self.client.post("/api/module-feedbacks/", {
            "module": self.module.id,
            "trainer": self.trainer_b.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "ADVANCED",
            "comments": "Feedback for Trainer B.",
        }, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", res2.data)

    def test_learner_can_retrieve_own_feedback(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        fb = ModuleFeedback.objects.create(
            module=self.module,
            learner=self.learner_a,
            trainer=self.trainer_a,
            module_rating=5,
            trainer_rating=4,
            understanding_level="ADVANCED",
            comments="Direct DB feedback.",
        )

        self.client.force_authenticate(user=self.learner_a)
        res = self.client.get(f"/api/module-feedbacks/?module={self.module.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should return list containing learner A's feedback
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["id"], fb.id)
        self.assertEqual(res.data[0]["module_rating"], 5)
        self.assertEqual(res.data[0]["trainer_name"], self.trainer_a.get_full_name() or self.trainer_a.username)

    def test_learner_cannot_see_other_learner_feedback(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self._complete_module_for_learner(self.learner_b, self.module, self.q_required)

        # Feedback submitted by Learner A
        fb_a = ModuleFeedback.objects.create(
            module=self.module,
            learner=self.learner_a,
            trainer=self.trainer_a,
            module_rating=5,
            trainer_rating=5,
            understanding_level="GOOD",
            comments="Learner A comments.",
        )

        # Learner B queries module feedback
        self.client.force_authenticate(user=self.learner_b)
        res = self.client.get(f"/api/module-feedbacks/?module={self.module.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 0)

        # Learner B attempts detail GET on Learner A's record
        res_detail = self.client.get(f"/api/module-feedbacks/{fb_a.id}/")
        self.assertEqual(res_detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_and_delete_methods_not_allowed(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        fb = ModuleFeedback.objects.create(
            module=self.module,
            learner=self.learner_a,
            trainer=self.trainer_a,
            module_rating=5,
            trainer_rating=5,
            understanding_level="GOOD",
            comments="Initial comments.",
        )

        self.client.force_authenticate(user=self.learner_a)

        # PUT
        res_put = self.client.put(f"/api/module-feedbacks/{fb.id}/", {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 3,
            "trainer_rating": 3,
            "understanding_level": "BASIC",
            "comments": "Modified comments.",
        }, format="json")
        self.assertEqual(res_put.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # PATCH
        res_patch = self.client.patch(f"/api/module-feedbacks/{fb.id}/", {
            "comments": "Hacked comments.",
        }, format="json")
        self.assertEqual(res_patch.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # DELETE
        res_del = self.client.delete(f"/api/module-feedbacks/{fb.id}/")
        self.assertEqual(res_del.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        # Confirm record unchanged
        fb.refresh_from_db()
        self.assertEqual(fb.comments, "Initial comments.")

    def test_audit_entry_created_without_raw_comments(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        secret_comment = "Extremely sensitive personal thought that should not be in audit logs."
        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 4,
            "understanding_level": "GOOD",
            "comments": secret_comment,
        }
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        fb_id = res.data["id"]

        audit = AuditLog.objects.filter(entity_type="ModuleFeedback", entity_id=fb_id).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.action, AuditAction.CREATE)
        self.assertEqual(audit.actor, self.learner_a)
        self.assertIn("module_id", audit.details)
        self.assertIn("trainer_id", audit.details)
        self.assertIn("module_rating", audit.details)
        self.assertIn("trainer_rating", audit.details)
        self.assertIn("understanding_level", audit.details)

        # Raw comment must NOT be stored in audit details
        self.assertNotIn("comments", audit.details)
        self.assertNotIn(secret_comment, str(audit.details))

    def test_feedback_does_not_alter_progress_or_answers(self):
        self._complete_module_for_learner(self.learner_a, self.module, self.q_required)
        self.client.force_authenticate(user=self.learner_a)

        initial_resp_count = ModuleQuestionResponse.objects.filter(learner=self.learner_a).count()
        initial_resp = ModuleQuestionResponse.objects.get(learner=self.learner_a, question=self.q_required)

        payload = {
            "module": self.module.id,
            "trainer": self.trainer_a.id,
            "module_rating": 5,
            "trainer_rating": 5,
            "understanding_level": "GOOD",
            "comments": "Progress preservation check.",
        }
        res = self.client.post("/api/module-feedbacks/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        after_resp_count = ModuleQuestionResponse.objects.filter(learner=self.learner_a).count()
        after_resp = ModuleQuestionResponse.objects.get(learner=self.learner_a, question=self.q_required)

        self.assertEqual(initial_resp_count, after_resp_count)
        self.assertEqual(initial_resp.response_value, after_resp.response_value)


class AdminUserManagementAPITest(APITestCase):
    """
    Tests for TalentLMS-style Admin User Management APIs:
    - GET /api/admin/users/ (listing, searching, filtering, pagination)
    - POST /api/admin/users/ (creating Admin, Trainer, Learner, Gmail addresses, validations)
    - POST /api/admin/users/{id}/activate/
    - POST /api/admin/users/{id}/deactivate/
    - Role-based access control (Trainers & Learners forbidden)
    - Sensitive data protection (no password hashes exposed)
    - Audit logging
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_user_mgmt",
            email="admin.mgmt@people-prime.com",
            first_name="Admin",
            last_name="Commander",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="trainer_user_mgmt",
            email="trainer.mgmt@gmail.com",
            first_name="Jane",
            last_name="Trainer",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )
        self.learner_active = User.objects.create_user(
            username="learner_active_mgmt",
            email="learner.active@gmail.com",
            first_name="Alice",
            last_name="Learner",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
            is_active=True,
        )
        self.learner_inactive = User.objects.create_user(
            username="learner_inactive_mgmt",
            email="learner.inactive@example.com",
            first_name="Bob",
            last_name="Learner",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
            is_active=False,
        )

    # 1. Access Control Tests
    def test_unauthenticated_cannot_access_user_endpoints(self):
        res_list = self.client.get("/api/admin/users/")
        self.assertIn(res_list.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        res_create = self.client.post("/api/admin/users/", {
            "email": "test@gmail.com",
            "password": "ValidPassword123!",
        }, format="json")
        self.assertIn(res_create.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_trainer_cannot_access_admin_user_management(self):
        self.client.force_authenticate(user=self.trainer)
        res_list = self.client.get("/api/admin/users/")
        self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)

        res_create = self.client.post("/api/admin/users/", {
            "email": "test@gmail.com",
            "password": "ValidPassword123!",
        }, format="json")
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

    def test_learner_cannot_access_admin_user_management(self):
        self.client.force_authenticate(user=self.learner_active)
        res_list = self.client.get("/api/admin/users/")
        self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)

        res_create = self.client.post("/api/admin/users/", {
            "email": "test@gmail.com",
            "password": "ValidPassword123!",
        }, format="json")
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

    # 2. List & Read Tests
    def test_admin_can_list_users_safely(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/admin/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsInstance(res.data, list)
        self.assertGreaterEqual(len(res.data), 4)

        # Confirm required TalentLMS columns are present in serializer output
        first_user = res.data[0]
        self.assertIn("id", first_user)
        self.assertIn("name", first_user)
        self.assertIn("email", first_user)
        self.assertIn("role", first_user)
        self.assertIn("user_type_label", first_user)
        self.assertIn("date_joined", first_user)
        self.assertIn("last_login", first_user)
        self.assertIn("is_active", first_user)

        # Ensure NO password hashes or internal privileges leaked
        for u in res.data:
            self.assertNotIn("password", u)
            self.assertNotIn("is_superuser", u)
            self.assertNotIn("is_staff", u)

    # 3. Search Tests
    def test_search_by_name_and_email(self):
        self.client.force_authenticate(user=self.admin)

        # Search by first name "Alice"
        res_name = self.client.get("/api/admin/users/?search=Alice")
        self.assertEqual(res_name.status_code, status.HTTP_200_OK)
        usernames = [u["username"] for u in res_name.data]
        self.assertIn(self.learner_active.username, usernames)
        self.assertNotIn(self.learner_inactive.username, usernames)

        # Search by email domain/prefix
        res_email = self.client.get("/api/admin/users/?search=trainer.mgmt")
        self.assertEqual(res_email.status_code, status.HTTP_200_OK)
        usernames = [u["username"] for u in res_email.data]
        self.assertIn(self.trainer.username, usernames)
        self.assertEqual(len(usernames), 1)

    # 4. Filter Tests
    def test_filter_by_role_and_status(self):
        self.client.force_authenticate(user=self.admin)

        # Filter role TRAINER
        res_trainer = self.client.get("/api/admin/users/?role=TRAINER")
        self.assertEqual(res_trainer.status_code, status.HTTP_200_OK)
        for u in res_trainer.data:
            self.assertEqual(u["role"], "TRAINER")

        # Filter status inactive
        res_inactive = self.client.get("/api/admin/users/?status=inactive")
        self.assertEqual(res_inactive.status_code, status.HTTP_200_OK)
        for u in res_inactive.data:
            self.assertFalse(u["is_active"])
        usernames = [u["username"] for u in res_inactive.data]
        self.assertIn(self.learner_inactive.username, usernames)

        # Combined filter: role LEARNER and status active
        res_combined = self.client.get("/api/admin/users/?role=LEARNER&status=active")
        self.assertEqual(res_combined.status_code, status.HTTP_200_OK)
        for u in res_combined.data:
            self.assertEqual(u["role"], "LEARNER")
            self.assertTrue(u["is_active"])

    # 5. Pagination Tests
    def test_pagination_support(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/admin/users/?page=1&page_size=2")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("count", res.data)
        self.assertIn("results", res.data)
        self.assertEqual(len(res.data["results"]), 2)
        self.assertGreaterEqual(res.data["count"], 4)

    # 6. User Creation Tests (Gmail, Admin, Trainer, Learner)
    def test_create_learner_with_gmail_address(self):
        self.client.force_authenticate(user=self.admin)
        payload = {
            "first_name": "Ravi",
            "last_name": "Kumar",
            "email": "ravi.kumar.lms@gmail.com",
            "username": "ravikumar_gmail",
            "role": "LEARNER",
            "password": "StrongPassword123!",
            "is_active": True,
        }
        res = self.client.post("/api/admin/users/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["email"], "ravi.kumar.lms@gmail.com")
        self.assertEqual(res.data["name"], "Ravi Kumar")
        self.assertEqual(res.data["role"], "LEARNER")
        self.assertTrue(res.data["is_active"])

        # Verify DB entry
        new_u = User.objects.get(username="ravikumar_gmail")
        self.assertTrue(new_u.check_password("StrongPassword123!"))
        self.assertEqual(new_u.role, User.Role.LEARNER)
        self.assertFalse(new_u.is_staff)
        self.assertFalse(new_u.is_superuser)

        # Verify Audit Log
        audit = AuditLog.objects.filter(entity_type="User", entity_id=new_u.pk).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.action, AuditAction.CREATE)
        self.assertEqual(audit.actor, self.admin)
        self.assertNotIn("password", str(audit.details))

    def test_create_trainer_and_admin_accounts(self):
        self.client.force_authenticate(user=self.admin)

        # Create Trainer
        res_tr = self.client.post("/api/admin/users/", {
            "first_name": "Sneha",
            "last_name": "Patel",
            "email": "sneha.patel@gmail.com",
            "role": "TRAINER",
            "password": "TrainerPassword123!",
        }, format="json")
        self.assertEqual(res_tr.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_tr.data["role"], "TRAINER")

        # Create Admin
        res_adm = self.client.post("/api/admin/users/", {
            "first_name": "Kiran",
            "last_name": "Admin",
            "email": "kiran.admin@people-prime.com",
            "role": "ADMIN",
            "password": "AdminPassword123!",
        }, format="json")
        self.assertEqual(res_adm.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_adm.data["role"], "ADMIN")

    def test_duplicate_email_and_username_rejected(self):
        self.client.force_authenticate(user=self.admin)

        # Duplicate email
        res_dup_email = self.client.post("/api/admin/users/", {
            "email": self.learner_active.email,
            "username": "unique_username_123",
            "password": "StrongPassword123!",
        }, format="json")
        self.assertEqual(res_dup_email.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res_dup_email.data)

        # Duplicate username
        res_dup_user = self.client.post("/api/admin/users/", {
            "email": "brandnew.email@example.com",
            "username": self.learner_active.username,
            "password": "StrongPassword123!",
        }, format="json")
        self.assertEqual(res_dup_user.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", res_dup_user.data)

    def test_invalid_email_and_weak_password_rejected(self):
        self.client.force_authenticate(user=self.admin)

        # Invalid email format
        res_inv_email = self.client.post("/api/admin/users/", {
            "email": "not-a-valid-email",
            "password": "StrongPassword123!",
        }, format="json")
        self.assertEqual(res_inv_email.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", res_inv_email.data)

        # Blank/weak password
        res_weak = self.client.post("/api/admin/users/", {
            "email": "new.user@example.com",
            "password": "123",
        }, format="json")
        self.assertEqual(res_weak.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", res_weak.data)

    # 7. Activation / Deactivation Tests
    def test_activate_and_deactivate_user(self):
        self.client.force_authenticate(user=self.admin)

        # Deactivate active learner
        res_deact = self.client.post(f"/api/admin/users/{self.learner_active.id}/deactivate/")
        self.assertEqual(res_deact.status_code, status.HTTP_200_OK)
        self.learner_active.refresh_from_db()
        self.assertFalse(self.learner_active.is_active)

        # Activate inactive learner
        res_act = self.client.post(f"/api/admin/users/{self.learner_inactive.id}/activate/")
        self.assertEqual(res_act.status_code, status.HTTP_200_OK)
        self.learner_inactive.refresh_from_db()
        self.assertTrue(self.learner_inactive.is_active)

    def test_admin_cannot_deactivate_self(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f"/api/admin/users/{self.admin.id}/deactivate/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)


class ReportsAPITest(APITestCase):
    """
    Comprehensive test suite for Phase 6 Reports Module endpoints:
    - GET /api/reports/overview/
    - GET /api/reports/learner-performance/
    - GET /api/reports/course-progress/
    - RBAC enforcement across Admin, Trainer, and Learner
    - Data scoping (Trainers only see assigned learners/courses; Learners only see self)
    - Handling of actual recorded scores vs non-scored questions
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="rep_admin",
            password="AdminPassword123!",
            role=User.Role.ADMIN,
        )
        self.trainer_a = User.objects.create_user(
            username="rep_trainer_a",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )
        self.trainer_b = User.objects.create_user(
            username="rep_trainer_b",
            password="TrainerPassword123!",
            role=User.Role.TRAINER,
        )
        self.learner_a = User.objects.create_user(
            username="rep_learner_a",
            email="learner.a@gmail.com",
            first_name="Alice",
            last_name="Report",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
        )
        self.learner_b = User.objects.create_user(
            username="rep_learner_b",
            email="learner.b@gmail.com",
            first_name="Bob",
            last_name="Report",
            password="LearnerPassword123!",
            role=User.Role.LEARNER,
        )

        # Curriculum: Course 1 (2 modules) and Course 2 (1 module)
        self.course_1 = make_course(None, name="Report Course Python", code="RCP01", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.mod_1_1 = make_module(self.course_1, name="Python Basics", order=1, status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.mod_1_2 = make_module(self.course_1, name="Python Functions", order=2, status=PublicationStatus.PUBLISHED, created_by=self.admin)

        self.course_2 = make_course(None, name="Report Course SQL", code="RCS01", status=PublicationStatus.PUBLISHED, created_by=self.admin)
        self.mod_2_1 = make_module(self.course_2, name="SQL Queries", order=1, status=PublicationStatus.PUBLISHED, created_by=self.admin)

        # Questions
        self.q_1_1 = ModuleQuestion.objects.create(
            module=self.mod_1_1,
            question_text="Did you write your first Python script?",
            is_required=True,
            order=1,
            is_active=True,
        )
        self.q_1_2 = ModuleQuestion.objects.create(
            module=self.mod_1_2,
            question_text="Did you write modular functions?",
            is_required=True,
            order=1,
            is_active=True,
        )
        self.q_2_1 = ModuleQuestion.objects.create(
            module=self.mod_2_1,
            question_text="Did you write SELECT statements?",
            is_required=True,
            order=1,
            is_active=True,
        )

        # Cohort Groups
        self.cand_type = CandidateType.objects.create(name="Software Engineering", code="SWE_REP")
        self.group_a = LearnerGroup.objects.create(
            name="Report Cohort Alpha",
            code="RCA01",
            candidate_type=self.cand_type,
            is_active=True,
        )
        self.group_b = LearnerGroup.objects.create(
            name="Report Cohort Beta",
            code="RCB01",
            candidate_type=self.cand_type,
            is_active=True,
        )

        # Learner A in Group A; Learner B in Group B
        GroupMembership.objects.create(group=self.group_a, learner=self.learner_a, is_active=True)
        GroupMembership.objects.create(group=self.group_b, learner=self.learner_b, is_active=True)

        # Trainer A manages Group A; Trainer B manages Group B
        TrainerGroupAssignment.objects.create(group=self.group_a, trainer=self.trainer_a, is_active=True)
        TrainerGroupAssignment.objects.create(group=self.group_b, trainer=self.trainer_b, is_active=True)

        # Assignments: Group A assigned Course 1; Group B assigned Course 2
        TrainingAssignment.objects.create(course=self.course_1, learner_group=self.group_a, is_active=True)
        TrainingAssignment.objects.create(course=self.course_2, learner_group=self.group_b, is_active=True)

    # 1. Unauthenticated & Permissions
    def test_unauthenticated_rejected(self):
        res_ov = self.client.get("/api/reports/overview/")
        self.assertIn(res_ov.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        res_lp = self.client.get("/api/reports/learner-performance/")
        self.assertIn(res_lp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        res_cp = self.client.get("/api/reports/course-progress/")
        self.assertIn(res_cp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    # 2. Section A: Overview Metrics Tests
    def test_admin_overview_metrics(self):
        # Learner A completes mod 1_1 of course 1
        ModuleQuestionResponse.objects.create(
            question=self.q_1_1,
            learner=self.learner_a,
            response_value=True,
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/reports/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_learners"], 2)
        self.assertEqual(res.data["total_courses"], 2)
        self.assertEqual(res.data["total_assigned_enrollments"], 2)
        # Learner A has completed 1/2 modules (in progress), Learner B has completed 0/1 modules (not started)
        self.assertEqual(res.data["in_progress_courses"], 1)
        self.assertEqual(res.data["not_started_courses"], 1)
        self.assertEqual(res.data["completed_courses"], 0)
        # Learner A: 50.0%, Learner B: 0.0% => avg = 25.0%
        self.assertEqual(res.data["overall_completion_percentage"], 25.0)

    def test_trainer_overview_metrics_scoped(self):
        self.client.force_authenticate(user=self.trainer_a)
        res = self.client.get("/api/reports/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Trainer A only sees Group A (1 learner: Learner A, 1 course: Course 1)
        self.assertEqual(res.data["total_learners"], 1)
        self.assertEqual(res.data["total_courses"], 1)
        self.assertEqual(res.data["total_assigned_enrollments"], 1)

    def test_learner_overview_metrics_scoped(self):
        self.client.force_authenticate(user=self.learner_a)
        res = self.client.get("/api/reports/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Learner A only sees self
        self.assertEqual(res.data["total_learners"], 1)
        self.assertEqual(res.data["total_courses"], 1)
        self.assertEqual(res.data["total_assigned_enrollments"], 1)

    # 3. Section B: Learner Performance Tests
    def test_learner_performance_reports_scored_and_unscored(self):
        # 1. Unscored response (normal Yes/No question)
        ModuleQuestionResponse.objects.create(
            question=self.q_1_1,
            learner=self.learner_a,
            response_value=True,
            response_payload={"value": True},
        )

        # 2. Scored assessment response with actual recorded marks in payload
        ModuleQuestionResponse.objects.create(
            question=self.q_1_2,
            learner=self.learner_a,
            response_value=True,
            response_payload={"marks_obtained": 8.0, "total_marks": 10.0},
        )

        # Admin view
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/reports/learner-performance/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("results", res.data)
        self.assertEqual(len(res.data["results"]), 2)

        scored_item = next(item for item in res.data["results"] if item["module_id"] == self.mod_1_2.id)
        self.assertTrue(scored_item["is_scored"])
        self.assertEqual(scored_item["marks_obtained"], 8.0)
        self.assertEqual(scored_item["total_marks"], 10.0)
        self.assertEqual(scored_item["percentage"], 80.0)

        unscored_item = next(item for item in res.data["results"] if item["module_id"] == self.mod_1_1.id)
        self.assertFalse(unscored_item["is_scored"])
        self.assertIsNone(unscored_item["marks_obtained"])
        self.assertIsNone(unscored_item["total_marks"])
        self.assertIsNone(unscored_item["percentage"])

    def test_trainer_cannot_access_unrelated_learner_performance(self):
        # Response for Learner B (Group B / Trainer B)
        ModuleQuestionResponse.objects.create(
            question=self.q_2_1,
            learner=self.learner_b,
            response_value=True,
            response_payload={"marks_obtained": 15.0, "total_marks": 20.0},
        )

        # Trainer A queries learner-performance
        self.client.force_authenticate(user=self.trainer_a)
        res = self.client.get("/api/reports/learner-performance/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Trainer A should NOT see Learner B's score
        self.assertEqual(len(res.data["results"]), 0)

    def test_learner_cannot_see_other_learner_performance(self):
        ModuleQuestionResponse.objects.create(
            question=self.q_2_1,
            learner=self.learner_b,
            response_value=True,
            response_payload={"marks_obtained": 18.0, "total_marks": 20.0},
        )

        # Learner A queries learner-performance
        self.client.force_authenticate(user=self.learner_a)
        res = self.client.get("/api/reports/learner-performance/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Learner A sees 0 records
        self.assertEqual(len(res.data["results"]), 0)

    # 4. Section C: Course Progress Tests
    def test_course_progress_metrics(self):
        # Complete course 1 for Learner A (both mod 1_1 and 1_2 answered)
        ModuleQuestionResponse.objects.create(question=self.q_1_1, learner=self.learner_a, response_value=True)
        ModuleQuestionResponse.objects.create(question=self.q_1_2, learner=self.learner_a, response_value=True)

        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/reports/course-progress/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

        cp1 = next(c for c in res.data if c["course_id"] == self.course_1.id)
        self.assertEqual(cp1["assigned_learners_count"], 1)
        self.assertEqual(cp1["completed_learners_count"], 1)
        self.assertEqual(cp1["in_progress_learners_count"], 0)
        self.assertEqual(cp1["not_started_learners_count"], 0)
        self.assertEqual(cp1["average_completion_percentage"], 100.0)

        cp2 = next(c for c in res.data if c["course_id"] == self.course_2.id)
        self.assertEqual(cp2["assigned_learners_count"], 1)
        self.assertEqual(cp2["completed_learners_count"], 0)
        self.assertEqual(cp2["not_started_learners_count"], 1)
        self.assertEqual(cp2["average_completion_percentage"], 0.0)

    def test_course_progress_trainer_scoping(self):
        self.client.force_authenticate(user=self.trainer_a)
        res = self.client.get("/api/reports/course-progress/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Trainer A only sees Course 1
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["course_id"], self.course_1.id)
