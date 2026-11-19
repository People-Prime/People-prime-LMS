import { useEffect, useState, useCallback } from "react";
import { apiClient, getCsrfToken } from "../../services/api";

// Subcomponents under courses/
import CourseCatalogView from "./courses/CourseCatalogView";
import CourseLevelsFirstView from "./courses/CourseLevelsFirstView";
import CourseCurriculumView from "./courses/CourseCurriculumView";
import CourseMaterialsView from "./courses/CourseMaterialsView";
import MaterialRepositoryView from "./courses/MaterialRepositoryView";
import MaterialMappingModal from "./courses/MaterialMappingModal";
import CourseDeleteModal from "./courses/CourseDeleteModal";
import ModuleDeleteModal from "./courses/ModuleDeleteModal";
import LevelDeleteModal from "./courses/LevelDeleteModal";
import ModuleInsertModal from "./courses/ModuleInsertModal";
import ModuleUploadModal from "./courses/ModuleUploadModal";
import CoursePreviewModal from "./courses/CoursePreviewModal";
import CoursePublishModal from "./courses/CoursePublishModal";
import ConfirmActionModal from "./courses/ConfirmActionModal";

export default function AdminCurriculumTab({ initialWorkspaceTab = null, onWorkspaceTabChange = null }) {
  // Navigation State
  // Level 1: selectedCourse === null (Course Catalog or Global Repository)
  // Level 2: selectedCourse !== null (Course Management Workspace)
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [workspaceTab, setWorkspaceTab] = useState(initialWorkspaceTab || "curriculum"); // 'curriculum' | 'materials' | 'repository'

  useEffect(() => {
    if (initialWorkspaceTab) {
      setWorkspaceTab(initialWorkspaceTab);
      if (initialWorkspaceTab === "repository") {
        setSelectedCourse(null);
      }
    }
  }, [initialWorkspaceTab]);

  // Curriculum Data
  const [courses, setCourses] = useState([]);
  const [courseLevels, setCourseLevels] = useState([]);
  const [modules, setModules] = useState([]);
  const [submodules, setSubmodules] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [files, setFiles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Course Search & Filter (Level 1)
  const [courseSearch, setCourseSearch] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState("ALL");

  // Course Modal State
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseOrder, setCourseOrder] = useState(1);
  const [courseStatus, setCourseStatus] = useState("DRAFT");

  // Course Deletion Modal State
  const [showDeleteCourseModal, setShowDeleteCourseModal] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null);
  const [courseDeletionImpact, setCourseDeletionImpact] = useState(null);
  const [loadingDeletionImpact, setLoadingDeletionImpact] = useState(false);

  // Module Deletion Modal State
  const [showDeleteModuleModal, setShowDeleteModuleModal] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [moduleDeletionImpact, setModuleDeletionImpact] = useState(null);
  const [loadingModuleDeletionImpact, setLoadingModuleDeletionImpact] = useState(false);

  // Level Deletion Modal State
  const [showDeleteLevelModal, setShowDeleteLevelModal] = useState(false);
  const [levelToDelete, setLevelToDelete] = useState(null);

  // Module Insert Modal State
  const [showInsertModuleModal, setShowInsertModuleModal] = useState(false);
  const [insertModalConfig, setInsertModalConfig] = useState({ course: null, level: null, levelModules: [] });

  // Module Upload Modal State
  const [showUploadModuleModal, setShowUploadModuleModal] = useState(false);
  const [uploadTargetModule, setUploadTargetModule] = useState(null);

  // Course Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [courseToPreview, setCourseToPreview] = useState(null);

  // Course Publish / Content Sync Modal State
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [courseToPublish, setCourseToPublish] = useState(null);

  // Module Search & Filter (Level 2)
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleStatusFilter, setModuleStatusFilter] = useState("ALL");

  // Module Modal State
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [moduleCourseId, setModuleCourseId] = useState("");
  const [moduleLevelId, setModuleLevelId] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [moduleOrder, setModuleOrder] = useState(1);
  const [moduleDuration, setModuleDuration] = useState("");
  const [moduleStatus, setModuleStatus] = useState("DRAFT");

  // CourseLevel Management Modal State
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [editingLevelId, setEditingLevelId] = useState(null);
  const [levelCourseId, setLevelCourseId] = useState("");
  const [levelName, setLevelName] = useState("");
  const [levelOrder, setLevelOrder] = useState(1);
  const [levelDescription, setLevelDescription] = useState("");

  // Confirmation Modal State
  const [confirmConfig, setConfirmConfig] = useState({
    show: false,
    title: "",
    message: "",
    affectedItem: null,
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    isDanger: false,
    onConfirm: null,
  });
  const [activeModule, setActiveModule] = useState(null);
  const [moduleSubTab, setModuleSubTab] = useState("submodules"); // 'submodules' | 'questions'
  const [activeSubmodules, setActiveSubmodules] = useState([]);
  const [activeQuestions, setActiveQuestions] = useState([]);
  const [contentLoading, setContentLoading] = useState(false);

  // Submodule Modal State
  const [showSubmoduleModal, setShowSubmoduleModal] = useState(false);
  const [editingSubmoduleId, setEditingSubmoduleId] = useState(null);
  const [submoduleName, setSubmoduleName] = useState("");
  const [submoduleDescription, setSubmoduleDescription] = useState("");
  const [submoduleOrder, setSubmoduleOrder] = useState(1);
  const [submoduleStatus, setSubmoduleStatus] = useState("DRAFT");

  // Module Question Modal State
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionText, setQuestionText] = useState("");
  const [questionOrder, setQuestionOrder] = useState(1);
  const [questionIsRequired, setQuestionIsRequired] = useState(true);
  const [questionIsActive, setQuestionIsActive] = useState(true);
  const [questionType, setQuestionType] = useState("MULTIPLE_CHOICE");
  const [questionOptions, setQuestionOptions] = useState([
    { id: "opt_1", text: "", is_correct: true },
    { id: "opt_2", text: "", is_correct: false },
    { id: "opt_3", text: "", is_correct: false },
  ]);

  // Material Mapping Modal State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingModalConfig, setMappingModalConfig] = useState({});

  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Load All System Entities
  // ---------------------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      const [crss, lvls, mods, subms, clsts, mpps, fls] = await Promise.all([
        apiClient("/courses/"),
        apiClient("/course-levels/").catch(() => []),
        apiClient("/modules/"),
        apiClient("/submodules/"),
        apiClient("/admin/training-clusters/").catch(() => []),
        apiClient("/admin/training-file-mappings/").catch(() => []),
        apiClient("/admin/training-files/").catch(() => []),
      ]);

      setCourses(Array.isArray(crss) ? crss : crss?.results || []);
      setCourseLevels(Array.isArray(lvls) ? lvls : lvls?.results || []);
      setModules(Array.isArray(mods) ? mods : mods?.results || []);
      setSubmodules(Array.isArray(subms) ? subms : subms?.results || []);
      setClusters(Array.isArray(clsts) ? clsts : clsts?.results || []);
      setMappings(Array.isArray(mpps) ? mpps : mpps?.results || []);
      setFiles(Array.isArray(fls) ? fls : fls?.results || []);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load curriculum data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    loadData();
  };

  // ---------------------------------------------------------------------------
  // Module Details Deep-Dive (Submodules, Questions)
  // ---------------------------------------------------------------------------
  const loadModuleDetails = useCallback(async (moduleId) => {
    setContentLoading(true);
    try {
      const [submodsRes, questionsRes, mappingsRes] = await Promise.all([
        apiClient("/submodules/"),
        apiClient(`/module-questions/?module=${moduleId}`),
        apiClient("/admin/training-file-mappings/").catch(() => []),
      ]);

      const allSubmods = Array.isArray(submodsRes) ? submodsRes : submodsRes?.results || [];
      const allQuestions = Array.isArray(questionsRes) ? questionsRes : questionsRes?.results || [];
      const allMappings = Array.isArray(mappingsRes) ? mappingsRes : mappingsRes?.results || [];

      setActiveSubmodules(allSubmods.filter((s) => s.module === moduleId));
      setActiveQuestions(allQuestions);
      setMappings(allMappings);
    } catch (err) {
      setError(err.message || "Failed to load module content details.");
    } finally {
      setContentLoading(false);
    }
  }, []);

  const handleOpenModuleContent = (module) => {
    setActiveModule(module);
    setModuleSubTab("submodules");
    setError(null);
    setSuccessMessage("");
    loadModuleDetails(module.id);
  };

  const handleCloseModuleContent = () => {
    setActiveModule(null);
    loadData();
  };

  // ---------------------------------------------------------------------------
  // Course Selection & Workspace Switching
  // ---------------------------------------------------------------------------
  const handleSelectCourse = (course) => {
    setSelectedCourse(course);
    setWorkspaceTab("curriculum");
    setActiveModule(null);
    setError(null);
    setSuccessMessage("");
    if (onWorkspaceTabChange) {
      onWorkspaceTabChange({ course, tab: "curriculum" });
    }
  };

  const handleBackToCatalog = () => {
    setSelectedCourse(null);
    setWorkspaceTab("curriculum");
    setActiveModule(null);
    setError(null);
    setSuccessMessage("");
    if (onWorkspaceTabChange) {
      onWorkspaceTabChange({ course: null, tab: "catalog" });
    }
  };

  const handleOpenGlobalRepository = () => {
    setSelectedCourse(null);
    setWorkspaceTab("repository");
    setActiveModule(null);
    setError(null);
    setSuccessMessage("");
    if (onWorkspaceTabChange) {
      onWorkspaceTabChange({ course: null, tab: "repository" });
    }
  };

  // ---------------------------------------------------------------------------
  // Course CRUD Handlers
  // ---------------------------------------------------------------------------
  const handleOpenCreateCourseModal = () => {
    setEditingCourseId(null);
    setCourseName("");
    setCourseCode("");
    setCourseDescription("");
    setCourseOrder(courses.length + 1);
    setCourseStatus("DRAFT");
    setError(null);
    setShowCourseModal(true);
  };

  const handleOpenEditCourseModal = (course) => {
    setEditingCourseId(course.id);
    setCourseName(course.name);
    setCourseCode(course.code);
    setCourseDescription(course.description || "");
    setCourseOrder(course.order ?? 1);
    setCourseStatus(course.status || "DRAFT");
    setError(null);
    setShowCourseModal(true);
  };

  const handleDuplicateCourse = async (course) => {
    const defaultCopyName = `${course.name} (Copy)`;
    const defaultCopyCode = `${course.code}-COPY`.slice(0, 50);

    const inputName = window.prompt("Enter name for duplicated course:", defaultCopyName);
    if (!inputName || !inputName.trim()) return;

    const inputCode = window.prompt("Enter unique course code for duplicated course:", defaultCopyCode);
    if (!inputCode || !inputCode.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccessMessage("");

    const payload = {
      name: inputName.trim(),
      code: inputCode.trim().toUpperCase(),
      description: course.description || "",
      order: courses.length + 1,
      status: "DRAFT", // Always draft
    };

    try {
      const newCourse = await apiClient("/courses/", {
        method: "POST",
        body: payload,
      });
      setSuccessMessage(`Course duplicated successfully as "${newCourse.name}" in DRAFT status.`);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to duplicate course.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCourse = async (e) => {
    e.preventDefault();
    if (!courseName.trim() || !courseCode.trim()) {
      setError("Course Name and Code are required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage("");

    const payload = {
      name: courseName.trim(),
      code: courseCode.trim().toUpperCase(),
      description: courseDescription.trim(),
      order: parseInt(courseOrder, 10) || 1,
      status: courseStatus,
    };

    try {
      if (editingCourseId) {
        await apiClient(`/courses/${editingCourseId}/`, {
          method: "PATCH",
          body: payload,
        });
        setSuccessMessage("Course updated successfully.");
      } else {
        await apiClient("/courses/", {
          method: "POST",
          body: payload,
        });
        setSuccessMessage("Course created successfully.");
      }
      setShowCourseModal(false);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to save course.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCourse = (course) => {
    setCourseToDelete(course);
    setCourseDeletionImpact(null);
    setShowDeleteCourseModal(true);
    setLoadingDeletionImpact(true);
    setError(null);

    // Fetch live deletion impact metrics
    apiClient(`/courses/${course.id}/deletion-impact/`)
      .then((data) => {
        setCourseDeletionImpact(data);
      })
      .catch((err) => {
        // Fallback to local counts if endpoint fails
        const courseModules = modules.filter((m) => m.course === course.id);
        setCourseDeletionImpact({
          course_id: course.id,
          name: course.name,
          code: course.code,
          status: course.status,
          modules_count: courseModules.length,
          assignments_count: 0,
          questions_count: 0,
          attempts_count: 0,
          responses_count: 0,
          feedback_count: 0,
        });
      })
      .finally(() => {
        setLoadingDeletionImpact(false);
      });
  };

  const handleConfirmDeleteCourse = async () => {
    if (!courseToDelete) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiClient(`/courses/${courseToDelete.id}/`, { method: "DELETE" });
      setSuccessMessage(`Course "${courseToDelete.name}" deleted successfully.`);
      if (selectedCourse?.id === courseToDelete.id) {
        setSelectedCourse(null);
      }
      setShowDeleteCourseModal(false);
      setCourseToDelete(null);
      setCourseDeletionImpact(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to delete course.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseDeleteCourseModal = () => {
    if (submitting) return;
    setShowDeleteCourseModal(false);
    setCourseToDelete(null);
    setCourseDeletionImpact(null);
  };

  const handleOpenPreviewCourseModal = (course) => {
    setCourseToPreview(course);
    setShowPreviewModal(true);
  };

  const handleClosePreviewCourseModal = () => {
    setShowPreviewModal(false);
    setCourseToPreview(null);
  };

  const handleOpenPublishCourseModal = (course) => {
    setCourseToPublish(course);
    setShowPublishModal(true);
  };

  const handleClosePublishCourseModal = () => {
    setShowPublishModal(false);
    setCourseToPublish(null);
  };

  const handlePublishSuccess = (result) => {
    setSuccessMessage(result.message || "Course content published successfully.");
    loadData();
    if (activeModule) {
      loadModuleDetails(activeModule.id);
    }
  };

  // ---------------------------------------------------------------------------
  // Module CRUD Handlers
  // ---------------------------------------------------------------------------
  const handleOpenCreateModuleModal = (preselectedCourseId, preselectedLevelId = "") => {
    setEditingModuleId(null);
    setModuleCourseId(
      preselectedCourseId !== undefined && preselectedCourseId !== null
        ? String(preselectedCourseId)
        : selectedCourse
        ? String(selectedCourse.id)
        : ""
    );
    setModuleLevelId(preselectedLevelId ? String(preselectedLevelId) : "");
    setModuleName("");
    setModuleDescription("");
    setModuleOrder(modules.length + 1);
    setModuleDuration("");
    setModuleStatus("DRAFT");
    setError(null);
    setShowModuleModal(true);
  };

  const handleOpenEditModuleModal = (module) => {
    setEditingModuleId(module.id);
    setModuleCourseId(module.course !== null && module.course !== undefined ? String(module.course) : "");
    setModuleLevelId(module.level !== null && module.level !== undefined ? String(module.level) : "");
    setModuleName(module.name);
    setModuleDescription(module.description || "");
    setModuleOrder(module.order ?? 1);
    setModuleDuration(
      module.estimated_duration_minutes !== null && module.estimated_duration_minutes !== undefined && module.estimated_duration_minutes > 0
        ? String(module.estimated_duration_minutes)
        : ""
    );
    setModuleStatus(module.status || "DRAFT");
    setError(null);
    setShowModuleModal(true);
  };

  const handleDuplicateModule = async (module) => {
    const scopeModules = module.course
      ? modules.filter((m) => m.course === module.course)
      : modules.filter((m) => m.level === module.level);
    const defaultCopyName = `${module.name} (Copy)`;

    const inputName = window.prompt("Enter name for duplicated module:", defaultCopyName);
    if (!inputName || !inputName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccessMessage("");

    const payload = {
      course: module.course ?? null,
      level: module.level ?? null,
      name: inputName.trim(),
      description: module.description || "",
      order: scopeModules.length + 1,
      estimated_duration_minutes: module.estimated_duration_minutes || 0,
      status: "DRAFT", // Always draft
    };

    try {
      const newModule = await apiClient("/modules/", {
        method: "POST",
        body: payload,
      });
      setSuccessMessage(`Module duplicated successfully as "${newModule.name}" in DRAFT status.`);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to duplicate module.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveModule = async (e) => {
    e.preventDefault();
    if (!moduleName.trim()) {
      setError("Module Name is required.");
      return;
    }
    if (!moduleLevelId) {
      setError("A Course Level is required for every module.");
      return;
    }

    const parsedDuration =
      moduleDuration === "" || moduleDuration === null || moduleDuration === undefined
        ? 0
        : parseInt(moduleDuration, 10);

    const payload = {
      course: moduleCourseId ? parseInt(moduleCourseId, 10) : null,
      level: parseInt(moduleLevelId, 10),
      name: moduleName.trim(),
      description: moduleDescription.trim(),
      order: parseInt(moduleOrder, 10) || 1,
      estimated_duration_minutes: isNaN(parsedDuration) ? 0 : Math.max(0, parsedDuration),
      status: moduleStatus,
    };

    const isEditing = Boolean(editingModuleId);
    const targetLevelObj = courseLevels.find((lvl) => String(lvl.id) === String(moduleLevelId));

    setConfirmConfig({
      show: true,
      title: isEditing ? "Confirm Module Update" : "Confirm Module Creation",
      message: isEditing
        ? `Are you sure you want to save changes to this module? Its details and curriculum placement will be updated.`
        : `Are you sure you want to create this new module under ${targetLevelObj?.name || "the selected level"}?`,
      affectedItem: `${moduleName.trim()} (${targetLevelObj?.name || "Level " + moduleLevelId})`,
      confirmLabel: isEditing ? "Save Changes" : "Create Module",
      cancelLabel: "Cancel",
      isDanger: false,
      onConfirm: async () => {
        setSubmitting(true);
        setError(null);
        setSuccessMessage("");
        try {
          if (editingModuleId) {
            await apiClient(`/modules/${editingModuleId}/`, {
              method: "PATCH",
              body: payload,
            });
            setSuccessMessage("Module updated successfully.");
          } else {
            await apiClient("/modules/", {
              method: "POST",
              body: payload,
            });
            setSuccessMessage("Module created successfully.");
          }
          setShowModuleModal(false);
          setConfirmConfig((prev) => ({ ...prev, show: false }));
          await loadData();
        } catch (err) {
          setError(err.message || "Failed to save module.");
          setConfirmConfig((prev) => ({ ...prev, show: false }));
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Quick Module Level Assignment / Reassignment Handler
  // ---------------------------------------------------------------------------
  const handleAssignModuleLevel = (moduleId, targetLevelId) => {
    const targetMod = modules.find((m) => m.id === moduleId);
    const targetLvl = courseLevels.find((lvl) => String(lvl.id) === String(targetLevelId));
    const targetLevelName = targetLvl ? targetLvl.name : (targetLevelId ? `Level ${targetLevelId}` : "Unassigned");

    setConfirmConfig({
      show: true,
      title: "Confirm Level Assignment",
      message: targetLevelId
        ? `Are you sure you want to change the Level Assignment for this module to "${targetLevelName}"? This will update its curriculum placement.`
        : `Are you sure you want to unassign this module from its current level?`,
      affectedItem: targetMod ? `${targetMod.name} → ${targetLevelName}` : `Module #${moduleId}`,
      confirmLabel: "Confirm Assignment",
      cancelLabel: "Cancel",
      isDanger: false,
      onConfirm: async () => {
        setSubmitting(true);
        setError(null);
        try {
          await apiClient(`/modules/${moduleId}/`, {
            method: "PATCH",
            body: { level: targetLevelId ? parseInt(targetLevelId, 10) : null },
          });
          setSuccessMessage(
            targetLevelId ? "Module assigned to level successfully." : "Module unassigned from level."
          );
          setConfirmConfig((prev) => ({ ...prev, show: false }));
          await loadData();
        } catch (err) {
          setError(err.message || "Failed to update module level assignment.");
          setConfirmConfig((prev) => ({ ...prev, show: false }));
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  // ---------------------------------------------------------------------------
  // CourseLevel Management Handlers
  // ---------------------------------------------------------------------------
  const handleOpenCreateLevelModal = () => {
    setEditingLevelId(null);
    setLevelCourseId(selectedCourse ? String(selectedCourse.id) : "");
    setLevelName(`Level ${courseLevels.length + 1}`);
    setLevelOrder(courseLevels.length + 1);
    setLevelDescription("");
    setError(null);
    setShowLevelModal(true);
  };

  const handleOpenEditLevelModal = (level) => {
    setEditingLevelId(level.id);
    setLevelCourseId(level.course !== null && level.course !== undefined ? String(level.course) : "");
    setLevelName(level.name);
    setLevelOrder(level.order ?? 1);
    setLevelDescription(level.description || "");
    setError(null);
    setShowLevelModal(true);
  };

  const handleSaveLevel = async (e) => {
    e.preventDefault();
    const trimmedName = levelName.trim();
    if (!trimmedName) {
      setError("Level Name is required.");
      return;
    }

    // Check duplicate level name (case-insensitive after trimming), excluding current editing level
    const isEditing = Boolean(editingLevelId);
    const isDuplicateName = courseLevels.some((lvl) => {
      if (isEditing && lvl.id === editingLevelId) return false;
      return (lvl.name || "").trim().toLowerCase() === trimmedName.toLowerCase();
    });

    if (isDuplicateName) {
      setError("A level with this name already exists.");
      return;
    }

    const orderNum = parseInt(levelOrder, 10);
    if (isNaN(orderNum) || orderNum <= 0) {
      setError("Sequence Order must be a valid positive number.");
      return;
    }

    const isDuplicateOrder = courseLevels.some((lvl) => {
      if (isEditing && lvl.id === editingLevelId) return false;
      return lvl.order === orderNum;
    });

    if (isDuplicateOrder) {
      setError("A level with this sequence order already exists.");
      return;
    }

    const targetCourseId = levelCourseId ? parseInt(levelCourseId, 10) : null;
    const payload = {
      course: targetCourseId,
      name: trimmedName,
      order: orderNum,
      description: levelDescription.trim(),
    };

    setConfirmConfig({
      show: true,
      title: isEditing ? "Confirm Level Update" : "Confirm Level Creation",
      message: isEditing
        ? `Are you sure you want to update this level? Name: "${payload.name}", Sequence Order: ${payload.order}${payload.description ? `, Description: "${payload.description}"` : ""}.`
        : `Are you sure you want to create "${payload.name}" at sequence order ${payload.order}?`,
      affectedItem: `${payload.name} (Tier #${payload.order})`,
      confirmLabel: isEditing ? "Save Changes" : "Create Level",
      cancelLabel: "Cancel",
      isDanger: false,
      onConfirm: async () => {
        setSubmitting(true);
        setError(null);
        setSuccessMessage("");
        try {
          if (editingLevelId) {
            await apiClient(`/course-levels/${editingLevelId}/`, {
              method: "PATCH",
              body: payload,
            });
            setSuccessMessage(`Level "${payload.name}" updated successfully.`);
          } else {
            await apiClient("/course-levels/", {
              method: "POST",
              body: payload,
            });
            setSuccessMessage(`Level "${payload.name}" created successfully.`);
          }
          setShowLevelModal(false);
          setConfirmConfig((prev) => ({ ...prev, show: false }));
          await loadData();
        } catch (err) {
          setError(err.message || "Failed to save course level.");
          setConfirmConfig((prev) => ({ ...prev, show: false }));
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleDeleteLevel = (level) => {
    setLevelToDelete(level);
    setShowDeleteLevelModal(true);
    setError(null);
  };

  const handleConfirmDeleteLevel = async () => {
    if (!levelToDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient(`/course-levels/${levelToDelete.id}/`, {
        method: "DELETE",
      });
      setSuccessMessage(`Level "${levelToDelete.name}" and all associated modules and records permanently deleted.`);
      setShowDeleteLevelModal(false);
      setLevelToDelete(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to delete level.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Module Insert, Reorder, and Content Upload Handlers
  // ---------------------------------------------------------------------------
  const handleOpenInsertModuleModal = ({ course, level, levelModules }) => {
    setInsertModalConfig({ course, level, levelModules: levelModules || [] });
    setShowInsertModuleModal(true);
  };

  const handleInsertModule = (insertData) => {
    const targetLvl = courseLevels.find((lvl) => String(lvl.id) === String(insertData.level));
    setConfirmConfig({
      show: true,
      title: "Confirm Insert Module",
      message: `Are you sure you want to insert "${insertData.name}" into ${targetLvl?.name || "Level"} at position (${insertData.position})? Existing modules will be re-sequenced automatically.`,
      affectedItem: `${insertData.name} → ${targetLvl?.name || "Level"}`,
      confirmLabel: "Insert Module",
      cancelLabel: "Cancel",
      isDanger: false,
      onConfirm: async () => {
        setSubmitting(true);
        setError(null);
        try {
          const res = await apiClient("/modules/insert/", {
            method: "POST",
            body: insertData,
          });
          setSuccessMessage(`Module "${res?.name || insertData.name}" inserted successfully at position ${res?.order || ""}.`);
          setShowInsertModuleModal(false);
          setConfirmConfig((prev) => ({ ...prev, show: false }));
          await loadData();
        } catch (err) {
          setError(err.message || "Failed to insert module.");
          setConfirmConfig((prev) => ({ ...prev, show: false }));
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleReorderModules = (levelId, moduleIds) => {
    const targetLvl = courseLevels.find((lvl) => String(lvl.id) === String(levelId));
    setConfirmConfig({
      show: true,
      title: "Confirm Module Reorder",
      message: `Are you sure you want to change the display order of modules in ${targetLvl?.name || "this level"}?`,
      affectedItem: `${targetLvl?.name || "Level " + levelId} (${moduleIds.length} modules)`,
      confirmLabel: "Reorder Modules",
      cancelLabel: "Cancel",
      isDanger: false,
      onConfirm: async () => {
        setSubmitting(true);
        setError(null);
        try {
          await apiClient("/modules/reorder/", {
            method: "POST",
            body: { level_id: levelId, module_ids: moduleIds },
          });
          setSuccessMessage("Modules reordered successfully.");
          setConfirmConfig((prev) => ({ ...prev, show: false }));
          await loadData();
        } catch (err) {
          setError(err.message || "Failed to reorder modules.");
          setConfirmConfig((prev) => ({ ...prev, show: false }));
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleOpenUploadModuleModal = (module) => {
    setUploadTargetModule(module);
    setShowUploadModuleModal(true);
  };

  const handleUploadModuleContent = (moduleId, formData) => {
    const targetMod = modules.find((m) => m.id === moduleId);
    const fileName = formData.get("file")?.name || "Document";
    setConfirmConfig({
      show: true,
      title: "Confirm Module Document Upload",
      message: `Are you sure you want to upload "${fileName}" to module "${targetMod?.name || moduleId}"? This will attach the learning material to the curriculum.`,
      affectedItem: `${targetMod?.name || "Module " + moduleId} ← ${fileName}`,
      confirmLabel: "Upload Document",
      cancelLabel: "Cancel",
      isDanger: false,
      onConfirm: async () => {
        setSubmitting(true);
        setError(null);
        try {
          // Direct multipart upload using fetch with session token
          const token = localStorage.getItem("accessToken") || "";
          const headers = {};
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          const csrfToken = await getCsrfToken();
          headers["X-CSRFToken"] = csrfToken;
 
          const response = await fetch(`/api/modules/${moduleId}/upload-content/`, {
            method: "POST",
            headers,
            credentials: "include",
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.detail || `Upload failed with status ${response.status}`);
          }

          setSuccessMessage("Learning material uploaded directly to module successfully.");
          setShowUploadModuleModal(false);
          setUploadTargetModule(null);
          setConfirmConfig((prev) => ({ ...prev, show: false }));
          await loadData();
        } catch (err) {
          setError(err.message || "Failed to upload module content.");
          setConfirmConfig((prev) => ({ ...prev, show: false }));
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleDeleteModule = (module) => {
    setModuleToDelete(module);
    setModuleDeletionImpact(null);
    setShowDeleteModuleModal(true);
    setLoadingModuleDeletionImpact(true);
    setError(null);

    // Fetch live module deletion impact metrics
    apiClient(`/modules/${module.id}/deletion-impact/`)
      .then((data) => {
        setModuleDeletionImpact(data);
      })
      .catch(() => {
        // Fallback to local counts if endpoint fails
        const modSubmodules = submodules.filter((s) => s.module === module.id);
        const modMappings = mappings.filter((m) => m.module === module.id);
        setModuleDeletionImpact({
          module_id: module.id,
          name: module.name,
          status: module.status,
          course_id: module.course,
          course_name: selectedCourse?.name || "Current Course",
          submodules_count: modSubmodules.length,
          assignments_count: 0,
          questions_count: 0,
          attempts_count: 0,
          responses_count: 0,
          feedback_count: 0,
          materials_mappings_count: modMappings.length,
        });
      })
      .finally(() => {
        setLoadingModuleDeletionImpact(false);
      });
  };

  const handleConfirmDeleteModule = async () => {
    if (!moduleToDelete) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiClient(`/modules/${moduleToDelete.id}/`, { method: "DELETE" });
      setSuccessMessage(`Module "${moduleToDelete.name}" deleted successfully.`);
      if (activeModule?.id === moduleToDelete.id) {
        setActiveModule(null);
      }
      setShowDeleteModuleModal(false);
      setModuleToDelete(null);
      setModuleDeletionImpact(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to delete module.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseDeleteModuleModal = () => {
    if (submitting) return;
    setShowDeleteModuleModal(false);
    setModuleToDelete(null);
    setModuleDeletionImpact(null);
  };

  // ---------------------------------------------------------------------------
  // Submodule CRUD Handlers
  // ---------------------------------------------------------------------------
  const handleOpenCreateSubmoduleModal = () => {
    setEditingSubmoduleId(null);
    setSubmoduleName("");
    setSubmoduleDescription("");
    setSubmoduleOrder(activeSubmodules.length + 1);
    setSubmoduleStatus("DRAFT");
    setError(null);
    setShowSubmoduleModal(true);
  };

  const handleOpenEditSubmoduleModal = (sub) => {
    setEditingSubmoduleId(sub.id);
    setSubmoduleName(sub.name);
    setSubmoduleDescription(sub.description || "");
    setSubmoduleOrder(sub.order ?? 1);
    setSubmoduleStatus(sub.status || "DRAFT");
    setError(null);
    setShowSubmoduleModal(true);
  };

  const handleDuplicateSubmodule = async (sub) => {
    const defaultCopyName = `${sub.name} (Copy)`;

    const inputName = window.prompt("Enter title for duplicated lesson:", defaultCopyName);
    if (!inputName || !inputName.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccessMessage("");

    const payload = {
      module: sub.module,
      name: inputName.trim(),
      description: sub.description || "",
      order: activeSubmodules.length + 1,
      status: "DRAFT", // Always draft
    };

    try {
      const newSub = await apiClient("/submodules/", {
        method: "POST",
        body: payload,
      });
      setSuccessMessage(`Lesson duplicated successfully as "${newSub.name}" in DRAFT status.`);
      if (activeModule) {
        await loadModuleDetails(activeModule.id);
      }
    } catch (err) {
      setError(err.message || "Failed to duplicate lesson.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSubmodule = async (e) => {
    e.preventDefault();
    if (!submoduleName.trim() || !activeModule) {
      setError("Submodule Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage("");

    const payload = {
      module: activeModule.id,
      name: submoduleName.trim(),
      description: submoduleDescription.trim(),
      order: parseInt(submoduleOrder, 10) || 1,
      status: submoduleStatus,
    };

    try {
      if (editingSubmoduleId) {
        await apiClient(`/submodules/${editingSubmoduleId}/`, {
          method: "PATCH",
          body: payload,
        });
        setSuccessMessage("Submodule updated successfully.");
      } else {
        await apiClient("/submodules/", {
          method: "POST",
          body: payload,
        });
        setSuccessMessage("Submodule created successfully.");
      }
      setShowSubmoduleModal(false);
      await loadModuleDetails(activeModule.id);
    } catch (err) {
      setError(err.message || "Failed to save submodule.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubmodule = async (sub) => {
    if (sub.status !== "DRAFT") {
      setError("Only DRAFT submodules can be deleted.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete submodule "${sub.name}"?`)) {
      return;
    }

    setError(null);
    try {
      await apiClient(`/submodules/${sub.id}/`, { method: "DELETE" });
      setSuccessMessage("Submodule deleted successfully.");
      await loadModuleDetails(activeModule.id);
    } catch (err) {
      setError(err.message || "Failed to delete submodule.");
    }
  };

  // ---------------------------------------------------------------------------
  // Module Question CRUD Handlers
  // ---------------------------------------------------------------------------
  const handleOpenCreateQuestionModal = () => {
    setEditingQuestionId(null);
    setQuestionText("");
    setQuestionOrder(activeQuestions.length + 1);
    setQuestionIsRequired(true);
    setQuestionIsActive(true);
    setQuestionType("MULTIPLE_CHOICE");
    setQuestionOptions([
      { id: "opt_1", text: "", is_correct: false },
      { id: "opt_2", text: "", is_correct: false },
      { id: "opt_3", text: "", is_correct: false },
    ]);
    setError(null);
    setShowQuestionModal(true);
  };

  const handleOpenEditQuestionModal = (q) => {
    setEditingQuestionId(q.id);
    setQuestionText(q.question_text);
    setQuestionOrder(q.order);
    setQuestionIsRequired(q.is_required);
    setQuestionIsActive(q.is_active);
    const qType = q.question_type || "MULTIPLE_CHOICE";
    setQuestionType(qType);
    if (Array.isArray(q.options) && q.options.length > 0) {
      setQuestionOptions(q.options.map((opt, idx) => ({
        id: opt.id || `opt_${idx + 1}`,
        text: opt.text || "",
        is_correct: Boolean(opt.is_correct),
      })));
    } else {
      setQuestionOptions([
        { id: "opt_1", text: "", is_correct: true },
        { id: "opt_2", text: "", is_correct: false },
        { id: "opt_3", text: "", is_correct: false },
      ]);
    }
    setError(null);
    setShowQuestionModal(true);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    if (!questionText.trim() || !activeModule) {
      setError("Question prompt text is required.");
      return;
    }

    if (questionType === "YES_NO") {
      if (questionOptions.length !== 2) {
        setError("Yes/No questions must have exactly two options.");
        return;
      }
    } else {
      if (questionOptions.length < 3) {
        setError("Multiple Choice questions must have at least 3 options.");
        return;
      }
    }

    for (let i = 0; i < questionOptions.length; i++) {
      if (!questionOptions[i].text.trim()) {
        setError(`Option ${i + 1} text cannot be empty.`);
        return;
      }
    }

    const correctCount = questionOptions.filter((opt) => opt.is_correct).length;
    if (correctCount === 0) {
      setError("No correct answer selected. Please select exactly one correct answer option.");
      return;
    }
    if (correctCount > 1) {
      setError("Multiple correct answers selected. Please select only one correct answer option.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage("");

    const payload = {
      module: activeModule.id,
      question_text: questionText.trim(),
      question_type: questionType,
      options: questionOptions.map((opt, i) => ({
        id: opt.id || `opt_${i + 1}`,
        text: opt.text.trim(),
        is_correct: opt.is_correct,
      })),
      order: parseInt(questionOrder, 10) || 1,
      is_required: questionIsRequired,
      is_active: questionIsActive,
    };

    try {
      if (editingQuestionId) {
        await apiClient(`/module-questions/${editingQuestionId}/`, {
          method: "PATCH",
          body: payload,
        });
        setSuccessMessage("Completion question updated successfully.");
      } else {
        await apiClient("/module-questions/", {
          method: "POST",
          body: payload,
        });
        setSuccessMessage("Required question added to module.");
      }
      setShowQuestionModal(false);
      await loadModuleDetails(activeModule.id);
    } catch (err) {
      setError(err.message || "Failed to save module question.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (q) => {
    if (!window.confirm("Are you sure you want to delete this question?")) {
      return;
    }
    setError(null);
    try {
      await apiClient(`/module-questions/${q.id}/`, { method: "DELETE" });
      setSuccessMessage("Question deleted successfully.");
      await loadModuleDetails(activeModule.id);
    } catch (err) {
      setError(err.message || "Failed to delete question.");
    }
  };

  // ---------------------------------------------------------------------------
  // Material Mapping Modal Helpers
  // ---------------------------------------------------------------------------
  const handleOpenAttachModal = (config = {}) => {
    setMappingModalConfig(config);
    setShowMappingModal(true);
  };

  const handleMappingSaved = () => {
    setSuccessMessage("Training material attached successfully.");
    if (activeModule) {
      loadModuleDetails(activeModule.id);
    } else {
      loadData();
    }
  };

  const handleMappingDeleted = (mappingId) => {
    setSuccessMessage("Mapping removed successfully (physical file preserved).");
    setMappings((prev) => prev.filter((m) => m.id !== mappingId));
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PUBLISHED":
        return <span className="badge badge-success">Published</span>;
      case "ARCHIVED":
        return <span className="badge badge-secondary">Archived</span>;
      default:
        return <span className="badge badge-warning">Draft</span>;
    }
  };

  return (
    <div>
      {/* Top Header / Breadcrumbs Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          {selectedCourse ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBackToCatalog}
                style={{ padding: "4px 10px", fontSize: "12px" }}
              >
                &larr; Course Catalog
              </button>
              <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0, color: "var(--text-main)" }}>
                {selectedCourse.name}
              </h2>
              <span className="badge badge-info">{selectedCourse.code}</span>
              {getStatusBadge(selectedCourse.status)}
            </div>
          ) : (
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 4px 0", color: "var(--text-main)" }}>
                Courses & Training Materials Management
              </h2>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
                Manage learning courses, modules, lesson content, and linked training documents.
              </p>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {selectedCourse && (
            <>
              {selectedCourse.status !== "ARCHIVED" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleOpenPublishCourseModal(selectedCourse)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    backgroundColor: "var(--status-success, #10b981)",
                    borderColor: "var(--status-success, #10b981)",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  title={selectedCourse.status === "PUBLISHED" ? "Publish remaining draft modules and submodules" : "Publish course and all draft content"}
                >
                  <span>🚀 {selectedCourse.status === "PUBLISHED" ? "Publish All Course Content" : "Publish Course"}</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleOpenPreviewCourseModal(selectedCourse)}
                style={{ padding: "6px 12px", fontSize: "12px", color: "var(--accent-primary, #6366f1)" }}
                title="Preview course as a reader without editing"
              >
                👁️ Preview Course
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRefresh}
            disabled={loading}
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="alert alert-success" role="status" style={{ marginBottom: "14px" }}>
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="status" style={{ marginBottom: "14px" }}>
          <span>{error}</span>
        </div>
      )}

      {/* Workspace Tabs (Level 2: Selected Course Workspace) */}
      {selectedCourse && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            borderBottom: "1px solid var(--border-color)",
            marginBottom: "16px",
            paddingBottom: "8px",
          }}
        >
          <button
            type="button"
            className={`btn ${workspaceTab === "curriculum" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setWorkspaceTab("curriculum");
              setActiveModule(null);
            }}
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            1. Curriculum & Lessons
          </button>
          <button
            type="button"
            className={`btn ${workspaceTab === "materials" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setWorkspaceTab("materials");
              setActiveModule(null);
            }}
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            2. Course Materials & Clusters
          </button>
          <button
            type="button"
            className={`btn ${workspaceTab === "repository" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setWorkspaceTab("repository");
              setActiveModule(null);
            }}
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            3. Materials Repository & Ingestion
          </button>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
          <p style={{ color: "var(--text-secondary)" }}>Loading curriculum & materials data...</p>
        </div>
      ) : (
        <>
          {/* LEVEL 1: Level-First View (Default when no course is selected and not in global repository) */}
          {!selectedCourse && workspaceTab !== "repository" && !activeModule && (
            <CourseLevelsFirstView
              courses={courses}
              courseLevels={courseLevels}
              modules={modules}
              clusters={clusters}
              mappings={mappings}
              onOpenGlobalRepository={handleOpenGlobalRepository}
              onOpenCreateCourseModal={handleOpenCreateCourseModal}
              onOpenCreateLevelModal={handleOpenCreateLevelModal}
              onOpenEditLevelModal={handleOpenEditLevelModal}
              onDeleteLevel={handleDeleteLevel}
              onAssignModuleLevel={handleAssignModuleLevel}
              onOpenCreateModuleModal={handleOpenCreateModuleModal}
              onOpenInsertModuleModal={handleOpenInsertModuleModal}
              onOpenUploadModuleModal={handleOpenUploadModuleModal}
              onReorderModules={handleReorderModules}
              onOpenEditModuleModal={handleOpenEditModuleModal}
              onDeleteModule={handleDeleteModule}
              onDuplicateModule={handleDuplicateModule}
              onOpenModuleContent={handleOpenModuleContent}
              onOpenPreviewCourseModal={handleOpenPreviewCourseModal}
              onSelectCourse={handleSelectCourse}
              getStatusBadge={getStatusBadge}
            />
          )}

          {/* GLOBAL REPOSITORY MODE: When no course is selected and workspaceTab === "repository" */}
          {!selectedCourse && workspaceTab === "repository" && (
            <div>
              <div style={{ marginBottom: "14px" }}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", color: "var(--text-main)" }}>
                  Global Training Materials Repository & Ingestion
                </h3>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                  Universal repository access across all curriculum modules, batch folder uploads, and unassigned staging library.
                </p>
              </div>

              <MaterialRepositoryView
                selectedCourse={null}
                files={files}
                mappings={mappings}
                clusters={clusters}
                modules={modules}
                courses={courses}
                onDataRefresh={loadData}
                onOpenAttachModal={(config) => handleOpenAttachModal(config)}
                onBackToCatalog={handleBackToCatalog}
                onOpenPreviewCourseModal={handleOpenPreviewCourseModal}
              />
            </div>
          )}

          {/* LEVEL 2: Selected Course Workspace Views (or Active Course-less Module Content View) */}
          {(selectedCourse || activeModule) && workspaceTab === "curriculum" && (
            <CourseCurriculumView
              selectedCourse={selectedCourse}
              courseLevels={courseLevels}
              onOpenCreateLevelModal={handleOpenCreateLevelModal}
              onOpenEditLevelModal={handleOpenEditLevelModal}
              onDeleteLevel={handleDeleteLevel}
              onAssignModuleLevel={handleAssignModuleLevel}
              modules={modules}
              activeModule={activeModule}
              setActiveModule={setActiveModule}
              moduleSubTab={moduleSubTab}
              setModuleSubTab={setModuleSubTab}
              activeSubmodules={activeSubmodules}
              activeQuestions={activeQuestions}
              contentLoading={contentLoading}
              moduleSearch={moduleSearch}
              setModuleSearch={setModuleSearch}
              moduleStatusFilter={moduleStatusFilter}
              setModuleStatusFilter={setModuleStatusFilter}
              mappings={mappings}
              onOpenCreateModuleModal={handleOpenCreateModuleModal}
              onOpenEditModuleModal={handleOpenEditModuleModal}
              onDeleteModule={handleDeleteModule}
              onDuplicateModule={handleDuplicateModule}
              onOpenModuleContent={handleOpenModuleContent}
              onCloseModuleContent={handleCloseModuleContent}
              onOpenCreateSubmoduleModal={handleOpenCreateSubmoduleModal}
              onOpenEditSubmoduleModal={handleOpenEditSubmoduleModal}
              onDeleteSubmodule={handleDeleteSubmodule}
              onDuplicateSubmodule={handleDuplicateSubmodule}
              onOpenCreateQuestionModal={handleOpenCreateQuestionModal}
              onOpenEditQuestionModal={handleOpenEditQuestionModal}
              onDeleteQuestion={handleDeleteQuestion}
              onOpenAttachModal={(sub) =>
                handleOpenAttachModal({
                  initialSubmodule: sub,
                  initialModule: activeModule,
                })
              }
              onMappingDeleted={handleMappingDeleted}
              onOpenPreviewCourseModal={handleOpenPreviewCourseModal}
              getStatusBadge={getStatusBadge}
            />
          )}

          {selectedCourse && workspaceTab === "materials" && (
            <CourseMaterialsView
              selectedCourse={selectedCourse}
              clusters={clusters}
              modules={modules}
              submodules={submodules}
              mappings={mappings}
              files={files}
              courses={courses}
              onDataRefresh={loadData}
              onOpenAttachModal={(config) => handleOpenAttachModal(config)}
              onMappingDeleted={handleMappingDeleted}
              onOpenPreviewCourseModal={handleOpenPreviewCourseModal}
            />
          )}

          {selectedCourse && workspaceTab === "repository" && (
            <MaterialRepositoryView
              selectedCourse={selectedCourse}
              files={files}
              mappings={mappings}
              clusters={clusters}
              modules={modules}
              courses={courses}
              onDataRefresh={loadData}
              onOpenAttachModal={(config) => handleOpenAttachModal(config)}
              onBackToCatalog={handleBackToCatalog}
              onOpenPreviewCourseModal={handleOpenPreviewCourseModal}
            />
          )}
        </>
      )}

      {/* Course Modal */}
      {showCourseModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-container" style={{ maxWidth: "500px", width: "100%" }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingCourseId ? "Edit Course" : "Create New Course"}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCourseModal(false)}
                disabled={submitting}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveCourse}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="form-group">
                  <label className="form-label">Course Name <span style={{ color: "var(--status-error)" }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Course Code <span style={{ color: "var(--status-error)" }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={courseDescription}
                    onChange={(e) => setCourseDescription(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Display Order</label>
                  <input
                    type="number"
                    className="form-input"
                    value={courseOrder}
                    onChange={(e) => setCourseOrder(e.target.value)}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Publication Status</label>
                  <select
                    className="form-input"
                    value={courseStatus}
                    onChange={(e) => setCourseStatus(e.target.value)}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCourseModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingCourseId ? "Save Changes" : "Create Course"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Module Modal */}
      {showModuleModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setShowModuleModal(false);
            }
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card, #ffffff)",
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
              maxWidth: "680px",
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--bg-surface)",
                flexShrink: 0,
              }}
            >
              <h3 className="modal-title" style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "var(--text-main)" }}>
                {editingModuleId ? "Edit Module" : "Create New Module"}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowModuleModal(false)}
                disabled={submitting}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  cursor: submitting ? "not-allowed" : "pointer",
                  color: "var(--text-secondary)",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveModule} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, margin: 0 }}>
              <div
                className="modal-body"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  overflowY: "auto",
                  padding: "20px",
                  flex: 1,
                }}
              >
                {error && (
                  <div
                    className="alert alert-error"
                    style={{
                      marginBottom: "6px",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      color: "var(--status-error, #b91c1c)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                    }}
                  >
                    {error}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Course Level <span style={{ color: "var(--status-error)" }}>*</span></label>
                  <select
                    className="form-input"
                    value={moduleLevelId}
                    onChange={(e) => setModuleLevelId(e.target.value)}
                    required
                  >
                    <option value="">-- Select Course Level --</option>
                    {courseLevels
                      .filter((lvl) => !moduleCourseId || !lvl.course || lvl.course === parseInt(moduleCourseId, 10))
                      .map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.name} (Sequence #{lvl.order})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Parent Course (Optional)</label>
                  <select
                    className="form-input"
                    value={moduleCourseId}
                    onChange={(e) => setModuleCourseId(e.target.value)}
                  >
                    <option value="">-- No Parent Course (Independent Level Module) --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Module Name <span style={{ color: "var(--status-error)" }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={moduleDescription}
                    onChange={(e) => setModuleDescription(e.target.value)}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Order</label>
                    <input
                      type="number"
                      className="form-input"
                      value={moduleOrder}
                      onChange={(e) => setModuleOrder(e.target.value)}
                      min="1"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duration (min, optional)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g. 30 (optional)"
                      value={moduleDuration}
                      onChange={(e) => setModuleDuration(e.target.value)}
                      min="0"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-input"
                    value={moduleStatus}
                    onChange={(e) => setModuleStatus(e.target.value)}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
              <div
                className="modal-footer"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  padding: "14px 20px",
                  borderTop: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-surface)",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModuleModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingModuleId ? "Save Changes" : "Create Module"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CourseLevel Modal */}
      {showLevelModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setShowLevelModal(false);
            }
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "var(--bg-card, #ffffff)",
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--bg-surface)",
                flexShrink: 0,
              }}
            >
              <h3 className="modal-title" style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "var(--text-main)" }}>
                {editingLevelId ? "Edit Level" : "Create New Level"}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowLevelModal(false)}
                disabled={submitting}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  cursor: submitting ? "not-allowed" : "pointer",
                  color: "var(--text-secondary)",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveLevel} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, margin: 0 }}>
              <div
                className="modal-body"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  overflowY: "auto",
                  padding: "20px",
                  flex: 1,
                }}
              >
                {error && (
                  <div
                    className="alert alert-error"
                    style={{
                      marginBottom: "6px",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      color: "var(--status-error, #b91c1c)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                    }}
                  >
                    {error}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Level Name <span style={{ color: "var(--status-error)" }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Level 1, Level 2, Level 3, Level 4"
                    value={levelName}
                    onChange={(e) => setLevelName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Sequence Order</label>
                  <input
                    type="number"
                    className="form-input"
                    value={levelOrder}
                    onChange={(e) => setLevelOrder(e.target.value)}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description (Optional)</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    placeholder="Brief description of skills or prerequisites for this level"
                    value={levelDescription}
                    onChange={(e) => setLevelDescription(e.target.value)}
                  />
                </div>
              </div>
              <div
                className="modal-footer"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  padding: "14px 20px",
                  borderTop: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-surface)",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowLevelModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingLevelId ? "Save Changes" : "Create Level"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submodule Modal */}
      {showSubmoduleModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-container" style={{ maxWidth: "500px", width: "100%" }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSubmoduleId ? "Edit Submodule" : "Add Submodule"}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowSubmoduleModal(false)}
                disabled={submitting}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveSubmodule}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="form-group">
                  <label className="form-label">Lesson Name <span style={{ color: "var(--status-error)" }}>*</span></label>
                  <input
                    type="text"
                    className="form-input"
                    value={submoduleName}
                    onChange={(e) => setSubmoduleName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description / Instructional Content</label>
                  <textarea
                    className="form-input"
                    rows="4"
                    value={submoduleDescription}
                    onChange={(e) => setSubmoduleDescription(e.target.value)}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Order</label>
                    <input
                      type="number"
                      className="form-input"
                      value={submoduleOrder}
                      onChange={(e) => setSubmoduleOrder(e.target.value)}
                      min="1"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-input"
                      value={submoduleStatus}
                      onChange={(e) => setSubmoduleStatus(e.target.value)}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSubmoduleModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingSubmoduleId ? "Save Changes" : "Create Submodule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Module Question Modal */}
      {showQuestionModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "16px",
          }}
        >
          <div
            className="modal-container"
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
              maxWidth: "580px",
              width: "100%",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div className="modal-header">
              <h3 className="modal-title">{editingQuestionId ? "Edit Completion Question" : "Add Required Question"}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowQuestionModal(false)}
                disabled={submitting}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveQuestion} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
              <div
                className="modal-body"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  overflowY: "auto",
                  padding: "16px 20px",
                  flex: 1,
                }}
              >
                <div className="form-group">
                  <label className="form-label">Question Type</label>
                  <select
                    className="form-input"
                    value={questionType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setQuestionType(newType);
                      if (newType === "YES_NO") {
                        setQuestionOptions([
                          { id: "opt_yes", text: "Yes", is_correct: false },
                          { id: "opt_no", text: "No", is_correct: false },
                        ]);
                      } else if (questionOptions.length < 3) {
                        setQuestionOptions([
                          { id: "opt_1", text: "", is_correct: false },
                          { id: "opt_2", text: "", is_correct: false },
                          { id: "opt_3", text: "", is_correct: false },
                        ]);
                      }
                    }}
                  >
                    <option value="MULTIPLE_CHOICE">Multiple Choice (Single Answer, 3+ options)</option>
                    <option value="YES_NO">Yes / No Confirmation (2 options)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Question Prompt <span style={{ color: "var(--status-error)" }}>*</span></label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    required
                  />
                </div>

                {/* Options Editor */}
                <div className="form-group">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <label className="form-label" style={{ margin: 0 }}>Answer Options</label>
                    {questionType === "MULTIPLE_CHOICE" && questionOptions.length < 6 && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          setQuestionOptions((prev) => [
                            ...prev,
                            { id: `opt_${prev.length + 1}`, text: "", is_correct: false },
                          ])
                        }
                        style={{ padding: "2px 8px", fontSize: "11px" }}
                      >
                        + Add Option
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {questionOptions.map((opt, idx) => (
                      <div key={opt.id || idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="radio"
                          name="correct_answer_choice"
                          checked={opt.is_correct}
                          onChange={() =>
                            setQuestionOptions((prev) =>
                              prev.map((o, i) => ({ ...o, is_correct: i === idx }))
                            )
                          }
                          title="Mark this option as the correct answer"
                        />
                        <span style={{ fontSize: "12px", fontWeight: "600", width: "16px" }}>
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        <input
                          type="text"
                          className="form-input"
                          placeholder={`Option ${idx + 1} text...`}
                          value={opt.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setQuestionOptions((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, text: val } : o))
                            );
                          }}
                          style={{ flex: 1, padding: "6px 10px", fontSize: "12px" }}
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label className="form-label">Order</label>
                    <input
                      type="number"
                      className="form-input"
                      value={questionOrder}
                      onChange={(e) => setQuestionOrder(e.target.value)}
                      min="1"
                    />
                  </div>
                  <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "24px" }}>
                    <input
                      type="checkbox"
                      id="q_is_active"
                      checked={questionIsActive}
                      onChange={(e) => setQuestionIsActive(e.target.checked)}
                    />
                    <label htmlFor="q_is_active" style={{ fontSize: "12px", cursor: "pointer" }}>Active Gate</label>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowQuestionModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingQuestionId ? "Save Changes" : "Save Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Material Mapping Modal */}
      {showMappingModal && (
        <MaterialMappingModal
          show={showMappingModal}
          onClose={() => setShowMappingModal(false)}
          initialFile={mappingModalConfig.file}
          initialSubmodule={mappingModalConfig.initialSubmodule}
          initialModule={mappingModalConfig.initialModule}
          initialCluster={mappingModalConfig.initialCluster}
          clusters={clusters}
          modules={selectedCourse ? modules.filter((m) => m.course === selectedCourse.id) : modules}
          submodules={submodules}
          files={files}
          onMappingSaved={handleMappingSaved}
          initialShowPreview={mappingModalConfig.initialShowPreview}
        />
      )}

      {/* Course Deletion Confirmation Modal */}
      {showDeleteCourseModal && (
        <CourseDeleteModal
          show={showDeleteCourseModal}
          course={courseToDelete}
          impact={courseDeletionImpact}
          loadingImpact={loadingDeletionImpact}
          submitting={submitting}
          onClose={handleCloseDeleteCourseModal}
          onConfirm={handleConfirmDeleteCourse}
        />
      )}

      {/* Module Deletion Confirmation Modal */}
      {showDeleteModuleModal && (
        <ModuleDeleteModal
          show={showDeleteModuleModal}
          module={moduleToDelete}
          impact={moduleDeletionImpact}
          loadingImpact={loadingModuleDeletionImpact}
          submitting={submitting}
          onClose={handleCloseDeleteModuleModal}
          onConfirm={handleConfirmDeleteModule}
        />
      )}

      {/* Level Permanent Deletion Confirmation Modal */}
      {showDeleteLevelModal && (
        <LevelDeleteModal
          show={showDeleteLevelModal}
          level={levelToDelete}
          modulesCount={modules.filter((m) => m.level === levelToDelete?.id).length}
          submitting={submitting}
          onClose={() => {
            if (!submitting) {
              setShowDeleteLevelModal(false);
              setLevelToDelete(null);
            }
          }}
          onConfirm={handleConfirmDeleteLevel}
        />
      )}

      {/* Generic Confirmation Modal for Important Curriculum / Module Operations */}
      {confirmConfig.show && (
        <ConfirmActionModal
          show={confirmConfig.show}
          title={confirmConfig.title}
          message={confirmConfig.message}
          affectedItem={confirmConfig.affectedItem}
          confirmLabel={confirmConfig.confirmLabel}
          cancelLabel={confirmConfig.cancelLabel}
          isDanger={confirmConfig.isDanger}
          submitting={submitting}
          onClose={() => {
            if (!submitting) {
              setConfirmConfig((prev) => ({ ...prev, show: false }));
            }
          }}
          onConfirm={confirmConfig.onConfirm}
        />
      )}

      {/* Module Insert Modal */}
      {showInsertModuleModal && (
        <ModuleInsertModal
          show={showInsertModuleModal}
          course={insertModalConfig.course}
          level={insertModalConfig.level}
          levelModules={insertModalConfig.levelModules}
          submitting={submitting}
          onClose={() => setShowInsertModuleModal(false)}
          onInsert={handleInsertModule}
        />
      )}

      {/* Module Upload Modal */}
      {showUploadModuleModal && (
        <ModuleUploadModal
          show={showUploadModuleModal}
          module={uploadTargetModule}
          submodules={submodules.filter((s) => s.module === uploadTargetModule?.id)}
          submitting={submitting}
          onClose={() => {
            setShowUploadModuleModal(false);
            setUploadTargetModule(null);
          }}
          onUpload={handleUploadModuleContent}
        />
      )}

      {/* Course Read-Only Preview Modal */}
      {showPreviewModal && (
        <CoursePreviewModal
          show={showPreviewModal}
          course={courseToPreview}
          modules={modules}
          submodules={submodules}
          mappings={mappings}
          clusters={clusters}
          onClose={handleClosePreviewCourseModal}
        />
      )}

      {/* Course Automatic Publishing / Content Sync Modal */}
      {showPublishModal && (
        <CoursePublishModal
          show={showPublishModal}
          course={courseToPublish}
          onClose={handleClosePublishCourseModal}
          onPublishSuccess={handlePublishSuccess}
        />
      )}
    </div>
  );
}
