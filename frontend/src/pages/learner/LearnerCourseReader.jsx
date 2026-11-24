import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../hooks/useAuth";
import { apiClient } from "../../services/api";
import LessonContentRenderer, { normalizeLessonContent } from "./LessonContentRenderer";

/**
 * LearnerCourseReader Component (Phase 6.2 & 6.3)
 *
 * Dedicated course content, module overview, and questions interface:
 * - Displays course modules and their submodules.
 * - Displays active module confirmation questions (GET /api/module-questions/?module=<id>&is_active=true).
 * - Displays learner's existing question responses (GET /api/question-responses/?module=<id>).
 * - Evaluates and shows real-time module completion status (GET /api/question-responses/module-completion-status/?module=<id>).
 * - Allows learners to answer Yes / No and submit responses (POST /api/question-responses/).
 * - Prevents duplicate submissions and displays recorded answers in read-only mode.
 */
/**
 * StarRating Component: 1 to 5 interactive or read-only star control.
 */
function StarRating({ value = 0, onChange = null, disabled = false, size = 20, label = "" }) {
  const [hoverVal, setHoverVal] = useState(0);

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <div
        style={{ display: "inline-flex", gap: "4px" }}
        onMouseLeave={() => !disabled && setHoverVal(0)}
        role={onChange && !disabled ? "radiogroup" : undefined}
        aria-label={label}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = (hoverVal || value) >= star;
          return (
            <button
              key={star}
              type="button"
              disabled={disabled || !onChange}
              onClick={() => onChange && !disabled && onChange(star)}
              onMouseEnter={() => onChange && !disabled && setHoverVal(star)}
              style={{
                background: "transparent",
                border: "none",
                padding: "2px",
                cursor: disabled || !onChange ? "default" : "pointer",
                color: isFilled ? "#F59E0B" : "var(--border-color)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "transform 0.1s ease, color 0.1s ease",
                transform: !disabled && onChange && hoverVal >= star ? "scale(1.15)" : "scale(1)",
              }}
              title={onChange ? `${star} star${star === 1 ? "" : "s"}` : undefined}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
            >
              <svg width={size} height={size} viewBox="0 0 24 24" fill={isFilled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                />
              </svg>
            </button>
          );
        })}
      </div>
      {value > 0 && (
        <span style={{ fontSize: "12px", fontWeight: "600", color: "#F59E0B" }}>
          {value}/5
        </span>
      )}
    </div>
  );
}

