"""
People Prime LMS Domain Data Models.
Implements the confirmed learning hierarchy, candidate types, learner groups,
training assignments, module completion questions, module feedback,
and audit logging.
"""

import os
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from core.validators import training_file_upload_path, validate_learning_material_file


class PublicationStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PUBLISHED = "PUBLISHED", "Published"
    ARCHIVED = "ARCHIVED", "Archived"


class AuditAction(models.TextChoices):
    CREATE = "CREATE", "Create"
    UPDATE = "UPDATE", "Update"
    DELETE = "DELETE", "Delete"
    PUBLISH = "PUBLISH", "Publish"
    ARCHIVE = "ARCHIVE", "Archive"
    ASSIGN = "ASSIGN", "Assign"
    CORRECT = "CORRECT", "Correct"


# =============================================================================
# 1. Learning Hierarchy: Course -> Module -> Submodule
# =============================================================================

class Course(models.Model):
    """
    Course in the curriculum (e.g. Python Fundamentals).
    """
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True, help_text="Unique course identifier code")
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=1, help_text="Sequence order within the curriculum")
    status = models.CharField(
        max_length=20,
        choices=PublicationStatus.choices,
        default=PublicationStatus.DRAFT,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_courses",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class CourseLevel(models.Model):
    """
    Independent Level entity (e.g. Level 1, Level 2, Level 3).
    Levels can exist independently without a parent Course, or optionally be associated with one.
    Modules are assigned directly to a Level.
    """
    course = models.ForeignKey(
        Course,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="levels",
        help_text="Optional Course this level is associated with",
    )
    name = models.CharField(max_length=100, help_text="e.g. Level 1, Level 2, Level 3")
    order = models.PositiveIntegerField(default=1, help_text="Sequence order within the Course")
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "core_course_level"
        ordering = ["course", "order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "name"],
                name="unique_level_name_per_course",
            ),
            models.UniqueConstraint(
                fields=["course", "order"],
                name="unique_level_order_per_course",
            ),
        ]

    def __str__(self):
        if self.course:
            return f"{self.course.code} - {self.name}"
        return self.name


class Module(models.Model):
    """
    Module belonging directly to a Level, and optionally to a Course. Unit of study where completion questions are administered.
    """
    course = models.ForeignKey(
        Course,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="modules",
        help_text="Optional legacy Course reference",
    )
    level = models.ForeignKey(
        CourseLevel,
        on_delete=models.PROTECT,
        related_name="modules",
        help_text="CourseLevel grouping this module belongs to",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=1, help_text="Sequence order within the Course")
    estimated_duration_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Estimated study duration in minutes",
    )
    status = models.CharField(
        max_length=20,
        choices=PublicationStatus.choices,
        default=PublicationStatus.DRAFT,
        db_index=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_modules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["course", "order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "order"],
                name="unique_module_order_per_course",
            ),
        ]

    def clean(self):
        super().clean()
        if not self.level_id:
            from django.core.exceptions import ValidationError
            raise ValidationError({"level": "A module must be assigned directly to a level."})
        if self.course_id and self.level.course_id and self.level.course_id != self.course_id:
            from django.core.exceptions import ValidationError
            raise ValidationError({
                "level": f"The assigned level '{self.level.name}' belongs to course '{self.level.course.code}', but this module belongs to course '{self.course.code}'."
            })

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        prefix = f"{self.course.code} - " if self.course else ""
        return f"{prefix}Module {self.order}: {self.name}"


class Submodule(models.Model):
    """
    Submodule belonging to a Module for granular lesson partitioning.
    """
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name="submodules",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=1, help_text="Sequence order within the Module")
    status = models.CharField(
        max_length=20,
        choices=PublicationStatus.choices,
        default=PublicationStatus.DRAFT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["module", "order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["module", "order"],
                name="unique_submodule_order_per_module",
            ),
        ]

    def __str__(self):
        return f"{self.module.name} - Submodule {self.order}: {self.name}"


# =============================================================================
# 2. Candidate Types and Learner Groups
# =============================================================================

