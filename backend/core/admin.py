"""
Django Admin registration for People Prime LMS domain models.
Provides structured administrative inspection and management of curriculum,
cohorts, assignments, completion questions, and audit logs.
"""

from django.contrib import admin
from core.models import (
    AuditLog,
    CandidateType,
    Course,
    GroupMembership,
    LearnerGroup,
    LearnerSubmoduleProgress,
    Module,
    ModuleAssessmentAttempt,
    ModuleFeedback,
    ModuleQuestion,
    ModuleQuestionResponse,
    Submodule,
    TrainerGroupAssignment,
    TrainingAssignment,
)


class ModuleInline(admin.TabularInline):
    model = Module
    extra = 0
    fields = ("name", "code", "order", "status", "estimated_duration_minutes")
    show_change_link = True


class SubmoduleInline(admin.TabularInline):
    model = Submodule
    extra = 0
    fields = ("name", "order", "status")
    show_change_link = True


class ModuleQuestionInline(admin.TabularInline):
    model = ModuleQuestion
    extra = 0
    fields = ("order", "question_text", "is_required", "is_active")
    show_change_link = True


class GroupMembershipInline(admin.TabularInline):
    model = GroupMembership
    extra = 0
    raw_id_fields = ("learner",)


class TrainerGroupAssignmentInline(admin.TabularInline):
    model = TrainerGroupAssignment
    extra = 0
    raw_id_fields = ("trainer",)


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "order", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "code")
    inlines = [ModuleInline]


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "course", "order", "estimated_duration_minutes", "status")
    list_filter = ("status", "course")
    search_fields = ("name", "code", "course__name")
    inlines = [SubmoduleInline, ModuleQuestionInline]


@admin.register(Submodule)
class SubmoduleAdmin(admin.ModelAdmin):
    list_display = ("name", "module", "order", "status")
    list_filter = ("status", "module__course")
    search_fields = ("name", "module__name")


@admin.register(CandidateType)
class CandidateTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "code")


@admin.register(LearnerGroup)
class LearnerGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "candidate_type", "is_active", "created_at")
    list_filter = ("candidate_type", "is_active")
    search_fields = ("name", "code")
    inlines = [GroupMembershipInline, TrainerGroupAssignmentInline]


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = ("learner", "group", "joined_at", "is_active")
    list_filter = ("group", "is_active", "joined_at")
    search_fields = ("learner__username", "learner__email", "group__name")
    raw_id_fields = ("learner",)


@admin.register(TrainerGroupAssignment)
class TrainerGroupAssignmentAdmin(admin.ModelAdmin):
    list_display = ("trainer", "group", "assigned_at", "is_active")
    list_filter = ("group", "is_active", "assigned_at")
    search_fields = ("trainer__username", "trainer__email", "group__name")
    raw_id_fields = ("trainer",)


@admin.register(TrainingAssignment)
class TrainingAssignmentAdmin(admin.ModelAdmin):
    list_display = ("__str__", "course", "module", "learner_group", "candidate_type", "learner", "assigned_by", "assigned_at", "due_date", "is_active")
    list_filter = ("is_active", "assigned_at", "due_date", "candidate_type")
    search_fields = ("course__name", "module__name", "learner_group__name", "candidate_type__name")


@admin.register(ModuleQuestion)
class ModuleQuestionAdmin(admin.ModelAdmin):
    list_display = ("module", "order", "question_text_preview", "is_required", "is_active")
    list_filter = ("is_required", "is_active", "module__course")
    search_fields = ("question_text", "module__name")

    def question_text_preview(self, obj):
        return obj.question_text[:75]
    question_text_preview.short_description = "Question Preview"


@admin.register(ModuleQuestionResponse)
class ModuleQuestionResponseAdmin(admin.ModelAdmin):
    list_display = ("learner", "question", "response_value", "submitted_at")
    list_filter = ("response_value", "submitted_at", "question__module")
    search_fields = ("learner__username", "question__question_text")
    readonly_fields = ("question", "learner", "response_value", "submitted_at", "updated_at")


@admin.register(ModuleAssessmentAttempt)
class ModuleAssessmentAttemptAdmin(admin.ModelAdmin):
    list_display = ("learner", "module", "attempt_number", "score", "total_possible", "percentage", "is_completed", "completed_at")
    list_filter = ("is_completed", "module__course")
    search_fields = ("learner__username", "module__name")
    readonly_fields = ("learner", "module", "attempt_number", "score", "total_possible", "percentage", "is_completed", "completed_at", "started_at")


@admin.register(LearnerSubmoduleProgress)
class LearnerSubmoduleProgressAdmin(admin.ModelAdmin):
    list_display = ("learner", "submodule", "target_attempt_number", "is_completed", "completed_at")
    list_filter = ("is_completed", "target_attempt_number")
    search_fields = ("learner__username", "submodule__name")
    readonly_fields = ("learner", "submodule", "target_attempt_number", "is_completed", "completed_at")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "actor", "action", "entity_type", "entity_id")
    list_filter = ("action", "entity_type", "timestamp")
    search_fields = ("entity_type", "entity_id", "actor__username")
    readonly_fields = ("actor", "action", "entity_type", "entity_id", "details", "ip_address", "timestamp")

    def has_add_permission(self, request):
        # Prevent manual creation of audit log entries through Django Admin
        return False

    def has_delete_permission(self, request, obj=None):
        # Prevent manual deletion of audit log entries through Django Admin
        return False
