import json
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import (
    Course,
    CourseLevel,
    Module,
    ModuleQuestion,
    PublicationStatus,
    QuestionType,
)

User = get_user_model()


class TrainerAssessmentReadOnlyTests(APITestCase):
    """
    Test suite for Trainer Portal Read-Only Assessment Question and Answer Viewer.
    Verifies:
    1. Trainer can view assessments for Admin-published modules.
    2. Trainer can view all questions.
    3. Trainer can view all options.
    4. Trainer can view correct answers (is_correct is visible to trainer, not stripped).
    5. Trainer cannot access assessments for unpublished/draft modules.
    6. Trainer cannot create assessments / questions (403 Forbidden).
    7. Trainer cannot modify questions (403 Forbidden).
    8. Trainer cannot modify correct answers / options (403 Forbidden).
    9. Trainer cannot delete assessments or questions (403 Forbidden).
    10. Admin assessment management remains functional.
    11. Existing trainer published-module visibility remains unchanged.
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_test",
            email="admin@example.com",
            password="Password123!",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="trainer_test",
            email="trainer@example.com",
            password="Password123!",
            role=User.Role.TRAINER,
        )
        self.learner = User.objects.create_user(
            username="learner_test",
            email="learner@example.com",
            password="Password123!",
            role=User.Role.LEARNER,
        )

        # 1. Published Course & Published Module
        self.published_course = Course.objects.create(
            name="Published Python Course",
            code="PY-PUB",
            status=PublicationStatus.PUBLISHED,
        )
        self.published_level = CourseLevel.objects.create(
            course=self.published_course,
            name="Level 1",
            order=1,
        )
        self.published_module = Module.objects.create(
            course=self.published_course,
            level=self.published_level,
            name="Published Python Basics",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )

        # Questions on published module
        self.mcq_q = ModuleQuestion.objects.create(
            module=self.published_module,
            question_text="What is the output of print(2 ** 3)?",
            question_type=QuestionType.MULTIPLE_CHOICE,
            order=1,
            options=[
                {"id": "opt_1", "text": "6", "is_correct": False, "explanation": "2*3 is 6, but ** is power"},
                {"id": "opt_2", "text": "8", "is_correct": True, "explanation": "2 raised to power 3 is 8"},
                {"id": "opt_3", "text": "9", "is_correct": False},
            ],
            is_required=True,
            is_active=True,
        )

        self.yesno_q = ModuleQuestion.objects.create(
            module=self.published_module,
            question_text="Is Python dynamically typed?",
            question_type=QuestionType.YES_NO,
            order=2,
            options=[
                {"id": "opt_yes", "text": "Yes", "is_correct": True, "explanation": "Types are checked at runtime"},
                {"id": "opt_no", "text": "No", "is_correct": False},
            ],
            is_required=True,
            is_active=True,
        )

        # 2. Draft / Unpublished Module (or under draft course)
        self.draft_course = Course.objects.create(
            name="Draft Advanced Python Course",
            code="PY-DFT",
            status=PublicationStatus.DRAFT,
        )
        self.draft_level = CourseLevel.objects.create(
            course=self.draft_course,
            name="Level 1",
            order=1,
        )
        self.draft_module = Module.objects.create(
            course=self.draft_course,
            level=self.draft_level,
            name="Draft Concurrency Module",
            order=1,
            status=PublicationStatus.DRAFT,
        )
        self.draft_q = ModuleQuestion.objects.create(
            module=self.draft_module,
            question_text="What is the GIL?",
            question_type=QuestionType.MULTIPLE_CHOICE,
            order=1,
            options=[
                {"id": "opt_d1", "text": "Global Interpreter Lock", "is_correct": True},
                {"id": "opt_d2", "text": "General Interface Logic", "is_correct": False},
                {"id": "opt_d3", "text": "Graph Iteration Link", "is_correct": False},
            ],
            is_required=True,
            is_active=True,
        )

    def test_trainer_can_view_assessments_and_questions_for_published_module(self):
        """Trainer can view questions and options for Admin-published modules."""
        self.client.force_authenticate(user=self.trainer)
        res = self.client.get(f"/api/module-questions/?module={self.published_module.pk}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        self.assertEqual(len(data), 2)
        question_ids = [q["id"] for q in data]
        self.assertIn(self.mcq_q.pk, question_ids)
        self.assertIn(self.yesno_q.pk, question_ids)

    def test_trainer_can_view_all_options_and_correct_answers(self):
        """Trainer can view options with is_correct flag and explanation, unlike learner where is_correct is stripped."""
        self.client.force_authenticate(user=self.trainer)
        res = self.client.get(f"/api/module-questions/{self.mcq_q.pk}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        options = res.data.get("options", [])
        self.assertEqual(len(options), 3)
        # Check that is_correct is intact
        correct_opts = [opt for opt in options if opt.get("is_correct") is True]
        self.assertEqual(len(correct_opts), 1)
        self.assertEqual(correct_opts[0]["id"], "opt_2")
        self.assertEqual(correct_opts[0]["text"], "8")
        self.assertEqual(correct_opts[0].get("explanation"), "2 raised to power 3 is 8")

        # In contrast, test learner gets sanitized options (no is_correct)
        self.client.force_authenticate(user=self.learner)
        # Even if learner could query it, is_correct must not be present
        res_learner = self.client.get(f"/api/module-questions/{self.mcq_q.pk}/")
        if res_learner.status_code == status.HTTP_200_OK:
            for opt in res_learner.data.get("options", []):
                self.assertNotIn("is_correct", opt)

    def test_trainer_cannot_access_assessments_for_unpublished_modules(self):
        """Trainer cannot access questions belonging to draft/unpublished modules."""
        self.client.force_authenticate(user=self.trainer)

        # Direct detail lookup fails with 404
        res = self.client.get(f"/api/module-questions/{self.draft_q.pk}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Filtering by draft module returns empty
        res_list = self.client.get(f"/api/module-questions/?module={self.draft_module.pk}")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        data = res_list.data if isinstance(res_list.data, list) else res_list.data.get("results", [])
        self.assertEqual(len(data), 0)

    def test_trainer_cannot_create_questions(self):
        """Trainer POST mutation is rejected with 403 Forbidden."""
        self.client.force_authenticate(user=self.trainer)
        payload = {
            "module": self.published_module.pk,
            "question_text": "Trainer unauthorized question",
            "question_type": "YES_NO",
            "order": 5,
            "options": [
                {"id": "opt_1", "text": "Yes", "is_correct": True},
                {"id": "opt_2", "text": "No", "is_correct": False},
            ],
        }
        res = self.client.post("/api/module-questions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_trainer_cannot_modify_questions_or_options_or_correct_answers(self):
        """Trainer PUT/PATCH mutation is rejected with 403 Forbidden."""
        self.client.force_authenticate(user=self.trainer)

        # Attempt PATCH question_text
        res_patch = self.client.patch(
            f"/api/module-questions/{self.mcq_q.pk}/",
            {"question_text": "Hacked question text"},
            format="json",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt changing correct answer options
        res_options = self.client.patch(
            f"/api/module-questions/{self.mcq_q.pk}/",
            {
                "options": [
                    {"id": "opt_1", "text": "6", "is_correct": True},
                    {"id": "opt_2", "text": "8", "is_correct": False},
                    {"id": "opt_3", "text": "9", "is_correct": False},
                ]
            },
            format="json",
        )
        self.assertEqual(res_options.status_code, status.HTTP_403_FORBIDDEN)

    def test_trainer_cannot_delete_questions(self):
        """Trainer DELETE request is rejected with 403 Forbidden."""
        self.client.force_authenticate(user=self.trainer)
        res = self.client.delete(f"/api/module-questions/{self.mcq_q.pk}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        # Ensure question still exists
        self.assertTrue(ModuleQuestion.objects.filter(pk=self.mcq_q.pk).exists())

    def test_admin_assessment_management_remains_functional(self):
        """Admin can still CRUD assessment questions without hindrance."""
        self.client.force_authenticate(user=self.admin)

        # Create
        res_create = self.client.post(
            "/api/module-questions/",
            {
                "module": self.published_module.pk,
                "question_text": "Admin created question?",
                "question_type": "YES_NO",
                "order": 10,
                "options": [
                    {"id": "opt_1", "text": "Yes", "is_correct": True},
                    {"id": "opt_2", "text": "No", "is_correct": False},
                ],
            },
            format="json",
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        new_q_id = res_create.data["id"]

        # Update
        res_update = self.client.patch(
            f"/api/module-questions/{new_q_id}/",
            {"question_text": "Admin updated question text?"},
            format="json",
        )
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        self.assertEqual(res_update.data["question_text"], "Admin updated question text?")

        # Delete
        res_delete = self.client.delete(f"/api/module-questions/{new_q_id}/")
        self.assertEqual(res_delete.status_code, status.HTTP_204_NO_CONTENT)