class CandidateType(models.Model):
    """
    Candidate classification (e.g., Campus Fresher, Lateral Fresher, Intern).
    """
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class LearnerGroup(models.Model):
    """
    Cohort of learners associated with a candidate type and assigned trainers.
    """
    name = models.CharField(max_length=150, unique=True)
    code = models.CharField(max_length=50, unique=True)
    candidate_type = models.ForeignKey(
        CandidateType,
        on_delete=models.PROTECT,
        related_name="learner_groups",
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    learners = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="GroupMembership",
        related_name="learner_groups",
        blank=True,
    )
    trainers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="TrainerGroupAssignment",
        related_name="assigned_learner_groups",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} [{self.candidate_type.code}]"


class GroupMembership(models.Model):
    """
    Explicit intermediary tracking learner membership in a group.
    """
    group = models.ForeignKey(
        LearnerGroup,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="group_memberships",
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["group", "learner"],
                name="unique_learner_group_membership",
            ),
        ]
        ordering = ["-joined_at"]

    def clean(self):
        if hasattr(self.learner, "role") and self.learner.role != "LEARNER":
            raise ValidationError({"learner": "Only users with the LEARNER role can be added as group members."})

    def __str__(self):
        return f"{self.learner.username} in {self.group.name}"


class TrainerGroupAssignment(models.Model):
    """
    Explicit intermediary mapping trainers to learner groups.
    Supports M:N relationships (trainers manage multiple groups, groups have multiple trainers).
    """
    group = models.ForeignKey(
        LearnerGroup,
        on_delete=models.CASCADE,
        related_name="trainer_assignments",
    )
    trainer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trainer_group_assignments",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["group", "trainer"],
                name="unique_trainer_group_assignment",
            ),
        ]
        ordering = ["-assigned_at"]

    def clean(self):
        if hasattr(self.trainer, "role") and self.trainer.role not in ("TRAINER", "ADMIN"):
            raise ValidationError({"trainer": "Only users with TRAINER or ADMIN roles can be assigned to manage groups."})

    def __str__(self):
        return f"Trainer {self.trainer.username} -> {self.group.name}"


# =============================================================================
# 3. Training Assignments
# =============================================================================

