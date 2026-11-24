import math
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from core.assessment_utils import get_minimum_passing_score, is_assessment_passed
from core.models import (
    CandidateType,
    Course,
    CourseLevel,
    Module,
    ModuleAssessmentAttempt,
    ModuleQuestion,
    ModuleQuestionResponse,
    PublicationStatus,
    QuestionType,
    TrainingAssignment,
)

User = get_user_model()


class AssessmentScoringRuleTests(APITestCase):
    """
    Test suite for LMS Assessment Dynamic 50% Passing Rule.
    Passing Rule: minimum_correct_answers = math.ceil(total_questions * 0.5)

    Verifies:
    1. Unit calculation across requested question sizes (2, 3, 4, 5, 6, 10, 20).
    2. Edge cases (0 questions, negative, missing score).
    3. Backend endpoints integration:
       - 2 questions -> 1 correct PASS, 0 correct FAIL
       - 3 questions -> 2 correct PASS, 1 correct FAIL
       - 4 questions -> 2 correct PASS, 1 correct FAIL
       - 5 questions -> 3 correct PASS, 2 correct FAIL
       - 6 questions -> 3 correct PASS, 2 correct FAIL
       - 10 questions -> 5 correct PASS, 4 correct FAIL
       - 20 questions -> 10 correct PASS, 9 correct FAIL
    4. Simple confirmation/completion-gate modules preserve completion behavior.
    5. Retake locking and eligibility.
    6. Reporting endpoints consistency.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_user",
            email="admin@example.com",
            password="Password123!",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="trainer_user",
            email="trainer@example.com",
            password="Password123!",
            role=User.Role.TRAINER,
        )
        self.learner = User.objects.create_user(
            username="learner_user",
            email="learner@example.com",
            password="Password123!",
            role=User.Role.LEARNER,
        )

        self.course = Course.objects.create(
            name="Test Scoring Course",
            code="TSC-001",
            status=PublicationStatus.PUBLISHED,
        )
        self.level = CourseLevel.objects.create(
            course=self.course,
            name="Level 1",
            order=1,
        )

        self.cand_type = CandidateType.objects.create(name="Trainee", code="TRAINEE")

        # Assign learner to course
        TrainingAssignment.objects.create(
            course=self.course,
            learner=self.learner,
            assigned_by=self.admin,
            is_active=True,
        )

    # -------------------------------------------------------------------------
    # 1. Pure Unit Tests for get_minimum_passing_score & is_assessment_passed
    # -------------------------------------------------------------------------
    def test_unit_passing_score_calculation(self):
        cases = [
            (1, 1),
            (2, 1),
            (3, 2),
            (4, 2),
            (5, 3),
            (6, 3),
            (7, 4),
            (8, 4),
            (9, 5),
            (10, 5),
            (20, 10),
            (0, 0),
            (-5, 0),
        ]
        for total_q, expected in cases:
            with self.subTest(total_q=total_q):
                self.assertEqual(get_minimum_passing_score(total_q), expected)

    def test_unit_is_assessment_passed(self):
        # 4 questions: threshold = 2
        self.assertTrue(is_assessment_passed(2, 4))
        self.assertTrue(is_assessment_passed(3, 4))
        self.assertFalse(is_assessment_passed(1, 4))
        self.assertFalse(is_assessment_passed(0, 4))
        self.assertFalse(is_assessment_passed(None, 4))

        # 5 questions: threshold = 3
        self.assertTrue(is_assessment_passed(3, 5))
        self.assertFalse(is_assessment_passed(2, 5))

        # 0 questions -> False
        self.assertFalse(is_assessment_passed(1, 0))

    # -------------------------------------------------------------------------
    # 2. Integration Tests with Modules of Varying Sizes
    # -------------------------------------------------------------------------
    def _create_module_with_mcq_questions(self, count, name):
        module = Module.objects.create(
            course=self.course,
            level=self.level,
            name=name,
            order=100 + count,
            status=PublicationStatus.PUBLISHED,
        )
        questions = []
        for i in range(1, count + 1):
            q = ModuleQuestion.objects.create(
                module=module,
                question_text=f"Question {i} of {count}?",
                question_type=QuestionType.MULTIPLE_CHOICE,
                order=i,
                options=[
                    {"id": "opt_1", "text": "Correct Option", "is_correct": True},
                    {"id": "opt_2", "text": "Wrong Option A", "is_correct": False},
                    {"id": "opt_3", "text": "Wrong Option B", "is_correct": False},
                ],
                is_required=True,
                is_active=True,
            )
            questions.append(q)
        return module, questions

    def test_pass_fail_for_2_questions(self):
        """2 questions -> min 1 correct. Score 1 is PASS, Score 0 is FAIL."""
        mod, _ = self._create_module_with_mcq_questions(2, "Module 2Q")
        self.client.force_authenticate(user=self.learner)

        # Attempt with 0 correct -> FAIL
        att_fail = ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=0.0, total_possible=2.0, is_completed=True
        )
        res_fail = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res_fail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_fail.data["result"], "FAIL")
        self.assertFalse(res_fail.data["has_passed"])

        # Attempt with 1 correct -> PASS
        att_pass = ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=1.0, total_possible=2.0, is_completed=True
        )
        res_pass = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res_pass.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pass.data["result"], "PASS")
        self.assertTrue(res_pass.data["has_passed"])
        self.assertEqual(res_pass.data["minimum_passing_score"], 1)

    def test_pass_fail_for_3_questions(self):
        """3 questions -> min 2 correct. Score 2 is PASS, Score 1 is FAIL."""
        mod, _ = self._create_module_with_mcq_questions(3, "Module 3Q")
        self.client.force_authenticate(user=self.learner)

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=1.0, total_possible=3.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "FAIL")

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=2.0, total_possible=3.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "PASS")
        self.assertEqual(res.data["minimum_passing_score"], 2)

    def test_pass_fail_for_4_questions(self):
        """4 questions -> min 2 correct. Score 2 is PASS, Score 1 is FAIL."""
        mod, _ = self._create_module_with_mcq_questions(4, "Module 4Q")
        self.client.force_authenticate(user=self.learner)

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=1.0, total_possible=4.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "FAIL")

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=2.0, total_possible=4.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "PASS")
        self.assertEqual(res.data["minimum_passing_score"], 2)

    def test_pass_fail_for_5_questions(self):
        """5 questions -> min 3 correct. Score 3 is PASS, Score 2 is FAIL."""
        mod, _ = self._create_module_with_mcq_questions(5, "Module 5Q")
        self.client.force_authenticate(user=self.learner)

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=2.0, total_possible=5.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "FAIL")

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=3.0, total_possible=5.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "PASS")
        self.assertEqual(res.data["minimum_passing_score"], 3)

    def test_pass_fail_for_6_questions(self):
        """6 questions -> min 3 correct. Score 3 is PASS, Score 2 is FAIL."""
        mod, _ = self._create_module_with_mcq_questions(6, "Module 6Q")
        self.client.force_authenticate(user=self.learner)

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=2.0, total_possible=6.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "FAIL")

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=3.0, total_possible=6.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "PASS")
        self.assertEqual(res.data["minimum_passing_score"], 3)

    def test_pass_fail_for_10_questions(self):
        """10 questions -> min 5 correct. Score 5 is PASS, Score 4 is FAIL."""
        mod, _ = self._create_module_with_mcq_questions(10, "Module 10Q")
        self.client.force_authenticate(user=self.learner)

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=4.0, total_possible=10.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "FAIL")

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=5.0, total_possible=10.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "PASS")
        self.assertEqual(res.data["minimum_passing_score"], 5)

    def test_pass_fail_for_20_questions(self):
        """20 questions -> min 10 correct. Score 10 is PASS, Score 9 is FAIL."""
        mod, _ = self._create_module_with_mcq_questions(20, "Module 20Q")
        self.client.force_authenticate(user=self.learner)

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=9.0, total_possible=20.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "FAIL")

        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=10.0, total_possible=20.0, is_completed=True
        )
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertEqual(res.data["result"], "PASS")
        self.assertEqual(res.data["minimum_passing_score"], 10)

    # -------------------------------------------------------------------------
    # 3. Simple Confirmation / Completion Gate Modules
    # -------------------------------------------------------------------------
    def test_confirmation_gate_module_preserves_completion_behavior(self):
        """Modules with simple confirmation gates (<5 questions, no MCQ, Yes/No) complete when answered."""
        mod = Module.objects.create(
            course=self.course,
            level=self.level,
            name="Confirmation Gate Module",
            order=200,
            status=PublicationStatus.PUBLISHED,
        )
        q = ModuleQuestion.objects.create(
            module=mod,
            question_text="Confirm reading completion?",
            question_type=QuestionType.YES_NO,
            order=1,
            is_required=True,
            is_active=True,
        )

        self.client.force_authenticate(user=self.learner)
        # Not answered yet
        res1 = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertFalse(res1.data["is_module_completed"])
        self.assertEqual(res1.data["result"], "NOT_STARTED")

        # Answer question
        ModuleQuestionResponse.objects.create(
            question=q,
            learner=self.learner,
            response_value=True,
        )

        res2 = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}")
        self.assertTrue(res2.data["is_module_completed"])
        self.assertEqual(res2.data["result"], "PASS")

    # -------------------------------------------------------------------------
    # 4. Retake Locking & Reporting APIs
    # -------------------------------------------------------------------------
    def test_retakes_locked_after_passing(self):
        """Learners who have passed (score >= ceil(total * 0.5)) cannot start new retakes."""
        mod, _ = self._create_module_with_mcq_questions(4, "Module 4Q Retake")
        self.client.force_authenticate(user=self.learner)

        # Attempt 1 passes (score 2.0 / 4.0)
        ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=2.0, total_possible=4.0, is_completed=True
        )

        # Checking retake eligibility
        res_elig = self.client.get(f"/api/question-responses/retake-eligibility/?module={mod.pk}")
        self.assertFalse(res_elig.data["can_retake"])
        self.assertTrue(any("already passed" in r.lower() for r in res_elig.data["blocking_reasons"]))

        # Attempting start-retake fails with 400
        res_start = self.client.post("/api/question-responses/start-retake/", {"module": mod.pk}, format="json")
        self.assertEqual(res_start.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already passed", res_start.data["error"].lower())

    # -------------------------------------------------------------------------
    # 5. Cross-Path Consistency Tests (Learner, Trainer, Reports)
    # -------------------------------------------------------------------------
    def test_consistent_assessment_classification_across_endpoints(self):
        """
        Verifies that:
        - 3Q, 4Q, and 5Q modules with MCQ are all classified consistently as tested assessment modules.
        - Confirmation modules (<5 questions, YES_NO) complete when answered.
        - Modules with previous assessment attempts are treated as tested modules across:
          1. Learner module completion status API
          2. _calculate_learner_progress_metrics (Learner overview)
          3. _get_modules_completion_status_for_learner (Course completion status & reports)
        """
        # Module A: 3 questions, MCQ -> Needs 2 correct
        mod_3q, _ = self._create_module_with_mcq_questions(3, "Mod 3Q")
        # Module B: 4 questions, MCQ -> Needs 2 correct
        mod_4q, _ = self._create_module_with_mcq_questions(4, "Mod 4Q")
        # Module C: 5 questions, MCQ -> Needs 3 correct
        mod_5q, _ = self._create_module_with_mcq_questions(5, "Mod 5Q")
        # Module D: Simple confirmation (1 YES_NO question)
        mod_conf = Module.objects.create(
            course=self.course,
            level=self.level,
            name="Mod Conf",
            order=199,
            status=PublicationStatus.PUBLISHED,
        )
        q_conf = ModuleQuestion.objects.create(
            module=mod_conf,
            question_text="Confirm reading?",
            question_type=QuestionType.YES_NO,
            order=1,
            is_required=True,
            is_active=True,
        )

        from core.api_views import _calculate_learner_progress_metrics, ReportsViewSet

        # 1. Learner attempts mod_3q with 1 correct (FAIL: needs 2)
        ModuleAssessmentAttempt.objects.create(
            module=mod_3q, learner=self.learner, attempt_number=1, score=1.0, total_possible=3.0, is_completed=True
        )
        # Learner attempts mod_4q with 2 correct (PASS: needs 2)
        ModuleAssessmentAttempt.objects.create(
            module=mod_4q, learner=self.learner, attempt_number=1, score=2.0, total_possible=4.0, is_completed=True
        )
        # Learner attempts mod_5q with 3 correct (PASS: needs 3)
        ModuleAssessmentAttempt.objects.create(
            module=mod_5q, learner=self.learner, attempt_number=1, score=3.0, total_possible=5.0, is_completed=True
        )
        # Learner answers confirmation question
        ModuleQuestionResponse.objects.create(
            question=q_conf, learner=self.learner, response_value=True
        )

        all_mods = [mod_3q, mod_4q, mod_5q, mod_conf]

        # Check Endpoint 1: Learner completion status API
        self.client.force_authenticate(user=self.learner)
        res_3q = self.client.get(f"/api/question-responses/module-completion-status/?module={mod_3q.pk}").data
        res_4q = self.client.get(f"/api/question-responses/module-completion-status/?module={mod_4q.pk}").data
        res_5q = self.client.get(f"/api/question-responses/module-completion-status/?module={mod_5q.pk}").data
        res_conf = self.client.get(f"/api/question-responses/module-completion-status/?module={mod_conf.pk}").data

        self.assertFalse(res_3q["is_module_completed"])
        self.assertEqual(res_3q["result"], "FAIL")
        self.assertTrue(res_4q["is_module_completed"])
        self.assertEqual(res_4q["result"], "PASS")
        self.assertTrue(res_5q["is_module_completed"])
        self.assertEqual(res_5q["result"], "PASS")
        self.assertTrue(res_conf["is_module_completed"])
        self.assertEqual(res_conf["result"], "PASS")

        # Check Endpoint 2: _calculate_learner_progress_metrics
        tot_assigned, completed_count, pending_count, percentage, details = _calculate_learner_progress_metrics(
            self.learner, all_mods
        )
        self.assertEqual(tot_assigned, 4)
        self.assertEqual(completed_count, 3) # mod_4q, mod_5q, mod_conf
        self.assertEqual(pending_count, 1)    # mod_3q failed
        self.assertEqual(percentage, 75.0)

        det_map = {d["id"]: d["is_completed"] for d in details}
        self.assertFalse(det_map[mod_3q.id])
        self.assertTrue(det_map[mod_4q.id])
        self.assertTrue(det_map[mod_5q.id])
        self.assertTrue(det_map[mod_conf.id])

        # Check Endpoint 3: _get_modules_completion_status_for_learner (Reports helper)
        reports_view = ReportsViewSet()
        c_status, pct, tot_m, comp_m = reports_view._get_modules_completion_status_for_learner(self.learner, all_mods)
        self.assertEqual(tot_m, 4)
        self.assertEqual(comp_m, 3)
        self.assertEqual(pct, 75.0)
        self.assertEqual(c_status, "IN_PROGRESS")

    def test_best_attempt_and_question_total_handling_consistency(self):
        """
        Verify that a learner's best attempt score is evaluated against the total_possible
        of that best attempt, not an unrelated subsequent attempt.
        """
        mod, _ = self._create_module_with_mcq_questions(4, "Mod Dynamic Questions")
        # Attempt 1: 4 questions, scored 2.0 -> PASSED (2 >= ceil(4 * 0.5) = 2)
        att1 = ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=1, score=2.0, total_possible=4.0, is_completed=True
        )
        # Attempt 2: later recorded with 10 questions, score 1.0 -> FAILED (1 < ceil(10 * 0.5) = 5)
        att2 = ModuleAssessmentAttempt.objects.create(
            module=mod, learner=self.learner, attempt_number=2, score=1.0, total_possible=10.0, is_completed=True
        )

        from core.api_views import _calculate_learner_progress_metrics, ReportsViewSet

        # Learner status API
        self.client.force_authenticate(user=self.learner)
        res = self.client.get(f"/api/question-responses/module-completion-status/?module={mod.pk}").data
        self.assertTrue(res["has_passed"])
        self.assertTrue(res["is_module_completed"])

        # Progress calculation
        _, comp_cnt, _, _, _ = _calculate_learner_progress_metrics(self.learner, [mod])
        self.assertEqual(comp_cnt, 1)

        # Reports helper
        reports_view = ReportsViewSet()
        _, _, _, comp_m = reports_view._get_modules_completion_status_for_learner(self.learner, [mod])
        self.assertEqual(comp_m, 1)
