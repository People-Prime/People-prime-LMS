import { useState, useEffect } from "react";
import { apiClient } from "../../../services/api";

/**
 * AIQuestionGeneratorModal
 *
 * Admin workflow:
 * 1. Load materials mapped to module and submodules via GET /api/admin/ai-question-generator/materials/?module_id=<ID>.
 * 2. Select eligible documents (clearly marks ineligible/rubric materials as disabled).
 * 3. Choose question count (1 to 20, default 5).
 * 4. Generate draft MCQs via POST /api/admin/ai-question-generator/generate/.
 * 5. Review, edit question text, edit 4 options, toggle correct option, reject/remove question.
 * 6. Save only approved questions via POST /api/admin/ai-question-generator/approve/.
 *
 * Maintains draft state entirely in frontend memory until explicitly saved.
 */
export default function AIQuestionGeneratorModal({
  isOpen,
  onClose,
  module,
  onQuestionsSaved,
}) {
  // Step 1: Material Selection & Config
  // Step 2: Review & Edit Generated Draft Questions
  const [step, setStep] = useState("select"); // 'select' | 'review'

  // Loading & Feedback States
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // Materials & Configuration
  const [materials, setMaterials] = useState([]);
  const [selectedMappingIds, setSelectedMappingIds] = useState([]);
  const [questionCount, setQuestionCount] = useState(5);

  // Review Questions State (Drafts held in memory)
  const [generatedQuestions, setGeneratedQuestions] = useState([]);
  const [sourceDocuments, setSourceDocuments] = useState([]);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen && module?.id) {
      setStep("select");
      setError(null);
      setSuccessMessage("");
      setGeneratedQuestions([]);
      setSourceDocuments([]);
      setQuestionCount(5);
      fetchModuleMaterials(module.id);
    }
  }, [isOpen, module?.id]);

  const fetchModuleMaterials = async (moduleId) => {
    setLoadingMaterials(true);
    setError(null);
    try {
      const data = await apiClient(`/admin/ai-question-generator/materials/?module_id=${moduleId}`);
      const mats = data.materials || [];
      setMaterials(mats);
      // Auto-select eligible documents by default for smooth UX
      const eligibleIds = mats.filter((m) => m.is_eligible).map((m) => m.mapping_id);
      setSelectedMappingIds(eligibleIds);
    } catch (err) {
      setError(err.message || "Failed to load training materials for this module.");
    } finally {
      setLoadingMaterials(false);
    }
  };

  const handleToggleMapping = (mappingId, isEligible) => {
    if (!isEligible) return;
    setSelectedMappingIds((prev) =>
      prev.includes(mappingId) ? prev.filter((id) => id !== mappingId) : [...prev, mappingId]
    );
  };

  const handleSelectAllEligible = () => {
    const eligibleIds = materials.filter((m) => m.is_eligible).map((m) => m.mapping_id);
    setSelectedMappingIds(eligibleIds);
  };

  const handleDeselectAll = () => {
    setSelectedMappingIds([]);
  };

  const handleGenerateQuestions = async () => {
    if (!module?.id) return;
    if (selectedMappingIds.length === 0) {
      setError("Please select at least one eligible training document.");
      return;
    }
    const count = parseInt(questionCount, 10);
    if (isNaN(count) || count < 1 || count > 20) {
      setError("Question count must be between 1 and 20.");
      return;
    }

    setGenerating(true);
    setError(null);
    setSuccessMessage("");

    try {
      const response = await apiClient("/admin/ai-question-generator/generate/", {
        method: "POST",
        body: {
          module_id: module.id,
          mapping_ids: selectedMappingIds,
          question_count: count,
        },
      });

      // Prepare questions with a frontend approval toggle (default true for review)
      const initialReviewQuestions = (response.questions || []).map((q, idx) => ({
        temp_id: `draft_${Date.now()}_${idx}`,
        is_approved: true,
        question_text: q.question_text || "",
        question_type: "MULTIPLE_CHOICE",
        options: (q.options || []).map((opt, optIdx) => ({
          id: opt.id || `opt_${optIdx + 1}`,
          text: opt.text || "",
          is_correct: !!opt.is_correct,
        })),
      }));

      setGeneratedQuestions(initialReviewQuestions);
      setSourceDocuments(response.source_documents || []);
      setStep("review");
      setSuccessMessage(
        `Generated ${initialReviewQuestions.length} multiple-choice questions from ${response.source_documents?.length || 0} document(s). Please review and approve before saving.`
      );
    } catch (err) {
      setError(err.message || "Failed to generate questions using Gemini AI.");
    } finally {
      setGenerating(false);
    }
  };

  // Editing handlers in Review Step
  const handleUpdateQuestionText = (index, newText) => {
    setGeneratedQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], question_text: newText };
      return updated;
    });
  };

  const handleUpdateOptionText = (qIndex, optIndex, newText) => {
    setGeneratedQuestions((prev) => {
      const updated = [...prev];
      const updatedOptions = [...updated[qIndex].options];
      updatedOptions[optIndex] = { ...updatedOptions[optIndex], text: newText };
      updated[qIndex] = { ...updated[qIndex], options: updatedOptions };
      return updated;
    });
  };

  const handleSetCorrectOption = (qIndex, optIndex) => {
    setGeneratedQuestions((prev) => {
      const updated = [...prev];
      const updatedOptions = updated[qIndex].options.map((opt, idx) => ({
        ...opt,
        is_correct: idx === optIndex,
      }));
      updated[qIndex] = { ...updated[qIndex], options: updatedOptions };
      return updated;
    });
  };

  const handleToggleApprove = (index) => {
    setGeneratedQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], is_approved: !updated[index].is_approved };
      return updated;
    });
  };

  const handleRejectQuestion = (index) => {
    setGeneratedQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Validation before saving
  const validateApprovedQuestions = () => {
    const approved = generatedQuestions.filter((q) => q.is_approved);
    if (approved.length === 0) {
      return { valid: false, error: "No questions are approved. Please approve at least one question to save." };
    }

    for (let i = 0; i < approved.length; i++) {
      const q = approved[i];
      if (!q.question_text.trim() || q.question_text.trim().length < 5) {
        return { valid: false, error: `Question #${i + 1} has empty or insufficiently detailed question text.` };
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return { valid: false, error: `Question #${i + 1} must contain exactly 4 options.` };
      }

      const optTexts = new Set();
      let correctCount = 0;

      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        const trimmed = opt.text.trim();
        if (!trimmed) {
          return { valid: false, error: `Question #${i + 1}, Option #${j + 1} cannot be empty.` };
        }
        const lower = trimmed.toLowerCase();
        if (optTexts.has(lower)) {
          return { valid: false, error: `Question #${i + 1} has duplicate option text: "${trimmed}".` };
        }
        optTexts.add(lower);

        if (opt.is_correct) correctCount += 1;
      }

      if (correctCount !== 1) {
        return { valid: false, error: `Question #${i + 1} must have exactly one correct answer selected.` };
      }
    }

    return { valid: true, approved };
  };

  const handleSaveApprovedQuestions = async () => {
    const { valid, error: validationError, approved } = validateApprovedQuestions();
    if (!valid) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage("");

    try {
      const payload = {
        module_id: module.id,
        questions: approved.map((q) => ({
          question_text: q.question_text.trim(),
          question_type: "MULTIPLE_CHOICE",
          options: q.options.map((opt, i) => ({
            id: `opt_${i + 1}`,
            text: opt.text.trim(),
            is_correct: opt.is_correct,
          })),
        })),
      };

      const result = await apiClient("/admin/ai-question-generator/approve/", {
        method: "POST",
        body: payload,
      });

      setSuccessMessage(result.message || `Successfully saved ${approved.length} approved questions.`);
      if (onQuestionsSaved) {
        await onQuestionsSaved(module.id);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || "Failed to save approved questions.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const eligibleCount = materials.filter((m) => m.is_eligible).length;
  const approvedCount = generatedQuestions.filter((q) => q.is_approved).length;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !generating && !saving) onClose();
      }}
    >
      <div
        className="modal-dialog"
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "920px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          border: "1px solid var(--border-color)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "var(--bg-secondary, #f8fafc)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px" }}>✨</span>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "var(--text-primary)" }}>
                AI Question Generator (Gemini 3.5 Flash)
              </h3>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
              Module: <strong>{module?.name}</strong> &bull; Step {step === "select" ? "1: Select Materials & Configure" : "2: Review & Approve Questions"}
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={generating || saving}
            style={{ padding: "4px 8px", fontSize: "14px", lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="alert alert-danger" style={{ margin: "12px 20px 0 20px", fontSize: "12px" }}>
            {error}
          </div>
        )}
        {successMessage && (
          <div className="alert alert-success" style={{ margin: "12px 20px 0 20px", fontSize: "12px" }}>
            {successMessage}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {step === "select" ? (
            <div>
              {/* Material Selection Description */}
              <div style={{ marginBottom: "16px" }}>
                <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "var(--text-primary)" }}>
                  Select the instructional materials to ground the AI question generation. Gemini will extract content directly from the selected documents.
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Eligible: Primary Instructional &amp; Supplementary Reference (DOCX, PDF, PPTX, TXT)
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSelectAllEligible}
                      disabled={loadingMaterials || eligibleCount === 0}
                      style={{ padding: "2px 8px", fontSize: "11px" }}
                    >
                      Select All Eligible ({eligibleCount})
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleDeselectAll}
                      disabled={loadingMaterials || selectedMappingIds.length === 0}
                      style={{ padding: "2px 8px", fontSize: "11px" }}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
              </div>

              {/* Materials Table */}
              {loadingMaterials ? (
                <div style={{ textAlign: "center", padding: "30px 0" }}>
                  <div className="spinner" style={{ margin: "0 auto 10px" }}></div>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Loading mapped materials...</p>
                </div>
              ) : materials.length === 0 ? (
                <div className="alert alert-warning" style={{ fontSize: "12px" }}>
                  No training materials are currently mapped to this module or its submodules. Please attach training documents first to use the AI generator.
                </div>
              ) : (
                <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "6px", maxHeight: "280px", overflowY: "auto" }}>
                  <table className="data-table" style={{ margin: 0, fontSize: "12px" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "40px", textAlign: "center" }}>Select</th>
                        <th>File Name</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Location</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((mat) => {
                        const isSelected = selectedMappingIds.includes(mat.mapping_id);
                        return (
                          <tr
                            key={mat.mapping_id}
                            style={{
                              backgroundColor: !mat.is_eligible
                                ? "rgba(241, 245, 249, 0.5)"
                                : isSelected
                                ? "rgba(59, 130, 246, 0.05)"
                                : "inherit",
                              opacity: !mat.is_eligible ? 0.7 : 1,
                            }}
                          >
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!mat.is_eligible}
                                onChange={() => handleToggleMapping(mat.mapping_id, mat.is_eligible)}
                                title={!mat.is_eligible ? "Ineligible category for question generation" : "Select document"}
                              />
                            </td>
                            <td>
                              <strong>{mat.filename}</strong>
                            </td>
                            <td>
                              <span className="badge badge-purple" style={{ fontSize: "10px" }}>
                                {mat.category}
                              </span>
                            </td>
                            <td>
                              <code>{mat.file_type}</code>
                            </td>
                            <td>
                              <span style={{ color: "var(--text-secondary)" }}>
                                {mat.submodule_name ? `Lesson: ${mat.submodule_name}` : "Module Level"}
                              </span>
                            </td>
                            <td>
                              {mat.is_eligible ? (
                                <span className="badge badge-success" style={{ fontSize: "10px" }}>
                                  Eligible
                                </span>
                              ) : (
                                <span className="badge badge-warning" style={{ fontSize: "10px" }} title="Rubrics and non-instructional materials are excluded">
                                  Ineligible Category
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Question Count Selector */}
              <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label htmlFor="ai-question-count" style={{ fontSize: "13px", fontWeight: "600", margin: 0 }}>
                    Question Count:
                  </label>
                  <input
                    id="ai-question-count"
                    type="number"
                    min="1"
                    max="20"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(e.target.value)}
                    style={{ width: "70px", padding: "6px 8px", fontSize: "13px", borderRadius: "4px", border: "1px solid var(--border-color)" }}
                  />
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>(1 &ndash; 20 questions)</span>
                </div>

                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Selected: <strong>{selectedMappingIds.length}</strong> eligible document(s)
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Step 2: Question Review Interface */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h4 style={{ margin: "0 0 2px 0", fontSize: "14px", fontWeight: "600" }}>
                    Review Generated Questions ({approvedCount} of {generatedQuestions.length} Approved)
                  </h4>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    Edit question prompts, modify option texts, or change correct answers. Rejected questions will not be saved.
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setGeneratedQuestions((prev) => prev.map((q) => ({ ...q, is_approved: true })))}
                    style={{ fontSize: "11px", padding: "4px 8px" }}
                  >
                    Approve All
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setGeneratedQuestions((prev) => prev.map((q) => ({ ...q, is_approved: false })))}
                    style={{ fontSize: "11px", padding: "4px 8px" }}
                  >
                    Unapprove All
                  </button>
                </div>
              </div>

              {generatedQuestions.length === 0 ? (
                <div className="alert alert-warning" style={{ fontSize: "12px" }}>
                  All questions have been rejected. You can return to Step 1 to generate a new set of questions.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {generatedQuestions.map((q, qIdx) => (
                    <div
                      key={q.temp_id}
                      className="card"
                      style={{
                        padding: "16px",
                        border: q.is_approved ? "1px solid #3b82f6" : "1px solid var(--border-color)",
                        backgroundColor: q.is_approved ? "rgba(59, 130, 246, 0.02)" : "#f8fafc",
                        borderRadius: "6px",
                      }}
                    >
                      {/* Card Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="badge badge-primary" style={{ fontSize: "11px" }}>
                            Question #{qIdx + 1}
                          </span>
                          <span className="badge badge-purple" style={{ fontSize: "10px" }}>
                            MCQ (Single Choice)
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className={`btn ${q.is_approved ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => handleToggleApprove(qIdx)}
                            style={{ fontSize: "11px", padding: "3px 8px" }}
                          >
                            {q.is_approved ? "✓ Approved" : "Mark Approved"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleRejectQuestion(qIdx)}
                            style={{ fontSize: "11px", padding: "3px 8px", color: "var(--status-error, #ef4444)" }}
                            title="Remove this question"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>

                      {/* Question Text Field */}
                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                          Question Prompt:
                        </label>
                        <textarea
                          rows={2}
                          value={q.question_text}
                          onChange={(e) => handleUpdateQuestionText(qIdx, e.target.value)}
                          placeholder="Enter question text..."
                          style={{
                            width: "100%",
                            padding: "8px",
                            fontSize: "13px",
                            borderRadius: "4px",
                            border: "1px solid var(--border-color)",
                            fontFamily: "inherit",
                          }}
                        />
                      </div>

                      {/* Four Options with Radio Select */}
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "6px" }}>
                          Answer Options (Select the single correct answer):
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {q.options.map((opt, optIdx) => (
                            <div
                              key={opt.id || optIdx}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px 10px",
                                border: opt.is_correct ? "1px solid #10b981" : "1px solid var(--border-color)",
                                borderRadius: "4px",
                                backgroundColor: opt.is_correct ? "rgba(16, 185, 129, 0.05)" : "#fff",
                              }}
                            >
                              <input
                                type="radio"
                                name={`correct_option_${q.temp_id}`}
                                checked={opt.is_correct}
                                onChange={() => handleSetCorrectOption(qIdx, optIdx)}
                                title="Mark as correct answer"
                              />
                              <span style={{ fontSize: "11px", fontWeight: "bold", minWidth: "16px", color: "var(--text-secondary)" }}>
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              <input
                                type="text"
                                value={opt.text}
                                onChange={(e) => handleUpdateOptionText(qIdx, optIdx, e.target.value)}
                                placeholder={`Option ${optIdx + 1}...`}
                                style={{
                                  flex: 1,
                                  padding: "4px 6px",
                                  fontSize: "12px",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "3px",
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "var(--bg-secondary, #f8fafc)",
          }}
        >
          {step === "select" ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={generating}
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateQuestions}
                disabled={generating || selectedMappingIds.length === 0}
                style={{ fontSize: "12px", padding: "6px 16px" }}
              >
                {generating ? "Generating with Gemini..." : `Generate ${questionCount} Questions →`}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep("select")}
                disabled={saving}
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                &larr; Back to Selection
              </button>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={saving}
                  style={{ fontSize: "12px", padding: "6px 14px" }}
                >
                  Discard Drafts
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveApprovedQuestions}
                  disabled={saving || approvedCount === 0}
                  style={{ fontSize: "12px", padding: "6px 16px" }}
                >
                  {saving ? "Saving to Module..." : `Save ${approvedCount} Approved Question(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