class TrainingAssignment(models.Model):
    """
    Direct assignment of learning content to a recipient.
    Target must be exactly one curriculum unit: Course, Level, or Module.
    Recipient must be exactly one: LearnerGroup, CandidateType, or Individual Learner.
    """
    course = models.ForeignKey(
        Course,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="training_assignments",
        help_text="Target course if assigning a whole course",
    )
    level = models.ForeignKey(
        CourseLevel,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="training_assignments",
        help_text="Target level if assigning a specific level directly",
    )
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="training_assignments",
        help_text="Target module if assigning a single module directly",
    )
    learner_group = models.ForeignKey(
        LearnerGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="training_assignments",
        help_text="Assignee group",
    )
    candidate_type = models.ForeignKey(
        CandidateType,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="training_assignments",
        help_text="Assignee candidate type",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="individual_training_assignments",
        help_text="Target individual learner if assigning directly to a single user",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_assignments",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    due_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-assigned_at"]
        constraints = [
            # 1. Course Target Combinations
            models.UniqueConstraint(
                fields=["course", "learner_group"],
                condition=models.Q(course__isnull=False, learner_group__isnull=False),
                name="unique_assign_course_group",
            ),
            models.UniqueConstraint(
                fields=["course", "candidate_type"],
                condition=models.Q(course__isnull=False, candidate_type__isnull=False),
                name="unique_assign_course_candidate_type",
            ),
            models.UniqueConstraint(
                fields=["course", "learner"],
                condition=models.Q(course__isnull=False, learner__isnull=False),
                name="unique_assign_course_learner",
            ),

            # 2. Level Target Combinations
            models.UniqueConstraint(
                fields=["level", "learner_group"],
                condition=models.Q(level__isnull=False, learner_group__isnull=False),
                name="unique_assign_level_group",
            ),
            models.UniqueConstraint(
                fields=["level", "candidate_type"],
                condition=models.Q(level__isnull=False, candidate_type__isnull=False),
                name="unique_assign_level_candidate_type",
            ),
            models.UniqueConstraint(
                fields=["level", "learner"],
                condition=models.Q(level__isnull=False, learner__isnull=False),
                name="unique_assign_level_learner",
            ),

            # 3. Module Target Combinations
            models.UniqueConstraint(
                fields=["module", "learner_group"],
                condition=models.Q(module__isnull=False, learner_group__isnull=False),
                name="unique_assign_module_group",
            ),
            models.UniqueConstraint(
                fields=["module", "candidate_type"],
                condition=models.Q(module__isnull=False, candidate_type__isnull=False),
                name="unique_assign_module_candidate_type",
            ),
            models.UniqueConstraint(
                fields=["module", "learner"],
                condition=models.Q(module__isnull=False, learner__isnull=False),
                name="unique_assign_module_learner",
            ),
        ]

    def clean(self):
        # Enforce that exactly one curriculum target is specified: Course, Level, or Module
        targets = [bool(self.course), bool(self.level), bool(self.module)]
        target_count = sum(targets)
        if target_count == 0:
            raise ValidationError("A training assignment must specify exactly one curriculum target: Course, Level, or Module.")
        if target_count > 1:
            raise ValidationError("A training assignment cannot target a Course, Level, or Module simultaneously. Specify exactly one target.")

        # Enforce exactly one recipient type
        recipients = [bool(self.learner_group), bool(self.candidate_type), bool(self.learner)]
        recipient_count = sum(recipients)
        if recipient_count == 0:
            raise ValidationError("A training assignment must specify exactly one recipient: a Learner Group, a Candidate Type, or an Individual Learner.")
        if recipient_count > 1:
            raise ValidationError("A training assignment cannot target an individual learner, a group, or a candidate type simultaneously. Specify exactly one recipient.")

        # Validate learner role and status for individual assignments
        if self.learner:
            if getattr(self.learner, "role", None) != "LEARNER":
                raise ValidationError({"learner": f"Individual assignments can only be assigned to users with the LEARNER role. User '{self.learner.username}' has role '{getattr(self.learner, 'role', None)}'."})
            if not self.learner.is_active:
                raise ValidationError({"learner": f"Cannot assign training to inactive learner '{self.learner.username}'."})

    def __str__(self):
        if self.module:
            target = f"Module: {self.module.name}"
        elif self.level:
            target = f"Level: {self.level.name}"
        elif self.course:
            target = f"Course: {self.course.name}"
        else:
            target = "Unspecified"

        if self.learner:
            recipient = f"Learner: {self.learner.username}"
        elif self.learner_group:
            recipient = f"Group: {self.learner_group.name}"
        elif self.candidate_type:
            recipient = f"CandidateType: {self.candidate_type.name}"
        else:
            recipient = "Unspecified"

        return f"Assignment: {target} -> {recipient}"


# =============================================================================
# 4. Module Completion Questions & Responses
# =============================================================================

class QuestionType(models.TextChoices):
    YES_NO = "YES_NO", "Yes/No"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE", "Multiple Choice"
    SINGLE_LINE = "SINGLE_LINE", "Single Line Text"
    LONG_ANSWER = "LONG_ANSWER", "Long Answer Text"


class ModuleQuestion(models.Model):
    """
    Flexible completion question for a Module.
    Supports YES_NO, MULTIPLE_CHOICE, SINGLE_LINE, and LONG_ANSWER types.
    Non-scored completion gates.
    """
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name="completion_questions",
    )
    question_text = models.TextField(help_text="Question prompt confirming comprehension, response, or completion")
    question_type = models.CharField(
        max_length=20,
        choices=QuestionType.choices,
        default=QuestionType.YES_NO,
        db_index=True,
        help_text="Type of question (YES_NO, MULTIPLE_CHOICE, SINGLE_LINE, LONG_ANSWER)",
    )
    options = models.JSONField(
        default=list,
        blank=True,
        help_text="List of choices for MULTIPLE_CHOICE questions: [{'id': 'opt_1', 'text': 'Option A'}]",
    )
    order = models.PositiveIntegerField(default=1, help_text="Display order within the Module")
    is_required = models.BooleanField(default=True, help_text="Must be answered to complete the module")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["module", "order"]
        constraints = [
            models.UniqueConstraint(
                fields=["module", "order"],
                name="unique_question_order_per_module",
            ),
        ]

    def __str__(self):
        return f"{self.module.name} - Q{self.order}: {self.question_text[:50]}"


