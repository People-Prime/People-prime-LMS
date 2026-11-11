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
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from core.models import (
    AuditAction,
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
    PublicationStatus,
    QuestionType,
    Submodule,
    TrainerGroupAssignment,
    TrainingAssignment,
    TrainingCluster,
    TrainingFile,
    TrainingFileMapping,
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
    3. all_accessible_course_ids: assigned_crs_ids UNION courses containing directly assigned modules
    """
    assigned_crs_ids = set(assignments.filter(
        course__isnull=False
    ).values_list("course_id", flat=True))

    assigned_mod_ids = set(assignments.filter(
        module__isnull=False
    ).values_list("module_id", flat=True))

    # Parent courses of directly assigned modules
    mod_course_ids = set(Module.objects.filter(
        id__in=assigned_mod_ids
    ).values_list("course_id", flat=True))

    all_accessible_course_ids = assigned_crs_ids.union(mod_course_ids)
    return set(), set(), assigned_crs_ids, assigned_mod_ids, all_accessible_course_ids


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


def _scope_module_qs(user):
    """
    Return a Module queryset scoped by role and active training assignments.
    - ADMIN: all modules
    - TRAINER: all PUBLISHED modules within PUBLISHED courses
    - LEARNER: PUBLISHED modules in assigned courses or directly assigned
    """
    role = _get_role(user)
    if role == User.Role.ADMIN:
        return Module.objects.all()

    if role == User.Role.TRAINER:
        return Module.objects.filter(
            status=PublicationStatus.PUBLISHED,
            course__status=PublicationStatus.PUBLISHED,
        ).distinct()

    if role == User.Role.LEARNER:
        assignments = _get_active_learner_assignments(user)
        _, _, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)
        return Module.objects.filter(
            status=PublicationStatus.PUBLISHED
        ).filter(
            Q(course_id__in=assigned_crs_ids) |
            Q(id__in=assigned_mod_ids)
        ).distinct()

    return Module.objects.none()


def _scope_submodule_qs(user):
    """
    Return a Submodule queryset scoped by role and active training assignments.
    - ADMIN: all submodules
    - TRAINER: all PUBLISHED submodules within PUBLISHED modules & courses
    - LEARNER: PUBLISHED submodules in assigned courses or modules
    """
    role = _get_role(user)
    if role == User.Role.ADMIN:
        return Submodule.objects.all()

    if role == User.Role.TRAINER:
        return Submodule.objects.filter(
            status=PublicationStatus.PUBLISHED,
            module__status=PublicationStatus.PUBLISHED,
            module__course__status=PublicationStatus.PUBLISHED,
        ).distinct()

    if role == User.Role.LEARNER:
        assignments = _get_active_learner_assignments(user)
        _, _, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)
        return Submodule.objects.filter(
            status=PublicationStatus.PUBLISHED
        ).filter(
            Q(module__course_id__in=assigned_crs_ids) |
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
        user = self.request.user
        role = _get_role(user)

        # Base queryset scoped by course accessibility
        if role == User.Role.ADMIN:
            qs = CourseLevel.objects.all()
        elif role == User.Role.TRAINER:
            qs = CourseLevel.objects.filter(course__status=PublicationStatus.PUBLISHED)
        elif role == User.Role.LEARNER:
            accessible_courses = _scope_course_qs(user)
            qs = CourseLevel.objects.filter(course__in=accessible_courses)
        else:
            qs = CourseLevel.objects.none()

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
        self._require_admin()
        instance = self.get_object()

        # Enforce that only empty levels (zero modules assigned) can be deleted
        assigned_modules_count = instance.modules.count()
        if assigned_modules_count > 0:
            return Response(
                {
                    "error": f"Cannot delete level '{instance.name}' because it contains {assigned_modules_count} module(s). Reassign or unassign all modules before deleting this level."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        level_name = instance.name
        level_id = instance.id
        course_id = instance.course_id

        _log_audit(
            request,
            AuditAction.DELETE,
            "CourseLevel",
            level_id,
            {"name": level_name, "course": course_id},
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
            {"name": module.name, "code": module.code, "course": module.course_id},
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
            {"name": module.name, "code": module.code},
        )
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_admin()
        instance = self.get_object()

        if instance.status == PublicationStatus.ARCHIVED:
            return Response(
                {"error": "Archived modules cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                locked_module = Module.objects.select_for_update().get(pk=instance.pk)
                _log_audit(
                    request,
                    AuditAction.DELETE,
                    "Module",
                    locked_module.pk,
                    {
                        "name": locked_module.name,
                        "code": locked_module.code,
                        "course": locked_module.course_id,
                        "status": locked_module.status,
                    },
                )
                locked_module.delete()
        except Module.DoesNotExist:
            return Response(
                {"error": "Module not found or already deleted."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.exception("Unexpected error occurred while deleting Module ID %s: %s", instance.pk, str(e))
            return Response(
                {"error": "Failed to delete module due to an internal server error. Please try again or contact system administration."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

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

        return Response({
            "module_id": instance.id,
            "name": instance.name,
            "code": instance.code,
            "status": instance.status,
            "course_id": instance.course_id,
            "course_name": instance.course.name if instance.course else "Unknown",
            "submodules_count": submodules_count,
            "assignments_count": assignments_count,
            "questions_count": questions_count,
            "attempts_count": attempts_count,
            "responses_count": responses_count,
            "feedback_count": feedback_count,
            "materials_mappings_count": materials_mappings_count,
            "progress_count": progress_count,
        }, status=status.HTTP_200_OK)

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
        if not tf.file or not os.path.exists(tf.file.path):
            raise Http404("The physical file was not found on server storage.")

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
            open(tf.file.path, "rb"),
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
        if not tf.file or not os.path.exists(tf.file.path):
            raise Http404("The physical file was not found on server storage.")

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
            open(tf.file.path, "rb"),
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
        if not tf.file or not os.path.exists(tf.file.path):
            raise Http404("The physical file was not found on server storage.")

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
            open(tf.file.path, "rb"),
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
        is_completed = (
            total_required > 0
            and answered_count == total_required
        )

        # All questions count (all active questions are mandatory)
        all_questions_count = ModuleQuestion.objects.filter(module=module, is_active=True).count()
        
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

        return Response({
            "module_id": module.id,
            "module_name": module.name,
            "learner_id": target_learner.id,
            "learner_username": target_learner.username,
            "total_required_questions": total_required,
            "answered_required_questions": answered_count,
            "is_module_completed": is_completed,
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

        blocking_reasons = []

        if active_questions_count == 0:
            blocking_reasons.append("This module has no assessment questions configured.")

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
    """
    assignments = _get_active_learner_assignments(learner)
    _, _, assigned_crs_ids, assigned_mod_ids, _ = _get_curriculum_targets(assignments)

    return Module.objects.filter(
        status=PublicationStatus.PUBLISHED,
        course__status=PublicationStatus.PUBLISHED,
    ).filter(
        Q(course_id__in=assigned_crs_ids) |
        Q(id__in=assigned_mod_ids)
    ).select_related("course").distinct()


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

    completed_count = 0
    module_details = []

    for m in assigned_modules:
        req_q_set = module_req_q_map.get(m.id, set())
        total_required = len(req_q_set)
        answered_required = len(req_q_set.intersection(answered_q_set))

        is_completed = (total_required > 0 and answered_required == total_required)
        if is_completed:
            completed_count += 1

        module_details.append({
            "id": m.id,
            "name": m.name,
            "course": {"id": m.course.id, "name": m.course.name},
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
        modules_by_id = {m.id: m for m in Module.objects.filter(id__in=needed_module_ids).select_related("course")}

        items = []
        for pair in in_progress_pairs:
            learner = users_by_id.get(pair["learner_id"])
            module = modules_by_id.get(pair["module_id"])
            if not learner or not module:
                continue

            learner_name = learner.get_full_name().strip() or learner.username
            course_name = module.course.name if module.course else "Unknown Course"
            course_id = module.course.id if module.course else 0

            items.append({
                "learner_id": learner.id,
                "learner_name": learner_name,
                "learner_username": learner.username,
                "learner_email": learner.email or "",
                "course_id": course_id,
                "course_name": course_name,
                "module_id": module.id,
                "module_name": module.name,
                "total_required_questions": pair["total_required_questions"],
                "answered_required_questions": pair["answered_required_questions"],
                "completion_percentage": pair["completion_percentage"],
                "last_activity": pair["last_activity"],
            })

        # Sort items predictably by learner_name then course_name then module_name
        items.sort(key=lambda x: (x["learner_name"].lower(), x["course_name"].lower(), x["module_name"].lower()))

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

        # 4. Pre-fetch training assignments for all relevant groups & candidate types
        all_cand_types = {g.candidate_type_id for g in all_active_groups if g.candidate_type_id}
        training_assignments = (
            TrainingAssignment.objects.filter(is_active=True)
            .filter(Q(learner_group__in=all_active_groups) | Q(candidate_type_id__in=all_cand_types))
            .select_related("course", "learner_group")
        )
        group_training_assignments = defaultdict(list)
        cand_type_training_assignments = defaultdict(list)
        for ta in training_assignments:
            if ta.learner_group_id:
                group_training_assignments[ta.learner_group_id].append(ta)
            elif ta.candidate_type_id:
                cand_type_training_assignments[ta.candidate_type_id].append(ta)

        # 5. Pre-fetch all published modules and map to course
        published_modules = (
            Module.objects.filter(
                status=PublicationStatus.PUBLISHED,
                course__status=PublicationStatus.PUBLISHED,
            )
            .select_related("course")
        )
        course_to_modules = defaultdict(list)
        for mod in published_modules:
            course_to_modules[mod.course_id].append(mod)

        # 6. Pre-fetch all active required questions & responses for learner progress
        req_questions = ModuleQuestion.objects.filter(is_active=True, is_required=True).values("id", "module_id")
        module_req_q_map = defaultdict(set)
        for rq in req_questions:
            module_req_q_map[rq["module_id"]].add(rq["id"])

        # Fetch all learner responses
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

        # Helper to compute group curriculum & progress
        def get_group_curriculum_and_progress(grp):
            learners = group_to_learners.get(grp.id, [])
            grp_tas = list(group_training_assignments.get(grp.id, []))
            if grp.candidate_type_id:
                grp_tas.extend(cand_type_training_assignments.get(grp.candidate_type_id, []))

            # Deduplicate targets
            direct_crs_ids = set()
            for ta in grp_tas:
                if ta.course_id:
                    direct_crs_ids.add(ta.course_id)

            # Resolve all modules for this group
            grp_modules_dict = {}
            curriculum_items = []

            for cid in direct_crs_ids:
                mods = course_to_modules.get(cid, [])
                for m in mods:
                    grp_modules_dict[m.id] = m
                if mods:
                    c = mods[0].course
                    curriculum_items.append({
                        "type": "Course",
                        "id": c.id,
                        "name": c.name,
                        "code": c.code,
                        "modules_count": len(mods),
                    })

            # Calculate learner progress across group modules
            grp_modules = list(grp_modules_dict.values())
            total_mods_count = len(grp_modules)
            completed_learners = 0
            learner_pct_sum = 0.0

            for lnr in learners:
                if total_mods_count == 0:
                    continue
                lnr_completed_mods = 0
                for m in grp_modules:
                    req_qs = module_req_q_map.get(m.id, set())
                    ans_qs = learner_answered_map.get(lnr.id, set())
                    if len(req_qs) > 0 and len(req_qs.intersection(ans_qs)) == len(req_qs):
                        lnr_completed_mods += 1
                lnr_pct = (lnr_completed_mods / total_mods_count) * 100.0
                learner_pct_sum += lnr_pct
                if lnr_completed_mods == total_mods_count and total_mods_count > 0:
                    completed_learners += 1

            avg_pct = round(learner_pct_sum / len(learners), 1) if learners else 0.0

            # Count unique courses in curriculum
            unique_courses = {m.course_id for m in grp_modules}

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
                    trn_all_courses.add(m.course_id)

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
      Section C: Course-wise completion breakdown and average progress rates.

    Role Permissions:
    - ADMIN: Full visibility across all learners and courses. Supports searching and filtering.
    - TRAINER: Strictly scoped to assigned learners and assigned courses.
    - LEARNER: Strictly scoped to the authenticated learner's own assignments and scores.
    """
    permission_classes = [IsAuthenticated]

    def _get_accessible_learners_and_courses(self, user):
        """
        Determines the role-scoped learners and courses accessible by *user*:
        Returns (learners_qs, accessible_course_ids)
        """
        role = _get_role(user)
        if role == User.Role.ADMIN:
            learners_qs = User.objects.filter(role=User.Role.LEARNER)
            course_ids = set(Course.objects.filter(status=PublicationStatus.PUBLISHED).values_list("id", flat=True))
            return learners_qs, course_ids

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

            # Courses assigned to these trainer groups
            assignments = TrainingAssignment.objects.filter(
                is_active=True,
                learner_group__in=trainer_groups,
            )
            _, _, _, _, course_ids = _get_curriculum_targets(assignments)
            return learners_qs, set(course_ids)

        if role == User.Role.LEARNER:
            learners_qs = User.objects.filter(id=user.id)
            assignments = _get_active_learner_assignments(user)
            _, _, _, _, course_ids = _get_curriculum_targets(assignments)
            return learners_qs, set(course_ids)

        return User.objects.none(), set()

    def _get_course_completion_status_for_learner(self, learner, course):
        """
        Computes the completion status and percentage for a given learner in a course:
        Returns:
            status_label: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED'
            percentage: float (0.0 to 100.0)
            total_modules: int
            completed_modules: int
        """
        modules = course.modules.filter(status=PublicationStatus.PUBLISHED).order_by("order")
        total_modules = modules.count()
        if total_modules == 0:
            return "NOT_STARTED", 0.0, 0, 0

        module_ids = [m.id for m in modules]

        # Active required questions for this course's modules
        req_questions = ModuleQuestion.objects.filter(
            module_id__in=module_ids,
            is_active=True,
            is_required=True,
        ).values("id", "module_id")

        module_req_map = defaultdict(set)
        for q in req_questions:
            module_req_map[q["module_id"]].add(q["id"])

        # Learner responses to these questions
        all_req_q_ids = [q["id"] for q in req_questions]
        answered_q_ids = set(ModuleQuestionResponse.objects.filter(
            question_id__in=all_req_q_ids,
            learner=learner,
        ).values_list("question_id", flat=True))

        completed_modules = 0
        has_started_any = len(answered_q_ids) > 0

        for m in modules:
            req_set = module_req_map.get(m.id, set())
            total_req = len(req_set)
            answered_req = len(req_set.intersection(answered_q_ids))
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

    @action(detail=False, methods=["get"], url_path="overview")
    def overview(self, request):
        """
        Section A: Overview Metrics dashboard.
        """
        user = request.user
        role = _get_role(user)

        learners_qs, accessible_course_ids = self._get_accessible_learners_and_courses(user)
        total_learners = learners_qs.count()

        # Courses
        courses_qs = Course.objects.filter(id__in=accessible_course_ids, status=PublicationStatus.PUBLISHED)
        total_courses = courses_qs.count()

        # Enrollments & status counts
        total_enrollments = 0
        completed_enrollments = 0
        in_progress_enrollments = 0
        not_started_enrollments = 0
        total_pct_sum = 0.0

        for learner in learners_qs:
            # Active courses for this learner
            learner_ta = _get_active_learner_assignments(learner)
            _, _, _, _, learner_accessible_course_ids = _get_curriculum_targets(learner_ta)
            learner_course_ids = accessible_course_ids.intersection(learner_accessible_course_ids)
            learner_courses = Course.objects.filter(id__in=learner_course_ids, status=PublicationStatus.PUBLISHED)

            for course in learner_courses:
                total_enrollments += 1
                c_status, pct, _, _ = self._get_course_completion_status_for_learner(learner, course)
                total_pct_sum += pct
                if c_status == "COMPLETED":
                    completed_enrollments += 1
                elif c_status == "IN_PROGRESS":
                    in_progress_enrollments += 1
                else:
                    not_started_enrollments += 1

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
        - Applies role-based scoping (Admin: all, Trainer: assigned learners, Learner: self).
        - Supports ?search= (name/email/username), ?course= (id), and ?learner= (id).
        """
        user = request.user
        role = _get_role(user)

        learners_qs, accessible_course_ids = self._get_accessible_learners_and_courses(user)

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
                accessible_course_ids = accessible_course_ids.intersection({cid})
            except ValueError:
                pass

        # Specific learner inspection endpoint
        inspect_learner_id = request.query_params.get("inspect_learner")

        # Query responses for accessible learners
        responses = ModuleQuestionResponse.objects.filter(
            learner__in=learners_qs,
            question__module__course_id__in=accessible_course_ids,
        ).select_related(
            "learner",
            "question",
            "question__module",
            "question__module__course",
        ).order_by("-submitted_at")

        results = []
        for r in responses:
            # Check for scored assessment fields in response_payload
            payload = r.response_payload if isinstance(r.response_payload, dict) else {}
            has_score = (
                "score" in payload
                or "marks_obtained" in payload
                or "marks" in payload
            )

            marks_obtained = None
            total_marks = None
            percentage = None

            if has_score:
                try:
                    marks_obtained = float(payload.get("marks_obtained", payload.get("score", payload.get("marks"))))
                    tot = payload.get("total_marks", payload.get("max_score", payload.get("total")))
                    if tot is not None:
                        total_marks = float(tot)
                        percentage = round((marks_obtained / total_marks) * 100.0, 1) if total_marks > 0 else 0.0
                except (ValueError, TypeError, ZeroDivisionError):
                    marks_obtained = None
                    total_marks = None
                    percentage = None

            learner_full_name = r.learner.get_full_name().strip() or r.learner.username

            results.append({
                "learner_id": r.learner.id,
                "learner_name": learner_full_name,
                "email": r.learner.email or "",
                "course_id": r.question.module.course.id,
                "course_name": r.question.module.course.name,
                "module_id": r.question.module.id,
                "module_name": r.question.module.name,
                "assessment_name": r.question.question_text[:100],
                "attempt_number": r.attempt.attempt_number if r.attempt else 1,
                "marks_obtained": marks_obtained,
                "total_marks": total_marks,
                "percentage": percentage,
                "submission_date": r.submitted_at,
                "is_scored": has_score and (marks_obtained is not None),
            })

        # If inspect_learner parameter is provided, also compile their course-by-course breakdown
        learner_profile_data = None
        if inspect_learner_id:
            try:
                inspected_learner = learners_qs.get(id=inspect_learner_id)
                # Compute course-wise breakdown
                learner_ta = _get_active_learner_assignments(inspected_learner)
                _, _, _, _, l_course_ids = _get_curriculum_targets(learner_ta)
                valid_cids = accessible_course_ids.intersection(l_course_ids)
                inspected_courses = Course.objects.filter(id__in=valid_cids, status=PublicationStatus.PUBLISHED)

                course_summaries = []
                for c in inspected_courses:
                    c_status, pct, tot_m, comp_m = self._get_course_completion_status_for_learner(inspected_learner, c)
                    course_summaries.append({
                        "course_id": c.id,
                        "course_name": c.name,
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
        Course-wise progress metrics across assigned learners.
        Supports ?search= (course name) and ?course= (id).
        """
        user = request.user
        role = _get_role(user)

        learners_qs, accessible_course_ids = self._get_accessible_learners_and_courses(user)

        courses_qs = Course.objects.filter(id__in=accessible_course_ids, status=PublicationStatus.PUBLISHED).order_by("name")

        search_query = request.query_params.get("search", "").strip()
        if search_query:
            courses_qs = courses_qs.filter(name__icontains=search_query)

        course_id_filter = request.query_params.get("course")
        if course_id_filter:
            try:
                courses_qs = courses_qs.filter(id=int(course_id_filter))
            except ValueError:
                pass

        # Build enrollment map per course: course_id -> list of assigned learners
        # To avoid N*M queries, fetch all active assignments for accessible learners
        learner_to_course_ids = defaultdict(set)
        for learner in learners_qs:
            l_ta = _get_active_learner_assignments(learner)
            _, _, _, _, cids = _get_curriculum_targets(l_ta)
            learner_to_course_ids[learner.id] = set(cids)

        course_to_learners = defaultdict(list)
        for learner in learners_qs:
            for cid in learner_to_course_ids[learner.id]:
                if cid in accessible_course_ids:
                    course_to_learners[cid].append(learner)

        items = []
        for course in courses_qs:
            assigned_learners = course_to_learners.get(course.id, [])
            assigned_count = len(assigned_learners)

            completed_count = 0
            in_progress_count = 0
            not_started_count = 0
            pct_sum = 0.0

            for learner in assigned_learners:
                c_status, pct, _, _ = self._get_course_completion_status_for_learner(learner, course)
                pct_sum += pct
                if c_status == "COMPLETED":
                    completed_count += 1
                elif c_status == "IN_PROGRESS":
                    in_progress_count += 1
                else:
                    not_started_count += 1

            avg_pct = round(pct_sum / assigned_count, 1) if assigned_count > 0 else 0.0

            items.append({
                "course_id": course.id,
                "course_name": course.name,
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
        if not training_file.file or not os.path.exists(training_file.file.path):
            raise Http404("The requested file was not found on the server storage.")

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
            open(training_file.file.path, "rb"),
            content_type=content_type,
        )
        response["Content-Disposition"] = f'inline; filename="{training_file.filename}"'
        response["Content-Length"] = training_file.file_size
        response["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def destroy(self, request, *args, **kwargs):
        """
        Safe deletion of an administrator training repository file:
        - Strictly restricted to LMS Administrators.
        - Deletes associated TrainingFileMapping records and logs audit trail.
        - Removes physical file from disk storage only after DB transaction succeeds.
        """
        instance = self.get_object()
        file_path = instance.file.path if instance.file else None

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
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except OSError as os_err:
                    logger.warning(
                        "TrainingFile record %s deleted, but physical file deletion at '%s' failed: %s",
                        file_id,
                        file_path,
                        str(os_err),
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




