import os
import django
from django.test import TestCase, RequestFactory
from django.utils import timezone
from accounts.models import User
from core.models import (
    Course,
    CourseLevel,
    Module,
    PublicationStatus,
    LearnerGroup,
    CandidateType,
    GroupMembership,
    TrainerGroupAssignment,
    TrainingAssignment,
    ModuleAssessmentAttempt,
    ModuleQuestion,
    ModuleQuestionResponse,
)
from core.api_views import ReportsViewSet

class ReportsLogicAndScalabilityTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()
        self.viewset = ReportsViewSet()

        # Users
        self.admin = User.objects.create_user(
            username="admin_rep_test",
            role=User.Role.ADMIN,
            email="admin_rep@example.com",
            password="password123",
        )
        self.trainer1 = User.objects.create_user(
            username="trainer1_rep_test",
            role=User.Role.TRAINER,
            email="trainer1_rep@example.com",
            password="password123",
        )
        self.trainer2 = User.objects.create_user(
            username="trainer2_rep_test",
            role=User.Role.TRAINER,
            email="trainer2_rep@example.com",
            password="password123",
        )

        self.learner1 = User.objects.create_user(
            username="learner1_rep_test",
            role=User.Role.LEARNER,
            email="learner1_rep@example.com",
            password="password123",
        )
        self.learner2 = User.objects.create_user(
            username="learner2_rep_test",
            role=User.Role.LEARNER,
            email="learner2_rep@example.com",
            password="password123",
        )
        self.learner3 = User.objects.create_user(
            username="learner3_rep_test",
            role=User.Role.LEARNER,
            email="learner3_rep@example.com",
            password="password123",
        )

        # Curriculum: 2 Courses, 2 Levels, 4 Modules
        self.course1 = Course.objects.create(name="Course 1", code="CRS-REP-1", status=PublicationStatus.PUBLISHED)
        self.level1 = CourseLevel.objects.create(course=self.course1, name="Level 1", order=1)
        self.mod1 = Module.objects.create(
            course=self.course1,
            level=self.level1,
            name="Mod 1.1",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )
        self.mod2 = Module.objects.create(
            course=self.course1,
            level=self.level1,
            name="Mod 1.2",
            order=2,
            status=PublicationStatus.PUBLISHED,
        )

        self.course2 = Course.objects.create(name="Course 2", code="CRS-REP-2", status=PublicationStatus.PUBLISHED)
        self.level2 = CourseLevel.objects.create(course=self.course2, name="Level 2", order=1)
        self.mod3 = Module.objects.create(
            course=self.course2,
            level=self.level2,
            name="Mod 2.1",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )

        # Candidate Type & Groups & Trainer Assignments
        self.ctype = CandidateType.objects.create(name="Trainee", code="TRAINEE")
        self.group1 = LearnerGroup.objects.create(name="Group A", code="GRP-A", candidate_type=self.ctype, is_active=True)
        GroupMembership.objects.create(group=self.group1, learner=self.learner1, is_active=True)
        GroupMembership.objects.create(group=self.group1, learner=self.learner2, is_active=True)
        TrainerGroupAssignment.objects.create(group=self.group1, trainer=self.trainer1, is_active=True)

        self.group2 = LearnerGroup.objects.create(name="Group B", code="GRP-B", candidate_type=self.ctype, is_active=True)
        GroupMembership.objects.create(group=self.group2, learner=self.learner3, is_active=True)
        TrainerGroupAssignment.objects.create(group=self.group2, trainer=self.trainer2, is_active=True)

        # Assign course 1 to group 1 & group 2
        TrainingAssignment.objects.create(learner_group=self.group1, course=self.course1, is_active=True)
        TrainingAssignment.objects.create(learner_group=self.group2, course=self.course2, is_active=True)

        # Multi-course assignment: Learner 1 also assigned course 2 directly
        TrainingAssignment.objects.create(learner=self.learner1, course=self.course2, is_active=True)

    # -------------------------------------------------------------------------
    # 1. Learner KPI Semantics & Deduplication Tests
    # -------------------------------------------------------------------------
    def test_learner_kpi_semantics_and_no_double_counting(self):
        req = self.rf.get("/api/reports/summary-kpis/")
        req.user = self.admin
        res = ReportsViewSet.as_view({"get": "summary_kpis"})(req)
        self.assertEqual(res.status_code, 200)

        # There are exactly 3 unique learners in scope
        self.assertEqual(res.data["total_learners"], 3)
        # Learner 1 has 2 enrollments (course 1, course 2), Learner 2 has 1, Learner 3 has 1 -> Total 4 enrollments
        self.assertEqual(res.data["total_enrollments"], 4)

        # Reconciles: completed + active + not_started == total_learners
        self.assertEqual(
            res.data["completed_learners"] + res.data["active_learners"] + res.data["not_started_learners"],
            res.data["total_learners"],
        )

    # -------------------------------------------------------------------------
    # 2. Attention & Assessment Latest-Attempt Logic Tests
    # -------------------------------------------------------------------------
    def test_failed_first_attempt_followed_by_passed_latest_attempt(self):
        # Learner 1 fails attempt 1 on Mod 1.1
        ModuleAssessmentAttempt.objects.create(
            learner=self.learner1,
            module=self.mod1,
            attempt_number=1,
            score=1.0,
            total_possible=5.0,
            percentage=20.0,
            is_completed=True,
            completed_at=timezone.now(),
        )

        # Check KPIs: learner 1 currently needs attention because latest attempt failed
        req = self.rf.get("/api/reports/summary-kpis/")
        req.user = self.admin
        res = ReportsViewSet.as_view({"get": "summary_kpis"})(req)
        self.assertEqual(res.data["needing_attention_learners"], 1)

        # Check Table: Assessment status is FAIL
        req_tbl = self.rf.get(f"/api/reports/learner-enrollments-table/?search={self.learner1.username}")
        req_tbl.user = self.admin
        res_tbl = ReportsViewSet.as_view({"get": "learner_enrollments_table"})(req_tbl)
        c1_row = next(r for r in res_tbl.data["results"] if r["course_id"] == self.course1.id)
        self.assertEqual(c1_row["assessment_status"], "FAIL")

        # Now Learner 1 retakes and passes attempt 2 on Mod 1.1 with 4.0/5.0
        ModuleAssessmentAttempt.objects.create(
            learner=self.learner1,
            module=self.mod1,
            attempt_number=2,
            score=4.0,
            total_possible=5.0,
            percentage=80.0,
            is_completed=True,
            completed_at=timezone.now(),
        )

        # Check KPIs again: latest attempt passed! Must NOT trigger attention for assessment failure
        res2 = ReportsViewSet.as_view({"get": "summary_kpis"})(req)
        self.assertEqual(res2.data["assessment_stats"]["passed"], 1)
        self.assertEqual(res2.data["assessment_stats"]["failed"], 0)
        self.assertEqual(res2.data["pass_rate_pct"], 100.0)

        # Check Table: Assessment status is now PASS
        res_tbl2 = ReportsViewSet.as_view({"get": "learner_enrollments_table"})(req_tbl)
        c1_row2 = next(r for r in res_tbl2.data["results"] if r["course_id"] == self.course1.id)
        self.assertEqual(c1_row2["assessment_status"], "PASS")

    def test_not_started_enrollment_does_not_trigger_low_progress_attention(self):
        # Learner 2 has not started course 1 (progress 0%)
        # Should NOT be counted as needing attention merely because progress is 0%
        req = self.rf.get("/api/reports/summary-kpis/")
        req.user = self.admin
        res = ReportsViewSet.as_view({"get": "summary_kpis"})(req)
        # Learner 2 and Learner 3 are not started; none have failed attempts -> needing_attention is 0
        self.assertEqual(res.data["needing_attention_learners"], 0)

    # -------------------------------------------------------------------------
    # 3. Average Assessment Score & Pass Rate Calculations
    # -------------------------------------------------------------------------
    def test_average_assessment_score_uses_unique_latest_attempts_only(self):
        # Learner 1 attempts Mod 1.1 twice: 2/5 (40%) then 4/5 (80%)
        ModuleAssessmentAttempt.objects.create(
            learner=self.learner1,
            module=self.mod1,
            attempt_number=1,
            score=2.0,
            total_possible=5.0,
            percentage=40.0,
            is_completed=True,
        )
        ModuleAssessmentAttempt.objects.create(
            learner=self.learner1,
            module=self.mod1,
            attempt_number=2,
            score=4.0,
            total_possible=5.0,
            percentage=80.0,
            is_completed=True,
        )
        # Learner 2 attempts Mod 1.1 once: 3/5 (60%)
        ModuleAssessmentAttempt.objects.create(
            learner=self.learner2,
            module=self.mod1,
            attempt_number=1,
            score=3.0,
            total_possible=5.0,
            percentage=60.0,
            is_completed=True,
        )

        req = self.rf.get("/api/reports/summary-kpis/")
        req.user = self.admin
        res = ReportsViewSet.as_view({"get": "summary_kpis"})(req)

        # Unique assessed (learner, module): exactly 2 records
        # Learner 1: 80% (latest attempt #2)
        # Learner 2: 60% (latest attempt #1)
        # Avg score = (80 + 60) / 2 = 70.0%
        self.assertEqual(res.data["assessment_stats"]["unique_assessed_modules"], 2)
        self.assertEqual(res.data["average_assessment_score_pct"], 70.0)
        self.assertEqual(res.data["pass_rate_pct"], 100.0)

    # -------------------------------------------------------------------------
    # 4. Pagination & Multi-Filter Tests
    # -------------------------------------------------------------------------
    def test_pagination_and_page_size_options(self):
        for psize in [1, 2, 10, 25, 50, 100]:
            req = self.rf.get(f"/api/reports/learner-enrollments-table/?page=1&page_size={psize}")
            req.user = self.admin
            res = ReportsViewSet.as_view({"get": "learner_enrollments_table"})(req)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.data["total_count"], 4)
            self.assertEqual(len(res.data["results"]), min(4, psize))

    # -------------------------------------------------------------------------
    # 5. Trainer Access Control & Isolation Tests
    # -------------------------------------------------------------------------
    def test_trainer_access_control_and_unauthorized_isolation(self):
        # Trainer 1 is assigned Group A (learners 1 & 2)
        req_tr1 = self.rf.get("/api/reports/learner-enrollments-table/")
        req_tr1.user = self.trainer1
        res_tr1 = ReportsViewSet.as_view({"get": "learner_enrollments_table"})(req_tr1)
        tr1_learners = {r["learner_id"] for r in res_tr1.data["results"]}
        self.assertIn(self.learner1.id, tr1_learners)
        self.assertIn(self.learner2.id, tr1_learners)
        self.assertNotIn(self.learner3.id, tr1_learners)

        # Trainer 1 attempts to request details of Learner 3 (Group B)
        req_unauth = self.rf.get(f"/api/reports/learner-detail/?learner_id={self.learner3.id}")
        req_unauth.user = self.trainer1
        res_unauth = ReportsViewSet.as_view({"get": "learner_detail"})(req_unauth)
        self.assertEqual(res_unauth.status_code, 404)
