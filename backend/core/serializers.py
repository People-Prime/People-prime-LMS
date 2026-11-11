"""
People Prime LMS — Django REST Framework Serializers.
Implements ModelSerializers with explicit role validation, relational integrity,
read-only metadata, and secure client-input handling across all domain models.
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from core.models import (
    AuditLog,
    CandidateType,
    Course,
    CourseLevel,
    GroupMembership,
    LearnerGroup,
    LearnerSubmoduleProgress,
    Module,
    ModuleAssessmentAttempt,
    ModuleFeedback,
    ModuleQuestion,
    ModuleQuestionResponse,
    QuestionType,
    Submodule,
    TrainerGroupAssignment,
    TrainingAssignment,
    TrainingCluster,
    TrainingFile,
    TrainingFileMapping,
)

User = get_user_model()


# =============================================================================
# 1. Curriculum Serializers (Course -> Module -> Submodule)
# =============================================================================

class CourseSerializer(serializers.ModelSerializer):
    """
    Serializer for Course entities.
    """
    created_by_username = serializers.ReadOnlyField(source="created_by.username")

    class Meta:
        model = Course
        fields = [
            "id",
            "name",
            "code",
            "description",
            "order",
            "status",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]


class CourseLevelSerializer(serializers.ModelSerializer):
    """
    Serializer for CourseLevel entities (e.g., Level 1, Level 2, Level 3).
    Includes dynamically calculated modules_count.
    """
    course_name = serializers.ReadOnlyField(source="course.name")
    course_code = serializers.ReadOnlyField(source="course.code")
    modules_count = serializers.SerializerMethodField()

    class Meta:
        model = CourseLevel
        fields = [
            "id",
            "course",
            "course_name",
            "course_code",
            "name",
            "order",
            "description",
            "modules_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "course_name",
            "course_code",
            "modules_count",
            "created_at",
            "updated_at",
        ]
        validators = [
            UniqueTogetherValidator(
                queryset=CourseLevel.objects.all(),
                fields=["course", "name"],
                message="A level with this name already exists in the selected course.",
            ),
            UniqueTogetherValidator(
                queryset=CourseLevel.objects.all(),
                fields=["course", "order"],
                message="A level with this order number already exists in the selected course.",
            ),
        ]

    def get_modules_count(self, obj):
        return obj.modules.count()


class ModuleSerializer(serializers.ModelSerializer):
    """
    Serializer for Module entities belonging to a Course.
    """
    course_name = serializers.ReadOnlyField(source="course.name")
    level_name = serializers.ReadOnlyField(source="level.name")
    created_by_username = serializers.ReadOnlyField(source="created_by.username")

    class Meta:
        model = Module
        fields = [
            "id",
            "course",
            "course_name",
            "level",
            "level_name",
            "name",
            "code",
            "description",
            "order",
            "estimated_duration_minutes",
            "status",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "course_name",
            "level_name",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        validators = [
            UniqueTogetherValidator(
                queryset=Module.objects.all(),
                fields=["course", "code"],
                message="A module with this code already exists in the selected course.",
            ),
            UniqueTogetherValidator(
                queryset=Module.objects.all(),
                fields=["course", "order"],
                message="A module with this order number already exists in the selected course.",
            ),
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        course = attrs.get("course") or (self.instance.course if self.instance else None)
        level = attrs.get("level") if "level" in attrs else (self.instance.level if self.instance else None)
        if course and level and level.course_id != course.id:
            raise serializers.ValidationError({
                "level": f"The assigned level '{level.name}' belongs to course '{level.course.code}', but this module belongs to course '{course.code}'."
            })
        return attrs


class SubmoduleSerializer(serializers.ModelSerializer):
    """
    Serializer for Submodule lesson partitions within a Module.
    """
    module_name = serializers.ReadOnlyField(source="module.name")

    class Meta:
        model = Submodule
        fields = [
            "id",
            "module",
            "module_name",
            "name",
            "description",
            "order",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "module_name",
            "created_at",
            "updated_at",
        ]
        validators = [
            UniqueTogetherValidator(
                queryset=Submodule.objects.all(),
                fields=["module", "order"],
                message="A submodule with this order number already exists in the selected module.",
            ),
        ]


class LearnerSubmoduleProgressSerializer(serializers.ModelSerializer):
    """
    Serializer for tracking learner confirmation of learning content review per retake cycle.
    """
    submodule_name = serializers.ReadOnlyField(source="submodule.name")
    submodule_order = serializers.ReadOnlyField(source="submodule.order")
    learner_username = serializers.ReadOnlyField(source="learner.username")

    class Meta:
        model = LearnerSubmoduleProgress
        fields = [
            "id",
            "learner",
            "learner_username",
            "submodule",
            "submodule_name",
            "submodule_order",
            "target_attempt_number",
            "is_completed",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "learner",
            "learner_username",
            "submodule_name",
            "submodule_order",
            "completed_at",
        ]


# =============================================================================
# 2. Candidate Types, Learner Groups, Memberships, & Trainer Assignments
# =============================================================================

class CandidateTypeSerializer(serializers.ModelSerializer):
    """
    Serializer for candidate type classifications (e.g. Campus Fresher, Lateral).
    """
    class Meta:
        model = CandidateType
        fields = [
            "id",
            "name",
            "code",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
        ]


class LearnerGroupSerializer(serializers.ModelSerializer):
    """
    Serializer for LearnerGroup cohorts.
    """
    candidate_type_name = serializers.ReadOnlyField(source="candidate_type.name")
    learners_count = serializers.IntegerField(source="learners.count", read_only=True)
    trainers_count = serializers.IntegerField(source="trainers.count", read_only=True)

    class Meta:
        model = LearnerGroup
        fields = [
            "id",
            "name",
            "code",
            "candidate_type",
            "candidate_type_name",
            "description",
            "is_active",
            "learners_count",
            "trainers_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "candidate_type_name",
            "learners_count",
            "trainers_count",
            "created_at",
            "updated_at",
        ]


class GroupMembershipSerializer(serializers.ModelSerializer):
    """
    Serializer managing learner membership in a group.
    Security policy: strictly enforces that only users with role='LEARNER' can be members.
    """
    learner_username = serializers.ReadOnlyField(source="learner.username")
    group_name = serializers.ReadOnlyField(source="group.name")

    class Meta:
        model = GroupMembership
        fields = [
            "id",
            "group",
            "group_name",
            "learner",
            "learner_username",
            "joined_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "group_name",
            "learner_username",
            "joined_at",
        ]
        validators = [
            UniqueTogetherValidator(
                queryset=GroupMembership.objects.all(),
                fields=["group", "learner"],
                message="This learner is already a member of the selected group.",
            ),
        ]

    def validate_learner(self, value):
        """
        Enforce that only users with the LEARNER role are added to groups.
        Prevents assignment of Trainers or Admins as group learners.
        """
        user_role = getattr(value, "role", None)
        if user_role != User.Role.LEARNER:
            raise serializers.ValidationError(
                f"Only users with the LEARNER role can be added to learner groups. User '{value.username}' has role '{user_role}'."
            )
        return value


class TrainerGroupAssignmentSerializer(serializers.ModelSerializer):
    """
    Serializer managing trainer assignments to learner groups.
    Security policy: strictly enforces that only users with role in ('TRAINER', 'ADMIN') can be assigned.
    """
    trainer_username = serializers.ReadOnlyField(source="trainer.username")
    trainer_name = serializers.SerializerMethodField()
    trainer_email = serializers.ReadOnlyField(source="trainer.email")
    group_name = serializers.ReadOnlyField(source="group.name")

    class Meta:
        model = TrainerGroupAssignment
        fields = [
            "id",
            "group",
            "group_name",
            "trainer",
            "trainer_username",
            "trainer_name",
            "trainer_email",
            "assigned_at",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "group_name",
            "trainer_username",
            "trainer_name",
            "trainer_email",
            "assigned_at",
        ]
        validators = [
            UniqueTogetherValidator(
                queryset=TrainerGroupAssignment.objects.all(),
                fields=["group", "trainer"],
                message="This trainer is already assigned to the selected group.",
            ),
        ]

    def get_trainer_name(self, obj):
        if not obj.trainer:
            return ""
        name = f"{obj.trainer.first_name} {obj.trainer.last_name}".strip()
        return name or obj.trainer.username

    def validate_trainer(self, value):
        """
        Enforce that only users with TRAINER or ADMIN roles are assigned to manage groups.
        Prevents assignment of Learners as trainers.
        """
        user_role = getattr(value, "role", None)
        if user_role not in (User.Role.TRAINER, User.Role.ADMIN):
            raise serializers.ValidationError(
                f"Only users with TRAINER or ADMIN roles can be assigned to manage groups. User '{value.username}' has role '{user_role}'."
            )
        return value


class TrainingAssignmentSerializer(serializers.ModelSerializer):
    """
    Serializer for assigning training (Course or Module) to recipients
    (LearnerGroup, CandidateType, or Individual Learner).
    """
    course_name = serializers.ReadOnlyField(source="course.name")
    module_name = serializers.ReadOnlyField(source="module.name")
    learner_group_name = serializers.ReadOnlyField(source="learner_group.name")
    candidate_type_name = serializers.ReadOnlyField(source="candidate_type.name")
    learner_username = serializers.ReadOnlyField(source="learner.username")
    assigned_by_username = serializers.ReadOnlyField(source="assigned_by.username")

    class Meta:
        model = TrainingAssignment
        fields = [
            "id",
            "course",
            "course_name",
            "module",
            "module_name",
            "learner_group",
            "learner_group_name",
            "candidate_type",
            "candidate_type_name",
            "learner",
            "learner_username",
            "assigned_by",
            "assigned_by_username",
            "assigned_at",
            "due_date",
            "is_active",
        ]
        read_only_fields = [
            "id",
            "course_name",
            "module_name",
            "learner_group_name",
            "candidate_type_name",
            "learner_username",
            "assigned_by",
            "assigned_by_username",
            "assigned_at",
        ]
        extra_kwargs = {
            "course": {"required": False, "allow_null": True},
            "module": {"required": False, "allow_null": True},
            "learner_group": {"required": False, "allow_null": True},
            "candidate_type": {"required": False, "allow_null": True},
            "learner": {"required": False, "allow_null": True},
        }

    def validate(self, attrs):
        """
        Enforce model invariants:
        1. Exactly one curriculum target: Course or Module.
        2. Exactly one recipient: LearnerGroup, CandidateType, or Individual Learner.
        3. If recipient is Learner, user must be active and have LEARNER role.
        4. Enforce composite uniqueness matching the model's conditional unique constraints.
        """
        course = attrs.get("course", getattr(self.instance, "course", None))
        module = attrs.get("module", getattr(self.instance, "module", None))
        learner_group = attrs.get("learner_group", getattr(self.instance, "learner_group", None))
        candidate_type = attrs.get("candidate_type", getattr(self.instance, "candidate_type", None))
        learner = attrs.get("learner", getattr(self.instance, "learner", None))

        # Check curriculum target: exactly one required
        targets = [bool(course), bool(module)]
        target_count = sum(targets)
        if target_count == 0:
            raise serializers.ValidationError(
                {"curriculum_target": "A training assignment must specify exactly one curriculum target: Course or Module."}
            )
        if target_count > 1:
            raise serializers.ValidationError(
                {"curriculum_target": "A training assignment cannot target a Course and Module simultaneously. Specify exactly one target."}
            )

        # Check recipient: exactly one required
        recipients = [bool(learner_group), bool(candidate_type), bool(learner)]
        recipient_count = sum(recipients)
        if recipient_count == 0:
            raise serializers.ValidationError(
                {"recipient": "A training assignment must specify exactly one recipient: a Learner Group, a Candidate Type, or an Individual Learner."}
            )
        if recipient_count > 1:
            raise serializers.ValidationError(
                {"recipient": "A training assignment cannot target an individual learner, a group, or a candidate type simultaneously. Specify exactly one recipient."}
            )

        # Validate learner role and status
        if learner:
            if getattr(learner, "role", None) != "LEARNER":
                raise serializers.ValidationError(
                    {"learner": f"Individual assignments can only be assigned to users with the LEARNER role. User '{learner.username}' has role '{getattr(learner, 'role', None)}'."}
                )
            if not learner.is_active:
                raise serializers.ValidationError(
                    {"learner": f"Cannot assign training to inactive learner '{learner.username}'."}
                )

        # Enforce composite uniqueness against existing records
        target_filter = {}
        if course:
            target_filter["course"] = course
        elif module:
            target_filter["module"] = module

        recipient_filter = {}
        if learner_group:
            recipient_filter["learner_group"] = learner_group
        elif candidate_type:
            recipient_filter["candidate_type"] = candidate_type
        elif learner:
            recipient_filter["learner"] = learner

        qs = TrainingAssignment.objects.filter(**target_filter, **recipient_filter)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"non_field_errors": ["An assignment with this exact curriculum target and recipient already exists."]}
            )

        return attrs


# =============================================================================
# 4. Module Completion Questions & Responses Serializers
# =============================================================================

class ModuleAssessmentAttemptSerializer(serializers.ModelSerializer):
    """
    Serializer for ModuleAssessmentAttempt records.
    Provides attempt metadata, scores, and completion status.
    """
    learner_username = serializers.ReadOnlyField(source="learner.username")
    module_name = serializers.ReadOnlyField(source="module.name")

    class Meta:
        model = ModuleAssessmentAttempt
        fields = [
            "id",
            "module",
            "module_name",
            "learner",
            "learner_username",
            "attempt_number",
            "score",
            "total_possible",
            "percentage",
            "is_completed",
            "started_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "module_name",
            "learner",
            "learner_username",
            "attempt_number",
            "score",
            "total_possible",
            "percentage",
            "is_completed",
            "started_at",
            "completed_at",
        ]


class ModuleQuestionSerializer(serializers.ModelSerializer):
    """
    Serializer for Module Questions supporting YES_NO (2 options) and
    MULTIPLE_CHOICE (3+ options) single-answer questions.
    Learner-facing views automatically sanitize options to hide is_correct.
    """
    module_name = serializers.ReadOnlyField(source="module.name")
    options = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )

    class Meta:
        model = ModuleQuestion
        fields = [
            "id",
            "module",
            "module_name",
            "question_text",
            "question_type",
            "options",
            "order",
            "is_required",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "module_name",
            "created_at",
            "updated_at",
        ]
        validators = [
            UniqueTogetherValidator(
                queryset=ModuleQuestion.objects.all(),
                fields=["module", "order"],
                message="A question with this order number already exists in the selected module.",
            ),
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        is_learner = False
        if request and hasattr(request, "user") and request.user.is_authenticated:
            if getattr(request.user, "role", None) == User.Role.LEARNER:
                is_learner = True

        raw_options = data.get("options") or []
        # If YES_NO question has empty options, generate default 2 options
        if instance.question_type == QuestionType.YES_NO and not raw_options:
            raw_options = [
                {"id": "opt_yes", "text": "Yes", "is_correct": True},
                {"id": "opt_no", "text": "No", "is_correct": False},
            ]

        if is_learner:
            # Strip is_correct from options for learners to prevent cheating
            sanitized = []
            for opt in raw_options:
                sanitized.append({
                    "id": opt.get("id"),
                    "text": opt.get("text"),
                })
            data["options"] = sanitized
        else:
            data["options"] = raw_options

        return data

    def validate(self, attrs):
        is_create = self.instance is None
        q_type = attrs.get("question_type", getattr(self.instance, "question_type", QuestionType.YES_NO))
        options = attrs.get("options", getattr(self.instance, "options", None))

        # In Stage 2, all assessment questions are mandatory; normalize is_required to True
        attrs["is_required"] = True

        if is_create:
            # During question creation, options MUST be explicitly provided
            if not options:
                raise serializers.ValidationError({"options": "Options must be explicitly provided with exactly one correct answer."})
        else:
            # During update, if options was not passed in payload, retain instance options
            if options is None:
                options = getattr(self.instance, "options", [])

        # Validate option counts per question type
        if q_type == QuestionType.YES_NO:
            if len(options) != 2:
                raise serializers.ValidationError({"options": "Yes/No questions must have exactly 2 options."})
        elif q_type == QuestionType.MULTIPLE_CHOICE:
            if len(options) < 3:
                raise serializers.ValidationError({"options": "Multiple choice questions must have 3 or more options."})

        # Validate options structure and require exactly one correct answer
        option_ids = set()
        correct_count = 0
        for idx, opt in enumerate(options):
            if not isinstance(opt, dict):
                raise serializers.ValidationError({"options": f"Option #{idx+1} must be an object."})
            opt_id = str(opt.get("id", "")).strip()
            opt_text = str(opt.get("text", "")).strip()
            if not opt_id:
                raise serializers.ValidationError({"options": f"Option #{idx+1} must have an 'id'."})
            if not opt_text:
                raise serializers.ValidationError({"options": f"Option #{idx+1} must have non-empty 'text'."})
            if opt_id in option_ids:
                raise serializers.ValidationError({"options": f"Duplicate option ID '{opt_id}' detected."})
            option_ids.add(opt_id)

            # Never treat missing is_correct as True; strictly evaluate truthiness
            if bool(opt.get("is_correct")):
                correct_count += 1

        if correct_count == 0:
            raise serializers.ValidationError(
                {"options": "No correct answer specified. Exactly one option must have 'is_correct: true'."}
            )
        if correct_count > 1:
            raise serializers.ValidationError(
                {"options": f"Multiple correct answers specified ({correct_count}). Exactly one option must have 'is_correct: true'."}
            )

        return attrs


class ModuleQuestionResponseSerializer(serializers.ModelSerializer):
    """
    Serializer for a learner's answer to an assessment question.
    Supports single-answer MCQs and legacy Yes/No.
    Evaluates correctness, awards 1 mark for correct and 0 for incorrect,
    and binds to the learner's active assessment attempt.
    """
    question_text = serializers.ReadOnlyField(source="question.question_text")
    learner_username = serializers.ReadOnlyField(source="learner.username")
    selected_option_id = serializers.CharField(write_only=True, required=False)
    response_value = serializers.BooleanField(required=False)
    attempt_number = serializers.IntegerField(source="attempt.attempt_number", read_only=True)

    class Meta:
        model = ModuleQuestionResponse
        fields = [
            "id",
            "attempt",
            "attempt_number",
            "question",
            "question_text",
            "learner",
            "learner_username",
            "response_value",
            "selected_option_id",
            "response_payload",
            "submitted_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "attempt",
            "attempt_number",
            "question_text",
            "learner",
            "learner_username",
            "response_payload",
            "submitted_at",
            "updated_at",
        ]
        validators = []

    def validate(self, attrs):
        request = self.context.get("request")
        raw_learner_id = self.initial_data.get("learner") if hasattr(self, "initial_data") else None
        if raw_learner_id is not None and request and request.user and request.user.is_authenticated:
            try:
                if int(raw_learner_id) != request.user.id:
                    raise serializers.ValidationError(
                        {"learner": "You cannot submit question responses on behalf of another user."}
                    )
            except (ValueError, TypeError):
                raise serializers.ValidationError({"learner": "Invalid learner specified."})

        learner = attrs.get("learner", getattr(self.instance, "learner", None))
        if request and request.user and request.user.is_authenticated:
            attrs["learner"] = request.user
            learner = request.user

        if not learner:
            raise serializers.ValidationError({"learner": "Learner must be specified."})

        if getattr(learner, "role", None) != User.Role.LEARNER:
            raise serializers.ValidationError(
                {"learner": f"Only users with the LEARNER role can submit responses. User has role '{getattr(learner, 'role', None)}'."}
            )

        question = attrs.get("question", getattr(self.instance, "question", None))
        if not question:
            raise serializers.ValidationError({"question": "Question must be specified."})

        # Get or determine the active attempt for this learner and question's module
        module = question.module
        attempt = attrs.get("attempt")
        if not attempt:
            # Look up or create latest open attempt
            attempt = ModuleAssessmentAttempt.objects.filter(
                module=module,
                learner=learner,
            ).order_by("-attempt_number").first()

            if not attempt:
                # Create Attempt 1 on initial question response
                attempt = ModuleAssessmentAttempt.objects.create(
                    module=module,
                    learner=learner,
                    attempt_number=1,
                    is_completed=False,
                )
            elif attempt.is_completed:
                # Disallow silent auto-creation of subsequent attempts on answer submission
                raise serializers.ValidationError(
                    {"non_field_errors": ["Current assessment attempt is completed. You must explicitly initiate a retake after reviewing required learning content."]}
                )

            attrs["attempt"] = attempt

        # Check duplicate response within the same attempt
        if ModuleQuestionResponse.objects.filter(attempt=attempt, question=question).exists():
            raise serializers.ValidationError(
                {"non_field_errors": ["A response for this question has already been recorded in this attempt."]}
            )

        # Evaluate selected option or legacy response_value
        selected_option_id = attrs.get("selected_option_id")
        response_value = attrs.get("response_value")

        options = question.options or []
        if question.question_type == QuestionType.YES_NO and not options:
            options = [
                {"id": "opt_yes", "text": "Yes", "is_correct": True},
                {"id": "opt_no", "text": "No", "is_correct": False},
            ]

        matched_option = None
        if selected_option_id:
            for opt in options:
                if str(opt.get("id")) == str(selected_option_id):
                    matched_option = opt
                    break
            if not matched_option:
                raise serializers.ValidationError({"selected_option_id": "Invalid option selected for this question."})
        elif response_value is not None:
            # Legacy Yes/No support
            target_id = "opt_yes" if response_value else "opt_no"
            for opt in options:
                if opt.get("id") == target_id or (response_value and opt.get("text", "").lower() == "yes") or (not response_value and opt.get("text", "").lower() == "no"):
                    matched_option = opt
                    break
            if not matched_option:
                matched_option = {"id": target_id, "text": "Yes" if response_value else "No", "is_correct": bool(response_value)}
        else:
            raise serializers.ValidationError({"selected_option_id": "An answer must be selected."})

        # Determine correctness strictly from matched_option.is_correct (never guess from position)
        is_correct = bool(matched_option.get("is_correct", False))
        score_val = 1.0 if is_correct else 0.0

        # Pop selected_option_id so it is not passed to Model.objects.create()
        attrs.pop("selected_option_id", None)

        attrs["response_value"] = is_correct
        attrs["response_payload"] = {
            "selected_option_id": matched_option.get("id"),
            "selected_option_text": matched_option.get("text"),
            "is_correct": is_correct,
            "score": score_val,
            "total_marks": 1.0,
        }

        return attrs

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        payload = instance.response_payload or {}
        ret["is_correct"] = payload.get("is_correct", instance.response_value)
        ret["marks_obtained"] = payload.get("score", 1.0 if instance.response_value else 0.0)
        ret["selected_option_text"] = payload.get("selected_option_text")
        return ret


# =============================================================================
# 4b. Module Feedback Serializers
# =============================================================================

class ModuleFeedbackSerializer(serializers.ModelSerializer):
    """
    Serializer for creating and viewing ModuleFeedback records.
    Validates:
    - 5 required fields: module, trainer, module_rating, trainer_rating, understanding_level, comments.
    - Ratings: integer 1 to 5.
    - Understanding level: ADVANCED, GOOD, or BASIC.
    - Comments: non-empty after strip.
    - Learner: bound strictly to request.user (forbids spoofing).
    - Module: exists, accessible, and verified complete.
    - Trainer: active trainer assigned to learner's active cohort.
    - Uniqueness: exactly one feedback record per (module, learner).
    """
    learner_username = serializers.ReadOnlyField(source="learner.username")
    trainer_username = serializers.ReadOnlyField(source="trainer.username")
    trainer_name = serializers.SerializerMethodField()
    module_name = serializers.ReadOnlyField(source="module.name")

    class Meta:
        model = ModuleFeedback
        fields = [
            "id",
            "module",
            "module_name",
            "learner",
            "learner_username",
            "trainer",
            "trainer_username",
            "trainer_name",
            "module_rating",
            "trainer_rating",
            "understanding_level",
            "comments",
            "submitted_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "module_name",
            "learner",
            "learner_username",
            "trainer_username",
            "trainer_name",
            "submitted_at",
            "updated_at",
        ]
        validators = []

    def get_trainer_name(self, obj):
        if not obj.trainer:
            return ""
        name = f"{obj.trainer.first_name} {obj.trainer.last_name}".strip()
        return name or obj.trainer.username

    def validate_module_rating(self, value):
        if not isinstance(value, int) or isinstance(value, bool):
            raise serializers.ValidationError("Module rating must be an integer between 1 and 5.")
        if value < 1 or value > 5:
            raise serializers.ValidationError("Module rating must be between 1 and 5.")
        return value

    def validate_trainer_rating(self, value):
        if not isinstance(value, int) or isinstance(value, bool):
            raise serializers.ValidationError("Trainer rating must be an integer between 1 and 5.")
        if value < 1 or value > 5:
            raise serializers.ValidationError("Trainer rating must be between 1 and 5.")
        return value

    def validate_comments(self, value):
        if not value or not isinstance(value, str) or not value.strip():
            raise serializers.ValidationError("Written feedback cannot be empty or contain only whitespace.")
        return value.strip()

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            raise serializers.ValidationError({"learner": "Authentication required."})

        # Derive learner identity from session
        client_learner = attrs.get("learner")
        if client_learner and client_learner.id != request.user.id:
            raise serializers.ValidationError({"learner": "You cannot submit feedback on behalf of another user."})

        if request.user.role != User.Role.LEARNER:
            raise serializers.ValidationError({"learner": "Only users with the LEARNER role can submit module feedback."})

        attrs["learner"] = request.user
        learner = request.user

        module = attrs.get("module")
        if not module:
            raise serializers.ValidationError({"module": "Module must be specified."})

        # 1. Enforce uniqueness: one feedback per (module, learner)
        qs = ModuleFeedback.objects.filter(module=module, learner=learner)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"non_field_errors": ["You have already submitted feedback for this module."]}
            )

        # 2. Check module completion using existing backend completion rule
        # A module is complete when total_required > 0 and answered_required == total_required
        from core.models import ModuleQuestion, ModuleQuestionResponse
        required_questions = ModuleQuestion.objects.filter(
            module=module,
            is_active=True,
            is_required=True,
        )
        total_required = required_questions.count()
        if total_required == 0:
            raise serializers.ValidationError(
                {"module": "This module does not have completion questions configured and is not eligible for feedback."}
            )

        answered_required_ids = set(
            ModuleQuestionResponse.objects.filter(
                question__in=required_questions,
                learner=learner,
            ).values_list("question_id", flat=True)
        )
        if len(answered_required_ids) < total_required:
            raise serializers.ValidationError(
                {"module": "You must complete all required module questions before submitting feedback."}
            )

        # 3. Validate trainer eligibility:
        # Must be an active trainer assigned to an active cohort the learner is an active member of
        trainer = attrs.get("trainer")
        if not trainer:
            raise serializers.ValidationError({"trainer": "Trainer must be specified."})

        if trainer.role not in (User.Role.TRAINER, User.Role.ADMIN):
            raise serializers.ValidationError(
                {"trainer": "Selected user does not have a trainer or administrator role."}
            )

        from core.models import TrainerGroupAssignment
        is_eligible = TrainerGroupAssignment.objects.filter(
            trainer=trainer,
            is_active=True,
            group__is_active=True,
            group__memberships__learner=learner,
            group__memberships__is_active=True,
        ).exists()

        if not is_eligible:
            raise serializers.ValidationError(
                {"trainer": "The selected trainer is not an active trainer assigned to your training cohort."}
            )

        return attrs


# =============================================================================
# 5. Audit Log Serializer
# =============================================================================

class AuditLogSerializer(serializers.ModelSerializer):
    """
    Read-only serializer for AuditLog records.
    Exposes audit metadata without permitting modification or manual insertion.
    """
    actor_username = serializers.ReadOnlyField(source="actor.username")

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_username",
            "action",
            "entity_type",
            "entity_id",
            "details",
            "ip_address",
            "timestamp",
        ]
        read_only_fields = [
            "id",
            "actor",
            "actor_username",
            "action",
            "entity_type",
            "entity_id",
            "details",
            "ip_address",
            "timestamp",
        ]

# =============================================================================
# 6. Trainer Tracking & Learner Progress Overview Serializers (Step 3.5)
# =============================================================================

class LearnerProgressOverviewSerializer(serializers.Serializer):
    """
    Serializer for trainer learner roster overview with aggregated module progress.
    """
    learner_id = serializers.IntegerField(source="id")
    learner_name = serializers.SerializerMethodField()
    learner_username = serializers.CharField(source="username")
    learner_email = serializers.EmailField(source="email")
    assigned_groups = serializers.ListField(child=serializers.CharField())
    total_assigned_modules = serializers.IntegerField()
    completed_modules = serializers.IntegerField()
    pending_modules = serializers.IntegerField()
    completion_percentage = serializers.FloatField()

    def get_learner_name(self, obj):
        full_name = obj.get_full_name()
        return full_name if full_name.strip() else obj.username


class ModuleProgressDetailSerializer(serializers.Serializer):
    """
    Serializer for detailed per-module progress item within a learner's progression breakdown.
    """
    module_id = serializers.IntegerField(source="id")
    module_name = serializers.CharField(source="name")
    course_id = serializers.IntegerField(source="course.id")
    course_name = serializers.CharField(source="course.name")
    total_required_questions = serializers.IntegerField()
    answered_required_questions = serializers.IntegerField()
    is_completed = serializers.BooleanField()


class IndividualLearnerProgressSerializer(serializers.Serializer):
    """
    Serializer for comprehensive individual learner progress breakdown.
    """
    learner = serializers.DictField()
    progress = serializers.DictField()
    modules = ModuleProgressDetailSerializer(many=True)

# =============================================================================
# 7. Admin Oversight & System-Wide Progress Reporting Serializers (Step 3.6)
# =============================================================================

class AdminSystemOverviewSerializer(serializers.Serializer):
    """
    Serializer for system-wide administrative overview metrics.
    """
    total_courses = serializers.IntegerField()
    draft_courses = serializers.IntegerField(default=0)
    published_courses = serializers.IntegerField(default=0)
    total_modules = serializers.IntegerField()
    total_learner_groups = serializers.IntegerField()
    total_candidate_types = serializers.IntegerField()
    total_users = serializers.IntegerField(default=0)
    total_admins = serializers.IntegerField(default=0)
    total_trainers = serializers.IntegerField()
    total_staff = serializers.IntegerField(default=0)
    total_trainers_and_learners = serializers.IntegerField(default=0)
    in_progress_learners_count = serializers.IntegerField(default=0)
    total_learners = serializers.IntegerField()
    active_learners_count = serializers.IntegerField()
    system_wide_completion_rate = serializers.FloatField()
    recent_logins = serializers.ListField(child=serializers.DictField(), required=False, default=list)


class CohortCompletionSummarySerializer(serializers.Serializer):
    """
    Serializer for cohort-level completion metrics in the admin progress report.
    """
    group_id = serializers.IntegerField()
    group_name = serializers.CharField()
    group_code = serializers.CharField()
    candidate_type = serializers.CharField(allow_null=True)
    total_learners = serializers.IntegerField()
    average_completion_percentage = serializers.FloatField()
    completed_learners_count = serializers.IntegerField()


class AdminProgressReportSerializer(serializers.Serializer):
    """
    Serializer for system-wide progress report including cohort summaries and module stats.
    """
    system_completion_rate = serializers.FloatField()
    total_active_learners = serializers.IntegerField()
    total_learner_groups = serializers.IntegerField()
    cohorts = CohortCompletionSummarySerializer(many=True)


class AdminAuditActivitySummarySerializer(serializers.Serializer):
    """
    Serializer for system activity and audit logs summary.
    """
    total_audit_events = serializers.IntegerField()
    recent_activities = serializers.ListField(child=serializers.DictField())


class AdminInProgressLearnerItemSerializer(serializers.Serializer):
    """
    Serializer for an individual learner-module combination in progress.
    """
    learner_id = serializers.IntegerField()
    learner_name = serializers.CharField()
    learner_username = serializers.CharField()
    learner_email = serializers.CharField(allow_blank=True)
    course_id = serializers.IntegerField()
    course_name = serializers.CharField()
    module_id = serializers.IntegerField()
    module_name = serializers.CharField()
    total_required_questions = serializers.IntegerField()
    answered_required_questions = serializers.IntegerField()
    completion_percentage = serializers.FloatField()
    last_activity = serializers.DateTimeField(allow_null=True)


class AdminInProgressLearnersResponseSerializer(serializers.Serializer):
    """
    Serializer for the list of in-progress learners with summary count.
    """
    total_in_progress_learners = serializers.IntegerField()
    total_in_progress_module_enrollments = serializers.IntegerField()
    items = AdminInProgressLearnerItemSerializer(many=True)


class AdminTrainerAssignedGroupSerializer(serializers.Serializer):
    """
    Serializer for a candidate group assigned to a trainer with candidate and curriculum metrics.
    """
    group_id = serializers.IntegerField()
    group_name = serializers.CharField()
    group_code = serializers.CharField()
    candidate_type = serializers.CharField(allow_null=True)
    active_candidates_count = serializers.IntegerField()
    assigned_courses_count = serializers.IntegerField()
    assigned_modules_count = serializers.IntegerField()
    average_completion_percentage = serializers.FloatField()
    completed_learners_count = serializers.IntegerField()
    assigned_curriculum = serializers.ListField(child=serializers.DictField())


class AdminTrainerWorkloadItemSerializer(serializers.Serializer):
    """
    Serializer for a single trainer's aggregated workload and cohort assignments.
    """
    trainer_id = serializers.IntegerField()
    trainer_name = serializers.CharField()
    trainer_username = serializers.CharField()
    trainer_email = serializers.CharField(allow_blank=True)
    assigned_groups_count = serializers.IntegerField()
    distinct_candidates_count = serializers.IntegerField()
    total_assigned_courses_count = serializers.IntegerField()
    total_assigned_modules_count = serializers.IntegerField()
    overall_completion_percentage = serializers.FloatField()
    assigned_groups = AdminTrainerAssignedGroupSerializer(many=True)


class AdminTrainerWorkloadResponseSerializer(serializers.Serializer):
    """
    Serializer for the list of trainers with system-wide summary counts.
    """
    total_trainers = serializers.IntegerField()
    total_trainers_with_assignments = serializers.IntegerField()
    total_assigned_cohorts = serializers.IntegerField()
    total_distinct_candidates_reached = serializers.IntegerField()
    trainers = AdminTrainerWorkloadItemSerializer(many=True)


class AdminTrainerListSerializer(serializers.ModelSerializer):
    """
    Safe serializer for listing trainers in admin dropdowns and tables.
    Omits password hashes and internal security attributes.
    """
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "date_joined",
            "is_active",
        ]
        read_only_fields = fields


class AdminLearnerListSerializer(serializers.ModelSerializer):
    """
    Safe read-only serializer for listing learners in admin selection dropdowns and tables.
    Omits password hashes, internal security attributes, and administrative privileges.
    """
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "date_joined",
            "is_active",
        ]
        read_only_fields = fields


class AdminCreateTrainerSerializer(serializers.Serializer):
    """
    Admin-only serializer for creating new TRAINER accounts.
    Enforces password validation, username uniqueness, and sets non-privileged trainer role.
    """
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(allow_blank=True, required=False)
    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False, default="")
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False, default="")
    password = serializers.CharField(write_only=True, trim_whitespace=False, style={"input_type": "password"})

    def validate_username(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Username cannot be blank.")
        if User.objects.filter(username__iexact=cleaned).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return cleaned

    def validate_email(self, value):
        cleaned = value.strip() if value else ""
        if cleaned and User.objects.filter(email__iexact=cleaned).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return cleaned

    def validate(self, attrs):
        password = attrs.get("password", "")
        if not password or not password.strip():
            raise serializers.ValidationError({"password": ["Password cannot be blank."]})
        username = attrs.get("username", "").strip()
        email = attrs.get("email", "").strip() if attrs.get("email") else ""
        first_name = attrs.get("first_name", "").strip()
        last_name = attrs.get("last_name", "").strip()
        password = attrs.get("password")

        # Create temporary candidate for password validation
        candidate = User(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=User.Role.TRAINER,
        )
        try:
            from django.contrib.auth.password_validation import validate_password
            from django.core.exceptions import ValidationError as DjangoValidationError
            validate_password(password, user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        attrs["username"] = username
        attrs["email"] = email
        attrs["first_name"] = first_name
        attrs["last_name"] = last_name
        return attrs

    def create(self, validated_data):
        from django.db import IntegrityError
        try:
            user = User.objects.create_user(
                username=validated_data["username"],
                email=validated_data.get("email", ""),
                password=validated_data["password"],
                first_name=validated_data.get("first_name", ""),
                last_name=validated_data.get("last_name", ""),
                role=User.Role.TRAINER,
                is_staff=False,
                is_superuser=False,
            )
            return user
        except IntegrityError:
            raise serializers.ValidationError({"username": ["A user with this username already exists."]})


class AdminUpdateTrainerSerializer(serializers.Serializer):
    """
    Admin-only serializer for updating existing TRAINER accounts.
    Allows updating username, email, first_name, last_name, and optionally password.
    Preserves trainer role and does not allow role escalation.
    """
    username = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(allow_blank=True, required=False)
    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False, style={"input_type": "password"})

    def validate_username(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Username cannot be blank.")
        # Exclude the current instance user being edited
        instance = getattr(self, "instance", None)
        qs = User.objects.filter(username__iexact=cleaned)
        if instance:
            qs = qs.exclude(pk=instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return cleaned

    def validate_email(self, value):
        cleaned = value.strip() if value else ""
        if cleaned:
            instance = getattr(self, "instance", None)
            qs = User.objects.filter(email__iexact=cleaned)
            if instance:
                qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                raise serializers.ValidationError("A user with this email address already exists.")
        return cleaned

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        username = attrs.get("username", instance.username if instance else "").strip()
        email = attrs.get("email", instance.email if instance else "").strip()
        first_name = attrs.get("first_name", instance.first_name if instance else "").strip()
        last_name = attrs.get("last_name", instance.last_name if instance else "").strip()

        password = attrs.get("password")
        if password is not None and password != "":
            # Validate optional new password against Django validators
            candidate = User(
                username=username,
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=User.Role.TRAINER,
            )
            try:
                from django.contrib.auth.password_validation import validate_password
                from django.core.exceptions import ValidationError as DjangoValidationError
                validate_password(password, user=candidate)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": list(exc.messages)})

        if "username" in attrs:
            attrs["username"] = username
        if "email" in attrs:
            attrs["email"] = email
        if "first_name" in attrs:
            attrs["first_name"] = first_name
        if "last_name" in attrs:
            attrs["last_name"] = last_name
        return attrs

    def update(self, instance, validated_data):
        from django.db import IntegrityError
        try:
            if "username" in validated_data:
                instance.username = validated_data["username"]
            if "email" in validated_data:
                instance.email = validated_data["email"]
            if "first_name" in validated_data:
                instance.first_name = validated_data["first_name"]
            if "last_name" in validated_data:
                instance.last_name = validated_data["last_name"]

            password = validated_data.get("password")
            if password is not None and password != "":
                instance.set_password(password)

            instance.save()
            return instance
        except IntegrityError:
            raise serializers.ValidationError({"username": ["A user with this username already exists."]})


# =============================================================================
# 8. User Management Serializers (TalentLMS Users Module)
# =============================================================================

class AdminUserListSerializer(serializers.ModelSerializer):
    """
    TalentLMS-style safe read serializer for listing users:
    - User (full name or username fallback)
    - Email
    - Type (Admin, Trainer, Learner)
    - Registration (date_joined)
    - Last login (last_login)
    - Status (Active / Inactive)
    Omits password hashes and internal Django privileges.
    """
    name = serializers.SerializerMethodField()
    user_type_label = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "name",
            "email",
            "role",
            "user_type_label",
            "first_name",
            "last_name",
            "date_joined",
            "last_login",
            "is_active",
        ]
        read_only_fields = fields

    def get_name(self, obj):
        full_name = obj.get_full_name().strip()
        return full_name if full_name else obj.username

    def get_user_type_label(self, obj):
        role_map = {
            User.Role.ADMIN: "Admin",
            User.Role.TRAINER: "Trainer",
            User.Role.LEARNER: "Learner",
        }
        return role_map.get(obj.role, obj.role)


class AdminCreateUserSerializer(serializers.Serializer):
    """
    Admin-only serializer for creating new LMS user accounts (Admin, Trainer, Learner).
    Validates:
    - First name, Last name
    - Email (mandatory, format validated, uniqueness checked, Gmail/standard domains accepted)
    - Username (mandatory, unique, defaults to email if omitted)
    - Role (ADMIN, TRAINER, LEARNER)
    - Password (validated against Django AUTH_PASSWORD_VALIDATORS)
    - is_active (boolean, default True)
    """
    first_name = serializers.CharField(max_length=150, allow_blank=True, required=False, default="")
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False, default="")
    email = serializers.EmailField(required=True)
    username = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.LEARNER)
    password = serializers.CharField(write_only=True, required=True, trim_whitespace=False, style={"input_type": "password"})
    is_active = serializers.BooleanField(default=True, required=False)

    def validate_email(self, value):
        cleaned = value.strip().lower()
        if not cleaned:
            raise serializers.ValidationError("Email address is required.")
        if User.objects.filter(email__iexact=cleaned).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return cleaned

    def validate_username(self, value):
        if value:
            cleaned = value.strip()
            if User.objects.filter(username__iexact=cleaned).exists():
                raise serializers.ValidationError("A user with this username already exists.")
            return cleaned
        return ""

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        username = attrs.get("username", "").strip()
        if not username:
            # Default username to email if not explicitly provided
            username = email
            if User.objects.filter(username__iexact=username).exists():
                raise serializers.ValidationError({"username": ["A user with this username already exists. Please specify a unique username."]})
            attrs["username"] = username

        password = attrs.get("password", "")
        if not password or not password.strip():
            raise serializers.ValidationError({"password": ["Password cannot be blank."]})

        first_name = attrs.get("first_name", "").strip()
        last_name = attrs.get("last_name", "").strip()
        role = attrs.get("role", User.Role.LEARNER)
        is_active = attrs.get("is_active", True)

        # Validate password against configured Django validators
        candidate = User(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            is_active=is_active,
        )
        try:
            from django.contrib.auth.password_validation import validate_password
            from django.core.exceptions import ValidationError as DjangoValidationError
            validate_password(password, user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})

        attrs["username"] = username
        attrs["email"] = email
        attrs["first_name"] = first_name
        attrs["last_name"] = last_name
        attrs["role"] = role
        attrs["is_active"] = is_active
        return attrs

    def create(self, validated_data):
        from django.db import IntegrityError
        try:
            user = User.objects.create_user(
                username=validated_data["username"],
                email=validated_data["email"],
                password=validated_data["password"],
                first_name=validated_data.get("first_name", ""),
                last_name=validated_data.get("last_name", ""),
                role=validated_data.get("role", User.Role.LEARNER),
                is_active=validated_data.get("is_active", True),
                is_staff=False,
                is_superuser=False,
            )
            return user
        except IntegrityError:
            raise serializers.ValidationError({"username": ["A user with this username or email already exists."]})


# =============================================================================
# 9. Reports Module Serializers (Phase 6)
# =============================================================================

class ReportOverviewSerializer(serializers.Serializer):
    """
    Serializer for Section A: Overview Metrics.
    Role-scoped aggregate counts and completion percentage.
    """
    total_learners = serializers.IntegerField()
    total_courses = serializers.IntegerField()
    total_assigned_enrollments = serializers.IntegerField()
    completed_courses = serializers.IntegerField()
    in_progress_courses = serializers.IntegerField()
    not_started_courses = serializers.IntegerField()
    overall_completion_percentage = serializers.FloatField()


class ReportLearnerPerformanceItemSerializer(serializers.Serializer):
    """
    Serializer for Section B: Learner Performance records.
    Represents actual scored assessment attempts or completion status.
    """
    learner_id = serializers.IntegerField()
    learner_name = serializers.CharField()
    email = serializers.CharField(allow_blank=True)
    course_id = serializers.IntegerField()
    course_name = serializers.CharField()
    module_id = serializers.IntegerField()
    module_name = serializers.CharField()
    assessment_name = serializers.CharField(allow_null=True)
    marks_obtained = serializers.FloatField(allow_null=True)
    total_marks = serializers.FloatField(allow_null=True)
    percentage = serializers.FloatField(allow_null=True)
    submission_date = serializers.DateTimeField(allow_null=True)
    is_scored = serializers.BooleanField()


class ReportCourseProgressItemSerializer(serializers.Serializer):
    """
    Serializer for Section C: Course Progress metrics.
    Course-wise completion summary across assigned learners.
    """
    course_id = serializers.IntegerField()
    course_name = serializers.CharField()
    assigned_learners_count = serializers.IntegerField()
    completed_learners_count = serializers.IntegerField()
    in_progress_learners_count = serializers.IntegerField()
    not_started_learners_count = serializers.IntegerField()
    average_completion_percentage = serializers.FloatField()


# =============================================================================
# 9. Admin Training Materials & File Management Serializers
# =============================================================================

class TrainingFileSerializer(serializers.ModelSerializer):
    """
    Serializer for TrainingFile entities.
    Returns file metadata, relative paths, sizes, and secure download URL.
    """
    uploaded_by_username = serializers.ReadOnlyField(source="uploaded_by.username")
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = TrainingFile
        fields = [
            "id",
            "filename",
            "relative_path",
            "file_type",
            "file_size",
            "checksum",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_at",
            "download_url",
        ]
        read_only_fields = [
            "id",
            "filename",
            "relative_path",
            "file_type",
            "file_size",
            "checksum",
            "uploaded_by",
            "uploaded_by_username",
            "uploaded_at",
            "download_url",
        ]

    def get_download_url(self, obj):
        request = self.context.get("request")
        url = f"/api/admin/training-files/{obj.id}/download/"
        if request:
            return request.build_absolute_uri(url)
        return url


class TrainingClusterSerializer(serializers.ModelSerializer):
    """
    Serializer for TrainingCluster entities.
    """
    course_name = serializers.ReadOnlyField(source="course.name")
    mappings_count = serializers.IntegerField(source="file_mappings.count", read_only=True)

    class Meta:
        model = TrainingCluster
        fields = [
            "id",
            "course",
            "course_name",
            "name",
            "code",
            "description",
            "order",
            "mappings_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "course_name", "mappings_count", "created_at", "updated_at"]


class TrainingFileMappingSerializer(serializers.ModelSerializer):
    """
    Serializer for TrainingFileMapping entities connecting files to clusters, modules, and submodules.
    """
    file_id = serializers.PrimaryKeyRelatedField(
        queryset=TrainingFile.objects.all(),
        source="training_file",
        write_only=True,
    )
    training_file_id = serializers.ReadOnlyField(source="training_file.id")
    filename = serializers.ReadOnlyField(source="training_file.filename")
    file_type = serializers.ReadOnlyField(source="training_file.file_type")
    file_size = serializers.ReadOnlyField(source="training_file.file_size")
    relative_path = serializers.ReadOnlyField(source="training_file.relative_path")
    download_url = serializers.SerializerMethodField()
    cluster_name = serializers.ReadOnlyField(source="cluster.name")
    cluster_code = serializers.ReadOnlyField(source="cluster.code")
    module_name = serializers.ReadOnlyField(source="module.name")
    module_code = serializers.ReadOnlyField(source="module.code")
    submodule_name = serializers.ReadOnlyField(source="submodule.name")
    submodule_order = serializers.ReadOnlyField(source="submodule.order")

    class Meta:
        model = TrainingFileMapping
        fields = [
            "id",
            "file_id",
            "training_file_id",
            "filename",
            "file_type",
            "file_size",
            "relative_path",
            "download_url",
            "cluster",
            "cluster_name",
            "cluster_code",
            "module",
            "module_name",
            "module_code",
            "submodule",
            "submodule_name",
            "submodule_order",
            "category",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "training_file_id",
            "filename",
            "file_type",
            "file_size",
            "relative_path",
            "download_url",
            "cluster_name",
            "cluster_code",
            "module_name",
            "module_code",
            "submodule_name",
            "submodule_order",
            "created_at",
            "updated_at",
        ]

    def get_download_url(self, obj):
        request = self.context.get("request")
        url = f"/api/admin/training-files/{obj.training_file_id}/download/"
        if request:
            return request.build_absolute_uri(url)
        return url

    def validate(self, attrs):
        # Validate that submodule belongs to module
        sub = attrs.get("submodule") or (self.instance.submodule if self.instance else None)
        mod = attrs.get("module") or (self.instance.module if self.instance else None)
        cluster = attrs.get("cluster") or (self.instance.cluster if self.instance else None)

        if sub and mod and sub.module_id != mod.id:
            raise serializers.ValidationError({"submodule": "Selected lesson does not belong to the selected module."})
        if mod and cluster and mod.course_id != cluster.course_id:
            raise serializers.ValidationError({"module": "Selected module belongs to a different course than the cluster."})
        return attrs




