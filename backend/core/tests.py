import json
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.test import Client, RequestFactory, TestCase
from core.permissions import (
    IsLMSAdmin,
    IsLMSLearner,
    IsLMSTrainer,
    require_lms_role,
)

User = get_user_model()


class CorePublicEndpointsTest(TestCase):
    """
    Tests for public endpoints: /api/status/ and /api/csrf/.
    """

    def setUp(self):
        self.client = Client()

    def test_lms_status_public_access(self):
        response = self.client.get("/api/status/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("Admin", data["roles"])
        self.assertIn("Trainer", data["roles"])
        self.assertIn("Learner", data["roles"])

    def test_csrf_token_endpoint(self):
        response = self.client.get("/api/csrf/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("csrfToken", data)
        self.assertTrue(len(data["csrfToken"]) > 0)


class CoreAuthenticationFlowTest(TestCase):
    """
    Tests for session login, session me (/api/me/), and logout.
    """

    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.password = "ValidStrongPass123!"
        self.user = User.objects.create_user(
            username="activelearner",
            password=self.password,
            role=User.Role.LEARNER,
        )

    def test_valid_login(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps({"username": "activelearner", "password": self.password}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["message"], "Login successful.")
        self.assertEqual(data["user"]["username"], "activelearner")
        self.assertEqual(data["user"]["role"], User.Role.LEARNER)

        # Confirm session persistence via /api/me/
        me_response = self.client.get("/api/me/")
        self.assertEqual(me_response.status_code, 200)
        me_data = me_response.json()
        self.assertTrue(me_data["authenticated"])
        self.assertEqual(me_data["user"]["username"], "activelearner")

    def test_invalid_password_login(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps({"username": "activelearner", "password": "WrongPassword123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertEqual(data["error"], "Invalid username or password.")

    def test_nonexistent_user_login(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps({"username": "nosuchuser", "password": "Password123!"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_inactive_user_login(self):
        self.user.is_active = False
        self.user.save()

        response = self.client.post(
            "/api/login/",
            data=json.dumps({"username": "activelearner", "password": self.password}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Invalid username or password.")

    def test_session_me_unauthenticated(self):
        response = self.client.get("/api/me/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["authenticated"])
        self.assertIsNone(data["user"])

    def test_logout_authenticated(self):
        # Log in first
        self.client.login(username="activelearner", password=self.password)

        response = self.client.post("/api/logout/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Logout successful.")

        # Confirm session is terminated
        me_response = self.client.get("/api/me/")
        self.assertFalse(me_response.json()["authenticated"])

    def test_logout_unauthenticated_fails(self):
        # Attempt to logout without an active session
        response = self.client.post("/api/logout/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Authentication required.")

    def test_login_with_json_array_payload_returns_400(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps(["not", "an", "object"]),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Invalid request payload. Expected a JSON object.")

    def test_login_with_json_string_payload_returns_400(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps("plain-string"),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Invalid request payload. Expected a JSON object.")

    def test_login_with_json_null_payload_returns_400(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps(None),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Invalid request payload. Expected a JSON object.")

    def test_login_with_missing_credentials_returns_400(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Username and password are required.")


class CoreCSRFProtectionEnforcementTest(TestCase):
    """
    Focused unit tests validating that CSRF protection is strictly enforced
    by Django's @csrf_protect on state-changing endpoints (/api/login/ and /api/logout/).
    """

    def setUp(self):
        # Client with enforce_csrf_checks=True strictly executes Django's CSRF middleware
        self.client = Client(enforce_csrf_checks=True)
        self.password = "ValidStrongPass123!"
        self.user = User.objects.create_user(
            username="csrftestuser",
            password=self.password,
            role=User.Role.LEARNER,
        )

    def test_csrf_token_endpoint_returns_usable_token(self):
        response = self.client.get("/api/csrf/")
        self.assertEqual(response.status_code, 200)
        token = response.json().get("csrfToken")
        self.assertIsNotNone(token)
        self.assertIsInstance(token, str)
        self.assertTrue(len(token) > 0)
        self.assertIn("csrftoken", response.cookies)

    def test_state_changing_login_without_csrf_is_rejected(self):
        response = self.client.post(
            "/api/login/",
            data=json.dumps({"username": "csrftestuser", "password": self.password}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_state_changing_login_with_valid_csrf_succeeds(self):
        csrf_response = self.client.get("/api/csrf/")
        token = csrf_response.json()["csrfToken"]

        response = self.client.post(
            "/api/login/",
            data=json.dumps({"username": "csrftestuser", "password": self.password}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Login successful.")

    def test_state_changing_logout_without_csrf_is_rejected(self):
        self.client.login(username="csrftestuser", password=self.password)
        response = self.client.post("/api/logout/")
        self.assertEqual(response.status_code, 403)

    def test_state_changing_logout_with_valid_csrf_succeeds(self):
        csrf_response = self.client.get("/api/csrf/")
        token = csrf_response.json()["csrfToken"]

        self.client.login(username="csrftestuser", password=self.password)

        response = self.client.post(
            "/api/logout/",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Logout successful.")


class CoreRegistrationSecurityTest(TestCase):
    """
    Tests ensuring self-registration cannot create privileged roles
    and enforces Django password validation rules.
    """

    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)

    def test_registration_creates_learner_only(self):
        payload = {
            "username": "newstudent",
            "password": "SecurePassword#2026",
            "email": "student@example.com",
        }
        response = self.client.post(
            "/api/register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["user"]["role"], User.Role.LEARNER)

        # Verify user in database
        created_user = User.objects.get(username="newstudent")
        self.assertEqual(created_user.role, User.Role.LEARNER)
        self.assertFalse(created_user.is_staff)
        self.assertFalse(created_user.is_superuser)

    def test_registration_privilege_escalation_to_admin_blocked(self):
        """
        Verify that supplying role='ADMIN' is ignored and the created user is strictly LEARNER.
        """
        payload = {
            "username": "wannabe_admin",
            "password": "SecurePassword#2026",
            "role": "ADMIN",
        }
        response = self.client.post(
            "/api/register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["user"]["role"], User.Role.LEARNER)

        created_user = User.objects.get(username="wannabe_admin")
        self.assertEqual(created_user.role, User.Role.LEARNER)
        self.assertFalse(created_user.is_staff)

    def test_registration_privilege_escalation_to_trainer_blocked(self):
        """
        Verify that supplying role='TRAINER' is ignored and the created user is strictly LEARNER.
        """
        payload = {
            "username": "wannabe_trainer",
            "password": "SecurePassword#2026",
            "role": "TRAINER",
        }
        response = self.client.post(
            "/api/register/",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["user"]["role"], User.Role.LEARNER)

        created_user = User.objects.get(username="wannabe_trainer")
        self.assertEqual(created_user.role, User.Role.LEARNER)

    def test_registration_weak_password_rejected(self):
        """
        Verify that Django password validators reject weak/short passwords.
        """
        # Too short (< 8 chars)
        response = self.client.post(
            "/api/register/",
            data=json.dumps({"username": "shortpass_user", "password": "123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data["error"], "Password validation failed.")
        self.assertTrue(len(data["details"]) > 0)

        # Entirely numeric
        response_num = self.client.post(
            "/api/register/",
            data=json.dumps({"username": "numpass_user", "password": "1234567890"}),
            content_type="application/json",
        )
        self.assertEqual(response_num.status_code, 400)

    def test_registration_duplicate_username_rejected(self):
        User.objects.create_user(
            username="existinguser",
            password="SecurePassword#2026",
        )
        response = self.client.post(
            "/api/register/",
            data=json.dumps({"username": "existinguser", "password": "SecurePassword#2026"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Username is already taken.")


class CoreRoleAuthorizationTest(TestCase):
    """
    Tests server-side role permission helpers and DRF permission classes.
    """

    def setUp(self):
        self.factory = RequestFactory()
        self.admin_user = User.objects.create_user(
            username="admin_user",
            password="SecurePass#123",
            role=User.Role.ADMIN,
        )
        self.trainer_user = User.objects.create_user(
            username="trainer_user",
            password="SecurePass#123",
            role=User.Role.TRAINER,
        )
        self.learner_user = User.objects.create_user(
            username="learner_user",
            password="SecurePass#123",
            role=User.Role.LEARNER,
        )

    def test_drF_permission_classes(self):
        request = self.factory.get("/")

        # IsLMSAdmin
        perm_admin = IsLMSAdmin()
        request.user = self.admin_user
        self.assertTrue(perm_admin.has_permission(request, None))
        request.user = self.trainer_user
        self.assertFalse(perm_admin.has_permission(request, None))
        request.user = self.learner_user
        self.assertFalse(perm_admin.has_permission(request, None))

        # IsLMSTrainer (grants both Trainer and Admin)
        perm_trainer = IsLMSTrainer()
        request.user = self.trainer_user
        self.assertTrue(perm_trainer.has_permission(request, None))
        request.user = self.admin_user
        self.assertTrue(perm_trainer.has_permission(request, None))
        request.user = self.learner_user
        self.assertFalse(perm_trainer.has_permission(request, None))

        # IsLMSLearner
        perm_learner = IsLMSLearner()
        request.user = self.learner_user
        self.assertTrue(perm_learner.has_permission(request, None))
        request.user = self.trainer_user
        self.assertFalse(perm_learner.has_permission(request, None))

    def test_require_lms_role_decorator(self):
        @require_lms_role(User.Role.ADMIN)
        def admin_only_view(request):
            return JsonResponse({"message": "Welcome Admin"})

        # Unauthenticated request -> 401
        req_anon = self.factory.get("/")
        from django.contrib.auth.models import AnonymousUser
        req_anon.user = AnonymousUser()
        resp = admin_only_view(req_anon)
        self.assertEqual(resp.status_code, 401)

        # Authenticated as LEARNER -> 403
        req_learner = self.factory.get("/")
        req_learner.user = self.learner_user
        resp = admin_only_view(req_learner)
        self.assertEqual(resp.status_code, 403)

        # Authenticated as ADMIN -> 200
        req_admin = self.factory.get("/")
        req_admin.user = self.admin_user
        resp = admin_only_view(req_admin)
        self.assertEqual(resp.status_code, 200)


# =============================================================================
# Phase 2: Domain Data Models and Learning Material Infrastructure Tests
# =============================================================================

from django.contrib import admin
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from core.models import (
    AuditAction,
    AuditLog,
    CandidateType,
    Course,
    GroupMembership,
    LearnerGroup,
    Module,
    ModuleQuestion,
    ModuleQuestionResponse,
    PublicationStatus,
    Submodule,
    TrainerGroupAssignment,
    TrainingAssignment,
)


class CoreLearningHierarchyTest(TestCase):
    """
    Tests for Course -> Module -> Submodule hierarchy,
    ordering, and database constraints.
    """

    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="curriculum_admin",
            password="SecurePass#123",
            role=User.Role.ADMIN,
        )

    def test_hierarchy_creation_and_traversal(self):
        course = Course.objects.create(
            name="Python Backend Development",
            code="PY-101",
            order=1,
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin_user,
        )
        self.assertEqual(str(course), "Python Backend Development (PY-101)")

        module = Module.objects.create(
            course=course,
            name="Django Architecture & ORM",
            order=1,
            estimated_duration_minutes=120,
            status=PublicationStatus.PUBLISHED,
            created_by=self.admin_user,
        )
        self.assertEqual(module.course, course)
        self.assertIn(module, course.modules.all())

        submodule = Submodule.objects.create(
            module=module,
            name="PostgreSQL Models & Migrations",
            order=1,
            status=PublicationStatus.PUBLISHED,
        )
        self.assertEqual(submodule.module, module)
        self.assertIn(submodule, module.submodules.all())

    def test_duplicate_course_code_rejected(self):
        Course.objects.create(name="Course 1", code="CRS-1", order=1)

        with self.assertRaises(IntegrityError):
            Course.objects.create(name="Course 2", code="CRS-1", order=2)

    def test_duplicate_module_order_per_course_rejected(self):
        course = Course.objects.create(name="Course C", code="CRS-C", order=1)
        Module.objects.create(course=course, name="Module 1", order=1)

        with self.assertRaises(IntegrityError):
            Module.objects.create(course=course, name="Module 2", order=1)

    def test_duplicate_submodule_order_per_module_rejected(self):
        course = Course.objects.create(name="Course D", code="CRS-D", order=1)
        module = Module.objects.create(course=course, name="Module D", order=1)
        Submodule.objects.create(module=module, name="Sub 1", order=1)

        with self.assertRaises(IntegrityError):
            Submodule.objects.create(module=module, name="Sub 2", order=1)


class CoreCohortsAndAssignmentsTest(TestCase):
    """
    Tests for CandidateType, LearnerGroup, GroupMembership,
    TrainerGroupAssignment, and TrainingAssignment.
    """

    def setUp(self):
        self.candidate_type = CandidateType.objects.create(
            name="Campus Fresher",
            code="CF-2026",
            description="Engineering graduates joined from campus",
        )
        self.group = LearnerGroup.objects.create(
            name="Cohort Alpha",
            code="GRP-ALPHA",
            candidate_type=self.candidate_type,
        )
        self.learner = User.objects.create_user(
            username="student_john",
            password="SecurePass#123",
            role=User.Role.LEARNER,
        )
        self.trainer_1 = User.objects.create_user(
            username="trainer_sarah",
            password="SecurePass#123",
            role=User.Role.TRAINER,
        )
        self.trainer_2 = User.objects.create_user(
            username="trainer_mark",
            password="SecurePass#123",
            role=User.Role.TRAINER,
        )

    def test_group_membership_and_uniqueness(self):
        membership = GroupMembership.objects.create(
            group=self.group,
            learner=self.learner,
        )
        self.assertEqual(membership.group, self.group)
        self.assertEqual(membership.learner, self.learner)

        # Duplicate membership must raise IntegrityError
        with self.assertRaises(IntegrityError):
            GroupMembership.objects.create(
                group=self.group,
                learner=self.learner,
            )

    def test_group_membership_role_validation(self):
        invalid_member = GroupMembership(
            group=self.group,
            learner=self.trainer_1,  # Not a LEARNER
        )
        with self.assertRaises(ValidationError):
            invalid_member.clean()

    def test_trainer_group_assignment_multiplicity(self):
        # A group can have multiple trainers
        assign_1 = TrainerGroupAssignment.objects.create(
            group=self.group,
            trainer=self.trainer_1,
        )
        assign_2 = TrainerGroupAssignment.objects.create(
            group=self.group,
            trainer=self.trainer_2,
        )
        self.assertEqual(self.group.trainers.count(), 2)

        # A trainer can be assigned to multiple groups
        group_beta = LearnerGroup.objects.create(
            name="Cohort Beta",
            code="GRP-BETA",
            candidate_type=self.candidate_type,
        )
        TrainerGroupAssignment.objects.create(
            group=group_beta,
            trainer=self.trainer_1,
        )
        self.assertEqual(self.trainer_1.assigned_learner_groups.count(), 2)

        # Duplicate trainer-to-group assignment must raise IntegrityError
        with self.assertRaises(IntegrityError):
            TrainerGroupAssignment.objects.create(
                group=self.group,
                trainer=self.trainer_1,
            )

    def test_training_assignment_validation(self):
        course = Course.objects.create(name="Assignment Course", code="ASG-CRS", order=1)

        # Assignment with course and group succeeds
        assignment = TrainingAssignment(
            course=course,
            learner_group=self.group,
        )
        assignment.clean()
        assignment.save()
        self.assertTrue(assignment.pk)

        # Missing target (no course and no module) fails validation
        invalid_target = TrainingAssignment(
            learner_group=self.group,
        )
        with self.assertRaises(ValidationError):
            invalid_target.clean()

        # Missing recipient (no group, candidate type, or learner) fails validation
        invalid_recipient = TrainingAssignment(
            course=course,
        )
        with self.assertRaises(ValidationError):
            invalid_recipient.clean()


class CoreCompletionQuestionsTest(TestCase):
    """
    Tests for ModuleQuestion (non-scored Yes/No confirmation)
    and ModuleQuestionResponse.
    """

    def setUp(self):
        self.course = Course.objects.create(name="Q Course", code="Q-CRS", order=1)
        self.module = Module.objects.create(course=self.course, name="Q Module", order=1)
        self.learner = User.objects.create_user(
            username="exam_learner",
            password="SecurePass#123",
            role=User.Role.LEARNER,
        )
        self.trainer = User.objects.create_user(
            username="exam_trainer",
            password="SecurePass#123",
            role=User.Role.TRAINER,
        )

    def test_module_question_creation_and_ordering_constraint(self):
        q1 = ModuleQuestion.objects.create(
            module=self.module,
            question_text="Have you completed the required hands-on lab exercise?",
            order=1,
            is_required=True,
        )
        self.assertEqual(q1.module, self.module)
        self.assertTrue(q1.is_required)

        # Duplicate order within the same module raises IntegrityError
        with self.assertRaises(IntegrityError):
            ModuleQuestion.objects.create(
                module=self.module,
                question_text="Second question",
                order=1,
            )

    def test_learner_response_and_uniqueness(self):
        q1 = ModuleQuestion.objects.create(
            module=self.module,
            question_text="Did you review the provided architecture diagram?",
            order=1,
        )

        response = ModuleQuestionResponse.objects.create(
            question=q1,
            learner=self.learner,
            response_value=True,
        )
        self.assertTrue(response.response_value)

        # Duplicate response from same learner for same question raises IntegrityError
        with self.assertRaises(IntegrityError):
            ModuleQuestionResponse.objects.create(
                question=q1,
                learner=self.learner,
                response_value=False,
            )

    def test_non_learner_response_validation(self):
        q1 = ModuleQuestion.objects.create(
            module=self.module,
            question_text="Is this confirmed?",
            order=1,
        )
        invalid_resp = ModuleQuestionResponse(
            question=q1,
            learner=self.trainer,  # Trainer, not LEARNER
            response_value=True,
        )
        with self.assertRaises(ValidationError):
            invalid_resp.clean()


class CoreAuditLogTest(TestCase):
    """
    Tests for the AuditLog model.
    """

    def test_audit_log_entry(self):
        admin_user = User.objects.create_user(
            username="auditor",
            password="SecurePass#123",
            role=User.Role.ADMIN,
        )
        entry = AuditLog.objects.create(
            actor=admin_user,
            action=AuditAction.PUBLISH,
            entity_type="LearningMaterial",
            entity_id="42",
            details={"version": 1, "title": "Published course slides"},
            ip_address="127.0.0.1",
        )
        self.assertEqual(entry.action, AuditAction.PUBLISH)
        self.assertEqual(entry.entity_type, "LearningMaterial")
        self.assertEqual(entry.details["version"], 1)
        self.assertIn("auditor", str(entry))


class CoreAdminRegistrationTest(TestCase):
    """
    Verifies that all Phase 2 domain models are registered in Django Admin.
    """

    def test_domain_models_registered(self):
        domain_models = [
            Course,
            Module,
            Submodule,
            CandidateType,
            LearnerGroup,
            GroupMembership,
            TrainerGroupAssignment,
            TrainingAssignment,
            ModuleQuestion,
            ModuleQuestionResponse,
            AuditLog,
        ]
        for model in domain_models:
            with self.subTest(model=model.__name__):
                self.assertIn(model, admin.site._registry)

    def test_audit_log_admin_read_only(self):
        audit_admin = admin.site._registry[AuditLog]
        # Verify manual add and delete permissions are disabled in Django Admin
        self.assertFalse(audit_admin.has_add_permission(None))
        self.assertFalse(audit_admin.has_delete_permission(None))


# =============================================================================
# Phase 3, Step 1: DRF Serializers & Validation Foundation Tests
# =============================================================================

from core.serializers import (
    AuditLogSerializer,
    CandidateTypeSerializer,
    CourseSerializer,
    GroupMembershipSerializer,
    LearnerGroupSerializer,
    ModuleQuestionResponseSerializer,
    ModuleQuestionSerializer,
    ModuleSerializer,
    SubmoduleSerializer,
    TrainerGroupAssignmentSerializer,
    TrainingAssignmentSerializer,
)


class CoreCurriculumSerializersTest(TestCase):
    """
    Tests for Course, Module, and Submodule ModelSerializers.
    """

    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="curriculum_author",
            password="SecurePass#123",
            role=User.Role.ADMIN,
        )

    def test_course_serializer_valid(self):
        payload = {
            "name": "Cloud Native Track",
            "code": "CNT-2026",
            "description": "Cloud native microservices",
            "status": "PUBLISHED",
            "order": 1,
        }
        serializer = CourseSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        course = serializer.save(created_by=self.admin_user)
        self.assertEqual(course.name, "Cloud Native Track")
        self.assertEqual(course.created_by, self.admin_user)

    def test_course_serializer_code_uniqueness_validation(self):
        Course.objects.create(name="Existing Course", code="CRS-1", order=1)

        payload_dup_code = {
            "name": "Duplicate Code Course",
            "code": "CRS-1",
            "order": 2,
        }
        s1 = CourseSerializer(data=payload_dup_code)
        self.assertFalse(s1.is_valid())
        self.assertIn("code", s1.errors)

    def test_module_serializer_uniqueness_validation(self):
        course = Course.objects.create(name="Course Y", code="CRS-Y", order=1)
        Module.objects.create(course=course, name="Module 1", order=1)

        payload_dup = {
            "course": course.id,
            "name": "Module Duplicate",
            "order": 1,
        }
        serializer = ModuleSerializer(data=payload_dup)
        self.assertFalse(serializer.is_valid())
        self.assertTrue(set(serializer.errors) & {"non_field_errors", "order", "level"})

    def test_submodule_serializer_uniqueness_validation(self):
        course = Course.objects.create(name="Course Z", code="CRS-Z", order=1)
        module = Module.objects.create(course=course, name="Module Z", order=1)
        Submodule.objects.create(module=module, name="Sub 1", order=1)

        payload_dup = {
            "module": module.id,
            "name": "Sub Duplicate",
            "order": 1,
        }
        serializer = SubmoduleSerializer(data=payload_dup)
        self.assertFalse(serializer.is_valid())
        self.assertTrue(set(serializer.errors) & {"non_field_errors", "order", "level"})


class CoreCohortsAndAssignmentsSerializersTest(TestCase):
    """
    Tests for CandidateType, LearnerGroup, GroupMembership,
    TrainerGroupAssignment, and TrainingAssignment serializers.
    """

    def setUp(self):
        self.candidate_type = CandidateType.objects.create(
            name="Lateral Fresher",
            code="LF-2026",
        )
        self.group = LearnerGroup.objects.create(
            name="Cohort Gamma",
            code="GRP-GAMMA",
            candidate_type=self.candidate_type,
        )
        self.learner = User.objects.create_user(
            username="learner_bob",
            password="SecurePass#123",
            role=User.Role.LEARNER,
        )
        self.trainer = User.objects.create_user(
            username="trainer_alice",
            password="SecurePass#123",
            role=User.Role.TRAINER,
        )
        self.admin_user = User.objects.create_user(
            username="admin_frank",
            password="SecurePass#123",
            role=User.Role.ADMIN,
        )

    def test_group_membership_enforces_learner_role(self):
        # Valid learner role succeeds
        valid_payload = {
            "group": self.group.id,
            "learner": self.learner.id,
        }
        s1 = GroupMembershipSerializer(data=valid_payload)
        self.assertTrue(s1.is_valid(), s1.errors)
        membership = s1.save()
        self.assertEqual(membership.learner, self.learner)

        # Non-learner role (Trainer) is rejected
        invalid_payload = {
            "group": self.group.id,
            "learner": self.trainer.id,
        }
        s2 = GroupMembershipSerializer(data=invalid_payload)
        self.assertFalse(s2.is_valid())
        self.assertIn("learner", s2.errors)
        self.assertIn("LEARNER role", str(s2.errors["learner"]))

    def test_trainer_group_assignment_enforces_trainer_role(self):
        # Valid trainer role succeeds
        valid_payload = {
            "group": self.group.id,
            "trainer": self.trainer.id,
        }
        s1 = TrainerGroupAssignmentSerializer(data=valid_payload)
        self.assertTrue(s1.is_valid(), s1.errors)
        assign = s1.save()
        self.assertEqual(assign.trainer, self.trainer)

        # Admin role also allowed as group trainer
        admin_payload = {
            "group": self.group.id,
            "trainer": self.admin_user.id,
        }
        s2 = TrainerGroupAssignmentSerializer(data=admin_payload)
        self.assertTrue(s2.is_valid(), s2.errors)

        # Learner role is strictly rejected from trainer assignments
        invalid_payload = {
            "group": self.group.id,
            "trainer": self.learner.id,
        }
        s3 = TrainerGroupAssignmentSerializer(data=invalid_payload)
        self.assertFalse(s3.is_valid())
        self.assertIn("trainer", s3.errors)
        self.assertIn("TRAINER or ADMIN", str(s3.errors["trainer"]))

    def test_training_assignment_validation_rules(self):
        course = Course.objects.create(name="Course A", code="CRS-A", order=1)

        # Valid target (course) and recipient (group) succeeds
        valid_payload = {
            "course": course.id,
            "learner_group": self.group.id,
        }
        s1 = TrainingAssignmentSerializer(data=valid_payload)
        self.assertTrue(s1.is_valid(), s1.errors)

        # Missing target (no course, no module) fails validation
        missing_target = {
            "learner_group": self.group.id,
        }
        s2 = TrainingAssignmentSerializer(data=missing_target)
        self.assertFalse(s2.is_valid())
        self.assertIn("curriculum_target", s2.errors)

        # Missing recipient (no group, no candidate_type, no learner) fails validation
        missing_recipient = {
            "course": course.id,
        }
        s3 = TrainingAssignmentSerializer(data=missing_recipient)
        self.assertFalse(s3.is_valid())
        self.assertIn("recipient", s3.errors)


class CoreMaterialAndQuestionSerializersTest(TestCase):
    """
    Tests for ModuleQuestion and ModuleQuestionResponse serializers.
    """

    def setUp(self):
        self.factory = RequestFactory()
        self.course = Course.objects.create(name="Mat Crs", code="M-CRS", order=1)
        self.module = Module.objects.create(course=self.course, name="Mat Mod", order=1)
        self.other_module = Module.objects.create(course=self.course, name="Other Mod", order=2)
        self.submodule = Submodule.objects.create(module=self.module, name="Mat Sub", order=1)

        self.learner = User.objects.create_user(
            username="resp_learner",
            password="SecurePass#123",
            role=User.Role.LEARNER,
        )
        self.trainer = User.objects.create_user(
            username="resp_trainer",
            password="SecurePass#123",
            role=User.Role.TRAINER,
        )

    def test_module_question_serializer_uniqueness(self):
        ModuleQuestion.objects.create(
            module=self.module,
            question_text="Q1 prompt",
            order=1,
        )
        dup_payload = {
            "module": self.module.id,
            "question_text": "Duplicate Q1 order",
            "order": 1,
        }
        serializer = ModuleQuestionSerializer(data=dup_payload)
        self.assertFalse(serializer.is_valid())
        self.assertTrue(set(serializer.errors) & {"non_field_errors", "order", "level"})

    def test_module_question_response_context_binding(self):
        q = ModuleQuestion.objects.create(
            module=self.module,
            question_text="Have you completed the exercise?",
            order=1,
        )

        # Context with authenticated learner automatically binds request.user
        request = self.factory.post("/")
        request.user = self.learner

        payload = {
            "question": q.id,
            "response_value": True,
        }
        s1 = ModuleQuestionResponseSerializer(data=payload, context={"request": request})
        self.assertTrue(s1.is_valid(), s1.errors)
        resp = s1.save()
        self.assertEqual(resp.learner, self.learner)
        self.assertTrue(resp.response_value)

        # Attempting to forge another learner ID when authenticated raises ValidationError
        other_learner = User.objects.create_user(
            username="other_learner",
            password="SecurePass#123",
            role=User.Role.LEARNER,
        )
        forgery_payload = {
            "question": q.id,
            "learner": other_learner.id,
            "response_value": False,
        }
        s2 = ModuleQuestionResponseSerializer(data=forgery_payload, context={"request": request})
        self.assertFalse(s2.is_valid())
        self.assertIn("learner", s2.errors)

    def test_module_question_response_blocks_non_learner_role(self):
        q = ModuleQuestion.objects.create(
            module=self.module,
            question_text="Check?",
            order=2,
        )
        request = self.factory.post("/")
        request.user = self.trainer  # TRAINER role, not LEARNER!

        payload = {
            "question": q.id,
            "response_value": True,
        }
        serializer = ModuleQuestionResponseSerializer(data=payload, context={"request": request})
        self.assertFalse(serializer.is_valid())
        self.assertIn("learner", serializer.errors)


class CoreAuditLogSerializerTest(TestCase):
    """
    Tests for AuditLogSerializer read-only serialization.
    """

    def test_audit_log_serialization(self):
        user = User.objects.create_user(
            username="log_actor",
            password="SecurePass#123",
            role=User.Role.ADMIN,
        )
        log = AuditLog.objects.create(
            actor=user,
            action=AuditAction.CREATE,
            entity_type="Course",
            entity_id="101",
            details={"name": "New Course"},
            ip_address="192.168.1.1",
        )
        serializer = AuditLogSerializer(log)
        self.assertEqual(serializer.data["actor_username"], "log_actor")
        self.assertEqual(serializer.data["action"], "CREATE")
        self.assertEqual(serializer.data["entity_type"], "Course")
        self.assertEqual(serializer.data["details"]["name"], "New Course")


class TrainingAssignmentUniquenessConstraintsTest(TestCase):
    """
    Unit tests verifying PostgreSQL-safe conditional uniqueness constraints
    and model validation on TrainingAssignment across combinations:
    (Course, Module) x (LearnerGroup, CandidateType, Individual Learner).
    """

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin_assigner",
            password="SecurePass#123",
            role=User.Role.ADMIN,
        )
        self.learner1 = User.objects.create_user(
            username="learner_one",
            password="SecurePass#123",
            role=User.Role.LEARNER,
        )
        self.candidate_type = CandidateType.objects.create(name="Engineering", code="ENG")
        self.group = LearnerGroup.objects.create(
            name="Cohort Alpha",
            code="ALPHA",
            candidate_type=self.candidate_type,
        )
        self.course = Course.objects.create(name="Python Core", code="PY-101")
        self.module = Module.objects.create(name="Basics Module", course=self.course, order=1)

    def test_course_recipient_uniqueness(self):
        from django.db import IntegrityError, transaction
        # 1. Course + Group
        TrainingAssignment.objects.create(course=self.course, learner_group=self.group)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TrainingAssignment.objects.create(course=self.course, learner_group=self.group)

        # 2. Course + CandidateType
        TrainingAssignment.objects.create(course=self.course, candidate_type=self.candidate_type)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TrainingAssignment.objects.create(course=self.course, candidate_type=self.candidate_type)

        # 3. Course + Individual Learner
        TrainingAssignment.objects.create(course=self.course, learner=self.learner1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TrainingAssignment.objects.create(course=self.course, learner=self.learner1)

    def test_module_recipient_uniqueness(self):
        from django.db import IntegrityError, transaction
        # 4. Module + Group
        TrainingAssignment.objects.create(module=self.module, learner_group=self.group)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TrainingAssignment.objects.create(module=self.module, learner_group=self.group)

        # 5. Module + CandidateType
        TrainingAssignment.objects.create(module=self.module, candidate_type=self.candidate_type)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TrainingAssignment.objects.create(module=self.module, candidate_type=self.candidate_type)

        # 6. Module + Individual Learner
        TrainingAssignment.objects.create(module=self.module, learner=self.learner1)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TrainingAssignment.objects.create(module=self.module, learner=self.learner1)



