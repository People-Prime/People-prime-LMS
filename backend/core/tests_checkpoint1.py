from django.test import TestCase
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from core.models import (
    Course,
    CourseLevel,
    Module,
    Submodule,
    TrainingAssignment,
    TrainingCluster,
    TrainingFile,
    TrainingFileMapping,
    ModuleQuestion,
    ModuleAssessmentAttempt,
    ModuleQuestionResponse,
    LearnerSubmoduleProgress,
    ModuleFeedback,
    LearnerGroup,
    CandidateType,
)

User = get_user_model()


class IndependentLevelArchitectureTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_user",
            email="admin@test.com",
            password="pass",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="trainer_user",
            email="trainer@test.com",
            password="pass",
            role=User.Role.TRAINER,
        )
        self.learner = User.objects.create_user(
            username="learner_user",
            email="learner@test.com",
            password="pass",
            role=User.Role.LEARNER,
        )
        self.candidate_type = CandidateType.objects.create(name="Trainee", code="TRAINEE")
        self.learner_group = LearnerGroup.objects.create(
            name="Batch A",
            code="BATCH-A",
            candidate_type=self.candidate_type,
        )
        self.course = Course.objects.create(
            name="Legacy Course",
            code="LEG-01",
            created_by=self.admin,
        )

    def test_independent_level_creation_without_course(self):
        """CourseLevel can be created without a parent Course (course is nullable)."""
        level = CourseLevel.objects.create(
            name="Independent Level 1",
            order=1,
            description="Standalone level",
        )
        self.assertIsNone(level.course)
        self.assertEqual(str(level), "Independent Level 1")

    def test_module_requires_level_and_protects_deletion(self):
        """Module must belong to a CourseLevel, and deleting the level is protected."""
        level = CourseLevel.objects.create(name="Protected Level", order=1)
        module = Module.objects.create(
            level=level,
            name="Module Under Level",
            order=1,
            created_by=self.admin,
        )
        self.assertIsNone(module.course)
        self.assertEqual(module.level, level)

        # Deleting level must raise ProtectedError
        from django.db.models.deletion import ProtectedError
        with self.assertRaises(ProtectedError):
            level.delete()

    def test_training_assignment_level_target_single_target_invariant(self):
        """TrainingAssignment must target exactly one of Course, Level, or Module."""
        level = CourseLevel.objects.create(name="Assigned Level", order=1)

        # Valid Level-only assignment
        assign = TrainingAssignment.objects.create(
            level=level,
            learner=self.learner,
            assigned_by=self.admin,
        )
        self.assertEqual(assign.level, level)
        self.assertIsNone(assign.course)
        self.assertIsNone(assign.module)

        # Invalid: targeting both Level and Course
        invalid_assign = TrainingAssignment(
            course=self.course,
            level=level,
            learner=self.learner,
            assigned_by=self.admin,
        )
        with self.assertRaises(ValidationError):
            invalid_assign.clean()

        # Invalid: targeting no curriculum target
        invalid_assign_no_target = TrainingAssignment(
            learner=self.learner,
            assigned_by=self.admin,
        )
        with self.assertRaises(ValidationError):
            invalid_assign_no_target.clean()

    def test_training_assignment_level_unique_constraints(self):
        """TrainingAssignment enforces uniqueness per recipient type for Level targets."""
        from django.db import transaction

        level = CourseLevel.objects.create(name="Unique Level", order=1)

        # 1. Level + Learner uniqueness
        TrainingAssignment.objects.create(
            level=level,
            learner=self.learner,
            assigned_by=self.admin,
        )
        with self.assertRaises(Exception):
            with transaction.atomic():
                TrainingAssignment.objects.create(
                    level=level,
                    learner=self.learner,
                    assigned_by=self.admin,
                )

        # 2. Level + LearnerGroup uniqueness
        TrainingAssignment.objects.create(
            level=level,
            learner_group=self.learner_group,
            assigned_by=self.admin,
        )
        with self.assertRaises(Exception):
            with transaction.atomic():
                TrainingAssignment.objects.create(
                    level=level,
                    learner_group=self.learner_group,
                    assigned_by=self.admin,
                )

        # 3. Level + CandidateType uniqueness
        TrainingAssignment.objects.create(
            level=level,
            candidate_type=self.candidate_type,
            assigned_by=self.admin,
        )
        with self.assertRaises(Exception):
            with transaction.atomic():
                TrainingAssignment.objects.create(
                    level=level,
                    candidate_type=self.candidate_type,
                    assigned_by=self.admin,
                )