class ModuleAssessmentAttempt(models.Model):
    """
    Tracks a discrete attempt by a learner taking a module's assessment questions.
    Enables voluntary unlimited retakes while preserving complete historical scores and responses.
    """
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name="assessment_attempts",
        help_text="The module whose assessment questions are being evaluated.",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="assessment_attempts",
        help_text="The learner attempting the assessment.",
    )
    attempt_number = models.PositiveIntegerField(
        default=1,
        help_text="Sequential attempt number (1, 2, 3...) for this module and learner.",
    )
    score = models.FloatField(
        default=0.0,
        help_text="Total marks obtained in this attempt.",
    )
    total_possible = models.FloatField(
        default=0.0,
        help_text="Total possible marks available in this attempt.",
    )
    percentage = models.FloatField(
        default=0.0,
        help_text="Score percentage achieved in this attempt.",
    )
    is_completed = models.BooleanField(
        default=False,
        help_text="True when all required questions for this attempt have been answered.",
    )
    started_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when this attempt was initiated.",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when this attempt was completed.",
    )

    class Meta:
        ordering = ["learner", "module", "-attempt_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["module", "learner", "attempt_number"],
                name="unique_module_learner_attempt",
            ),
        ]

    def __str__(self):
        return f"{self.learner.username} - {self.module.name} (Attempt {self.attempt_number}): {self.score}/{self.total_possible}"


class ModuleQuestionResponse(models.Model):
    """
    Learner's submitted answer to an assessment question for a specific attempt.
    Preserves response choice, structured response payload, and correctness mark.
    """
    attempt = models.ForeignKey(
        ModuleAssessmentAttempt,
        on_delete=models.CASCADE,
        related_name="responses",
        null=True,
        blank=True,
        help_text="The specific assessment attempt this response belongs to.",
    )
    question = models.ForeignKey(
        ModuleQuestion,
        on_delete=models.CASCADE,
        related_name="responses",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="module_question_responses",
    )
    response_value = models.BooleanField(help_text="True = Yes/Correct, False = No/Incorrect (legacy Boolean column)")
    response_payload = models.JSONField(
        default=dict,
        blank=True,
        help_text="Structured response payload matching question_type (e.g. {'selected_option_id': 'opt_1', 'is_correct': true, 'score': 1})	",
    )
    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "question"],
                name="unique_attempt_question_response",
            ),
        ]

    def clean(self):
        if hasattr(self.learner, "role") and self.learner.role != "LEARNER":
            raise ValidationError({"learner": "Only users with the LEARNER role can submit module question responses."})

    def __str__(self):
        ans = "Yes" if self.response_value else "No"
        return f"{self.learner.username} -> Q{self.question.order}: {ans}"


class LearnerSubmoduleProgress(models.Model):
    """
    Tracks learner confirmation of learning content review per retake cycle.
    Bound to (learner, submodule, target_attempt_number).
    """
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="submodule_progress_records",
        help_text="The learner confirming content review.",
    )
    submodule = models.ForeignKey(
        Submodule,
        on_delete=models.CASCADE,
        related_name="learner_progress_records",
        help_text="The submodule content reviewed.",
    )
    target_attempt_number = models.PositiveIntegerField(
        help_text="The retake attempt number this content review qualifies (e.g. 2 for Attempt #2).",
    )
    is_completed = models.BooleanField(
        default=True,
        help_text="Whether this submodule review is confirmed complete for the target attempt.",
    )
    completed_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when review completion was recorded.",
    )

    class Meta:
        ordering = ["learner", "submodule", "target_attempt_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["learner", "submodule", "target_attempt_number"],
                name="unique_learner_submodule_target_attempt",
            ),
        ]

    def __str__(self):
        return f"{self.learner.username} -> Submodule {self.submodule.name} (For Retake #{self.target_attempt_number})"


# =============================================================================
# 6. Module Feedback & Trainer Evaluation
# =============================================================================

