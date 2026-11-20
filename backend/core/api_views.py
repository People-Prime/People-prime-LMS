"""
People Prime LMS — Phase 3 Step 2: Curriculum and Learning Material REST API Views.

Implements ModelViewSet-based REST endpoints for the full learning hierarchy
(Program → Course → Module → Submodule), LearningMaterial CRUD with publish/download
custom actions, MaterialVersion read-only endpoints, and comprehensive AuditLog writing.
"""

import hashlib
import logging
import mimetypes
import os
from collections import defaultdict
from pathlib import Path
from django.conf import settings
from django.core.exceptions import SuspiciousOperation, ValidationError
from django.db import transaction, IntegrityError
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from django.views.decorators.clickjacking import xframe_options_sameorigin

from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from core.models import (
    AuditAction,
    AuditLog,
    CandidateType,
    Course,
    CourseLevel,
    DocumentCategory,
    GroupMembership,
    LearnerGroup,
    LearnerSubmoduleProgress,
    Module,
    ModuleAssessmentAttempt,
    ModuleFeedback,
    ModuleQuestion,
    ModuleQuestionResponse,
    PublicationStatus,
    QuestionType,
    Submodule,
    TrainerGroupAssignment,
    TrainingAssignment,
    TrainingCluster,
    TrainingFile,
    TrainingFileMapping,
    Project,
    ProjectResource,
    ProjectSubmission,
    ProjectSubmissionFile,
)
from core.permissions import IsLMSAdmin
from core.audit_utils import generate_audit_description
from core.validators import sanitize_relative_path, validate_learning_material_file
from core.serializers import (
    CandidateTypeSerializer,
    CourseLevelSerializer,
    CourseSerializer,
    GroupMembershipSerializer,
    LearnerGroupSerializer,
    LearnerSubmoduleProgressSerializer,
    ModuleAssessmentAttemptSerializer,
    ModuleFeedbackSerializer,
    ModuleQuestionResponseSerializer,
    ModuleQuestionSerializer,
    ModuleSerializer,
    SubmoduleSerializer,
    TrainerGroupAssignmentSerializer,
    IndividualLearnerProgressSerializer,
    LearnerProgressOverviewSerializer,
    ModuleProgressDetailSerializer,
    TrainingAssignmentSerializer,
    AdminAuditActivitySummarySerializer,
    AdminProgressReportSerializer,
    AdminSystemOverviewSerializer,
    CohortCompletionSummarySerializer,
    AdminInProgressLearnerItemSerializer,
    AdminInProgressLearnersResponseSerializer,
    AdminTrainerAssignedGroupSerializer,
    AdminTrainerWorkloadItemSerializer,
    AdminTrainerWorkloadResponseSerializer,
    AdminTrainerListSerializer,
    AdminLearnerListSerializer,
    AdminCreateTrainerSerializer,
    AdminUpdateTrainerSerializer,
    AdminUserListSerializer,
    AdminCreateUserSerializer,
    ReportOverviewSerializer,
    ReportLearnerPerformanceItemSerializer,
    ReportCourseProgressItemSerializer,
    TrainingClusterSerializer,
    TrainingFileMappingSerializer,
    TrainingFileSerializer,
    ProjectSerializer,
    ProjectResourceSerializer,
    ProjectSubmissionSerializer,
    ProjectSubmissionFileSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------

def _log_audit(request, action, entity_type, entity_id, details=None):
    """
    Create an AuditLog record for a significant event.
    Safely handles unauthenticated actors (stores None).
    """
    AuditLog.objects.create(
        actor=request.user if request.user.is_authenticated else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        details=details or {},
        ip_address=request.META.get("REMOTE_ADDR"),
    )


# ---------------------------------------------------------------------------
# Queryset scoping helpers
# ---------------------------------------------------------------------------

def _get_role(user):
    """Return the LMS role string for *user*, or None if not set."""
    return getattr(user, "role", None)


def _get_active_learner_assignments(user):
    """Return active TrainingAssignments applying to *user* (LEARNER)."""
    active_groups = LearnerGroup.objects.filter(
        memberships__learner=user,
        memberships__is_active=True,
        is_active=True,
    )
    active_candidate_types = CandidateType.objects.filter(
        learner_groups__in=active_groups,
        is_active=True,
    )
    return TrainingAssignment.objects.filter(
        is_active=True,
    ).filter(
        Q(learner_group__in=active_groups) |
        Q(candidate_type__in=active_candidate_types) |
        Q(learner=user)
    )


def _get_active_trainer_assignments(user):
    """Return active TrainingAssignments applying to *user* (TRAINER)."""
    trainer_groups = LearnerGroup.objects.filter(
        trainer_assignments__trainer=user,
        trainer_assignments__is_active=True,
        is_active=True,
    )
    trainer_candidate_types = CandidateType.objects.filter(
        learner_groups__in=trainer_groups,
        is_active=True,
    )
    return TrainingAssignment.objects.filter(
        is_active=True,
    ).filter(
        Q(learner_group__in=trainer_groups) |
        Q(candidate_type__in=trainer_candidate_types)
    )


def _get_curriculum_targets(assignments):
    """
    Given an assignments queryset, compute:
    1. assigned_crs_ids: courses directly assigned
    2. assigned_mod_ids: modules directly assigned
    3. all_accessible_course_ids: assigned_crs_ids UNION parent courses of assigned levels/modules
    4. assigned_level_ids: levels directly assigned (returned in tuple slot 1)

    Returns a 5-tuple (kept for caller compatibility):
        (set(), assigned_level_ids, assigned_crs_ids, assigned_mod_ids, all_accessible_course_ids)
    Only the exact assigned level IDs are returned; no other levels are implied.
    """
    assigned_crs_ids = set(assignments.filter(
        course__isnull=False
    ).values_list("course_id", flat=True))

    assigned_level_ids = set(assignments.filter(
        level__isnull=False
    ).values_list("level_id", flat=True))

    assigned_mod_ids = set(assignments.filter(
        module__isnull=False
    ).values_list("module_id", flat=True))

    # Parent courses (where present) of directly assigned modules and levels
    mod_course_ids = set(Module.objects.filter(
        id__in=assigned_mod_ids, course__isnull=False
    ).values_list("course_id", flat=True))
    level_course_ids = set(CourseLevel.objects.filter(
        id__in=assigned_level_ids, course__isnull=False
    ).values_list("course_id", flat=True))

    all_accessible_course_ids = assigned_crs_ids.union(mod_course_ids, level_course_ids)
    return set(), assigned_level_ids, assigned_crs_ids, assigned_mod_ids, all_accessible_course_ids


def _scope_course_qs(user):
    """
    Return a Course queryset scoped by role and active training assignments.
    - ADMIN: all courses (DRAFT, PUBLISHED, ARCHIVED)
    - TRAINER: all PUBLISHED courses (can read all admin-published courses regardless of group assignment)
    - LEARNER: PUBLISHED courses directly assigned or containing assigned modules
    """
    role = _get_role(user)
    if role == User.Role.ADMIN:
        return Course.objects.all()

    if role == User.Role.TRAINER:
        return Course.objects.filter(status=PublicationStatus.PUBLISHED).distinct()

    if role == User.Role.LEARNER:
        assignments = _get_active_learner_assignments(user)
        _, _, _, _, all_accessible_course_ids = _get_curriculum_targets(assignments)
        return Course.objects.filter(
            status=PublicationStatus.PUBLISHED
        ).filter(
            id__in=all_accessible_course_ids
        ).distinct()

    return Course.objects.none()


def _scope_level_qs(user):
    """
    Return a CourseLevel queryset scoped by role and active training assignments.
    - ADMIN: all CourseLevels
    - TRAINER: CourseLevels associated with PUBLISHED courses, or independent CourseLevels
      (course is None) containing at least one PUBLISHED module
    - LEARNER: CourseLevels explicitly assigned, belonging to directly assigned PUBLISHED courses,
      or containing directly assigned PUBLISHED modules (without granting sibling levels)
    """
    role = _get_role(user)
    if role == User.Role.ADMIN:
        return CourseLevel.objects.all()

    if role == User.Role.TRAINER:
        return CourseLevel.objects.filter(
            Q(course__status=PublicationStatus.PUBLISHED) |
            Q(course__isnull=True, modules__status=PublicationStatus.PUBLISHED)
        ).distinct()

    if role == User.Role.LEARNER:
        assignments = _get_active_learner_assignments(user)
        _, assigned_level_ids, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)
        published_mod_level_ids = set(
            Module.objects.filter(
                id__in=assigned_mod_ids,
                status=PublicationStatus.PUBLISHED,
            ).filter(
                Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED)
            ).values_list("level_id", flat=True)
        )
        return CourseLevel.objects.filter(
            Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED)
        ).filter(
            Q(course_id__in=assigned_crs_ids) |
            Q(id__in=assigned_level_ids) |
            Q(id__in=published_mod_level_ids)
        ).distinct()

    return CourseLevel.objects.none()


def _scope_module_qs(user):
    """
    Return a Module queryset scoped by role and active training assignments.
    - ADMIN: all modules
    - TRAINER: all PUBLISHED modules within PUBLISHED courses or independent levels
    - LEARNER: PUBLISHED modules in assigned courses, levels, or directly assigned
    """
    role = _get_role(user)
    if role == User.Role.ADMIN:
        return Module.objects.all()

    if role == User.Role.TRAINER:
        return Module.objects.filter(
            status=PublicationStatus.PUBLISHED,
        ).filter(
            Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED)
        ).filter(
            Q(level__course__isnull=True) | Q(level__course__status=PublicationStatus.PUBLISHED)
        ).distinct()

    if role == User.Role.LEARNER:
        assignments = _get_active_learner_assignments(user)
        _, assigned_level_ids, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)
        return Module.objects.filter(
            status=PublicationStatus.PUBLISHED
        ).filter(
            Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED)
        ).filter(
            Q(level__course__isnull=True) | Q(level__course__status=PublicationStatus.PUBLISHED)
        ).filter(
            Q(course_id__in=assigned_crs_ids) |
            Q(level_id__in=assigned_level_ids) |
            Q(id__in=assigned_mod_ids)
        ).distinct()

    return Module.objects.none()


def _scope_submodule_qs(user):
    """
    Return a Submodule queryset scoped by role and active training assignments.
    - ADMIN: all submodules
    - TRAINER: all PUBLISHED submodules within PUBLISHED modules & courses/independent levels
    - LEARNER: PUBLISHED submodules in assigned courses, levels, or modules
    """
    role = _get_role(user)
    if role == User.Role.ADMIN:
        return Submodule.objects.all()

    if role == User.Role.TRAINER:
        return Submodule.objects.filter(
            status=PublicationStatus.PUBLISHED,
            module__status=PublicationStatus.PUBLISHED,
        ).filter(
            Q(module__course__isnull=True) | Q(module__course__status=PublicationStatus.PUBLISHED)
        ).filter(
            Q(module__level__course__isnull=True) | Q(module__level__course__status=PublicationStatus.PUBLISHED)
        ).distinct()

    if role == User.Role.LEARNER:
        assignments = _get_active_learner_assignments(user)
        _, assigned_level_ids, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)
        return Submodule.objects.filter(
            status=PublicationStatus.PUBLISHED,
            module__status=PublicationStatus.PUBLISHED,
        ).filter(
            Q(module__course__isnull=True) | Q(module__course__status=PublicationStatus.PUBLISHED)
        ).filter(
            Q(module__level__course__isnull=True) | Q(module__level__course__status=PublicationStatus.PUBLISHED)
        ).filter(
            Q(module__course_id__in=assigned_crs_ids) |
            Q(module__level_id__in=assigned_level_ids) |
            Q(module_id__in=assigned_mod_ids)
        ).distinct()

    return Submodule.objects.none()


# ---------------------------------------------------------------------------
# A. Curriculum ViewSets
# ---------------------------------------------------------------------------

class CourseViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for Course entities.

    Permission matrix:
      list / retrieve  -> any authenticated user (role-scoped queryset)
      create / update / partial_update / destroy -> ADMIN only
    """
    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _scope_course_qs(self.request.user)

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = serializer.save(created_by=request.user)
        _log_audit(
            request,
            AuditAction.CREATE,
            "Course",
            course.pk,
            {"name": course.name, "code": course.code},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        old_status = instance.status

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data.get("status", old_status)
        is_publishing = (old_status == PublicationStatus.DRAFT and new_status == PublicationStatus.PUBLISHED)

        if is_publishing:
            with transaction.atomic():
                course = serializer.save()
                # Cascade publishing to all DRAFT modules and submodules
                draft_modules = Module.objects.filter(course=course, status=PublicationStatus.DRAFT)
                draft_module_ids = list(draft_modules.values_list("id", flat=True))
                draft_submodules = Submodule.objects.filter(
                    module__course=course,
                    status=PublicationStatus.DRAFT
                )
                draft_submodule_ids = list(draft_submodules.values_list("id", flat=True))

                modules_published_count = draft_modules.update(status=PublicationStatus.PUBLISHED)
                submodules_published_count = draft_submodules.update(status=PublicationStatus.PUBLISHED)

                _log_audit(
                    request,
                    AuditAction.PUBLISH,
                    "Course",
                    course.pk,
                    {
                        "name": course.name,
                        "code": course.code,
                        "cascaded_modules_count": modules_published_count,
                        "cascaded_submodules_count": submodules_published_count,
                        "module_ids": draft_module_ids,
                        "submodule_ids": draft_submodule_ids,
                    },
                )
        else:
            course = serializer.save()
            action_type = AuditAction.PUBLISH if (old_status != PublicationStatus.PUBLISHED and new_status == PublicationStatus.PUBLISHED) else (
                AuditAction.ARCHIVE if (old_status != PublicationStatus.ARCHIVED and new_status == PublicationStatus.ARCHIVED) else AuditAction.UPDATE
            )
            _log_audit(
                request,
                action_type,
                "Course",
                course.pk,
                {"name": course.name, "code": course.code, "status": course.status},
            )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=["get", "post"], url_path="publish-content")
    def publish_content(self, request, pk=None):
        """
        Synchronize / publish all remaining DRAFT modules and submodules for a course.
        - GET: preview / impact summary of DRAFT content that will be published.
        - POST: execute cascade publish within an atomic transaction.
        Preserves already PUBLISHED and ARCHIVED content.
        Requires ADMIN permissions.
        """
        self._require_admin()
        instance = self.get_object()

        try:
            draft_modules = Module.objects.filter(course=instance, status=PublicationStatus.DRAFT)
            draft_module_ids = list(draft_modules.values_list("id", flat=True))
            draft_submodules = Submodule.objects.filter(
                module__course=instance,
                status=PublicationStatus.DRAFT
            )
            draft_submodule_ids = list(draft_submodules.values_list("id", flat=True))

            already_published_modules = Module.objects.filter(course=instance, status=PublicationStatus.PUBLISHED).count()
            already_published_submodules = Submodule.objects.filter(module__course=instance, status=PublicationStatus.PUBLISHED).count()

            archived_modules = Module.objects.filter(course=instance, status=PublicationStatus.ARCHIVED).count()
            archived_submodules = Submodule.objects.filter(module__course=instance, status=PublicationStatus.ARCHIVED).count()

            if request.method == "GET":
                return Response({
                    "course_id": instance.id,
                    "course_name": instance.name,
                    "course_status": instance.status,
                    "draft_modules_count": len(draft_module_ids),
                    "draft_submodules_count": len(draft_submodule_ids),
                    "already_published_modules_count": already_published_modules,
                    "already_published_submodules_count": already_published_submodules,
                    "archived_modules_count": archived_modules,
                    "archived_submodules_count": archived_submodules,
                    "can_publish": (len(draft_module_ids) > 0 or len(draft_submodule_ids) > 0 or instance.status == PublicationStatus.DRAFT),
                }, status=status.HTTP_200_OK)

            # POST: Execute atomic publish
            with transaction.atomic():
                locked_course = Course.objects.select_for_update().get(pk=instance.pk)

                # Ensure course itself is PUBLISHED
                if locked_course.status == PublicationStatus.DRAFT:
                    locked_course.status = PublicationStatus.PUBLISHED
                    locked_course.save(update_fields=["status", "updated_at"])

                # Bulk update draft modules and submodules
                mods_updated = draft_modules.update(status=PublicationStatus.PUBLISHED)
                subms_updated = draft_submodules.update(status=PublicationStatus.PUBLISHED)

                _log_audit(
                    request,
                    AuditAction.PUBLISH,
                    "Course",
                    locked_course.pk,
                    {
                        "action": "publish_all_course_content",
                        "course_name": locked_course.name,
                        "modules_published_count": mods_updated,
                        "submodules_published_count": subms_updated,
                        "module_ids": draft_module_ids,
                        "submodule_ids": draft_submodule_ids,
                    },
                )

            return Response({
                "message": f"Successfully published {mods_updated} modules and {subms_updated} submodules for '{instance.name}'.",
                "course_id": instance.id,
                "course_status": PublicationStatus.PUBLISHED,
                "modules_published_count": mods_updated,
                "submodules_published_count": subms_updated,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Failed to publish content for Course ID %s: %s", instance.pk, str(e))
            return Response(
                {"error": "Failed to publish course content due to an internal server error."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()

        if instance.status == PublicationStatus.ARCHIVED:
            return Response(
                {"error": "Archived courses cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                locked_course = Course.objects.select_for_update().get(pk=instance.pk)
                _log_audit(
                    request,
                    AuditAction.DELETE,
                    "Course",
                    locked_course.pk,
                    {
                        "name": locked_course.name,
                        "code": locked_course.code,
                        "status": locked_course.status,
                    },
                )
                locked_course.delete()
        except Course.DoesNotExist:
            return Response(
                {"error": "Course not found or already deleted."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.exception("Unexpected error occurred while deleting Course ID %s: %s", instance.pk, str(e))
            return Response(
                {"error": "Failed to delete course due to an internal server error. Please try again or contact system administration."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="deletion-impact")
    def deletion_impact(self, request, pk=None):
        """
        Calculates and returns dependency impact metrics for course deletion confirmation dialog.
        Requires ADMIN permissions.
        """
        self._require_admin()
        instance = self.get_object()

        modules_count = Module.objects.filter(course=instance).count()
        assignments_count = TrainingAssignment.objects.filter(
            Q(course=instance) | Q(module__course=instance)
        ).count()
        questions_count = ModuleQuestion.objects.filter(module__course=instance).count()
        attempts_count = ModuleAssessmentAttempt.objects.filter(module__course=instance).count()
        responses_count = ModuleQuestionResponse.objects.filter(
            Q(attempt__module__course=instance) | Q(question__module__course=instance)
        ).distinct().count()
        feedback_count = ModuleFeedback.objects.filter(module__course=instance).count()
        clusters_count = TrainingCluster.objects.filter(course=instance).count()

        return Response({
            "course_id": instance.id,
            "name": instance.name,
            "code": instance.code,
            "status": instance.status,
            "modules_count": modules_count,
            "assignments_count": assignments_count,
            "questions_count": questions_count,
            "attempts_count": attempts_count,
            "responses_count": responses_count,
            "feedback_count": feedback_count,
            "clusters_count": clusters_count,
        }, status=status.HTTP_200_OK)





def _cleanup_unreferenced_training_files(training_file_ids):
    """
    Given a collection of TrainingFile IDs that were previously referenced by deleted mappings,
    checks if each file has any remaining references in TrainingFileMapping LMS-wide.
    If no references remain, deletes the TrainingFile DB record and removes the physical file from disk.
    Never deletes shared files that are still referenced elsewhere.
    """
    for tf_id in set(training_file_ids):
        if not tf_id:
            continue
        try:
            # Check if referenced anywhere else
            has_other_mappings = TrainingFileMapping.objects.filter(training_file_id=tf_id).exists()
            if not has_other_mappings:
                try:
                    tf = TrainingFile.objects.get(pk=tf_id)
                    file_storage_name = tf.file.name if tf.file else None
                    tf.delete()
                    if file_storage_name and tf.file and tf.file.storage:
                        try:
                            if tf.file.storage.exists(file_storage_name):
                                tf.file.storage.delete(file_storage_name)
                                logger.info("Permanently removed unreferenced training file from storage: %s", file_storage_name)
                        except Exception as storage_err:
                            logger.warning("Could not delete unreferenced file from storage at '%s': %s", file_storage_name, str(storage_err))
                except TrainingFile.DoesNotExist:
                    pass
        except Exception as e:
            logger.warning("Error checking or cleaning unreferenced TrainingFile %s: %s", tf_id, str(e))


def _delete_module_and_cascade(module, request=None):
    """
    Permanently deletes a module and all its associated records:
    - submodules
    - associated assessment questions & responses
    - assessment attempts
    - learner progress records
    - feedback and ratings
    - training file mappings
    - physical training files that are not referenced elsewhere.
    Works for ANY status: DRAFT, PUBLISHED, ARCHIVED, In Progress, or Completed.
    """
    module_id = module.pk
    module_name = module.name
    course_id = module.course_id

    # 1. Collect all TrainingFile IDs mapped to this module or its submodules
    associated_submodule_ids = list(Submodule.objects.filter(module=module).values_list("id", flat=True))
    file_ids = list(TrainingFileMapping.objects.filter(
        Q(module=module) | Q(submodule_id__in=associated_submodule_ids)
    ).values_list("training_file_id", flat=True).distinct())

    with transaction.atomic():
        # Log audit if request provided
        if request:
            _log_audit(
                request,
                AuditAction.DELETE,
                "Module",
                module_id,
                {
                    "name": module_name,
                    "course": course_id,
                    "status": module.status,
                },
            )
        # Delete mappings directly
        TrainingFileMapping.objects.filter(
            Q(module=module) | Q(submodule_id__in=associated_submodule_ids)
        ).delete()

        # Delete the module (Django cascades submodules, questions, attempts, responses, progress, feedback, assignments)
        module.delete()

    # 2. Safely clean up unreferenced physical training files after DB commit
    _cleanup_unreferenced_training_files(file_ids)


class CourseLevelViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for CourseLevel entities (e.g., Level 1, Level 2, Level 3).

    Permission matrix:
      list / retrieve  → Authenticated users scoped to accessible courses
      create / update / partial_update / destroy → ADMIN only
    """
    serializer_class = CourseLevelSerializer
    permission_classes = [IsAuthenticated]

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def get_queryset(self):
        qs = _scope_level_qs(self.request.user)

        course_id = self.request.query_params.get("course") or self.request.query_params.get("course_id")
        if course_id:
            qs = qs.filter(course_id=course_id)

        return qs.select_related("course").order_by("order", "id")

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        level = serializer.save()
        _log_audit(
            request,
            AuditAction.CREATE,
            "CourseLevel",
            level.pk,
            {"name": level.name, "course": level.course_id, "order": level.order},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        level = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "CourseLevel",
            level.pk,
            {"name": level.name, "course": level.course_id, "order": level.order},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Permanently deletes a CourseLevel and all its associated modules, submodules,
        content, questions, attempts, responses, progress, feedback, and unreferenced files.
        Works regardless of level status, published modules, or learner enrollments.
        """
        self._require_admin()
        instance = self.get_object()

        level_name = instance.name
        level_id = instance.id
        course_id = instance.course_id

        # Cascade delete all modules assigned to this level
        modules_in_level = list(instance.modules.all())
        for m in modules_in_level:
            _delete_module_and_cascade(m, request=request)

        _log_audit(
            request,
            AuditAction.DELETE,
            "CourseLevel",
            level_id,
            {
                "name": level_name,
                "course": course_id,
                "cascaded_modules_count": len(modules_in_level),
            },
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModuleViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for Module entities.

    Permission matrix:
      list / retrieve  → any authenticated user (role-scoped queryset)
      create / update / partial_update / destroy → ADMIN only
    """
    serializer_class = ModuleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = _scope_module_qs(self.request.user)
        level_id = self.request.query_params.get("level") or self.request.query_params.get("level_id")
        if level_id:
            qs = qs.filter(level_id=level_id)
        return qs

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        module = serializer.save(created_by=request.user)
        _log_audit(
            request,
            AuditAction.CREATE,
            "Module",
            module.pk,
            {"name": module.name, "course": module.course_id},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        module = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "Module",
            module.pk,
            {"name": module.name},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Permanently deletes a module and all its associated records:
        submodules, questions, attempts, responses, progress, feedback, assignments,
        and unreferenced physical files. Works for Draft, Published, Active, and Completed content.
        """
        self._require_admin()
        instance = self.get_object()

        try:
            _delete_module_and_cascade(instance, request=request)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            logger.exception("Unexpected error occurred while deleting Module ID %s: %s", instance.pk, str(e))
            return Response(
                {"error": f"Failed to permanently delete module: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"], url_path="deletion-impact")
    def deletion_impact(self, request, pk=None):
        """
        Calculates and returns dependency impact metrics for module deletion confirmation dialog.
        Requires ADMIN permissions.
        """
        self._require_admin()
        instance = self.get_object()

        submodules_count = Submodule.objects.filter(module=instance).count()
        assignments_count = TrainingAssignment.objects.filter(module=instance).count()
        questions_count = ModuleQuestion.objects.filter(module=instance).count()
        attempts_count = ModuleAssessmentAttempt.objects.filter(module=instance).count()
        responses_count = ModuleQuestionResponse.objects.filter(
            Q(attempt__module=instance) | Q(question__module=instance)
        ).distinct().count()
        feedback_count = ModuleFeedback.objects.filter(module=instance).count()
        materials_mappings_count = TrainingFileMapping.objects.filter(module=instance).count()
        progress_count = LearnerSubmoduleProgress.objects.filter(submodule__module=instance).count()

        course_name = (
            instance.course.name
            if instance.course
            else (instance.level.name if instance.level else "Independent Curriculum")
        )

        return Response({
            "module_id": instance.id,
            "name": instance.name,
            "status": instance.status,
            "course_id": instance.course_id,
            "course_name": course_name,
            "level_id": instance.level_id,
            "level_name": instance.level.name if instance.level else None,
            "submodules_count": submodules_count,
            "assignments_count": assignments_count,
            "questions_count": questions_count,
            "attempts_count": attempts_count,
            "responses_count": responses_count,
            "feedback_count": feedback_count,
            "materials_mappings_count": materials_mappings_count,
            "progress_count": progress_count,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="total-count")
    def total_count(self, request):
        """
        Return the dynamic, LMS-wide total count of modules present in the database.
        Accessible to all authenticated users (Admin, Trainer, Learner) for consistent dashboard display.
        """
        total = Module.objects.count()
        return Response({"total_modules": total})

    @action(detail=False, methods=["post"], url_path="insert")
    def insert_module(self, request):
        """
        Inserts one or more modules at a specified position within a Level / Course:
        - "beginning": inserted as the first module(s)
        - "before": inserted right before reference_module_id
        - "after": inserted right after reference_module_id
        - "end": appended at the end of the level
        Supports single insertion and bulk insertion (via `items` list).
        Supports optional association with existing `TrainingFile` records via `training_file_id`.
        Atomically shifts sequence orders using collision-free 2-phase resequencing.
        Logs audit events for each created module and mapping.
        """
        self._require_admin()
        data = request.data
        course_id = data.get("course") or data.get("course_id")
        level_id = data.get("level") or data.get("level_id")
        position = data.get("position", "end") # "beginning" | "before" | "after" | "end"
        ref_module_id = data.get("reference_module_id")

        # Determine if single or bulk insertion
        items = data.get("items")
        if not items or not isinstance(items, list):
            # Single item payload fallback
            name = data.get("name", "").strip()
            description = data.get("description", "").strip()
            raw_duration = data.get("estimated_duration_minutes")
            try:
                duration = max(0, int(raw_duration)) if raw_duration is not None and str(raw_duration).strip() != "" else 0
            except (ValueError, TypeError):
                duration = 0
            status_val = data.get("status", PublicationStatus.DRAFT)
            training_file_id = data.get("training_file_id")

            if not name:
                return Response(
                    {"error": "Module Name is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            items = [{
                "name": name,
                "description": description,
                "estimated_duration_minutes": duration,
                "status": status_val,
                "training_file_id": training_file_id,
            }]
        else:
            # Validate items list
            if len(items) == 0:
                return Response(
                    {"error": "At least one module item is required for insertion."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            for idx, it in enumerate(items):
                if not it.get("name", "").strip():
                    return Response(
                        {"error": f"Module name is required for item #{idx + 1}."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        if not course_id and not level_id:
            return Response(
                {"error": "Level (or Course) is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        course = None
        if course_id:
            try:
                course = Course.objects.get(pk=course_id)
            except Course.DoesNotExist:
                return Response({"error": "Selected Course does not exist."}, status=status.HTTP_404_NOT_FOUND)

        level = None
        if level_id:
            try:
                level = CourseLevel.objects.get(pk=level_id)
            except CourseLevel.DoesNotExist:
                return Response({"error": "Selected Level does not exist."}, status=status.HTTP_404_NOT_FOUND)
            if course and level.course_id and level.course_id != course.id:
                return Response({"error": "Selected Level does not exist in this course."}, status=status.HTTP_404_NOT_FOUND)

        # Pre-validate all training_file_ids
        tf_ids = [it.get("training_file_id") for it in items if it.get("training_file_id")]
        tf_map = {}
        if tf_ids:
            found_tfs = TrainingFile.objects.filter(id__in=tf_ids)
            tf_map = {tf.id: tf for tf in found_tfs}
            for fid in tf_ids:
                if fid not in tf_map:
                    return Response(
                        {"error": f"The selected training material (ID: {fid}) does not exist."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        k = len(items)

        with transaction.atomic():
            scope_qs = Module.objects.filter(course=course) if course else Module.objects.filter(level=level)
            course_modules = list(scope_qs.order_by("order", "id"))

            # Determine level subset if level provided
            level_modules = [m for m in course_modules if m.level_id == (level.id if level else None)]

            target_order = 1
            if position == "beginning":
                if level_modules:
                    target_order = level_modules[0].order
                elif course_modules:
                    target_order = course_modules[0].order
                else:
                    target_order = 1

            elif position == "before" and ref_module_id:
                try:
                    ref_mod = scope_qs.get(pk=ref_module_id)
                    target_order = ref_mod.order
                except Module.DoesNotExist:
                    target_order = 1

            elif position == "after" and ref_module_id:
                try:
                    ref_mod = scope_qs.get(pk=ref_module_id)
                    target_order = ref_mod.order + 1
                except Module.DoesNotExist:
                    target_order = (course_modules[-1].order + 1) if course_modules else 1

            else: # "end"
                if level_modules:
                    target_order = level_modules[-1].order + 1
                elif course_modules:
                    target_order = course_modules[-1].order + 1
                else:
                    target_order = 1

            # Step 1: Temporarily shift all modules with order >= target_order by +100000 to avoid unique constraint collisions
            modules_to_shift = scope_qs.filter(order__gte=target_order).order_by("-order")
            for m in modules_to_shift:
                m.order = m.order + 100000
                m.save(update_fields=["order"])

            created_modules = []
            created_mappings = []

            # Step 2: Create new module(s) sequentially at target_order + idx
            for idx, item in enumerate(items):
                item_name = item.get("name", "").strip()
                item_desc = item.get("description", "").strip()
                raw_dur = item.get("estimated_duration_minutes")
                try:
                    item_dur = max(0, int(raw_dur)) if raw_dur is not None and str(raw_dur).strip() != "" else 0
                except (ValueError, TypeError):
                    item_dur = 0
                item_status = item.get("status", PublicationStatus.DRAFT)
                item_tf_id = item.get("training_file_id")
                item_tf = tf_map.get(item_tf_id) if item_tf_id else None

                new_mod = Module.objects.create(
                    course=course,
                    level=level,
                    name=item_name,
                    description=item_desc,
                    order=target_order + idx,
                    estimated_duration_minutes=item_dur,
                    status=item_status,
                    created_by=request.user,
                )
                created_modules.append(new_mod)

                # Step 3: Link TrainingFile if selected
                if item_tf:
                    cluster = None
                    existing_mapping = (
                        TrainingFileMapping.objects.filter(training_file=item_tf)
                        .exclude(cluster__isnull=True)
                        .first()
                    )
                    if existing_mapping and existing_mapping.cluster:
                        cluster = existing_mapping.cluster
                    elif course:
                        cluster = TrainingCluster.objects.filter(course=course).first()

                    if not cluster:
                        cluster = TrainingCluster.objects.filter(code__iexact="CLUSTER-1").first()

                    mapping, _ = TrainingFileMapping.objects.get_or_create(
                        training_file=item_tf,
                        module=new_mod,
                        submodule=None,
                        defaults={
                            "cluster": cluster,
                            "category": DocumentCategory.PRIMARY_INSTRUCTIONAL,
                            "notes": f"Inserted from repository for module: {new_mod.name}",
                        },
                    )
                    created_mappings.append(mapping)

                    _log_audit(
                        request,
                        AuditAction.CREATE,
                        "TrainingFileMapping",
                        mapping.pk,
                        {
                            "training_file_id": item_tf.id,
                            "training_file_name": item_tf.filename,
                            "module_id": new_mod.id,
                            "module_name": new_mod.name,
                        },
                    )

                _log_audit(
                    request,
                    AuditAction.CREATE,
                    "Module",
                    new_mod.pk,
                    {"name": new_mod.name, "order": new_mod.order, "level": level.id if level else None},
                )

            # Step 4: Shift shifted modules back by (order - 100000 + k)
            for m in scope_qs.filter(order__gte=100000).order_by("order"):
                m.order = (m.order - 100000) + k
                m.save(update_fields=["order"])

            if len(created_modules) == 1:
                serializer = self.get_serializer(created_modules[0])
                data_resp = serializer.data
                data_resp["created_count"] = 1
                return Response(data_resp, status=status.HTTP_201_CREATED)
            else:
                serializer = self.get_serializer(created_modules, many=True)
                return Response({
                    "created_count": len(created_modules),
                    "modules": serializer.data,
                    "mappings_count": len(created_mappings),
                    "message": f"Successfully created {len(created_modules)} module(s).",
                }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder_modules(self, request):
        """
        Reorder modules within a level or course.
        Receives an array of module IDs in their new desired order:
        { "level_id": <int>, "module_ids": [<int>, <int>, ...] }
        Atomically updates the orders while preserving global unique ordering.
        """
        self._require_admin()
        data = request.data
        module_ids = data.get("module_ids", [])
        level_id = data.get("level_id")

        if not module_ids or not isinstance(module_ids, list):
            return Response({"error": "A list of 'module_ids' is required."}, status=status.HTTP_400_BAD_REQUEST)

        modules_to_reorder = list(Module.objects.filter(id__in=module_ids))
        if len(modules_to_reorder) != len(module_ids):
            return Response({"error": "One or more module IDs could not be found."}, status=status.HTTP_400_BAD_REQUEST)

        course = modules_to_reorder[0].course
        audit_target_id = course.pk if course else (level_id or modules_to_reorder[0].level_id)

        with transaction.atomic():
            # Get the existing order slots occupied by these modules in this level/course
            # Sort original modules by their current order to preserve the numeric slot range
            current_slots = sorted([m.order for m in modules_to_reorder])

            # Map the new order of module_ids to these exact current slots
            # Move all to temporary safe offset first (+200000) to prevent unique constraint conflicts
            for m in modules_to_reorder:
                m.order = m.order + 200000
                m.save(update_fields=["order"])

            # Reassign each module according to the requested index
            for idx, mod_id in enumerate(module_ids):
                m = next(item for item in modules_to_reorder if item.id == mod_id)
                assigned_order = current_slots[idx]
                m.order = assigned_order
                m.save(update_fields=["order"])

            _log_audit(
                request,
                AuditAction.UPDATE,
                "Module",
                audit_target_id,
                {"action": "REORDER_MODULES", "reordered_ids": module_ids},
            )

        return Response({"message": "Modules reordered successfully.", "module_ids": module_ids}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="upload-content")
    def upload_content(self, request, pk=None):
        """
        Directly uploads a file (Word, PDF, PPTX, image, etc.) and attaches it to this module.
        Optionally links to a specific submodule if 'submodule_id' is supplied.
        Automatically manages TrainingFile creation and TrainingFileMapping connection.
        """
        self._require_admin()
        module = self.get_object()
        file_obj = request.FILES.get("file") or request.FILES.get("files")
        if not file_obj:
            return Response({"error": "No content file was uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        submodule_id = request.data.get("submodule_id")
        valid_categories = {c[0] for c in TrainingFileMapping._meta.get_field("category").choices}
        raw_cat = request.data.get("category", "PRIMARY_INSTRUCTIONAL")
        category = raw_cat if raw_cat in valid_categories else "PRIMARY_INSTRUCTIONAL"
        notes = request.data.get("notes", "").strip()

        submodule = None
        if submodule_id:
            try:
                submodule = Submodule.objects.get(pk=submodule_id, module=module)
            except Submodule.DoesNotExist:
                return Response({"error": "The specified lesson does not belong to this module."}, status=status.HTTP_404_NOT_FOUND)

        # Compute SHA-256
        sha256 = hashlib.sha256()
        for chunk in file_obj.chunks():
            sha256.update(chunk)
        digest = sha256.hexdigest()
        file_size = file_obj.size
        orig_filename = file_obj.name

        ext = os.path.splitext(orig_filename)[1].lstrip(".").upper() or "DOCX"

        with transaction.atomic():
            # Resolve target TrainingCluster deterministically before creating TrainingFile
            explicit_cluster_id = request.data.get("cluster_id") or request.data.get("cluster")
            target_course = module.course or (module.level.course if module.level_id and module.level else None)

            cluster = None
            if explicit_cluster_id:
                try:
                    cluster_qs = TrainingCluster.objects.filter(pk=int(explicit_cluster_id))
                    if target_course is not None:
                        cluster_qs = cluster_qs.filter(course=target_course)
                    else:
                        cluster_qs = cluster_qs.filter(code__iexact="CLUSTER-1")
                    cluster = cluster_qs.get()
                except (ValueError, TypeError, TrainingCluster.DoesNotExist):
                    return Response(
                        {"error": "The specified training cluster does not exist or is not valid for this module."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            elif target_course is not None:
                c1_matches = list(
                    TrainingCluster.objects.filter(course=target_course, code__iexact="CLUSTER-1").order_by("id")[:2]
                )
                if len(c1_matches) == 1:
                    cluster = c1_matches[0]
                elif len(c1_matches) > 1:
                    return Response(
                        {"error": "Multiple 'CLUSTER-1' records exist for this course; please specify a valid 'cluster_id'."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    code_for_course = f"CLUSTER-{target_course.id}"
                    code_matches = list(
                        TrainingCluster.objects.filter(course=target_course, code__iexact=code_for_course).order_by("id")[:2]
                    )
                    order_matches = list(
                        TrainingCluster.objects.filter(course=target_course, order=1).order_by("id")[:2]
                    )
                    if len(code_matches) == 1:
                        cluster = code_matches[0]
                    elif len(code_matches) > 1:
                        return Response(
                            {"error": "Multiple matching clusters exist for this course; please specify a valid 'cluster_id'."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    elif len(order_matches) == 1:
                        cluster = order_matches[0]
                    elif len(order_matches) > 1:
                        return Response(
                            {"error": "Multiple order=1 clusters exist for this course; please specify a valid 'cluster_id'."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    elif TrainingCluster.objects.filter(course=target_course).exists():
                        return Response(
                            {"error": "Existing non-default cluster(s) found for this course; please specify an explicit 'cluster_id'."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    else:
                        cluster, _ = TrainingCluster.objects.get_or_create(
                            course=target_course,
                            code=code_for_course,
                            defaults={
                                "name": f"{target_course.name} - General Materials",
                                "order": 1,
                            },
                        )
            else:
                # Course-less module (module.course is None and module.level.course is None):
                # Preserve existing CLUSTER-1 association deterministically; do not invent clusters.
                c1_matches = list(TrainingCluster.objects.filter(code__iexact="CLUSTER-1").order_by("id")[:2])
                if len(c1_matches) == 1:
                    cluster = c1_matches[0]
                elif len(c1_matches) > 1:
                    return Response(
                        {"error": "Multiple 'CLUSTER-1' records exist; please specify a valid 'cluster_id'."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return Response(
                        {"error": "Cannot upload content for a course-less module because 'CLUSTER-1' does not exist."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # Check if TrainingFile with identical checksum already exists to reuse physical storage
            tf = TrainingFile.objects.filter(checksum=digest).first()
            if not tf:
                tf = TrainingFile.objects.create(
                    file=file_obj,
                    filename=orig_filename,
                    relative_path=orig_filename,
                    file_type=ext,
                    file_size=file_size,
                    checksum=digest,
                    uploaded_by=request.user,
                )

            # Create or update mapping
            mapping, created = TrainingFileMapping.objects.get_or_create(
                training_file=tf,
                cluster=cluster,
                module=module,
                submodule=submodule,
                defaults={"category": category, "notes": notes},
            )
            if not created:
                mapping.category = category
                if notes:
                    mapping.notes = notes
                mapping.save(update_fields=["category", "notes"])

            _log_audit(
                request,
                AuditAction.CREATE if created else AuditAction.UPDATE,
                "TrainingFileMapping",
                mapping.pk,
                {"filename": orig_filename, "module_id": module.pk, "submodule_id": submodule.pk if submodule else None},
            )

        return Response({
            "message": f"Content '{orig_filename}' uploaded and attached successfully.",
            "file_id": tf.id,
            "filename": tf.filename,
            "mapping_id": mapping.id,
            "cluster_id": cluster.id,
            "cluster_code": cluster.code,
            "module_id": module.id,
            "submodule_id": submodule.id if submodule else None,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='materials')
    def materials(self, request, pk=None):
        """
        Returns the attached training documents mapped directly or via submodules to this module.
        Restricted to users who have role-scoped access to this module:
        - ADMIN / TRAINER
        - LEARNER with an active assignment to the course/module.
        Never exposes server filesystem paths.
        Assessment answer keys (e.g. TrainingFiles #12 and #35) are protected and strictly hidden.
        """
        module = self.get_object()
        user_role = _get_role(request.user)
        if module.status != PublicationStatus.PUBLISHED and user_role == User.Role.LEARNER:
            return Response(
                {"error": "Materials are only available for published modules."},
                status=status.HTTP_404_NOT_FOUND,
            )

        mappings = TrainingFileMapping.objects.filter(
            module=module
        ).select_related("training_file").order_by("category", "training_file__filename")

        # Security restriction: Non-admin users (Trainers and Learners) must never access assessment answer-key documents
        PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}
        if user_role != User.Role.ADMIN:
            mappings = [
                m for m in mappings
                if m.training_file_id not in PROTECTED_MCQ_ANSWER_KEY_FILE_IDS
                and not (
                    "18. Assessment - Recruitment Process_ Multiple Choice" in (m.training_file.filename if m.training_file else "")
                )
            ]

        # Deduplicate files while preserving category and metadata
        seen_files = set()
        results = []
        for m in mappings:
            tf = m.training_file
            if not tf or tf.id in seen_files:
                continue
            seen_files.add(tf.id)
            results.append({
                "mapping_id": m.id,
                "file_id": tf.id,
                "filename": tf.filename,
                "file_type": tf.file_type,
                "file_size": tf.file_size,
                "category": m.category,
                "notes": m.notes,
                "download_url": f"/api/modules/{module.id}/download-material/{tf.id}/",
            })

        return Response(results, status=status.HTTP_200_OK)

    @xframe_options_sameorigin
    @action(detail=True, methods=['get'], url_path=r'download-material/(?P<file_id>[^/.]+)')
    def download_material(self, request, pk=None, file_id=None):
        """
        Secure inline viewing endpoint for training materials attached to a module.
        Verifies:
        1. Requesting user has access to this module via _scope_module_qs.
        2. Module is PUBLISHED (or requester is Admin/Trainer).
        3. The requested file is legitimately mapped to this module.
        4. Learners and Trainers are STRICTLY RESTRICTED to inline viewing only.
           Direct raw download requests (?inline=false or download queries) by Learners/Trainers return 403 Forbidden.
        5. Assessment answer keys (TrainingFiles #12 and #35) are strictly denied for Trainers and Learners.
        6. Only explicitly approved safe MIME types (PDF, PNG, JPG, WEBP, GIF, MP4, WEBM, MP3, WAV, TXT)
           are served with Content-Disposition: inline. SVG, HTML, and unsupported formats return 400.
        Never exposes filesystem path or allows access to unmapped files.
        """
        module = self.get_object()
        user_role = _get_role(request.user)
        if module.status != PublicationStatus.PUBLISHED and user_role == User.Role.LEARNER:
            raise Http404("Document not found or module not published.")

        # Role-based download restriction:
        # All users (Admin, Trainer, Learner) are restricted to inline viewing only.
        # Direct file / attachment downloads (?download=true or ?inline=false) are blocked for EVERYONE.
        is_explicit_download = request.query_params.get("download", "").lower() in ("true", "1", "yes") or (
            request.query_params.get("inline", "").lower() in ("false", "0", "no")
        )
        if is_explicit_download:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Direct file downloads are disabled across the LMS. Only inline viewing is permitted.")

        try:
            target_file_id = int(file_id)
        except (ValueError, TypeError):
            raise Http404("Invalid file identifier.")

        # Security restriction: Non-admin users (Trainers and Learners) are denied access to assessment answer keys
        PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}
        if user_role != User.Role.ADMIN:
            if target_file_id in PROTECTED_MCQ_ANSWER_KEY_FILE_IDS:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Access to assessment answer keys is restricted.")

        # Ensure requested file is actively mapped to this module
        mapping = TrainingFileMapping.objects.filter(
            module=module,
            training_file_id=target_file_id,
        ).select_related("training_file").first()

        if not mapping or not mapping.training_file:
            raise Http404("The requested training material is not attached to this module.")

        tf = mapping.training_file

        # Additional filename check against answer key exposure
        if user_role != User.Role.ADMIN:
            if "18. Assessment - Recruitment Process_ Multiple Choice" in tf.filename:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Access to assessment answer keys is restricted.")
        # Verify file existence via storage or disk
        if not tf.file:
            raise Http404("The physical file was not found on server storage.")
        try:
            if not tf.file.storage.exists(tf.file.name):
                raise Http404("The physical file was not found on server storage.")
        except Exception:
            pass

        content_type, _ = mimetypes.guess_type(tf.filename)
        content_type = (content_type or "application/octet-stream").lower()

        # Strict allowlist of safe viewable MIME types
        SAFE_INLINE_MIMES = {
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/ogg",
            "text/plain",
        }

        # Check if file is DOCX for read-only preview conversion
        is_docx = (
            (tf.file_type and tf.file_type.upper() in ["DOCX", "DOC"])
            or tf.filename.lower().endswith(".docx")
            or content_type in [
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
            ]
        )

        if is_docx:
            from core.document_preview import get_or_create_docx_preview
            try:
                preview_pdf_path = get_or_create_docx_preview(tf)
                preview_file_size = os.path.getsize(preview_pdf_path)
                preview_filename = os.path.splitext(tf.filename)[0] + ".pdf"
                response = FileResponse(
                    open(preview_pdf_path, "rb"),
                    content_type="application/pdf",
                )
                response["Content-Disposition"] = f'inline; filename="{preview_filename}"'
                response["Content-Length"] = preview_file_size
                response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
                response["X-Content-Type-Options"] = "nosniff"
                response["X-Frame-Options"] = "SAMEORIGIN"
                return response
            except Exception as e:
                logger.error("DOCX preview generation error for training file %s: %s", tf.id, e)
                return Response(
                    {
                        "error": "Failed to generate read-only document preview.",
                        "filename": tf.filename,
                        "file_type": tf.file_type,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # Block any attempt to download or fall back to attachment
        if content_type not in SAFE_INLINE_MIMES:
            return Response(
                {
                    "error": "Preview is not available for this file format, and file downloads are disabled.",
                    "filename": tf.filename,
                    "file_type": tf.file_type,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = FileResponse(
            tf.file.open("rb"),
            content_type=content_type,
        )
        response["Content-Disposition"] = f'inline; filename="{tf.filename}"'
        response["Content-Length"] = tf.file_size
        response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class SubmoduleViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for Submodule entities.

    Permission matrix:
      list / retrieve  → any authenticated user (role-scoped queryset)
      create / update / partial_update / destroy → ADMIN only

    Note: Submodule has no `created_by` field (do not inject one).
    """
    serializer_class = SubmoduleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _scope_submodule_qs(self.request.user)

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submodule = serializer.save()
        _log_audit(
            request,
            AuditAction.CREATE,
            "Submodule",
            submodule.pk,
            {"name": submodule.name, "module": submodule.module_id},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        submodule = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "Submodule",
            submodule.pk,
            {"name": submodule.name},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()
        if instance.status != PublicationStatus.DRAFT:
            return Response(
                {"error": "Only DRAFT submodules can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _log_audit(
            request,
            AuditAction.DELETE,
            "Submodule",
            instance.pk,
            {"name": instance.name},
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='record-open')
    def record_open(self, request, pk=None):
        """
        Records that the learner has opened a published submodule's content for the upcoming retake.
        This sets an in-progress LearnerSubmoduleProgress record (is_completed=False).
        The learner can subsequently confirm completion via complete_for_retake.
        """
        role = _get_role(request.user)
        if role != User.Role.LEARNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only learners may record submodule viewing for retakes.')

        submodule = self.get_object()

        if submodule.status != PublicationStatus.PUBLISHED:
            return Response(
                {'error': 'Only published submodules can be opened for retake review.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        module = submodule.module
        if not _scope_module_qs(request.user).filter(pk=module.pk).exists():
            return Response(
                {'error': 'You are not authorized for this module.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        latest_attempt = ModuleAssessmentAttempt.objects.filter(
            module=module,
            learner=request.user,
        ).order_by('-attempt_number').first()

        if not latest_attempt:
            return Response(
                {'error': 'Initial assessment attempt has not been taken yet. Submodule review is only required for retakes.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not latest_attempt.is_completed:
            return Response(
                {'error': f'Current Attempt #{latest_attempt.attempt_number} is still in progress. Complete it before preparing for a retake.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_attempt_number = latest_attempt.attempt_number + 1

        # Retrieve or create progress record for this target attempt
        progress = LearnerSubmoduleProgress.objects.filter(
            learner=request.user,
            submodule=submodule,
            target_attempt_number=target_attempt_number,
        ).first()

        if not progress:
            progress = LearnerSubmoduleProgress.objects.create(
                learner=request.user,
                submodule=submodule,
                target_attempt_number=target_attempt_number,
                is_completed=False,
            )
            created = True
        else:
            created = False

        _log_audit(
            request,
            AuditAction.CREATE if created else AuditAction.UPDATE,
            'LearnerSubmoduleProgress',
            progress.pk,
            {
                'submodule_id': submodule.id,
                'module_id': module.id,
                'target_attempt_number': target_attempt_number,
                'opened': True,
                'is_completed': progress.is_completed,
            },
        )

        return Response(
            LearnerSubmoduleProgressSerializer(progress).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], url_path='materials')
    def materials(self, request, pk=None):
        """
        Returns the attached training documents mapped to this submodule.
        Restricted to users who have role-scoped access to this published submodule:
        - ADMIN / TRAINER
        - LEARNER with an active assignment to the course/module containing this submodule.
        Never exposes server filesystem paths.
        Assessment answer keys (e.g. TrainingFiles #12 and #35 for Module 9 Submodule 35)
        are protected and strictly hidden from Learners and Trainers.
        """
        submodule = self.get_object()
        user_role = _get_role(request.user)
        if submodule.status != PublicationStatus.PUBLISHED and user_role == User.Role.LEARNER:
            return Response(
                {"error": "Materials are only available for published lessons."},
                status=status.HTTP_404_NOT_FOUND,
            )

        mappings = TrainingFileMapping.objects.filter(
            submodule=submodule
        ).select_related("training_file").order_by("category", "training_file__filename")

        # Security restriction: Non-admin users (Trainers and Learners) must never access assessment answer-key documents
        PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}
        if user_role != User.Role.ADMIN:
            mappings = [
                m for m in mappings
                if m.training_file_id not in PROTECTED_MCQ_ANSWER_KEY_FILE_IDS
                and not (
                    m.submodule_id == 35
                    and "18. Assessment - Recruitment Process_ Multiple Choice" in (m.training_file.filename if m.training_file else "")
                )
            ]

        results = []
        for m in mappings:
            tf = m.training_file
            results.append({
                "mapping_id": m.id,
                "file_id": tf.id,
                "filename": tf.filename,
                "file_type": tf.file_type,
                "file_size": tf.file_size,
                "category": m.category,
                "notes": m.notes,
                "download_url": f"/api/submodules/{submodule.id}/download-material/{tf.id}/",
            })

        return Response(results, status=status.HTTP_200_OK)

    @xframe_options_sameorigin
    @action(detail=True, methods=['get'], url_path=r'download-material/(?P<file_id>[^/.]+)')
    def download_material(self, request, pk=None, file_id=None):
        """
        Secure inline viewing endpoint for training materials attached to a submodule.
        Verifies:
        1. Requesting user has access to this submodule via _scope_submodule_qs.
        2. Submodule is PUBLISHED (or requester is Admin/Trainer).
        3. The requested file is legitimately mapped to this submodule.
        4. Learners and Trainers are STRICTLY RESTRICTED to inline viewing only.
           Direct raw download requests (?inline=false or download queries) by Learners/Trainers return 403 Forbidden.
        5. Assessment answer keys (TrainingFiles #12 and #35) are strictly denied for Trainers and Learners.
        6. Only explicitly approved safe MIME types (PDF, PNG, JPG, WEBP, GIF, MP4, WEBM, MP3, WAV, TXT)
           are served with Content-Disposition: inline. SVG, HTML, and unsupported formats return 400.
        Never exposes filesystem path or allows access to unmapped files.
        """
        submodule = self.get_object()
        user_role = _get_role(request.user)
        if submodule.status != PublicationStatus.PUBLISHED and user_role == User.Role.LEARNER:
            raise Http404("Document not found or lesson not published.")

        # Role-based download restriction:
        # All users (Admin, Trainer, Learner) are restricted to inline viewing only.
        # Direct file / attachment downloads (?download=true or ?inline=false) are blocked for EVERYONE.
        is_explicit_download = request.query_params.get("download", "").lower() in ("true", "1", "yes") or (
            request.query_params.get("inline", "").lower() in ("false", "0", "no")
        )
        if is_explicit_download:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Direct file downloads are disabled across the LMS. Only inline viewing is permitted.")

        try:
            target_file_id = int(file_id)
        except (ValueError, TypeError):
            raise Http404("Invalid file identifier.")

        # Security restriction: Non-admin users (Trainers and Learners) are denied access to assessment answer keys
        PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}
        if user_role != User.Role.ADMIN:
            if target_file_id in PROTECTED_MCQ_ANSWER_KEY_FILE_IDS or (
                submodule.id == 35 and target_file_id in {12, 35}
            ):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Access to assessment answer keys is restricted.")

        # Ensure requested file is actively mapped to this submodule
        mapping = TrainingFileMapping.objects.filter(
            submodule=submodule,
            training_file_id=target_file_id,
        ).select_related("training_file").first()

        if not mapping or not mapping.training_file:
            raise Http404("The requested training material is not attached to this lesson.")

        tf = mapping.training_file

        # Additional filename check against answer key exposure
        if user_role != User.Role.ADMIN:
            if "18. Assessment - Recruitment Process_ Multiple Choice" in tf.filename:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Access to assessment answer keys is restricted.")
        # Verify file existence via storage or disk
        if not tf.file:
            raise Http404("The physical file was not found on server storage.")
        try:
            if not tf.file.storage.exists(tf.file.name):
                raise Http404("The physical file was not found on server storage.")
        except Exception:
            pass

        content_type, _ = mimetypes.guess_type(tf.filename)
        content_type = (content_type or "application/octet-stream").lower()

        # Strict allowlist of safe viewable MIME types - SVG, HTML, and executables are excluded
        SAFE_INLINE_MIMES = {
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/ogg",
            "text/plain",
        }

        # Check if file is DOCX for read-only preview conversion
        is_docx = (
            (tf.file_type and tf.file_type.upper() in ["DOCX", "DOC"])
            or tf.filename.lower().endswith(".docx")
            or content_type in [
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
            ]
        )

        if is_docx:
            from core.document_preview import get_or_create_docx_preview
            try:
                preview_pdf_path = get_or_create_docx_preview(tf)
                preview_file_size = os.path.getsize(preview_pdf_path)
                preview_filename = os.path.splitext(tf.filename)[0] + ".pdf"
                response = FileResponse(
                    open(preview_pdf_path, "rb"),
                    content_type="application/pdf",
                )
                response["Content-Disposition"] = f'inline; filename="{preview_filename}"'
                response["Content-Length"] = preview_file_size
                response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
                response["X-Content-Type-Options"] = "nosniff"
                response["X-Frame-Options"] = "SAMEORIGIN"
                return response
            except Exception as e:
                logger.error("DOCX preview generation error for training file %s: %s", tf.id, e)
                return Response(
                    {
                        "error": "Failed to generate read-only document preview.",
                        "filename": tf.filename,
                        "file_type": tf.file_type,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # Block any attempt to download or fall back to attachment
        # Only safe inline previewing is permitted
        if content_type not in SAFE_INLINE_MIMES:
            return Response(
                {
                    "error": "Preview is not available for this file format, and file downloads are disabled.",
                    "filename": tf.filename,
                    "file_type": tf.file_type,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = FileResponse(
            tf.file.open("rb"),
            content_type=content_type,
        )
        response["Content-Disposition"] = f'inline; filename="{tf.filename}"'
        response["Content-Length"] = tf.file_size
        response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=True, methods=['post'], url_path='complete-for-retake')
    def complete_for_retake(self, request, pk=None):
        """
        Marks a published submodule as reviewed/completed for an upcoming assessment retake.
        Learners must review all published submodules in the module before starting Attempt #2, #3, etc.
        """
        role = _get_role(request.user)
        if role != User.Role.LEARNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only learners may mark submodules as reviewed for retakes.')

        submodule = self.get_object()

        if submodule.status != PublicationStatus.PUBLISHED:
            return Response(
                {'error': 'Only published submodules can be marked as reviewed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Confirm module assignment
        module = submodule.module
        if not _scope_module_qs(request.user).filter(pk=module.pk).exists():
            return Response(
                {'error': 'You are not authorized for this module.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check latest attempt
        latest_attempt = ModuleAssessmentAttempt.objects.filter(
            module=module,
            learner=request.user,
        ).order_by('-attempt_number').first()

        if not latest_attempt:
            return Response(
                {'error': 'Initial assessment attempt has not been taken yet. Submodule review is only required for retakes.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not latest_attempt.is_completed:
            return Response(
                {'error': f'Current Attempt #{latest_attempt.attempt_number} is still in progress. Complete it before preparing for a retake.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_attempt_number = latest_attempt.attempt_number + 1

        # Enforce that the submodule has been opened/viewed first
        existing_progress = LearnerSubmoduleProgress.objects.filter(
            learner=request.user,
            submodule=submodule,
            target_attempt_number=target_attempt_number,
        ).first()

        if not existing_progress:
            return Response(
                {'error': 'You must open and view the submodule learning content before marking it as reviewed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone
        existing_progress.is_completed = True
        existing_progress.completed_at = timezone.now()
        existing_progress.save()
        progress = existing_progress
        created = False

        _log_audit(
            request,
            AuditAction.UPDATE if not created else AuditAction.CREATE,
            'LearnerSubmoduleProgress',
            progress.pk,
            {
                'submodule_id': submodule.id,
                'module_id': module.id,
                'target_attempt_number': target_attempt_number,
                'is_completed': True,
            },
        )

        return Response(
            LearnerSubmoduleProgressSerializer(progress).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], url_path='materials')
    def materials(self, request, pk=None):
        """
        Returns the attached training documents mapped to this submodule.
        Restricted to users who have role-scoped access to this published submodule:
        - ADMIN / TRAINER
        - LEARNER with an active assignment to the course/module containing this submodule.
        Never exposes server filesystem paths.
        Assessment answer keys (e.g. TrainingFiles #12 and #35 for Module 9 Submodule 35)
        are protected and strictly hidden from Learners and Trainers.
        """
        submodule = self.get_object()
        user_role = _get_role(request.user)
        if submodule.status != PublicationStatus.PUBLISHED and user_role == User.Role.LEARNER:
            return Response(
                {"error": "Materials are only available for published lessons."},
                status=status.HTTP_404_NOT_FOUND,
            )

        mappings = TrainingFileMapping.objects.filter(
            submodule=submodule
        ).select_related("training_file").order_by("category", "training_file__filename")

        # Security restriction: Non-admin users (Trainers and Learners) must never access assessment answer-key documents
        PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}
        if user_role != User.Role.ADMIN:
            mappings = [
                m for m in mappings
                if m.training_file_id not in PROTECTED_MCQ_ANSWER_KEY_FILE_IDS
                and not (
                    m.submodule_id == 35
                    and "18. Assessment - Recruitment Process_ Multiple Choice" in (m.training_file.filename if m.training_file else "")
                )
            ]

        results = []
        for m in mappings:
            tf = m.training_file
            results.append({
                "mapping_id": m.id,
                "file_id": tf.id,
                "filename": tf.filename,
                "file_type": tf.file_type,
                "file_size": tf.file_size,
                "category": m.category,
                "notes": m.notes,
                "download_url": f"/api/submodules/{submodule.id}/download-material/{tf.id}/",
            })

        return Response(results, status=status.HTTP_200_OK)

    @xframe_options_sameorigin
    @action(detail=True, methods=['get'], url_path=r'download-material/(?P<file_id>[^/.]+)')
    def download_material(self, request, pk=None, file_id=None):
        """
        Secure inline viewing endpoint for training materials attached to a submodule.
        Verifies:
        1. Requesting user has access to this submodule via _scope_submodule_qs.
        2. Submodule is PUBLISHED (or requester is Admin/Trainer).
        3. The requested file is legitimately mapped to this submodule.
        4. Learners and Trainers are STRICTLY RESTRICTED to inline viewing only.
           Direct raw download requests (?inline=false or download queries) by Learners/Trainers return 403 Forbidden.
        5. Assessment answer keys (TrainingFiles #12 and #35) are strictly denied for Trainers and Learners.
        6. Only explicitly approved safe MIME types (PDF, PNG, JPG, WEBP, GIF, MP4, WEBM, MP3, WAV, TXT)
           are served with Content-Disposition: inline. SVG, HTML, and unsupported formats return 400.
        Never exposes filesystem path or allows access to unmapped files.
        """
        submodule = self.get_object()
        user_role = _get_role(request.user)
        if submodule.status != PublicationStatus.PUBLISHED and user_role == User.Role.LEARNER:
            raise Http404("Document not found or lesson not published.")

        # Role-based download restriction:
        # All users (Admin, Trainer, Learner) are restricted to inline viewing only.
        # Direct file / attachment downloads (?download=true or ?inline=false) are blocked for EVERYONE.
        is_explicit_download = request.query_params.get("download", "").lower() in ("true", "1", "yes") or (
            request.query_params.get("inline", "").lower() in ("false", "0", "no")
        )
        if is_explicit_download:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Direct file downloads are disabled across the LMS. Only inline viewing is permitted.")

        try:
            target_file_id = int(file_id)
        except (ValueError, TypeError):
            raise Http404("Invalid file identifier.")

        # Security restriction: Non-admin users (Trainers and Learners) are denied access to assessment answer keys
        PROTECTED_MCQ_ANSWER_KEY_FILE_IDS = {12, 35}
        if user_role != User.Role.ADMIN:
            if target_file_id in PROTECTED_MCQ_ANSWER_KEY_FILE_IDS or (
                submodule.id == 35 and target_file_id in {12, 35}
            ):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Access to assessment answer keys is restricted.")

        # Ensure requested file is actively mapped to this submodule
        mapping = TrainingFileMapping.objects.filter(
            submodule=submodule,
            training_file_id=target_file_id,
        ).select_related("training_file").first()

        if not mapping or not mapping.training_file:
            raise Http404("The requested training material is not attached to this lesson.")

        tf = mapping.training_file

        # Additional filename check against answer key exposure
        if user_role != User.Role.ADMIN:
            if "18. Assessment - Recruitment Process_ Multiple Choice" in tf.filename:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Access to assessment answer keys is restricted.")
        # Verify file existence via storage or disk
        if not tf.file:
            raise Http404("The physical file was not found on server storage.")
        try:
            if not tf.file.storage.exists(tf.file.name):
                raise Http404("The physical file was not found on server storage.")
        except Exception:
            pass

        content_type, _ = mimetypes.guess_type(tf.filename)
        content_type = (content_type or "application/octet-stream").lower()

        # Strict allowlist of safe viewable MIME types - SVG, HTML, and executables are excluded
        SAFE_INLINE_MIMES = {
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/ogg",
            "text/plain",
        }

        # Check if file is DOCX for read-only preview conversion
        is_docx = (
            (tf.file_type and tf.file_type.upper() in ["DOCX", "DOC"])
            or tf.filename.lower().endswith(".docx")
            or content_type in [
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
            ]
        )

        if is_docx:
            from core.document_preview import get_or_create_docx_preview
            try:
                preview_pdf_path = get_or_create_docx_preview(tf)
                preview_file_size = os.path.getsize(preview_pdf_path)
                preview_filename = os.path.splitext(tf.filename)[0] + ".pdf"
                response = FileResponse(
                    open(preview_pdf_path, "rb"),
                    content_type="application/pdf",
                )
                response["Content-Disposition"] = f'inline; filename="{preview_filename}"'
                response["Content-Length"] = preview_file_size
                response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
                response["X-Content-Type-Options"] = "nosniff"
                response["X-Frame-Options"] = "SAMEORIGIN"
                return response
            except Exception as e:
                logger.error("DOCX preview generation error for training file %s: %s", tf.id, e)
                return Response(
                    {
                        "error": "Failed to generate read-only document preview.",
                        "filename": tf.filename,
                        "file_type": tf.file_type,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # Block any attempt to download or fall back to attachment
        # Only safe inline previewing is permitted
        if content_type not in SAFE_INLINE_MIMES:
            return Response(
                {
                    "error": "Preview is not available for this file format, and file downloads are disabled.",
                    "filename": tf.filename,
                    "file_type": tf.file_type,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = FileResponse(
            tf.file.open("rb"),
            content_type=content_type,
        )
        response["Content-Disposition"] = f'inline; filename="{tf.filename}"'
        response["Content-Length"] = tf.file_size
        response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        response["X-Content-Type-Options"] = "nosniff"
        return response


# ---------------------------------------------------------------------------
# B. Cohorts, Learner Groups, & Training Assignment ViewSets (Phase 3 Step 3.3)
# ---------------------------------------------------------------------------

class CandidateTypeViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for CandidateType classifications.
    - list / retrieve:
      - Admin: all candidate types
      - Trainer: candidate types of groups they actively manage
      - Learner: candidate types of groups they actively belong to
    - create / update / destroy: Admin only
    """
    serializer_class = CandidateTypeSerializer
    permission_classes = [IsAuthenticated]

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role == User.Role.ADMIN:
            return CandidateType.objects.all()

        if role == User.Role.TRAINER:
            trainer_groups = LearnerGroup.objects.filter(
                trainer_assignments__trainer=self.request.user,
                trainer_assignments__is_active=True,
                is_active=True,
            )
            return CandidateType.objects.filter(
                learner_groups__in=trainer_groups,
                is_active=True,
            ).distinct()

        if role == User.Role.LEARNER:
            learner_groups = LearnerGroup.objects.filter(
                memberships__learner=self.request.user,
                memberships__is_active=True,
                is_active=True,
            )
            return CandidateType.objects.filter(
                learner_groups__in=learner_groups,
                is_active=True,
            ).distinct()

        return CandidateType.objects.none()

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.CREATE,
            "CandidateType",
            instance.pk,
            {"name": instance.name, "code": instance.code},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "CandidateType",
            instance.pk,
            {"name": instance.name, "code": instance.code},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()
        _log_audit(
            request,
            AuditAction.DELETE,
            "CandidateType",
            instance.pk,
            {"name": instance.name, "code": instance.code},
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LearnerGroupViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for LearnerGroup cohorts.
    - list / retrieve:
      - Admin: all learner groups
      - Trainer: groups actively managed by the trainer
      - Learner: groups the learner actively belongs to
    - create / update / destroy: Admin only
    """
    serializer_class = LearnerGroupSerializer
    permission_classes = [IsAuthenticated]

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role == User.Role.ADMIN:
            qs = LearnerGroup.objects.all()
        elif role == User.Role.TRAINER:
            qs = LearnerGroup.objects.filter(
                trainer_assignments__trainer=self.request.user,
                trainer_assignments__is_active=True,
                is_active=True,
            ).distinct()
        elif role == User.Role.LEARNER:
            qs = LearnerGroup.objects.filter(
                memberships__learner=self.request.user,
                memberships__is_active=True,
                is_active=True,
            ).distinct()
        else:
            qs = LearnerGroup.objects.none()

        candidate_type = self.request.query_params.get("candidate_type")
        if candidate_type:
            qs = qs.filter(candidate_type_id=candidate_type)
        return qs

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.CREATE,
            "LearnerGroup",
            instance.pk,
            {"name": instance.name, "code": instance.code, "candidate_type": instance.candidate_type_id},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "LearnerGroup",
            instance.pk,
            {"name": instance.name, "code": instance.code},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()
        _log_audit(
            request,
            AuditAction.DELETE,
            "LearnerGroup",
            instance.pk,
            {"name": instance.name, "code": instance.code},
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupMembershipViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for managing learner memberships in LearnerGroups.
    - list / retrieve:
      - Admin: all memberships
      - Trainer: memberships in groups actively managed by the trainer
      - Learner: only their own active memberships
    - create / update / destroy: Admin only
    """
    serializer_class = GroupMembershipSerializer
    permission_classes = [IsAuthenticated]

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role == User.Role.ADMIN:
            qs = GroupMembership.objects.all()
        elif role == User.Role.TRAINER:
            qs = GroupMembership.objects.filter(
                group__trainer_assignments__trainer=self.request.user,
                group__trainer_assignments__is_active=True,
                group__is_active=True,
            ).distinct()
        elif role == User.Role.LEARNER:
            qs = GroupMembership.objects.filter(
                learner=self.request.user,
                is_active=True,
            ).distinct()
        else:
            qs = GroupMembership.objects.none()

        group_id = self.request.query_params.get("group")
        if group_id:
            qs = qs.filter(group_id=group_id)
        learner_id = self.request.query_params.get("learner")
        if learner_id:
            qs = qs.filter(learner_id=learner_id)
        return qs

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.ASSIGN,
            "GroupMembership",
            instance.pk,
            {"group": instance.group_id, "learner": instance.learner_id},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "GroupMembership",
            instance.pk,
            {"group": instance.group_id, "learner": instance.learner_id, "is_active": instance.is_active},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()
        _log_audit(
            request,
            AuditAction.DELETE,
            "GroupMembership",
            instance.pk,
            {"group": instance.group_id, "learner": instance.learner_id},
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrainerGroupAssignmentViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for assigning trainers to LearnerGroups.
    - list / retrieve:
      - Admin: all trainer group assignments
      - Trainer: assignments for groups actively managed by the trainer
      - Learner: trainer assignments for groups the learner actively belongs to
    - create / update / destroy: Admin only
    """
    serializer_class = TrainerGroupAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role == User.Role.ADMIN:
            qs = TrainerGroupAssignment.objects.all()
        elif role == User.Role.TRAINER:
            qs = TrainerGroupAssignment.objects.filter(
                group__trainer_assignments__trainer=self.request.user,
                group__trainer_assignments__is_active=True,
                group__is_active=True,
            ).distinct()
        elif role == User.Role.LEARNER:
            qs = TrainerGroupAssignment.objects.filter(
                group__memberships__learner=self.request.user,
                group__memberships__is_active=True,
                group__is_active=True,
                is_active=True,
            ).select_related("group", "trainer").distinct()
        else:
            qs = TrainerGroupAssignment.objects.none()

        group_id = self.request.query_params.get("group")
        if group_id:
            qs = qs.filter(group_id=group_id)
        trainer_id = self.request.query_params.get("trainer")
        if trainer_id:
            qs = qs.filter(trainer_id=trainer_id)
        return qs.select_related("group", "trainer")

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.ASSIGN,
            "TrainerGroupAssignment",
            instance.pk,
            {"group": instance.group_id, "trainer": instance.trainer_id},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "TrainerGroupAssignment",
            instance.pk,
            {"group": instance.group_id, "trainer": instance.trainer_id, "is_active": instance.is_active},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()
        _log_audit(
            request,
            AuditAction.DELETE,
            "TrainerGroupAssignment",
            instance.pk,
            {"group": instance.group_id, "trainer": instance.trainer_id},
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrainingAssignmentViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for TrainingAssignment records (curriculum -> recipient cohort).
    - list / retrieve:
      - Admin: all training assignments
      - Trainer: assignments for groups actively managed by trainer
      - Learner: assignments for groups the learner actively belongs to
    - create / update / destroy: Admin only
    """
    serializer_class = TrainingAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def get_queryset(self):
        role = _get_role(self.request.user)
        if role == User.Role.ADMIN:
            qs = TrainingAssignment.objects.all()
        elif role == User.Role.TRAINER:
            trainer_groups = LearnerGroup.objects.filter(
                trainer_assignments__trainer=self.request.user,
                trainer_assignments__is_active=True,
                is_active=True,
            )
            trainer_candidate_types = CandidateType.objects.filter(
                learner_groups__in=trainer_groups,
                is_active=True,
            )
            qs = TrainingAssignment.objects.filter(is_active=True).filter(
                Q(learner_group__in=trainer_groups) |
                Q(candidate_type__in=trainer_candidate_types)
            ).distinct()
        elif role == User.Role.LEARNER:
            learner_groups = LearnerGroup.objects.filter(
                memberships__learner=self.request.user,
                memberships__is_active=True,
                is_active=True,
            )
            learner_candidate_types = CandidateType.objects.filter(
                learner_groups__in=learner_groups,
                is_active=True,
            )
            qs = TrainingAssignment.objects.filter(is_active=True).filter(
                Q(learner_group__in=learner_groups) |
                Q(candidate_type__in=learner_candidate_types) |
                Q(learner=self.request.user)
            ).distinct()
        else:
            qs = TrainingAssignment.objects.none()

        course_id = self.request.query_params.get("course")
        if course_id:
            qs = qs.filter(course_id=course_id)
        group_id = self.request.query_params.get("learner_group")
        if group_id:
            qs = qs.filter(learner_group_id=group_id)
        candidate_type_id = self.request.query_params.get("candidate_type")
        if candidate_type_id:
            qs = qs.filter(candidate_type_id=candidate_type_id)
        module_id = self.request.query_params.get("module")
        if module_id:
            qs = qs.filter(module_id=module_id)
        learner_id = self.request.query_params.get("learner")
        if learner_id:
            qs = qs.filter(learner_id=learner_id)
        return qs

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Server-controlled assigned_by
        instance = serializer.save(assigned_by=request.user)
        _log_audit(
            request,
            AuditAction.ASSIGN,
            "TrainingAssignment",
            instance.pk,
            {
                "course": instance.course_id,
                "module": instance.module_id,
                "learner_group": instance.learner_group_id,
                "candidate_type": instance.candidate_type_id,
                "learner": instance.learner_id,
            },
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "TrainingAssignment",
            instance.pk,
            {
                "course": instance.course_id,
                "module": instance.module_id,
                "learner_group": instance.learner_group_id,
                "candidate_type": instance.candidate_type_id,
                "learner": instance.learner_id,
                "is_active": instance.is_active,
            },
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()
        _log_audit(
            request,
            AuditAction.DELETE,
            "TrainingAssignment",
            instance.pk,
            {
                "course": instance.course_id,
                "module": instance.module_id,
                "learner_group": instance.learner_group_id,
                "candidate_type": instance.candidate_type_id,
            },
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# =============================================================================
# 11. Module Completion Questions & Learner Responses ViewSets
# =============================================================================

class ModuleQuestionViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for ModuleQuestion (required Yes/No completion confirmation questions).

    Access control:
    - ADMIN: Full CRUD.
    - TRAINER: Read-only, scoped to modules in active assigned groups (PUBLISHED + DRAFT).
    - LEARNER: Read-only, scoped to active assigned modules (PUBLISHED only).

    Filter parameters:
    - ?module=<module_id>
    - ?is_required=true/false
    - ?is_active=true/false
    """
    serializer_class = ModuleQuestionSerializer
    permission_classes = [IsAuthenticated]

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only administrators may perform this action.")

    def get_queryset(self):
        user = self.request.user
        role = _get_role(user)

        if role == User.Role.ADMIN:
            qs = ModuleQuestion.objects.all()
        elif role == User.Role.TRAINER:
            accessible_modules = _scope_module_qs(user)
            qs = ModuleQuestion.objects.filter(module__in=accessible_modules)
        elif role == User.Role.LEARNER:
            accessible_modules = _scope_module_qs(user)
            qs = ModuleQuestion.objects.filter(module__in=accessible_modules, is_active=True)
        else:
            return ModuleQuestion.objects.none()

        module_id = self.request.query_params.get("module")
        if module_id:
            qs = qs.filter(module_id=module_id)

        is_required = self.request.query_params.get("is_required")
        if is_required is not None:
            if is_required.lower() in ("true", "1"):
                qs = qs.filter(is_required=True)
            elif is_required.lower() in ("false", "0"):
                qs = qs.filter(is_required=False)

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            if is_active.lower() in ("true", "1"):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ("false", "0"):
                qs = qs.filter(is_active=False)

        return qs.select_related("module")

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.CREATE,
            "ModuleQuestion",
            instance.pk,
            {
                "module": instance.module_id,
                "order": instance.order,
                "is_required": instance.is_required,
                "is_active": instance.is_active,
            },
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        _log_audit(
            request,
            AuditAction.UPDATE,
            "ModuleQuestion",
            instance.pk,
            {
                "module": instance.module_id,
                "order": instance.order,
                "is_required": instance.is_required,
                "is_active": instance.is_active,
            },
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()
        _log_audit(
            request,
            AuditAction.DELETE,
            "ModuleQuestion",
            instance.pk,
            {
                "module": instance.module_id,
                "order": instance.order,
            },
        )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModuleQuestionResponseViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ModuleQuestionResponse.

    Security & Business Rules:
    - Submission (POST) is strictly limited to users with role='LEARNER'.
    - Ownership is strictly bound to request.user on the server; client-supplied learner is ignored/validated against forgery.
    - Learner must be assigned to the module's course/program.
    - Immutability: PUT, PATCH, DELETE are strictly forbidden. Responses cannot be modified or deleted.
    - Read access:
      - ADMIN: Full visibility.
      - TRAINER: Scoped strictly to responses submitted by learners in the trainer's actively assigned learner groups.
      - LEARNER: Scoped strictly to their own submitted responses.
    - Custom action:
      - /api/question-responses/module-completion-status/?module=<module_id>[&learner=<learner_id>]
        Checks whether all active required questions for a module have been answered by the target learner.
    """
    serializer_class = ModuleQuestionResponseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = _get_role(user)

        if role == User.Role.ADMIN:
            qs = ModuleQuestionResponse.objects.all()
        elif role == User.Role.TRAINER:
            # Active groups assigned to this trainer
            trainer_groups = LearnerGroup.objects.filter(
                trainer_assignments__trainer=user,
                trainer_assignments__is_active=True,
                is_active=True,
            )
            # Learners belonging to those groups
            assigned_learners = User.objects.filter(
                group_memberships__group__in=trainer_groups,
                group_memberships__is_active=True,
                role=User.Role.LEARNER,
            )
            qs = ModuleQuestionResponse.objects.filter(learner__in=assigned_learners)
        elif role == User.Role.LEARNER:
            qs = ModuleQuestionResponse.objects.filter(learner=user)
        else:
            return ModuleQuestionResponse.objects.none()

        # Query param filters
        question_id = self.request.query_params.get("question")
        if question_id:
            qs = qs.filter(question_id=question_id)

        module_id = self.request.query_params.get("module")
        if module_id:
            qs = qs.filter(question__module_id=module_id)

        learner_id = self.request.query_params.get("learner")
        if learner_id:
            qs = qs.filter(learner_id=learner_id)

        return qs.select_related("question", "question__module", "learner")

    def create(self, request, *args, **kwargs):
        role = _get_role(request.user)
        if role != User.Role.LEARNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only users with the LEARNER role may submit question responses.")

        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        question = serializer.validated_data["question"]
        accessible_modules = _scope_module_qs(request.user)
        if not accessible_modules.filter(id=question.module_id).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You are not authorized to submit responses for this module.")

        instance = serializer.save(learner=request.user)

        # Recalculate score and completion on the parent attempt
        attempt = instance.attempt
        if attempt:
            module = question.module
            total_req_q = ModuleQuestion.objects.filter(module=module, is_active=True, is_required=True)
            attempt_responses = ModuleQuestionResponse.objects.filter(attempt=attempt)
            
            # Sum up scores obtained from response_payload
            marks_obtained = 0.0
            for r in attempt_responses:
                p = r.response_payload or {}
                marks_obtained += float(p.get("score", 1.0 if r.response_value else 0.0))

            attempt.score = marks_obtained
            total_questions_count = ModuleQuestion.objects.filter(module=module, is_active=True).count()
            attempt.total_possible = float(total_questions_count or 1.0)
            attempt.percentage = round((attempt.score / attempt.total_possible) * 100.0, 1)

            # Check if all active questions in this attempt are answered (Stage 2: all active questions are mandatory)
            active_questions = ModuleQuestion.objects.filter(module=module, is_active=True)
            answered_q_ids = set(attempt_responses.filter(question__in=active_questions).values_list("question_id", flat=True))
            if active_questions.count() > 0 and len(answered_q_ids) >= active_questions.count():
                attempt.is_completed = True
                from django.utils import timezone
                attempt.completed_at = timezone.now()

            attempt.save()

        _log_audit(
            request,
            AuditAction.CREATE,
            "ModuleQuestionResponse",
            instance.pk,
            {
                "question": instance.question_id,
                "module": instance.question.module_id,
                "learner": instance.learner_id,
                "attempt_id": instance.attempt_id,
                "attempt_number": instance.attempt.attempt_number if instance.attempt else 1,
                "response_value": instance.response_value,
            },
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed(request.method, detail="Question responses are immutable and cannot be updated.")

    def partial_update(self, request, *args, **kwargs):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed(request.method, detail="Question responses are immutable and cannot be updated.")

    def destroy(self, request, *args, **kwargs):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed(request.method, detail="Question responses are immutable and cannot be deleted.")

    @action(detail=False, methods=["get"], url_path="module-completion-status")
    def module_completion_status(self, request):
        """
        Calculates and returns the module completion status for a learner.
        A module is complete when all active required completion questions for the module
        have recorded responses by the learner.

        Query params:
        - module: required ID of the Module
        - learner: optional ID of the Learner (Admin/Trainer only; Learners can only view their own)
        """
        module_id = request.query_params.get("module")
        if not module_id:
            return Response(
                {"error": "The 'module' query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        role = _get_role(user)

        # Determine target learner
        target_learner_id = request.query_params.get("learner")
        if role == User.Role.LEARNER:
            target_learner = user
        elif role in (User.Role.ADMIN, User.Role.TRAINER):
            if target_learner_id:
                try:
                    target_learner = User.objects.get(pk=target_learner_id, role=User.Role.LEARNER)
                except User.DoesNotExist:
                    return Response(
                        {"error": "Learner not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                if role == User.Role.TRAINER:
                    # Check if trainer is authorized for this learner
                    trainer_groups = LearnerGroup.objects.filter(
                        trainer_assignments__trainer=user,
                        trainer_assignments__is_active=True,
                        is_active=True,
                    )
                    is_member = GroupMembership.objects.filter(
                        group__in=trainer_groups,
                        learner=target_learner,
                        is_active=True,
                    ).exists()
                    if not is_member:
                        return Response(
                            {"error": "You are not authorized to view progress for this learner."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
            else:
                return Response(
                    {"error": "The 'learner' query parameter is required for Admin and Trainer requests."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            return Response(
                {"error": "Unauthorized role."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check module existence & accessibility
        try:
            module = Module.objects.get(pk=module_id)
        except Module.DoesNotExist:
            return Response({"error": "Module not found."}, status=status.HTTP_404_NOT_FOUND)

        # Scoping check for module
        if role == User.Role.LEARNER:
            if not _scope_module_qs(user).filter(pk=module.pk).exists():
                return Response({"error": "Module not found or not assigned."}, status=status.HTTP_404_NOT_FOUND)
        elif role == User.Role.TRAINER:
            if not _scope_module_qs(user).filter(pk=module.pk).exists():
                return Response({"error": "Module not found or not within your assigned scope."}, status=status.HTTP_404_NOT_FOUND)

        # Get active required questions for this module
        required_questions = ModuleQuestion.objects.filter(
            module=module,
            is_active=True,
            is_required=True,
        )
        total_required = required_questions.count()

        # Responses recorded for this learner on required questions
        answered_required_ids = set(
            ModuleQuestionResponse.objects.filter(
                question__in=required_questions,
                learner=target_learner,
            ).values_list("question_id", flat=True)
        )

        answered_count = len(answered_required_ids)

        # All questions count (all active questions are mandatory)
        all_questions_count = ModuleQuestion.objects.filter(module=module, is_active=True).count()
        # A module is an assessment (tested) module if it has at least 5 questions (assessment mode)
        # Or has multiple choice questions where total_questions >= 5
        has_mcq_questions = ModuleQuestion.objects.filter(
            module=module,
            is_active=True,
            question_type="MULTIPLE_CHOICE",
        ).exists()
        is_tested_module = (all_questions_count >= 5) or (has_mcq_questions and all_questions_count >= 5)
        
        # Latest attempt answered count, or unique distinct active questions answered across attempts capped at total
        latest_attempt_obj = ModuleAssessmentAttempt.objects.filter(module=module, learner=target_learner).order_by("-attempt_number").first()
        if latest_attempt_obj:
            all_answered_count = ModuleQuestionResponse.objects.filter(attempt=latest_attempt_obj).count()
        else:
            all_answered_count = ModuleQuestionResponse.objects.filter(
                question__module=module,
                question__is_active=True,
                learner=target_learner,
            ).values("question_id").distinct().count()

        # Fetch latest attempt and attempt history
        attempts_qs = ModuleAssessmentAttempt.objects.filter(module=module, learner=target_learner).order_by("-attempt_number")
        attempts_list = ModuleAssessmentAttemptSerializer(attempts_qs, many=True).data
        latest_attempt = attempts_list[0] if attempts_list else None

        # Assessment pass/fail logic:
        # Minimum passing score is 3/5 (60%).
        # If the module has assessment questions, it is COMPLETED ONLY when the learner has achieved score >= 3.0.
        # A passing score from any attempt permanently marks the module completed.
        best_attempt = ModuleAssessmentAttempt.objects.filter(module=module, learner=target_learner).order_by("-score").first()
        best_score = best_attempt.score if best_attempt else None
        has_passed = bool(best_score is not None and best_score >= 3.0)

        latest_attempt_completed = bool(latest_attempt_obj and latest_attempt_obj.is_completed)
        latest_score = latest_attempt_obj.score if latest_attempt_obj else None

        if is_tested_module:
            is_completed = has_passed
            if has_passed:
                result_status = "PASS"
            elif latest_attempt_completed:
                result_status = "FAIL"
            elif all_answered_count > 0 or (latest_attempt_obj and not latest_attempt_completed):
                result_status = "IN_PROGRESS"
            else:
                result_status = "NOT_STARTED"
        else:
            is_completed = (total_required > 0 and answered_count == total_required)
            result_status = "PASS" if is_completed else ("IN_PROGRESS" if answered_count > 0 else "NOT_STARTED")

        # Retake eligibility: if already passed, retakes are locked/not needed
        can_retake = False
        if is_tested_module:
            if not has_passed and latest_attempt_completed:
                # Check submodule review rules
                published_submodules = list(Submodule.objects.filter(module=module, status=PublicationStatus.PUBLISHED))
                target_att_num = (latest_attempt_obj.attempt_number + 1) if latest_attempt_obj else 1
                completed_submod_ids = set(LearnerSubmoduleProgress.objects.filter(
                    learner=target_learner,
                    submodule__in=published_submodules,
                    target_attempt_number=target_att_num,
                    is_completed=True,
                ).values_list("submodule_id", flat=True))
                if len(completed_submod_ids) >= len(published_submodules):
                    can_retake = True

        marks_obtained = int(latest_score) if latest_score is not None else (int(best_score) if best_score is not None else 0)
        total_marks = int(latest_attempt_obj.total_possible) if latest_attempt_obj else (all_questions_count or 5)

        return Response({
            "module_id": module.id,
            "module_name": module.name,
            "learner_id": target_learner.id,
            "learner_username": target_learner.username,
            "total_required_questions": total_required,
            "answered_required_questions": answered_count,
            "is_module_completed": is_completed,
            "is_tested_module": is_tested_module,
            "has_passed": has_passed,
            "marks_obtained": marks_obtained,
            "total_marks": total_marks,
            "result": result_status,
            "can_retake": can_retake,
            "total_questions": all_questions_count,
            "total_answered_questions": all_answered_count,
            "latest_attempt": latest_attempt,
            "attempts": attempts_list,
        })

    @action(detail=False, methods=["get"], url_path="retake-eligibility")
    def retake_eligibility(self, request):
        """
        Evaluates whether a learner is eligible to start an assessment retake for a module.
        Retake rule (Stage 2):
        - Module must have at least 1 active question (0 questions -> cannot retake).
        - Learner must have already completed previous attempt.
        - Learner must have reviewed/completed all PUBLISHED submodules for target_attempt_number.
        """
        module_id = request.query_params.get("module")
        if not module_id:
            return Response(
                {"error": "The 'module' query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        role = _get_role(user)

        target_learner = user
        if role in (User.Role.ADMIN, User.Role.TRAINER):
            learner_id = request.query_params.get("learner")
            if learner_id:
                try:
                    target_learner = User.objects.get(pk=learner_id, role=User.Role.LEARNER)
                except User.DoesNotExist:
                    return Response({"error": "Learner not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            module = Module.objects.get(pk=module_id)
        except Module.DoesNotExist:
            return Response({"error": "Module not found."}, status=status.HTTP_404_NOT_FOUND)

        if role == User.Role.LEARNER:
            if not _scope_module_qs(user).filter(pk=module.pk).exists():
                return Response({"error": "Module not found or not assigned."}, status=status.HTTP_404_NOT_FOUND)

        active_questions_count = ModuleQuestion.objects.filter(module=module, is_active=True).count()
        published_submodules = list(Submodule.objects.filter(module=module, status=PublicationStatus.PUBLISHED).order_by("order"))
        total_submodules_count = len(published_submodules)

        latest_attempt = ModuleAssessmentAttempt.objects.filter(
            module=module,
            learner=target_learner,
        ).order_by("-attempt_number").first()

        # Check if learner has already passed the assessment (score >= 3.0 on any attempt)
        best_attempt = ModuleAssessmentAttempt.objects.filter(module=module, learner=target_learner).order_by("-score").first()
        has_passed = bool(best_attempt and best_attempt.score is not None and best_attempt.score >= 3.0)

        blocking_reasons = []

        if active_questions_count == 0:
            blocking_reasons.append("This module has no assessment questions configured.")

        if has_passed:
            blocking_reasons.append("You have already passed this assessment. Retakes are locked.")

        if not latest_attempt:
            current_attempt_number = 0
            current_attempt_completed = False
            target_attempt_number = 1
            # Initial attempt doesn't require submodule review
            submodule_details = []
            completed_submodules_count = 0
            pending_submodules_count = 0
        else:
            current_attempt_number = latest_attempt.attempt_number
            current_attempt_completed = latest_attempt.is_completed
            target_attempt_number = latest_attempt.attempt_number + 1

            if not current_attempt_completed:
                blocking_reasons.append(f"Current Attempt #{current_attempt_number} is still in progress. Complete it first.")

            # Check submodule progress for target_attempt_number
            progress_qs = LearnerSubmoduleProgress.objects.filter(
                learner=target_learner,
                submodule__in=published_submodules,
                target_attempt_number=target_attempt_number,
                is_completed=True,
            )
            completed_submod_ids = set(progress_qs.values_list("submodule_id", flat=True))

            all_submod_progress = LearnerSubmoduleProgress.objects.filter(
                learner=target_learner,
                submodule__in=published_submodules,
                target_attempt_number=target_attempt_number,
            )
            opened_submod_ids = set(all_submod_progress.values_list("submodule_id", flat=True))

            submodule_details = []
            for sm in published_submodules:
                sm_done = sm.id in completed_submod_ids
                sm_opened = sm.id in opened_submod_ids
                submodule_details.append({
                    "id": sm.id,
                    "name": sm.name,
                    "order": sm.order,
                    "is_opened_for_retake": sm_opened,
                    "is_completed_for_retake": sm_done,
                })

            completed_submodules_count = len(completed_submod_ids)
            pending_submodules_count = total_submodules_count - completed_submodules_count

            if total_submodules_count > 0 and pending_submodules_count > 0:
                blocking_reasons.append(f"You must review all {total_submodules_count} submodule lessons before Attempt #{target_attempt_number}. ({pending_submodules_count} remaining)")

        can_retake = (
            active_questions_count > 0
            and latest_attempt is not None
            and latest_attempt.is_completed
            and len(blocking_reasons) == 0
        )

        return Response({
            "module_id": module.id,
            "module_name": module.name,
            "can_retake": can_retake,
            "current_attempt_number": current_attempt_number,
            "current_attempt_completed": current_attempt_completed,
            "target_attempt_number": target_attempt_number,
            "total_submodules": total_submodules_count,
            "completed_submodules_count": completed_submodules_count,
            "pending_submodules_count": pending_submodules_count,
            "submodules": submodule_details,
            "blocking_reasons": blocking_reasons,
        })

    @action(detail=False, methods=["post"], url_path="start-retake")
    def start_retake(self, request):
        """
        Initiates a voluntary assessment retake for a module.
        Creates a new ModuleAssessmentAttempt with attempt_number = max + 1.
        Enforces Stage 2 retake rules:
        - Module must have at least 1 active question.
        - Previous attempt must exist and be completed.
        - All published submodules must be reviewed for target_attempt_number.
        - Concurrency protection: wrapped in atomic transaction with row locking and IntegrityError handling.
        """
        role = _get_role(request.user)
        if role != User.Role.LEARNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only learners may initiate an assessment retake.")

        module_id = request.data.get("module") or request.query_params.get("module")
        if not module_id:
            return Response({"error": "The 'module' parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            module = Module.objects.get(pk=module_id)
        except Module.DoesNotExist:
            return Response({"error": "Module not found."}, status=status.HTTP_404_NOT_FOUND)

        if not _scope_module_qs(request.user).filter(pk=module.pk).exists():
            return Response({"error": "Module not found or not assigned."}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            # Lock the module row to serialize concurrent attempt creation requests for this module/learner
            Module.objects.select_for_update().get(pk=module.pk)

            active_questions_count = ModuleQuestion.objects.filter(module=module, is_active=True).count()
            if active_questions_count == 0:
                return Response(
                    {"error": "This module has no assessment questions configured. Retakes are not available."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Check if learner has already passed the assessment
            best_attempt = ModuleAssessmentAttempt.objects.filter(module=module, learner=request.user).order_by("-score").first()
            if best_attempt and best_attempt.score is not None and best_attempt.score >= 3.0:
                return Response(
                    {"error": "You have already passed this assessment (score >= 3/5). Further retakes are locked."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Look up max attempt number
            last_attempt = ModuleAssessmentAttempt.objects.filter(
                module=module,
                learner=request.user,
            ).order_by("-attempt_number").first()

            if not last_attempt:
                return Response(
                    {"error": "Initial assessment attempt has not been taken yet. Use standard submission to begin."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not last_attempt.is_completed:
                return Response(
                    {"error": f"Attempt #{last_attempt.attempt_number} is still open. Complete it before starting a retake."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            target_attempt_number = last_attempt.attempt_number + 1

            # Validate published submodules completion
            published_submodules = list(Submodule.objects.filter(module=module, status=PublicationStatus.PUBLISHED))
            if published_submodules:
                completed_count = LearnerSubmoduleProgress.objects.filter(
                    learner=request.user,
                    submodule__in=published_submodules,
                    target_attempt_number=target_attempt_number,
                    is_completed=True,
                ).values("submodule_id").distinct().count()

                if completed_count < len(published_submodules):
                    missing = len(published_submodules) - completed_count
                    return Response(
                        {
                            "error": f"You must review all {len(published_submodules)} submodule lessons before starting Attempt #{target_attempt_number}. ({missing} remaining)",
                            "required_submodules": len(published_submodules),
                            "completed_submodules": completed_count,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            try:
                new_attempt = ModuleAssessmentAttempt.objects.create(
                    module=module,
                    learner=request.user,
                    attempt_number=target_attempt_number,
                    score=0.0,
                    total_possible=float(active_questions_count or 1.0),
                    percentage=0.0,
                    is_completed=False,
                )
            except IntegrityError:
                # Concurrent request already created this attempt; fetch and return it
                new_attempt = ModuleAssessmentAttempt.objects.get(
                    module=module,
                    learner=request.user,
                    attempt_number=target_attempt_number,
                )
                return Response(ModuleAssessmentAttemptSerializer(new_attempt).data, status=status.HTTP_200_OK)

            _log_audit(
                request,
                AuditAction.CREATE,
                "ModuleAssessmentAttempt",
                new_attempt.pk,
                {
                    "module": module.id,
                    "learner": request.user.id,
                    "attempt_number": target_attempt_number,
                },
            )

            return Response(ModuleAssessmentAttemptSerializer(new_attempt).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="attempts")
    def attempts(self, request):
        """
        Returns all assessment attempts for a module.
        """
        module_id = request.query_params.get("module")
        if not module_id:
            return Response({"error": "The 'module' query parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        role = _get_role(user)

        target_learner = user
        if role in (User.Role.ADMIN, User.Role.TRAINER):
            learner_id = request.query_params.get("learner")
            if learner_id:
                target_learner = get_object_or_404(User, pk=learner_id, role=User.Role.LEARNER)

        attempts_qs = ModuleAssessmentAttempt.objects.filter(
            module_id=module_id,
            learner=target_learner,
        ).order_by("-attempt_number")

        return Response(ModuleAssessmentAttemptSerializer(attempts_qs, many=True).data)


# =============================================================================
# 11b. Module Feedback ViewSet (Phase 3 Step 3.1)
# =============================================================================

class ModuleFeedbackViewSet(viewsets.ModelViewSet):
    """
    Endpoints for Module Feedback & Evaluation.
    - list / retrieve:
      - LEARNER: Scoped strictly to their own feedback submissions (learner=request.user).
      - Filter param `?module={id}` filters feedback for the specific module.
    - create (POST):
      - Authenticated LMS users with role='LEARNER' only.
      - Derives learner from request.user.
      - Validates completion, ratings (1-5), comments (non-whitespace), eligible trainer, and uniqueness.
      - Enforces database transaction and catches IntegrityError for concurrent duplicate safety.
      - Records creation in AuditLog (without sensitive raw comments).
    - update / partial_update / destroy:
      - 405 Method Not Allowed (Feedback is immutable).
    """
    serializer_class = ModuleFeedbackSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = _get_role(user)

        if role == User.Role.LEARNER:
            qs = ModuleFeedback.objects.filter(learner=user)
        elif role == User.Role.ADMIN:
            qs = ModuleFeedback.objects.all()
        elif role == User.Role.TRAINER:
            qs = ModuleFeedback.objects.filter(trainer=user)
        else:
            return ModuleFeedback.objects.none()

        module_id = self.request.query_params.get("module")
        if module_id:
            qs = qs.filter(module_id=module_id)

        return qs.select_related("module", "learner", "trainer")

    def create(self, request, *args, **kwargs):
        role = _get_role(request.user)
        if role != User.Role.LEARNER:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only users with the LEARNER role may submit module feedback.")

        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                instance = serializer.save(learner=request.user)
        except IntegrityError:
            return Response(
                {"non_field_errors": ["You have already submitted feedback for this module."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Audit logging: record submission event without storing raw comments
        _log_audit(
            request,
            AuditAction.CREATE,
            "ModuleFeedback",
            instance.pk,
            {
                "module_id": instance.module_id,
                "module_name": instance.module.name,
                "trainer_id": instance.trainer_id,
                "trainer_username": instance.trainer.username,
                "module_rating": instance.module_rating,
                "trainer_rating": instance.trainer_rating,
                "understanding_level": instance.understanding_level,
            },
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed(request.method, detail="Module feedback is immutable and cannot be updated.")

    def partial_update(self, request, *args, **kwargs):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed(request.method, detail="Module feedback is immutable and cannot be updated.")

    def destroy(self, request, *args, **kwargs):
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed(request.method, detail="Module feedback cannot be deleted.")

# =============================================================================
# 12. Helper Functions for Learner Progress & Trainer Tracking (Step 3.5)
# =============================================================================

def _get_distinct_assigned_modules_for_learner(learner):
    """
    Returns a distinct queryset of published Modules assigned to *learner*
    via active TrainingAssignment (matching learner's active LearnerGroup, CandidateType, or direct individual assignment).
    Supports Course, Level, and direct Module targets, including course-less Modules.
    """
    assignments = _get_active_learner_assignments(learner)
    _, assigned_level_ids, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)

    return Module.objects.filter(
        status=PublicationStatus.PUBLISHED,
    ).filter(
        Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED)
    ).filter(
        Q(level__course__isnull=True) | Q(level__course__status=PublicationStatus.PUBLISHED)
    ).filter(
        Q(course_id__in=assigned_crs_ids) |
        Q(level_id__in=assigned_level_ids) |
        Q(id__in=assigned_mod_ids)
    ).select_related("course", "level").distinct()


def _calculate_learner_progress_metrics(learner, assigned_modules):
    """
    Calculates completion metrics for *learner* across *assigned_modules*.
    Uses the verified Step 3.4 rule:
        is_completed = (total_required > 0 and answered_count == total_required)
    Returns:
        total_assigned: int
        completed_count: int
        pending_count: int
        percentage: float (rounded to 1 decimal place)
        module_details: list of dicts with per-module progress
    """
    total_assigned = assigned_modules.count()
    if total_assigned == 0:
        return 0, 0, 0, 0.0, []

    module_ids = [m.id for m in assigned_modules]

    # Pre-fetch all active required questions for these modules
    required_questions = ModuleQuestion.objects.filter(
        module_id__in=module_ids,
        is_active=True,
        is_required=True,
    ).values("id", "module_id")

    # Map module_id -> set of required question_ids
    module_req_q_map = {}
    for q in required_questions:
        module_req_q_map.setdefault(q["module_id"], set()).add(q["id"])

    # Pre-fetch learner's responses to these required questions
    learner_responses = ModuleQuestionResponse.objects.filter(
        question_id__in=[q["id"] for q in required_questions],
        learner=learner,
    ).values_list("question_id", flat=True)

    answered_q_set = set(learner_responses)

    # Pre-fetch assessment attempts for these modules
    attempts = ModuleAssessmentAttempt.objects.filter(
        module_id__in=module_ids,
        learner=learner,
    ).values("module_id", "score")

    # Map module_id -> max_score
    module_best_score_map = {}
    for att in attempts:
        mid = att["module_id"]
        sc = att["score"]
        if sc is not None:
            if mid not in module_best_score_map or sc > module_best_score_map[mid]:
                module_best_score_map[mid] = sc

    # Find which modules are tested modules (have MCQ / assessment questions)
    mcq_module_ids = set(ModuleQuestion.objects.filter(
        module_id__in=module_ids,
        is_active=True,
        question_type="MULTIPLE_CHOICE",
    ).values_list("module_id", flat=True))

    completed_count = 0
    module_details = []

    for m in assigned_modules:
        req_q_set = module_req_q_map.get(m.id, set())
        total_required = len(req_q_set)
        answered_required = len(req_q_set.intersection(answered_q_set))

        # Check pass status if module is tested assessment (5 questions)
        if total_required >= 5:
            best_sc = module_best_score_map.get(m.id)
            is_completed = (best_sc is not None and best_sc >= 3.0)
        else:
            is_completed = (total_required > 0 and answered_required == total_required)

        if is_completed:
            completed_count += 1

        course_info = (
            {"id": m.course.id, "name": m.course.name}
            if m.course is not None
            else {"id": None, "name": None}
        )
        level_info = (
            {"id": m.level.id, "name": m.level.name, "order": m.level.order}
            if getattr(m, "level", None) is not None
            else {"id": None, "name": None, "order": None}
        )

        module_details.append({
            "id": m.id,
            "name": m.name,
            "course": course_info,
            "level": level_info,
            "level_id": level_info["id"],
            "level_name": level_info["name"],
            "total_required_questions": total_required,
            "answered_required_questions": answered_required,
            "is_completed": is_completed,
        })

    pending_count = total_assigned - completed_count
    percentage = round((completed_count / total_assigned) * 100.0, 1)

    return total_assigned, completed_count, pending_count, percentage, module_details


# =============================================================================
# 13. Trainer Progress Monitoring & Learner Overview ViewSets (Step 3.5)
# =============================================================================

class TrainerLearnerOverviewViewSet(viewsets.ViewSet):
    """
    API ViewSet for Trainer Progress Monitoring:
    - GET /api/trainer/learners/
      Lists all learners in active groups assigned to the requesting trainer,
      along with aggregated progress metrics.
    - GET /api/trainer/learners/{id}/progress/
      Retrieves detailed module-level progression breakdown for a specific learner.

    Role Permissions:
    - ADMIN: Full access across all learners.
    - TRAINER: Strictly scoped to learners belonging to the trainer's active assigned groups.
    - LEARNER: Strictly forbidden (HTTP 403).
    """
    permission_classes = [IsAuthenticated]

    def _get_accessible_learners_queryset(self, user):
        role = _get_role(user)
        if role == User.Role.ADMIN:
            # All learners who have active memberships in active groups
            return User.objects.filter(
                role=User.Role.LEARNER,
                group_memberships__is_active=True,
                group_memberships__group__is_active=True,
            ).distinct()

        if role == User.Role.TRAINER:
            trainer_groups = LearnerGroup.objects.filter(
                trainer_assignments__trainer=user,
                trainer_assignments__is_active=True,
                is_active=True,
            )
            return User.objects.filter(
                role=User.Role.LEARNER,
                group_memberships__group__in=trainer_groups,
                group_memberships__is_active=True,
            ).distinct()

        return User.objects.none()

    def list(self, request):
        role = _get_role(request.user)
        if role not in (User.Role.ADMIN, User.Role.TRAINER):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only trainers and administrators may access the learner overview.")

        learners_qs = self._get_accessible_learners_queryset(request.user).order_by("username")

        # Determine active groups accessible by trainer for display
        if role == User.Role.TRAINER:
            trainer_groups = LearnerGroup.objects.filter(
                trainer_assignments__trainer=request.user,
                trainer_assignments__is_active=True,
                is_active=True,
            )
        else:
            trainer_groups = LearnerGroup.objects.filter(is_active=True)

        results = []
        for learner in learners_qs:
            # Assigned groups names
            learner_groups = trainer_groups.filter(
                memberships__learner=learner,
                memberships__is_active=True,
            ).values_list("name", flat=True)

            assigned_modules = _get_distinct_assigned_modules_for_learner(learner)
            tot, comp, pend, pct, _ = _calculate_learner_progress_metrics(learner, assigned_modules)

            # Build representation matching LearnerProgressOverviewSerializer
            learner_name = learner.get_full_name().strip() or learner.username
            results.append({
                "learner_id": learner.id,
                "learner_name": learner_name,
                "learner_username": learner.username,
                "learner_email": learner.email,
                "assigned_groups": list(learner_groups),
                "total_assigned_modules": tot,
                "completed_modules": comp,
                "pending_modules": pend,
                "completion_percentage": pct,
            })

        return Response({"learners": results})

    @action(detail=True, methods=["get"], url_path="progress")
    def progress(self, request, pk=None):
        role = _get_role(request.user)
        if role not in (User.Role.ADMIN, User.Role.TRAINER):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only trainers and administrators may access learner progress.")

        accessible_learners = self._get_accessible_learners_queryset(request.user)
        try:
            learner = accessible_learners.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"error": "Learner not found or not in your assigned groups."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Assigned groups
        if role == User.Role.TRAINER:
            trainer_groups = LearnerGroup.objects.filter(
                trainer_assignments__trainer=request.user,
                trainer_assignments__is_active=True,
                is_active=True,
            )
        else:
            trainer_groups = LearnerGroup.objects.filter(is_active=True)

        assigned_groups = list(
            trainer_groups.filter(
                memberships__learner=learner,
                memberships__is_active=True,
            ).values("id", "name", "code")
        )

        assigned_modules = _get_distinct_assigned_modules_for_learner(learner)
        tot, comp, pend, pct, module_details = _calculate_learner_progress_metrics(learner, assigned_modules)

        learner_name = learner.get_full_name().strip() or learner.username
        data = {
            "learner": {
                "id": learner.id,
                "name": learner_name,
                "username": learner.username,
                "email": learner.email,
                "assigned_groups": assigned_groups,
            },
            "progress": {
                "total_assigned_modules": tot,
                "completed_modules": comp,
                "pending_modules": pend,
                "completion_percentage": pct,
            },
            "modules": [
                {
                    "module_id": item["id"],
                    "module_name": item["name"],
                    "course_id": item["course"]["id"],
                    "course_name": item["course"]["name"],
                    "level_id": item["level"]["id"],
                    "level_name": item["level"]["name"],
                    "total_required_questions": item["total_required_questions"],
                    "answered_required_questions": item["answered_required_questions"],
                    "is_completed": item["is_completed"],
                }
                for item in module_details
            ],
        }
        return Response(data)

# =============================================================================
# 14. Admin Oversight & System-Wide Progress Reporting ViewSets (Step 3.6)
# =============================================================================

class AdminOversightViewSet(viewsets.ViewSet):
    """
    API ViewSet for Administrator Oversight and System-wide Progress Reporting.
    
    Endpoints:
    - GET /api/admin/reports/overview/
      Returns aggregate counts of curriculum, cohorts, trainers, active learners,
      and the overall system-wide completion rate.
    - GET /api/admin/reports/progress/
      Returns system-wide completion statistics and cohort-by-cohort progression summaries.
    - GET /api/admin/reports/activity/
      Returns audit trail event logs and recent operational activity.

    Permissions:
    - Strictly restricted to LMS Administrator (request.user.role == 'ADMIN').
    - Trainers and Learners are forbidden (HTTP 403).
    - Unauthenticated requests are rejected (HTTP 401 / 403).
    """
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        role = _get_role(request.user)
        if role != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only LMS Administrators may access administrative reports.")

    @action(detail=False, methods=["get"], url_path="overview")
    def overview(self, request):
        self._require_admin(request)

        total_courses = Course.objects.count()
        draft_courses = Course.objects.filter(status="DRAFT").count()
        published_courses = Course.objects.filter(status="PUBLISHED").count()
        total_modules = Module.objects.count()
        total_learner_groups = LearnerGroup.objects.count()
        total_candidate_types = CandidateType.objects.count()
        total_users = User.objects.count()
        total_admins = User.objects.filter(role=User.Role.ADMIN).count()
        total_trainers = User.objects.filter(role=User.Role.TRAINER).count()
        total_learners = User.objects.filter(role=User.Role.LEARNER).count()
        total_staff = total_admins + total_trainers
        total_trainers_and_learners = total_trainers + total_learners

        # Calculate In-Progress Learners: unique learners with >=1 response in a module where module is not complete
        from collections import defaultdict
        module_req_map = defaultdict(set)
        for q_id, mod_id in ModuleQuestion.objects.filter(is_active=True, is_required=True).values_list("id", "module_id"):
            module_req_map[mod_id].add(q_id)

        responses_qs = ModuleQuestionResponse.objects.filter(
            learner__role=User.Role.LEARNER
        ).values_list("learner_id", "question__module_id", "question_id")

        learner_mod_responses = defaultdict(lambda: defaultdict(set))
        for learner_id, mod_id, q_id in responses_qs:
            learner_mod_responses[learner_id][mod_id].add(q_id)

        in_progress_learner_ids = set()
        for learner_id, modules_dict in learner_mod_responses.items():
            for mod_id, answered_q_set in modules_dict.items():
                req_q_set = module_req_map.get(mod_id, set())
                total_req = len(req_q_set)
                answered_req = len(req_q_set.intersection(answered_q_set))

                is_completed = (total_req > 0 and answered_req == total_req)
                has_started = len(answered_q_set) > 0

                if has_started and not is_completed:
                    in_progress_learner_ids.add(learner_id)
                    break

        in_progress_learners_count = len(in_progress_learner_ids)

        # Active learners with active group memberships
        active_learners_qs = User.objects.filter(
            role=User.Role.LEARNER,
            group_memberships__is_active=True,
            group_memberships__group__is_active=True,
        ).distinct()
        active_learners_count = active_learners_qs.count()

        # Calculate overall system completion rate across all active learners with assignments
        total_assigned_sum = 0
        total_completed_sum = 0

        for learner in active_learners_qs:
            assigned_mods = _get_distinct_assigned_modules_for_learner(learner)
            tot, comp, _, _, _ = _calculate_learner_progress_metrics(learner, assigned_mods)
            total_assigned_sum += tot
            total_completed_sum += comp

        system_wide_completion_rate = (
            round((total_completed_sum / total_assigned_sum) * 100.0, 1)
            if total_assigned_sum > 0
            else 0.0
        )

        # Retrieve recent logins for display (sanitized, no credentials)
        recent_logins_qs = User.objects.filter(last_login__isnull=False).order_by("-last_login")[:8]
        recent_logins = [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "last_login": u.last_login.isoformat() if u.last_login else None,
            }
            for u in recent_logins_qs
        ]

        data = {
            "total_courses": total_courses,
            "draft_courses": draft_courses,
            "published_courses": published_courses,
            "total_modules": total_modules,
            "total_learner_groups": total_learner_groups,
            "total_candidate_types": total_candidate_types,
            "total_users": total_users,
            "total_admins": total_admins,
            "total_trainers": total_trainers,
            "total_staff": total_staff,
            "total_trainers_and_learners": total_trainers_and_learners,
            "total_learners": total_learners,
            "in_progress_learners_count": in_progress_learners_count,
            "active_learners_count": active_learners_count,
            "system_wide_completion_rate": system_wide_completion_rate,
            "recent_logins": recent_logins,
        }
        serializer = AdminSystemOverviewSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="progress")
    def progress(self, request):
        self._require_admin(request)

        active_learners_qs = User.objects.filter(
            role=User.Role.LEARNER,
            group_memberships__is_active=True,
            group_memberships__group__is_active=True,
        ).distinct()
        total_active_learners = active_learners_qs.count()

        groups = LearnerGroup.objects.filter(is_active=True).select_related("candidate_type").order_by("name")
        total_learner_groups = groups.count()

        cohort_summaries = []
        overall_assigned_sum = 0
        overall_completed_sum = 0

        for group in groups:
            group_learners = User.objects.filter(
                role=User.Role.LEARNER,
                group_memberships__group=group,
                group_memberships__is_active=True,
            ).distinct()
            group_learners_count = group_learners.count()

            completed_learners = 0
            group_pct_sum = 0.0

            for learner in group_learners:
                assigned_mods = _get_distinct_assigned_modules_for_learner(learner)
                tot, comp, _, pct, _ = _calculate_learner_progress_metrics(learner, assigned_mods)
                overall_assigned_sum += tot
                overall_completed_sum += comp
                group_pct_sum += pct
                if tot > 0 and comp == tot:
                    completed_learners += 1

            avg_pct = (
                round(group_pct_sum / group_learners_count, 1)
                if group_learners_count > 0
                else 0.0
            )

            cohort_summaries.append({
                "group_id": group.id,
                "group_name": group.name,
                "group_code": group.code,
                "candidate_type": group.candidate_type.name if group.candidate_type else None,
                "total_learners": group_learners_count,
                "average_completion_percentage": avg_pct,
                "completed_learners_count": completed_learners,
            })

        system_completion_rate = (
            round((overall_completed_sum / overall_assigned_sum) * 100.0, 1)
            if overall_assigned_sum > 0
            else 0.0
        )

        data = {
            "system_completion_rate": system_completion_rate,
            "total_active_learners": total_active_learners,
            "total_learner_groups": total_learner_groups,
            "cohorts": cohort_summaries,
        }
        serializer = AdminProgressReportSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="activity")
    def activity(self, request):
        self._require_admin(request)

        total_audit_events = AuditLog.objects.count()
        recent_logs = list(AuditLog.objects.select_related("actor").order_by("-timestamp")[:50])

        # Pre-fetch related entities in bulk to avoid N+1 queries
        course_ids = set()
        module_ids = set()
        submodule_ids = set()
        group_ids = set()
        user_ids = set()

        for log in recent_logs:
            details = log.details if isinstance(log.details, dict) else {}
            # Course IDs
            if details.get("course"):
                try: course_ids.add(int(details["course"]))
                except (ValueError, TypeError): pass
            if log.entity_type == "Course":
                try: course_ids.add(int(log.entity_id))
                except (ValueError, TypeError): pass

            # Module IDs
            if details.get("module"):
                try: module_ids.add(int(details["module"]))
                except (ValueError, TypeError): pass
            if log.entity_type == "Module":
                try: module_ids.add(int(log.entity_id))
                except (ValueError, TypeError): pass

            # Submodule IDs
            if log.entity_type == "Submodule":
                try: submodule_ids.add(int(log.entity_id))
                except (ValueError, TypeError): pass

            # Group IDs
            if details.get("group"):
                try: group_ids.add(int(details["group"]))
                except (ValueError, TypeError): pass
            if details.get("learner_group"):
                try: group_ids.add(int(details["learner_group"]))
                except (ValueError, TypeError): pass
            if log.entity_type == "LearnerGroup":
                try: group_ids.add(int(log.entity_id))
                except (ValueError, TypeError): pass

            # User IDs (learner, trainer)
            if details.get("learner"):
                try: user_ids.add(int(details["learner"]))
                except (ValueError, TypeError): pass
            if details.get("trainer"):
                try: user_ids.add(int(details["trainer"]))
                except (ValueError, TypeError): pass

        # Fetch in bulk
        courses_by_id = Course.objects.in_bulk(course_ids)
        modules_by_id = Module.objects.select_related("course").in_bulk(module_ids)
        submodules_by_id = Submodule.objects.in_bulk(submodule_ids)
        groups_by_id = LearnerGroup.objects.in_bulk(group_ids)
        users_by_id = User.objects.in_bulk(user_ids)

        # Also populate course_ids from fetched modules if any
        for m in modules_by_id.values():
            if m.course_id and m.course_id not in courses_by_id:
                courses_by_id[m.course_id] = m.course

        related_context = {
            "courses": courses_by_id,
            "modules": modules_by_id,
            "submodules": submodules_by_id,
            "materials": {},
            "groups": groups_by_id,
            "users": users_by_id,
        }

        activities = []
        for log in recent_logs:
            actor_name = log.actor.username if log.actor else "System"
            desc = generate_audit_description(
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                details=log.details,
                actor_name=actor_name,
                related_context=related_context,
            )
            activities.append({
                "id": log.id,
                "actor": actor_name,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": str(log.entity_id),
                "details": log.details,
                "description": desc,
                "ip_address": log.ip_address,
                "timestamp": log.timestamp.isoformat(),
            })

        data = {
            "total_audit_events": total_audit_events,
            "recent_activities": activities,
        }
        serializer = AdminAuditActivitySummarySerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="in-progress-learners")
    def in_progress_learners(self, request):
        self._require_admin(request)

        from collections import defaultdict
        # 1. Map module_id -> set of active required question_ids
        module_req_map = defaultdict(set)
        for q_id, mod_id in ModuleQuestion.objects.filter(is_active=True, is_required=True).values_list("id", "module_id"):
            module_req_map[mod_id].add(q_id)

        # 2. Query all responses for learners
        # Fetch learner_id, question__module_id, question_id, submitted_at
        responses_qs = ModuleQuestionResponse.objects.filter(
            learner__role=User.Role.LEARNER
        ).values_list("learner_id", "question__module_id", "question_id", "submitted_at")

        learner_mod_responses = defaultdict(lambda: defaultdict(set))
        learner_mod_last_activity = defaultdict(dict)

        for learner_id, mod_id, q_id, submitted_at in responses_qs:
            learner_mod_responses[learner_id][mod_id].add(q_id)
            prev_act = learner_mod_last_activity[learner_id].get(mod_id)
            if submitted_at:
                if prev_act is None or submitted_at > prev_act:
                    learner_mod_last_activity[learner_id][mod_id] = submitted_at

        # 3. Identify all in-progress learner-module pairs
        in_progress_pairs = []
        distinct_learner_ids = set()
        needed_learner_ids = set()
        needed_module_ids = set()

        for learner_id, modules_dict in learner_mod_responses.items():
            for mod_id, answered_q_set in modules_dict.items():
                req_q_set = module_req_map.get(mod_id, set())
                total_req = len(req_q_set)
                answered_req = len(req_q_set.intersection(answered_q_set))

                is_completed = (total_req > 0 and answered_req == total_req)
                has_started = len(answered_q_set) > 0

                if has_started and not is_completed:
                    distinct_learner_ids.add(learner_id)
                    needed_learner_ids.add(learner_id)
                    needed_module_ids.add(mod_id)
                    pct = round((answered_req / total_req * 100.0), 1) if total_req > 0 else 0.0
                    in_progress_pairs.append({
                        "learner_id": learner_id,
                        "module_id": mod_id,
                        "total_required_questions": total_req,
                        "answered_required_questions": answered_req,
                        "completion_percentage": pct,
                        "last_activity": learner_mod_last_activity[learner_id].get(mod_id),
                    })

        # 4. Bulk fetch Users and Modules to eliminate N+1 queries
        users_by_id = {u.id: u for u in User.objects.filter(id__in=needed_learner_ids)}
        modules_by_id = {
            m.id: m
            for m in Module.objects.filter(id__in=needed_module_ids).select_related(
                "course", "level", "level__course"
            )
        }

        items = []
        for pair in in_progress_pairs:
            learner = users_by_id.get(pair["learner_id"])
            module = modules_by_id.get(pair["module_id"])
            if not learner or not module:
                continue

            learner_name = learner.get_full_name().strip() or learner.username
            effective_course = module.course or (module.level.course if module.level else None)
            level_id = module.level.id if module.level else None
            level_name = module.level.name if module.level else None
            course_id = effective_course.id if effective_course else None
            course_name = (
                effective_course.name
                if effective_course
                else (level_name or "Independent Module")
            )

            items.append({
                "learner_id": learner.id,
                "learner_name": learner_name,
                "learner_username": learner.username,
                "learner_email": learner.email or "",
                "course_id": course_id,
                "course_name": course_name,
                "level_id": level_id,
                "level_name": level_name,
                "module_id": module.id,
                "module_name": module.name,
                "total_required_questions": pair["total_required_questions"],
                "answered_required_questions": pair["answered_required_questions"],
                "completion_percentage": pair["completion_percentage"],
                "last_activity": pair["last_activity"],
            })

        # Sort items predictably by learner_name then course_name then module_name
        items.sort(key=lambda x: (x["learner_name"].lower(), (x["course_name"] or "").lower(), x["module_name"].lower()))

        data = {
            "total_in_progress_learners": len(distinct_learner_ids),
            "total_in_progress_module_enrollments": len(items),
            "items": items,
        }
        serializer = AdminInProgressLearnersResponseSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)


    @action(detail=False, methods=["get"], url_path="trainer-workload")
    def trainer_workload(self, request):
        """
        API endpoint returning trainer workload, cohort assignments, curriculum scope,
        and learner progression summaries across assigned groups.
        Strictly restricted to LMS Administrator.
        """
        self._require_admin(request)

        # 1. Fetch all trainers
        trainers = User.objects.filter(role=User.Role.TRAINER).order_by("username")

        # 2. Pre-fetch active trainer group assignments with related group & candidate_type
        trainer_assignments = (
            TrainerGroupAssignment.objects.filter(is_active=True, group__is_active=True)
            .select_related("group", "group__candidate_type", "trainer")
            .order_by("group__name")
        )
        trainer_to_groups = defaultdict(list)
        all_active_groups = set()
        for tga in trainer_assignments:
            trainer_to_groups[tga.trainer_id].append(tga.group)
            all_active_groups.add(tga.group)

        # 3. Pre-fetch active memberships for all relevant groups
        memberships = (
            GroupMembership.objects.filter(
                is_active=True,
                group__in=all_active_groups,
                learner__role=User.Role.LEARNER,
            )
            .select_related("learner")
            .order_by("learner__username")
        )
        group_to_learners = defaultdict(list)
        for m in memberships:
            group_to_learners[m.group_id].append(m.learner)

        # 4. Pre-fetch training assignments for all relevant groups & active candidate types
        all_cand_types = {
            g.candidate_type_id
            for g in all_active_groups
            if g.candidate_type_id and g.candidate_type and g.candidate_type.is_active
        }
        training_assignments = (
            TrainingAssignment.objects.filter(is_active=True)
            .filter(Q(learner_group__in=all_active_groups) | Q(candidate_type_id__in=all_cand_types))
            .select_related(
                "course",
                "level",
                "level__course",
                "module",
                "module__course",
                "module__level",
                "module__level__course",
                "learner_group",
            )
        )
        group_training_assignments = defaultdict(list)
        cand_type_training_assignments = defaultdict(list)
        for ta in training_assignments:
            if ta.learner_group_id:
                group_training_assignments[ta.learner_group_id].append(ta)
            elif ta.candidate_type_id:
                cand_type_training_assignments[ta.candidate_type_id].append(ta)

        # 5. Pre-fetch all eligible published modules and index by course, level, and id
        published_modules = (
            Module.objects.filter(status=PublicationStatus.PUBLISHED)
            .filter(Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED))
            .filter(Q(level__course__isnull=True) | Q(level__course__status=PublicationStatus.PUBLISHED))
            .select_related("course", "level", "level__course")
            .order_by("level__order", "order", "id")
        )
        course_to_modules = defaultdict(list)
        level_to_modules = defaultdict(list)
        modules_by_id = {}
        for mod in published_modules:
            eff_course_id = mod.course_id or (mod.level.course_id if mod.level else None)
            if eff_course_id:
                course_to_modules[eff_course_id].append(mod)
            if mod.level_id:
                level_to_modules[mod.level_id].append(mod)
            modules_by_id[mod.id] = mod

        # 6. Pre-fetch all active required questions, responses, & assessment attempts for learner progress
        req_questions = ModuleQuestion.objects.filter(is_active=True, is_required=True).values("id", "module_id")
        module_req_q_map = defaultdict(set)
        for rq in req_questions:
            module_req_q_map[rq["module_id"]].add(rq["id"])

        all_learners = {l for l_list in group_to_learners.values() for l in l_list}
        learner_responses = (
            ModuleQuestionResponse.objects.filter(
                learner__in=all_learners,
                question__is_active=True,
                question__is_required=True,
            )
            .values_list("learner_id", "question_id")
        )
        learner_answered_map = defaultdict(set)
        for lid, qid in learner_responses:
            learner_answered_map[lid].add(qid)

        learner_attempts = (
            ModuleAssessmentAttempt.objects.filter(
                learner__in=all_learners,
                score__isnull=False,
            )
            .values_list("learner_id", "module_id", "score")
        )
        learner_best_score_map = defaultdict(dict)
        for lid, mid, sc in learner_attempts:
            prev_best = learner_best_score_map[lid].get(mid)
            if prev_best is None or sc > prev_best:
                learner_best_score_map[lid][mid] = sc

        # Helper to compute group curriculum & progress
        def get_group_curriculum_and_progress(grp):
            learners = group_to_learners.get(grp.id, [])
            grp_tas = list(group_training_assignments.get(grp.id, []))
            if grp.candidate_type_id and grp.candidate_type and grp.candidate_type.is_active:
                grp_tas.extend(cand_type_training_assignments.get(grp.candidate_type_id, []))

            # Deduplicate targets across Course, Level, and Module assignments
            direct_crs_ids = set()
            direct_level_ids = set()
            direct_mod_ids = set()
            for ta in grp_tas:
                if ta.course_id:
                    direct_crs_ids.add(ta.course_id)
                elif ta.level_id:
                    direct_level_ids.add(ta.level_id)
                elif ta.module_id:
                    direct_mod_ids.add(ta.module_id)

            # Resolve all eligible published modules for this group (deduplicated by module.id)
            grp_modules_dict = {}
            curriculum_items = []

            for cid in sorted(direct_crs_ids):
                mods = course_to_modules.get(cid, [])
                for m in mods:
                    grp_modules_dict[m.id] = m
                if mods:
                    c = mods[0].course or (mods[0].level.course if mods[0].level else None)
                    if c:
                        curriculum_items.append({
                            "type": "Course",
                            "id": c.id,
                            "name": c.name,
                            "code": c.code,
                            "modules_count": len(mods),
                        })

            for lid in sorted(direct_level_ids):
                mods = level_to_modules.get(lid, [])
                for m in mods:
                    grp_modules_dict[m.id] = m
                if mods:
                    lvl = mods[0].level
                    eff_c = lvl.course or mods[0].course
                    curriculum_items.append({
                        "type": "CourseLevel",
                        "id": lvl.id,
                        "name": lvl.name,
                        "order": lvl.order,
                        "level_id": lvl.id,
                        "level_name": lvl.name,
                        "course_id": eff_c.id if eff_c else None,
                        "course_name": eff_c.name if eff_c else None,
                        "modules_count": len(mods),
                    })

            for mid in sorted(direct_mod_ids):
                m = modules_by_id.get(mid)
                if m:
                    grp_modules_dict[m.id] = m
                    eff_c = m.course or (m.level.course if m.level else None)
                    curriculum_items.append({
                        "type": "Module",
                        "id": m.id,
                        "name": m.name,
                        "level_id": m.level_id,
                        "level_name": m.level.name if m.level else None,
                        "course_id": eff_c.id if eff_c else None,
                        "course_name": eff_c.name if eff_c else None,
                        "modules_count": 1,
                    })

            # Calculate learner progress across group modules (respecting 3/5 assessment pass threshold)
            grp_modules = list(grp_modules_dict.values())
            total_mods_count = len(grp_modules)
            completed_learners = 0
            learner_pct_sum = 0.0

            for lnr in learners:
                if total_mods_count == 0:
                    continue
                lnr_completed_mods = 0
                ans_qs = learner_answered_map.get(lnr.id, set())
                best_scores = learner_best_score_map.get(lnr.id, {})
                for m in grp_modules:
                    req_qs = module_req_q_map.get(m.id, set())
                    total_req = len(req_qs)
                    answered_req = len(req_qs.intersection(ans_qs))
                    if total_req >= 5:
                        best_sc = best_scores.get(m.id)
                        is_mod_completed = (best_sc is not None and best_sc >= 3.0)
                    else:
                        is_mod_completed = (total_req > 0 and answered_req == total_req)
                    if is_mod_completed:
                        lnr_completed_mods += 1
                lnr_pct = (lnr_completed_mods / total_mods_count) * 100.0
                learner_pct_sum += lnr_pct
                if lnr_completed_mods == total_mods_count and total_mods_count > 0:
                    completed_learners += 1

            avg_pct = round(learner_pct_sum / len(learners), 1) if learners else 0.0

            # Count unique courses in curriculum (excluding None for course-less curriculum)
            unique_courses = {
                m.course_id or (m.level.course_id if m.level else None)
                for m in grp_modules
                if (m.course_id or (m.level.course_id if m.level else None)) is not None
            }

            return {
                "modules": grp_modules,
                "curriculum_items": curriculum_items,
                "unique_courses_count": len(unique_courses),
                "total_modules_count": total_mods_count,
                "average_completion_percentage": avg_pct,
                "completed_learners_count": completed_learners,
                "learners_count": len(learners),
            }

        # Cache group metrics to avoid recomputation across trainers with shared groups
        group_metrics_cache = {}
        for grp in all_active_groups:
            group_metrics_cache[grp.id] = get_group_curriculum_and_progress(grp)

        trainer_items = []
        trainers_with_assignments_count = 0
        system_distinct_candidates = set()

        for trn in trainers:
            assigned_groups = trainer_to_groups.get(trn.id, [])
            if assigned_groups:
                trainers_with_assignments_count += 1

            # Distinct active candidates for this trainer
            trn_distinct_candidates = set()
            trn_assigned_group_data = []
            trn_all_modules = {}
            trn_all_courses = set()
            group_pct_sum = 0.0

            for grp in assigned_groups:
                learners = group_to_learners.get(grp.id, [])
                for l in learners:
                    trn_distinct_candidates.add(l.id)
                    system_distinct_candidates.add(l.id)

                g_metrics = group_metrics_cache.get(grp.id, {})
                for m in g_metrics.get("modules", []):
                    trn_all_modules[m.id] = m
                    eff_cid = m.course_id or (m.level.course_id if m.level else None)
                    if eff_cid is not None:
                        trn_all_courses.add(eff_cid)

                group_pct_sum += g_metrics.get("average_completion_percentage", 0.0)

                trn_assigned_group_data.append({
                    "group_id": grp.id,
                    "group_name": grp.name,
                    "group_code": grp.code,
                    "candidate_type": grp.candidate_type.name if grp.candidate_type else None,
                    "active_candidates_count": g_metrics.get("learners_count", 0),
                    "assigned_courses_count": g_metrics.get("unique_courses_count", 0),
                    "assigned_modules_count": g_metrics.get("total_modules_count", 0),
                    "average_completion_percentage": g_metrics.get("average_completion_percentage", 0.0),
                    "completed_learners_count": g_metrics.get("completed_learners_count", 0),
                    "assigned_curriculum": g_metrics.get("curriculum_items", []),
                })

            overall_trainer_pct = (
                round(group_pct_sum / len(assigned_groups), 1)
                if assigned_groups
                else 0.0
            )

            trainer_name = trn.get_full_name().strip() or trn.username

            trainer_items.append({
                "trainer_id": trn.id,
                "trainer_name": trainer_name,
                "trainer_username": trn.username,
                "trainer_email": trn.email or "",
                "assigned_groups_count": len(assigned_groups),
                "distinct_candidates_count": len(trn_distinct_candidates),
                "total_assigned_courses_count": len(trn_all_courses),
                "total_assigned_modules_count": len(trn_all_modules),
                "overall_completion_percentage": overall_trainer_pct,
                "assigned_groups": trn_assigned_group_data,
            })

        data = {
            "total_trainers": len(trainers),
            "total_trainers_with_assignments": trainers_with_assignments_count,
            "total_assigned_cohorts": len(all_active_groups),
            "total_distinct_candidates_reached": len(system_distinct_candidates),
            "trainers": trainer_items,
        }
        serializer = AdminTrainerWorkloadResponseSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)



class AdminTrainerViewSet(viewsets.ViewSet):
    """
    Admin-only ViewSet for listing and creating TRAINER accounts.
    - GET /api/admin/trainers/
      Lists all existing users with role='TRAINER'. Omits passwords and internal security flags.
    - POST /api/admin/trainers/
      Creates a new user strictly assigned the 'TRAINER' role with validated credentials.
    """
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        role = _get_role(request.user)
        if role != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only LMS Administrators may manage trainers.")

    def list(self, request):
        self._require_admin(request)
        trainers = User.objects.filter(role=User.Role.TRAINER).order_by("username")
        serializer = AdminTrainerListSerializer(trainers, many=True)
        return Response(serializer.data)

    def create(self, request):
        self._require_admin(request)
        serializer = AdminCreateTrainerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        _log_audit(
            request,
            AuditAction.CREATE,
            "User",
            user.pk,
            {"username": user.username, "role": user.role, "email": user.email},
        )

        read_serializer = AdminTrainerListSerializer(user)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Trainer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target_user.role != User.Role.TRAINER:
            return Response(
                {"error": f"User with role '{target_user.role}' is not a trainer."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AdminTrainerListSerializer(target_user)
        return Response(serializer.data)

    def update(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Trainer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.role != User.Role.TRAINER:
            return Response(
                {"error": f"Cannot edit user with role '{target_user.role}'. Only trainer accounts can be edited here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AdminUpdateTrainerSerializer(target_user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_user = serializer.save()

        # Audit log for trainer update
        changed_fields = list(serializer.validated_data.keys())
        if "password" in changed_fields:
            changed_fields.remove("password")
            changed_fields.append("password_reset")

        _log_audit(
            request,
            AuditAction.UPDATE,
            "User",
            updated_user.pk,
            {
                "username": updated_user.username,
                "role": updated_user.role,
                "email": updated_user.email,
                "changed_fields": changed_fields,
            },
        )

        read_serializer = AdminTrainerListSerializer(updated_user)
        return Response(read_serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Trainer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.role != User.Role.TRAINER:
            return Response(
                {"error": f"Cannot deactivate user with role '{target_user.role}'. Only trainer accounts can be managed here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        has_active_assignments = TrainerGroupAssignment.objects.filter(
            trainer=target_user,
            is_active=True,
        ).exists()

        if has_active_assignments:
            return Response(
                {
                    "error": (
                        f"Cannot deactivate trainer @{target_user.username} with active group assignments. "
                        "Please remove or reassign their group allocations first."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not target_user.is_active:
            serializer = AdminTrainerListSerializer(target_user)
            return Response(
                {
                    "message": f"Trainer @{target_user.username} is already inactive.",
                    "trainer": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        target_user.is_active = False
        target_user.save(update_fields=["is_active"])

        _log_audit(
            request,
            AuditAction.UPDATE,
            "User",
            target_user.pk,
            {
                "action": "deactivate",
                "username": target_user.username,
                "role": target_user.role,
                "is_active": False,
            },
        )

        serializer = AdminTrainerListSerializer(target_user)
        return Response(
            {
                "message": f"Trainer @{target_user.username} deactivated successfully.",
                "trainer": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Trainer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.role != User.Role.TRAINER:
            return Response(
                {"error": f"Cannot activate user with role '{target_user.role}'. Only trainer accounts can be managed here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_user.is_active:
            serializer = AdminTrainerListSerializer(target_user)
            return Response(
                {
                    "message": f"Trainer @{target_user.username} is already active.",
                    "trainer": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        target_user.is_active = True
        target_user.save(update_fields=["is_active"])

        _log_audit(
            request,
            AuditAction.UPDATE,
            "User",
            target_user.pk,
            {
                "action": "activate",
                "username": target_user.username,
                "role": target_user.role,
                "is_active": True,
            },
        )

        serializer = AdminTrainerListSerializer(target_user)
        return Response(
            {
                "message": f"Trainer @{target_user.username} activated successfully.",
                "trainer": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Trainer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.pk == request.user.pk:
            return Response(
                {"error": "Administrators cannot delete their own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_user.role != User.Role.TRAINER:
            return Response(
                {"error": f"Cannot delete user with role '{target_user.role}'. Only trainer accounts can be deleted here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        has_active_assignments = TrainerGroupAssignment.objects.filter(
            trainer=target_user,
            is_active=True,
        ).exists()
        if has_active_assignments:
            return Response(
                {
                    "error": (
                        f"Cannot delete trainer @{target_user.username} with active group assignments. "
                        "Please remove or reassign their group allocations first, or deactivate the account."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if TrainerGroupAssignment.objects.filter(trainer=target_user).exists():
            return Response(
                {
                    "error": (
                        f"Cannot delete trainer @{target_user.username} because historical group assignments exist. "
                        "Permanent deletion would destroy historical cohort records. "
                        "Please deactivate the account instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        _log_audit(
            request,
            AuditAction.DELETE,
            "User",
            target_user.pk,
            {
                "username": target_user.username,
                "role": target_user.role,
                "email": target_user.email,
            },
        )

        username = target_user.username
        target_user.delete()

        return Response(
            {"message": f"Trainer @{username} permanently deleted."},
            status=status.HTTP_200_OK,
        )



class AdminLearnerViewSet(viewsets.ViewSet):
    """
    Admin-only ViewSet for managing registered LEARNER accounts.
    - GET /api/admin/learners/
      Lists all existing users with role='LEARNER'. Omits passwords and internal security flags.
      Includes inactive learners with is_active flag for UI indication.
    - DELETE /api/admin/learners/{id}/
      Permanently deletes a registered LEARNER account if safe (no active/historical memberships or responses).
    - POST /api/admin/learners/{id}/deactivate/
      Deactivates a learner account, preventing login while preserving historical data.
    - POST /api/admin/learners/{id}/activate/
      Reactivates an inactive learner account.
    """
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        role = _get_role(request.user)
        if role != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only LMS Administrators may view registered learners.")

    def list(self, request):
        self._require_admin(request)
        learners = User.objects.filter(role=User.Role.LEARNER).order_by("username")
        serializer = AdminLearnerListSerializer(learners, many=True)
        return Response(serializer.data)

    def destroy(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Learner not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.pk == request.user.pk:
            return Response(
                {"error": "Administrators cannot delete their own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_user.role != User.Role.LEARNER:
            return Response(
                {"error": f"Cannot delete user with role '{target_user.role}'. Only learner accounts can be deleted here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if GroupMembership.objects.filter(learner=target_user, is_active=True).exists():
            return Response(
                {
                    "error": (
                        f"Cannot delete learner @{target_user.username} with active group memberships. "
                        "Please remove them from groups first, or deactivate the account."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if GroupMembership.objects.filter(learner=target_user).exists():
            return Response(
                {
                    "error": (
                        f"Cannot delete learner @{target_user.username} because historical group memberships exist. "
                        "Permanent deletion would destroy historical cohort records. "
                        "Please deactivate the account instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ModuleQuestionResponse.objects.filter(learner=target_user).exists():
            return Response(
                {
                    "error": (
                        f"Cannot delete learner @{target_user.username} because recorded module responses exist. "
                        "Permanent deletion would destroy historical progress data. "
                        "Please deactivate the account instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        _log_audit(
            request,
            AuditAction.DELETE,
            "User",
            target_user.pk,
            {
                "username": target_user.username,
                "role": target_user.role,
                "email": target_user.email,
            },
        )

        username = target_user.username
        target_user.delete()

        return Response(
            {"message": f"Learner @{username} permanently deleted."},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Learner not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.role != User.Role.LEARNER:
            return Response(
                {"error": f"Cannot deactivate user with role '{target_user.role}'. Only learner accounts can be managed here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not target_user.is_active:
            serializer = AdminLearnerListSerializer(target_user)
            return Response(
                {
                    "message": f"Learner @{target_user.username} is already inactive.",
                    "learner": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        target_user.is_active = False
        target_user.save(update_fields=["is_active"])

        _log_audit(
            request,
            AuditAction.UPDATE,
            "User",
            target_user.pk,
            {
                "action": "deactivate",
                "username": target_user.username,
                "role": target_user.role,
                "is_active": False,
            },
        )

        serializer = AdminLearnerListSerializer(target_user)
        return Response(
            {
                "message": f"Learner @{target_user.username} deactivated successfully.",
                "learner": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "Learner not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.role != User.Role.LEARNER:
            return Response(
                {"error": f"Cannot activate user with role '{target_user.role}'. Only learner accounts can be managed here."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_user.is_active:
            serializer = AdminLearnerListSerializer(target_user)
            return Response(
                {
                    "message": f"Learner @{target_user.username} is already active.",
                    "learner": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        target_user.is_active = True
        target_user.save(update_fields=["is_active"])

        _log_audit(
            request,
            AuditAction.UPDATE,
            "User",
            target_user.pk,
            {
                "action": "activate",
                "username": target_user.username,
                "role": target_user.role,
                "is_active": True,
            },
        )

        serializer = AdminLearnerListSerializer(target_user)
        return Response(
            {
                "message": f"Learner @{target_user.username} activated successfully.",
                "learner": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class AdminUserViewSet(viewsets.ViewSet):
    """
    TalentLMS-style Admin User Management ViewSet:
    - GET /api/admin/users/
      Lists all LMS users with search (?search=), role filter (?role=), status filter (?status=).
      Pagination support (?page=, ?page_size=).
    - POST /api/admin/users/
      Creates a new user (Admin, Trainer, Learner) with validated email, credentials, and role.
    - POST /api/admin/users/{id}/activate/
      Activates the user account (is_active = True).
    - POST /api/admin/users/{id}/deactivate/
      Deactivates the user account (is_active = False), preventing login while preserving historical data.
    """
    permission_classes = [IsAuthenticated]

    def _require_admin(self, request):
        role = _get_role(request.user)
        if role != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only LMS Administrators may access user management.")

    def list(self, request):
        self._require_admin(request)
        queryset = User.objects.all().order_by("-date_joined")

        # 1. Search by name (first_name, last_name) or email or username
        search_query = request.query_params.get("search", "").strip()
        if search_query:
            queryset = queryset.filter(
                Q(first_name__icontains=search_query)
                | Q(last_name__icontains=search_query)
                | Q(email__icontains=search_query)
                | Q(username__icontains=search_query)
            )

        # 2. Filter by user type (role)
        role_filter = request.query_params.get("role", "").strip().upper()
        if role_filter in ("ADMIN", "TRAINER", "LEARNER"):
            queryset = queryset.filter(role=role_filter)

        # 3. Filter by status (active / inactive)
        status_filter = request.query_params.get("status", "").strip().lower()
        if status_filter in ("active", "true", "1"):
            queryset = queryset.filter(is_active=True)
        elif status_filter in ("inactive", "false", "0"):
            queryset = queryset.filter(is_active=False)

        # Pagination support (optional, default returns all or paginated if page param is provided)
        page_param = request.query_params.get("page")
        if page_param:
            try:
                page_num = max(1, int(page_param))
            except ValueError:
                page_num = 1
            page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
            total_count = queryset.count()
            start = (page_num - 1) * page_size
            end = start + page_size
            page_users = queryset[start:end]
            serializer = AdminUserListSerializer(page_users, many=True)
            return Response({
                "count": total_count,
                "page": page_num,
                "page_size": page_size,
                "total_pages": (total_count + page_size - 1) // page_size if total_count > 0 else 1,
                "results": serializer.data,
            })

        serializer = AdminUserListSerializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = AdminUserListSerializer(target_user)
        return Response(serializer.data)

    def create(self, request):
        self._require_admin(request)
        serializer = AdminCreateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        _log_audit(
            request,
            AuditAction.CREATE,
            "User",
            user.pk,
            {
                "username": user.username,
                "role": user.role,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "is_active": user.is_active,
            },
        )

        read_serializer = AdminUserListSerializer(user)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Safety restriction: An admin cannot deactivate their own active session account
        if target_user.pk == request.user.pk:
            return Response(
                {"error": "You cannot deactivate your own administrative account while logged in."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not target_user.is_active:
            serializer = AdminUserListSerializer(target_user)
            return Response(
                {
                    "message": f"User @{target_user.username} is already inactive.",
                    "user": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        target_user.is_active = False
        target_user.save(update_fields=["is_active"])

        _log_audit(
            request,
            AuditAction.UPDATE,
            "User",
            target_user.pk,
            {
                "action": "deactivate",
                "username": target_user.username,
                "role": target_user.role,
                "is_active": False,
            },
        )

        serializer = AdminUserListSerializer(target_user)
        return Response(
            {
                "message": f"User @{target_user.username} deactivated successfully.",
                "user": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        self._require_admin(request)
        try:
            target_user = User.objects.get(pk=pk)
        except (User.DoesNotExist, ValueError):
            return Response(
                {"error": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if target_user.is_active:
            serializer = AdminUserListSerializer(target_user)
            return Response(
                {
                    "message": f"User @{target_user.username} is already active.",
                    "user": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        target_user.is_active = True
        target_user.save(update_fields=["is_active"])

        _log_audit(
            request,
            AuditAction.UPDATE,
            "User",
            target_user.pk,
            {
                "action": "activate",
                "username": target_user.username,
                "role": target_user.role,
                "is_active": True,
            },
        )

        serializer = AdminUserListSerializer(target_user)
        return Response(
            {
                "message": f"User @{target_user.username} activated successfully.",
                "user": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ReportsViewSet(viewsets.ViewSet):
    """
    Unified Reports API ViewSet (Phase 6):
    - GET /api/reports/overview/
      Section A: High-level overview metrics (total learners, courses, enrollments,
      completed, in-progress, not-started, and overall completion percentage).
    - GET /api/reports/learner-performance/
      Section B: Learner assessment performance scores and submission history.
    - GET /api/reports/course-progress/
      Section C: Course-wise and independent-Level completion breakdown and average progress rates.

    Role Permissions:
    - ADMIN: Full visibility across all learners and published curriculum. Supports searching and filtering.
    - TRAINER: Strictly scoped to assigned learners and assigned curriculum across active trainer cohorts.
    - LEARNER: Strictly scoped to the authenticated learner's own assignments and scores.
    """
    permission_classes = [IsAuthenticated]

    def _get_published_modules_for_assignments(self, assignments):
        """
        Resolves distinct published Modules granted by *assignments* (Course, Level, or Module).
        Includes direct Course modules, hybrid modules (module.course=None, module.level.course=Course),
        exact Level modules (without sibling Levels), and direct Module targets.
        Excludes any draft modules or modules belonging to draft courses.
        """
        _, assigned_level_ids, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)
        return (
            Module.objects.filter(status=PublicationStatus.PUBLISHED)
            .filter(Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED))
            .filter(Q(level__course__isnull=True) | Q(level__course__status=PublicationStatus.PUBLISHED))
            .filter(
                Q(course_id__in=assigned_crs_ids)
                | Q(level__course_id__in=assigned_crs_ids)
                | Q(level_id__in=assigned_level_ids)
                | Q(id__in=assigned_mod_ids)
            )
            .select_related("course", "level", "level__course")
            .distinct()
        )

    def _get_scoped_learner_modules(self, learner, accessible_module_ids=None):
        """
        Returns a distinct, deterministically ordered queryset of published Modules
        personally assigned to *learner* and within *accessible_module_ids* (when supplied).
        Combines _get_distinct_assigned_modules_for_learner with hybrid Course-level module support.
        """
        learner_ta = _get_active_learner_assignments(learner)
        base_qs = (
            _get_distinct_assigned_modules_for_learner(learner)
            | self._get_published_modules_for_assignments(learner_ta)
        ).select_related("course", "level", "level__course").distinct()
        if accessible_module_ids is not None:
            base_qs = base_qs.filter(id__in=accessible_module_ids)
        return base_qs.order_by("level__order", "order", "id")

    def _get_accessible_learners_and_curriculum(self, user):
        """
        Determines the role-scoped learners, accessible published Modules, and effective Course IDs
        accessible by *user*:
        Returns (learners_qs, accessible_modules_qs, accessible_course_ids)
        """
        role = _get_role(user)
        if role == User.Role.ADMIN:
            learners_qs = User.objects.filter(role=User.Role.LEARNER)
            accessible_modules_qs = (
                Module.objects.filter(status=PublicationStatus.PUBLISHED)
                .filter(Q(course__isnull=True) | Q(course__status=PublicationStatus.PUBLISHED))
                .filter(Q(level__course__isnull=True) | Q(level__course__status=PublicationStatus.PUBLISHED))
                .select_related("course", "level", "level__course")
                .distinct()
            )
            course_ids = set(
                Course.objects.filter(status=PublicationStatus.PUBLISHED).values_list("id", flat=True)
            )
            return learners_qs, accessible_modules_qs, course_ids

        if role == User.Role.TRAINER:
            trainer_groups = LearnerGroup.objects.filter(
                trainer_assignments__trainer=user,
                trainer_assignments__is_active=True,
                is_active=True,
            )
            learners_qs = User.objects.filter(
                role=User.Role.LEARNER,
                group_memberships__group__in=trainer_groups,
                group_memberships__is_active=True,
            ).distinct()

            assignments = _get_active_trainer_assignments(user)
            accessible_modules_qs = self._get_published_modules_for_assignments(assignments)
            _, _, _, _, raw_course_ids = _get_curriculum_targets(assignments)
            published_course_ids = set(
                Course.objects.filter(
                    id__in=raw_course_ids, status=PublicationStatus.PUBLISHED
                ).values_list("id", flat=True)
            )
            for m in accessible_modules_qs:
                eff_cid = m.course_id or (m.level.course_id if m.level else None)
                if eff_cid is not None:
                    published_course_ids.add(eff_cid)
            return learners_qs, accessible_modules_qs, published_course_ids

        if role == User.Role.LEARNER:
            learners_qs = User.objects.filter(id=user.id)
            assignments = _get_active_learner_assignments(user)
            accessible_modules_qs = self._get_scoped_learner_modules(user)
            _, _, _, _, raw_course_ids = _get_curriculum_targets(assignments)
            published_course_ids = set(
                Course.objects.filter(
                    id__in=raw_course_ids, status=PublicationStatus.PUBLISHED
                ).values_list("id", flat=True)
            )
            for m in accessible_modules_qs:
                eff_cid = m.course_id or (m.level.course_id if m.level else None)
                if eff_cid is not None:
                    published_course_ids.add(eff_cid)
            return learners_qs, accessible_modules_qs, published_course_ids

        return User.objects.none(), Module.objects.none(), set()

    def _get_accessible_learners_and_courses(self, user):
        """
        Backward-compatible wrapper returning (learners_qs, accessible_course_ids).
        """
        learners_qs, _, accessible_course_ids = self._get_accessible_learners_and_curriculum(user)
        return learners_qs, accessible_course_ids

    def _get_modules_completion_status_for_learner(self, learner, modules):
        """
        Computes completion status and percentage for *learner* across an explicitly scoped,
        deduplicated collection of published *modules*.
        Preserves established completion rules:
        - 5+ required questions: requires best ModuleAssessmentAttempt.score >= 3.0
        - <5 required questions: requires total_req > 0 and answered_req == total_req
        Returns:
            status_label: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'
            percentage: float (0.0 to 100.0)
            total_modules: int
            completed_modules: int
        """
        unique_modules = list({m.id: m for m in modules}.values())
        total_modules = len(unique_modules)
        if total_modules == 0:
            return "NOT_STARTED", 0.0, 0, 0

        module_ids = [m.id for m in unique_modules]

        req_questions = ModuleQuestion.objects.filter(
            module_id__in=module_ids,
            is_active=True,
            is_required=True,
        ).values("id", "module_id")

        module_req_map = defaultdict(set)
        for q in req_questions:
            module_req_map[q["module_id"]].add(q["id"])

        all_req_q_ids = [q["id"] for q in req_questions]
        answered_q_ids = set(
            ModuleQuestionResponse.objects.filter(
                question_id__in=all_req_q_ids,
                learner=learner,
            ).values_list("question_id", flat=True)
        )

        attempts = ModuleAssessmentAttempt.objects.filter(
            module_id__in=module_ids,
            learner=learner,
        ).values("module_id", "score")
        module_best_score_map = {}
        for att in attempts:
            mid = att["module_id"]
            sc = att["score"]
            if sc is not None:
                if mid not in module_best_score_map or sc > module_best_score_map[mid]:
                    module_best_score_map[mid] = sc

        completed_modules = 0
        has_started_any = len(answered_q_ids) > 0 or len(attempts) > 0

        for m in unique_modules:
            req_set = module_req_map.get(m.id, set())
            total_req = len(req_set)
            answered_req = len(req_set.intersection(answered_q_ids))
            if total_req >= 5:
                best_sc = module_best_score_map.get(m.id)
                if best_sc is not None and best_sc >= 3.0:
                    completed_modules += 1
            else:
                if total_req > 0 and answered_req == total_req:
                    completed_modules += 1

        percentage = round((completed_modules / total_modules) * 100.0, 1)

        if completed_modules == total_modules and total_modules > 0:
            status_label = "COMPLETED"
        elif has_started_any or completed_modules > 0:
            status_label = "IN_PROGRESS"
        else:
            status_label = "NOT_STARTED"

        return status_label, percentage, total_modules, completed_modules

    def _get_course_completion_status_for_learner(self, learner, course, scoped_modules=None):
        """
        Computes the completion status and percentage for a given learner in a course.
        When *scoped_modules* is supplied, evaluates strictly those modules.
        Otherwise resolves the learner's assigned published modules belonging to *course*
        (including hybrid level.course modules, excluding unassigned sibling levels).
        """
        if scoped_modules is not None:
            return self._get_modules_completion_status_for_learner(learner, scoped_modules)

        learner_course_mods = list(
            self._get_scoped_learner_modules(learner).filter(
                Q(course=course) | Q(level__course=course)
            )
        )
        if not learner_course_mods:
            learner_course_mods = list(
                Module.objects.filter(status=PublicationStatus.PUBLISHED)
                .filter(Q(course=course) | Q(level__course=course))
                .select_related("course", "level", "level__course")
                .order_by("level__order", "order", "id")
            )
        return self._get_modules_completion_status_for_learner(learner, learner_course_mods)

    def _group_learner_modules_into_enrollments(self, learner_mods):
        """
        Groups a learner's scoped published modules into logical curriculum enrollments:
        1. Course-backed enrollments (grouped by effective Course: m.course or m.level.course).
        2. Independent-Level enrollments (where effective Course is None, grouped by m.level).
        Returns a list of dicts:
            {
                "course": Course | None,
                "level": CourseLevel | None,   # set if all modules in this enrollment share one Level
                "modules": [Module, ...],
            }
        """
        course_groups = {}
        course_objs = {}
        ind_level_groups = {}
        ind_level_objs = {}

        for m in learner_mods:
            eff_course = m.course or (m.level.course if m.level else None)
            if eff_course is not None:
                course_objs[eff_course.id] = eff_course
                course_groups.setdefault(eff_course.id, []).append(m)
            elif m.level is not None:
                ind_level_objs[m.level_id] = m.level
                ind_level_groups.setdefault(m.level_id, []).append(m)

        enrollments = []
        for cid in sorted(course_groups.keys()):
            mods = course_groups[cid]
            distinct_levels = {m.level_id: m.level for m in mods if m.level is not None}
            single_level = next(iter(distinct_levels.values())) if len(distinct_levels) == 1 else None
            enrollments.append({
                "course": course_objs[cid],
                "level": single_level,
                "modules": mods,
            })

        for lid in sorted(
            ind_level_groups.keys(),
            key=lambda k: (ind_level_objs[k].order if ind_level_objs[k].order is not None else 0, k),
        ):
            mods = ind_level_groups[lid]
            enrollments.append({
                "course": None,
                "level": ind_level_objs[lid],
                "modules": mods,
            })

        return enrollments

    @action(detail=False, methods=["get"], url_path="overview")
    def overview(self, request):
        """
        Section A: Overview Metrics dashboard.
        """
        user = request.user
        learners_qs, accessible_modules_qs, accessible_course_ids = (
            self._get_accessible_learners_and_curriculum(user)
        )
        total_learners = learners_qs.count()

        # Backward-compatible Course count: accessible published Courses (not independent Levels)
        courses_qs = Course.objects.filter(id__in=accessible_course_ids, status=PublicationStatus.PUBLISHED)
        total_courses = courses_qs.count()

        accessible_module_ids = set(accessible_modules_qs.values_list("id", flat=True))

        # Enrollments & status counts
        total_enrollments = 0
        completed_enrollments = 0
        in_progress_enrollments = 0
        not_started_enrollments = 0
        total_pct_sum = 0.0

        learners_progress = []

        for learner in learners_qs:
            learner_mods = list(self._get_scoped_learner_modules(learner, accessible_module_ids))
            enrollments = self._group_learner_modules_into_enrollments(learner_mods)

            for enr in enrollments:
                all_mods = enr["modules"]
                total_req_modules = len(all_mods)
                if total_req_modules == 0:
                    continue

                total_enrollments += 1
                c_status, pct, _, _ = self._get_modules_completion_status_for_learner(learner, all_mods)
                total_pct_sum += pct
                if c_status == "COMPLETED":
                    completed_enrollments += 1
                elif c_status == "IN_PROGRESS":
                    in_progress_enrollments += 1
                else:
                    not_started_enrollments += 1

                comp_count = 0
                in_prog_count = 0
                not_start_count = 0
                modules_prog_list = []
                ar_list = []

                for m in all_mods:
                    req_q = ModuleQuestion.objects.filter(module=m, is_active=True, is_required=True)
                    tot_q = req_q.count()
                    answered_q = ModuleQuestionResponse.objects.filter(question__in=req_q, learner=learner).count()

                    # Query all attempts for this module & learner
                    attempts_qs = ModuleAssessmentAttempt.objects.filter(module=m, learner=learner).order_by("-attempt_number")
                    attempt_count = attempts_qs.count()
                    best_att = attempts_qs.order_by("-score", "-attempt_number").first()
                    latest_att = attempts_qs.first()

                    # A module is an assessment module if it has assessment questions or attempts
                    is_tested = (tot_q >= 5) or (attempt_count > 0) or ModuleQuestion.objects.filter(
                        module=m, is_active=True, question_type="MULTIPLE_CHOICE"
                    ).exists()

                    best_score = best_att.score if best_att else None
                    tot_possible = float(best_att.total_possible) if (best_att and best_att.total_possible is not None) else (float(tot_q) if tot_q > 0 else 5.0)

                    m_level_id = m.level_id
                    m_level_name = m.level.name if m.level else None

                    if is_tested:
                        # Existing LMS policy: 3/5 (60%) or percentage >= 60% is PASS
                        passing_score = 3.0 if tot_possible == 5.0 else (0.6 * tot_possible)
                        has_passed = (best_score is not None and best_score >= passing_score)
                        latest_completed = bool(latest_att and latest_att.is_completed)

                        pct_score = None
                        if best_score is not None and tot_possible > 0:
                            pct_score = round((best_score / tot_possible) * 100.0, 1)

                        if best_score is not None and has_passed:
                            res = "PASS"
                            mod_status = "COMPLETED"
                            comp_count += 1
                        elif best_score is not None and latest_completed:
                            res = "FAIL"
                            mod_status = "IN PROGRESS"
                            in_prog_count += 1
                        elif answered_q > 0 or attempt_count > 0:
                            res = "IN PROGRESS"
                            mod_status = "IN PROGRESS"
                            in_prog_count += 1
                        else:
                            res = "NOT STARTED"
                            mod_status = "NOT STARTED"
                            not_start_count += 1

                        score_disp = f"{int(best_score) if best_score.is_integer() else best_score}/{int(tot_possible) if tot_possible.is_integer() else tot_possible}" if best_score is not None else "—"
                        last_attempt_time = latest_att.completed_at or latest_att.started_at if latest_att else None

                        ar_list.append({
                            "module_id": m.id,
                            "module_name": m.name,
                            "level_id": m_level_id,
                            "level_name": m_level_name,
                            "score_display": score_disp,
                            "score": best_score,
                            "total_possible": tot_possible,
                            "percentage": pct_score,
                            "result": res,
                            "attempts_count": attempt_count,
                            "last_attempt_at": last_attempt_time,
                            "completion_status": "Completed" if has_passed else ("In Progress" if (answered_q > 0 or attempt_count > 0) else "Not Completed"),
                            "is_completed": has_passed,
                            "is_assessment": True,
                        })
                    else:
                        if tot_q > 0 and answered_q == tot_q:
                            mod_status = "COMPLETED"
                            comp_count += 1
                        elif answered_q > 0:
                            mod_status = "IN PROGRESS"
                            in_prog_count += 1
                        else:
                            mod_status = "NOT STARTED"
                            not_start_count += 1
                        res = "—"
                        score_disp = "—"

                    modules_prog_list.append({
                        "module_id": m.id,
                        "module_name": m.name,
                        "level_id": m_level_id,
                        "level_name": m_level_name,
                        "is_tested_module": is_tested,
                        "total_required_questions": tot_q,
                        "answered_required_questions": answered_q,
                        "score_display": score_disp,
                        "result": res,
                        "status": mod_status,
                    })

                progress_pct = round((comp_count / total_req_modules) * 100.0, 1)
                if comp_count == total_req_modules:
                    enr_status = "COMPLETED"
                elif comp_count > 0 or in_prog_count > 0:
                    enr_status = "IN_PROGRESS"
                else:
                    enr_status = "NOT_STARTED"

                course_obj = enr["course"]
                level_obj = enr["level"]
                enr_level_id = level_obj.id if level_obj else None
                enr_level_name = level_obj.name if level_obj else None
                enr_course_id = course_obj.id if course_obj else None
                enr_course_name = course_obj.name if course_obj else enr_level_name

                learner_name = learner.get_full_name().strip() or learner.username
                learners_progress.append({
                    "learner_id": learner.id,
                    "learner_name": learner_name,
                    "learner_username": learner.username,
                    "learner_email": learner.email or "",
                    "course_id": enr_course_id,
                    "course_name": enr_course_name,
                    "level_id": enr_level_id,
                    "level_name": enr_level_name,
                    "enrollment_status": enr_status,
                    "overall_progress_percentage": progress_pct,
                    "total_required_modules": total_req_modules,
                    "completed_modules": comp_count,
                    "in_progress_modules": in_prog_count,
                    "not_started_modules": not_start_count,
                    "assessment_results": ar_list,
                    "modules_progress": modules_prog_list,
                })

        overall_completion_pct = (
            round(total_pct_sum / total_enrollments, 1)
            if total_enrollments > 0
            else 0.0
        )

        data = {
            "total_learners": total_learners,
            "total_courses": total_courses,
            "total_assigned_enrollments": total_enrollments,
            "completed_courses": completed_enrollments,
            "in_progress_courses": in_progress_enrollments,
            "not_started_courses": not_started_enrollments,
            "overall_completion_percentage": overall_completion_pct,
            "learners_progress": learners_progress,
        }
        serializer = ReportOverviewSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="learner-performance")
    def learner_performance(self, request):
        """
        Section B: Learner Performance Report.
        Strict scoring rules:
        - Displays actual recorded scores only.
        - If scored assessment functionality is not supported/recorded for content,
          records is_scored=False with null scores and clear indicator.
        - Applies role-based scoping (Admin: all, Trainer: assigned learners, Learner: self)
          AND restricts each learner's responses to modules personally assigned to that learner.
        - Supports ?search= (name/email/username), ?course= (id), ?level= (id), and ?learner= (id).
        """
        user = request.user
        learners_qs, accessible_modules_qs, _ = self._get_accessible_learners_and_curriculum(user)

        # Filters
        search_query = request.query_params.get("search", "").strip()
        if search_query:
            learners_qs = learners_qs.filter(
                Q(first_name__icontains=search_query)
                | Q(last_name__icontains=search_query)
                | Q(email__icontains=search_query)
                | Q(username__icontains=search_query)
            )

        learner_id_filter = request.query_params.get("learner")
        if learner_id_filter:
            learners_qs = learners_qs.filter(id=learner_id_filter)

        course_id_filter = request.query_params.get("course")
        if course_id_filter:
            try:
                cid = int(course_id_filter)
                accessible_modules_qs = accessible_modules_qs.filter(
                    Q(course_id=cid) | Q(level__course_id=cid)
                )
            except ValueError:
                accessible_modules_qs = Module.objects.none()

        level_id_filter = request.query_params.get("level")
        if level_id_filter:
            try:
                lid = int(level_id_filter)
                accessible_modules_qs = accessible_modules_qs.filter(level_id=lid)
            except ValueError:
                accessible_modules_qs = Module.objects.none()

        # Specific learner inspection endpoint
        inspect_learner_id = request.query_params.get("inspect_learner")

        accessible_module_ids = set(accessible_modules_qs.values_list("id", flat=True))
        learner_allowed_mod_ids = {}
        for lnr in learners_qs:
            learner_allowed_mod_ids[lnr.id] = set(
                self._get_scoped_learner_modules(lnr, accessible_module_ids).values_list("id", flat=True)
            )

        # Query responses for accessible learners & accessible modules
        responses = ModuleQuestionResponse.objects.filter(
            learner__in=learners_qs,
            question__module_id__in=accessible_module_ids,
        ).select_related(
            "learner",
            "attempt",
            "question",
            "question__module",
            "question__module__course",
            "question__module__level",
            "question__module__level__course",
        ).order_by("-submitted_at")

        results = []
        for r in responses:
            # Strictly enforce that the response's module is personally assigned to r.learner
            if r.question.module_id not in learner_allowed_mod_ids.get(r.learner_id, set()):
                continue

            # Check for scored assessment fields in response_payload or linked attempt
            payload = r.response_payload if isinstance(r.response_payload, dict) else {}
            has_score = (
                "score" in payload
                or "marks_obtained" in payload
                or "marks" in payload
                or (r.attempt_id is not None)
            )

            marks_obtained = None
            total_marks = None
            percentage = None

            if has_score:
                try:
                    if "marks_obtained" in payload or "score" in payload or "marks" in payload:
                        marks_obtained = float(payload.get("marks_obtained", payload.get("score", payload.get("marks"))))
                        tot = payload.get("total_marks", payload.get("max_score", payload.get("total")))
                        if tot is not None:
                            total_marks = float(tot)
                            percentage = round((marks_obtained / total_marks) * 100.0, 1) if total_marks > 0 else 0.0
                    elif r.attempt:
                        marks_obtained = float(r.attempt.score)
                        total_marks = float(r.attempt.total_possible or 5.0)
                        percentage = float(r.attempt.percentage) if r.attempt.percentage is not None else (round((marks_obtained / total_marks) * 100.0, 1) if total_marks > 0 else 0.0)
                except (ValueError, TypeError, ZeroDivisionError):
                    marks_obtained = None
                    total_marks = None
                    percentage = None

            learner_full_name = r.learner.get_full_name().strip() or r.learner.username
            mod = r.question.module
            eff_course = mod.course or (mod.level.course if mod.level else None)

            results.append({
                "learner_id": r.learner.id,
                "learner_name": learner_full_name,
                "email": r.learner.email or "",
                "course_id": eff_course.id if eff_course else None,
                "course_name": eff_course.name if eff_course else None,
                "level_id": mod.level_id,
                "level_name": mod.level.name if mod.level else None,
                "module_id": mod.id,
                "module_name": mod.name,
                "assessment_name": r.question.question_text[:100],
                "attempt_number": r.attempt.attempt_number if r.attempt else 1,
                "marks_obtained": marks_obtained,
                "total_marks": total_marks,
                "percentage": percentage,
                "submission_date": r.submitted_at,
                "is_scored": has_score and (marks_obtained is not None),
            })

        # If inspect_learner parameter is provided, compile their scoped Course & independent-Level breakdown
        learner_profile_data = None
        if inspect_learner_id:
            try:
                inspected_learner = learners_qs.get(id=inspect_learner_id)
                inspected_mods = list(
                    self._get_scoped_learner_modules(inspected_learner, accessible_module_ids)
                )
                enrollments = self._group_learner_modules_into_enrollments(inspected_mods)

                course_summaries = []
                for enr in enrollments:
                    mods = enr["modules"]
                    c_obj = enr["course"]
                    l_obj = enr["level"]
                    c_status, pct, tot_m, comp_m = self._get_modules_completion_status_for_learner(
                        inspected_learner, mods
                    )
                    course_summaries.append({
                        "course_id": c_obj.id if c_obj else None,
                        "course_name": c_obj.name if c_obj else (l_obj.name if l_obj else None),
                        "level_id": l_obj.id if l_obj else None,
                        "level_name": l_obj.name if l_obj else None,
                        "status": c_status,
                        "completion_percentage": pct,
                        "total_modules": tot_m,
                        "completed_modules": comp_m,
                    })

                learner_profile_data = {
                    "id": inspected_learner.id,
                    "name": inspected_learner.get_full_name().strip() or inspected_learner.username,
                    "email": inspected_learner.email or "",
                    "courses": course_summaries,
                }
            except (User.DoesNotExist, ValueError):
                learner_profile_data = None

        return Response({
            "scoring_engine_available": False,
            "notice": "The LMS currently records completion acknowledgment responses. Scored tests/quizzes will populate here when assessment score attributes are present.",
            "results": results,
            "inspected_learner": learner_profile_data,
        })

    @action(detail=False, methods=["get"], url_path="course-progress")
    def course_progress(self, request):
        """
        Section C: Course Progress Report.
        Course-wise and independent-Level progress metrics across assigned learners.
        Supports ?search= (course/level name), ?course= (id), and ?level= (id).
        """
        user = request.user
        learners_qs, accessible_modules_qs, accessible_course_ids = (
            self._get_accessible_learners_and_curriculum(user)
        )

        search_query = request.query_params.get("search", "").strip()
        course_id_filter = request.query_params.get("course")
        level_id_filter = request.query_params.get("level")

        courses_qs = Course.objects.filter(
            id__in=accessible_course_ids, status=PublicationStatus.PUBLISHED
        ).order_by("name")

        if search_query:
            courses_qs = courses_qs.filter(name__icontains=search_query)

        if course_id_filter:
            try:
                cid = int(course_id_filter)
                courses_qs = courses_qs.filter(id=cid)
                accessible_modules_qs = accessible_modules_qs.filter(
                    Q(course_id=cid) | Q(level__course_id=cid)
                )
            except ValueError:
                courses_qs = Course.objects.none()
                accessible_modules_qs = Module.objects.none()

        if level_id_filter:
            try:
                lid = int(level_id_filter)
                accessible_modules_qs = accessible_modules_qs.filter(level_id=lid)
                level_course_ids = {
                    m.course_id or (m.level.course_id if m.level else None)
                    for m in accessible_modules_qs
                    if (m.course_id or (m.level.course_id if m.level else None)) is not None
                }
                courses_qs = courses_qs.filter(id__in=level_course_ids)
            except ValueError:
                courses_qs = Course.objects.none()
                accessible_modules_qs = Module.objects.none()

        accessible_module_ids = set(accessible_modules_qs.values_list("id", flat=True))

        # Map each course_id -> {learner_id: (learner, [scoped_modules])}
        # and each independent level_id -> {learner_id: (learner, [scoped_modules])}
        course_learner_mods = defaultdict(dict)
        ind_level_learner_mods = defaultdict(dict)
        ind_levels_by_id = {}

        # Also track accessible independent levels that have published modules in scope
        for m in accessible_modules_qs:
            eff_course = m.course or (m.level.course if m.level else None)
            if eff_course is None and m.level is not None:
                ind_levels_by_id[m.level_id] = m.level

        for learner in learners_qs:
            l_mods = list(self._get_scoped_learner_modules(learner, accessible_module_ids))
            for enr in self._group_learner_modules_into_enrollments(l_mods):
                c_obj = enr["course"]
                l_obj = enr["level"]
                mods = enr["modules"]
                if c_obj is not None:
                    course_learner_mods[c_obj.id][learner.id] = (learner, mods, l_obj)
                elif l_obj is not None:
                    ind_levels_by_id[l_obj.id] = l_obj
                    ind_level_learner_mods[l_obj.id][learner.id] = (learner, mods)

        items = []
        for course in courses_qs:
            learner_entries = list(course_learner_mods.get(course.id, {}).values())
            assigned_count = len(learner_entries)

            completed_count = 0
            in_progress_count = 0
            not_started_count = 0
            pct_sum = 0.0
            single_levels = set()

            for learner, scoped_mods, l_obj in learner_entries:
                if l_obj is not None:
                    single_levels.add((l_obj.id, l_obj.name))
                else:
                    single_levels.add((None, None))
                c_status, pct, _, _ = self._get_course_completion_status_for_learner(
                    learner, course, scoped_modules=scoped_mods
                )
                pct_sum += pct
                if c_status == "COMPLETED":
                    completed_count += 1
                elif c_status == "IN_PROGRESS":
                    in_progress_count += 1
                else:
                    not_started_count += 1

            avg_pct = round(pct_sum / assigned_count, 1) if assigned_count > 0 else 0.0
            if len(single_levels) == 1:
                c_lvl_id, c_lvl_name = next(iter(single_levels))
            else:
                c_lvl_id, c_lvl_name = None, None

            items.append({
                "course_id": course.id,
                "course_name": course.name,
                "level_id": c_lvl_id,
                "level_name": c_lvl_name,
                "assigned_learners_count": assigned_count,
                "completed_learners_count": completed_count,
                "in_progress_learners_count": in_progress_count,
                "not_started_learners_count": not_started_count,
                "average_completion_percentage": avg_pct,
            })

        # Include independent-Level progress entries when not filtering for a specific Course ID
        if not course_id_filter:
            sorted_ind_levels = sorted(
                ind_levels_by_id.values(),
                key=lambda lvl: (lvl.order if lvl.order is not None else 0, lvl.name.lower(), lvl.id),
            )
            for lvl in sorted_ind_levels:
                if search_query and search_query.lower() not in lvl.name.lower():
                    continue
                learner_entries = list(ind_level_learner_mods.get(lvl.id, {}).values())
                assigned_count = len(learner_entries)
                # For Admin, only include independent Levels that have assigned learners or when explicitly filtered by level
                if assigned_count == 0 and _get_role(user) == User.Role.ADMIN and not level_id_filter:
                    continue

                completed_count = 0
                in_progress_count = 0
                not_started_count = 0
                pct_sum = 0.0

                for learner, scoped_mods in learner_entries:
                    l_status, pct, _, _ = self._get_modules_completion_status_for_learner(
                        learner, scoped_mods
                    )
                    pct_sum += pct
                    if l_status == "COMPLETED":
                        completed_count += 1
                    elif l_status == "IN_PROGRESS":
                        in_progress_count += 1
                    else:
                        not_started_count += 1

                avg_pct = round(pct_sum / assigned_count, 1) if assigned_count > 0 else 0.0

                items.append({
                    "course_id": None,
                    "course_name": lvl.name,
                    "level_id": lvl.id,
                    "level_name": lvl.name,
                    "assigned_learners_count": assigned_count,
                    "completed_learners_count": completed_count,
                    "in_progress_learners_count": in_progress_count,
                    "not_started_learners_count": not_started_count,
                    "average_completion_percentage": avg_pct,
                })

        serializer = ReportCourseProgressItemSerializer(items, many=True)
        return Response(serializer.data)


# =============================================================================
# 19. Admin Training Materials & File Management ViewSet
# =============================================================================

class TrainingFileViewSet(viewsets.ModelViewSet):
    """
    Dedicated ViewSet for LMS Administrators to upload, inspect, search,
    and securely download raw training files and materials.
    Restricted strictly to administrators (IsLMSAdmin).
    Files are stored in local media storage (extensible to AWS S3) and kept
    completely separate from courses, modules, and learner lessons.
    """
    serializer_class = TrainingFileSerializer
    permission_classes = [IsAuthenticated, IsLMSAdmin]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = TrainingFile.objects.all()
        # Optional search filtering by filename or folder
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(filename__icontains=q) | Q(relative_path__icontains=q))

        file_type = self.request.query_params.get("type", "").strip().upper()
        if file_type and file_type != "ALL":
            qs = qs.filter(file_type=file_type)

        return qs

    @action(detail=False, methods=["post"], url_path="upload")
    def upload_files(self, request):
        """
        Batch-based upload endpoint supporting folder hierarchies.
        Accepts multipart files and optional relative paths (via 'relative_path' or 'relative_paths[]').
        Computes SHA-256 checksums to detect and prevent duplicate content.
        Returns detailed summary of created, skipped (duplicate), and failed files.
        """
        uploaded_files = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not uploaded_files:
            return Response(
                {"error": "No files provided in the upload request. Please select files to upload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Handle optional relative paths aligned with the files list
        rel_paths = request.data.getlist("relative_paths") or request.data.getlist("relative_paths[]")
        single_rel_path = request.data.get("relative_path", "").strip()

        created_files = []
        skipped_duplicates = []
        failed_files = []

        for idx, file_obj in enumerate(uploaded_files):
            orig_name = file_obj.name
            try:
                # 1. Determine relative path
                if rel_paths and idx < len(rel_paths):
                    raw_rel = rel_paths[idx]
                elif single_rel_path:
                    raw_rel = single_rel_path
                else:
                    raw_rel = orig_name

                # Sanitize relative path to prevent directory traversal
                clean_rel_path = sanitize_relative_path(raw_rel)
                clean_filename = os.path.basename(clean_rel_path) or orig_name

                # 2. Validate file size and extension
                validate_learning_material_file(file_obj)

                # 3. Compute SHA-256 checksum
                hasher = hashlib.sha256()
                for chunk in file_obj.chunks(4096):
                    hasher.update(chunk)
                file_checksum = hasher.hexdigest()

                # Reset file pointer after reading chunks
                file_obj.seek(0)

                # 4. Check for duplicate content (by checksum or identical relative path)
                existing = TrainingFile.objects.filter(
                    Q(checksum=file_checksum) | Q(relative_path=clean_rel_path)
                ).first()

                if existing:
                    skipped_duplicates.append({
                        "filename": clean_filename,
                        "relative_path": clean_rel_path,
                        "reason": f"Duplicate file already exists (ID: {existing.id}, Path: '{existing.relative_path}')",
                        "existing_id": existing.id,
                    })
                    continue

                # 5. Determine normalized file type
                ext = os.path.splitext(clean_filename)[1].lower().lstrip(".")
                file_type = ext.upper() or "UNKNOWN"

                # 6. Save model record
                tf = TrainingFile.objects.create(
                    file=file_obj,
                    filename=clean_filename,
                    relative_path=clean_rel_path,
                    file_type=file_type,
                    file_size=file_obj.size,
                    checksum=file_checksum,
                    uploaded_by=request.user,
                )

                created_files.append(TrainingFileSerializer(tf, context={"request": request}).data)

            except ValidationError as ve:
                failed_files.append({
                    "filename": orig_name,
                    "error": str(ve.message if hasattr(ve, "message") else ve),
                })
            except Exception as e:
                failed_files.append({
                    "filename": orig_name,
                    "error": str(e),
                })

        return Response({
            "message": f"Processed {len(uploaded_files)} file(s). Uploaded: {len(created_files)}, Skipped: {len(skipped_duplicates)}, Failed: {len(failed_files)}.",
            "total_processed": len(uploaded_files),
            "created_count": len(created_files),
            "skipped_count": len(skipped_duplicates),
            "failed_count": len(failed_files),
            "created": created_files,
            "skipped": skipped_duplicates,
            "failed": failed_files,
        }, status=status.HTTP_201_CREATED if created_files else status.HTTP_200_OK)

    @xframe_options_sameorigin
    @action(detail=True, methods=["get"], url_path="download")
    def download_file(self, request, pk=None):
        """
        Secure inline viewing for LMS Administrators (downloads denied).
        Only explicitly approved safe MIME types (PDF, PNG, JPG, WEBP, GIF, MP4, WEBM, MP3, WAV, TXT)
        are served with Content-Disposition: inline. SVG, HTML, and unsupported formats return 400.
        Attachment fallback / file downloads are strictly disabled for ALL roles.
        """
        # Block download queries:
        is_explicit_download = request.query_params.get("download", "").lower() in ("true", "1", "yes") or (
            request.query_params.get("inline", "").lower() in ("false", "0", "no")
        )
        if is_explicit_download:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Direct file downloads are disabled across the LMS. Only inline viewing is permitted.")

        training_file = self.get_object()
        if not training_file.file:
            raise Http404("The requested file was not found on the server storage.")
        try:
            if not training_file.file.storage.exists(training_file.file.name):
                raise Http404("The requested file was not found on the server storage.")
        except Exception:
            pass

        content_type, _ = mimetypes.guess_type(training_file.filename)
        content_type = (content_type or "application/octet-stream").lower()

        SAFE_INLINE_MIMES = {
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/webm",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/ogg",
            "text/plain",
        }

        # Check if file is DOCX for read-only preview conversion
        is_docx = (
            (training_file.file_type and training_file.file_type.upper() in ["DOCX", "DOC"])
            or training_file.filename.lower().endswith(".docx")
            or content_type in [
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/msword",
            ]
        )

        if is_docx:
            from core.document_preview import get_or_create_docx_preview
            try:
                preview_pdf_path = get_or_create_docx_preview(training_file)
                preview_file_size = os.path.getsize(preview_pdf_path)
                preview_filename = os.path.splitext(training_file.filename)[0] + ".pdf"
                response = FileResponse(
                    open(preview_pdf_path, "rb"),
                    content_type="application/pdf",
                )
                response["Content-Disposition"] = f'inline; filename="{preview_filename}"'
                response["Content-Length"] = preview_file_size
                response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
                response["X-Content-Type-Options"] = "nosniff"
                response["X-Frame-Options"] = "SAMEORIGIN"
                return response
            except Exception as e:
                logger.error("DOCX preview generation error for admin training file %s: %s", training_file.id, e)
                return Response(
                    {
                        "error": "Failed to generate read-only document preview.",
                        "filename": training_file.filename,
                        "file_type": training_file.file_type,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        if content_type not in SAFE_INLINE_MIMES:
            return Response(
                {
                    "error": "Preview is not available for this file format, and file downloads are disabled.",
                    "filename": training_file.filename,
                    "file_type": training_file.file_type,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = FileResponse(
            training_file.file.open("rb"),
            content_type=content_type,
        )
        response["Content-Disposition"] = f'inline; filename="{training_file.filename}"'
        response["Content-Length"] = training_file.file_size
        response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "SAMEORIGIN"
        return response

    def destroy(self, request, *args, **kwargs):
        """
        Safe deletion of an administrator training repository file:
        - Strictly restricted to LMS Administrators.
        - Deletes associated TrainingFileMapping records and logs audit trail.
        - Removes physical file from disk storage only after DB transaction succeeds.
        """
        instance = self.get_object()
        file_storage_name = instance.file.name if instance.file else None

        # Gather file metadata and mapping details for audit and response
        file_id = instance.id
        filename = instance.filename
        file_size = instance.file_size
        file_type = instance.file_type
        relative_path = instance.relative_path

        mappings_qs = instance.curriculum_mappings.select_related("cluster", "module", "submodule")
        mappings_count = mappings_qs.count()
        affected_mappings_info = [
            {
                "mapping_id": m.id,
                "cluster": m.cluster.name if m.cluster else None,
                "module": m.module.name if m.module else None,
                "submodule": m.submodule.name if m.submodule else None,
            }
            for m in mappings_qs
        ]

        try:
            with transaction.atomic():
                _log_audit(
                    request,
                    AuditAction.DELETE,
                    "TrainingFile",
                    file_id,
                    {
                        "filename": filename,
                        "relative_path": relative_path,
                        "file_type": file_type,
                        "file_size": file_size,
                        "mappings_removed": mappings_count,
                        "affected_mappings": affected_mappings_info,
                    },
                )
                instance.delete()

            # Physical file cleanup only after atomic DB deletion succeeds
            if file_storage_name:
                try:
                    if instance.file.storage.exists(file_storage_name):
                        instance.file.storage.delete(file_storage_name)
                except Exception as del_err:
                    logger.warning(
                        "TrainingFile record %s deleted, but storage file deletion at '%s' failed: %s",
                        file_id,
                        file_storage_name,
                        str(del_err),
                    )

            return Response(
                {
                    "message": f"Training material '{filename}' and {mappings_count} associated mapping(s) successfully deleted.",
                    "deleted_id": file_id,
                    "mappings_removed": mappings_count,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            logger.exception("Failed to safely delete TrainingFile %s: %s", file_id, str(e))
            return Response(
                {"error": f"Failed to delete training file: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class TrainingClusterViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for TrainingCluster entities scoped to courses.
    Strictly restricted to LMS Administrators.
    """
    queryset = TrainingCluster.objects.all().select_related("course").order_by("order", "name")
    serializer_class = TrainingClusterSerializer
    permission_classes = [IsAuthenticated, IsLMSAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["order", "name", "created_at"]
    ordering = ["order", "name"]

    def get_queryset(self):
        qs = super().get_queryset()
        course_id = self.request.query_params.get("course")
        if course_id:
            qs = qs.filter(course_id=course_id)
        return qs


class TrainingFileMappingViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for logical TrainingFileMapping associations.
    Allows mapping files to clusters, modules, and submodules.
    Strictly restricted to LMS Administrators.
    """
    queryset = TrainingFileMapping.objects.all().select_related(
        "training_file", "cluster", "module", "submodule"
    ).order_by("cluster__order", "module__order", "submodule__order", "training_file__filename")
    serializer_class = TrainingFileMappingSerializer
    permission_classes = [IsAuthenticated, IsLMSAdmin]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "training_file__filename",
        "training_file__relative_path",
        "notes",
        "cluster__name",
        "module__name",
        "submodule__name",
    ]
    ordering_fields = ["created_at", "category", "training_file__filename"]

    def get_queryset(self):
        qs = super().get_queryset()
        cluster_id = self.request.query_params.get("cluster")
        module_id = self.request.query_params.get("module")
        submodule_id = self.request.query_params.get("submodule")
        file_id = self.request.query_params.get("file")
        category = self.request.query_params.get("category")
        course_id = self.request.query_params.get("course")

        if course_id:
            qs = qs.filter(cluster__course_id=course_id)
        if cluster_id:
            qs = qs.filter(cluster_id=cluster_id)
        if module_id:
            qs = qs.filter(module_id=module_id)
        if submodule_id:
            qs = qs.filter(submodule_id=submodule_id)
        if file_id:
            qs = qs.filter(training_file_id=file_id)
        if category:
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        serializer.save()


# =============================================================================
# 12. Project Management & Submission ViewSets
# =============================================================================

class ProjectViewSet(viewsets.ModelViewSet):
    """
    CRUD and assignment endpoints for Project entities.
    Permissions & scoping:
      - Admin: full access to all projects (including DRAFT and ARCHIVED).
      - Trainer: can view projects assigned to them or where they are an assigned trainer.
      - Learner: can view non-draft projects assigned to them.
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        role = _get_role(user)

        # Base active (non-soft-deleted) projects
        qs = Project.objects.filter(is_deleted=False).prefetch_related(
            "trainers", "learners", "resources", "submissions"
        )

        if role == User.Role.ADMIN:
            # Admins see all projects
            return qs

        if role == User.Role.TRAINER:
            # Trainers see projects assigned to them
            return qs.filter(trainers=user).distinct()

        if role == User.Role.LEARNER:
            # Learners see active/completed/archived projects assigned to them (exclude DRAFT)
            return qs.filter(
                learners=user
            ).exclude(
                status=Project.ProjectStatus.DRAFT
            ).distinct()

        return Project.objects.none()

    def _require_admin(self):
        if _get_role(self.request.user) != User.Role.ADMIN:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("LMS Admin role required.")

    def create(self, request, *args, **kwargs):
        self._require_admin()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = serializer.save(created_by=request.user)

        # Handle trainer and learner assignments if provided in create payload
        trainer_ids = request.data.get("trainers", [])
        learner_ids = request.data.get("learners", [])
        if trainer_ids:
            project.trainers.set(User.objects.filter(id__in=trainer_ids, role=User.Role.TRAINER))
        if learner_ids:
            project.learners.set(User.objects.filter(id__in=learner_ids, role=User.Role.LEARNER))

        _log_audit(
            request,
            AuditAction.CREATE,
            "Project",
            project.pk,
            {"title": project.title, "status": project.status, "priority": project.priority},
        )
        return Response(ProjectSerializer(project, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        self._require_admin()
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        project = serializer.save()

        if "trainers" in request.data:
            trainer_ids = request.data.get("trainers", [])
            project.trainers.set(User.objects.filter(id__in=trainer_ids, role=User.Role.TRAINER))

        if "learners" in request.data:
            learner_ids = request.data.get("learners", [])
            project.learners.set(User.objects.filter(id__in=learner_ids, role=User.Role.LEARNER))

        _log_audit(
            request,
            AuditAction.UPDATE,
            "Project",
            project.pk,
            {"title": project.title, "status": project.status, "priority": project.priority},
        )
        return Response(ProjectSerializer(project, context={"request": request}).data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Soft-deletes project to protect learner submission history.
        """
        self._require_admin()
        project = self.get_object()
        project.is_deleted = True
        project.status = Project.ProjectStatus.ARCHIVED
        project.save(update_fields=["is_deleted", "status", "updated_at"])

        _log_audit(
            request,
            AuditAction.DELETE,
            "Project",
            project.pk,
            {"title": project.title, "soft_deleted": True},
        )
        return Response({"message": f"Project '{project.title}' deleted successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="assign")
    def assign_users(self, request, pk=None):
        """
        Assign or update assigned trainers and learners for a project.
        Admin-only.
        """
        self._require_admin()
        project = self.get_object()
        trainer_ids = request.data.get("trainers")
        learner_ids = request.data.get("learners")

        details = {}
        if trainer_ids is not None:
            trainers = User.objects.filter(id__in=trainer_ids, role=User.Role.TRAINER)
            project.trainers.set(trainers)
            details["assigned_trainers_count"] = trainers.count()

        if learner_ids is not None:
            learners = User.objects.filter(id__in=learner_ids, role=User.Role.LEARNER)
            project.learners.set(learners)
            details["assigned_learners_count"] = learners.count()

        _log_audit(
            request,
            AuditAction.ASSIGN,
            "Project",
            project.pk,
            details,
        )
        return Response(ProjectSerializer(project, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="upload-resource")
    def upload_resource(self, request, pk=None):
        """
        Uploads a project resource (document, template, guide).
        Admin or assigned Trainer only.
        """
        project = self.get_object()
        user = request.user
        role = _get_role(user)

        if role != User.Role.ADMIN and not project.trainers.filter(id=user.id).exists():
            return Response({"error": "Permission denied. Admin or assigned Trainer required."}, status=status.HTTP_403_FORBIDDEN)

        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"error": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_learning_material_file(file_obj)
        except ValidationError as val_err:
            return Response({"error": str(val_err.message if hasattr(val_err, 'message') else val_err)}, status=status.HTTP_400_BAD_REQUEST)

        resource = ProjectResource.objects.create(
            project=project,
            file=file_obj,
            original_name=file_obj.name,
            file_size=file_obj.size,
            uploaded_by=user,
        )

        _log_audit(
            request,
            AuditAction.CREATE,
            "ProjectResource",
            resource.pk,
            {"filename": resource.original_name, "project_id": project.pk},
        )
        return Response(ProjectResourceSerializer(resource).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"resources/(?P<resource_id>\d+)")
    def delete_resource(self, request, pk=None, resource_id=None):
        """
        Deletes a project resource.
        Admin or assigned Trainer only.
        """
        project = self.get_object()
        user = request.user
        role = _get_role(user)

        if role != User.Role.ADMIN and not project.trainers.filter(id=user.id).exists():
            return Response({"error": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        resource = get_object_or_404(ProjectResource, pk=resource_id, project=project)
        try:
            if resource.file and resource.file.storage.exists(resource.file.name):
                resource.file.storage.delete(resource.file.name)
        except Exception as e:
            logger.warning("Error deleting physical file for ProjectResource %s: %s", resource.pk, e)

        resource.delete()
        _log_audit(
            request,
            AuditAction.DELETE,
            "ProjectResource",
            resource_id,
            {"project_id": project.pk},
        )
        return Response({"message": "Resource deleted successfully."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path=r"resources/(?P<resource_id>\d+)/download")
    def download_resource(self, request, pk=None, resource_id=None):
        """
        Secure authorized download of project resources.
        Available to Admin, assigned Trainers, and assigned Learners.
        """
        project = get_object_or_404(Project, pk=pk)
        user = request.user
        role = _get_role(user)

        # Scoping check
        if role == User.Role.ADMIN:
            pass
        elif role == User.Role.TRAINER and project.trainers.filter(id=user.id).exists():
            pass
        elif role == User.Role.LEARNER and project.learners.filter(id=user.id).exists():
            pass
        else:
            return Response({"error": "Permission denied. You are not assigned to this project."}, status=status.HTTP_403_FORBIDDEN)

        resource = get_object_or_404(ProjectResource, pk=resource_id, project=project)
        if not resource.file:
            raise Http404("File not found.")

        content_type, _ = mimetypes.guess_type(resource.original_name)

        # Check if file is DOCX for read-only preview conversion
        is_preview_request = request.query_params.get("preview", "").lower() in ("true", "1", "yes")
        is_docx = (
            resource.original_name.lower().endswith(".docx")
            or resource.original_name.lower().endswith(".doc")
            or (content_type and "wordprocessingml" in content_type)
        )

        if is_preview_request and is_docx:
            from core.document_preview import get_or_create_docx_preview
            try:
                preview_pdf_path = get_or_create_docx_preview(resource)
                preview_file_size = os.path.getsize(preview_pdf_path)
                preview_filename = os.path.splitext(resource.original_name)[0] + ".pdf"
                response = FileResponse(
                    open(preview_pdf_path, "rb"),
                    content_type="application/pdf",
                )
                response["Content-Disposition"] = f'inline; filename="{preview_filename}"'
                response["Content-Length"] = preview_file_size
                response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
                response["X-Content-Type-Options"] = "nosniff"
                response["X-Frame-Options"] = "SAMEORIGIN"
                return response
            except Exception as e:
                logger.error("DOCX preview generation error for project resource %s: %s", resource.pk, e)
                return Response(
                    {
                        "error": "Failed to generate read-only document preview.",
                        "filename": resource.original_name,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # If using S3 storage backend with generate_url
        use_s3 = getattr(settings, "USE_S3_STORAGE", False) or getattr(settings, "USE_S3", False)
        if hasattr(resource.file.storage, "url") and use_s3:
            try:
                # S3 private bucket pre-signed URL (1 hour expiry)
                s3_client = getattr(resource.file.storage, "bucket", None)
                if hasattr(resource.file.storage, "connection"):
                    presigned = resource.file.storage.connection.meta.client.generate_presigned_url(
                        "get_object",
                        Params={
                            "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                            "Key": resource.file.name,
                            "ResponseContentDisposition": f'inline; filename="{resource.original_name}"',
                        },
                        ExpiresIn=3600,
                    )
                    from django.shortcuts import redirect
                    return redirect(presigned)
            except Exception as e:
                logger.warning("Failed to generate S3 pre-signed URL for resource %s: %s", resource.pk, e)

        # Local storage / fallback: stream securely with FileResponse
        try:
            file_handle = resource.file.open("rb")
            content_type, _ = mimetypes.guess_type(resource.original_name)
            response = FileResponse(file_handle, content_type=content_type or "application/octet-stream")
            response["Content-Disposition"] = f'inline; filename="{resource.original_name}"'
            return response
        except Exception as e:
            logger.exception("Error streaming file for resource %s: %s", resource.pk, e)
            raise Http404("Unable to read resource file.")


class ProjectSubmissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for handling learner project submissions, resubmissions, and trainer reviews.
    Permissions:
      - Admin: full view of all submissions.
      - Trainer: view and review submissions for projects assigned to them.
      - Learner: view their own submissions; submit/resubmit to assigned projects.
    """
    serializer_class = ProjectSubmissionSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        role = _get_role(user)
        project_id = self.request.query_params.get("project")

        qs = ProjectSubmission.objects.select_related("project", "learner", "reviewed_by").prefetch_related("files")

        if project_id:
            qs = qs.filter(project_id=project_id)

        if role == User.Role.ADMIN:
            return qs

        if role == User.Role.TRAINER:
            # Trainers see submissions for projects they are assigned to
            return qs.filter(project__trainers=user).distinct()

        if role == User.Role.LEARNER:
            # Learners only see their own submissions
            return qs.filter(learner=user)

        return ProjectSubmission.objects.none()

    def create(self, request, *args, **kwargs):
        """
        Learner submits project work.
        Enforces:
          - Only learners assigned to the project can submit.
          - Project must be ACTIVE.
          - Deadline validation: if past due_date and allow_late_submissions is False, blocks submission.
          - Computes sequential version number (v1, v2, etc.).
          - Validates each attached file.
        """
        user = request.user
        role = _get_role(user)
        if role != User.Role.LEARNER:
            return Response({"error": "Only learners can submit project work."}, status=status.HTTP_403_FORBIDDEN)

        project_id = request.data.get("project")
        if not project_id:
            return Response({"error": "Field 'project' is required."}, status=status.HTTP_400_BAD_REQUEST)

        project = get_object_or_404(Project, pk=project_id, is_deleted=False)

        # Check assignment
        if not project.learners.filter(id=user.id).exists():
            return Response({"error": "Permission denied. You are not assigned to this project."}, status=status.HTTP_403_FORBIDDEN)

        # Check project status
        if project.status != Project.ProjectStatus.ACTIVE:
            return Response({"error": f"Project is currently '{project.status}'. Submissions are only accepted for Active projects."}, status=status.HTTP_400_BAD_REQUEST)

        # Check deadline
        from django.utils import timezone
        now = timezone.now()
        is_late = False
        if project.due_date and now > project.due_date:
            if not project.allow_late_submissions:
                return Response(
                    {"error": f"The submission deadline ({project.due_date.strftime('%Y-%m-%d %H:%M')}) has passed and late submissions are closed for this project."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            is_late = True

        comments = request.data.get("comments", "").strip()
        files = request.FILES.getlist("files")

        if not files:
            return Response({"error": "At least one project submission file is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate all files before saving anything
        for f in files:
            try:
                validate_learning_material_file(f)
            except ValidationError as val_err:
                return Response({"error": f"File '{f.name}' validation failed: {val_err}"}, status=status.HTTP_400_BAD_REQUEST)

        # Compute next version number
        latest_sub = ProjectSubmission.objects.filter(project=project, learner=user).order_by("-version").first()
        next_version = (latest_sub.version + 1) if latest_sub else 1

        with transaction.atomic():
            submission = ProjectSubmission.objects.create(
                project=project,
                learner=user,
                version=next_version,
                status=ProjectSubmission.SubmissionStatus.SUBMITTED,
                comments=comments,
                is_late=is_late,
            )

            for f in files:
                ProjectSubmissionFile.objects.create(
                    submission=submission,
                    file=f,
                    original_name=f.name,
                    file_size=f.size,
                )

            _log_audit(
                request,
                AuditAction.SUBMIT,
                "ProjectSubmission",
                submission.pk,
                {
                    "project_id": project.pk,
                    "project_title": project.title,
                    "version": submission.version,
                    "is_late": is_late,
                    "files_count": len(files),
                },
            )

        return Response(ProjectSubmissionSerializer(submission, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="review")
    def review_submission(self, request, pk=None):
        """
        Review learner project submission.
        Admin or assigned Trainer only.
        Allows setting status (UNDER_REVIEW, REVIEWED, CHANGES_REQUESTED, COMPLETED),
        optional numeric score, and feedback text.
        """
        user = request.user
        role = _get_role(user)

        # Retrieve submission regardless of queryset scoping so unassigned trainers get 403 instead of 404
        submission = get_object_or_404(ProjectSubmission, pk=pk)

        # Check trainer authorization
        if role != User.Role.ADMIN and not submission.project.trainers.filter(id=user.id).exists():
            return Response({"error": "Permission denied. You are not assigned as a trainer for this project."}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get("status")
        trainer_feedback = request.data.get("feedback", "").strip()
        score = request.data.get("score")

        if not new_status or new_status not in ProjectSubmission.SubmissionStatus.values:
            return Response(
                {"error": f"Valid status is required: {', '.join(ProjectSubmission.SubmissionStatus.values)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone
        submission.status = new_status
        submission.trainer_feedback = trainer_feedback
        submission.reviewed_by = user
        submission.reviewed_at = timezone.now()

        if score is not None and score != "":
            try:
                numeric_score = float(score)
                if numeric_score < 0 or (submission.max_score and numeric_score > float(submission.max_score)):
                    return Response({"error": f"Score must be between 0 and {submission.max_score}"}, status=status.HTTP_400_BAD_REQUEST)
                submission.score = numeric_score
            except ValueError:
                return Response({"error": "Score must be a valid number."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            submission.score = None

        submission.save(update_fields=["status", "trainer_feedback", "reviewed_by", "reviewed_at", "score"])

        _log_audit(
            request,
            AuditAction.REVIEW,
            "ProjectSubmission",
            submission.pk,
            {
                "project_id": submission.project_id,
                "learner": submission.learner.username,
                "version": submission.version,
                "status": submission.status,
                "score": str(submission.score) if submission.score is not None else None,
            },
        )

        return Response(ProjectSubmissionSerializer(submission, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path=r"files/(?P<file_id>\d+)/download")
    def download_submission_file(self, request, pk=None, file_id=None):
        """
        Secure download of learner submission files.
        Allowed for:
          - Admin
          - Assigned Trainer
          - The submitting Learner themselves
        """
        # Retrieve submission directly to return 403 (instead of 404) for unauthorized users
        submission = get_object_or_404(ProjectSubmission, pk=pk)
        user = request.user
        role = _get_role(user)

        is_admin = role == User.Role.ADMIN
        is_assigned_trainer = role == User.Role.TRAINER and submission.project.trainers.filter(id=user.id).exists()
        is_owner = submission.learner_id == user.id

        if not (is_admin or is_assigned_trainer or is_owner):
            return Response({"error": "Permission denied. You do not have access to this submission file."}, status=status.HTTP_403_FORBIDDEN)

        sub_file = get_object_or_404(ProjectSubmissionFile, pk=file_id, submission=submission)
        if not sub_file.file:
            raise Http404("File not found.")

        content_type, _ = mimetypes.guess_type(sub_file.original_name)

        # Check if file is DOCX for read-only preview conversion
        is_preview_request = request.query_params.get("preview", "").lower() in ("true", "1", "yes")
        is_docx = (
            sub_file.original_name.lower().endswith(".docx")
            or sub_file.original_name.lower().endswith(".doc")
            or (content_type and "wordprocessingml" in content_type)
        )

        if is_preview_request and is_docx:
            from core.document_preview import get_or_create_docx_preview
            try:
                preview_pdf_path = get_or_create_docx_preview(sub_file)
                preview_file_size = os.path.getsize(preview_pdf_path)
                preview_filename = os.path.splitext(sub_file.original_name)[0] + ".pdf"
                response = FileResponse(
                    open(preview_pdf_path, "rb"),
                    content_type="application/pdf",
                )
                response["Content-Disposition"] = f'inline; filename="{preview_filename}"'
                response["Content-Length"] = preview_file_size
                response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
                response["X-Content-Type-Options"] = "nosniff"
                response["X-Frame-Options"] = "SAMEORIGIN"
                return response
            except Exception as e:
                logger.error("DOCX preview generation error for submission file %s: %s", sub_file.pk, e)
                return Response(
                    {
                        "error": "Failed to generate read-only document preview.",
                        "filename": sub_file.original_name,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # S3 pre-signed URL redirect if S3 configured
        use_s3 = getattr(settings, "USE_S3_STORAGE", False) or getattr(settings, "USE_S3", False)
        if hasattr(sub_file.file.storage, "url") and use_s3:
            try:
                s3_client = getattr(sub_file.file.storage, "bucket", None)
                if hasattr(sub_file.file.storage, "connection"):
                    presigned = sub_file.file.storage.connection.meta.client.generate_presigned_url(
                        "get_object",
                        Params={
                            "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                            "Key": sub_file.file.name,
                            "ResponseContentDisposition": f'inline; filename="{sub_file.original_name}"',
                        },
                        ExpiresIn=3600,
                    )
                    from django.shortcuts import redirect
                    return redirect(presigned)
            except Exception as e:
                logger.warning("Failed to generate S3 pre-signed URL for submission file %s: %s", sub_file.pk, e)

        # Local storage / fallback: stream securely with FileResponse
        try:
            file_handle = sub_file.file.open("rb")
            content_type, _ = mimetypes.guess_type(sub_file.original_name)
            response = FileResponse(file_handle, content_type=content_type or "application/octet-stream")
            response["Content-Disposition"] = f'inline; filename="{sub_file.original_name}"'
            return response
        except Exception as e:
            logger.exception("Error streaming submission file %s: %s", sub_file.pk, e)
            raise Http404("Unable to read submission file.")





