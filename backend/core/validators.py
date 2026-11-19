"""
File upload validation and storage path utilities for People Prime LMS.
Enforces extension allowlists, maximum file size limits, and sanitizes storage paths.
"""

import os
import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.text import slugify

# Permitted file extensions grouped by category
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm"}
ALLOWED_EXCEL_EXTENSIONS = {".xlsx", ".xls", ".csv"}
ALLOWED_POWERPOINT_EXTENSIONS = {".pptx", ".ppt"}
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}

ALL_ALLOWED_EXTENSIONS = (
    ALLOWED_IMAGE_EXTENSIONS
    | ALLOWED_VIDEO_EXTENSIONS
    | ALLOWED_EXCEL_EXTENSIONS
    | ALLOWED_POWERPOINT_EXTENSIONS
    | ALLOWED_DOCUMENT_EXTENSIONS
)

CATEGORY_EXTENSION_MAP = {
    "IMAGE": ALLOWED_IMAGE_EXTENSIONS,
    "VIDEO": ALLOWED_VIDEO_EXTENSIONS,
    "EXCEL": ALLOWED_EXCEL_EXTENSIONS,
    "POWERPOINT": ALLOWED_POWERPOINT_EXTENSIONS,
    "DOCUMENT": ALLOWED_DOCUMENT_EXTENSIONS,
    "TEXT": ALLOWED_DOCUMENT_EXTENSIONS,
}


def sanitize_relative_path(path_str):
    """
    Sanitizes a client-provided relative path to prevent directory traversal.
    Ensures no leading slashes, no '..' sequences, and normalizes path separators.
    Returns a clean relative path string.
    """
    if not path_str:
        return ""
    # Replace backslashes with forward slashes
    clean = path_str.replace("\\", "/").strip()
    # Strip any leading slashes
    clean = clean.lstrip("/")
    parts = []
    for part in clean.split("/"):
        part = part.strip()
        if not part or part == ".":
            continue
        if part == "..":
            # Reject or ignore directory traversal
            continue
        parts.append(part)
    return "/".join(parts)


def training_file_upload_path(instance, filename):
    """
    Generates a secure, structured storage path for training files:
    training_materials/<uuid_prefix>_<slugified_filename>
    """
    ext = os.path.splitext(filename)[1].lower()
    base_name = os.path.splitext(filename)[0]
    safe_name = slugify(base_name) or "file"
    unique_id = uuid.uuid4().hex[:10]
    return os.path.join("training_materials", f"{unique_id}_{safe_name}{ext}")


def validate_learning_material_file(file_obj):
    """
    Validates uploaded file against global size limits and allowed extensions.
    """
    if not file_obj:
        return

    ext = os.path.splitext(file_obj.name)[1].lower()
    if ext not in ALL_ALLOWED_EXTENSIONS:
        raise ValidationError(
            f"Unsupported file extension '{ext}'. Permitted extensions: {', '.join(sorted(ALL_ALLOWED_EXTENSIONS))}."
        )

    # Check file size limit (default 100MB unless configured in settings)
    max_size_mb = getattr(settings, "MAX_UPLOAD_SIZE_MB", 100)
    max_size_bytes = max_size_mb * 1024 * 1024

    if file_obj.size > max_size_bytes:
        raise ValidationError(
            f"File size exceeds the {max_size_mb}MB limit. Uploaded file is {file_obj.size / (1024 * 1024):.1f}MB."
        )


def validate_file_for_material_type(file_obj, material_type):
    """
    Validates that a file's extension matches its declared MaterialType.
    """
    if not file_obj:
        return

    expected_extensions = CATEGORY_EXTENSION_MAP.get(material_type)
    if expected_extensions is None:
        return

    ext = os.path.splitext(file_obj.name)[1].lower()
    if ext not in expected_extensions:
        raise ValidationError(
            f"Files for {material_type} materials must have one of these extensions: "
            f"{', '.join(sorted(expected_extensions))}. Found '{ext}'."
        )


def learning_material_upload_path(instance, filename):
    """
    Generates a secure, collision-free storage path for learning material files:
    learning_materials/<module_id>/<uuid>_<slugified_filename>
    """
    ext = os.path.splitext(filename)[1].lower()
    base_name = os.path.splitext(filename)[0]
    safe_name = slugify(base_name) or "file"
    unique_id = uuid.uuid4().hex[:10]
    module_folder = f"module_{instance.module_id}" if getattr(instance, "module_id", None) else "unassigned"
    return os.path.join("learning_materials", module_folder, f"{unique_id}_{safe_name}{ext}")


def material_version_upload_path(instance, filename):
    """
    Generates an immutable storage path for historical material versions:
    learning_materials/versions/<material_id>/v<version_number>_<uuid>_<slugified_filename>
    """
    ext = os.path.splitext(filename)[1].lower()
    base_name = os.path.splitext(filename)[0]
    safe_name = slugify(base_name) or "version"
    unique_id = uuid.uuid4().hex[:10]
    material_folder = f"material_{instance.material_id}" if getattr(instance, "material_id", None) else "unassigned"
    version_tag = f"v{getattr(instance, 'version_number', 1)}"
    return os.path.join("learning_materials", "versions", material_folder, f"{version_tag}_{unique_id}_{safe_name}{ext}")


def project_resource_upload_path(instance, filename):
    """
    Generates a secure, structured storage path for project resources:
    project_resources/project_<project_id>/<uuid>_<slugified_filename>
    """
    ext = os.path.splitext(filename)[1].lower()
    base_name = os.path.splitext(filename)[0]
    safe_name = slugify(base_name) or "resource"
    unique_id = uuid.uuid4().hex[:10]
    proj_id = getattr(instance, "project_id", None) or "unassigned"
    return os.path.join("project_resources", f"project_{proj_id}", f"{unique_id}_{safe_name}{ext}")


def project_submission_upload_path(instance, filename):
    """
    Generates a secure, structured storage path for learner project submissions:
    project_submissions/project_<project_id>/learner_<learner_id>/v<version>/<uuid>_<slugified_filename>
    """
    ext = os.path.splitext(filename)[1].lower()
    base_name = os.path.splitext(filename)[0]
    safe_name = slugify(base_name) or "submission"
    unique_id = uuid.uuid4().hex[:10]
    submission = getattr(instance, "submission", None)
    proj_id = getattr(submission, "project_id", "general") if submission else "general"
    learner_id = getattr(submission, "learner_id", "unknown") if submission else "unknown"
    version = getattr(submission, "version", 1) if submission else 1
    return os.path.join(
        "project_submissions",
        f"project_{proj_id}",
        f"learner_{learner_id}",
        f"v{version}",
        f"{unique_id}_{safe_name}{ext}",
    )