class ModuleFeedback(models.Model):
    """
    Feedback and ratings submitted by learners upon completing a module.
    Evaluates both module content usefulness and instructor teaching quality.
    Enforces that each learner submits exactly one feedback record per module.
    """
    class UnderstandingLevel(models.TextChoices):
        ADVANCED = "ADVANCED", "Understood clearly"
        GOOD = "GOOD", "Understood some parts but needs more explanation"
        BASIC = "BASIC", "Did not understand / needs additional guidance"

    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name="feedbacks",
        help_text="The completed module being evaluated.",
    )
    learner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="module_feedbacks",
        help_text="The learner submitting the evaluation.",
    )
    trainer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="received_module_feedbacks",
        help_text="The instructor selected as having taught the module.",
    )
    module_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Module usefulness rating (1 to 5).",
    )
    trainer_rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Trainer teaching quality rating (1 to 5).",
    )
    understanding_level = models.CharField(
        max_length=20,
        choices=UnderstandingLevel.choices,
        help_text="Learner self-assessed understanding level.",
    )
    comments = models.TextField(
        help_text="Constructive written feedback comments.",
    )
    submitted_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when feedback was submitted.",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when feedback was last modified.",
    )

    class Meta:
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["module", "learner"],
                name="unique_module_learner_feedback",
            ),
        ]
        indexes = [
            models.Index(
                fields=["trainer", "-submitted_at"],
                name="core_modfdbk_trainer_sub_idx",
            ),
        ]

    def clean(self):
        if hasattr(self.learner, "role") and self.learner.role != "LEARNER":
            raise ValidationError({"learner": "Only users with the LEARNER role can submit module feedback."})
        if hasattr(self.trainer, "role") and self.trainer.role not in ("TRAINER", "ADMIN"):
            raise ValidationError({"trainer": "Only trainers or administrators can be evaluated as instructors."})
        if not self.comments or not self.comments.strip():
            raise ValidationError({"comments": "Feedback comments cannot be empty or contain only whitespace."})

    def __str__(self):
        return f"{self.learner.username} feedback on {self.module.name} (Trainer: {self.trainer.username})"


# =============================================================================
# 7. Audit Logging
# =============================================================================

class AuditLog(models.Model):
    """
    Audit log capturing significant administrative, publishing, assignment, and correction events.
    Contains no secrets, passwords, or session tokens.
    """
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=20, choices=AuditAction.choices)
    entity_type = models.CharField(max_length=100, db_index=True)
    entity_id = models.CharField(max_length=100, db_index=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Audit Log Entry"
        verbose_name_plural = "Audit Log Entries"

    def __str__(self):
        actor_name = self.actor.username if self.actor else "System"
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {actor_name} - {self.action} on {self.entity_type} #{self.entity_id}"


# =============================================================================
# 8. Admin Training Materials & File Management
# =============================================================================

class TrainingFile(models.Model):
    """
    Uploaded training files and materials managed by LMS Administrators.
    Stores raw source training documents (Word, PDF, PPTX, Images, etc.) preserving
    original nested directory paths and calculating SHA-256 checksums to prevent duplicates.
    Kept separate from learner courses, modules, and lessons.
    """
    file = models.FileField(
        upload_to=training_file_upload_path,
        validators=[validate_learning_material_file],
        help_text="Uploaded training file stored in local/cloud media storage",
    )
    filename = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Original filename (e.g. '0. About People Prime.docx')",
    )
    relative_path = models.CharField(
        max_length=500,
        blank=True,
        default="",
        db_index=True,
        help_text="Original nested directory path relative to training root (e.g. 'Full Time Hiring  VS C2H/11. Email Etiquette.pdf')",
    )
    file_type = models.CharField(
        max_length=30,
        db_index=True,
        help_text="Normalized file extension or category (e.g. 'DOCX', 'PDF', 'PNG')",
    )
    file_size = models.PositiveBigIntegerField(
        help_text="File size in bytes",
    )
    checksum = models.CharField(
        max_length=64,
        db_index=True,
        help_text="SHA-256 cryptographic digest of file contents to detect and prevent duplicates",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_training_files",
    )
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
    )

    class Meta:
        ordering = ["relative_path", "filename"]
        verbose_name = "Training Material File"
        verbose_name_plural = "Training Material Files"

    def __str__(self):
        return self.relative_path or self.filename


