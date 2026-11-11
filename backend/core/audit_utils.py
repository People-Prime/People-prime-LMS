def generate_audit_description(action, entity_type, entity_id, details, actor_name="The administrator", related_context=None):
    """
    Generates a clear, informative, human-readable audit description of at least two lines.
    Uses available details and related entity context (course names, module names, learner/group names)
    grounded strictly in verified audit fields and database relationships.
    Gracefully falls back to record IDs when parent/related records are missing or deleted.
    No credentials, tokens, or sensitive information are ever included.
    """
    if not isinstance(details, dict):
        details = {}
    if not isinstance(related_context, dict):
        related_context = {}

    entity_name = details.get("name") or details.get("title")

    # Format human-readable entity identifier
    entity_label = f"\"{entity_name}\"" if entity_name else f"record #{entity_id}"

    # Helper to resolve related names safely
    courses_by_id = related_context.get("courses", {})
    modules_by_id = related_context.get("modules", {})
    submodules_by_id = related_context.get("submodules", {})
    materials_by_id = related_context.get("materials", {})
    groups_by_id = related_context.get("groups", {})
    users_by_id = related_context.get("users", {})

    def _get_course_ref(cid):
        if not cid:
            return ""
        c_obj = courses_by_id.get(cid)
        if c_obj:
            c_name = getattr(c_obj, "name", str(c_obj))
            return f" under the course {c_name}"
        return f" under course #{cid}"

    def _get_course_name_only(cid):
        if not cid:
            return None
        c_obj = courses_by_id.get(cid)
        return getattr(c_obj, "name", str(c_obj)) if c_obj else None

    def _get_module_ref(mid):
        if not mid:
            return ""
        m_obj = modules_by_id.get(mid)
        if m_obj:
            m_name = getattr(m_obj, "name", str(m_obj))
            return f" for the module {m_name}"
        return f" for module #{mid}"

    def _get_module_name_only(mid):
        if not mid:
            return None
        m_obj = modules_by_id.get(mid)
        return getattr(m_obj, "name", str(m_obj)) if m_obj else None

    def _get_group_label(gid):
        if not gid:
            return f"group #{gid}"
        g_obj = groups_by_id.get(gid)
        if g_obj:
            g_name = getattr(g_obj, "name", str(g_obj))
            return f"learner group \"{g_name}\""
        return f"learner group #{gid}"

    def _get_user_label(uid, fallback_role="user"):
        if not uid:
            return f"{fallback_role} #{uid}"
        u_obj = users_by_id.get(uid)
        if u_obj:
            full_name = u_obj.get_full_name().strip() if hasattr(u_obj, "get_full_name") else ""
            username = getattr(u_obj, "username", "")
            display = f"{full_name} (@{username})" if full_name and username else (username or full_name)
            return f"{fallback_role.capitalize()} {display}"
        return f"{fallback_role.capitalize()} #{uid}"

    # Handle CREATE actions
    if action == "CREATE":
        if entity_type == "Course":
            return (
                f"A new course, {entity_label}, was created in the LMS.\n"
                "The course is now recorded in the curriculum and can be managed through the administration area."
            )
        elif entity_type == "Module":
            course_id = details.get("course")
            # If not in details, check if module exists in related_context
            if not course_id and entity_id in modules_by_id:
                m_instance = modules_by_id[entity_id]
                course_id = getattr(m_instance, "course_id", None)

            course_ref = _get_course_ref(course_id)
            c_name = _get_course_name_only(course_id)
            second_line = (
                f"The module is part of the {c_name} curriculum and can be managed from the course's module section."
                if c_name else
                "The module is now part of the course curriculum structure and ready for content authoring."
            )
            return f"A new learning module, {entity_label}, was created{course_ref}.\n{second_line}"

        elif entity_type == "Program":
            return (
                f"A new training program, {entity_label}, was created in the LMS.\n"
                "The program is now available to organize courses and track cohort progression."
            )
        elif entity_type == "Submodule":
            module_id = details.get("module")
            if not module_id and entity_id in submodules_by_id:
                s_instance = submodules_by_id[entity_id]
                module_id = getattr(s_instance, "module_id", None)

            mod_ref = _get_module_ref(module_id)
            m_name = _get_module_name_only(module_id)
            second_line = (
                f"The submodule organizes topics and learning units within {m_name}."
                if m_name else
                "The submodule is now available to structure learning materials and topics."
            )
            return f"A new submodule, {entity_label}, was created{mod_ref}.\n{second_line}"

        elif entity_type == "LearningMaterial":
            mat_type = details.get("type") or details.get("material_type", "content")
            module_id = details.get("module")
            if not module_id and entity_id in materials_by_id:
                mat_instance = materials_by_id[entity_id]
                module_id = getattr(mat_instance, "module_id", None)

            mod_ref = _get_module_ref(module_id)
            return (
                f"A new {mat_type} learning material, {entity_label}, was created{mod_ref}.\n"
                "The material is recorded in the module draft content awaiting review or publishing."
            )
        elif entity_type == "LearnerGroup":
            return (
                f"A new learner cohort group, {entity_label}, was established.\n"
                "Learners and trainers can now be allocated to this cohort for tracked learning."
            )
        elif entity_type == "CandidateType":
            return (
                f"A new candidate type, {entity_label}, was configured in the LMS.\n"
                "Cohorts and training curricula can now reference this candidate classification."
            )
        elif entity_type == "ModuleQuestion":
            order = details.get("order")
            is_req = details.get("is_required", True)
            req_str = "required" if is_req else "optional"
            order_str = f" as question #{order}" if order else ""
            module_id = details.get("module")
            mod_ref = _get_module_ref(module_id)
            return (
                f"A new {req_str} verification question was added{order_str}{mod_ref}.\n"
                "Learners will be prompted with this question to confirm their module progression."
            )
        elif entity_type == "ModuleQuestionResponse":
            learner_id = details.get("learner")
            learner_lbl = _get_user_label(learner_id, "learner") if learner_id else "The learner"
            module_id = details.get("module")
            mod_ref = _get_module_ref(module_id)
            return (
                f"A verification question response was submitted by {learner_lbl}{mod_ref}.\n"
                "The learner's response has been recorded to track module completion status."
            )
        else:
            return (
                f"A new {entity_type} ({entity_label}) was created in the portal.\n"
                "The record is now established in the system for administrative tracking."
            )

    # Handle UPDATE actions
    elif action == "UPDATE":
        if entity_type == "Course":
            return (
                f"The course, {entity_label}, was updated in the administration portal.\n"
                "Review the course details to verify current publication status and curriculum settings."
            )
        elif entity_type == "Module":
            course_id = details.get("course")
            if not course_id and entity_id in modules_by_id:
                m_instance = modules_by_id[entity_id]
                course_id = getattr(m_instance, "course_id", None)
            c_name = _get_course_name_only(course_id)
            second_line = (
                f"Review the module configuration and content in {c_name} before learners access the material."
                if c_name else
                "Review the module configuration and content before learners access the material."
            )
            return f"The module, {entity_label}, was updated in the curriculum.\n{second_line}"

        elif entity_type == "Submodule":
            module_id = details.get("module")
            if not module_id and entity_id in submodules_by_id:
                s_instance = submodules_by_id[entity_id]
                module_id = getattr(s_instance, "module_id", None)
            mod_ref = _get_module_ref(module_id)
            return (
                f"The submodule, {entity_label}, was updated{mod_ref}.\n"
                "The latest changes have been saved to the module syllabus."
            )
        elif entity_type == "LearningMaterial":
            module_id = details.get("module")
            if not module_id and entity_id in materials_by_id:
                mat_instance = materials_by_id[entity_id]
                module_id = getattr(mat_instance, "module_id", None)
            mod_ref = _get_module_ref(module_id)
            return (
                f"The learning material, {entity_label}, was updated{mod_ref}.\n"
                "The changes are saved in the curriculum draft for subsequent review."
            )
        elif entity_type == "TrainingAssignment":
            grp = details.get("learner_group")
            crs = details.get("course")
            group_label = _get_group_label(grp) if grp else "the assigned cohort"
            course_name = _get_course_name_only(crs)
            target_str = f"course \"{course_name}\"" if course_name else (f"course #{crs}" if crs else "curriculum")
            return (
                f"The training assignment for {target_str} to {group_label} was updated.\n"
                "Curriculum access allocations for the cohort were updated in the system."
            )
        elif entity_type == "GroupMembership":
            learner_id = details.get("learner")
            group_id = details.get("group")
            learner_lbl = _get_user_label(learner_id, "learner")
            group_lbl = _get_group_label(group_id)
            return (
                f"Membership status for {learner_lbl} in {group_lbl} was updated.\n"
                "The cohort enrollment status has been updated in the portal."
            )
        elif entity_type == "TrainerGroupAssignment":
            trainer_id = details.get("trainer")
            group_id = details.get("group")
            trainer_lbl = _get_user_label(trainer_id, "trainer")
            group_lbl = _get_group_label(group_id)
            return (
                f"Assignment status for {trainer_lbl} managing {group_lbl} was updated.\n"
                "Trainer cohort oversight privileges have been updated in the portal."
            )
        else:
            return (
                f"The {entity_type} record ({entity_label}) was updated in the portal.\n"
                "The latest changes have been recorded and applied to the administrative configuration."
            )

    # Handle DELETE actions
    elif action == "DELETE":
        return (
            f"The {entity_type.lower()} record, {entity_label}, was deleted from the LMS.\n"
            "The activity is retained in the audit history for administrative tracking and governance."
        )

    # Handle PUBLISH actions
    elif action == "PUBLISH":
        version = details.get("version")
        ver_str = f"Version {version}" if version else "A new version"
        module_id = details.get("module")
        if not module_id and entity_id in materials_by_id:
            mat_instance = materials_by_id[entity_id]
            module_id = getattr(mat_instance, "module_id", None)
        mod_ref = _get_module_ref(module_id)
        return (
            f"A new version of the learning material, {entity_label}, was published{mod_ref}.\n"
            f"{ver_str} is now recorded as the active published version for assigned learners."
        )

    # Handle ASSIGN actions
    elif action == "ASSIGN":
        if entity_type == "GroupMembership":
            learner_id = details.get("learner")
            group_id = details.get("group")
            learner_lbl = _get_user_label(learner_id, "learner")
            group_lbl = _get_group_label(group_id)
            return (
                f"{learner_lbl} was assigned to {group_lbl}.\n"
                "This assignment links the learner to the cohort for tracking learning workflows."
            )
        elif entity_type == "TrainerGroupAssignment":
            trainer_id = details.get("trainer")
            group_id = details.get("group")
            trainer_lbl = _get_user_label(trainer_id, "trainer")
            group_lbl = _get_group_label(group_id)
            return (
                f"{trainer_lbl} was assigned to manage {group_lbl}.\n"
                "The trainer now has oversight authorization for learners in this cohort."
            )
        elif entity_type == "TrainingAssignment":
            grp = details.get("learner_group")
            crs = details.get("course")
            prog = details.get("program")
            course_name = _get_course_name_only(crs)
            target_str = f"course \"{course_name}\"" if course_name else (f"course #{crs}" if crs else (f"program #{prog}" if prog else "curriculum"))
            group_lbl = _get_group_label(grp) if grp else "assigned candidates"
            return (
                f"A training curriculum assignment was allocated for {target_str} to {group_lbl}.\n"
                "This assignment establishes cohort learning requirements and progression tracking."
            )
        else:
            return (
                f"An assignment action was recorded for {entity_type} #{entity_id}.\n"
                "The relationship has been saved in the system configuration."
            )

    # Generic fallback
    return (
        f"{actor_name} performed {action.lower()} on {entity_type} ({entity_label}).\n"
        "The event has been logged for administrative compliance and audit history."
    )