class LegacyCourseDecouplingIntegrityTest(TestCase):
    """
    Checkpoint 1 verification tests for decoupling CourseLevel, Module, TrainingCluster,
    and TrainingAssignment from legacy Course records (SET_NULL + course=None compatibility).
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="cp1_decouple_admin",
            email="cp1_decouple_admin@test.com",
            password="pass",
            role=User.Role.ADMIN,
        )
        self.trainer = User.objects.create_user(
            username="cp1_decouple_trainer",
            email="cp1_decouple_trainer@test.com",
            password="pass",
            role=User.Role.TRAINER,
        )
        self.learner = User.objects.create_user(
            username="cp1_decouple_learner",
            email="cp1_decouple_learner@test.com",
            password="pass",
            role=User.Role.LEARNER,
        )
        self.candidate_type = CandidateType.objects.create(name="Recruiter", code="REC-CP1")
        self.learner_group = LearnerGroup.objects.create(
            name="Recruiter Cohort 1",
            code="RC-01",
            candidate_type=self.candidate_type,
        )

        # Create legacy Course modeling Course ID 6 (IT-REC-01)
        self.legacy_course = Course.objects.create(
            name="IT Recruitment Fundamentals & Industry Practices",
            code="IT-REC-01",
            status="PUBLISHED",
            created_by=self.admin,
        )
        self.other_course = Course.objects.create(
            name="Secondary Course",
            code="SEC-02",
            status="PUBLISHED",
            created_by=self.admin,
        )

        # Levels initially linked to legacy_course
        self.level_1 = CourseLevel.objects.create(course=self.legacy_course, name="Level 1", order=1)
        self.level_2 = CourseLevel.objects.create(course=self.legacy_course, name="Level 2", order=2)
        self.level_3 = CourseLevel.objects.create(course=self.legacy_course, name="Level 3", order=3)

        # Modules linked to Level 1 & Level 2 and initially to legacy_course
        self.mod_1 = Module.objects.create(
            course=self.legacy_course,
            level=self.level_1,
            name="Module 1: Foundations",
            order=1,
            status="PUBLISHED",
            created_by=self.admin,
        )
        self.mod_2 = Module.objects.create(
            course=self.legacy_course,
            level=self.level_2,
            name="Module 2: Advanced",
            order=2,
            status="PUBLISHED",
            created_by=self.admin,
        )

        # Submodule, Question, Attempt, Response, Progress, Feedback
        self.submodule = Submodule.objects.create(
            module=self.mod_1,
            name="Lesson 1.1",
            order=1,
            status="PUBLISHED",
        )
        self.question = ModuleQuestion.objects.create(
            module=self.mod_1,
            question_text="What is the recruitment lifecycle?",
            order=1,
            is_required=True,
            is_active=True,
        )
        self.attempt = ModuleAssessmentAttempt.objects.create(
            learner=self.learner,
            module=self.mod_1,
            attempt_number=1,
            score=10.0,
            total_possible=10.0,
            percentage=100.0,
            is_completed=True,
        )
        self.response = ModuleQuestionResponse.objects.create(
            question=self.question,
            learner=self.learner,
            attempt=self.attempt,
            response_value=True,
            response_payload={"marks_obtained": 10.0, "total_marks": 10.0},
        )
        self.sub_progress = LearnerSubmoduleProgress.objects.create(
            learner=self.learner,
            submodule=self.submodule,
            target_attempt_number=2,
            is_completed=True,
        )
        self.feedback = ModuleFeedback.objects.create(
            module=self.mod_1,
            learner=self.learner,
            trainer=self.trainer,
            module_rating=5,
            trainer_rating=5,
            understanding_level="ADVANCED",
            comments="Excellent training module.",
        )

        # TrainingCluster and TrainingFileMapping
        self.cluster_1 = TrainingCluster.objects.create(
            course=self.legacy_course,
            name="Cluster 1: Organizational Identity & Staffing Fundamentals",
            code="CLUSTER-1",
            order=1,
        )
        self.training_file = TrainingFile.objects.create(
            file=SimpleUploadedFile("lesson_1.pdf", b"%PDF-1.4 content", content_type="application/pdf"),
            filename="lesson_1.pdf",
            relative_path="lesson_1.pdf",
            file_type="PDF",
            file_size=16,
            checksum="a" * 64,
            uploaded_by=self.admin,
        )
        self.file_mapping = TrainingFileMapping.objects.create(
            training_file=self.training_file,
            cluster=self.cluster_1,
            module=self.mod_1,
            submodule=self.submodule,
            category="PRIMARY_INSTRUCTIONAL",
        )

        # Level-targeted TrainingAssignment
        self.level_assignment = TrainingAssignment.objects.create(
            course=None,
            level=self.level_1,
            module=None,
            learner_group=self.learner_group,
            assigned_by=self.admin,
        )

    def test_decoupling_course_references_to_null_preserves_all_records_and_relationships(self):
        """
        Setting course=None on CourseLevel, Module, and TrainingCluster preserves:
        - CourseLevel, Module, TrainingCluster records
        - Module-to-Level relationships
        - TrainingAssignment and its Level relationship
        - TrainingFileMapping records and validation when both Module and Cluster have course=None
        - Submodules, questions, attempts, responses, learner progress, and feedback
        - Legacy Course record itself
        """
        CourseLevel.objects.filter(course=self.legacy_course).update(course=None)
        Module.objects.filter(course=self.legacy_course).update(course=None)
        TrainingCluster.objects.filter(course=self.legacy_course).update(course=None)

        self.level_1.refresh_from_db()
        self.level_2.refresh_from_db()
        self.level_3.refresh_from_db()
        self.mod_1.refresh_from_db()
        self.mod_2.refresh_from_db()
        self.cluster_1.refresh_from_db()
        self.file_mapping.refresh_from_db()
        self.level_assignment.refresh_from_db()

        # 1. Course references are NULL while Course record still exists
        self.assertIsNone(self.level_1.course)
        self.assertIsNone(self.level_2.course)
        self.assertIsNone(self.level_3.course)
        self.assertIsNone(self.mod_1.course)
        self.assertIsNone(self.mod_2.course)
        self.assertIsNone(self.cluster_1.course)
        self.assertEqual(str(self.cluster_1), "CLUSTER-1: Cluster 1: Organizational Identity & Staffing Fundamentals")
        self.assertTrue(Course.objects.filter(pk=self.legacy_course.pk, code="IT-REC-01").exists())

        # 2. Module-to-Level relationships remain intact
        self.assertEqual(self.mod_1.level_id, self.level_1.id)
        self.assertEqual(self.mod_2.level_id, self.level_2.id)
        self.mod_1.clean()
        self.mod_2.clean()

        # 3. TrainingAssignment and Level relationship remain intact
        self.assertIsNone(self.level_assignment.course)
        self.assertEqual(self.level_assignment.level_id, self.level_1.id)

        # 4. TrainingFileMapping remains intact and clean() passes when both Module and Cluster have course=None
        self.assertEqual(self.file_mapping.cluster_id, self.cluster_1.id)
        self.assertEqual(self.file_mapping.module_id, self.mod_1.id)
        self.assertEqual(self.file_mapping.submodule_id, self.submodule.id)
        self.file_mapping.clean()

        # 5. Dependent records remain intact
        self.assertTrue(Submodule.objects.filter(pk=self.submodule.pk, module=self.mod_1).exists())
        self.assertTrue(ModuleQuestion.objects.filter(pk=self.question.pk, module=self.mod_1).exists())
        self.assertTrue(ModuleAssessmentAttempt.objects.filter(pk=self.attempt.pk, module=self.mod_1).exists())
        self.assertTrue(ModuleQuestionResponse.objects.filter(pk=self.response.pk, question=self.question).exists())
        self.assertTrue(LearnerSubmoduleProgress.objects.filter(pk=self.sub_progress.pk, submodule=self.submodule).exists())
        self.assertTrue(ModuleFeedback.objects.filter(pk=self.feedback.pk, module=self.mod_1).exists())

    def test_training_file_mapping_validation_with_null_and_mismatched_courses(self):
        """
        TrainingFileMapping model clean() and TrainingFileMappingSerializer validate():
        - Succeed when both Module and Cluster have course=None
        - Succeed when either Module or Cluster has course=None (hybrid decoupled state)
        - Reject when both Module and Cluster specify different non-null Courses
        """
        from core.serializers import TrainingFileMappingSerializer

        self.mod_1.course = None
        self.mod_1.save()
        self.cluster_1.course = None
        self.cluster_1.save()

        # Valid when both course_id are None
        self.file_mapping.refresh_from_db()
        self.file_mapping.clean()

        tf_2 = TrainingFile.objects.create(
            file=SimpleUploadedFile("lesson_2.pdf", b"%PDF-1.4 content 2", content_type="application/pdf"),
            filename="lesson_2.pdf",
            relative_path="lesson_2.pdf",
            file_type="PDF",
            file_size=18,
            checksum="b" * 64,
            uploaded_by=self.admin,
        )
        ser_ok = TrainingFileMappingSerializer(
            data={
                "file_id": tf_2.id,
                "cluster": self.cluster_1.id,
                "module": self.mod_1.id,
                "submodule": self.submodule.id,
                "category": "SUPPLEMENTARY_REFERENCE",
            }
        )
        self.assertTrue(ser_ok.is_valid(), ser_ok.errors)

        # Reject when both have non-null, different courses
        cluster_other = TrainingCluster.objects.create(
            course=self.other_course,
            name="Other Course Cluster",
            code="CLUSTER-OTHER",
            order=1,
        )
        self.mod_2.course = self.legacy_course
        self.mod_2.save()

        invalid_mapping = TrainingFileMapping(
            training_file=tf_2,
            cluster=cluster_other,
            module=self.mod_2,
            category="SUPPLEMENTARY_REFERENCE",
        )
        with self.assertRaises(ValidationError):
            invalid_mapping.clean()

        ser_bad = TrainingFileMappingSerializer(
            data={
                "file_id": tf_2.id,
                "cluster": cluster_other.id,
                "module": self.mod_2.id,
                "category": "SUPPLEMENTARY_REFERENCE",
            }
        )
        self.assertFalse(ser_bad.is_valid())
        self.assertIn("module", ser_bad.errors)

    def test_set_null_deletion_behavior_prevents_cascade_deletion(self):
        """
        Because CourseLevel.course, Module.course, TrainingCluster.course, and TrainingAssignment.course
        now use on_delete=models.SET_NULL, deleting a Course sets course=None on linked records
        rather than cascade-deleting them.
        """
        temp_course = Course.objects.create(
            name="Temporary Course",
            code="TMP-CRS",
            status="PUBLISHED",
            created_by=self.admin,
        )
        lvl = CourseLevel.objects.create(course=temp_course, name="Temp Level", order=10)
        mod = Module.objects.create(
            course=temp_course,
            level=lvl,
            name="Temp Module",
            order=1,
            status="PUBLISHED",
            created_by=self.admin,
        )
        clust = TrainingCluster.objects.create(
            course=temp_course,
            name="Temp Cluster",
            code="TMP-CLUST",
            order=1,
        )

        # Delete temp_course directly via ORM
        temp_course.delete()

        # Verify lvl, mod, and clust survive with course=None
        lvl.refresh_from_db()
        mod.refresh_from_db()
        clust.refresh_from_db()
        self.assertIsNone(lvl.course)
        self.assertIsNone(mod.course)
        self.assertEqual(mod.level_id, lvl.id)
        self.assertIsNone(clust.course)