export default function LearnerCourseReader({
  course,
  onBack,
  initialModuleId = null,
  initialSubmoduleId = null,
  isStandaloneTab = false,
  isAssessmentOnlyMode = false,
}) {
  const { user, activePortal } = useAuth();
  const isAdminPreview = user?.role === "ADMIN" && activePortal === "LEARNER";

  const [modules, setModules] = useState([]);
  const [submodules, setSubmodules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState(initialModuleId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Question & Response state for the active module
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState([]); // array of response objects
  const [completionStatus, setCompletionStatus] = useState(null); // object from module-completion-status
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState(null);
  const [submittingQuestionId, setSubmittingQuestionId] = useState(null);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [pendingSelections, setPendingSelections] = useState({}); // { [questionId]: optionId }
  const [retakeLoading, setRetakeLoading] = useState(false);
  const [showAttemptHistory, setShowAttemptHistory] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const search = window.location.search;
      const hash = window.location.hash;
      if (search.includes("target=assessment") || hash === "#assessment" || hash === "#module-assessment-section") {
        return "assessment";
      }
    }
    return "materials";
  });
  const [retakeEligibility, setRetakeEligibility] = useState(null);
  const [completingSubmoduleId, setCompletingSubmoduleId] = useState(null);
  const [activeViewingSubmodule, setActiveViewingSubmodule] = useState(null);
  const [openingSubmoduleId, setOpeningSubmoduleId] = useState(null);
  const [lessonMaterials, setLessonMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [moduleMaterialsMap, setModuleMaterialsMap] = useState({});
  const [loadingModuleMaterials, setLoadingModuleMaterials] = useState(false);

  // Module Feedback & Trainer Rating State (Stage 1)
  const [feedbackRecord, setFeedbackRecord] = useState(null); // Existing submitted ModuleFeedback object
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [eligibleTrainers, setEligibleTrainers] = useState([]);
  // Form input states
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [moduleRating, setModuleRating] = useState(0);
  const [trainerRating, setTrainerRating] = useState(0);
  const [understandingLevel, setUnderstandingLevel] = useState("ADVANCED");
  const [feedbackComments, setFeedbackComments] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [formValidationErrors, setFormValidationErrors] = useState({});
  const [feedbackSuccessMsg, setFeedbackSuccessMsg] = useState(null);

  const loadCourseContent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [modulesRes, submodulesRes] = await Promise.all([
        apiClient("/modules/"),
        apiClient("/submodules/"),
      ]);

      const allModules = Array.isArray(modulesRes) ? modulesRes : (modulesRes?.results || []);
      const allSubmodules = Array.isArray(submodulesRes) ? submodulesRes : (submodulesRes?.results || []);

      const targetModuleObj = initialModuleId
        ? allModules.find((m) => m.id === initialModuleId)
        : null;
      const effectiveLevelId = course?.level_id || targetModuleObj?.level || null;

      // Filter to records belonging to this course, its level (for course-less / hybrid modules), or the explicitly requested module
      let courseModules = allModules
        .filter((m) => {
          if (initialModuleId && m.id === initialModuleId) return true;
          if (course?.id && m.course === course.id) return true;
          if (effectiveLevelId && m.level === effectiveLevelId && (!course?.id || !m.course)) return true;
          return false;
        })
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      // In assessment-only mode, isolate view strictly to the selected module
      if (isAssessmentOnlyMode && initialModuleId) {
        courseModules = courseModules.filter((m) => m.id === initialModuleId);
      }

      const courseModuleIds = new Set(courseModules.map((m) => m.id));

      const courseSubmodules = allSubmodules
        .filter((s) => courseModuleIds.has(s.module))
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      setModules(courseModules);
      setSubmodules(courseSubmodules);

      if (courseModules.length > 0) {
        setSelectedModuleId((prev) => (prev && courseModuleIds.has(prev) ? prev : courseModules[0].id));
      } else {
        setSelectedModuleId(null);
      }
    } catch (err) {
      setError(err.message || "Failed to load course curriculum. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [course, isAssessmentOnlyMode, initialModuleId]);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        setLoading(true);
        setError(null);

        const [modulesRes, submodulesRes] = await Promise.all([
          apiClient("/modules/"),
          apiClient("/submodules/"),
        ]);

        if (isMounted) {
          const allModules = Array.isArray(modulesRes) ? modulesRes : (modulesRes?.results || []);
          const allSubmodules = Array.isArray(submodulesRes) ? submodulesRes : (submodulesRes?.results || []);

          const targetModuleObj = initialModuleId
            ? allModules.find((m) => m.id === initialModuleId)
            : null;
          const effectiveLevelId = course?.level_id || targetModuleObj?.level || null;

          let courseModules = allModules
            .filter((m) => {
              if (initialModuleId && m.id === initialModuleId) return true;
              if (course?.id && m.course === course.id) return true;
              if (effectiveLevelId && m.level === effectiveLevelId && (!course?.id || !m.course)) return true;
              return false;
            })
            .sort((a, b) => (a.order || 0) - (b.order || 0));

          // In assessment-only mode, isolate view strictly to the selected module
          if (isAssessmentOnlyMode && initialModuleId) {
            courseModules = courseModules.filter((m) => m.id === initialModuleId);
          }

          const courseModuleIds = new Set(courseModules.map((m) => m.id));

          const courseSubmodules = allSubmodules
            .filter((s) => courseModuleIds.has(s.module))
            .sort((a, b) => (a.order || 0) - (b.order || 0));

          setModules(courseModules);
          setSubmodules(courseSubmodules);

          if (courseModules.length > 0) {
            const targetModId = initialModuleId && courseModuleIds.has(initialModuleId)
              ? initialModuleId
              : courseModules[0].id;
            setSelectedModuleId(targetModId);

            if (initialSubmoduleId) {
              const targetSub = courseSubmodules.find((s) => s.id === initialSubmoduleId);
              if (targetSub) {
                handleOpenSubmodule(targetSub);
              }
            }
          } else {
            setSelectedModuleId(null);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load course curriculum. Please try again.");
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [course, initialModuleId, initialSubmoduleId, isAssessmentOnlyMode]);

  // Fetch existing feedback and eligible trainers for the active module
  const loadModuleFeedback = useCallback(async (moduleId) => {
    if (isAdminPreview) {
      setFeedbackRecord(null);
      setEligibleTrainers([]);
      return;
    }
    if (!moduleId) {
      setFeedbackRecord(null);
      setEligibleTrainers([]);
      return;
    }

    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const [fbData, trData] = await Promise.all([
        apiClient(`/module-feedbacks/?module=${moduleId}`),
        apiClient("/trainer-assignments/"),
      ]);

      const fbList = Array.isArray(fbData) ? fbData : (fbData?.results || []);
      if (fbList.length > 0) {
        setFeedbackRecord(fbList[0]);
      } else {
        setFeedbackRecord(null);
      }

      const trList = Array.isArray(trData) ? trData : (trData?.results || []);
      // Deduplicate trainers by trainer id (since a trainer can be assigned to multiple cohorts)
      const uniqueTrainersMap = new Map();
      for (const t of trList) {
        if (t.trainer && !uniqueTrainersMap.has(t.trainer)) {
          uniqueTrainersMap.set(t.trainer, {
            id: t.trainer,
            name: t.trainer_name || t.trainer_username || `Trainer #${t.trainer}`,
            username: t.trainer_username,
            email: t.trainer_email,
            groupName: t.group_name,
          });
        }
      }
      const uniqueTrainers = Array.from(uniqueTrainersMap.values());
      setEligibleTrainers(uniqueTrainers);

      // If only one trainer is assigned, auto-select them
      if (uniqueTrainers.length === 1) {
        setSelectedTrainerId(String(uniqueTrainers[0].id));
      }
    } catch (err) {
      setFeedbackError(err.message || "Failed to load feedback details for this module.");
    } finally {
      setFeedbackLoading(false);
    }
  }, [isAdminPreview]);

  // Load questions, responses, and completion status whenever selectedModuleId changes
  const loadModuleQuestions = useCallback(async (moduleId) => {
    if (!moduleId) {
      setQuestions([]);
      setResponses([]);
      setCompletionStatus(null);
      return;
    }

    setQuestionsLoading(true);
    setQuestionsError(null);
    setSubmitError(null);

    // During Admin Preview: fetch ONLY general curriculum questions, skip all user-specific endpoints
    if (isAdminPreview) {
      try {
        const qData = await apiClient(`/module-questions/?module=${moduleId}&is_active=true`);
        const qList = Array.isArray(qData) ? qData : (qData?.results || []);
        setQuestions(qList.sort((a, b) => (a.order || 0) - (b.order || 0)));
        setResponses([]);
        setCompletionStatus(null);
        setRetakeEligibility(null);
        setFeedbackRecord(null);
        setEligibleTrainers([]);
      } catch (err) {
        setQuestionsError(err.message || "Failed to load questions for this module.");
      } finally {
        setQuestionsLoading(false);
      }
      return;
    }

    try {
      const [qData, rData, statusData, eligData] = await Promise.all([
        apiClient(`/module-questions/?module=${moduleId}&is_active=true`),
        apiClient(`/question-responses/?module=${moduleId}`),
        apiClient(`/question-responses/module-completion-status/?module=${moduleId}`),
        apiClient(`/question-responses/retake-eligibility/?module=${moduleId}`).catch(() => null),
      ]);

      const qList = Array.isArray(qData) ? qData : (qData?.results || []);
      const rList = Array.isArray(rData) ? rData : (rData?.results || []);

      setQuestions(qList.sort((a, b) => (a.order || 0) - (b.order || 0)));
      setResponses(rList);
      setCompletionStatus(statusData);
      setRetakeEligibility(eligData);

      // Also refresh feedback data
      await loadModuleFeedback(moduleId);
    } catch (err) {
      setQuestionsError(err.message || "Failed to load questions and completion status for this module.");
    } finally {
      setQuestionsLoading(false);
    }
  }, [loadModuleFeedback, isAdminPreview]);

  useEffect(() => {
    let isMounted = true;

    async function fetchQuestionsAndFeedback() {
      if (isMounted) {
        setFeedbackRecord(null);
        setFeedbackError(null);
        setFeedbackSuccessMsg(null);
        setFormValidationErrors({});
        setSelectedTrainerId("");
        setModuleRating(0);
        setTrainerRating(0);
        setUnderstandingLevel("ADVANCED");
        setFeedbackComments("");
      }
      if (!selectedModuleId) {
        if (isMounted) {
          setQuestions([]);
          setResponses([]);
          setCompletionStatus(null);
          setFeedbackRecord(null);
          setEligibleTrainers([]);
        }
        return;
      }
      if (isMounted) {
        setQuestionsLoading(true);
        setQuestionsError(null);
        setSubmitError(null);
        setFeedbackLoading(!isAdminPreview);
      }

      // During Admin Preview: Load questions ONLY, never query learner records
      if (isAdminPreview) {
        try {
          const qData = await apiClient(`/module-questions/?module=${selectedModuleId}&is_active=true`);
          if (isMounted) {
            const qList = Array.isArray(qData) ? qData : (qData?.results || []);
            setQuestions(qList.sort((a, b) => (a.order || 0) - (b.order || 0)));
            setResponses([]);
            setCompletionStatus(null);
            setRetakeEligibility(null);
            setFeedbackRecord(null);
            setEligibleTrainers([]);
          }
        } catch (err) {
          if (isMounted) {
            setQuestionsError(err.message || "Failed to load module questions.");
          }
        } finally {
          if (isMounted) {
            setQuestionsLoading(false);
            setFeedbackLoading(false);
          }
        }
        return;
      }

      try {
        const [qData, rData, statusData, fbData, trData, eligData] = await Promise.all([
          apiClient(`/module-questions/?module=${selectedModuleId}&is_active=true`),
          apiClient(`/question-responses/?module=${selectedModuleId}`),
          apiClient(`/question-responses/module-completion-status/?module=${selectedModuleId}`),
          apiClient(`/module-feedbacks/?module=${selectedModuleId}`),
          apiClient("/trainer-assignments/"),
          apiClient(`/question-responses/retake-eligibility/?module=${selectedModuleId}`).catch(() => null),
        ]);

        if (isMounted) {
          const qList = Array.isArray(qData) ? qData : (qData?.results || []);
          const rList = Array.isArray(rData) ? rData : (rData?.results || []);
          setQuestions(qList.sort((a, b) => (a.order || 0) - (b.order || 0)));
          setResponses(rList);
          setCompletionStatus(statusData);
          setRetakeEligibility(eligData);

          const fbList = Array.isArray(fbData) ? fbData : (fbData?.results || []);
          if (fbList.length > 0) {
            setFeedbackRecord(fbList[0]);
          } else {
            setFeedbackRecord(null);
          }

          const trList = Array.isArray(trData) ? trData : (trData?.results || []);
          const uniqueTrainersMap = new Map();
          for (const t of trList) {
            if (t.trainer && !uniqueTrainersMap.has(t.trainer)) {
              uniqueTrainersMap.set(t.trainer, {
                id: t.trainer,
                name: t.trainer_name || t.trainer_username || `Trainer #${t.trainer}`,
                username: t.trainer_username,
                email: t.trainer_email,
                groupName: t.group_name,
              });
            }
          }
          const uniqueTrainers = Array.from(uniqueTrainersMap.values());
          setEligibleTrainers(uniqueTrainers);
          if (uniqueTrainers.length === 1) {
            setSelectedTrainerId(String(uniqueTrainers[0].id));
          }
        }
      } catch (err) {
        if (isMounted) {
          setQuestionsError(err.message || "Failed to load module details.");
        }
      } finally {
        if (isMounted) {
          setQuestionsLoading(false);
          setFeedbackLoading(false);

          // Smooth scroll to assessment section if requested via hash or query param
          if (
            window.location.hash === "#assessment" ||
            window.location.hash === "#module-assessment-section" ||
            window.location.search.includes("target=assessment")
          ) {
            setTimeout(() => {
              const el = document.getElementById("module-assessment-section");
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }, 100);
          }
        }
      }
    }
    fetchQuestionsAndFeedback();
    return () => {
      isMounted = false;
    };
  }, [selectedModuleId, isAdminPreview]);

  // Fetch all attached materials across submodules for the selected module
  useEffect(() => {
    let isMounted = true;
    const activeSubms = submodules.filter((s) => s.module === selectedModuleId);
    if (!activeSubms.length) {
      setModuleMaterialsMap({});
      return;
    }

    setLoadingModuleMaterials(true);
    Promise.all(
      activeSubms.map(async (sub) => {
        try {
          const raw = await apiClient(`/submodules/${sub.id}/materials/`);
          const rawMaterials = Array.isArray(raw) ? raw : [];
          const safeMaterials = isAdminPreview
            ? rawMaterials
            : rawMaterials.filter((mat) => {
                if (mat.file_id === 12 || mat.file_id === 35) return false;
                if (mat.filename && mat.filename.includes("18. Assessment - Recruitment Process_ Multiple Choice")) return false;
                return true;
              });
          return { subId: sub.id, materials: safeMaterials };
        } catch {
          return { subId: sub.id, materials: [] };
        }
      })
    ).then((results) => {
      if (isMounted) {
        const mapping = {};
        results.forEach((r) => {
          mapping[r.subId] = r.materials;
        });
        setModuleMaterialsMap(mapping);
        setLoadingModuleMaterials(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedModuleId, submodules, isAdminPreview]);

  // Handle setting a pending selection for a question (selected option id)
  const handleSelectAnswer = (questionId, optionId) => {
    setPendingSelections((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
    setSubmitError(null);
  };

  // Submit all pending answers together for the assessment
  const handleSubmitAssessment = async () => {
    if (isAdminPreview) return;
    if (submittingAssessment) return;

    // Filter to active questions that need answers
    const unansweredQuestions = questions.filter((q) => {
      const existing = responseMap[q.id];
      if (existing) return false;
      return !pendingSelections[q.id];
    });

    if (unansweredQuestions.length > 0) {
      setSubmitError(
        `Please answer all questions before submitting. You have ${unansweredQuestions.length} unanswered question${unansweredQuestions.length > 1 ? "s" : ""}.`
      );
      // Smoothly scroll to the first unanswered question
      const firstUnanswered = unansweredQuestions[0];
      const el = document.getElementById(`question-card-${firstUnanswered.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    // Determine questions that have pending selections to submit
    const questionsToSubmit = questions.filter((q) => !responseMap[q.id] && pendingSelections[q.id]);
    if (questionsToSubmit.length === 0) {
      setSubmitError("All questions for this assessment have already been submitted.");
      return;
    }

    setSubmittingAssessment(true);
    setSubmitError(null);

    try {
      // Submit answers sequentially to guarantee predictable attempt scoring and completion
      for (const q of questionsToSubmit) {
        const selectedOptionId = pendingSelections[q.id];
        await apiClient("/question-responses/", {
          method: "POST",
          body: {
            question: q.id,
            selected_option_id: selectedOptionId,
          },
        });
      }

      // Clear pending selections upon successful submission of all questions
      setPendingSelections({});

      // Refresh responses and module completion status
      await loadModuleQuestions(selectedModuleId);

      // Scroll smoothly to score/result banner
      setTimeout(() => {
        const el = document.getElementById("module-assessment-section");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    } catch (err) {
      setSubmitError(err.message || "Failed to submit assessment answers. Please try again.");
    } finally {
      setSubmittingAssessment(false);
    }
  };

  // Submit response to POST /api/question-responses/
  const handleSubmitResponse = async (questionId) => {
    if (isAdminPreview) return;
    const selectedOptionId = pendingSelections[questionId];
    if (!selectedOptionId) {
      setSubmitError("Please select an answer option before submitting your response.");
      return;
    }

    setSubmittingQuestionId(questionId);
    setSubmitError(null);

    try {
      await apiClient("/question-responses/", {
        method: "POST",
        body: {
          question: questionId,
          selected_option_id: selectedOptionId,
        },
      });

      // Clear pending selection for this question
      setPendingSelections((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });

      // Refresh responses and module completion status
      await loadModuleQuestions(selectedModuleId);
    } catch (err) {
      setSubmitError(err.message || "Failed to submit response. Please try again.");
    } finally {
      setSubmittingQuestionId(null);
    }
  };

  // Open a submodule to view its learning content and record the view in the backend
  const handleOpenSubmodule = async (sub) => {
    setActiveViewingSubmodule(sub);
    setLessonMaterials([]);
    setLoadingMaterials(true);

    // Fetch attached training materials for this submodule
    apiClient(`/submodules/${sub.id}/materials/`)
      .then((data) => {
        const rawMaterials = Array.isArray(data) ? data : [];
        // Defense-in-depth: Never display assessment answer key documents (files 12, 35) to learners
        const safeMaterials = isAdminPreview
          ? rawMaterials
          : rawMaterials.filter((mat) => {
              if (mat.file_id === 12 || mat.file_id === 35) return false;
              if (mat.filename && mat.filename.includes("18. Assessment - Recruitment Process_ Multiple Choice")) return false;
              return true;
            });
        setLessonMaterials(safeMaterials);
      })
      .catch(() => {
        setLessonMaterials([]);
      })
      .finally(() => {
        setLoadingMaterials(false);
      });

    // In Admin Preview: Admin can freely read and view lessons, but DB tracking is completely bypassed
    if (isAdminPreview) {
      return;
    }
    // If the learner has completed an attempt and is preparing for a retake, record opening
    if (retakeEligibility?.current_attempt_completed) {
      setOpeningSubmoduleId(sub.id);
      try {
        await apiClient(`/submodules/${sub.id}/record-open/`, {
          method: "POST",
        });
        // Refresh eligibility so UI reflects opened state
        const eligData = await apiClient(`/question-responses/retake-eligibility/?module=${selectedModuleId}`).catch(() => null);
        if (eligData) {
          setRetakeEligibility(eligData);
        }
      } catch (err) {
        // Log/display non-blocking opening recording error if any
        console.error("Failed to record submodule open:", err);
      } finally {
        setOpeningSubmoduleId(null);
      }
    }
  };

  // Mark a submodule completed/reviewed for upcoming retake (requires opening first)
  const handleCompleteSubmodule = async (submoduleId) => {
    if (isAdminPreview) return;
    setCompletingSubmoduleId(submoduleId);
    setSubmitError(null);
    try {
      await apiClient(`/submodules/${submoduleId}/complete-for-retake/`, {
        method: "POST",
      });
      await loadModuleQuestions(selectedModuleId);
      // If modal for this submodule is open, update activeViewingSubmodule or keep open with confirmed badge
    } catch (err) {
      setSubmitError(err.message || "Failed to mark submodule as reviewed.");
    } finally {
      setCompletingSubmoduleId(null);
    }
  };

  // Start a new voluntary assessment attempt
  const handleStartRetake = async () => {
    if (isAdminPreview) return;
    if (!selectedModuleId) return;
    if (!window.confirm("Start a new assessment attempt? Your previous score and attempt history will be preserved.")) {
      return;
    }

    setRetakeLoading(true);
    setSubmitError(null);
    try {
      await apiClient("/question-responses/start-retake/", {
        method: "POST",
        body: { module: selectedModuleId },
      });
      setPendingSelections({});
      await loadModuleQuestions(selectedModuleId);
    } catch (err) {
      setSubmitError(err.message || "Failed to start a new assessment attempt.");
    } finally {
      setRetakeLoading(false);
    }
  };

  // Submit Feedback to POST /api/module-feedbacks/
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (isAdminPreview) return;
    setFormValidationErrors({});
    setFeedbackError(null);
    setFeedbackSuccessMsg(null);

    const errors = {};
    if (!selectedTrainerId) {
      errors.trainer = "Please select the instructor who taught this module.";
    }
    if (!moduleRating || moduleRating < 1 || moduleRating > 5) {
      errors.moduleRating = "Please provide a module usefulness rating between 1 and 5 stars.";
    }
    if (!trainerRating || trainerRating < 1 || trainerRating > 5) {
      errors.trainerRating = "Please provide an instructor teaching quality rating between 1 and 5 stars.";
    }
    if (!understandingLevel) {
      errors.understandingLevel = "Please select your level of understanding.";
    }
    const trimmedComments = feedbackComments.trim();
    if (!trimmedComments) {
      errors.comments = "Please provide constructive comments or feedback.";
    }

    if (Object.keys(errors).length > 0) {
      setFormValidationErrors(errors);
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const payload = {
        module: selectedModuleId,
        trainer: parseInt(selectedTrainerId, 10),
        module_rating: moduleRating,
        trainer_rating: trainerRating,
        understanding_level: understandingLevel,
        comments: trimmedComments,
      };

      const result = await apiClient("/module-feedbacks/", {
        method: "POST",
        body: payload,
      });

      setFeedbackRecord(result);
      setFeedbackSuccessMsg("Thank you! Your feedback and instructor rating have been successfully submitted.");
    } catch (err) {
      // Check if duplicate submission
      const msg = err.message || "Failed to submit feedback. Please try again.";
      setFeedbackError(msg);
      // If server reports already submitted, refresh feedback record
      if (msg.toLowerCase().includes("already submitted")) {
        loadModuleFeedback(selectedModuleId);
      }
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // Current active module object
  const activeModule = modules.find((m) => m.id === selectedModuleId);

  // Submodules belonging to the active module
  const activeSubmodules = activeModule
    ? submodules.filter((s) => s.module === activeModule.id)
    : [];

  // Map of question_id -> existing response object in the active attempt
  const activeAttemptId = completionStatus?.latest_attempt?.id;
  const responseMap = {};
  for (const r of responses) {
    if (r.question) {
      // If activeAttemptId exists, prefer response belonging to that attempt
      if (!activeAttemptId || r.attempt === activeAttemptId) {
        responseMap[r.question] = r;
      }
    }
  }

  return (
    <div>
      {/* Submodule Learning Content Full-Page View (Replacing cramped modal) */}
      {activeViewingSubmodule && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#f8fafc",
            zIndex: 1200,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          {/* Reader Top Sticky Header */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              backgroundColor: "#ffffff",
              borderBottom: "1px solid var(--border-color, #e2e8f0)",
              padding: "14px 24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveViewingSubmodule(null)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  padding: "6px 14px",
                }}
              >
                &larr; Back to Module Overview
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-secondary)", marginBottom: "2px" }}>
                  {course.name} &bull; {activeModule?.name} &bull; Lesson #{activeViewingSubmodule.order}
                </div>
                <h2 style={{ fontSize: "17px", fontWeight: "700", color: "var(--text-main)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeViewingSubmodule.name}
                </h2>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {(() => {
                const subStatus = retakeEligibility?.submodules?.find((s) => s.id === activeViewingSubmodule.id);
                const isReviewed = subStatus?.is_completed_for_retake;
                if (retakeEligibility?.current_attempt_completed) {
                  if (isReviewed) {
                    return (
                      <span className="badge badge-success" style={{ fontSize: "12px", padding: "5px 12px" }}>
                        &#10003; Reviewed for Attempt #{retakeEligibility.target_attempt_number}
                      </span>
                    );
                  }
                  return (
                    <span className="badge badge-warning" style={{ fontSize: "12px", padding: "4px 10px" }}>
                      Opened: Ready for Confirmation
                    </span>
                  );
                }
                return null;
              })()}

              {retakeEligibility?.current_attempt_completed && !retakeEligibility?.submodules?.find((s) => s.id === activeViewingSubmodule.id)?.is_completed_for_retake && !isAdminPreview && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={completingSubmoduleId === activeViewingSubmodule.id}
                  onClick={() => handleCompleteSubmodule(activeViewingSubmodule.id)}
                  style={{ fontSize: "13px", padding: "6px 16px" }}
                >
                  {completingSubmoduleId === activeViewingSubmodule.id ? "Confirming..." : `Mark as Reviewed (Attempt #${retakeEligibility.target_attempt_number})`}
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveViewingSubmodule(null)}
                style={{ padding: "6px 12px", fontSize: "14px" }}
                title="Close reading view"
              >
                &times; Close
              </button>
            </div>
          </div>

          {/* Reader Content Area (Spacious, light, comfortable reading background) */}
          <div
            style={{
              flex: 1,
              maxWidth: "960px",
              width: "100%",
              margin: "0 auto",
              padding: "36px 24px 64px",
            }}
          >
            {/* Lesson Title & Metadata Card */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #e2e8f0)",
                padding: "28px 32px",
                marginBottom: "24px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                <span className="badge badge-info" style={{ fontSize: "12px" }}>
                  Published Lesson
                </span>
                {activeViewingSubmodule.estimated_duration_minutes > 0 && (
                  <span className="badge badge-secondary" style={{ fontSize: "12px" }}>
                    Estimated Reading Time: ~{activeViewingSubmodule.estimated_duration_minutes} mins
                  </span>
                )}
              </div>

              <h1 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main, #0f172a)", margin: "0 0 16px 0", lineHeight: "1.3" }}>
                {activeViewingSubmodule.name}
              </h1>

              {/* Main Reading Text with Markdown */}
              <div
                style={{
                  fontSize: "16px",
                  lineHeight: "1.75",
                  color: "#1e293b",
                  marginTop: "20px",
                }}
              >
                <LessonContentRenderer
                  content={activeViewingSubmodule.description}
                  submoduleOrder={activeViewingSubmodule.order}
                />
              </div>
            </div>

            {/* Attached Learning Materials Section */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #e2e8f0)",
                padding: "24px 32px",
                marginBottom: "24px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-main, #0f172a)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📎 Attached Learning Materials</span>
                  <span className="badge badge-secondary" style={{ fontSize: "11px" }}>
                    {lessonMaterials.length}
                  </span>
                </h3>
              </div>

              {loadingMaterials ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)", padding: "12px 0" }}>
                  <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }}></div>
                  Loading attached training materials...
                </div>
              ) : lessonMaterials.length === 0 ? (
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", fontStyle: "italic" }}>
                  No supplementary training files attached directly to this lesson.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {lessonMaterials.map((mat) => {
                    const ext = (mat.filename?.split(".").pop() || "").toUpperCase();
                    const isPdf = mat.file_type === "PDF" || ext === "PDF";
                    const isDocx = ["DOCX", "DOC"].includes(mat.file_type || ext);
                    const isImage = ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(mat.file_type || ext);
                    const isMedia = ["MP4", "WEBM", "MP3", "WAV", "OGG"].includes(mat.file_type || ext);
                    const isText = ["TXT"].includes(mat.file_type || ext);
                    const isViewableInline = isPdf || isDocx || isImage || isMedia || isText;
                    const inlineUrl = (isPdf || isDocx)
                      ? `${mat.download_url}?inline=true#toolbar=0&navpanes=0&scrollbar=1`
                      : `${mat.download_url}?inline=true`;

                    return (
                      <div
                        key={mat.mapping_id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 16px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color, #e2e8f0)",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                          <span
                            className={`badge ${
                              isPdf
                                ? "badge-danger"
                                : ["DOCX", "DOC"].includes(ext)
                                ? "badge-primary"
                                : isImage
                                ? "badge-success"
                                : "badge-secondary"
                            }`}
                            style={{ fontSize: "11px", padding: "3px 8px" }}
                          >
                            {mat.file_type || ext}
                          </span>
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "var(--text-main, #0f172a)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={mat.filename}
                          >
                            {mat.filename}
                          </span>
                          {mat.notes && (
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                              &bull; {mat.notes}
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {isViewableInline ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() =>
                                window.open(
                                  `/viewer?url=${encodeURIComponent(
                                    mat.download_url
                                  )}&title=${encodeURIComponent(mat.filename)}`,
                                  "_blank"
                                )
                              }
                              style={{
                                padding: "5px 12px",
                                fontSize: "12px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span>👁 Open in New Tab</span>
                            </button>
                          ) : (
                            <span
                              className="badge badge-secondary"
                              style={{ fontSize: "11px", padding: "4px 8px", fontStyle: "italic" }}
                              title="This file format cannot currently be previewed"
                            >
                              Preview unavailable for this format
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Navigation & Retake Confirmation Bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                paddingTop: "12px",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveViewingSubmodule(null)}
                style={{ padding: "8px 18px", fontSize: "13px" }}
              >
                &larr; Return to Module Overview
              </button>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {retakeEligibility?.current_attempt_completed && !retakeEligibility?.submodules?.find((s) => s.id === activeViewingSubmodule.id)?.is_completed_for_retake && !isAdminPreview && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={completingSubmoduleId === activeViewingSubmodule.id}
                    onClick={() => handleCompleteSubmodule(activeViewingSubmodule.id)}
                    style={{ fontSize: "13px", padding: "8px 20px" }}
                  >
                    {completingSubmoduleId === activeViewingSubmodule.id ? "Confirming..." : `Mark as Reviewed (Attempt #${retakeEligibility.target_attempt_number})`}
                  </button>
                )}
                {isAdminPreview && (
                  <span className="badge badge-info" style={{ fontSize: "12px", padding: "6px 12px" }}>
                    Preview Mode • Review Tracking Disabled
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Preview Header Alert */}
      {isAdminPreview && (
        <div
          className="admin-preview-banner"
          style={{
            marginBottom: "20px",
            borderRadius: "var(--radius-sm, 6px)",
            padding: "12px 20px",
          }}
          role="status"
        >
          <div className="admin-preview-content">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <div className="admin-preview-text">
              <strong>Learner Preview – Read Only</strong>
              <span className="admin-preview-subtext">
                Exploring curriculum structure and learning materials in read-only mode. Personal assessment answers, retakes, and evaluations are isolated.
              </span>
            </div>
          </div>
          <span className="badge badge-info" style={{ whiteSpace: "nowrap" }}>
            Write Actions Disabled
          </span>
        </div>
      )}

      {/* Top Breadcrumb & Actions Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", fontSize: "13px" }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {isAssessmentOnlyMode ? "Exit Assessment" : "Back to All Courses"}
        </button>

        {!isAssessmentOnlyMode && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadCourseContent}
            disabled={loading}
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            Refresh Content
          </button>
        )}
      </div>

      {/* Course Banner Card */}
      <div className="card" style={{ marginBottom: "24px", padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
          <span className="badge badge-info" style={{ fontFamily: "var(--font-mono)" }}>
            {course.code || (course.id ? `CRS-${course.id}` : "CURRICULUM")}
          </span>
          {course.status && (
            <span className="badge badge-success">
              {course.status}
            </span>
          )}
        </div>
        <h2 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text-main)", margin: "0 0 8px 0" }}>
          {course.title || course.name}
        </h2>
        {course.description && (
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.6", margin: 0 }}>
            {course.description}
          </p>
        )}
      </div>

      {/* Main Content Layout: Sidebar Modules + Active Module Panel */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
            Loading course modules...
          </p>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--status-error)" }}>
          <p style={{ color: "var(--status-error)", fontSize: "14px", margin: "0 0 16px 0" }}>
            {error}
          </p>
          <button type="button" className="btn btn-primary" onClick={loadCourseContent}>
            Retry Loading
          </button>
        </div>
      ) : modules.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
            No Modules Configured
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
            When course instructors publish curriculum modules, they will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: isAssessmentOnlyMode ? "block" : "grid", gridTemplateColumns: isAssessmentOnlyMode ? "1fr" : "280px 1fr", gap: "24px", alignItems: "start" }}>
          {/* Modules Sidebar - hidden completely in assessment mode */}
          {!isAssessmentOnlyMode && (
            <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <h4 style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", margin: "4px 8px 8px 8px" }}>
                Course Modules ({modules.length})
              </h4>
              {modules.map((mod) => {
                const modSubCount = submodules.filter((s) => s.module === mod.id).length;
                const isSelected = selectedModuleId === mod.id;

                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedModuleId(mod.id)}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: isSelected
                        ? "1px solid var(--accent-primary)"
                        : "1px solid var(--border-color)",
                      backgroundColor: isSelected
                        ? "var(--bg-active, rgba(59, 130, 246, 0.08))"
                        : "var(--bg-card)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--accent-secondary)" }}>
                        Module #{mod.order || mod.id}
                      </span>
                      {mod.estimated_duration_minutes > 0 && (
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          {mod.estimated_duration_minutes}m
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", margin: "4px 0" }}>
                      {mod.name}
                    </div>
                    {mod.level_name && (
                      <div style={{ fontSize: "11px", color: "var(--accent-secondary)", fontWeight: "500" }}>
                        {mod.level_name}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Module Detail & Questions Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {activeModule && (
              <>
                {/* Active Module Header Card */}
                <div className="card" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-secondary)" }}>
                        Module #{activeModule.order || activeModule.id}
                      </span>
                      <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: "4px 0 6px 0" }}>
                        {activeModule.name}
                      </h3>
                    </div>
                    {activeModule.estimated_duration_minutes > 0 && (
                      <span className="badge badge-info">
                        Est. {activeModule.estimated_duration_minutes} mins
                      </span>
                    )}
                  </div>
                  {activeModule.description && (
                    <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.5", margin: "8px 0 0 0" }}>
                      {activeModule.description}
                    </p>
                  )}
                </div>
                {/* In Assessment Mode, only show the Assessment interface directly without tab switcher */}
                {!isAssessmentOnlyMode && (
                  <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab("materials")}
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor: activeTab === "materials" ? "var(--color-primary, #2563eb)" : "transparent",
                        color: activeTab === "materials" ? "#ffffff" : "var(--text-secondary)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      📖 Learning Content &amp; Lessons ({activeSubmodules.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("assessment")}
                      style={{
                        padding: "8px 16px",
                        fontSize: "13px",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor: activeTab === "assessment" ? "var(--color-primary, #2563eb)" : "transparent",
                        color: activeTab === "assessment" ? "#ffffff" : "var(--text-secondary)",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>📝 Module Assessment ({questions.length} Questions)</span>
                      {completionStatus?.is_tested_module && completionStatus?.has_passed && (
                        <span className="badge badge-success" style={{ fontSize: "10px", padding: "1px 6px" }}>PASS</span>
                      )}
                      {completionStatus?.is_tested_module && completionStatus?.result === "FAIL" && (
                        <span className="badge badge-error" style={{ fontSize: "10px", padding: "1px 6px" }}>FAIL</span>
                      )}
                    </button>
                  </div>
                )}

                {/* Direct Module Instructional Content & Lessons (shown when activeTab === "materials" and NOT in assessment mode) */}
                {!isAssessmentOnlyMode && activeTab === "materials" && activeSubmodules.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {retakeEligibility?.current_attempt_completed && (
                      <div
                        className="alert alert-info"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "12px",
                          padding: "10px 14px",
                        }}
                      >
                        <span>
                          Retake Preparation &bull; <strong>Attempt #{retakeEligibility.target_attempt_number}</strong>:
                          Please review each lesson section below and confirm by clicking <em>&quot;Confirm Lesson Review&quot;</em>.
                        </span>
                        <span>
                          <strong>{retakeEligibility.completed_submodules_count} of {retakeEligibility.total_submodules}</strong> completed
                        </span>
                      </div>
                    )}

                    {activeSubmodules.map((sub, idx) => {
                      const subStatus = retakeEligibility?.submodules?.find((s) => s.id === sub.id);
                      const isReviewed = subStatus?.is_completed_for_retake;
                      const subMaterials = moduleMaterialsMap[sub.id] || [];

                      return (
                        <div
                          key={sub.id}
                          className="card"
                          style={{
                            padding: "24px 28px",
                            border: isReviewed
                              ? "1px solid var(--accent-teal, #0d9488)"
                              : "1px solid var(--border-color)",
                            backgroundColor: "#ffffff",
                          }}
                        >
                          {/* Lesson Header */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                              gap: "10px",
                              marginBottom: "14px",
                              borderBottom: "1px solid var(--border-color, #e2e8f0)",
                              paddingBottom: "12px",
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                <span className="badge badge-purple" style={{ fontSize: "11px" }}>
                                  Lesson {idx + 1} of {activeSubmodules.length}
                                </span>
                                {sub.estimated_duration_minutes > 0 && (
                                  <span className="badge badge-info" style={{ fontSize: "11px" }}>
                                    ~{sub.estimated_duration_minutes} min read
                                  </span>
                                )}
                                {isReviewed && (
                                  <span className="badge badge-success" style={{ fontSize: "11px" }}>
                                    &#10003; Reviewed for Attempt #{retakeEligibility?.target_attempt_number}
                                  </span>
                                )}
                              </div>
                              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "var(--text-main)" }}>
                                {sub.name}
                              </h3>
                            </div>

                            {/* Retake Review Confirmation Button */}
                            {retakeEligibility?.current_attempt_completed && !isAdminPreview && (
                              <div>
                                {isReviewed ? (
                                  <span className="badge badge-success" style={{ fontSize: "11px", padding: "4px 8px" }}>
                                    &#10003; Review Confirmed
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={completingSubmoduleId === sub.id}
                                    onClick={async () => {
                                      try {
                                        await apiClient(`/submodules/${sub.id}/record-open/`, { method: "POST" }).catch(() => null);
                                        await handleCompleteSubmodule(sub.id);
                                      } catch (err) {
                                        setSubmitError(err.message || "Failed to confirm lesson review.");
                                      }
                                    }}
                                    style={{ fontSize: "11px", padding: "5px 12px" }}
                                  >
                                    {completingSubmoduleId === sub.id ? "Confirming..." : `Confirm Lesson Review (Attempt #${retakeEligibility.target_attempt_number})`}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Lesson Instructional Content */}
                          {sub.description ? (
                            <div style={{ fontSize: "15px", lineHeight: "1.7", color: "#1e293b", marginBottom: "16px" }}>
                              <LessonContentRenderer
                                content={sub.description}
                                submoduleOrder={sub.order || idx + 1}
                              />
                            </div>
                          ) : (
                            <p style={{ color: "var(--text-secondary)", fontSize: "13px", fontStyle: "italic", margin: "8px 0" }}>
                              No detailed notes for this section.
                            </p>
                          )}

                          {/* Attached Materials for this lesson */}
                          {subMaterials.length > 0 && (
                            <div
                              style={{
                                marginTop: "16px",
                                paddingTop: "14px",
                                borderTop: "1px dashed var(--border-color, #e2e8f0)",
                              }}
                            >
                              <div style={{ fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                                Attached Reference Materials ({subMaterials.length})
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {subMaterials.map((mat) => {
                                  const ext = (mat.filename?.split(".").pop() || "").toUpperCase();
                                  const isDocOrPdf = ["PDF", "DOCX", "DOC"].includes(mat.file_type || ext);
                                  const inlineUrl = isDocOrPdf
                                    ? `${mat.download_url}?inline=true#toolbar=0&navpanes=0&scrollbar=1`
                                    : `${mat.download_url}?inline=true`;
                                  return (
                                    <div
                                      key={mat.mapping_id}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "8px 12px",
                                        backgroundColor: "var(--bg-secondary, #f8fafc)",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color, #e2e8f0)",
                                        fontSize: "13px",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                                        <span className="badge badge-info" style={{ fontSize: "10px" }}>{mat.file_type || ext}</span>
                                        <span style={{ fontWeight: "500", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {mat.filename}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() =>
                                          window.open(
                                            `/viewer?url=${encodeURIComponent(
                                              mat.download_url
                                            )}&title=${encodeURIComponent(mat.filename)}`,
                                            "_blank"
                                          )
                                        }
                                        style={{ fontSize: "11px", padding: "3px 10px", whiteSpace: "nowrap" }}
                                      >
                                        👁 Open Document
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Section: Module Assessment & Retakes */}
                <div id="module-assessment-section" style={{ marginTop: "12px", scrollMarginTop: "80px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", margin: 0 }}>
                        Module Assessment ({questions.length} {questions.length === 1 ? "Question" : "Questions"})
                      </h3>
                      {completionStatus?.latest_attempt && (
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          Current Attempt: <strong>Attempt #{completionStatus.latest_attempt.attempt_number}</strong>
                        </span>
                      )}
                    </div>

                    {/* Completion Status Badge & Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      {isAdminPreview ? (
                        <span className="badge badge-info" style={{ fontSize: "12px", padding: "4px 10px" }}>
                          Preview Mode • Assessment Submissions Disabled
                        </span>
                      ) : completionStatus ? (
                        <div>
                          {completionStatus.is_tested_module ? (
                            completionStatus.has_passed ? (
                              <span className="badge badge-success" style={{ fontSize: "12px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontWeight: "700" }}>PASS</span> • &#10003; Module Completed ({completionStatus.marks_obtained} / {completionStatus.total_marks || 5} Marks)
                              </span>
                            ) : completionStatus.result === "FAIL" ? (
                              <span className="badge badge-error" style={{ fontSize: "12px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontWeight: "700" }}>FAIL</span> • Not Completed / In Progress ({completionStatus.marks_obtained} / {completionStatus.total_marks || 5} Marks - Passing is {completionStatus.minimum_passing_score || Math.ceil((completionStatus.total_marks || 5) * 0.5)}/{completionStatus.total_marks || 5})
                              </span>
                            ) : (
                              <span className="badge badge-warning" style={{ fontSize: "12px", padding: "4px 10px" }}>
                                Assessment In Progress ({completionStatus.answered_required_questions} of {completionStatus.total_required_questions} Answered)
                              </span>
                            )
                          ) : completionStatus.is_module_completed ? (
                            <span className="badge badge-success" style={{ fontSize: "12px", padding: "4px 10px" }}>
                              &#10003; Module Completed ({completionStatus.answered_required_questions} of {completionStatus.total_required_questions} Answered)
                            </span>
                          ) : completionStatus.total_required_questions > 0 ? (
                            <span className="badge badge-warning" style={{ fontSize: "12px", padding: "4px 10px" }}>
                              Pending Completion ({completionStatus.answered_required_questions} of {completionStatus.total_required_questions} Answered)
                            </span>
                          ) : (
                            <span className="badge badge-info" style={{ fontSize: "12px", padding: "4px 10px" }}>
                              No Required Questions Configured
                            </span>
                          )}
                        </div>
                      ) : null}

                      {/* Retake Button (Controlled by Retake Eligibility & Pass lock - disabled during Admin Preview) */}
                      {!isAdminPreview && completionStatus?.latest_attempt && questions.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleStartRetake}
                          disabled={retakeLoading || (completionStatus?.is_tested_module ? !completionStatus?.can_retake : !retakeEligibility?.can_retake)}
                          style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            opacity: (completionStatus?.is_tested_module ? completionStatus?.can_retake : retakeEligibility?.can_retake) ? 1 : 0.6,
                            cursor: (completionStatus?.is_tested_module ? completionStatus?.can_retake : retakeEligibility?.can_retake) ? "pointer" : "not-allowed",
                          }}
                          title={
                            completionStatus?.is_tested_module && completionStatus?.has_passed
                              ? "You have already passed this assessment. Retakes are locked."
                              : (completionStatus?.is_tested_module ? completionStatus?.can_retake : retakeEligibility?.can_retake)
                              ? "Start a new assessment attempt to improve your score."
                              : (retakeEligibility?.blocking_reasons || []).join(" ") || "Retake not available."
                          }
                        >
                          {retakeLoading ? (
                            <>
                              <div className="spinner" style={{ width: "10px", height: "10px", borderWidth: "2px" }}></div>
                              Starting...
                            </>
                          ) : (
                            <>&#8635; Retake Assessment</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Attempt Score Card & History Banner */}
                  {completionStatus?.latest_attempt && (
                    <div
                      className="card"
                      style={{
                        marginBottom: "16px",
                        padding: "14px 18px",
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                          <div style={{ fontSize: "20px", fontWeight: "700", color: completionStatus.is_tested_module ? (completionStatus.has_passed ? "var(--status-success)" : "var(--status-error)") : "var(--color-primary, #2563eb)" }}>
                            {completionStatus.latest_attempt.score} / {completionStatus.latest_attempt.total_possible}
                          </div>
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                              <span>Attempt #{completionStatus.latest_attempt.attempt_number} Score ({completionStatus.latest_attempt.percentage}%)</span>
                              {completionStatus.is_tested_module && completionStatus.latest_attempt.is_completed && (
                                <span className={`badge ${completionStatus.latest_attempt.score >= (completionStatus.minimum_passing_score || Math.ceil((completionStatus.latest_attempt.total_possible || 5) * 0.5)) ? "badge-success" : "badge-error"}`} style={{ fontSize: "10px", padding: "1px 6px" }}>
                                  {completionStatus.latest_attempt.score >= (completionStatus.minimum_passing_score || Math.ceil((completionStatus.latest_attempt.total_possible || 5) * 0.5)) ? "PASS" : "FAIL"}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                              {(() => {
                                const totPoss = completionStatus.latest_attempt.total_possible || completionStatus.total_marks || 5;
                                const minPass = completionStatus.minimum_passing_score || Math.ceil(totPoss * 0.5);
                                const passPct = Math.round((minPass / totPoss) * 100);
                                return `Status: ${completionStatus.latest_attempt.is_completed ? "Completed" : "In Progress"} • Passing requirement: ${minPass} / ${totPoss} (${passPct}%)`;
                              })()}
                            </div>
                          </div>
                        </div>

                        {completionStatus.attempts && completionStatus.attempts.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowAttemptHistory((prev) => !prev)}
                            style={{ fontSize: "11px", padding: "4px 10px" }}
                          >
                            {showAttemptHistory ? "Hide Attempt History ▲" : `View Attempt History (${completionStatus.attempts.length}) ▼`}
                          </button>
                        )}
                      </div>

                      {/* Expandable Attempt History Table */}
                      {showAttemptHistory && completionStatus.attempts && (
                        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
                          <table className="data-table" style={{ fontSize: "12px", width: "100%" }}>
                            <thead>
                              <tr>
                                <th>Attempt</th>
                                <th>Date</th>
                                <th>Score</th>
                                <th>Percentage</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {completionStatus.attempts.map((att) => (
                                <tr
                                  key={att.id}
                                  style={{
                                    backgroundColor: att.id === completionStatus.latest_attempt.id ? "rgba(37, 99, 235, 0.05)" : "transparent",
                                    fontWeight: att.id === completionStatus.latest_attempt.id ? "600" : "normal",
                                  }}
                                >
                                  <td>
                                    Attempt #{att.attempt_number}
                                    {att.id === completionStatus.latest_attempt.id && (
                                      <span className="badge badge-primary" style={{ marginLeft: "6px", fontSize: "10px" }}>Current</span>
                                    )}
                                  </td>
                                  <td>{new Date(att.started_at).toLocaleString()}</td>
                                  <td>{att.score} / {att.total_possible}</td>
                                  <td>{att.percentage}%</td>
                                  <td>
                                    {att.is_completed ? (
                                      <span className="badge badge-success" style={{ fontSize: "10px" }}>Completed</span>
                                    ) : (
                                      <span className="badge badge-warning" style={{ fontSize: "10px" }}>In Progress</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Submission Error Banner */}
                  {submitError && (
                    <div className="alert alert-error" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{submitError}</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setSubmitError(null)}
                        style={{ padding: "2px 8px", fontSize: "11px" }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Questions Loading State */}
                  {questionsLoading ? (
                    <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
                      <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
                      <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
                        Loading questions and verification status...
                      </p>
                    </div>
                  ) : questionsError ? (
                    <div className="card" style={{ padding: "20px", borderLeft: "4px solid var(--status-error)" }}>
                      <p style={{ color: "var(--status-error)", fontSize: "13px", margin: "0 0 12px 0" }}>
                        {questionsError}
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => loadModuleQuestions(selectedModuleId)}
                        style={{ padding: "6px 14px", fontSize: "12px" }}
                      >
                        Retry Questions
                      </button>
                    </div>
                  ) : questions.length === 0 ? (
                    /* Empty Questions State */
                    <div
                      className="card"
                      style={{
                        textAlign: "center",
                        padding: "36px 20px",
                        border: "1px dashed var(--border-color)",
                      }}
                    >
                      <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
                        No questions are configured for this module.
                      </p>
                      <p style={{ color: "var(--text-muted)", fontSize: "12px", margin: "6px 0 0 0" }}>
                        Modules require active confirmation questions to record module completion.
                      </p>
                    </div>
                  ) : (
                    /* Question List */
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {questions.map((q) => {
                        const existingResponse = responseMap[q.id];
                        const isAnswered = Boolean(existingResponse);
                        const isSubmitting = submittingQuestionId === q.id;
                        const currentSelection = pendingSelections[q.id];

                        return (
                          <div
                            key={q.id}
                            id={`question-card-${q.id}`}
                            className="card"
                            style={{
                              padding: "20px",
                              border: "1px solid var(--border-color)",
                            }}
                          >
                            {/* Question Header */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                                  Question {q.order || (questions.indexOf(q) + 1)} of {questions.length}
                                </span>
                                <span className="badge badge-warning" style={{ fontSize: "10px" }}>
                                  Mandatory Assessment
                                </span>
                              </div>

                              {/* Answer Status Badge if answered */}
                              {isAnswered && (
                                <span
                                  className="badge badge-success"
                                  style={{ fontSize: "12px", fontWeight: "600" }}
                                >
                                  Answered: Yes
                                </span>
                              )}
                            </div>

                            {/* Question Text */}
                            <p style={{ fontSize: "15px", fontWeight: "500", color: "var(--text-main)", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                              {q.question_text}
                            </p>

                            {/* Answer Section */}
                            {isAnswered ? (
                              /* Read-only Answered State */
                              <div
                                style={{
                                  backgroundColor: "var(--bg-surface)",
                                  borderRadius: "var(--radius-sm)",
                                  padding: "14px 16px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                  fontSize: "13px",
                                  color: "var(--text-secondary)",
                                  border: "1px solid var(--border-color)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                                  <div>
                                    Your response: <strong style={{ color: "var(--text-main)" }}>
                                      {existingResponse.selected_option_text || (existingResponse.response_value ? "Yes" : "No")}
                                    </strong>
                                    {existingResponse.is_correct !== undefined && existingResponse.is_correct !== null && (
                                      <span
                                        className={`badge ${existingResponse.is_correct ? "badge-success" : "badge-error"}`}
                                        style={{ marginLeft: "8px", fontSize: "11px" }}
                                      >
                                        {existingResponse.is_correct ? "Correct (+1 mark)" : "Incorrect (0 marks)"}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                    Submitted: {new Date(existingResponse.submitted_at).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Interactive Single-Answer Options Form */
                              <div
                                style={{
                                  backgroundColor: "var(--bg-surface)",
                                  borderRadius: "var(--radius-sm)",
                                  padding: "16px",
                                  border: "1px solid var(--border-color)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "14px",
                                }}
                              >
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                                  Select one answer:
                                </div>

                                {/* Render Options (Yes/No or Multiple Choice) */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                  {Array.isArray(q.options) && q.options.length > 0 ? (
                                    q.options.map((opt, optIdx) => {
                                      const isSelected = currentSelection === opt.id;
                                      return (
                                        <label
                                          key={opt.id || optIdx}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px",
                                            padding: "10px 14px",
                                            borderRadius: "var(--radius-sm)",
                                            border: isSelected ? "2px solid var(--color-primary, #2563eb)" : "1px solid var(--border-color)",
                                            backgroundColor: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                                            cursor: submittingAssessment ? "not-allowed" : "pointer",
                                            transition: "all 0.15s ease",
                                          }}
                                        >
                                          <input
                                            type="radio"
                                            name={`q-option-${q.id}`}
                                            value={opt.id}
                                            checked={isSelected}
                                            onChange={() => handleSelectAnswer(q.id, opt.id)}
                                            disabled={submittingAssessment}
                                            style={{ cursor: "pointer", width: "16px", height: "16px" }}
                                          />
                                          <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-secondary)", minWidth: "18px" }}>
                                            {String.fromCharCode(65 + optIdx)}.
                                          </span>
                                          <span style={{ fontSize: "13px", color: isSelected ? "var(--text-main)" : "var(--text-secondary)", fontWeight: isSelected ? "600" : "normal" }}>
                                            {opt.text}
                                          </span>
                                        </label>
                                      );
                                    })
                                  ) : (
                                    /* Fallback to Yes / No buttons if options array is empty */
                                    <div style={{ display: "flex", gap: "12px" }}>
                                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: submittingAssessment ? "not-allowed" : "pointer" }}>
                                        <input
                                          type="radio"
                                          name={`q-option-${q.id}`}
                                          value="yes"
                                          checked={currentSelection === "yes"}
                                          onChange={() => handleSelectAnswer(q.id, "yes")}
                                          disabled={submittingAssessment}
                                        />
                                        <span>Yes</span>
                                      </label>
                                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: submittingAssessment ? "not-allowed" : "pointer" }}>
                                        <input
                                          type="radio"
                                          name={`q-option-${q.id}`}
                                          value="no"
                                          checked={currentSelection === "no"}
                                          onChange={() => handleSelectAnswer(q.id, "no")}
                                          disabled={submittingAssessment}
                                        />
                                        <span>No</span>
                                      </label>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Single Final Submit Assessment Button at the end of all questions */}
                      {questions.some((q) => !responseMap[q.id]) && (
                        <div
                          className="card"
                          style={{
                            padding: "20px 24px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "14px",
                            backgroundColor: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
                              Ready to submit your assessment?
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                              {Object.keys(pendingSelections).length} of {questions.filter((q) => !responseMap[q.id]).length} remaining question(s) answered
                            </div>
                          </div>

                          {isAdminPreview ? (
                            <span className="badge badge-info" style={{ fontSize: "12px", padding: "8px 16px" }}>
                              Preview Mode • Assessment Submission Disabled
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={handleSubmitAssessment}
                              disabled={submittingAssessment}
                              style={{
                                padding: "10px 28px",
                                fontSize: "14px",
                                fontWeight: "600",
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                minWidth: "180px",
                                justifyContent: "center",
                              }}
                            >
                              {submittingAssessment ? (
                                <>
                                  <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }}></div>
                                  Submitting Assessment...
                                </>
                              ) : (
                                "Submit Assessment"
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section: Module Feedback & Trainer Rating (Stage 1) */}
                <div id="module-feedback-section" style={{ marginTop: "16px", scrollMarginTop: "80px" }}>
                  {/* Feedback Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-main)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>Module Feedback & Instructor Rating</span>
                      {feedbackRecord && (
                        <span className="badge badge-success" style={{ fontSize: "11px", padding: "2px 8px" }}>
                          &#10003; Feedback Submitted
                        </span>
                      )}
                    </h3>
                  </div>

                  {/* Feedback Loading State */}
                  {feedbackLoading ? (
                    <div className="card" style={{ padding: "24px", textAlign: "center" }}>
                      <div className="spinner" style={{ width: "20px", height: "20px", margin: "0 auto 8px" }}></div>
                      <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: 0 }}>
                        Checking feedback status...
                      </p>
                    </div>
                  ) : isAdminPreview ? (
                    /* Admin Preview State: Educational Placeholder Card */
                    <div className="card" style={{ padding: "24px", border: "1px dashed var(--border-color)", backgroundColor: "var(--bg-card)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </div>
                        <div>
                          <h4 style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                            Module Evaluation & Instructor Rating (Preview Mode)
                          </h4>
                          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 10px 0", lineHeight: "1.5" }}>
                            Once a learner successfully fulfills all mandatory assessment questions in a module, they can evaluate module usefulness, rate their instructor, assess their understanding level, and leave constructive feedback.
                          </p>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <span className="badge badge-info" style={{ fontSize: "11px" }}>Sample Layout</span>
                            <span className="badge badge-secondary" style={{ fontSize: "11px" }}>Not available in preview</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : feedbackRecord ? (
                    /* Case A: Existing Feedback Submitted (Read-Only Summary) */
                    <div className="card" style={{ padding: "24px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-card)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                            <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-main)" }}>
                              Your Evaluation for {feedbackRecord.module_name || activeModule.name}
                            </span>
                            <span className="badge badge-success" style={{ fontSize: "11px" }}>
                              Recorded
                            </span>
                          </div>
                          <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                            Submitted on {new Date(feedbackRecord.submitted_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} at {new Date(feedbackRecord.submitted_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>

                      {feedbackSuccessMsg && (
                        <div style={{ padding: "10px 14px", borderRadius: "var(--radius-sm)", backgroundColor: "rgba(34, 197, 94, 0.12)", border: "1px solid var(--status-success)", color: "var(--status-success)", fontSize: "13px", marginBottom: "16px" }}>
                          {feedbackSuccessMsg}
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                        {/* Instructor Card */}
                        <div style={{ padding: "14px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: "600", display: "block", marginBottom: "4px" }}>
                            Assigned Instructor
                          </span>
                          <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
                            {feedbackRecord.trainer_name || feedbackRecord.trainer_username || `Trainer #${feedbackRecord.trainer}`}
                          </span>
                        </div>

                        {/* Module Usefulness Rating */}
                        <div style={{ padding: "14px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: "600", display: "block", marginBottom: "4px" }}>
                            Module Usefulness
                          </span>
                          <StarRating value={feedbackRecord.module_rating} disabled={true} size={18} />
                        </div>

                        {/* Trainer Teaching Quality */}
                        <div style={{ padding: "14px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: "600", display: "block", marginBottom: "4px" }}>
                            Instructor Teaching Quality
                          </span>
                          <StarRating value={feedbackRecord.trainer_rating} disabled={true} size={18} />
                        </div>

                        {/* Understanding Level */}
                        <div style={{ padding: "14px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: "600", display: "block", marginBottom: "4px" }}>
                            Understanding Level
                          </span>
                          <span className={`badge ${
                            feedbackRecord.understanding_level === "ADVANCED"
                              ? "badge-success"
                              : feedbackRecord.understanding_level === "GOOD"
                              ? "badge-info"
                              : "badge-warning"
                          }`} style={{ fontSize: "12px", padding: "4px 10px" }}>
                            {feedbackRecord.understanding_level === "ADVANCED"
                              ? "Understood clearly"
                              : feedbackRecord.understanding_level === "GOOD"
                              ? "Understood with some questions"
                              : "Needs additional guidance"}
                          </span>
                        </div>
                      </div>

                      {/* Comments */}
                      <div style={{ padding: "14px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                        <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                          Written Feedback
                        </span>
                        <p style={{ fontSize: "13px", color: "var(--text-main)", lineHeight: "1.6", margin: 0, fontStyle: "italic" }}>
                          &ldquo;{feedbackRecord.comments}&rdquo;
                        </p>
                      </div>
                    </div>
                  ) : !completionStatus?.is_module_completed ? (
                    /* Case B: Module Not Yet Completed */
                    <div className="card" style={{ padding: "20px", backgroundColor: "var(--bg-card)", border: "1px dashed var(--border-color)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <div>
                          <h4 style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                            Feedback Locked Until Module Completion
                          </h4>
                          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0, lineHeight: "1.4" }}>
                            {completionStatus?.total_required_questions > 0
                              ? `Please answer all ${completionStatus.total_required_questions} required module questions above to unlock the module evaluation and instructor rating form.`
                              : "This module has no required questions configured. Module feedback is available only for completed modules."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : eligibleTrainers.length === 0 ? (
                    /* Case C: Module Completed but No Assigned Trainers */
                    <div className="card" style={{ padding: "20px", borderLeft: "4px solid var(--status-warning)" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: "600", color: "var(--status-warning)", margin: "0 0 4px 0" }}>
                        Instructor Assignment Required
                      </h4>
                      <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                        No active trainer is currently assigned to your cohort. Once an administrator assigns an instructor to your group, you can rate your training experience here.
                      </p>
                    </div>
                  ) : (
                    /* Case D: Module Completed & Unsubmitted -> Interactive Feedback Form */
                    <div className="card" style={{ padding: "24px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-card)" }}>
                      <div style={{ marginBottom: "18px" }}>
                        <h4 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-main)", margin: "0 0 4px 0" }}>
                          Rate Module & Instructor
                        </h4>
                        <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                          Help improve your learning curriculum by providing constructive feedback for this completed module.
                        </p>
                      </div>

                      {feedbackError && (
                        <div style={{ padding: "10px 14px", borderRadius: "var(--radius-sm)", backgroundColor: "rgba(239, 68, 68, 0.12)", border: "1px solid var(--status-error)", color: "var(--status-error)", fontSize: "13px", marginBottom: "18px" }}>
                          {feedbackError}
                        </div>
                      )}

                      <form onSubmit={handleFeedbackSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                        {/* 1. Trainer Selection */}
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text-main)", marginBottom: "6px" }}>
                            Assigned Instructor <span style={{ color: "var(--status-error)" }}>*</span>
                          </label>
                          <select
                            value={selectedTrainerId}
                            onChange={(e) => {
                              setSelectedTrainerId(e.target.value);
                              if (formValidationErrors.trainer) {
                                setFormValidationErrors((prev) => ({ ...prev, trainer: null }));
                              }
                            }}
                            disabled={feedbackSubmitting}
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: formValidationErrors.trainer ? "1px solid var(--status-error)" : "1px solid var(--border-color)",
                              backgroundColor: "var(--bg-input)",
                              color: "var(--text-main)",
                              fontSize: "13px",
                              outline: "none",
                            }}
                          >
                            <option value="">-- Select Instructor --</option>
                            {eligibleTrainers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.username}) {t.groupName ? `— Cohort: ${t.groupName}` : ""}
                              </option>
                            ))}
                          </select>
                          {formValidationErrors.trainer && (
                            <span style={{ fontSize: "12px", color: "var(--status-error)", marginTop: "4px", display: "block" }}>
                              {formValidationErrors.trainer}
                            </span>
                          )}
                        </div>

                        {/* 2. Rating Grid (Module Usefulness & Trainer Teaching Quality) */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
                          {/* Module Usefulness */}
                          <div style={{ padding: "16px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: formValidationErrors.moduleRating ? "1px solid var(--status-error)" : "1px solid var(--border-color)" }}>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
                              Module Usefulness <span style={{ color: "var(--status-error)" }}>*</span>
                            </label>
                            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 10px 0" }}>
                              How practical and relevant was this module content?
                            </p>
                            <StarRating
                              value={moduleRating}
                              onChange={(val) => {
                                setModuleRating(val);
                                if (formValidationErrors.moduleRating) {
                                  setFormValidationErrors((prev) => ({ ...prev, moduleRating: null }));
                                }
                              }}
                              disabled={feedbackSubmitting}
                              size={24}
                              label="Module Usefulness Rating"
                            />
                            {formValidationErrors.moduleRating && (
                              <span style={{ fontSize: "12px", color: "var(--status-error)", marginTop: "6px", display: "block" }}>
                                {formValidationErrors.moduleRating}
                              </span>
                            )}
                          </div>

                          {/* Trainer Teaching Quality */}
                          <div style={{ padding: "16px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-surface)", border: formValidationErrors.trainerRating ? "1px solid var(--status-error)" : "1px solid var(--border-color)" }}>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
                              Instructor Teaching Quality <span style={{ color: "var(--status-error)" }}>*</span>
                            </label>
                            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 10px 0" }}>
                              How effectively did the instructor present and explain the topic?
                            </p>
                            <StarRating
                              value={trainerRating}
                              onChange={(val) => {
                                setTrainerRating(val);
                                if (formValidationErrors.trainerRating) {
                                  setFormValidationErrors((prev) => ({ ...prev, trainerRating: null }));
                                }
                              }}
                              disabled={feedbackSubmitting}
                              size={24}
                              label="Instructor Teaching Quality Rating"
                            />
                            {formValidationErrors.trainerRating && (
                              <span style={{ fontSize: "12px", color: "var(--status-error)", marginTop: "6px", display: "block" }}>
                                {formValidationErrors.trainerRating}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 3. Understanding Level */}
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text-main)", marginBottom: "8px" }}>
                            Level of Understanding <span style={{ color: "var(--status-error)" }}>*</span>
                          </label>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
                            {[
                              { key: "ADVANCED", label: "Understood clearly", desc: "Confident with concepts and practical lab exercises" },
                              { key: "GOOD", label: "Understood some parts", desc: "Understood key points but need more practice or explanation" },
                              { key: "BASIC", label: "Needs additional guidance", desc: "Encountered difficulty and would like follow-up mentoring" },
                            ].map((opt) => {
                              const isSelected = understandingLevel === opt.key;
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => {
                                    setUnderstandingLevel(opt.key);
                                    if (formValidationErrors.understandingLevel) {
                                      setFormValidationErrors((prev) => ({ ...prev, understandingLevel: null }));
                                    }
                                  }}
                                  disabled={feedbackSubmitting}
                                  style={{
                                    textAlign: "left",
                                    padding: "12px 14px",
                                    borderRadius: "var(--radius-sm)",
                                    border: isSelected ? "2px solid var(--accent-primary)" : "1px solid var(--border-color)",
                                    backgroundColor: isSelected ? "rgba(99, 102, 241, 0.12)" : "var(--bg-input)",
                                    cursor: feedbackSubmitting ? "not-allowed" : "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                    <span style={{
                                      width: "12px",
                                      height: "12px",
                                      borderRadius: "50%",
                                      border: isSelected ? "4px solid var(--accent-primary)" : "1px solid var(--border-color)",
                                      backgroundColor: isSelected ? "var(--bg-card)" : "transparent",
                                    }}></span>
                                    <span style={{ fontSize: "13px", fontWeight: "600", color: isSelected ? "var(--accent-secondary)" : "var(--text-main)" }}>
                                      {opt.label}
                                    </span>
                                  </div>
                                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "0 0 0 20px", lineHeight: "1.3" }}>
                                    {opt.desc}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                          {formValidationErrors.understandingLevel && (
                            <span style={{ fontSize: "12px", color: "var(--status-error)", marginTop: "4px", display: "block" }}>
                              {formValidationErrors.understandingLevel}
                            </span>
                          )}
                        </div>

                        {/* 4. Constructive Comments */}
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--text-main)", marginBottom: "6px" }}>
                            Written Feedback & Comments <span style={{ color: "var(--status-error)" }}>*</span>
                          </label>
                          <textarea
                            rows={3}
                            value={feedbackComments}
                            onChange={(e) => {
                              setFeedbackComments(e.target.value);
                              if (formValidationErrors.comments) {
                                setFormValidationErrors((prev) => ({ ...prev, comments: null }));
                              }
                            }}
                            disabled={feedbackSubmitting}
                            placeholder="Share what worked well or areas where further clarification would help..."
                            style={{
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "var(--radius-sm)",
                              border: formValidationErrors.comments ? "1px solid var(--status-error)" : "1px solid var(--border-color)",
                              backgroundColor: "var(--bg-input)",
                              color: "var(--text-main)",
                              fontSize: "13px",
                              outline: "none",
                              resize: "vertical",
                              fontFamily: "inherit",
                              lineHeight: "1.5",
                            }}
                          ></textarea>
                          {formValidationErrors.comments && (
                            <span style={{ fontSize: "12px", color: "var(--status-error)", marginTop: "4px", display: "block" }}>
                              {formValidationErrors.comments}
                            </span>
                          )}
                        </div>

                        {/* Submit Action */}
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", marginTop: "4px" }}>
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={feedbackSubmitting}
                            style={{
                              padding: "10px 24px",
                              fontSize: "13px",
                              fontWeight: "600",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            {feedbackSubmitting ? (
                              <>
                                <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }}></div>
                                Submitting Feedback...
                              </>
                            ) : (
                              "Submit Evaluation"
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
