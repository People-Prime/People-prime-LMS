"""
Assessment scoring utilities for People Prime LMS.
Enforces dynamic assessment passing thresholds and completion gate policies.
"""

import math


def get_minimum_passing_score(total_questions: int) -> int:
    """
    Calculates the minimum number of correct answers required to pass an assessment.
    Rule:
        minimum_correct_answers = math.ceil(total_questions * 0.5)

    Examples:
        - 1 question  -> 1 correct required
        - 2 questions -> 1 correct required
        - 3 questions -> 2 correct required
        - 4 questions -> 2 correct required
        - 5 questions -> 3 correct required
        - 6 questions -> 3 correct required
        - 7 questions -> 4 correct required
        - 8 questions -> 4 correct required
        - 9 questions -> 5 correct required
        - 10 questions -> 5 correct required
        - 20 questions -> 10 correct required

    Returns 0 if total_questions <= 0.
    """
    try:
        tot = int(total_questions)
    except (ValueError, TypeError):
        return 0

    if tot <= 0:
        return 0

    return math.ceil(tot * 0.5)


def is_assessment_passed(score, total_questions: int) -> bool:
    """
    Determines whether an attempt score meets or exceeds the required passing threshold.
    Returns False if score is None or total_questions <= 0.
    """
    if score is None:
        return False

    min_score = get_minimum_passing_score(total_questions)
    if min_score <= 0:
        return False

    try:
        return float(score) >= float(min_score)
    except (ValueError, TypeError):
        return False
