"""Structured goal reviews: normalized answers and the plain-text content derived from them.

A guided review stores its answers in `notes.review_data`; `content` is derived here so search,
the heatmap and exports keep reading one text column. Legacy reviews have content only.
"""
from pydantic import ValidationError

from validators.notes import GoalReviewDataSchema

STATUS_LABELS = {'on_track': 'On track', 'at_risk': 'At risk', 'off_track': 'Off track'}
ANSWER_LABELS = (
    ('went_well', 'What went well'),
    ('change', 'What to change'),
    ('next_focus', 'Focus until the next review'),
)


def normalize_review_data(raw) -> tuple[dict | None, str | None]:
    """Validated, complete review answers, or an error message."""
    try:
        return GoalReviewDataSchema.model_validate(raw).stored(), None
    except ValidationError as exc:
        return None, exc.errors()[0].get('msg', 'Invalid review')


def review_content(review_data: dict) -> str:
    lines = []
    status = STATUS_LABELS.get(review_data.get('status') or '')
    if status:
        lines.append(f'Status: {status}')
    for key, label in ANSWER_LABELS:
        answer = (review_data.get(key) or '').strip()
        if answer:
            lines.extend(['', f'{label}:', answer] if lines else [f'{label}:', answer])
    return '\n'.join(lines)
