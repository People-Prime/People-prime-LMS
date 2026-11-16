import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../services/api";

export default function AdminCohortsTab() {
  const [subTab, setSubTab] = useState("groups"); // 'groups' | 'candidateTypes' | 'memberships' | 'trainers' | 'training'
  const [groups, setGroups] = useState([]);
  const [candidateTypes, setCandidateTypes] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [trainerAssignments, setTrainerAssignments] = useState([]);
  const [trainingAssignments, setTrainingAssignments] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [learners, setLearners] = useState([]);
  const [learnersLoading, setLearnersLoading] = useState(false);
  const [learnersError, setLearnersError] = useState(null);

  // Create Trainer Modal
  const [showCreateTrainer, setShowCreateTrainer] = useState(false);
  const [newTrainerUsername, setNewTrainerUsername] = useState("");
  const [newTrainerEmail, setNewTrainerEmail] = useState("");
  const [newTrainerFirstName, setNewTrainerFirstName] = useState("");
  const [newTrainerLastName, setNewTrainerLastName] = useState("");
  const [newTrainerPassword, setNewTrainerPassword] = useState("");

  // Edit Trainer Modal
  const [showEditTrainer, setShowEditTrainer] = useState(false);
  const [editingTrainerId, setEditingTrainerId] = useState(null);
  const [editTrainerUsername, setEditTrainerUsername] = useState("");
  const [editTrainerEmail, setEditTrainerEmail] = useState("");
  const [editTrainerFirstName, setEditTrainerFirstName] = useState("");
  const [editTrainerLastName, setEditTrainerLastName] = useState("");
  const [editTrainerPassword, setEditTrainerPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Create Group Modal
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [groupCandType, setGroupCandType] = useState("");
  const [groupDesc, setGroupDesc] = useState("");

  // Selected Group Details Modal State
  const [selectedGroupForDetails, setSelectedGroupForDetails] = useState(null);

  // Create Candidate Type Modal
  const [showCreateCandType, setShowCreateCandType] = useState(false);
  const [candTypeName, setCandTypeName] = useState("");
  const [candTypeCode, setCandTypeCode] = useState("");
  const [candTypeDesc, setCandTypeDesc] = useState("");

  // Selected Candidate Type Details Modal State
  const [selectedCandTypeForDetails, setSelectedCandTypeForDetails] = useState(null);

  // Manual Assignment ID inputs (due to lack of user population endpoint)
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberGroupId, setMemberGroupId] = useState("");
  const [memberLearnerId, setMemberLearnerId] = useState("");

  const [showAddTrainer, setShowAddTrainer] = useState(false);
  const [trainerGroupId, setTrainerGroupId] = useState("");
  const [trainerUserId, setTrainerUserId] = useState("");

  // Create Training Assignment Modal state
  const [showCreateTrainingModal, setShowCreateTrainingModal] = useState(false);
  const [curriculumList, setCurriculumList] = useState({ courses: [], levels: [], modules: [] });
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [targetType, setTargetType] = useState("LEVEL"); // 'COURSE' | 'LEVEL' | 'MODULE'
  const [recipientType, setRecipientType] = useState("GROUP"); // 'GROUP' | 'CANDIDATE_TYPE' | 'LEARNER'
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedCandTypeId, setSelectedCandTypeId] = useState("");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [trainingAssignError, setTrainingAssignError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [learnerUpdatingId, setLearnerUpdatingId] = useState(null);

  const fetchLearners = useCallback(async () => {
    setLearnersLoading(true);
    setLearnersError(null);
    try {
      const val = await apiClient("/admin/learners/");
      setLearners(Array.isArray(val) ? val : val?.results || []);
    } catch (err) {
      setLearnersError(err.message || "Failed to load registered learners.");
    } finally {
      setLearnersLoading(false);
    }
  }, []);

  const loadCohortsData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        apiClient("/learner-groups/"),
        apiClient("/candidate-types/"),
        apiClient("/group-memberships/"),
        apiClient("/trainer-assignments/"),
        apiClient("/training-assignments/"),
        apiClient("/admin/trainers/"),
        apiClient("/admin/learners/"),
      ]);

      const [grpsRes, cTypesRes, memsRes, trnAssignRes, trnTrainingRes, trnListRes, lrnListRes] = results;
      const errors = [];

      if (grpsRes.status === "fulfilled") {
        const val = grpsRes.value;
        setGroups(Array.isArray(val) ? val : val?.results || []);
      } else {
        errors.push("Failed to load learner groups.");
      }

      if (cTypesRes.status === "fulfilled") {
        const val = cTypesRes.value;
        setCandidateTypes(Array.isArray(val) ? val : val?.results || []);
      } else {
        errors.push("Failed to load candidate types.");
      }

      if (memsRes.status === "fulfilled") {
        const val = memsRes.value;
        setMemberships(Array.isArray(val) ? val : val?.results || []);
      } else {
        errors.push("Failed to load group memberships.");
      }

      if (trnAssignRes.status === "fulfilled") {
        const val = trnAssignRes.value;
        setTrainerAssignments(Array.isArray(val) ? val : val?.results || []);
      } else {
        errors.push("Failed to load trainer assignments.");
      }

      if (trnTrainingRes.status === "fulfilled") {
        const val = trnTrainingRes.value;
        setTrainingAssignments(Array.isArray(val) ? val : val?.results || []);
      } else {
        errors.push("Failed to load training assignments.");
      }

      if (trnListRes.status === "fulfilled") {
        const val = trnListRes.value;
        setTrainers(Array.isArray(val) ? val : val?.results || []);
      } else {
        errors.push("Failed to load registered trainers.");
      }

      if (lrnListRes.status === "fulfilled") {
        const val = lrnListRes.value;
        setLearners(Array.isArray(val) ? val : val?.results || []);
        setLearnersError(null);
      } else {
        const errMsg = lrnListRes.reason?.message || "Failed to load registered learners.";
        setLearnersError(errMsg);
        errors.push(errMsg);
      }

      setError(errors.length > 0 ? errors.join(" ") : null);
    } catch (err) {
      setError(err.message || "Failed to load cohort and group data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const results = await Promise.allSettled([
          apiClient("/learner-groups/"),
          apiClient("/candidate-types/"),
          apiClient("/group-memberships/"),
          apiClient("/trainer-assignments/"),
          apiClient("/training-assignments/"),
          apiClient("/admin/trainers/"),
          apiClient("/admin/learners/"),
        ]);

        if (isMounted) {
          const [grpsRes, cTypesRes, memsRes, trnAssignRes, trnTrainingRes, trnListRes, lrnListRes] = results;
          const errors = [];

          if (grpsRes.status === "fulfilled") {
            const val = grpsRes.value;
            setGroups(Array.isArray(val) ? val : val?.results || []);
          } else {
            errors.push("Failed to load learner groups.");
          }

          if (cTypesRes.status === "fulfilled") {
            const val = cTypesRes.value;
            setCandidateTypes(Array.isArray(val) ? val : val?.results || []);
          } else {
            errors.push("Failed to load candidate types.");
          }

          if (memsRes.status === "fulfilled") {
            const val = memsRes.value;
            setMemberships(Array.isArray(val) ? val : val?.results || []);
          } else {
            errors.push("Failed to load group memberships.");
          }

          if (trnAssignRes.status === "fulfilled") {
            const val = trnAssignRes.value;
            setTrainerAssignments(Array.isArray(val) ? val : val?.results || []);
          } else {
            errors.push("Failed to load trainer assignments.");
          }

          if (trnTrainingRes.status === "fulfilled") {
            const val = trnTrainingRes.value;
            setTrainingAssignments(Array.isArray(val) ? val : val?.results || []);
          } else {
            errors.push("Failed to load training assignments.");
          }

          if (trnListRes.status === "fulfilled") {
            const val = trnListRes.value;
            setTrainers(Array.isArray(val) ? val : val?.results || []);
          } else {
            errors.push("Failed to load registered trainers.");
          }

          if (lrnListRes.status === "fulfilled") {
            const val = lrnListRes.value;
            setLearners(Array.isArray(val) ? val : val?.results || []);
            setLearnersError(null);
          } else {
            const errMsg = lrnListRes.reason?.message || "Failed to load registered learners.";
            setLearnersError(errMsg);
            errors.push(errMsg);
          }

          setError(errors.length > 0 ? errors.join(" ") : null);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to load cohort and group data.");
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    loadCohortsData();
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim() || !groupCode.trim() || !groupCandType) {
      setError("Group Name, Group Code, and Candidate Type are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage("");
    try {
      const payload = {
        name: groupName.trim(),
        code: groupCode.trim(),
        candidate_type: parseInt(groupCandType, 10),
        description: groupDesc.trim(),
        is_active: true,
      };
      await apiClient("/learner-groups/", { method: "POST", body: payload });
      setSuccessMessage(`Learner Group "${groupName}" created successfully!`);
      setGroupName("");
      setGroupCode("");
      setGroupCandType("");
      setGroupDesc("");
      setShowCreateGroup(false);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || "Failed to create learner group.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCandidateType = async (e) => {
    e.preventDefault();
    if (!candTypeName.trim() || !candTypeCode.trim()) {
      setError("Candidate Type Name and Code are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage("");
    try {
      await apiClient("/candidate-types/", {
        method: "POST",
        body: {
          name: candTypeName.trim(),
          code: candTypeCode.trim(),
          description: candTypeDesc.trim(),
          is_active: true,
        },
      });
      setSuccessMessage(`Candidate Type "${candTypeName}" created successfully!`);
      setCandTypeName("");
      setCandTypeCode("");
      setCandTypeDesc("");
      setShowCreateCandType(false);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || "Failed to create candidate type.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMembership = async (e) => {
    e.preventDefault();
    if (!memberGroupId || !memberLearnerId) {
      setError("Please select a group and enter a Learner User ID.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage("");
    try {
      await apiClient("/group-memberships/", {
        method: "POST",
        body: {
          group: parseInt(memberGroupId, 10),
          learner: parseInt(memberLearnerId, 10),
          is_active: true,
        },
      });
      setSuccessMessage("Learner enrolled in group successfully!");
      setMemberLearnerId("");
      setShowAddMember(false);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || "Failed to enroll learner in group.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTrainer = async (e) => {
    e.preventDefault();
    if (!newTrainerUsername.trim() || !newTrainerPassword || !newTrainerPassword.trim()) {
      setError("Username and Password are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage("");
    try {
      const res = await apiClient("/admin/trainers/", {
        method: "POST",
        body: {
          username: newTrainerUsername.trim(),
          email: newTrainerEmail.trim(),
          first_name: newTrainerFirstName.trim(),
          last_name: newTrainerLastName.trim(),
          password: newTrainerPassword,
        },
      });
      setSuccessMessage(`Trainer "@${res.username}" created successfully!`);
      setNewTrainerUsername("");
      setNewTrainerEmail("");
      setNewTrainerFirstName("");
      setNewTrainerLastName("");
      setNewTrainerPassword("");
      setShowCreateTrainer(false);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || "Failed to create trainer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEditTrainer = (trainer) => {
    setEditingTrainerId(trainer.id);
    setEditTrainerUsername(trainer.username || "");
    setEditTrainerEmail(trainer.email || "");
    setEditTrainerFirstName(trainer.first_name || "");
    setEditTrainerLastName(trainer.last_name || "");
    setEditTrainerPassword("");
    setError(null);
    setShowEditTrainer(true);
  };

  const handleUpdateTrainer = async (e) => {
    e.preventDefault();
    if (!editTrainerUsername.trim()) {
      setError("Username is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage("");
    try {
      const payload = {
        username: editTrainerUsername.trim(),
        email: editTrainerEmail.trim(),
        first_name: editTrainerFirstName.trim(),
        last_name: editTrainerLastName.trim(),
      };
      if (editTrainerPassword && editTrainerPassword.trim()) {
        payload.password = editTrainerPassword;
      }
      const res = await apiClient(`/admin/trainers/${editingTrainerId}/`, {
        method: "PATCH",
        body: payload,
      });
      setSuccessMessage(`Trainer "@${res.username}" updated successfully!`);
      setShowEditTrainer(false);
      setEditingTrainerId(null);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || "Failed to update trainer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTrainerAssignment = async (e) => {
    e.preventDefault();
    if (!trainerGroupId || !trainerUserId) {
      setError("Please select a group and enter a Trainer User ID.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMessage("");
    try {
      await apiClient("/trainer-assignments/", {
        method: "POST",
        body: {
          group: parseInt(trainerGroupId, 10),
          trainer: parseInt(trainerUserId, 10),
          is_active: true,
        },
      });
      setSuccessMessage("Trainer assigned to group successfully!");
      setTrainerUserId("");
      setShowAddTrainer(false);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || "Failed to assign trainer to group.");
    } finally {
      setSubmitting(false);
    }
  };

  const fetchCurriculumForAssignment = async () => {
    setCurriculumLoading(true);
    try {
      const [crsRes, lvlRes, modRes] = await Promise.allSettled([
        apiClient("/courses/"),
        apiClient("/course-levels/"),
        apiClient("/modules/"),
      ]);
      const courses = crsRes.status === "fulfilled" ? (Array.isArray(crsRes.value) ? crsRes.value : crsRes.value?.results || []) : [];
      const rawLevels = lvlRes.status === "fulfilled" ? (Array.isArray(lvlRes.value) ? lvlRes.value : lvlRes.value?.results || []) : [];
      const levels = [...rawLevels].sort((a, b) => (a.order || 0) - (b.order || 0));
      const modules = modRes.status === "fulfilled" ? (Array.isArray(modRes.value) ? modRes.value : modRes.value?.results || []) : [];
      setCurriculumList({ courses, levels, modules });
      if (levels.length > 0) {
        setSelectedLevelId((prev) => prev || String(levels[0].id));
      }
    } catch {
      // ignore
    } finally {
      setCurriculumLoading(false);
    }
  };

  const handleOpenCreateTrainingModal = () => {
    const sortedLevels = [...(curriculumList.levels || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    setTargetType("LEVEL");
    setRecipientType("GROUP");
    setSelectedCourseId("");
    setSelectedLevelId(sortedLevels.length > 0 ? String(sortedLevels[0].id) : "");
    setSelectedModuleId("");
    setSelectedGroupId(groups.length > 0 ? String(groups[0].id) : "");
    setSelectedCandTypeId(candidateTypes.length > 0 ? String(candidateTypes[0].id) : "");
    setSelectedLearnerId(learners.length > 0 ? String(learners[0].id) : "");
    setAssignmentDueDate("");
    setTrainingAssignError(null);
    setShowCreateTrainingModal(true);
    fetchCurriculumForAssignment();
  };

  const handleCreateTrainingAssignment = async (e) => {
    e.preventDefault();
    setTrainingAssignError(null);

    // Validate target
    if (targetType === "COURSE" && !selectedCourseId) {
      setTrainingAssignError("Please select a Course.");
      return;
    }
    if (targetType === "LEVEL" && !selectedLevelId) {
      setTrainingAssignError("Please select a Course Level.");
      return;
    }
    if (targetType === "MODULE" && !selectedModuleId) {
      setTrainingAssignError("Please select a Module.");
      return;
    }

    // Validate recipient
    if (recipientType === "GROUP" && !selectedGroupId) {
      setTrainingAssignError("Please select a Learner Group.");
      return;
    }
    if (recipientType === "CANDIDATE_TYPE" && !selectedCandTypeId) {
      setTrainingAssignError("Please select a Candidate Type.");
      return;
    }
    if (recipientType === "LEARNER" && !selectedLearnerId) {
      setTrainingAssignError("Please select an Individual Learner.");
      return;
    }

    const payload = {
      course: targetType === "COURSE" ? parseInt(selectedCourseId, 10) : null,
      level: targetType === "LEVEL" ? parseInt(selectedLevelId, 10) : null,
      module: targetType === "MODULE" ? parseInt(selectedModuleId, 10) : null,
      learner_group: recipientType === "GROUP" ? parseInt(selectedGroupId, 10) : null,
      candidate_type: recipientType === "CANDIDATE_TYPE" ? parseInt(selectedCandTypeId, 10) : null,
      learner: recipientType === "LEARNER" ? parseInt(selectedLearnerId, 10) : null,
      due_date: assignmentDueDate ? assignmentDueDate : null,
      is_active: true,
    };

    setSubmitting(true);
    try {
      await apiClient("/training-assignments/", {
        method: "POST",
        body: payload,
      });
      setSuccessMessage("Training assignment created successfully!");
      setShowCreateTrainingModal(false);
      await loadCohortsData();
    } catch (err) {
      let msg = err.message || "Failed to create training assignment.";
      if (err.data) {
        if (err.data.non_field_errors) {
          msg = Array.isArray(err.data.non_field_errors) ? err.data.non_field_errors.join(" ") : err.data.non_field_errors;
        } else if (err.data.curriculum_target) {
          msg = err.data.curriculum_target;
        } else if (err.data.recipient) {
          msg = err.data.recipient;
        } else if (err.data.learner) {
          msg = Array.isArray(err.data.learner) ? err.data.learner.join(" ") : err.data.learner;
        }
      }
      setTrainingAssignError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (endpoint, id, itemLabel) => {
    if (!window.confirm(`Are you sure you want to remove ${itemLabel}?`)) return;
    setError(null);
    setSuccessMessage("");
    try {
      await apiClient(`/${endpoint}/${id}/`, { method: "DELETE" });
      setSuccessMessage(`${itemLabel} removed successfully.`);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || `Failed to remove ${itemLabel}.`);
    }
  };

  const handleToggleTrainerStatus = async (trainer, activate) => {
    const actionVerb = activate ? "activate" : "deactivate";
    const confirmMessage = activate
      ? `Are you sure you want to activate trainer @${trainer.username}? This will restore their login access.`
      : `Are you sure you want to deactivate trainer @${trainer.username}? This will block them from logging in, while preserving all historical assignments, courses, and audit records.`;

    if (!window.confirm(confirmMessage)) return;

    setStatusUpdatingId(trainer.id);
    setError(null);
    setSuccessMessage("");
    try {
      const endpoint = activate ? "activate" : "deactivate";
      const res = await apiClient(`/admin/trainers/${trainer.id}/${endpoint}/`, {
        method: "POST",
      });
      setSuccessMessage(res?.message || `Trainer @${trainer.username} ${actionVerb}d successfully.`);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || `Failed to ${actionVerb} trainer.`);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteTrainer = async (trainer) => {
    if (!window.confirm(`Are you sure you want to permanently delete trainer @${trainer.username}? This action is irreversible.`)) return;

    setStatusUpdatingId(trainer.id);
    setError(null);
    setSuccessMessage("");
    try {
      const res = await apiClient(`/admin/trainers/${trainer.id}/`, {
        method: "DELETE",
      });
      setSuccessMessage(res?.message || `Trainer @${trainer.username} permanently deleted.`);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || `Failed to delete trainer @${trainer.username}.`);
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleToggleLearnerStatus = async (learner, activate) => {
    const actionVerb = activate ? "activate" : "deactivate";
    const confirmMessage = activate
      ? `Are you sure you want to activate learner @${learner.username}? This will restore their login access.`
      : `Are you sure you want to deactivate learner @${learner.username}? This will block them from logging in, while preserving all historical group enrollments and records.`;

    if (!window.confirm(confirmMessage)) return;

    setLearnerUpdatingId(learner.id);
    setError(null);
    setSuccessMessage("");
    try {
      const endpoint = activate ? "activate" : "deactivate";
      const res = await apiClient(`/admin/learners/${learner.id}/${endpoint}/`, {
        method: "POST",
      });
      setSuccessMessage(res?.message || `Learner @${learner.username} ${actionVerb}d successfully.`);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || `Failed to ${actionVerb} learner.`);
    } finally {
      setLearnerUpdatingId(null);
    }
  };

  const handleDeleteLearner = async (learner) => {
    if (!window.confirm(`Are you sure you want to permanently delete learner @${learner.username}? This action is irreversible.`)) return;

    setLearnerUpdatingId(learner.id);
    setError(null);
    setSuccessMessage("");
    try {
      const res = await apiClient(`/admin/learners/${learner.id}/`, {
        method: "DELETE",
      });
      setSuccessMessage(res?.message || `Learner @${learner.username} permanently deleted.`);
      await loadCohortsData();
    } catch (err) {
      setError(err.message || `Failed to delete learner @${learner.username}.`);
    } finally {
      setLearnerUpdatingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", margin: 0 }}>Cohorts, Groups & Assignments</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>
            Manage learner cohorts, candidate types, trainer allocations, and training assignments.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {subTab === "groups" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreateGroup(true)}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              + Create Group
            </button>
          )}
          {subTab === "candidateTypes" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreateCandType(true)}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              + Create Candidate Type
            </button>
          )}
          {subTab === "memberships" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowAddMember(true);
                if (learners.length === 0 && !learnersLoading && !learnersError) {
                  fetchLearners();
                }
              }}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              + Enroll Learner
            </button>
          )}
          {subTab === "trainers" && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreateTrainer(true)}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                + Create Trainer
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAddTrainer(true)}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                + Assign Trainer
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreateTrainingModal}
            style={{ padding: "6px 14px", fontSize: "13px" }}
          >
            + Assign Training Curriculum
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRefresh}
            disabled={loading}
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="alert alert-success" role="status" style={{ marginBottom: "16px" }}>
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="status" style={{ marginBottom: "16px" }}>
          <span>{error}</span>
        </div>
      )}

      {/* Sub-tab switcher */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-color)", marginBottom: "16px", paddingBottom: "8px" }}>
        <button
          type="button"
          className={`btn ${subTab === "groups" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setSubTab("groups")}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Learner Groups ({groups.length})
        </button>
        <button
          type="button"
          className={`btn ${subTab === "candidateTypes" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setSubTab("candidateTypes")}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Candidate Types ({candidateTypes.length})
        </button>
        <button
          type="button"
          className={`btn ${subTab === "memberships" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setSubTab("memberships")}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Learner Enrollments ({memberships.length})
        </button>
        <button
          type="button"
          className={`btn ${subTab === "trainers" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setSubTab("trainers")}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Trainer Allocations ({trainerAssignments.length})
        </button>
        <button
          type="button"
          className={`btn ${subTab === "training" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setSubTab("training")}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          Training Assignments ({trainingAssignments.length})
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
          <p style={{ color: "var(--text-secondary)" }}>Loading cohort and assignment data...</p>
        </div>
      ) : (
        <>
          {/* Groups View */}
          {subTab === "groups" && (
            <div className="card">
              <h3 className="card-title">
                <span>Active Learner Groups (Cohorts)</span>
                <span className="badge badge-purple">{groups.length} Groups</span>
              </h3>
              {groups.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                  No learner groups found. Click &quot;+ Create Group&quot; above to add a cohort.
                </p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Group Name</th>
                        <th>Code</th>
                        <th>Candidate Type</th>
                        <th>Learners</th>
                        <th>Trainers</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g) => (
                        <tr key={g.id}>
                          <td><code>#{g.id}</code></td>
                          <td>
                            <button
                              type="button"
                              onClick={() => setSelectedGroupForDetails(g)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                font: "inherit",
                                cursor: "pointer",
                                color: "var(--accent-primary, #6366f1)",
                                textDecoration: "underline",
                                textAlign: "left",
                                fontWeight: "600",
                              }}
                              title={`Click to view learners in ${g.name}`}
                            >
                              {g.name}
                            </button>
                          </td>
                          <td><code>{g.code}</code></td>
                          <td>{g.candidate_type_name || "—"}</td>
                          <td><span className="badge badge-info">{g.learners_count ?? 0}</span></td>
                          <td><span className="badge badge-info">{g.trainers_count ?? 0}</span></td>
                          <td>
                            <span className={`badge ${g.is_active ? "badge-success" : "badge-warning"}`}>
                              {g.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleDeleteItem("learner-groups", g.id, `Group ${g.name}`)}
                              style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-error)" }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Candidate Types View */}
          {subTab === "candidateTypes" && (
            <div className="card">
              <h3 className="card-title">
                <span>Candidate Types</span>
                <span className="badge badge-purple">{candidateTypes.length} Types</span>
              </h3>
              {candidateTypes.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                  No candidate types found.
                </p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Candidate Type</th>
                        <th>Code</th>
                        <th>Description</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidateTypes.map((ct) => (
                        <tr key={ct.id}>
                          <td><code>#{ct.id}</code></td>
                          <td>
                            <button
                              type="button"
                              onClick={() => setSelectedCandTypeForDetails(ct)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                font: "inherit",
                                cursor: "pointer",
                                color: "var(--accent-primary, #6366f1)",
                                textDecoration: "underline",
                                textAlign: "left",
                                fontWeight: "600",
                              }}
                              title={`Click to view learners in ${ct.name}`}
                            >
                              {ct.name}
                            </button>
                          </td>
                          <td><code>{ct.code}</code></td>
                          <td style={{ fontSize: "13px" }}>{ct.description || "—"}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleDeleteItem("candidate-types", ct.id, `Candidate Type ${ct.name}`)}
                              style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-error)" }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Learner Enrollments View */}
          {subTab === "memberships" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Master Registered Learners Table */}
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    <span>Registered Learners</span>
                    <span className="badge badge-purple">{learners.length} Learners</span>
                  </h3>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Master list of registered learner accounts eligible for group enrollment
                  </span>
                </div>

                {learnersLoading && learners.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                    Loading registered learners...
                  </p>
                ) : learners.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                    No learners registered in the system. Learners can self-register via the portal.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Username</th>
                          <th>Full Name</th>
                          <th>Email</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {learners.map((lrn) => {
                          const fullName = [lrn.first_name, lrn.last_name].filter(Boolean).join(" ");
                          const isUpdating = learnerUpdatingId === lrn.id;
                          return (
                            <tr key={lrn.id}>
                              <td><code>#{lrn.id}</code></td>
                              <td><strong>@{lrn.username}</strong></td>
                              <td>{fullName || <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>—</span>}</td>
                              <td>{lrn.email || <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>—</span>}</td>
                              <td>
                                <span className={`badge ${lrn.is_active ? "badge-success" : "badge-warning"}`}>
                                  {lrn.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                  {lrn.is_active ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      onClick={() => handleToggleLearnerStatus(lrn, false)}
                                      disabled={submitting || isUpdating}
                                      style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-warning, #f59e0b)" }}
                                    >
                                      {isUpdating ? "Updating..." : "Deactivate"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      onClick={() => handleToggleLearnerStatus(lrn, true)}
                                      disabled={submitting || isUpdating}
                                      style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-success, #10b981)" }}
                                    >
                                      {isUpdating ? "Updating..." : "Activate"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleDeleteLearner(lrn)}
                                    disabled={submitting || isUpdating}
                                    style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-error, #ef4444)" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Group Enrollments Table */}
              <div className="card">
                <h3 className="card-title">
                  <span>Learner Group Enrollments</span>
                  <span className="badge badge-purple">{memberships.length} Enrolled</span>
                </h3>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 12px 0" }}>
                  <em>Note: Allocate registered learners to groups to grant curriculum and course access.</em>
                </p>
                {memberships.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                    No learners currently enrolled in groups. Click "+ Enroll Learner" above to enroll a learner.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Learner</th>
                          <th>Group</th>
                          <th>Joined</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberships.map((m) => (
                          <tr key={m.id}>
                            <td><code>#{m.id}</code></td>
                            <td><strong>{m.learner_username || `Learner #${m.learner}`}</strong></td>
                            <td>{m.group_name || `Group #${m.group}`}</td>
                            <td style={{ fontSize: "12px" }}>{new Date(m.joined_at).toLocaleDateString()}</td>
                            <td>
                              <span className={`badge ${m.is_active ? "badge-success" : "badge-warning"}`}>
                                {m.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleDeleteItem("group-memberships", m.id, "membership")}
                                style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-error)" }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trainer Management & Assignments View */}
          {subTab === "trainers" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Master Registered Trainers Table */}
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <h3 className="card-title" style={{ margin: 0 }}>
                    <span>Registered Trainers</span>
                    <span className="badge badge-purple">{trainers.length} Trainers</span>
                  </h3>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Master list of trainer accounts eligible for group allocation
                  </span>
                </div>

                {trainers.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                    No trainers registered in the system. Click "+ Create Trainer" above to register a trainer.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Username</th>
                          <th>Full Name</th>
                          <th>Email</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trainers.map((t) => {
                          const fullName = [t.first_name, t.last_name].filter(Boolean).join(" ");
                          const isUpdating = statusUpdatingId === t.id;
                          return (
                            <tr key={t.id}>
                              <td><code>#{t.id}</code></td>
                              <td><strong>@{t.username}</strong></td>
                              <td>{fullName || <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>—</span>}</td>
                              <td>{t.email || <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>—</span>}</td>
                              <td>
                                <span className={`badge ${t.is_active ? "badge-success" : "badge-warning"}`}>
                                  {t.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleOpenEditTrainer(t)}
                                    disabled={submitting || isUpdating}
                                    style={{ padding: "4px 8px", fontSize: "11px", color: "var(--accent-primary, #6366f1)" }}
                                  >
                                    Edit
                                  </button>
                                  {t.is_active ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      onClick={() => handleToggleTrainerStatus(t, false)}
                                      disabled={submitting || isUpdating}
                                      style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-warning, #f59e0b)" }}
                                    >
                                      {isUpdating ? "Updating..." : "Deactivate"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      onClick={() => handleToggleTrainerStatus(t, true)}
                                      disabled={submitting || isUpdating}
                                      style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-success, #10b981)" }}
                                    >
                                      {isUpdating ? "Updating..." : "Activate"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleDeleteTrainer(t)}
                                    disabled={submitting || isUpdating}
                                    style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-error, #ef4444)" }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Trainer Group Allocations Table */}
              <div className="card">
                <h3 className="card-title">
                  <span>Trainer Group Allocations</span>
                  <span className="badge badge-purple">{trainerAssignments.length} Assignments</span>
                </h3>
              {trainerAssignments.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                  No trainers currently assigned to groups.
                </p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Trainer</th>
                        <th>Group</th>
                        <th>Assigned</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainerAssignments.map((ta) => (
                        <tr key={ta.id}>
                          <td><code>#{ta.id}</code></td>
                          <td><strong>{ta.trainer_username || `Trainer #${ta.trainer}`}</strong></td>
                          <td>{ta.group_name || `Group #${ta.group}`}</td>
                          <td style={{ fontSize: "12px" }}>{new Date(ta.assigned_at).toLocaleDateString()}</td>
                          <td>
                            <span className={`badge ${ta.is_active ? "badge-success" : "badge-warning"}`}>
                              {ta.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleDeleteItem("trainer-assignments", ta.id, "trainer assignment")}
                              style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-error)" }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

          {/* Training Assignments View */}
          {subTab === "training" && (
            <div className="card">
              <h3 className="card-title">
                <span>Training Assignments</span>
                <span className="badge badge-purple">{trainingAssignments.length} Assigned</span>
              </h3>
              {trainingAssignments.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", padding: "16px", textAlign: "center" }}>
                  No training assignments configured.
                </p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Recipient</th>
                        <th>Assigned Curriculum</th>
                        <th>Due Date</th>
                        <th>Assigned By</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainingAssignments.map((tra) => (
                        <tr key={tra.id}>
                          <td><code>#{tra.id}</code></td>
                          <td>
                            {tra.learner_username ? (
                              <span>
                                <span className="badge badge-primary" style={{ marginRight: "6px" }}>Learner</span>
                                <strong>@{tra.learner_username}</strong>
                              </span>
                            ) : tra.learner_group_name ? (
                              <span>
                                <span className="badge badge-secondary" style={{ marginRight: "6px" }}>Group</span>
                                <strong>{tra.learner_group_name}</strong>
                              </span>
                            ) : tra.candidate_type_name ? (
                              <span>
                                <span className="badge badge-purple" style={{ marginRight: "6px" }}>Type</span>
                                <strong>{tra.candidate_type_name}</strong>
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-secondary)" }}>—</span>
                            )}
                          </td>
                          <td>
                            {tra.module_name ? (
                              <span>
                                <span className="badge badge-success" style={{ marginRight: "6px" }}>Module</span>
                                <strong>{tra.module_name}</strong>
                                {tra.level_name && <small style={{ color: "var(--text-secondary)", display: "block" }}>Level: {tra.level_name}</small>}
                                {tra.course_name && <small style={{ color: "var(--text-secondary)", display: "block" }}>Course: {tra.course_name}</small>}
                              </span>
                            ) : tra.level_name ? (
                              <span>
                                <span className="badge badge-purple" style={{ marginRight: "6px" }}>Level</span>
                                <strong>{tra.level_name}</strong>
                                {tra.course_name && <small style={{ color: "var(--text-secondary)", display: "block" }}>Course: {tra.course_name}</small>}
                              </span>
                            ) : tra.course_name ? (
                              <span>
                                <span className="badge badge-info" style={{ marginRight: "6px" }}>Course</span>
                                <strong>{tra.course_name}</strong>
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-secondary)" }}>—</span>
                            )}
                          </td>
                          <td style={{ fontSize: "12px" }}>{tra.due_date ? new Date(tra.due_date).toLocaleDateString() : "No deadline"}</td>
                          <td>{tra.assigned_by_username || "Admin"}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleDeleteItem("training-assignments", tra.id, "training assignment")}
                              style={{ padding: "4px 8px", fontSize: "11px", color: "var(--status-error)" }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "500px", margin: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Create New Learner Group</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label className="form-label" htmlFor="grpName">Group Name *</label>
                <input
                  id="grpName"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Batch 2026 Alpha"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="grpCode">Group Code *</label>
                <input
                  id="grpCode"
                  type="text"
                  className="form-input"
                  placeholder="e.g. GRP-B26A"
                  value={groupCode}
                  onChange={(e) => setGroupCode(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="grpCandType">Candidate Type *</label>
                {candidateTypes.length === 0 && (
                  <div style={{
                    padding: "10px 12px",
                    background: "var(--bg-secondary, #f8fafc)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--text-secondary, #64748b)",
                    marginBottom: "8px"
                  }}>
                    No Candidate Types exist yet. Please create at least one Candidate Type in the Candidate Types tab before creating a Learner Group.
                  </div>
                )}
                <select
                  id="grpCandType"
                  className="form-input"
                  value={groupCandType}
                  onChange={(e) => setGroupCandType(e.target.value)}
                  required
                >
                  <option value="">— Select Candidate Type —</option>
                  {candidateTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name} ({ct.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="grpDesc">Description</label>
                <textarea
                  id="grpDesc"
                  className="form-input"
                  rows="2"
                  placeholder="Cohort notes..."
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateGroup(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !groupName.trim() || !groupCode.trim() || !groupCandType}
                >
                  {submitting ? "Creating..." : "Save Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Candidate Type Modal */}
      {showCreateCandType && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "500px", margin: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Create Candidate Type</h3>
            <form onSubmit={handleCreateCandidateType}>
              <div className="form-group">
                <label className="form-label" htmlFor="ctName">Name *</label>
                <input
                  id="ctName"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Graduate Trainee"
                  value={candTypeName}
                  onChange={(e) => setCandTypeName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ctCode">Code *</label>
                <input
                  id="ctCode"
                  type="text"
                  className="form-input"
                  placeholder="e.g. GRAD_TRN"
                  value={candTypeCode}
                  onChange={(e) => setCandTypeCode(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ctDesc">Description</label>
                <textarea
                  id="ctDesc"
                  className="form-input"
                  rows="2"
                  placeholder="Candidate type notes..."
                  value={candTypeDesc}
                  onChange={(e) => setCandTypeDesc(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateCandType(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !candTypeName.trim() || !candTypeCode.trim()}
                >
                  {submitting ? "Creating..." : "Save Candidate Type"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll Learner Modal */}
      {showAddMember && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "450px", margin: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Enroll Learner in Group</h3>
            <form onSubmit={handleAddMembership}>
              <div className="form-group">
                <label className="form-label" htmlFor="memGroup">Select Group *</label>
                <select
                  id="memGroup"
                  className="form-input"
                  value={memberGroupId}
                  onChange={(e) => setMemberGroupId(e.target.value)}
                  required
                >
                  <option value="">— Select Group —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="memLearner">Select Learner *</label>
                {learnersLoading ? (
                  <div style={{ padding: "8px 12px", background: "var(--bg-secondary, #f8fafc)", borderRadius: "6px", fontSize: "13px", color: "var(--text-secondary, #64748b)" }}>
                    {learnersError ? "Retrying learner list..." : "Loading registered learners..."}
                  </div>
                ) : learnersError ? (
                  <div style={{
                    padding: "10px 12px",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    marginBottom: "8px"
                  }}>
                    <p style={{ color: "#ef4444", margin: "0 0 8px 0", fontSize: "12px", fontWeight: 500 }}>
                      Failed to load learners: {learnersError}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "12px" }}
                      onClick={fetchLearners}
                      disabled={learnersLoading}
                    >
                      {learnersLoading ? "Retrying..." : "↻ Retry Loading Learners"}
                    </button>
                  </div>
                ) : learners.length === 0 ? (
                  <div style={{
                    padding: "10px 12px",
                    background: "var(--bg-secondary, #f8fafc)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--text-secondary, #64748b)"
                  }}>
                    No registered learners were returned. Learners must register before they can be enrolled into groups.
                  </div>
                ) : (
                  <div>
                    <select
                      id="memLearner"
                      className="form-input"
                      value={memberLearnerId}
                      onChange={(e) => setMemberLearnerId(e.target.value)}
                      required
                    >
                      <option value="">— Select Learner —</option>
                      {learners.map((lrn) => {
                        const fullName = [lrn.first_name, lrn.last_name].filter(Boolean).join(" ");
                        let label = fullName ? `${fullName} (@${lrn.username})` : `@${lrn.username}`;
                        if (lrn.email) {
                          label += ` • ${lrn.email}`;
                        }
                        if (!lrn.is_active) {
                          label += " [Inactive]";
                        }
                        return (
                          <option key={lrn.id} value={lrn.id} disabled={!lrn.is_active}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <small style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                      Only active learners can be enrolled. Inactive accounts are disabled.
                    </small>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddMember(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !memberGroupId || !memberLearnerId || !!learnersError || learnersLoading || learners.length === 0}
                >
                  {submitting ? "Enrolling..." : "Enroll Learner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Trainer Modal */}
      {showCreateTrainer && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "480px", margin: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Create New Trainer Account</h3>
            <form onSubmit={handleCreateTrainer}>
              <div className="form-group">
                <label className="form-label" htmlFor="trnMgtUsername">Username *</label>
                <input
                  id="trnMgtUsername"
                  type="text"
                  className="form-input"
                  placeholder="e.g. john_trainer"
                  value={newTrainerUsername}
                  onChange={(e) => setNewTrainerUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trnMgtEmail">Email (Optional)</label>
                <input
                  id="trnMgtEmail"
                  type="email"
                  className="form-input"
                  placeholder="e.g. trainer@peopleprime.com"
                  value={newTrainerEmail}
                  onChange={(e) => setNewTrainerEmail(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="trnMgtFirst">First Name</label>
                  <input
                    id="trnMgtFirst"
                    type="text"
                    className="form-input"
                    placeholder="e.g. John"
                    value={newTrainerFirstName}
                    onChange={(e) => setNewTrainerFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="trnMgtLast">Last Name</label>
                  <input
                    id="trnMgtLast"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Doe"
                    value={newTrainerLastName}
                    onChange={(e) => setNewTrainerLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trnMgtPassword">Temporary Password *</label>
                <input
                  id="trnMgtPassword"
                  type="password"
                  className="form-input"
                  placeholder="Enter strong temporary password"
                  value={newTrainerPassword}
                  onChange={(e) => setNewTrainerPassword(e.target.value)}
                  required
                />
                <small style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                  Must be at least 8 characters (numbers, letters, or symbols allowed). Common dictionary passwords remain blocked.
                </small>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateTrainer(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !newTrainerUsername.trim() || !newTrainerPassword || !newTrainerPassword.trim()}
                >
                  {submitting ? "Creating..." : "Save Trainer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Trainer Modal */}
      {showEditTrainer && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "480px", margin: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Edit Trainer Profile</h3>
            <form onSubmit={handleUpdateTrainer}>
              <div className="form-group">
                <label className="form-label" htmlFor="trnEditUsername">Username *</label>
                <input
                  id="trnEditUsername"
                  type="text"
                  className="form-input"
                  placeholder="e.g. john_trainer"
                  value={editTrainerUsername}
                  onChange={(e) => setEditTrainerUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trnEditEmail">Email</label>
                <input
                  id="trnEditEmail"
                  type="email"
                  className="form-input"
                  placeholder="e.g. trainer@peopleprime.com"
                  value={editTrainerEmail}
                  onChange={(e) => setEditTrainerEmail(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="trnEditFirst">First Name</label>
                  <input
                    id="trnEditFirst"
                    type="text"
                    className="form-input"
                    placeholder="e.g. John"
                    value={editTrainerFirstName}
                    onChange={(e) => setEditTrainerFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="trnEditLast">Last Name</label>
                  <input
                    id="trnEditLast"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Doe"
                    value={editTrainerLastName}
                    onChange={(e) => setEditTrainerLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trnEditPassword">Change Password (Optional)</label>
                <input
                  id="trnEditPassword"
                  type="password"
                  className="form-input"
                  placeholder="Leave blank to keep existing password"
                  value={editTrainerPassword}
                  onChange={(e) => setEditTrainerPassword(e.target.value)}
                />
                <small style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                  Optional. If entered, must be at least 8 characters (numbers, letters, or symbols allowed).
                </small>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEditTrainer(false);
                    setEditingTrainerId(null);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !editTrainerUsername.trim()}
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Trainer Modal */}
      {showAddTrainer && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "450px", margin: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Assign Trainer to Group</h3>
            <form onSubmit={handleAddTrainerAssignment}>
              <div className="form-group">
                <label className="form-label" htmlFor="trnGroup">Select Group *</label>
                <select
                  id="trnGroup"
                  className="form-input"
                  value={trainerGroupId}
                  onChange={(e) => setTrainerGroupId(e.target.value)}
                  required
                >
                  <option value="">— Select Group —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trnUser">Select Trainer *</label>
                {trainers.length > 0 ? (
                  <select
                    id="trnUser"
                    className="form-input"
                    value={trainerUserId}
                    onChange={(e) => setTrainerUserId(e.target.value)}
                    required
                  >
                    <option value="">— Select Trainer —</option>
                    {trainers.map((t) => {
                      const fullName = [t.first_name, t.last_name].filter(Boolean).join(" ");
                      return (
                        <option key={t.id} value={t.id}>
                          {fullName ? `${fullName} (@${t.username})` : `@${t.username}`} {t.email ? `• ${t.email}` : ""}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div>
                    <input
                      id="trnUser"
                      type="number"
                      className="form-input"
                      placeholder="e.g. 4"
                      value={trainerUserId}
                      onChange={(e) => setTrainerUserId(e.target.value)}
                      required
                    />
                    <small style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                      No trainers loaded. Enter active Trainer User ID manually or click "+ Create Trainer" first.
                    </small>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddTrainer(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !trainerGroupId || !trainerUserId}
                >
                  {submitting ? "Assigning..." : "Assign Trainer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Create Training Assignment Modal */}
      {showCreateTrainingModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "580px", margin: "20px", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>Assign Learning Content</h3>

            {trainingAssignError && (
              <div className="alert alert-error" style={{ marginBottom: "16px" }}>
                {trainingAssignError}
              </div>
            )}

            <form onSubmit={handleCreateTrainingAssignment}>
              {/* Step 1: Learning Content Type Selection */}
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>1. Learning Content Type *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="targetType"
                      value="COURSE"
                      checked={targetType === "COURSE"}
                      onChange={() => {
                        setTargetType("COURSE");
                        setSelectedLevelId("");
                        setSelectedModuleId("");
                      }}
                    />
                    Course
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="targetType"
                      value="LEVEL"
                      checked={targetType === "LEVEL"}
                      onChange={() => {
                        setTargetType("LEVEL");
                        setSelectedCourseId("");
                        setSelectedModuleId("");
                        setSelectedLevelId((prev) => {
                          if (prev) return prev;
                          const sorted = [...(curriculumList.levels || [])].sort(
                            (a, b) => (a.order || 0) - (b.order || 0)
                          );
                          return sorted.length > 0 ? String(sorted[0].id) : "";
                        });
                      }}
                    />
                    Course Level
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="targetType"
                      value="MODULE"
                      checked={targetType === "MODULE"}
                      onChange={() => {
                        setTargetType("MODULE");
                        setSelectedCourseId("");
                        setSelectedLevelId("");
                        setSelectedModuleId("");
                      }}
                    />
                    Module
                  </label>
                </div>
              </div>

              {targetType === "COURSE" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="assignCourse">Select Course *</label>
                  <select
                    id="assignCourse"
                    className="form-input"
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    required
                    disabled={curriculumLoading}
                  >
                    <option value="">-- Choose Course --</option>
                    {curriculumList.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code}) [{c.status}]
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === "LEVEL" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="assignLevel">Select Course Level *</label>
                  <select
                    id="assignLevel"
                    className="form-input"
                    value={selectedLevelId}
                    onChange={(e) => setSelectedLevelId(e.target.value)}
                    required
                    disabled={curriculumLoading}
                  >
                    <option value="">-- Choose Course Level --</option>
                    {(curriculumList.levels || []).map((lvl) => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.name} (Tier #{lvl.order}){lvl.course_name ? ` — ${lvl.course_name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === "MODULE" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="assignModLevel">Filter by Level (Optional)</label>
                      <select
                        id="assignModLevel"
                        className="form-input"
                        value={selectedLevelId}
                        onChange={(e) => {
                          setSelectedLevelId(e.target.value);
                          setSelectedModuleId("");
                        }}
                        disabled={curriculumLoading}
                      >
                        <option value="">-- All Levels --</option>
                        {(curriculumList.levels || []).map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>
                            {lvl.name} (Tier #{lvl.order})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="assignModCourse">Filter by Course (Optional)</label>
                      <select
                        id="assignModCourse"
                        className="form-input"
                        value={selectedCourseId}
                        onChange={(e) => {
                          setSelectedCourseId(e.target.value);
                          setSelectedModuleId("");
                        }}
                        disabled={curriculumLoading}
                      >
                        <option value="">-- All / Independent Modules --</option>
                        {curriculumList.courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="assignMod">Select Module *</label>
                    <select
                      id="assignMod"
                      className="form-input"
                      value={selectedModuleId}
                      onChange={(e) => setSelectedModuleId(e.target.value)}
                      required
                      disabled={curriculumLoading}
                    >
                      <option value="">-- Choose Module --</option>
                      {curriculumList.modules
                        .filter((m) => {
                          if (selectedLevelId && String(m.level) !== String(selectedLevelId)) return false;
                          if (selectedCourseId && String(m.course) !== String(selectedCourseId)) return false;
                          return true;
                        })
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} (Order: {m.order}){m.level_name ? ` [${m.level_name}]` : ""} [{m.status}]
                          </option>
                        ))}
                    </select>
                    {curriculumList.modules.filter((m) => {
                      if (selectedLevelId && String(m.level) !== String(selectedLevelId)) return false;
                      if (selectedCourseId && String(m.course) !== String(selectedCourseId)) return false;
                      return true;
                    }).length === 0 && (
                      <small style={{ color: "var(--status-warning, #f59e0b)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                        No modules found matching the selected filters.
                      </small>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Recipient Type Selection */}
              <div className="form-group" style={{ marginTop: "18px", marginBottom: "16px" }}>
                <label className="form-label" style={{ fontWeight: 600 }}>2. Recipient Type *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="GROUP"
                      checked={recipientType === "GROUP"}
                      onChange={() => {
                        setRecipientType("GROUP");
                        setSelectedCandTypeId("");
                        setSelectedLearnerId("");
                        if (!selectedGroupId && groups.length > 0) setSelectedGroupId(String(groups[0].id));
                      }}
                    />
                    Learner Group (Cohort)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="CANDIDATE_TYPE"
                      checked={recipientType === "CANDIDATE_TYPE"}
                      onChange={() => {
                        setRecipientType("CANDIDATE_TYPE");
                        setSelectedGroupId("");
                        setSelectedLearnerId("");
                        if (!selectedCandTypeId && candidateTypes.length > 0) setSelectedCandTypeId(String(candidateTypes[0].id));
                      }}
                    />
                    Candidate Type
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="LEARNER"
                      checked={recipientType === "LEARNER"}
                      onChange={() => {
                        setRecipientType("LEARNER");
                        setSelectedGroupId("");
                        setSelectedCandTypeId("");
                        if (!selectedLearnerId && learners.length > 0) setSelectedLearnerId(String(learners[0].id));
                      }}
                    />
                    Individual Learner
                  </label>
                </div>
              </div>

              {recipientType === "GROUP" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="assignGroup">Select Learner Group *</label>
                  <select
                    id="assignGroup"
                    className="form-input"
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Learner Group --</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.code}){g.candidate_type_name ? ` • Type: ${g.candidate_type_name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {recipientType === "CANDIDATE_TYPE" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="assignCandType">Select Candidate Type *</label>
                  <select
                    id="assignCandType"
                    className="form-input"
                    value={selectedCandTypeId}
                    onChange={(e) => setSelectedCandTypeId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Candidate Type --</option>
                    {candidateTypes.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name} ({ct.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {recipientType === "LEARNER" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="assignLearner">Select Individual Learner *</label>
                  <select
                    id="assignLearner"
                    className="form-input"
                    value={selectedLearnerId}
                    onChange={(e) => setSelectedLearnerId(e.target.value)}
                    required
                    disabled={learnersLoading}
                  >
                    <option value="">-- Choose Learner --</option>
                    {learners
                      .filter((l) => l.is_active !== false)
                      .map((l) => {
                        const nameDisplay = [l.first_name, l.last_name].filter(Boolean).join(" ");
                        return (
                          <option key={l.id} value={l.id}>
                            @{l.username} {nameDisplay ? `(${nameDisplay})` : ""} {l.email ? `• ${l.email}` : ""}
                          </option>
                        );
                      })}
                  </select>
                  {learners.length === 0 && !learnersLoading && (
                    <small style={{ color: "var(--status-warning, #f59e0b)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                      No active learners found in the system.
                    </small>
                  )}
                </div>
              )}

              {/* Step 3: Optional Due Date */}
              <div className="form-group" style={{ marginTop: "16px" }}>
                <label className="form-label" htmlFor="assignDueDate">Completion Due Date (Optional)</label>
                <input
                  id="assignDueDate"
                  type="date"
                  className="form-input"
                  value={assignmentDueDate}
                  onChange={(e) => setAssignmentDueDate(e.target.value)}
                />
                <small style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "4px", display: "block" }}>
                  Optional deadline for this assignment.
                </small>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateTrainingModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    submitting ||
                    (targetType === "COURSE" && !selectedCourseId) ||
                    (targetType === "LEVEL" && !selectedLevelId) ||
                    (targetType === "MODULE" && !selectedModuleId) ||
                    (recipientType === "GROUP" && !selectedGroupId) ||
                    (recipientType === "CANDIDATE_TYPE" && !selectedCandTypeId) ||
                    (recipientType === "LEARNER" && !selectedLearnerId)
                  }
                >
                  {submitting ? "Assigning..." : "Assign Content"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Group Learner Details Modal */}
      {selectedGroupForDetails && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="group-learners-modal-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedGroupForDetails(null);
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "800px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <div>
                <h3 id="group-learners-modal-title" style={{ margin: 0, fontSize: "17px", fontWeight: "600", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>{selectedGroupForDetails.name}</span>
                  <span className="badge badge-purple">
                    {(() => {
                      const groupMembers = memberships.filter((m) => m.group === selectedGroupForDetails.id && m.is_active !== false);
                      return `${groupMembers.length} ${groupMembers.length === 1 ? "Learner" : "Learners"}`;
                    })()}
                  </span>
                </h3>
                <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>
                  Code: <code>{selectedGroupForDetails.code}</code> &bull; Candidate Type: <strong>{selectedGroupForDetails.candidate_type_name || "—"}</strong>
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedGroupForDetails(null)}
                style={{ padding: "6px 12px", fontSize: "16px", lineHeight: 1 }}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {(() => {
                // Find all active memberships for this group
                const groupMembers = memberships.filter((m) => m.group === selectedGroupForDetails.id && m.is_active !== false);

                // Dedup learners by learner ID
                const seenLearnerIds = new Set();
                const uniqueGroupLearners = [];

                groupMembers.forEach((m) => {
                  if (seenLearnerIds.has(m.learner)) return;
                  seenLearnerIds.add(m.learner);

                  const learnerObj = learners.find((l) => l.id === m.learner);
                  const fullName = learnerObj
                    ? [learnerObj.first_name, learnerObj.last_name].filter(Boolean).join(" ")
                    : "";
                  const displayName = fullName || learnerObj?.username || m.learner_username || `Learner #${m.learner}`;
                  const email = learnerObj?.email || "—";
                  const candidateType = selectedGroupForDetails.candidate_type_name || "—";
                  const isActive = learnerObj?.is_active ?? m.is_active ?? true;

                  uniqueGroupLearners.push({
                    id: m.learner,
                    displayName,
                    username: learnerObj?.username || m.learner_username,
                    email,
                    candidateType,
                    isActive,
                    joinedAt: m.joined_at,
                  });
                });

                if (uniqueGroupLearners.length === 0) {
                  return (
                    <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-secondary)" }}>
                      <p style={{ margin: 0, fontSize: "14px" }}>
                        No learners are currently assigned to this group.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: "60px" }}>S.No.</th>
                          <th>Learner Name</th>
                          <th>Email Address</th>
                          <th>Candidate Type</th>
                          <th>Account Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueGroupLearners.map((lrn, index) => (
                          <tr key={lrn.id}>
                            <td style={{ color: "var(--text-secondary)" }}>{index + 1}</td>
                            <td>
                              <strong style={{ color: "var(--text-main)" }}>{lrn.displayName}</strong>
                              {lrn.username && lrn.username !== lrn.displayName && (
                                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  @{lrn.username}
                                </div>
                              )}
                            </td>
                            <td style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                              {lrn.email}
                            </td>
                            <td>
                              <span className="badge badge-info">{lrn.candidateType}</span>
                            </td>
                            <td>
                              <span className={`badge ${lrn.isActive ? "badge-success" : "badge-warning"}`}>
                                {lrn.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "flex-end",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedGroupForDetails(null)}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate Type Learner Details Modal */}
      {selectedCandTypeForDetails && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cand-type-learners-modal-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCandTypeForDetails(null);
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "800px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
              border: "1px solid var(--border-color)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <div>
                <h3 id="cand-type-learners-modal-title" style={{ margin: 0, fontSize: "17px", fontWeight: "600", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>{selectedCandTypeForDetails.name}</span>
                  <span className="badge badge-purple">
                    {(() => {
                      // Match groups belonging to this candidate type
                      const matchingGroupIds = new Set(
                        groups
                          .filter((g) => g.candidate_type === selectedCandTypeForDetails.id)
                          .map((g) => g.id)
                      );
                      const matchingLearnerIds = new Set(
                        memberships
                          .filter((m) => matchingGroupIds.has(m.group) && m.is_active !== false)
                          .map((m) => m.learner)
                      );
                      return `${matchingLearnerIds.size} ${matchingLearnerIds.size === 1 ? "Learner" : "Learners"}`;
                    })()}
                  </span>
                </h3>
                <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: "13px" }}>
                  Code: <code>{selectedCandTypeForDetails.code}</code>
                  {selectedCandTypeForDetails.description ? ` • ${selectedCandTypeForDetails.description}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedCandTypeForDetails(null)}
                style={{ padding: "6px 12px", fontSize: "16px", lineHeight: 1 }}
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {(() => {
                // Find all groups linked to this candidate type
                const matchingGroups = groups.filter((g) => g.candidate_type === selectedCandTypeForDetails.id);
                const matchingGroupIds = new Set(matchingGroups.map((g) => g.id));
                const groupNameMap = new Map(matchingGroups.map((g) => [g.id, g.name]));

                // Find active memberships for those groups
                const matchingMembers = memberships.filter(
                  (m) => matchingGroupIds.has(m.group) && m.is_active !== false
                );

                // Map learner ID to their assigned groups (prevent duplicate rows for a learner)
                const learnerGroupMap = new Map();
                matchingMembers.forEach((m) => {
                  const gName = groupNameMap.get(m.group) || m.group_name || `Group #${m.group}`;
                  if (!learnerGroupMap.has(m.learner)) {
                    learnerGroupMap.set(m.learner, new Set());
                  }
                  learnerGroupMap.get(m.learner).add(gName);
                });

                const uniqueLearners = [];
                learnerGroupMap.forEach((groupSet, learnerId) => {
                  const learnerObj = learners.find((l) => l.id === learnerId);
                  const fullName = learnerObj
                    ? [learnerObj.first_name, learnerObj.last_name].filter(Boolean).join(" ")
                    : "";
                  const displayName = fullName || learnerObj?.username || `Learner #${learnerId}`;
                  const email = learnerObj?.email || "—";
                  const assignedGroups = Array.from(groupSet).join(", ") || "—";
                  const isActive = learnerObj?.is_active ?? true;

                  uniqueLearners.push({
                    id: learnerId,
                    displayName,
                    username: learnerObj?.username,
                    email,
                    assignedGroups,
                    isActive,
                  });
                });

                if (uniqueLearners.length === 0) {
                  return (
                    <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-secondary)" }}>
                      <p style={{ margin: 0, fontSize: "14px" }}>
                        No learners are currently assigned to this candidate type.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: "60px" }}>S.No.</th>
                          <th>Learner Name</th>
                          <th>Email Address</th>
                          <th>Assigned Group</th>
                          <th>Account Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueLearners.map((lrn, index) => (
                          <tr key={lrn.id}>
                            <td style={{ color: "var(--text-secondary)" }}>{index + 1}</td>
                            <td>
                              <strong style={{ color: "var(--text-main)" }}>{lrn.displayName}</strong>
                              {lrn.username && lrn.username !== lrn.displayName && (
                                <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  @{lrn.username}
                                </div>
                              )}
                            </td>
                            <td style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                              {lrn.email}
                            </td>
                            <td>
                              <span className="badge badge-purple">{lrn.assignedGroups}</span>
                            </td>
                            <td>
                              <span className={`badge ${lrn.isActive ? "badge-success" : "badge-warning"}`}>
                                {lrn.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "flex-end",
                backgroundColor: "var(--bg-card)",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedCandTypeForDetails(null)}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
