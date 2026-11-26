"""
API endpoints for Admin AI Question Generator.

GET  /api/admin/ai-question-generator/materials/?module_id=<ID>
POST /api/admin/ai-question-generator/generate/

Requires authentication and LMS Admin role (IsLMSAdmin).
Never creates or modifies database records for ModuleQuestion, attempts, or progress.
Returns draft JSON only for review and approval in subsequent phases.
"""

import logging
import os
from django.conf import settings
from django.db import transaction
from django.db.models import Max, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Module, ModuleQuestion, QuestionType, TrainingFileMapping, AuditAction
from core.permissions import IsLMSAdmin
from core.serializers import ModuleQuestionSerializer
from core.api_views import _log_audit
from core.ai_question_generator import (
    extract_text_from_file_stream,
    build_gemini_generation_prompt,
    call_gemini_api,
    call_groq_api,
    validate_and_sanitize_generated_questions,
    ExtractionError,
    GenerationValidationError,
    ContextLimitExceededError,
    MAX_TOTAL_EXTRACTED_CHARS,
    ELIGIBLE_DOCUMENT_CATEGORIES,
)

logger = logging.getLogger(__name__)


class AdminAIQuestionMaterialsView(APIView):
    """
    Lookup endpoint that retrieves all distinct training materials mapped
    directly to the selected module or to its submodules.
    Marks whether each material is eligible for AI question generation based on category.
    Endpoint: GET /api/admin/ai-question-generator/materials/?module_id=<ID>
    """
    permission_classes = [IsAuthenticated, IsLMSAdmin]

    def get(self, request, *args, **kwargs):
        module_id = request.query_params.get("module_id")
        if not module_id:
            return Response(
                {"error": "Query parameter 'module_id' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            module = Module.objects.select_related("course", "level").get(id=module_id)
        except (Module.DoesNotExist, ValueError):
            return Response(
                {"error": f"Module with ID '{module_id}' was not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Retrieve mappings associated directly with this module OR its submodules
        mappings = (
            TrainingFileMapping.objects.filter(
                Q(module=module) | Q(submodule__module=module)
            )
            .select_related("training_file", "submodule")
            .order_by("submodule__order", "id")
        )

        materials = []
        seen_file_ids = set()

        for mapping in mappings:
            tf = mapping.training_file
            if not tf:
                continue

            # Deduplicate the same physical file if mapped multiple times across submodules
            if tf.id in seen_file_ids:
                continue
            seen_file_ids.add(tf.id)

            is_eligible = mapping.category in ELIGIBLE_DOCUMENT_CATEGORIES

            materials.append({
                "mapping_id": mapping.id,
                "training_file_id": tf.id,
                "filename": tf.filename,
                "relative_path": getattr(tf.file, "name", tf.filename) if tf.file else tf.filename,
                "file_type": tf.file_type or os.path.splitext(tf.filename)[1].replace(".", "").upper(),
                "file_size": tf.file_size,
                "category": mapping.category,
                "is_eligible": is_eligible,
                "submodule_id": mapping.submodule.id if mapping.submodule else None,
                "submodule_name": mapping.submodule.name if mapping.submodule else None,
            })

        return Response(
            {
                "module_id": module.id,
                "module_name": module.name,
                "course_name": module.course.name if module.course else None,
                "total_materials": len(materials),
                "materials": materials,
            },
            status=status.HTTP_200_OK,
        )


class AdminAIGenerateQuestionsView(APIView):
    """
    Endpoint that extracts text from selected module training materials and generates
    draft Multiple Choice Questions using Gemini.
    Endpoint: POST /api/admin/ai-question-generator/generate/

    Input payload:
    {
      "module_id": 12,
      "mapping_ids": [15, 16],
      "question_count": 5
    }
    """
    permission_classes = [IsAuthenticated, IsLMSAdmin]

    def post(self, request, *args, **kwargs):
        # 1. Basic payload validations
        data = request.data or {}
        module_id = data.get("module_id")
        raw_mapping_ids = data.get("mapping_ids")
        question_count_raw = data.get("question_count")

        if not module_id:
            return Response(
                {"error": "Field 'module_id' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            module = Module.objects.select_related("course").get(id=module_id)
        except (Module.DoesNotExist, ValueError):
            return Response(
                {"error": f"Module with ID '{module_id}' was not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Validate mapping_ids as a non-empty list of unique integers
        if not raw_mapping_ids or not isinstance(raw_mapping_ids, list):
            return Response(
                {"error": "Field 'mapping_ids' must be a non-empty list of mapping IDs."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mapping_ids = []
        for m_id in raw_mapping_ids:
            if not isinstance(m_id, int) or isinstance(m_id, bool):
                return Response(
                    {"error": f"Invalid mapping ID '{m_id}'. All mapping IDs must be positive integers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if m_id <= 0:
                return Response(
                    {"error": f"Invalid mapping ID '{m_id}'. Mapping IDs must be positive integers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if m_id not in mapping_ids:
                mapping_ids.append(m_id)

        # Validate question_count strictly between 1 and 20
        if question_count_raw is None or isinstance(question_count_raw, bool):
            return Response(
                {"error": "Field 'question_count' must be an integer between 1 and 20."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            question_count = int(question_count_raw)
            if question_count < 1 or question_count > 20:
                raise ValueError()
        except (TypeError, ValueError):
            return Response(
                {"error": "Field 'question_count' must be an integer between 1 and 20."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Check AI Provider and API environment configuration
        raw_provider = os.getenv("AI_PROVIDER") or getattr(settings, "AI_PROVIDER", "gemini")
        provider = (raw_provider or "gemini").strip().lower()

        if provider not in ("gemini", "groq"):
            return Response(
                {"error": f"Unsupported AI provider '{provider}'. Supported providers: gemini, groq."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if provider == "groq":
            api_key = os.getenv("GROQ_API_KEY") or getattr(settings, "GROQ_API_KEY", None)
            model_name = os.getenv("GROQ_TEXT_MODEL") or getattr(settings, "GROQ_TEXT_MODEL", "openai/gpt-oss-120b")
            if not api_key:
                return Response(
                    {"error": "Groq API key is not configured in the environment settings (GROQ_API_KEY)."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        else:
            api_key = os.getenv("GEMINI_API_KEY") or getattr(settings, "GEMINI_API_KEY", None)
            model_name = os.getenv("GEMINI_TEXT_MODEL") or getattr(settings, "GEMINI_TEXT_MODEL", "gemini-3.5-flash")
            if not api_key:
                return Response(
                    {"error": "Gemini API key is not configured in the environment settings (GEMINI_API_KEY)."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # 3. Retrieve and validate selected training file mappings
        allowed_mappings = list(
            TrainingFileMapping.objects.filter(
                Q(module=module) | Q(submodule__module=module),
                id__in=mapping_ids,
            )
            .select_related("training_file")
        )

        found_mapping_ids = {m.id for m in allowed_mappings}
        invalid_ids = [m_id for m_id in mapping_ids if m_id not in found_mapping_ids]
        if invalid_ids:
            return Response(
                {
                    "error": f"The following mapping IDs do not belong to module '{module.name}' or its submodules: {invalid_ids}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not allowed_mappings:
            return Response(
                {"error": "No usable training materials found for the selected mapping IDs."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Category check: Reject mappings that are not PRIMARY_INSTRUCTIONAL or SUPPLEMENTARY_REFERENCE
        ineligible_mappings = [m for m in allowed_mappings if m.category not in ELIGIBLE_DOCUMENT_CATEGORIES]
        if ineligible_mappings:
            ineligible_desc = [f"ID {m.id} ({m.category})" for m in ineligible_mappings]
            return Response(
                {
                    "error": (
                        f"Only primary instructional and supplementary reference materials can be used for question generation. "
                        f"Ineligible materials selected: {', '.join(ineligible_desc)}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Extract text from selected documents with context limit tracking
        extracted_sections = []
        processed_files = []
        total_extracted_len = 0

        for mapping in allowed_mappings:
            tf = mapping.training_file
            if not tf or not tf.file:
                return Response(
                    {"error": f"Mapping ID {mapping.id} is missing an attached training file."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                with tf.file.open("rb") as f_stream:
                    doc_text = extract_text_from_file_stream(
                        f_stream,
                        filename=tf.filename,
                        file_type=tf.file_type,
                    )
            except ExtractionError as e:
                return Response(
                    {"error": str(e), "filename": tf.filename},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            except Exception as e:
                logger.error("Failed opening/extracting file %s: %s", tf.filename, e)
                return Response(
                    {"error": f"Failed reading document '{tf.filename}'."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Enforce overall context limits without silently reading or appending runaway text
            if total_extracted_len + len(doc_text) > MAX_TOTAL_EXTRACTED_CHARS:
                # If first document itself exceeds limit or total exceeds supported context
                available_space = MAX_TOTAL_EXTRACTED_CHARS - total_extracted_len
                if available_space < 500:
                    return Response(
                        {
                            "error": (
                                f"The selected documents exceed the maximum supported context size of "
                                f"{MAX_TOTAL_EXTRACTED_CHARS} characters (~30,000 tokens). Please select fewer documents."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                # Truncate remaining document within limit and stop reading further documents
                doc_text = doc_text[:available_space]
                header = f"=== DOCUMENT: {tf.filename} (truncated) ==="
                extracted_sections.append(f"{header}\n{doc_text}")
                total_extracted_len += len(doc_text)
                processed_files.append({
                    "training_file_id": tf.id,
                    "filename": tf.filename,
                    "chars_extracted": len(doc_text),
                })
                break

            header = f"=== DOCUMENT: {tf.filename} ==="
            extracted_sections.append(f"{header}\n{doc_text}")
            total_extracted_len += len(doc_text)
            processed_files.append({
                "training_file_id": tf.id,
                "filename": tf.filename,
                "chars_extracted": len(doc_text),
            })

        combined_content = "\n\n".join(extracted_sections)

        # 5. Fetch existing active module questions for duplicate suppression
        existing_questions = list(
            ModuleQuestion.objects.filter(module=module, is_active=True).values_list("question_text", flat=True)
        )

        # 6. Build prompt and invoke selected AI provider
        prompt = build_gemini_generation_prompt(
            module_title=module.name,
            combined_content=combined_content,
            question_count=question_count,
            existing_questions=existing_questions,
        )

        try:
            if provider == "groq":
                raw_ai_response = call_groq_api(
                    api_key=api_key,
                    model_name=model_name,
                    prompt=prompt,
                    timeout_seconds=45,
                )
            else:
                raw_ai_response = call_gemini_api(
                    api_key=api_key,
                    model_name=model_name,
                    prompt=prompt,
                    timeout_seconds=45,
                    max_retries=2,
                )
        except Exception as e:
            logger.error("%s question generation error for module %s: %s", provider.capitalize(), module.id, e)
            return Response(
                {"error": "AI question generation service was temporarily unavailable. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # 7. Validate and sanitize generated questions
        try:
            validated_questions = validate_and_sanitize_generated_questions(
                raw_response_text=raw_ai_response,
                expected_count=question_count,
                existing_question_texts=existing_questions,
            )
        except GenerationValidationError as e:
            logger.warning("Generated AI output failed validation for module %s: %s", module.id, e)
            return Response(
                {"error": f"AI output validation failed: {str(e)}"},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # 8. Return draft response only (NO database insertion)
        return Response(
            {
                "module_id": module.id,
                "module_name": module.name,
                "requested_count": question_count,
                "generated_count": len(validated_questions),
                "source_documents": processed_files,
                "questions": validated_questions,
            },
            status=status.HTTP_200_OK,
        )


class AdminAIApproveQuestionsView(APIView):
    """
    Endpoint to atomically save Admin-approved Multiple Choice Questions
    into the existing ModuleQuestion model.
    Endpoint: POST /api/admin/ai-question-generator/approve/

    Input payload:
    {
      "module_id": 12,
      "questions": [
        {
          "question_text": "What is ...?",
          "question_type": "MULTIPLE_CHOICE",
          "options": [
            {"id": "opt_1", "text": "...", "is_correct": true},
            {"id": "opt_2", "text": "...", "is_correct": false},
            {"id": "opt_3", "text": "...", "is_correct": false},
            {"id": "opt_4", "text": "...", "is_correct": false}
          ]
        }
      ]
    }
    """
    permission_classes = [IsAuthenticated, IsLMSAdmin]

    def post(self, request, *args, **kwargs):
        data = request.data or {}
        module_id = data.get("module_id")
        questions_payload = data.get("questions")

        if not module_id:
            return Response(
                {"error": "Field 'module_id' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            module = Module.objects.get(id=module_id)
        except (Module.DoesNotExist, ValueError):
            return Response(
                {"error": f"Module with ID '{module_id}' was not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not questions_payload or not isinstance(questions_payload, list):
            return Response(
                {"error": "Field 'questions' must be a non-empty list of approved questions."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Pre-validate and prevent duplicate submissions
        existing_questions = list(
            ModuleQuestion.objects.filter(module=module).values_list("question_text", flat=True)
        )
        existing_norms = {q.strip().lower() for q in existing_questions if q}

        validated_entries = []
        seen_in_payload = set()

        for idx, q_data in enumerate(questions_payload):
            q_num = idx + 1
            if not isinstance(q_data, dict):
                return Response(
                    {"error": f"Question #{q_num} is not a valid object."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            q_text = (q_data.get("question_text") or "").strip()
            if not q_text or len(q_text) < 5:
                return Response(
                    {"error": f"Question #{q_num} must have non-empty 'question_text' of at least 5 characters."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            norm_text = q_text.lower()
            if norm_text in seen_in_payload:
                return Response(
                    {"error": f"Duplicate question text within submission at Question #{q_num}: '{q_text}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if norm_text in existing_norms:
                return Response(
                    {"error": f"Question #{q_num} already exists in this module: '{q_text}'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            seen_in_payload.add(norm_text)

            options = q_data.get("options")
            if not isinstance(options, list) or len(options) != 4:
                return Response(
                    {"error": f"Question #{q_num} must have exactly 4 options."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            sanitized_options = []
            option_texts = set()
            correct_count = 0

            for opt_idx, opt in enumerate(options):
                if not isinstance(opt, dict):
                    return Response(
                        {"error": f"Question #{q_num}, Option #{opt_idx+1} is not a valid object."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                opt_id = opt.get("id") or f"opt_{opt_idx + 1}"
                opt_text = (opt.get("text") or "").strip()
                if not opt_text:
                    return Response(
                        {"error": f"Question #{q_num}, Option #{opt_idx+1} has empty text."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                norm_opt = opt_text.lower()
                if norm_opt in option_texts:
                    return Response(
                        {"error": f"Question #{q_num} has duplicate option text: '{opt_text}'."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                option_texts.add(norm_opt)

                is_correct = bool(opt.get("is_correct"))
                if is_correct:
                    correct_count += 1

                sanitized_options.append({
                    "id": f"opt_{opt_idx + 1}",
                    "text": opt_text,
                    "is_correct": is_correct,
                })

            if correct_count != 1:
                return Response(
                    {"error": f"Question #{q_num} must have exactly one correct option. Found {correct_count}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            validated_entries.append({
                "question_text": q_text,
                "options": sanitized_options,
            })

        # Save atomically
        created_questions = []
        try:
            with transaction.atomic():
                # Determine starting order for the module
                current_max_order = (
                    ModuleQuestion.objects.filter(module=module)
                    .aggregate(max_order=Max("order"))["max_order"]
                    or 0
                )

                for idx, entry in enumerate(validated_entries):
                    next_order = current_max_order + idx + 1
                    mq = ModuleQuestion.objects.create(
                        module=module,
                        question_text=entry["question_text"],
                        question_type=QuestionType.MULTIPLE_CHOICE,
                        options=entry["options"],
                        order=next_order,
                        is_required=True,
                        is_active=True,
                    )
                    created_questions.append(mq)
                    _log_audit(
                        request,
                        AuditAction.CREATE,
                        "ModuleQuestion",
                        mq.pk,
                        {
                            "module": mq.module_id,
                            "order": mq.order,
                            "is_required": mq.is_required,
                            "is_active": mq.is_active,
                            "source": "AI_GENERATOR_ADMIN_APPROVED",
                        },
                    )
        except Exception as e:
            logger.error("Failed to atomically save approved questions for module %s: %s", module.id, e)
            return Response(
                {"error": f"Failed to save questions: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        serializer = ModuleQuestionSerializer(
            created_questions,
            many=True,
            context={"request": request},
        )
        return Response(
            {
                "message": f"Successfully approved and created {len(created_questions)} questions.",
                "module_id": module.id,
                "created_count": len(created_questions),
                "questions": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

