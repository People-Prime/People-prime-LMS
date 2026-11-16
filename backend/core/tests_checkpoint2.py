"""
Checkpoint 2 / Step 1: Level-based access scoping tests.
"""
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import (
    CandidateType,
    Course,
    CourseLevel,
    GroupMembership,
    LearnerGroup,
    Module,
    ModuleAssessmentAttempt,
    ModuleQuestion,
    ModuleQuestionResponse,
    PublicationStatus,
    Submodule,
    TrainerGroupAssignment,
    TrainingAssignment,
)

User = get_user_model()
PUB = PublicationStatus.PUBLISHED


class LevelAccessScopingTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="c2_admin", password="x", role=User.Role.ADMIN)
        self.trainer = User.objects.create_user(username="c2_trainer", password="x", role=User.Role.TRAINER)
        self.learner_grp = User.objects.create_user(username="c2_learner_grp", password="x", role=User.Role.LEARNER)
        self.learner_ind = User.objects.create_user(username="c2_learner_ind", password="x", role=User.Role.LEARNER)
        self.learner_none = User.objects.create_user(username="c2_learner_none", password="x", role=User.Role.LEARNER)

        ct = CandidateType.objects.create(name="C2 CT", code="C2CT")
        self.group = LearnerGroup.objects.create(name="C2 Group", code="C2G", candidate_type=ct)
        GroupMembership.objects.create(group=self.group, learner=self.learner_grp, is_active=True)

        # Independent levels (no parent course)
        self.l1 = CourseLevel.objects.create(name="Level 1", order=1)
        self.l2 = CourseLevel.objects.create(name="Level 2", order=2)
        self.l3 = CourseLevel.objects.create(name="Level 3", order=3)

        self.l1_mods = [
            Module.objects.create(level=self.l1, name=f"L1 M{i}", order=i, status=PUB)
            for i in range(1, 4)
        ]
        self.l1_draft = Module.objects.create(level=self.l1, name="L1 Draft", order=9)
        self.l2_mod = Module.objects.create(level=self.l2, name="L2 M1", order=1, status=PUB)
        self.l3_mod = Module.objects.create(level=self.l3, name="L3 M1", order=1, status=PUB)

        self.l1_sub = Submodule.objects.create(module=self.l1_mods[0], name="L1 Sub", order=1, status=PUB)
        self.l2_sub = Submodule.objects.create(module=self.l2_mod, name="L2 Sub", order=1, status=PUB)

        TrainingAssignment.objects.create(level=self.l1, learner_group=self.group, assigned_by=self.admin)
        TrainingAssignment.objects.create(level=self.l1, learner=self.learner_ind, assigned_by=self.admin)

    def _module_ids(self, user):
        self.client.force_authenticate(user=user)
        res = self.client.get("/api/modules/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return {m["id"] for m in res.data}

    def test_group_and_individual_level1_learners_see_only_published_level1_modules(self):
        expected = {m.id for m in self.l1_mods}
        self.assertEqual(self._module_ids(self.learner_grp), expected)
        self.assertEqual(self._module_ids(self.learner_ind), expected)

    def test_level2_and_level3_not_implicitly_granted(self):
        for user in (self.learner_grp, self.learner_ind):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get(f"/api/modules/{self.l2_mod.pk}/").status_code, status.HTTP_404_NOT_FOUND)
            self.assertEqual(self.client.get(f"/api/modules/{self.l3_mod.pk}/").status_code, status.HTTP_404_NOT_FOUND)
            self.assertEqual(self.client.get(f"/api/submodules/{self.l2_sub.pk}/").status_code, status.HTTP_404_NOT_FOUND)
            self.assertEqual(self.client.get(f"/api/modules/{self.l1_draft.pk}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_level1_submodule_accessible(self):
        self.client.force_authenticate(user=self.learner_grp)
        self.assertEqual(self.client.get(f"/api/submodules/{self.l1_sub.pk}/").status_code, status.HTTP_200_OK)

    def test_unassigned_learner_sees_nothing(self):
        self.assertEqual(self._module_ids(self.learner_none), set())

    def test_inactive_level_assignment_grants_nothing(self):
        TrainingAssignment.objects.filter(learner=self.learner_ind).update(is_active=False)
        self.assertEqual(self._module_ids(self.learner_ind), set())

    def test_trainer_sees_published_courseless_curriculum_but_not_drafts(self):
        ids = self._module_ids(self.trainer)
        self.assertTrue({m.id for m in self.l1_mods} | {self.l2_mod.id, self.l3_mod.id} <= ids)
        self.assertNotIn(self.l1_draft.id, ids)
        self.assertEqual(self.client.get(f"/api/submodules/{self.l2_sub.pk}/").status_code, status.HTTP_200_OK)

    def test_trainer_cannot_modify_modules(self):
        self.client.force_authenticate(user=self.trainer)
        res = self.client.patch(f"/api/modules/{self.l1_mods[0].pk}/", {"name": "X"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_sees_all_modules_including_drafts(self):
        ids = self._module_ids(self.admin)
        self.assertIn(self.l1_draft.id, ids)
        self.assertIn(self.l3_mod.id, ids)

    def test_level_with_parent_course_exposes_parent_course_to_learner(self):
        course = Course.objects.create(name="C2 Course", code="C2C", status=PUB)
        lvl = CourseLevel.objects.create(course=course, name="Course L1", order=1)
        Module.objects.create(course=course, level=lvl, name="CL M", order=1, status=PUB)
        other_lvl = CourseLevel.objects.create(course=course, name="Course L2", order=2)
        other_mod = Module.objects.create(course=course, level=other_lvl, name="CL2 M", order=2, status=PUB)
        TrainingAssignment.objects.create(level=lvl, learner=self.learner_none, assigned_by=self.admin)

        self.client.force_authenticate(user=self.learner_none)
        self.assertEqual(self.client.get(f"/api/courses/{course.pk}/").status_code, status.HTTP_200_OK)
        # Sibling level in the same course is NOT granted
        self.assertEqual(self.client.get(f"/api/modules/{other_mod.pk}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_course_and_module_assignments_still_work(self):
        course = Course.objects.create(name="Legacy C", code="LGC", status=PUB)
        lvl = CourseLevel.objects.create(course=course, name="LG L", order=1)
        c_mod = Module.objects.create(course=course, level=lvl, name="LG M", order=1, status=PUB)
        TrainingAssignment.objects.create(course=course, learner=self.learner_none, assigned_by=self.admin)
        TrainingAssignment.objects.create(module=self.l3_mod, learner=self.learner_none, assigned_by=self.admin)

        ids = self._module_ids(self.learner_none)
        self.assertEqual(ids, {c_mod.id, self.l3_mod.id})

    def test_download_still_blocked_for_level_learner(self):
        self.client.force_authenticate(user=self.learner_grp)
        res = self.client.get(f"/api/modules/{self.l1_mods[0].pk}/download-material/1/?download=true")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class LevelBasedProgressCalculationTest(APITestCase):
    """Checkpoint 2 / Step 2: Level-based and course-less module progress calculation tests."""

    def setUp(self):
        self.admin = User.objects.create_user(username="p2_admin", password="x", role=User.Role.ADMIN)
        self.trainer = User.objects.create_user(username="p2_trainer", password="x", role=User.Role.TRAINER)
        self.learner = User.objects.create_user(username="p2_learner", password="x", role=User.Role.LEARNER)

        ct = CandidateType.objects.create(name="P2 CT", code="P2CT")
        self.group = LearnerGroup.objects.create(name="P2 Group", code="P2G", candidate_type=ct)
        GroupMembership.objects.create(group=self.group, learner=self.learner, is_active=True)
        TrainerGroupAssignment.objects.create(trainer=self.trainer, group=self.group, is_active=True)

        # Independent course-less Level 1 & Level 2
        self.level_1 = CourseLevel.objects.create(name="Standalone Level 1", order=1)
        self.level_2 = CourseLevel.objects.create(name="Standalone Level 2", order=2)

        self.m1 = Module.objects.create(level=self.level_1, name="Courseless Mod 1", order=1, status=PUB)
        self.m2 = Module.objects.create(level=self.level_1, name="Courseless Mod 2", order=2, status=PUB)
        self.m_draft = Module.objects.create(level=self.level_1, name="Courseless Draft", order=3)
        self.m_lvl2 = Module.objects.create(level=self.level_2, name="Level 2 Mod", order=1, status=PUB)

        self.q_m1 = ModuleQuestion.objects.create(
            module=self.m1, question_text="Q1?", order=1, is_required=True, is_active=True
        )
        self.q_m2 = ModuleQuestion.objects.create(
            module=self.m2, question_text="Q2?", order=1, is_required=True, is_active=True
        )

        # Legacy Course with a Level and Module
        self.course = Course.objects.create(name="Legacy Course", code="LEG_CRS", status=PUB)
        self.course_level = CourseLevel.objects.create(course=self.course, name="Course Level 1", order=1)
        self.c_mod1 = Module.objects.create(
            course=self.course, level=self.course_level, name="Course Mod 1", order=1, status=PUB
        )
        self.c_mod2 = Module.objects.create(
            course=self.course, level=self.course_level, name="Course Mod 2", order=2, status=PUB
        )
        self.q_cm1 = ModuleQuestion.objects.create(
            module=self.c_mod1, question_text="CM1 Q?", order=1, is_required=True, is_active=True
        )

    def test_level_based_courseless_modules_progress_and_api_response(self):
        from core.api_views import _calculate_learner_progress_metrics, _get_distinct_assigned_modules_for_learner

        TrainingAssignment.objects.create(level=self.level_1, learner_group=self.group, assigned_by=self.admin)

        assigned = _get_distinct_assigned_modules_for_learner(self.learner)
        self.assertEqual({m.id for m in assigned}, {self.m1.id, self.m2.id})

        # Answer m1 only
        ModuleQuestionResponse.objects.create(question=self.q_m1, learner=self.learner, response_value=True)

        tot, comp, pend, pct, details = _calculate_learner_progress_metrics(self.learner, assigned)
        self.assertEqual(tot, 2)
        self.assertEqual(comp, 1)
        self.assertEqual(pend, 1)
        self.assertEqual(pct, 50.0)

        by_id = {d["id"]: d for d in details}
        self.assertIsNone(by_id[self.m1.id]["course"]["id"])
        self.assertIsNone(by_id[self.m1.id]["course"]["name"])
        self.assertEqual(by_id[self.m1.id]["level"]["id"], self.level_1.id)
        self.assertEqual(by_id[self.m1.id]["level"]["name"], "Standalone Level 1")
        self.assertEqual(by_id[self.m1.id]["level_id"], self.level_1.id)
        self.assertEqual(by_id[self.m1.id]["level_name"], "Standalone Level 1")
        self.assertTrue(by_id[self.m1.id]["is_completed"])
        self.assertFalse(by_id[self.m2.id]["is_completed"])

        # Verify trainer overview and detail endpoints do not crash on course=None
        self.client.force_authenticate(user=self.trainer)
        res_list = self.client.get("/api/trainer/learners/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        row = next(r for r in res_list.data["learners"] if r["learner_id"] == self.learner.id)
        self.assertEqual(row["total_assigned_modules"], 2)
        self.assertEqual(row["completed_modules"], 1)
        self.assertEqual(row["completion_percentage"], 50.0)

        res_detail = self.client.get(f"/api/trainer/learners/{self.learner.id}/progress/")
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        mod_map = {m["module_id"]: m for m in res_detail.data["modules"]}
        self.assertIsNone(mod_map[self.m1.id]["course_id"])
        self.assertIsNone(mod_map[self.m1.id]["course_name"])
        self.assertEqual(mod_map[self.m1.id]["level_id"], self.level_1.id)
        self.assertEqual(mod_map[self.m1.id]["level_name"], "Standalone Level 1")

    def test_course_based_assignment_progress_unchanged(self):
        from core.api_views import _calculate_learner_progress_metrics, _get_distinct_assigned_modules_for_learner

        TrainingAssignment.objects.create(course=self.course, learner=self.learner, assigned_by=self.admin)
        ModuleQuestionResponse.objects.create(question=self.q_cm1, learner=self.learner, response_value=True)

        assigned = _get_distinct_assigned_modules_for_learner(self.learner)
        self.assertEqual({m.id for m in assigned}, {self.c_mod1.id, self.c_mod2.id})

        tot, comp, pend, pct, details = _calculate_learner_progress_metrics(self.learner, assigned)
        self.assertEqual((tot, comp, pend, pct), (2, 1, 1, 50.0))
        by_id = {d["id"]: d for d in details}
        self.assertEqual(by_id[self.c_mod1.id]["course"], {"id": self.course.id, "name": "Legacy Course"})
        self.assertEqual(by_id[self.c_mod1.id]["level_id"], self.course_level.id)

    def test_direct_module_assignment_with_courseless_module(self):
        from core.api_views import _calculate_learner_progress_metrics, _get_distinct_assigned_modules_for_learner

        TrainingAssignment.objects.create(module=self.m_lvl2, learner=self.learner, assigned_by=self.admin)
        assigned = _get_distinct_assigned_modules_for_learner(self.learner)
        self.assertEqual([m.id for m in assigned], [self.m_lvl2.id])

        tot, comp, pend, pct, details = _calculate_learner_progress_metrics(self.learner, assigned)
        self.assertEqual((tot, comp, pend, pct), (1, 0, 1, 0.0))
        self.assertIsNone(details[0]["course"]["id"])
        self.assertEqual(details[0]["level_id"], self.level_2.id)

    def test_overlapping_course_level_and_module_assignments_deduplicated(self):
        from core.api_views import _calculate_learner_progress_metrics, _get_distinct_assigned_modules_for_learner

        # Assign the same curriculum via Course, Level, and direct Module simultaneously
        TrainingAssignment.objects.create(course=self.course, learner_group=self.group, assigned_by=self.admin)
        TrainingAssignment.objects.create(level=self.course_level, learner=self.learner, assigned_by=self.admin)
        TrainingAssignment.objects.create(module=self.c_mod1, learner=self.learner, assigned_by=self.admin)

        assigned = _get_distinct_assigned_modules_for_learner(self.learner)
        self.assertEqual(assigned.count(), 2)
        self.assertEqual({m.id for m in assigned}, {self.c_mod1.id, self.c_mod2.id})

        ModuleQuestionResponse.objects.create(question=self.q_cm1, learner=self.learner, response_value=True)
        tot, comp, pend, pct, _ = _calculate_learner_progress_metrics(self.learner, assigned)
        self.assertEqual((tot, comp, pend, pct), (2, 1, 1, 50.0))

    def test_inactive_assignments_excluded_from_progress(self):
        from core.api_views import _calculate_learner_progress_metrics, _get_distinct_assigned_modules_for_learner

        TrainingAssignment.objects.create(
            level=self.level_1, learner=self.learner, assigned_by=self.admin, is_active=False
        )
        assigned = _get_distinct_assigned_modules_for_learner(self.learner)
        self.assertEqual(assigned.count(), 0)
        tot, comp, pend, pct, details = _calculate_learner_progress_metrics(self.learner, assigned)
        self.assertEqual((tot, comp, pend, pct, details), (0, 0, 0, 0.0, []))

    def test_draft_course_level_excluded_from_progress(self):
        from core.api_views import _get_distinct_assigned_modules_for_learner

        draft_course = Course.objects.create(name="Draft C", code="DRFC", status=PublicationStatus.DRAFT)
        draft_lvl = CourseLevel.objects.create(course=draft_course, name="Draft C Level", order=1)
        Module.objects.create(course=draft_course, level=draft_lvl, name="Mod in Draft C", order=1, status=PUB)
        TrainingAssignment.objects.create(level=draft_lvl, learner=self.learner, assigned_by=self.admin)

        assigned = _get_distinct_assigned_modules_for_learner(self.learner)
        self.assertEqual(assigned.count(), 0)

    def test_five_question_assessment_threshold_preserved_on_level_modules(self):
        from core.api_views import _calculate_learner_progress_metrics, _get_distinct_assigned_modules_for_learner

        # Add 4 more required questions to m1 (total 5 -> tested assessment requiring score >= 3.0)
        for i in range(2, 6):
            ModuleQuestion.objects.create(
                module=self.m1, question_text=f"Q{i}?", order=i, is_required=True, is_active=True
            )
        TrainingAssignment.objects.create(module=self.m1, learner=self.learner, assigned_by=self.admin)
        assigned = _get_distinct_assigned_modules_for_learner(self.learner)

        # Attempt with failing score 2.0 -> not completed
        ModuleAssessmentAttempt.objects.create(
            module=self.m1, learner=self.learner, attempt_number=1, score=2.0, total_possible=5.0, is_completed=True
        )
        _, comp_fail, _, _, _ = _calculate_learner_progress_metrics(self.learner, assigned)
        self.assertEqual(comp_fail, 0)

        # Attempt with passing score 3.0 -> completed
        ModuleAssessmentAttempt.objects.create(
            module=self.m1, learner=self.learner, attempt_number=2, score=3.0, total_possible=5.0, is_completed=True
        )
        _, comp_pass, _, pct_pass, _ = _calculate_learner_progress_metrics(self.learner, assigned)
        self.assertEqual(comp_pass, 1)
        self.assertEqual(pct_pass, 100.0)


class CourseLevelAndModuleValidationAPITest(APITestCase):
    """
    Checkpoint 2, Step 3 tests:
    - Independent CourseLevel creation without automatic Course.objects.first() assignment
    - Course-linked CourseLevel creation and duplicate validation
    - Role-scoped GET /api/course-levels/ (Admin, Trainer, Learner + sibling isolation)
    - ModuleSerializer validation (mandatory level, optional course, Course/Level consistency,
      level-scoped duplicate code/order protection without global uniqueness)
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="cp2_s3_admin", email="cp2_s3_admin@test.com", password="pw", role=User.Role.ADMIN
        )
        self.trainer = User.objects.create_user(
            username="cp2_s3_trainer", email="cp2_s3_trainer@test.com", password="pw", role=User.Role.TRAINER
        )
        self.learner_lvl = User.objects.create_user(
            username="cp2_s3_learner_lvl", email="cp2_s3_learner_lvl@test.com", password="pw", role=User.Role.LEARNER
        )
        self.learner_crs = User.objects.create_user(
            username="cp2_s3_learner_crs", email="cp2_s3_learner_crs@test.com", password="pw", role=User.Role.LEARNER
        )
        self.learner_mod = User.objects.create_user(
            username="cp2_s3_learner_mod", email="cp2_s3_learner_mod@test.com", password="pw", role=User.Role.LEARNER
        )

        # Published courses
        self.course_a = Course.objects.create(
            name="Step 3 Course A", code="S3-CA", order=1, status=PUB, created_by=self.admin
        )
        self.course_b = Course.objects.create(
            name="Step 3 Course B", code="S3-CB", order=2, status=PUB, created_by=self.admin
        )
        # Draft course
        self.course_draft = Course.objects.create(
            name="Step 3 Course Draft", code="S3-CD", order=3, status=PublicationStatus.DRAFT, created_by=self.admin
        )

        # Course-linked levels
        self.ca_lvl1 = CourseLevel.objects.create(course=self.course_a, name="CA Level 1", order=1)
        self.ca_lvl2 = CourseLevel.objects.create(course=self.course_a, name="CA Level 2", order=2)
        self.cb_lvl1 = CourseLevel.objects.create(course=self.course_b, name="CB Level 1", order=1)
        self.cd_lvl1 = CourseLevel.objects.create(course=self.course_draft, name="CD Level 1", order=1)

        # Independent levels (course=None)
        self.ind_lvl_pub = CourseLevel.objects.create(course=None, name="Ind Level Pub", order=1)
        self.ind_lvl_sibling = CourseLevel.objects.create(course=None, name="Ind Level Sibling", order=2)
        self.ind_lvl_draft_only = CourseLevel.objects.create(course=None, name="Ind Level Draft Only", order=3)

        # Modules in independent levels
        self.mod_ind_pub = Module.objects.create(
            course=None, level=self.ind_lvl_pub, name="Ind Pub Mod", order=1, status=PUB
        )
        self.mod_ind_sib = Module.objects.create(
            course=None, level=self.ind_lvl_sibling, name="Ind Sib Mod", order=1, status=PUB
        )
        self.mod_ind_draft = Module.objects.create(
            course=None, level=self.ind_lvl_draft_only, name="Ind Draft Mod", order=1, status=PublicationStatus.DRAFT
        )

    def _ids(self, response):
        data = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        return [item["id"] for item in data]

    def test_create_independent_course_level_without_course_omitted_and_null(self):
        """Creating a CourseLevel without specifying a Course (or with course=null) keeps course=None."""
        self.client.force_authenticate(user=self.admin)

        # 1. Omitted course field (even though Course.objects.first() exists!)
        res1 = self.client.post(
            "/api/course-levels/",
            {"name": "New Standalone Level A", "order": 10, "description": "No course"},
            format="json",
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res1.data["course"])
        self.assertIsNone(res1.data["course_name"])
        lvl1 = CourseLevel.objects.get(pk=res1.data["id"])
        self.assertIsNone(lvl1.course)

        # 2. Explicit course=None
        res2 = self.client.post(
            "/api/course-levels/",
            {"course": None, "name": "New Standalone Level B", "order": 11},
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res2.data["course"])

    def test_create_course_linked_level_and_duplicate_validation(self):
        """Creating a Course-linked Level works and rejects duplicate name/order within the same Course."""
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(
            "/api/course-levels/",
            {"course": self.course_a.id, "name": "CA Level 3", "order": 3},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["course"], self.course_a.id)
        self.assertEqual(res.data["course_name"], self.course_a.name)

        # Duplicate name in same course -> 400
        dup_name = self.client.post(
            "/api/course-levels/",
            {"course": self.course_a.id, "name": "CA Level 3", "order": 4},
            format="json",
        )
        self.assertEqual(dup_name.status_code, status.HTTP_400_BAD_REQUEST)

        # Duplicate order in same course -> 400
        dup_order = self.client.post(
            "/api/course-levels/",
            {"course": self.course_a.id, "name": "CA Level 4", "order": 3},
            format="json",
        )
        self.assertEqual(dup_order.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_list_all_independent_and_course_linked_levels(self):
        """Admin sees all CourseLevels including independent, draft-only, and draft-course levels."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/course-levels/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = self._ids(res)
        for expected in [
            self.ca_lvl1.id,
            self.ca_lvl2.id,
            self.cb_lvl1.id,
            self.cd_lvl1.id,
            self.ind_lvl_pub.id,
            self.ind_lvl_sibling.id,
            self.ind_lvl_draft_only.id,
        ]:
            self.assertIn(expected, ids)

    def test_trainer_visibility_of_independent_and_published_levels(self):
        """Trainer sees Levels of published Courses and independent Levels containing published Modules."""
        self.client.force_authenticate(user=self.trainer)
        res = self.client.get("/api/course-levels/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = self._ids(res)

        # Visible: levels of published courses + independent levels with published modules
        self.assertIn(self.ca_lvl1.id, ids)
        self.assertIn(self.ca_lvl2.id, ids)
        self.assertIn(self.cb_lvl1.id, ids)
        self.assertIn(self.ind_lvl_pub.id, ids)
        self.assertIn(self.ind_lvl_sibling.id, ids)

        # Hidden: level of draft course + independent level with only draft modules
        self.assertNotIn(self.cd_lvl1.id, ids)
        self.assertNotIn(self.ind_lvl_draft_only.id, ids)

    def test_learner_visibility_of_assigned_levels_and_no_sibling_leakage(self):
        """Learners see only explicitly assigned Levels (or via Course/Module assignment) and never sibling Levels."""
        # 1. Learner assigned to ca_lvl1 and ind_lvl_pub
        TrainingAssignment.objects.create(level=self.ca_lvl1, learner=self.learner_lvl, assigned_by=self.admin)
        TrainingAssignment.objects.create(level=self.ind_lvl_pub, learner=self.learner_lvl, assigned_by=self.admin)

        self.client.force_authenticate(user=self.learner_lvl)
        res = self.client.get("/api/course-levels/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = self._ids(res)

        self.assertIn(self.ca_lvl1.id, ids)
        self.assertIn(self.ind_lvl_pub.id, ids)
        # Sibling levels in the same course (ca_lvl2) and unassigned independent levels must NOT leak
        self.assertNotIn(self.ca_lvl2.id, ids)
        self.assertNotIn(self.ind_lvl_sibling.id, ids)
        self.assertNotIn(self.cb_lvl1.id, ids)

        # 2. Learner assigned directly to Course A sees both ca_lvl1 and ca_lvl2
        TrainingAssignment.objects.create(course=self.course_a, learner=self.learner_crs, assigned_by=self.admin)
        self.client.force_authenticate(user=self.learner_crs)
        crs_ids = self._ids(self.client.get("/api/course-levels/"))
        self.assertEqual(set(crs_ids), {self.ca_lvl1.id, self.ca_lvl2.id})

        # 3. Learner assigned directly to a published Module sees only that Module's Level
        TrainingAssignment.objects.create(module=self.mod_ind_sib, learner=self.learner_mod, assigned_by=self.admin)
        self.client.force_authenticate(user=self.learner_mod)
        mod_ids = self._ids(self.client.get("/api/course-levels/"))
        self.assertEqual(mod_ids, [self.ind_lvl_sibling.id])

    def test_create_module_without_course_but_with_valid_level(self):
        """Modules can be created with a valid Level and without a Course (omitted or null)."""
        self.client.force_authenticate(user=self.admin)

        # Omitted course
        res = self.client.post(
            "/api/modules/",
            {
                "level": self.ind_lvl_pub.id,
                "name": "Courseless Module 2",
                "order": 2,
                "status": PUB,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["course"])
        self.assertEqual(res.data["level"], self.ind_lvl_pub.id)

        # Explicit course=None
        res_null = self.client.post(
            "/api/modules/",
            {
                "course": None,
                "level": self.ind_lvl_pub.id,
                "name": "Courseless Module 3",
                "order": 3,
                "status": PUB,
            },
            format="json",
        )
        self.assertEqual(res_null.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res_null.data["course"])

        # Missing level -> 400 Bad Request
        res_no_lvl = self.client.post(
            "/api/modules/",
            {"name": "No Level Module", "order": 4},
            format="json",
        )
        self.assertEqual(res_no_lvl.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("level", res_no_lvl.data)

    def test_create_module_with_matching_course_and_level_and_reject_inconsistent(self):
        """Creating a Module with matching Course & Level succeeds; mismatched Course & Level is rejected."""
        self.client.force_authenticate(user=self.admin)

        # Matching Course A + CA Level 1 -> 201 Created
        res_ok = self.client.post(
            "/api/modules/",
            {
                "course": self.course_a.id,
                "level": self.ca_lvl1.id,
                "name": "Matched Course Module",
                "order": 1,
            },
            format="json",
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data["course"], self.course_a.id)
        self.assertEqual(res_ok.data["level"], self.ca_lvl1.id)

        # Inconsistent: Course A + CB Level 1 (belongs to Course B) -> 400 Bad Request
        res_bad = self.client.post(
            "/api/modules/",
            {
                "course": self.course_a.id,
                "level": self.cb_lvl1.id,
                "name": "Mismatched Module",
                "order": 2,
            },
            format="json",
        )
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("level", res_bad.data)

    def test_duplicate_module_order_within_level_without_global_uniqueness(self):
        """Duplicate order within the same Level is rejected, but allowed in a different independent Level."""
        self.client.force_authenticate(user=self.admin)

        # Duplicate order 1 in ind_lvl_pub -> 400
        dup_order = self.client.post(
            "/api/modules/",
            {"level": self.ind_lvl_pub.id, "name": "Dup Order", "order": 1},
            format="json",
        )
        self.assertEqual(dup_order.status_code, status.HTTP_400_BAD_REQUEST)

        # Another independent level CAN reuse order=2 without global collision
        lvl_x = CourseLevel.objects.create(course=None, name="Ind Level X", order=10)
        lvl_y = CourseLevel.objects.create(course=None, name="Ind Level Y", order=11)

        r_x = self.client.post(
            "/api/modules/",
            {"level": lvl_x.id, "name": "Mod X", "order": 1},
            format="json",
        )
        self.assertEqual(r_x.status_code, status.HTTP_201_CREATED)

        r_y = self.client.post(
            "/api/modules/",
            {"level": lvl_y.id, "name": "Mod Y", "order": 1},
            format="json",
        )
        self.assertEqual(r_y.status_code, status.HTTP_201_CREATED)

    def test_existing_course_based_creation_and_listing_behaviour_preserved(self):
        """Course-based level filtering (?course=<id>) and creation remain intact."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f"/api/course-levels/?course={self.course_a.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = self._ids(res)
        self.assertEqual(set(ids), {self.ca_lvl1.id, self.ca_lvl2.id})


class UploadContentClusterHandlingAPITest(APITestCase):
    """
    Checkpoint 2, Step 4 tests:
    - Upload works for a Module with course=None (preserving CLUSTER-1 association)
    - Upload continues to work for a Course-linked Module
    - Repeated uploads do not create duplicate clusters
    - Existing CLUSTER-1 association is preserved deterministically without arbitrary .first()
    - Existing TrainingFile and TrainingFileMapping records remain intact
    - Missing, ambiguous, or invalid cluster conditions are handled safely
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import tempfile
        from django.test import override_settings
        cls._temp_media_dir = tempfile.mkdtemp(prefix="lms_cp2_step4_media_")
        cls._override = override_settings(MEDIA_ROOT=cls._temp_media_dir)
        cls._override.enable()

    @classmethod
    def tearDownClass(cls):
        import shutil
        cls._override.disable()
        shutil.rmtree(cls._temp_media_dir, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        from core.models import TrainingCluster, TrainingFile, TrainingFileMapping
        self.TrainingCluster = TrainingCluster
        self.TrainingFile = TrainingFile
        self.TrainingFileMapping = TrainingFileMapping

        self.admin = User.objects.create_user(
            username="cp2_s4_admin", email="cp2_s4_admin@test.com", password="pw", role=User.Role.ADMIN
        )
        self.client.force_authenticate(user=self.admin)

        # Canonical course with CLUSTER-1 (modeling live curriculum data)
        self.course_main = Course.objects.create(
            name="IT Recruitment Training Program",
            code="IT-REC-01",
            order=1,
            status=PUB,
            created_by=self.admin,
        )
        self.cluster_2 = TrainingCluster.objects.create(
            course=self.course_main,
            name="Cluster 2: Secondary",
            code="CLUSTER-2",
            order=2,
        )
        self.cluster_1 = TrainingCluster.objects.create(
            course=self.course_main,
            name="Cluster 1: Organizational Identity & Staffing Fundamentals",
            code="CLUSTER-1",
            order=1,
        )

        # Independent Level and course-less Module (module.course=None, level.course=None)
        self.ind_level = CourseLevel.objects.create(course=None, name="Level 1 Independent", order=1)
        self.courseless_module = Module.objects.create(
            course=None,
            level=self.ind_level,
            name="Courseless Upload Module",
            order=1,
            status=PUB,
            created_by=self.admin,
        )

        # Pre-existing TrainingFile and TrainingFileMapping to verify preservation
        from django.core.files.uploadedfile import SimpleUploadedFile
        existing_file_obj = SimpleUploadedFile("existing_guide.pdf", b"%PDF-1.4 pre-existing content", content_type="application/pdf")
        self.existing_tf = TrainingFile.objects.create(
            file=existing_file_obj,
            filename="existing_guide.pdf",
            relative_path="existing_guide.pdf",
            file_type="PDF",
            file_size=29,
            checksum="e" * 64,
            uploaded_by=self.admin,
        )
        self.existing_mapping = TrainingFileMapping.objects.create(
            training_file=self.existing_tf,
            cluster=self.cluster_1,
            module=self.courseless_module,
            category="PRIMARY_INSTRUCTIONAL",
            notes="Pre-existing mapping",
        )

        # Separate Course without any clusters yet, with a Course-linked Level and Module
        self.course_new = Course.objects.create(
            name="New Course Without Clusters",
            code="NEW-CRS-02",
            order=2,
            status=PUB,
            created_by=self.admin,
        )
        self.course_new_level = CourseLevel.objects.create(
            course=self.course_new, name="New Course Level 1", order=1
        )
        self.course_linked_module = Module.objects.create(
            course=self.course_new,
            level=self.course_new_level,
            name="Course Linked Upload Module",
            order=1,
            status=PUB,
            created_by=self.admin,
        )

    def test_upload_works_for_courseless_module_and_preserves_cluster_1(self):
        """Uploading to a Module with course=None succeeds without accessing module.course.name and maps to CLUSTER-1."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        initial_cluster_count = self.TrainingCluster.objects.count()
        f1 = SimpleUploadedFile("courseless_lesson.pdf", b"%PDF-1.4 courseless lesson bytes", content_type="application/pdf")

        res = self.client.post(
            f"/api/modules/{self.courseless_module.id}/upload-content/",
            {"file": f1, "category": "PRIMARY_INSTRUCTIONAL", "notes": "Uploaded to courseless module"},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["module_id"], self.courseless_module.id)
        self.assertEqual(res.data["cluster_id"], self.cluster_1.id)
        self.assertEqual(res.data["cluster_code"], "CLUSTER-1")

        # Verify no extra cluster was created and mapping points to cluster_1
        self.assertEqual(self.TrainingCluster.objects.count(), initial_cluster_count)
        mapping = self.TrainingFileMapping.objects.get(pk=res.data["mapping_id"])
        self.assertEqual(mapping.cluster_id, self.cluster_1.id)
        self.assertEqual(mapping.module_id, self.courseless_module.id)

        # Verify pre-existing file and mapping remain intact
        self.assertTrue(self.TrainingFile.objects.filter(pk=self.existing_tf.id).exists())
        self.assertTrue(self.TrainingFileMapping.objects.filter(pk=self.existing_mapping.id, cluster=self.cluster_1).exists())

    def test_upload_works_for_course_linked_module_and_prevents_duplicate_clusters(self):
        """Uploading to a Course-linked Module creates its course cluster once and reuses it on repeated uploads."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.assertEqual(self.TrainingCluster.objects.filter(course=self.course_new).count(), 0)

        f1 = SimpleUploadedFile("course_mod_doc1.pdf", b"%PDF-1.4 doc 1 content", content_type="application/pdf")
        res1 = self.client.post(
            f"/api/modules/{self.course_linked_module.id}/upload-content/",
            {"file": f1, "category": "PRIMARY_INSTRUCTIONAL"},
            format="multipart",
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.TrainingCluster.objects.filter(course=self.course_new).count(), 1)
        created_cluster = self.TrainingCluster.objects.get(course=self.course_new)
        self.assertEqual(created_cluster.code, f"CLUSTER-{self.course_new.id}")

        # Repeated upload with a second file must reuse the same cluster without creating duplicates
        f2 = SimpleUploadedFile("course_mod_doc2.pdf", b"%PDF-1.4 doc 2 content", content_type="application/pdf")
        res2 = self.client.post(
            f"/api/modules/{self.course_linked_module.id}/upload-content/",
            {"file": f2, "category": "SUPPLEMENTARY_REFERENCE"},
            format="multipart",
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.TrainingCluster.objects.filter(course=self.course_new).count(), 1)
        self.assertEqual(res2.data["cluster_id"], created_cluster.id)

        # Repeated upload on course-less module also reuses CLUSTER-1 without creating duplicates
        total_clusters_before = self.TrainingCluster.objects.count()
        f3 = SimpleUploadedFile("courseless_doc2.pdf", b"%PDF-1.4 courseless doc 2", content_type="application/pdf")
        res3 = self.client.post(
            f"/api/modules/{self.courseless_module.id}/upload-content/",
            {"file": f3},
            format="multipart",
        )
        self.assertEqual(res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.TrainingCluster.objects.count(), total_clusters_before)
        self.assertEqual(res3.data["cluster_id"], self.cluster_1.id)

    def test_course_linked_module_prefers_cluster_1_deterministically_over_other_clusters(self):
        """When a Course has multiple clusters (e.g. CLUSTER-2 created before CLUSTER-1), CLUSTER-1 is selected deterministically."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        lvl_main = CourseLevel.objects.create(course=self.course_main, name="Main Course Level", order=1)
        mod_main = Module.objects.create(
            course=self.course_main, level=lvl_main, name="Main Mod", order=1, status=PUB
        )
        f_main = SimpleUploadedFile("main_doc.pdf", b"%PDF-1.4 main doc bytes", content_type="application/pdf")
        res = self.client.post(
            f"/api/modules/{mod_main.id}/upload-content/",
            {"file": f_main},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["cluster_id"], self.cluster_1.id)
        self.assertEqual(res.data["cluster_code"], "CLUSTER-1")

    def test_missing_or_ambiguous_or_invalid_cluster_conditions_handled_safely(self):
        """Missing CLUSTER-1, ambiguous multiple CLUSTER-1 records, or invalid cluster_id return 400 safely without inventing clusters."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        # 1. Invalid explicit cluster_id -> 400 Bad Request
        f_bad = SimpleUploadedFile("bad_cluster.pdf", b"%PDF-1.4 bad cluster bytes", content_type="application/pdf")
        res_bad_id = self.client.post(
            f"/api/modules/{self.courseless_module.id}/upload-content/",
            {"file": f_bad, "cluster_id": 999999},
            format="multipart",
        )
        self.assertEqual(res_bad_id.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.TrainingFile.objects.filter(filename="bad_cluster.pdf").exists())

        # 2. Ambiguous: second course also defines a CLUSTER-1
        dup_c1 = self.TrainingCluster.objects.create(
            course=self.course_new,
            name="Duplicate Cluster 1 in New Course",
            code="CLUSTER-1",
            order=1,
        )
        f_ambig = SimpleUploadedFile("ambig.pdf", b"%PDF-1.4 ambiguous cluster bytes", content_type="application/pdf")
        res_ambig = self.client.post(
            f"/api/modules/{self.courseless_module.id}/upload-content/",
            {"file": f_ambig},
            format="multipart",
        )
        self.assertEqual(res_ambig.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.TrainingFile.objects.filter(filename="ambig.pdf").exists())

        # Supplying explicit cluster_id resolves ambiguity cleanly
        f_explicit = SimpleUploadedFile("explicit.pdf", b"%PDF-1.4 explicit cluster bytes", content_type="application/pdf")
        res_explicit = self.client.post(
            f"/api/modules/{self.courseless_module.id}/upload-content/",
            {"file": f_explicit, "cluster_id": self.cluster_1.id},
            format="multipart",
        )
        self.assertEqual(res_explicit.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_explicit.data["cluster_id"], self.cluster_1.id)

        # 3. Missing CLUSTER-1: remove all CLUSTER-1 records and verify safe 400 without inventing clusters
        dup_c1.delete()
        self.cluster_1.delete()
        clusters_before = self.TrainingCluster.objects.count()
        f_missing = SimpleUploadedFile("missing_c1.pdf", b"%PDF-1.4 missing c1 bytes", content_type="application/pdf")
        res_missing = self.client.post(
            f"/api/modules/{self.courseless_module.id}/upload-content/",
            {"file": f_missing},
            format="multipart",
        )
        self.assertEqual(res_missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.TrainingCluster.objects.count(), clusters_before)
        self.assertFalse(self.TrainingFile.objects.filter(filename="missing_c1.pdf").exists())

    def test_cross_course_cluster_id_rejected_for_course_linked_module(self):
        """A valid cluster ID belonging to another Course is rejected for a Course-linked Module."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        f_cross = SimpleUploadedFile("cross_course.pdf", b"%PDF-1.4 cross course bytes", content_type="application/pdf")
        res = self.client.post(
            f"/api/modules/{self.course_linked_module.id}/upload-content/",
            {"file": f_cross, "cluster_id": self.cluster_1.id},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.TrainingFile.objects.filter(filename="cross_course.pdf").exists())

    def test_non_cluster_1_id_rejected_for_completely_courseless_module(self):
        """A non-CLUSTER-1 cluster ID is rejected for a completely course-less Module."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        f_non_c1 = SimpleUploadedFile("non_c1.pdf", b"%PDF-1.4 non c1 bytes", content_type="application/pdf")
        res = self.client.post(
            f"/api/modules/{self.courseless_module.id}/upload-content/",
            {"file": f_non_c1, "cluster_id": self.cluster_2.id},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(self.TrainingFile.objects.filter(filename="non_c1.pdf").exists())

    def test_hybrid_courseless_module_under_course_linked_level_uses_level_course_cluster(self):
        """A Module with course=None but a Course-linked Level uses the Level's Course cluster and rejects other courses' clusters."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        hybrid_mod = Module.objects.create(
            course=None,
            level=self.course_new_level,
            name="Hybrid Module Under Course Level",
            order=2,
            status=PUB,
            created_by=self.admin,
        )
        # Rejects cluster from course_main
        f_wrong = SimpleUploadedFile("hybrid_wrong.pdf", b"%PDF-1.4 hybrid wrong bytes", content_type="application/pdf")
        res_wrong = self.client.post(
            f"/api/modules/{hybrid_mod.id}/upload-content/",
            {"file": f_wrong, "cluster_id": self.cluster_1.id},
            format="multipart",
        )
        self.assertEqual(res_wrong.status_code, status.HTTP_400_BAD_REQUEST)

        # Uses/creates cluster for course_new
        f_ok = SimpleUploadedFile("hybrid_ok.pdf", b"%PDF-1.4 hybrid ok bytes", content_type="application/pdf")
        res_ok = self.client.post(
            f"/api/modules/{hybrid_mod.id}/upload-content/",
            {"file": f_ok},
            format="multipart",
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        expected_cluster = self.TrainingCluster.objects.get(course=self.course_new)
        self.assertEqual(res_ok.data["cluster_id"], expected_cluster.id)

    def test_course_with_existing_custom_cluster_order_2_does_not_create_unintended_cluster(self):
        """A Course with one existing custom cluster (code='CUSTOM-CLUST', order=2) does not receive an unintended additional cluster."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        custom_cluster = self.TrainingCluster.objects.create(
            course=self.course_new,
            name="Custom Topic Cluster",
            code="CUSTOM-CLUST",
            order=2,
        )
        clusters_before = self.TrainingCluster.objects.filter(course=self.course_new).count()
        self.assertEqual(clusters_before, 1)

        # Automatic upload without cluster_id must NOT create a second cluster automatically
        f_auto = SimpleUploadedFile("custom_auto.pdf", b"%PDF-1.4 custom auto bytes", content_type="application/pdf")
        res_auto = self.client.post(
            f"/api/modules/{self.course_linked_module.id}/upload-content/",
            {"file": f_auto},
            format="multipart",
        )
        self.assertEqual(res_auto.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.TrainingCluster.objects.filter(course=self.course_new).count(), 1)
        self.assertFalse(self.TrainingFile.objects.filter(filename="custom_auto.pdf").exists())

        # Supplying explicit cluster_id for that custom cluster succeeds without creating a new cluster
        f_explicit = SimpleUploadedFile("custom_explicit.pdf", b"%PDF-1.4 custom explicit bytes", content_type="application/pdf")
        res_explicit = self.client.post(
            f"/api/modules/{self.course_linked_module.id}/upload-content/",
            {"file": f_explicit, "cluster_id": custom_cluster.id},
            format="multipart",
        )
        self.assertEqual(res_explicit.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_explicit.data["cluster_id"], custom_cluster.id)
        self.assertEqual(self.TrainingCluster.objects.filter(course=self.course_new).count(), 1)


class AdminOversightIndependentLevelAPITest(APITestCase):
    """
    Focused Checkpoint 2, Step 5A tests for AdminOversightViewSet:
    - GET /api/admin/reports/trainer-workload/
    - GET /api/admin/reports/in-progress-learners/
    Verifies support for Course, CourseLevel (Course-linked & independent), and Module
    assignments, course-less Modules, draft exclusion, deduplication, 3/5 assessment
    pass threshold, and safe Level metadata in in-progress learners.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_cp2_s5a", password="Password123!", role=User.Role.ADMIN
        )
        self.trainer = User.objects.create_user(
            username="trainer_cp2_s5a", password="Password123!", role=User.Role.TRAINER
        )
        self.learner_1 = User.objects.create_user(
            username="learner1_cp2_s5a",
            first_name="Alice",
            last_name="Learner",
            email="alice.s5a@example.com",
            password="Password123!",
            role=User.Role.LEARNER,
        )
        self.learner_2 = User.objects.create_user(
            username="learner2_cp2_s5a",
            first_name="Bob",
            last_name="Learner",
            email="bob.s5a@example.com",
            password="Password123!",
            role=User.Role.LEARNER,
        )

        self.cand_type = CandidateType.objects.create(
            name="Step5A Candidate Type", code="S5A_CT", is_active=True
        )
        self.group = LearnerGroup.objects.create(
            name="Step5A Cohort Alpha",
            code="S5A_GRP_A",
            candidate_type=self.cand_type,
            is_active=True,
        )
        GroupMembership.objects.create(group=self.group, learner=self.learner_1, is_active=True)
        GroupMembership.objects.create(group=self.group, learner=self.learner_2, is_active=True)
        TrainerGroupAssignment.objects.create(
            trainer=self.trainer, group=self.group, is_active=True
        )

        # Course-linked curriculum: Course 1 with Level 1 (2 pub + 1 draft) and Level 2 (1 pub)
        self.course_1 = Course.objects.create(
            name="Step5A Main Course",
            code="S5A_CRS1",
            status=PUB,
            created_by=self.admin,
        )
        self.level_1 = CourseLevel.objects.create(
            course=self.course_1, name="Level 1", order=1
        )
        self.level_2 = CourseLevel.objects.create(
            course=self.course_1, name="Level 2", order=2
        )
        self.mod_l1_1 = Module.objects.create(
            course=self.course_1,
            level=self.level_1,
            name="L1 Direct Course Mod",
            order=1,
            status=PUB,
            created_by=self.admin,
        )
        # Hybrid module: course=None, but level.course=course_1
        self.mod_l1_hybrid = Module.objects.create(
            course=None,
            level=self.level_1,
            name="L1 Hybrid Level-Course Mod",
            order=2,
            status=PUB,
            created_by=self.admin,
        )
        self.mod_l1_draft = Module.objects.create(
            course=self.course_1,
            level=self.level_1,
            name="L1 Draft Mod",
            order=3,
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )
        self.mod_l2_1 = Module.objects.create(
            course=self.course_1,
            level=self.level_2,
            name="L2 Sibling Mod",
            order=4,
            status=PUB,
            created_by=self.admin,
        )

        # Independent Level (course=None) with course-less published and draft modules
        self.ind_level = CourseLevel.objects.create(
            course=None, name="Independent Level X", order=10
        )
        self.ind_mod_1 = Module.objects.create(
            course=None,
            level=self.ind_level,
            name="Independent Mod 1",
            order=1,
            status=PUB,
            created_by=self.admin,
        )
        self.ind_mod_2 = Module.objects.create(
            course=None,
            level=self.ind_level,
            name="Independent Mod 2",
            order=2,
            status=PUB,
            created_by=self.admin,
        )
        self.ind_mod_draft = Module.objects.create(
            course=None,
            level=self.ind_level,
            name="Independent Draft Mod",
            order=3,
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )

        # Draft Course with published-status module (must still be excluded because parent course is DRAFT)
        self.draft_course = Course.objects.create(
            name="Step5A Draft Course",
            code="S5A_CRS_DRAFT",
            status=PublicationStatus.DRAFT,
            created_by=self.admin,
        )
        self.draft_course_level = CourseLevel.objects.create(
            course=self.draft_course, name="Draft Course Level 1", order=1
        )
        self.mod_in_draft_course = Module.objects.create(
            course=None,
            level=self.draft_course_level,
            name="Mod Under Draft Course Level",
            order=1,
            status=PUB,
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)

    def _get_trainer_item(self):
        res = self.client.get("/api/admin/reports/trainer-workload/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return next(t for t in res.data["trainers"] if t["trainer_id"] == self.trainer.id)

    def test_trainer_workload_course_assignment_includes_published_course_and_hybrid_modules(self):
        """Course assignment includes published direct-course and hybrid level-course modules, excluding drafts."""
        TrainingAssignment.objects.create(
            learner_group=self.group, course=self.course_1, is_active=True, assigned_by=self.admin
        )
        # Also assign draft course -> must be ignored
        TrainingAssignment.objects.create(
            learner_group=self.group, course=self.draft_course, is_active=True, assigned_by=self.admin
        )

        t_item = self._get_trainer_item()
        # Course 1 has 3 published modules: mod_l1_1, mod_l1_hybrid, mod_l2_1 (mod_l1_draft excluded)
        self.assertEqual(t_item["total_assigned_courses_count"], 1)
        self.assertEqual(t_item["total_assigned_modules_count"], 3)
        grp_item = t_item["assigned_groups"][0]
        self.assertEqual(grp_item["assigned_courses_count"], 1)
        self.assertEqual(grp_item["assigned_modules_count"], 3)
        self.assertEqual(len(grp_item["assigned_curriculum"]), 1)
        self.assertEqual(grp_item["assigned_curriculum"][0]["type"], "Course")
        self.assertEqual(grp_item["assigned_curriculum"][0]["id"], self.course_1.id)
        self.assertEqual(grp_item["assigned_curriculum"][0]["modules_count"], 3)

    def test_trainer_workload_level_assignment_scopes_strictly_to_exact_level(self):
        """Level assignment includes only published modules in that exact Level (no sibling Level 2 modules)."""
        TrainingAssignment.objects.create(
            learner_group=self.group, level=self.level_1, is_active=True, assigned_by=self.admin
        )

        t_item = self._get_trainer_item()
        # Level 1 has 2 published modules: mod_l1_1 and mod_l1_hybrid (mod_l1_draft and mod_l2_1 excluded)
        self.assertEqual(t_item["total_assigned_courses_count"], 1)
        self.assertEqual(t_item["total_assigned_modules_count"], 2)
        grp_item = t_item["assigned_groups"][0]
        self.assertEqual(grp_item["assigned_courses_count"], 1)
        self.assertEqual(grp_item["assigned_modules_count"], 2)
        self.assertEqual(len(grp_item["assigned_curriculum"]), 1)
        curr = grp_item["assigned_curriculum"][0]
        self.assertEqual(curr["type"], "CourseLevel")
        self.assertEqual(curr["level_id"], self.level_1.id)
        self.assertEqual(curr["level_name"], "Level 1")
        self.assertEqual(curr["course_id"], self.course_1.id)
        self.assertEqual(curr["modules_count"], 2)

    def test_trainer_workload_independent_level_and_direct_module_assignments(self):
        """Independent Level (course=None) and direct course-less Module assignments resolve without errors."""
        # 1. Assign independent level (has 2 published course-less modules + 1 draft)
        ta_lvl = TrainingAssignment.objects.create(
            learner_group=self.group, level=self.ind_level, is_active=True, assigned_by=self.admin
        )
        # Also assign level under draft course -> must be excluded
        TrainingAssignment.objects.create(
            learner_group=self.group, level=self.draft_course_level, is_active=True, assigned_by=self.admin
        )

        t_item = self._get_trainer_item()
        self.assertEqual(t_item["total_assigned_courses_count"], 0)
        self.assertEqual(t_item["total_assigned_modules_count"], 2)
        grp_item = t_item["assigned_groups"][0]
        self.assertEqual(grp_item["assigned_courses_count"], 0)
        self.assertEqual(grp_item["assigned_modules_count"], 2)
        self.assertEqual(len(grp_item["assigned_curriculum"]), 1)
        curr_lvl = grp_item["assigned_curriculum"][0]
        self.assertEqual(curr_lvl["type"], "CourseLevel")
        self.assertEqual(curr_lvl["level_id"], self.ind_level.id)
        self.assertIsNone(curr_lvl["course_id"])
        self.assertEqual(curr_lvl["modules_count"], 2)

        # 2. Replace with direct module assignment to ind_mod_1 only
        ta_lvl.delete()
        TrainingAssignment.objects.create(
            learner_group=self.group, module=self.ind_mod_1, is_active=True, assigned_by=self.admin
        )
        # Direct assignment to draft module -> must be excluded
        TrainingAssignment.objects.create(
            learner_group=self.group, module=self.ind_mod_draft, is_active=True, assigned_by=self.admin
        )

        t_item2 = self._get_trainer_item()
        self.assertEqual(t_item2["total_assigned_courses_count"], 0)
        self.assertEqual(t_item2["total_assigned_modules_count"], 1)
        grp_item2 = t_item2["assigned_groups"][0]
        self.assertEqual(grp_item2["assigned_modules_count"], 1)
        self.assertEqual(len(grp_item2["assigned_curriculum"]), 1)
        curr_mod = grp_item2["assigned_curriculum"][0]
        self.assertEqual(curr_mod["type"], "Module")
        self.assertEqual(curr_mod["id"], self.ind_mod_1.id)
        self.assertEqual(curr_mod["level_id"], self.ind_level.id)
        self.assertIsNone(curr_mod["course_id"])

    def test_trainer_workload_deduplicates_overlapping_assignments_and_enforces_assessment_pass_threshold(self):
        """
        Overlapping Course, Level, and Module assignments (across group & candidate_type)
        do not double-count modules, and 5-question assessments require >= 3.0 to count as completed.
        """
        # Overlapping assignments for the same independent level & its module
        TrainingAssignment.objects.create(
            learner_group=self.group, level=self.ind_level, is_active=True, assigned_by=self.admin
        )
        TrainingAssignment.objects.create(
            candidate_type=self.cand_type, level=self.ind_level, is_active=True, assigned_by=self.admin
        )
        TrainingAssignment.objects.create(
            learner_group=self.group, module=self.ind_mod_1, is_active=True, assigned_by=self.admin
        )

        # Configure ind_mod_1 with 5 required MCQ questions (tested assessment, 3/5 threshold)
        q_list = []
        for i in range(1, 6):
            q_list.append(
                ModuleQuestion.objects.create(
                    module=self.ind_mod_1,
                    question_text=f"Assessment Q{i}?",
                    question_type="MULTIPLE_CHOICE",
                    options=[
                        {"id": "a", "text": "Correct", "is_correct": True},
                        {"id": "b", "text": "Wrong 1", "is_correct": False},
                        {"id": "c", "text": "Wrong 2", "is_correct": False},
                    ],
                    order=i,
                    is_required=True,
                    is_active=True,
                )
            )

        # Configure ind_mod_2 with 1 required comprehension question
        q_mod2 = ModuleQuestion.objects.create(
            module=self.ind_mod_2,
            question_text="Completed reading?",
            order=1,
            is_required=True,
            is_active=True,
        )

        # Learner 1 answers all 5 questions on ind_mod_1, but fails assessment (score = 2.0 < 3.0)
        att_fail = ModuleAssessmentAttempt.objects.create(
            module=self.ind_mod_1,
            learner=self.learner_1,
            attempt_number=1,
            score=2.0,
            total_possible=5.0,
            percentage=40.0,
            is_completed=True,
        )
        for q in q_list:
            ModuleQuestionResponse.objects.create(
                attempt=att_fail, question=q, learner=self.learner_1, response_value=False
            )
        # Learner 1 completes ind_mod_2 (1/1 required)
        ModuleQuestionResponse.objects.create(
            question=q_mod2, learner=self.learner_1, response_value=True
        )

        t_item = self._get_trainer_item()
        grp_item = t_item["assigned_groups"][0]
        # Deduplicated modules: ind_mod_1 and ind_mod_2 -> 2 modules total
        self.assertEqual(t_item["total_assigned_modules_count"], 2)
        self.assertEqual(grp_item["assigned_modules_count"], 2)
        # Learner 1 has 1/2 completed (50%), Learner 2 has 0/2 (0%) -> average = 25.0%, 0 completed learners
        self.assertEqual(grp_item["average_completion_percentage"], 25.0)
        self.assertEqual(grp_item["completed_learners_count"], 0)

        # Now Learner 1 passes ind_mod_1 on Attempt 2 with score = 4.0 >= 3.0
        att_pass = ModuleAssessmentAttempt.objects.create(
            module=self.ind_mod_1,
            learner=self.learner_1,
            attempt_number=2,
            score=4.0,
            total_possible=5.0,
            percentage=80.0,
            is_completed=True,
        )
        t_item_after = self._get_trainer_item()
        grp_item_after = t_item_after["assigned_groups"][0]
        # Learner 1 now has 2/2 completed (100%), Learner 2 has 0/2 (0%) -> average = 50.0%, 1 completed learner
        self.assertEqual(grp_item_after["average_completion_percentage"], 50.0)
        self.assertEqual(grp_item_after["completed_learners_count"], 1)

    def test_in_progress_learners_supports_course_linked_hybrid_and_independent_level_modules(self):
        """
        GET /api/admin/reports/in-progress-learners/ returns accurate Course and Level metadata
        for Course-linked, hybrid (level.course), and independent-Level (course=None) modules,
        while preserving optional-question and incomplete-module semantics.
        """
        # 1. Course-linked module (mod_l1_1): 2 required questions
        q_c1 = ModuleQuestion.objects.create(
            module=self.mod_l1_1, question_text="C1 Q1", order=1, is_required=True, is_active=True
        )
        ModuleQuestion.objects.create(
            module=self.mod_l1_1, question_text="C1 Q2", order=2, is_required=True, is_active=True
        )

        # 2. Hybrid module (mod_l1_hybrid, course=None, level.course=course_1): 2 required questions
        q_hyb1 = ModuleQuestion.objects.create(
            module=self.mod_l1_hybrid, question_text="Hyb Q1", order=1, is_required=True, is_active=True
        )
        ModuleQuestion.objects.create(
            module=self.mod_l1_hybrid, question_text="Hyb Q2", order=2, is_required=True, is_active=True
        )

        # 3. Independent course-less module (ind_mod_1, course=None, level.course=None):
        #    2 required questions + 1 optional question
        q_ind_req1 = ModuleQuestion.objects.create(
            module=self.ind_mod_1, question_text="Ind Req 1", order=1, is_required=True, is_active=True
        )
        q_ind_req2 = ModuleQuestion.objects.create(
            module=self.ind_mod_1, question_text="Ind Req 2", order=2, is_required=True, is_active=True
        )
        q_ind_opt = ModuleQuestion.objects.create(
            module=self.ind_mod_1, question_text="Ind Optional", order=3, is_required=False, is_active=True
        )

        # Learner 1 partially answers mod_l1_1 (1/2) and mod_l1_hybrid (1/2)
        ModuleQuestionResponse.objects.create(question=q_c1, learner=self.learner_1, response_value=True)
        ModuleQuestionResponse.objects.create(question=q_hyb1, learner=self.learner_1, response_value=True)

        # Learner 2 answers ONLY the optional question on course-less ind_mod_1 (0/2 required answered)
        ModuleQuestionResponse.objects.create(question=q_ind_opt, learner=self.learner_2, response_value=True)

        res = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["total_in_progress_learners"], 2)
        self.assertEqual(res.data["total_in_progress_module_enrollments"], 3)

        items_by_mod = {item["module_id"]: item for item in res.data["items"]}

        # Verify Course-linked module item
        c_item = items_by_mod[self.mod_l1_1.id]
        self.assertEqual(c_item["course_id"], self.course_1.id)
        self.assertEqual(c_item["course_name"], self.course_1.name)
        self.assertEqual(c_item["level_id"], self.level_1.id)
        self.assertEqual(c_item["level_name"], self.level_1.name)
        self.assertEqual(c_item["completion_percentage"], 50.0)

        # Verify Hybrid module item (resolves level.course)
        hyb_item = items_by_mod[self.mod_l1_hybrid.id]
        self.assertEqual(hyb_item["course_id"], self.course_1.id)
        self.assertEqual(hyb_item["course_name"], self.course_1.name)
        self.assertEqual(hyb_item["level_id"], self.level_1.id)
        self.assertEqual(hyb_item["level_name"], self.level_1.name)
        self.assertEqual(hyb_item["completion_percentage"], 50.0)

        # Verify Independent course-less module item (course_id=None, course_name=level.name, optional question behavior preserved)
        ind_item = items_by_mod[self.ind_mod_1.id]
        self.assertIsNone(ind_item["course_id"])
        self.assertEqual(ind_item["course_name"], self.ind_level.name)
        self.assertEqual(ind_item["level_id"], self.ind_level.id)
        self.assertEqual(ind_item["level_name"], self.ind_level.name)
        self.assertEqual(ind_item["total_required_questions"], 2)
        self.assertEqual(ind_item["answered_required_questions"], 0)
        self.assertEqual(ind_item["completion_percentage"], 0.0)

        # Learner 2 completes all required questions on ind_mod_1 -> no longer in-progress
        ModuleQuestionResponse.objects.create(question=q_ind_req1, learner=self.learner_2, response_value=True)
        ModuleQuestionResponse.objects.create(question=q_ind_req2, learner=self.learner_2, response_value=True)

        res_after = self.client.get("/api/admin/reports/in-progress-learners/")
        self.assertEqual(res_after.status_code, status.HTTP_200_OK)
        self.assertEqual(res_after.data["total_in_progress_learners"], 1)
        self.assertEqual(res_after.data["total_in_progress_module_enrollments"], 2)
        self.assertNotIn(self.ind_mod_1.id, {it["module_id"] for it in res_after.data["items"]})


class GeneralReportsIndependentLevelAPITest(APITestCase):
    """
    Checkpoint 2, Step 5B:
    Focused integration tests for General Reports API (ReportsViewSet):
    - GET /api/reports/overview/
    - GET /api/reports/learner-performance/
    - GET /api/reports/course-progress/
    verifying exact Level scoping, independent CourseLevel and course-less Module support,
    assignment deduplication, assessment 3/5 pass threshold, null-safe performance reporting,
    and role-based access (Admin, Trainer with group & candidate-type cohorts, Learner).
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="rep5b_admin",
            password="pw",
            role="ADMIN",
            first_name="Admin",
            last_name="Reports",
        )
        self.trainer = User.objects.create_user(
            username="rep5b_trainer",
            password="pw",
            role="TRAINER",
            first_name="Trainer",
            last_name="Scoped",
        )
        self.other_trainer = User.objects.create_user(
            username="rep5b_other_trainer",
            password="pw",
            role="TRAINER",
            first_name="Other",
            last_name="Trainer",
        )

        # Candidate types
        self.cand_type_1 = CandidateType.objects.create(
            name="Rep5B Regular", code="REP5B-REG", is_active=True
        )
        self.cand_type_2 = CandidateType.objects.create(
            name="Rep5B Lateral", code="REP5B-LAT", is_active=True
        )

        # Learners
        self.learner_1 = User.objects.create_user(
            username="rep5b_learner1",
            password="pw",
            role="LEARNER",
            first_name="Alice",
            last_name="LevelOne",
            email="alice@rep5b.test",
        )
        self.learner_2 = User.objects.create_user(
            username="rep5b_learner2",
            password="pw",
            role="LEARNER",
            first_name="Bob",
            last_name="IndepLevel",
            email="bob@rep5b.test",
        )
        self.learner_other = User.objects.create_user(
            username="rep5b_learner_other",
            password="pw",
            role="LEARNER",
            first_name="Charlie",
            last_name="OtherCohort",
            email="charlie@rep5b.test",
        )

        # Learner groups
        self.group_1 = LearnerGroup.objects.create(
            name="Rep5B Group 1",
            code="REP5B-GRP-1",
            candidate_type=self.cand_type_1,
            is_active=True,
        )
        GroupMembership.objects.create(
            group=self.group_1, learner=self.learner_1, is_active=True
        )

        self.group_2 = LearnerGroup.objects.create(
            name="Rep5B Group 2",
            code="REP5B-GRP-2",
            candidate_type=self.cand_type_2,
            is_active=True,
        )
        GroupMembership.objects.create(
            group=self.group_2, learner=self.learner_2, is_active=True
        )

        self.group_other = LearnerGroup.objects.create(
            name="Rep5B Other Group",
            code="REP5B-GRP-OTH",
            candidate_type=self.cand_type_1,
            is_active=True,
        )
        GroupMembership.objects.create(
            group=self.group_other, learner=self.learner_other, is_active=True
        )

        # Trainer assignments:
        # self.trainer covers group_1 (learner_1) AND group_2 (learner_2)
        TrainerGroupAssignment.objects.create(
            trainer=self.trainer,
            group=self.group_1,
            is_active=True,
        )
        TrainerGroupAssignment.objects.create(
            trainer=self.trainer,
            group=self.group_2,
            is_active=True,
        )
        # other_trainer covers group_other (learner_other)
        TrainerGroupAssignment.objects.create(
            trainer=self.other_trainer,
            group=self.group_other,
            is_active=True,
        )

        # 1. Course with 3 sibling levels (Level 1, Level 2, Level 3)
        self.course_1 = Course.objects.create(
            name="Rep5B Engineering Course",
            code="REP5B-CRS-1",
            status="PUBLISHED",
        )
        self.level_1 = CourseLevel.objects.create(
            course=self.course_1,
            name="Rep5B Level 1",
            order=1,
        )
        self.level_2 = CourseLevel.objects.create(
            course=self.course_1,
            name="Rep5B Level 2",
            order=2,
        )
        self.level_3 = CourseLevel.objects.create(
            course=self.course_1,
            name="Rep5B Level 3",
            order=3,
        )

        # Level 1 modules: one directly linked to course_1, one hybrid (course=None, level.course=course_1), one draft
        self.mod_l1_1 = Module.objects.create(
            course=self.course_1,
            level=self.level_1,
            name="L1 Direct Module",
            order=1,
            status="PUBLISHED",
        )
        self.mod_l1_hybrid = Module.objects.create(
            course=None,
            level=self.level_1,
            name="L1 Hybrid Module",
            order=2,
            status="PUBLISHED",
        )
        self.mod_l1_draft = Module.objects.create(
            course=self.course_1,
            level=self.level_1,
            name="L1 Draft Module",
            order=3,
            status="DRAFT",
        )

        # Sibling Level 2 & Level 3 published modules
        self.mod_l2_1 = Module.objects.create(
            course=self.course_1,
            level=self.level_2,
            name="L2 Sibling Module",
            order=4,
            status="PUBLISHED",
        )
        self.mod_l3_1 = Module.objects.create(
            course=self.course_1,
            level=self.level_3,
            name="L3 Sibling Module",
            order=5,
            status="PUBLISHED",
        )

        # 2. Independent CourseLevel (course=None) and course-less Modules
        self.ind_level = CourseLevel.objects.create(
            course=None,
            name="Rep5B Standalone Level",
            order=10,
        )
        self.ind_mod_1 = Module.objects.create(
            course=None,
            level=self.ind_level,
            name="Indep Module 1",
            order=1,
            status="PUBLISHED",
        )
        self.ind_mod_2 = Module.objects.create(
            course=None,
            level=self.ind_level,
            name="Indep Module 2",
            order=2,
            status="PUBLISHED",
        )
        self.ind_mod_draft = Module.objects.create(
            course=None,
            level=self.ind_level,
            name="Indep Draft Module",
            order=3,
            status="DRAFT",
        )

        # Default assignments:
        # group_1 (learner_1) assigned ONLY to Level 1 of course_1
        TrainingAssignment.objects.create(
            learner_group=self.group_1,
            level=self.level_1,
            is_active=True,
            assigned_by=self.admin,
        )
        # cand_type_2 (learner_2) assigned to independent level ind_level
        TrainingAssignment.objects.create(
            candidate_type=self.cand_type_2,
            level=self.ind_level,
            is_active=True,
            assigned_by=self.admin,
        )
        # group_other (learner_other) assigned to Level 2 of course_1
        TrainingAssignment.objects.create(
            learner_group=self.group_other,
            level=self.level_2,
            is_active=True,
            assigned_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)

    def test_1_exact_level_scope_excludes_sibling_levels_and_unpublished_modules_in_overview(self):
        """
        Scenario 1: Learner 1 is assigned only to Level 1 of Course 1.
        GET /api/reports/overview/ must include only Level 1's published modules
        (mod_l1_1 and mod_l1_hybrid) for Learner 1, and must NOT include sibling
        Level 2 (mod_l2_1), sibling Level 3 (mod_l3_1), or draft (mod_l1_draft) modules,
        even when requested by an Admin who can access all levels.
        """
        res = self.client.get("/api/reports/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        l1_entries = [
            lp for lp in res.data["learners_progress"]
            if lp["learner_id"] == self.learner_1.id
        ]
        self.assertEqual(len(l1_entries), 1)
        l1_entry = l1_entries[0]

        self.assertEqual(l1_entry["course_id"], self.course_1.id)
        self.assertEqual(l1_entry["course_name"], self.course_1.name)
        self.assertEqual(l1_entry["level_id"], self.level_1.id)
        self.assertEqual(l1_entry["level_name"], self.level_1.name)
        self.assertEqual(l1_entry["total_required_modules"], 2)

        mod_ids = {m["module_id"] for m in l1_entry["modules_progress"]}
        self.assertEqual(mod_ids, {self.mod_l1_1.id, self.mod_l1_hybrid.id})
        self.assertNotIn(self.mod_l2_1.id, mod_ids)
        self.assertNotIn(self.mod_l3_1.id, mod_ids)
        self.assertNotIn(self.mod_l1_draft.id, mod_ids)

    def test_2_independent_level_and_courseless_modules_supported_in_overview(self):
        """
        Scenario 2: Learner 2 is assigned to an independent CourseLevel (course=None).
        GET /api/reports/overview/ includes Learner 2's independent-level enrollment with
        course_id=None, course_name=ind_level.name, level_id=ind_level.id, level_name=ind_level.name,
        and accurately tracks module completion.
        """
        q1 = ModuleQuestion.objects.create(
            module=self.ind_mod_1, question_text="Ind Q1?", order=1, is_required=True, is_active=True
        )
        ModuleQuestion.objects.create(
            module=self.ind_mod_2, question_text="Ind Q2?", order=1, is_required=True, is_active=True
        )
        ModuleQuestionResponse.objects.create(
            question=q1, learner=self.learner_2, response_value=True
        )

        res = self.client.get("/api/reports/overview/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        l2_entries = [
            lp for lp in res.data["learners_progress"]
            if lp["learner_id"] == self.learner_2.id
        ]
        self.assertEqual(len(l2_entries), 1)
        l2_entry = l2_entries[0]

        self.assertIsNone(l2_entry["course_id"])
        self.assertEqual(l2_entry["course_name"], self.ind_level.name)
        self.assertEqual(l2_entry["level_id"], self.ind_level.id)
        self.assertEqual(l2_entry["level_name"], self.ind_level.name)
        self.assertEqual(l2_entry["total_required_modules"], 2)
        self.assertEqual(l2_entry["completed_modules"], 1)
        self.assertEqual(l2_entry["overall_progress_percentage"], 50.0)
        self.assertEqual(l2_entry["enrollment_status"], "IN_PROGRESS")

        mod_ids = {m["module_id"] for m in l2_entry["modules_progress"]}
        self.assertEqual(mod_ids, {self.ind_mod_1.id, self.ind_mod_2.id})
        self.assertNotIn(self.ind_mod_draft.id, mod_ids)

    def test_3_overlapping_course_level_and_module_assignments_deduplicate_without_inflating_totals(self):
        """
        Scenario 3: Overlapping assignments (Course + Level + direct Module, across group & candidate_type)
        do not duplicate modules or inflate total_required_modules / completion totals.
        """
        # Learner 2 already has cand_type_2 -> ind_level (2 published modules: ind_mod_1, ind_mod_2).
        # Add overlapping direct module assignment and group assignment for Learner 2:
        grp_dup = LearnerGroup.objects.create(
            name="Rep5B Dup Group",
            code="REP5B-GRP-DUP",
            candidate_type=self.cand_type_2,
            is_active=True,
        )
        GroupMembership.objects.create(
            group=grp_dup, learner=self.learner_2, is_active=True
        )
        TrainingAssignment.objects.create(
            learner_group=grp_dup, level=self.ind_level, is_active=True, assigned_by=self.admin
        )
        TrainingAssignment.objects.create(
            learner_group=grp_dup, module=self.ind_mod_1, is_active=True, assigned_by=self.admin
        )
        TrainingAssignment.objects.create(
            candidate_type=self.cand_type_2, module=self.ind_mod_2, is_active=True, assigned_by=self.admin
        )

        res_ov = self.client.get("/api/reports/overview/")
        self.assertEqual(res_ov.status_code, status.HTTP_200_OK)
        l2_entries = [
            lp for lp in res_ov.data["learners_progress"]
            if lp["learner_id"] == self.learner_2.id
        ]
        self.assertEqual(len(l2_entries), 1)
        self.assertEqual(l2_entries[0]["total_required_modules"], 2)
        self.assertEqual(len(l2_entries[0]["modules_progress"]), 2)

        res_cp = self.client.get("/api/reports/course-progress/")
        self.assertEqual(res_cp.status_code, status.HTTP_200_OK)
        ind_cp = [
            cp for cp in res_cp.data
            if cp["course_id"] is None and cp["level_id"] == self.ind_level.id
        ]
        self.assertEqual(len(ind_cp), 1)
        self.assertEqual(ind_cp[0]["assigned_learners_count"], 1)

    def test_4_assessment_completion_enforces_3_of_5_passing_threshold(self):
        """
        Scenario 4: For a 5-question assessment, a score of 2/5 remains incomplete (FAIL / IN PROGRESS)
        while a score of 3/5 passes (PASS / COMPLETED) across overview and course-progress.
        """
        q_list = []
        for i in range(1, 6):
            q_list.append(
                ModuleQuestion.objects.create(
                    module=self.ind_mod_1,
                    question_text=f"5B Assessment Q{i}?",
                    question_type="MULTIPLE_CHOICE",
                    options=[
                        {"id": "a", "text": "Correct", "is_correct": True},
                        {"id": "b", "text": "Wrong", "is_correct": False},
                    ],
                    order=i,
                    is_required=True,
                    is_active=True,
                )
            )
        q_mod2 = ModuleQuestion.objects.create(
            module=self.ind_mod_2,
            question_text="Reading done?",
            order=1,
            is_required=True,
            is_active=True,
        )
        ModuleQuestionResponse.objects.create(
            question=q_mod2, learner=self.learner_2, response_value=True
        )

        # Attempt 1 on ind_mod_1: score = 2.0 / 5.0 (FAIL)
        att_fail = ModuleAssessmentAttempt.objects.create(
            module=self.ind_mod_1,
            learner=self.learner_2,
            attempt_number=1,
            score=2.0,
            total_possible=5.0,
            percentage=40.0,
            is_completed=True,
        )
        for idx, q in enumerate(q_list):
            ModuleQuestionResponse.objects.create(
                attempt=att_fail,
                question=q,
                learner=self.learner_2,
                response_value=(idx < 2),
                response_payload={"marks_obtained": 1.0 if idx < 2 else 0.0, "total_marks": 1.0},
            )

        res_ov_fail = self.client.get("/api/reports/overview/")
        l2_fail = [
            lp for lp in res_ov_fail.data["learners_progress"]
            if lp["learner_id"] == self.learner_2.id
        ][0]
        # ind_mod_2 is completed, but ind_mod_1 failed (2/5 < 3/5) -> 1 of 2 completed (50%)
        self.assertEqual(l2_fail["completed_modules"], 1)
        self.assertEqual(l2_fail["overall_progress_percentage"], 50.0)
        self.assertEqual(l2_fail["enrollment_status"], "IN_PROGRESS")
        mod1_prog_fail = [
            m for m in l2_fail["modules_progress"] if m["module_id"] == self.ind_mod_1.id
        ][0]
        self.assertEqual(mod1_prog_fail["status"], "IN PROGRESS")
        self.assertEqual(mod1_prog_fail["result"], "FAIL")

        # Attempt 2 on ind_mod_1: score = 3.0 / 5.0 (PASS)
        att_pass = ModuleAssessmentAttempt.objects.create(
            module=self.ind_mod_1,
            learner=self.learner_2,
            attempt_number=2,
            score=3.0,
            total_possible=5.0,
            percentage=60.0,
            is_completed=True,
        )
        for idx, q in enumerate(q_list):
            ModuleQuestionResponse.objects.create(
                attempt=att_pass,
                question=q,
                learner=self.learner_2,
                response_value=(idx < 3),
                response_payload={"marks_obtained": 1.0 if idx < 3 else 0.0, "total_marks": 1.0},
            )

        res_ov_pass = self.client.get("/api/reports/overview/")
        l2_pass = [
            lp for lp in res_ov_pass.data["learners_progress"]
            if lp["learner_id"] == self.learner_2.id
        ][0]
        self.assertEqual(l2_pass["completed_modules"], 2)
        self.assertEqual(l2_pass["overall_progress_percentage"], 100.0)
        self.assertEqual(l2_pass["enrollment_status"], "COMPLETED")
        mod1_prog_pass = [
            m for m in l2_pass["modules_progress"] if m["module_id"] == self.ind_mod_1.id
        ][0]
        self.assertEqual(mod1_prog_pass["status"], "COMPLETED")
        self.assertEqual(mod1_prog_pass["result"], "PASS")

    def test_5_learner_performance_handles_courseless_and_hybrid_modules_and_excludes_sibling_level_responses(self):
        """
        Scenario 5: GET /api/reports/learner-performance/ safely serializes course-less
        (course_id=None, course_name=None) and hybrid (course_id=course_1.id) module responses,
        includes level_id and level_name, excludes responses from unassigned sibling levels,
        and returns accurate Course + independent-Level breakdown on ?inspect_learner=.
        """
        q_l1_hyb = ModuleQuestion.objects.create(
            module=self.mod_l1_hybrid, question_text="Hyb Q?", order=1, is_required=True, is_active=True
        )
        q_l2_sib = ModuleQuestion.objects.create(
            module=self.mod_l2_1, question_text="Sibling L2 Q?", order=1, is_required=True, is_active=True
        )
        q_ind = ModuleQuestion.objects.create(
            module=self.ind_mod_1, question_text="Indep Q?", order=1, is_required=True, is_active=True
        )

        # Learner 1 answers assigned hybrid module (Level 1) AND has an historical/stale response on unassigned Level 2
        ModuleQuestionResponse.objects.create(
            question=q_l1_hyb,
            learner=self.learner_1,
            response_value=True,
            response_payload={"marks_obtained": 1.0, "total_marks": 1.0},
        )
        ModuleQuestionResponse.objects.create(
            question=q_l2_sib,
            learner=self.learner_1,
            response_value=True,
            response_payload={"marks_obtained": 1.0, "total_marks": 1.0},
        )

        # Learner 2 answers assigned course-less module (ind_mod_1)
        ModuleQuestionResponse.objects.create(
            question=q_ind,
            learner=self.learner_2,
            response_value=True,
            response_payload={"marks_obtained": 1.0, "total_marks": 1.0},
        )

        res = self.client.get("/api/reports/learner-performance/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data["results"]

        # Learner 1's sibling Level 2 response must be excluded even for Admin
        l1_mod_ids = {r["module_id"] for r in results if r["learner_id"] == self.learner_1.id}
        self.assertEqual(l1_mod_ids, {self.mod_l1_hybrid.id})
        self.assertNotIn(self.mod_l2_1.id, l1_mod_ids)

        hyb_row = [r for r in results if r["module_id"] == self.mod_l1_hybrid.id][0]
        self.assertEqual(hyb_row["course_id"], self.course_1.id)
        self.assertEqual(hyb_row["course_name"], self.course_1.name)
        self.assertEqual(hyb_row["level_id"], self.level_1.id)
        self.assertEqual(hyb_row["level_name"], self.level_1.name)

        ind_row = [r for r in results if r["module_id"] == self.ind_mod_1.id][0]
        self.assertIsNone(ind_row["course_id"])
        self.assertIsNone(ind_row["course_name"])
        self.assertEqual(ind_row["level_id"], self.ind_level.id)
        self.assertEqual(ind_row["level_name"], self.ind_level.name)

        # Filtering by ?level=<ind_level.id> returns only independent level responses
        res_lvl = self.client.get(f"/api/reports/learner-performance/?level={self.ind_level.id}")
        self.assertEqual(res_lvl.status_code, status.HTTP_200_OK)
        self.assertEqual([r["module_id"] for r in res_lvl.data["results"]], [self.ind_mod_1.id])

        # Inspecting Learner 2 returns their independent-level progress entry
        res_insp = self.client.get(f"/api/reports/learner-performance/?inspect_learner={self.learner_2.id}")
        self.assertEqual(res_insp.status_code, status.HTTP_200_OK)
        insp_courses = res_insp.data["inspected_learner"]["courses"]
        self.assertEqual(len(insp_courses), 1)
        self.assertIsNone(insp_courses[0]["course_id"])
        self.assertEqual(insp_courses[0]["course_name"], self.ind_level.name)
        self.assertEqual(insp_courses[0]["level_id"], self.ind_level.id)
        self.assertEqual(insp_courses[0]["level_name"], self.ind_level.name)
        self.assertEqual(insp_courses[0]["total_modules"], 2)
        self.assertEqual(insp_courses[0]["completed_modules"], 1)

    def test_6_course_progress_scopes_level_assignments_includes_hybrid_modules_and_reports_independent_levels(self):
        """
        Scenario 6: GET /api/reports/course-progress/ evaluates each learner against their
        own assigned modules within a Course (so Learner 1 completing Level 1's 2 modules
        is 100% complete on their assigned Level 1 curriculum rather than diluted by Level 2/3),
        includes hybrid modules via level.course, and includes independent-Level report entries.
        """
        q_l1_1 = ModuleQuestion.objects.create(
            module=self.mod_l1_1, question_text="L1 M1 Q", order=1, is_required=True, is_active=True
        )
        q_l1_hyb = ModuleQuestion.objects.create(
            module=self.mod_l1_hybrid, question_text="L1 Hyb Q", order=1, is_required=True, is_active=True
        )
        q_ind_1 = ModuleQuestion.objects.create(
            module=self.ind_mod_1, question_text="Ind M1 Q", order=1, is_required=True, is_active=True
        )
        ModuleQuestion.objects.create(
            module=self.ind_mod_2, question_text="Ind M2 Q", order=1, is_required=True, is_active=True
        )

        # Learner 1 completes both Level 1 modules (mod_l1_1 + mod_l1_hybrid)
        ModuleQuestionResponse.objects.create(
            question=q_l1_1, learner=self.learner_1, response_value=True
        )
        ModuleQuestionResponse.objects.create(
            question=q_l1_hyb, learner=self.learner_1, response_value=True
        )
        # Learner 2 completes 1 of 2 modules in ind_level
        ModuleQuestionResponse.objects.create(
            question=q_ind_1, learner=self.learner_2, response_value=True
        )

        res = self.client.get("/api/reports/course-progress/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Course 1 entry: Learner 1 (completed 2/2 in L1 -> 100%) and Learner Other (0/1 in L2 -> 0%)
        c1_entries = [cp for cp in res.data if cp["course_id"] == self.course_1.id]
        self.assertEqual(len(c1_entries), 1)
        c1_cp = c1_entries[0]
        self.assertEqual(c1_cp["assigned_learners_count"], 2)
        self.assertEqual(c1_cp["completed_learners_count"], 1)
        self.assertEqual(c1_cp["in_progress_learners_count"], 0)
        self.assertEqual(c1_cp["not_started_learners_count"], 1)
        self.assertEqual(c1_cp["average_completion_percentage"], 50.0)

        # Independent Level entry: course_id=None, level_id=ind_level.id
        ind_entries = [
            cp for cp in res.data
            if cp["course_id"] is None and cp["level_id"] == self.ind_level.id
        ]
        self.assertEqual(len(ind_entries), 1)
        ind_cp = ind_entries[0]
        self.assertEqual(ind_cp["course_name"], self.ind_level.name)
        self.assertEqual(ind_cp["level_name"], self.ind_level.name)
        self.assertEqual(ind_cp["assigned_learners_count"], 1)
        self.assertEqual(ind_cp["completed_learners_count"], 0)
        self.assertEqual(ind_cp["in_progress_learners_count"], 1)
        self.assertEqual(ind_cp["average_completion_percentage"], 50.0)

    def test_7_role_based_access_scoping_for_admin_trainer_and_learner(self):
        """
        Scenario 7:
        - Trainer sees only learners in their active assigned cohorts (group_1 -> learner_1,
          and cand_type_2 -> learner_2), and never sees learner_other or unassigned sibling Level 2.
        - Learner sees only their own personal assigned curriculum and responses across
          overview, learner-performance, and course-progress, and cannot inspect other learners.
        """
        q_l1 = ModuleQuestion.objects.create(
            module=self.mod_l1_1, question_text="L1 Q", order=1, is_required=True, is_active=True
        )
        q_ind = ModuleQuestion.objects.create(
            module=self.ind_mod_1, question_text="Ind Q", order=1, is_required=True, is_active=True
        )
        q_l2 = ModuleQuestion.objects.create(
            module=self.mod_l2_1, question_text="L2 Q", order=1, is_required=True, is_active=True
        )
        ModuleQuestionResponse.objects.create(question=q_l1, learner=self.learner_1, response_value=True)
        ModuleQuestionResponse.objects.create(question=q_ind, learner=self.learner_2, response_value=True)
        ModuleQuestionResponse.objects.create(question=q_l2, learner=self.learner_other, response_value=True)

        # 1. Trainer perspective (assigned to group_1 and group_2/cand_type_2)
        self.client.force_authenticate(user=self.trainer)

        tr_ov = self.client.get("/api/reports/overview/")
        self.assertEqual(tr_ov.status_code, status.HTTP_200_OK)
        tr_learner_ids = {lp["learner_id"] for lp in tr_ov.data["learners_progress"]}
        self.assertEqual(tr_learner_ids, {self.learner_1.id, self.learner_2.id})
        self.assertNotIn(self.learner_other.id, tr_learner_ids)
        # Accessible courses for this trainer = 1 (Course 1); 2 enrollments (Learner 1 in L1, Learner 2 in ind_level)
        self.assertEqual(tr_ov.data["total_courses"], 1)
        self.assertEqual(tr_ov.data["total_assigned_enrollments"], 2)

        tr_perf = self.client.get("/api/reports/learner-performance/")
        self.assertEqual(tr_perf.status_code, status.HTTP_200_OK)
        tr_perf_learners = {r["learner_id"] for r in tr_perf.data["results"]}
        self.assertEqual(tr_perf_learners, {self.learner_1.id, self.learner_2.id})
        self.assertNotIn(self.learner_other.id, tr_perf_learners)

        tr_cp = self.client.get("/api/reports/course-progress/")
        self.assertEqual(tr_cp.status_code, status.HTTP_200_OK)
        tr_c1 = [cp for cp in tr_cp.data if cp["course_id"] == self.course_1.id][0]
        # Trainer only sees Learner 1 (1 enrolled) in Course 1
        self.assertEqual(tr_c1["assigned_learners_count"], 1)
        self.assertEqual(tr_c1["level_id"], self.level_1.id)

        # 2. Learner 2 perspective (assigned only to independent level ind_level)
        self.client.force_authenticate(user=self.learner_2)

        lr_ov = self.client.get("/api/reports/overview/")
        self.assertEqual(lr_ov.status_code, status.HTTP_200_OK)
        self.assertEqual(lr_ov.data["total_learners"], 1)
        self.assertEqual(lr_ov.data["total_courses"], 0)
        self.assertEqual(lr_ov.data["total_assigned_enrollments"], 1)
        self.assertEqual(len(lr_ov.data["learners_progress"]), 1)
        self.assertEqual(lr_ov.data["learners_progress"][0]["learner_id"], self.learner_2.id)
        self.assertIsNone(lr_ov.data["learners_progress"][0]["course_id"])
        self.assertEqual(lr_ov.data["learners_progress"][0]["level_id"], self.ind_level.id)

        lr_perf = self.client.get("/api/reports/learner-performance/")
        self.assertEqual(lr_perf.status_code, status.HTTP_200_OK)
        self.assertEqual({r["learner_id"] for r in lr_perf.data["results"]}, {self.learner_2.id})

        # Learner cannot inspect another learner
        lr_insp_other = self.client.get(
            f"/api/reports/learner-performance/?inspect_learner={self.learner_1.id}"
        )
        self.assertEqual(lr_insp_other.status_code, status.HTTP_200_OK)
        self.assertIsNone(lr_insp_other.data["inspected_learner"])

        lr_cp = self.client.get("/api/reports/course-progress/")
        self.assertEqual(lr_cp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(lr_cp.data), 1)
        self.assertIsNone(lr_cp.data[0]["course_id"])
        self.assertEqual(lr_cp.data[0]["level_id"], self.ind_level.id)


class Checkpoint2ABackendValidationAndCompatibilityTest(APITestCase):
    """
    Checkpoint 2A regression tests:
    1. Creating an independent Level (course=None) with a duplicate name is rejected.
    2. Creating an independent Level (course=None) with a duplicate order is rejected.
    3. Updating an independent Level without changing its name or order succeeds.
    4. Course-scoped Level uniqueness validation continues working.
    5. ModuleProgressDetailSerializer serializes a Module with course=None without raising an exception and returns the correct Level information.
    6. ModuleViewSet.deletion_impact returns the Level name rather than "Unknown" for a course-less Module.
    7. Existing deletion-impact permissions and dependency counts remain unchanged.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="cp2a_admin", email="cp2a_admin@test.com", password="pw", role=User.Role.ADMIN
        )
        self.trainer = User.objects.create_user(
            username="cp2a_trainer", email="cp2a_trainer@test.com", password="pw", role=User.Role.TRAINER
        )
        self.learner = User.objects.create_user(
            username="cp2a_learner", email="cp2a_learner@test.com", password="pw", role=User.Role.LEARNER
        )

        # Existing independent Level (course=None)
        self.ind_level_1 = CourseLevel.objects.create(
            course=None, name="CP2A Independent Level 1", order=1, description="Initial description"
        )
        self.ind_level_2 = CourseLevel.objects.create(
            course=None, name="CP2A Independent Level 2", order=2
        )

        # Course-linked Level
        self.course = Course.objects.create(
            name="CP2A Course", code="CP2A-CRS", order=1, status=PUB, created_by=self.admin
        )
        self.course_level_1 = CourseLevel.objects.create(
            course=self.course, name="CP2A Course Level 1", order=1
        )

        # Course-less Module under ind_level_1
        self.courseless_mod = Module.objects.create(
            course=None,
            level=self.ind_level_1,
            name="CP2A Courseless Module",
            order=1,
            status=PUB,
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)

    def test_1_independent_level_duplicate_name_rejected(self):
        """Creating or updating an independent Level (course=None) with a duplicate name is rejected."""
        res = self.client.post(
            "/api/course-levels/",
            {"course": None, "name": "CP2A Independent Level 1", "order": 99},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res.data)

        # Omitted course also defaults to None and rejects duplicate name
        res_omitted = self.client.post(
            "/api/course-levels/",
            {"name": "CP2A Independent Level 1", "order": 99},
            format="json",
        )
        self.assertEqual(res_omitted.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res_omitted.data)

        # Updating another independent level to a duplicate name is also rejected
        res_patch = self.client.patch(
            f"/api/course-levels/{self.ind_level_2.id}/",
            {"name": "CP2A Independent Level 1"},
            format="json",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res_patch.data)

    def test_2_independent_level_duplicate_order_rejected(self):
        """Creating or updating an independent Level (course=None) with a duplicate order is rejected."""
        res = self.client.post(
            "/api/course-levels/",
            {"course": None, "name": "CP2A Unique Independent Level", "order": 1},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order", res.data)

        # Updating another independent level to a duplicate order is also rejected
        res_patch = self.client.patch(
            f"/api/course-levels/{self.ind_level_2.id}/",
            {"order": 1},
            format="json",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order", res_patch.data)

    def test_3_updating_independent_level_without_changing_name_or_order_succeeds(self):
        """Updating an independent Level without changing its name or order excludes self.instance.pk and succeeds."""
        res_patch = self.client.patch(
            f"/api/course-levels/{self.ind_level_1.id}/",
            {
                "name": "CP2A Independent Level 1",
                "order": 1,
                "description": "Updated description without changing name or order",
            },
            format="json",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(res_patch.data["name"], "CP2A Independent Level 1")
        self.assertEqual(res_patch.data["order"], 1)
        self.assertEqual(res_patch.data["description"], "Updated description without changing name or order")

        res_put = self.client.put(
            f"/api/course-levels/{self.ind_level_1.id}/",
            {
                "course": None,
                "name": "CP2A Independent Level 1",
                "order": 1,
                "description": "PUT update also succeeds",
            },
            format="json",
        )
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)

    def test_4_course_scoped_level_uniqueness_validation_continues_working(self):
        """Course-scoped duplicate name and order checks remain enforced within each Course and isolated from independent Levels."""
        # A Course CAN use the same name/order as an independent Level if not yet in that Course
        res_ok = self.client.post(
            "/api/course-levels/",
            {"course": self.course.id, "name": "CP2A Independent Level 2", "order": 2},
            format="json",
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)

        # Duplicate name within the same Course is rejected
        res_dup_name = self.client.post(
            "/api/course-levels/",
            {"course": self.course.id, "name": "CP2A Course Level 1", "order": 5},
            format="json",
        )
        self.assertEqual(res_dup_name.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", res_dup_name.data)

        # Duplicate order within the same Course is rejected
        res_dup_order = self.client.post(
            "/api/course-levels/",
            {"course": self.course.id, "name": "CP2A Course Level 5", "order": 1},
            format="json",
        )
        self.assertEqual(res_dup_order.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order", res_dup_order.data)

    def test_5_module_progress_detail_serializer_handles_courseless_module(self):
        """ModuleProgressDetailSerializer serializes a Module with course=None without raising an exception and returns Level metadata."""
        from core.serializers import ModuleProgressDetailSerializer
        from core.api_views import _calculate_learner_progress_metrics

        # 1. Direct dict representation from _calculate_learner_progress_metrics
        _, _, _, _, details = _calculate_learner_progress_metrics(
            self.learner, Module.objects.filter(pk=self.courseless_mod.pk)
        )
        s_dict = ModuleProgressDetailSerializer(details, many=True)
        data_dict = s_dict.data
        self.assertEqual(len(data_dict), 1)
        self.assertEqual(data_dict[0]["module_id"], self.courseless_mod.id)
        self.assertEqual(data_dict[0]["module_name"], self.courseless_mod.name)
        self.assertIsNone(data_dict[0]["course_id"])
        self.assertIsNone(data_dict[0]["course_name"])
        self.assertEqual(data_dict[0]["level_id"], self.ind_level_1.id)
        self.assertEqual(data_dict[0]["level_name"], self.ind_level_1.name)

        # 2. Direct Module model instance with annotated progress attributes and course=None
        self.courseless_mod.total_required_questions = 2
        self.courseless_mod.answered_required_questions = 1
        self.courseless_mod.is_completed = False
        s_obj = ModuleProgressDetailSerializer(self.courseless_mod)
        data_obj = s_obj.data
        self.assertEqual(data_obj["module_id"], self.courseless_mod.id)
        self.assertEqual(data_obj["module_name"], self.courseless_mod.name)
        self.assertIsNone(data_obj["course_id"])
        self.assertIsNone(data_obj["course_name"])
        self.assertEqual(data_obj["level_id"], self.ind_level_1.id)
        self.assertEqual(data_obj["level_name"], self.ind_level_1.name)
        self.assertEqual(data_obj["total_required_questions"], 2)
        self.assertEqual(data_obj["answered_required_questions"], 1)
        self.assertFalse(data_obj["is_completed"])

    def test_6_deletion_impact_returns_level_name_for_courseless_module(self):
        """ModuleViewSet.deletion_impact returns the Level name rather than 'Unknown' for a course-less Module."""
        res = self.client.get(f"/api/modules/{self.courseless_mod.id}/deletion-impact/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["module_id"], self.courseless_mod.id)
        self.assertIsNone(res.data["course_id"])
        self.assertEqual(res.data["course_name"], self.ind_level_1.name)
        self.assertNotEqual(res.data["course_name"], "Unknown")
        self.assertEqual(res.data["level_id"], self.ind_level_1.id)
        self.assertEqual(res.data["level_name"], self.ind_level_1.name)

        # Also verify a Course-linked Module still returns instance.course.name and includes level info
        course_mod = Module.objects.create(
            course=self.course,
            level=self.course_level_1,
            name="CP2A Course Linked Mod",
            order=1,
            status=PUB,
            created_by=self.admin,
        )
        res_cm = self.client.get(f"/api/modules/{course_mod.id}/deletion-impact/")
        self.assertEqual(res_cm.status_code, status.HTTP_200_OK)
        self.assertEqual(res_cm.data["course_id"], self.course.id)
        self.assertEqual(res_cm.data["course_name"], self.course.name)
        self.assertEqual(res_cm.data["level_id"], self.course_level_1.id)
        self.assertEqual(res_cm.data["level_name"], self.course_level_1.name)

    def test_7_deletion_impact_permissions_and_dependency_counts_unchanged(self):
        """Existing deletion-impact permissions (Admin-only) and dependency counts remain unchanged."""
        from core.models import LearnerSubmoduleProgress, ModuleFeedback

        sub = Submodule.objects.create(module=self.courseless_mod, name="CP2A Sub 1", order=1, status=PUB)
        TrainingAssignment.objects.create(module=self.courseless_mod, learner=self.learner, assigned_by=self.admin)
        q = ModuleQuestion.objects.create(
            module=self.courseless_mod, question_text="CP2A Q1?", order=1, is_required=True, is_active=True
        )
        att = ModuleAssessmentAttempt.objects.create(
            module=self.courseless_mod, learner=self.learner, attempt_number=1, score=1.0, total_possible=1.0, is_completed=True
        )
        ModuleQuestionResponse.objects.create(
            attempt=att, question=q, learner=self.learner, response_value=True
        )
        ModuleFeedback.objects.create(
            module=self.courseless_mod,
            learner=self.learner,
            trainer=self.trainer,
            module_rating=5,
            trainer_rating=5,
            understanding_level=ModuleFeedback.UnderstandingLevel.ADVANCED,
            comments="Great module!",
        )
        LearnerSubmoduleProgress.objects.create(
            learner=self.learner, submodule=sub, target_attempt_number=2, is_completed=True
        )

        # Admin gets accurate dependency counts
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get(f"/api/modules/{self.courseless_mod.id}/deletion-impact/")
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admin.data["submodules_count"], 1)
        self.assertEqual(res_admin.data["assignments_count"], 1)
        self.assertEqual(res_admin.data["questions_count"], 1)
        self.assertEqual(res_admin.data["attempts_count"], 1)
        self.assertEqual(res_admin.data["responses_count"], 1)
        self.assertEqual(res_admin.data["feedback_count"], 1)
        self.assertEqual(res_admin.data["progress_count"], 1)

        # Trainer and Learner are forbidden (403)
        self.client.force_authenticate(user=self.trainer)
        res_trainer = self.client.get(f"/api/modules/{self.courseless_mod.id}/deletion-impact/")
        self.assertEqual(res_trainer.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.learner)
        res_learner = self.client.get(f"/api/modules/{self.courseless_mod.id}/deletion-impact/")
        self.assertEqual(res_learner.status_code, status.HTTP_403_FORBIDDEN)








