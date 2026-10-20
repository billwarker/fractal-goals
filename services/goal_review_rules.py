"""When a goal's next review is due.

Levels that review goals (`uses_reviews`; Ultimate, Long and Mid Term by default) do so on a cadence:
the goal's own, else its level's. The next review falls one cadence after the latest goal_review
note (or, before the first, after the goal's start). A deferral pushes it to a later date; turning
reviews off or completing the goal stops them. Dates are calendar days.
"""

from datetime import date
from typing import Any

from sqlalchemy import func

from services.goal_deadline_rules import add_interval, as_date

NOTE_KIND_GOAL_REVIEW = 'goal_review'
# Attribute a loader sets on each goal so serialization never queries per goal.
LAST_REVIEW_ATTR = '_last_review_at'


_UNLOADED = object()


def goal_review_state(goal: Any, today: date | None = None) -> dict | None:
    """A goal's review schedule, using the latest review date a loader attached, else one query."""
    from datetime import datetime, timezone

    from sqlalchemy.orm import object_session

    level = getattr(goal, 'level', None)
    if level is None or not getattr(level, 'uses_reviews', False):
        return None
    last_review_at = getattr(goal, LAST_REVIEW_ATTR, _UNLOADED)
    if last_review_at is _UNLOADED:
        session = object_session(goal)
        last_review_at = last_review_dates(session, [goal.id]).get(goal.id) if session is not None else None
        setattr(goal, LAST_REVIEW_ATTR, last_review_at)
    return review_state(goal, level, last_review_at, today or datetime.now(timezone.utc).date())


def is_reviewed(goal: Any, today: date | None = None) -> bool:
    """SMART's R: reviews on, with a cadence, and no review due (a due review takes R away until one
    is written; a deferral moves the due date). Levels that don't review goals, and completed goals,
    count as met."""
    state = goal_review_state(goal, today)
    return state is None or state['status'] in ('upcoming', 'complete')


def review_cadence(goal: Any, level: Any) -> dict | None:
    """The cadence that applies: the goal's own when set, else the level's."""
    if goal.review_cadence_value and goal.review_cadence_unit:
        return {'value': goal.review_cadence_value, 'unit': goal.review_cadence_unit, 'source': 'goal'}
    if level is not None and level.review_cadence_value and level.review_cadence_unit:
        return {'value': level.review_cadence_value, 'unit': level.review_cadence_unit, 'source': 'level'}
    return None


def review_state(goal: Any, level: Any, last_review_at: Any, today: date) -> dict | None:
    """The goal's review schedule, or None when its level doesn't review goals.

    status: 'due' (on or before today), 'upcoming', 'off' (turned off), 'none' (no cadence) or
    'complete' (completed goals aren't reviewed).
    """
    if level is None or not getattr(level, 'uses_reviews', False):
        return None
    cadence = review_cadence(goal, level)
    last = as_date(last_review_at)
    base = {
        'cadence': cadence,
        'last_review_on': last.isoformat() if last else None,
        'next_review_on': None,
        'deferred_until': None,
    }
    if goal.completed:
        return {**base, 'status': 'complete'}
    if goal.review_disabled:
        return {**base, 'status': 'off'}
    if cadence is None:
        return {**base, 'status': 'none'}
    anchor = last or as_date(goal.started_at) or as_date(goal.created_at) or today
    next_on = add_interval(anchor, cadence['value'], cadence['unit'])
    deferred = as_date(goal.review_deferred_until)
    if deferred and next_on and deferred > next_on:
        next_on = deferred
        base['deferred_until'] = deferred.isoformat()
    if next_on is None:
        return {**base, 'status': 'none'}
    return {**base, 'next_review_on': next_on.isoformat(), 'status': 'due' if next_on <= today else 'upcoming'}


def deferred_review_date(goal: Any, level: Any, last_review_at: Any, today: date) -> date | None:
    """Defer to next period: one cadence after the review now due (or after today, if later)."""
    state = review_state(goal, level, last_review_at, today)
    next_on = as_date(state['next_review_on']) if state else None
    if not state or next_on is None or not state['cadence']:
        return None
    start = max(next_on, today)
    return add_interval(start, state['cadence']['value'], state['cadence']['unit'])


def restart_review_cadence(db_session, root_id, goal_id, note_kind) -> None:
    """A written review restarts the cadence from today, so any deferral is spent."""
    if note_kind != NOTE_KIND_GOAL_REVIEW:
        return
    from models import Goal

    goal = db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
    if goal is not None and goal.review_deferred_until is not None:
        goal.review_deferred_until = None


def last_review_dates(db_session, goal_ids) -> dict:
    """The latest goal_review note per goal, in one query."""
    from models import Note

    ids = [goal_id for goal_id in goal_ids if goal_id]
    if not ids:
        return {}
    rows = db_session.query(Note.context_id, func.max(Note.created_at)).filter(
        Note.context_type == 'goal',
        Note.context_id.in_(ids),
        Note.note_kind == NOTE_KIND_GOAL_REVIEW,
        Note.deleted_at.is_(None),
    ).group_by(Note.context_id).all()
    return dict(rows)


def attach_last_review_dates(db_session, goals) -> None:
    """Set each goal's latest review date for serialization (one query for all of them)."""
    goals = list(goals)
    dates = last_review_dates(db_session, [goal.id for goal in goals])
    for goal in goals:
        setattr(goal, LAST_REVIEW_ATTR, dates.get(goal.id))