class TrainingCluster(models.Model):
    """
    High-level topic cluster grouping training modules and materials, optionally scoped to a course.
    E.g., 'Cluster 1: Organizational Identity & Staffing Fundamentals'.
    """
    course = models.ForeignKey(
        Course,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="training_clusters",
        help_text="Optional Course this training cluster belongs to",
    )
    name = models.CharField(
        max_length=200,
        help_text="Name of the cluster / topic area",
    )
    code = models.CharField(
        max_length=50,
        help_text="Short code for the cluster (e.g. 'CLUSTER-1')",
    )
    description = models.TextField(
        blank=True,
        help_text="Scope and description of training topics in this cluster",
    )
    order = models.PositiveIntegerField(
        default=1,
        help_text="Display order of the cluster within the course",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["course", "order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "code"],
                name="unique_cluster_code_per_course",
            ),
            models.UniqueConstraint(
                fields=["course", "order"],
                name="unique_cluster_order_per_course",
            ),
        ]

    def __str__(self):
        if self.course:
            return f"{self.course.code} - {self.code}: {self.name}"
        return f"{self.code}: {self.name}"


class DocumentCategory(models.TextChoices):
    PRIMARY_INSTRUCTIONAL = "PRIMARY_INSTRUCTIONAL", "Primary instructional document"
    SUPPLEMENTARY_REFERENCE = "SUPPLEMENTARY_REFERENCE", "Supplementary reference"
    DOWNLOADABLE_PDF = "DOWNLOADABLE_PDF", "Downloadable PDF"
    IMAGE_INFOGRAPHIC = "IMAGE_INFOGRAPHIC", "Image / infographic"
    ASSESSMENT_RUBRIC = "ASSESSMENT_RUBRIC", "Assessment / rubric"
    PRACTICAL_EXERCISE = "PRACTICAL_EXERCISE", "Practical exercise"
    UNCLASSIFIED = "UNCLASSIFIED", "Unclassified"


class TrainingFileMapping(models.Model):
    """
    Logical mapping connecting a physical TrainingFile to a Module or Lesson (Submodule),
    with optional legacy Cluster association.
    Supports M:N mapping: one file can map to multiple lessons, one lesson can contain multiple files.
    Also supports module-level documents where no specific lesson applies.
    """
    training_file = models.ForeignKey(
        TrainingFile,
        on_delete=models.CASCADE,
        related_name="curriculum_mappings",
        help_text="The physical training file being categorized and mapped",
    )
    cluster = models.ForeignKey(
        TrainingCluster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="file_mappings",
        help_text="Optional legacy topic cluster this file is classified under",
    )
    module = models.ForeignKey(
        Module,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="training_file_mappings",
        help_text="Optional module association",
    )
    submodule = models.ForeignKey(
        Submodule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="training_file_mappings",
        help_text="Optional lesson (submodule) association",
    )
    category = models.CharField(
        max_length=40,
        choices=DocumentCategory.choices,
        default=DocumentCategory.UNCLASSIFIED,
        db_index=True,
        help_text="Document pedagogical category",
    )
    notes = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional administrative notes or usage instructions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["module", "submodule", "training_file"]
        constraints = [
            models.UniqueConstraint(
                fields=["training_file", "module", "submodule"],
                condition=models.Q(submodule__isnull=False),
                name="unique_file_module_submodule_mapping",
            ),
            models.UniqueConstraint(
                fields=["training_file", "module"],
                condition=models.Q(submodule__isnull=True),
                name="unique_file_module_mapping",
            ),
        ]

    def clean(self):
        # Validate that if submodule is provided, it belongs to module
        if self.submodule and self.module and self.submodule.module_id != self.module_id:
            raise ValidationError({"submodule": "The selected lesson does not belong to the selected module."})
        # Validate course consistency only when both module and cluster specify a course
        if (
            self.module
            and self.cluster
            and self.module.course_id is not None
            and self.cluster.course_id is not None
            and self.module.course_id != self.cluster.course_id
        ):
            raise ValidationError({"module": "The selected module belongs to a different course than the cluster."})

    def __str__(self):
        loc = f"Cluster: {self.cluster.code}" if self.cluster else "No Cluster"
        if self.module:
            loc += f" -> Mod: {self.module.name}"
        if self.submodule:
            loc += f" -> Lesson: {self.submodule.order}"
        return f"{self.training_file.filename} [{self.category}] ({loc})"
