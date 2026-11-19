"""
People Prime LMS — API URL Configuration.

Registers all curriculum, training, reporting, and administration ViewSets with a DRF DefaultRouter.

Resulting URL patterns (all mounted under /api/ via core.urls):
  /api/courses/
  /api/courses/{id}/
  /api/modules/
  /api/modules/{id}/
  /api/submodules/
  /api/submodules/{id}/
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from core.api_views import (
    CandidateTypeViewSet,
    CourseLevelViewSet,
    CourseViewSet,
    GroupMembershipViewSet,
    LearnerGroupViewSet,
    ModuleQuestionResponseViewSet,
    ModuleQuestionViewSet,
    ModuleFeedbackViewSet,
    ModuleViewSet,
    SubmoduleViewSet,
    TrainerGroupAssignmentViewSet,
    TrainerLearnerOverviewViewSet,
    AdminOversightViewSet,
    AdminTrainerViewSet,
    AdminLearnerViewSet,
    AdminUserViewSet,
    ReportsViewSet,
    TrainingAssignmentViewSet,
    TrainingFileViewSet,
    TrainingClusterViewSet,
    TrainingFileMappingViewSet,
    ProjectViewSet,
    ProjectSubmissionViewSet,
)

router = DefaultRouter()
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"project-submissions", ProjectSubmissionViewSet, basename="project-submission")
router.register(r"courses", CourseViewSet, basename="course")
router.register(r"course-levels", CourseLevelViewSet, basename="course-level")
router.register(r"modules", ModuleViewSet, basename="module")
router.register(r"submodules", SubmoduleViewSet, basename="submodule")
router.register(r"candidate-types", CandidateTypeViewSet, basename="candidate-type")
router.register(r"learner-groups", LearnerGroupViewSet, basename="learner-group")
router.register(r"group-memberships", GroupMembershipViewSet, basename="group-membership")
router.register(r"trainer-assignments", TrainerGroupAssignmentViewSet, basename="trainer-assignment")
router.register(r"training-assignments", TrainingAssignmentViewSet, basename="training-assignment")
router.register(r"module-questions", ModuleQuestionViewSet, basename="module-question")
router.register(r"question-responses", ModuleQuestionResponseViewSet, basename="question-response")
router.register(r"module-feedbacks", ModuleFeedbackViewSet, basename="module-feedback")
router.register(r"trainer/learners", TrainerLearnerOverviewViewSet, basename="trainer-learners")
router.register(r"reports", ReportsViewSet, basename="reports")
router.register(r"admin/reports", AdminOversightViewSet, basename="admin-reports")
router.register(r"admin/trainers", AdminTrainerViewSet, basename="admin-trainers")
router.register(r"admin/learners", AdminLearnerViewSet, basename="admin-learners")
router.register(r"admin/users", AdminUserViewSet, basename="admin-users")
router.register(r"admin/training-files", TrainingFileViewSet, basename="admin-training-files")
router.register(r"admin/training-clusters", TrainingClusterViewSet, basename="admin-training-clusters")
router.register(r"admin/training-file-mappings", TrainingFileMappingViewSet, basename="admin-training-file-mappings")

urlpatterns = [
    path("", include(router.urls)),
]
