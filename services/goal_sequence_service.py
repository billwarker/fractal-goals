"""Sequence tracks: ordered same-level siblings that unlock one at a time.

A track is built on pause. Its first incomplete step is active; every later incomplete step is
paused with reason 'sequence' (paused goals already ignore evidence and cannot complete).
Completing a step resumes the next one, recording the completed goal on the closed pause
interval so un-completing can re-pause exactly that goal. Manual pauses and out-of-order manual
resumes are left alone; the user's Pause/Resume stays the only activation control.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from models import (
    COMPLETION_CONDITION_ACTIVITY_THRESHOLD,
    PAUSE_REASON_SEQUENCE,
    Goal,
    GoalPauseInterval,
    GoalSequenceTrack,
    validate_root_goal,
)
from services._completion_context import _emit_pending_events
from services.service_types import ServiceResult

MIN_STEPS = 2
MAX_STEPS = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _open_interval(goal: Any) -> Any:
    return next((interval for interval in (goal.pause_intervals or []) if interval.resumed_at is None), None)


def is_paused_for_sequence(goal: Any) -> bool:
    interval = _open_interval(goal) if goal.paused else None
    return bool(interval and interval.reason == PAUSE_REASON_SEQUENCE)


def _pause_for_sequence(db_session, goal: Any, now: datetime) -> None:
    goal.paused = True
    goal.paused_at = now
    interval = GoalPauseInterval(goal_id=goal.id, root_id=goal.root_id, paused_at=now, reason=PAUSE_REASON_SEQUENCE)
    db_session.add(interval)
    goal.pause_intervals.append(interval)


def _resume(goal: Any, now: datetime, *, resumed_by: Any | None = None) -> None:
    goal.paused = False
    goal.paused_at = None
    for interval in goal.pause_intervals or []:
        if interval.resumed_at is None:
            interval.resumed_at = now
            interval.resumed_by_goal_id = resumed_by.id if resumed_by is not None else None


def track_steps(db_session, track_id: str | None) -> list[Any]:
    """A track's live steps in order."""
    if not track_id:
        return []
    return db_session.query(Goal).filter(
        Goal.sequence_track_id == track_id, Goal.deleted_at.is_(None),
    ).order_by(Goal.sequence_position, Goal.id).all()


def _reconcile_resumed(db_session, goals: Iterable[Any], pending_events: list) -> None:
    """A resumed threshold goal may already meet its condition from evidence before the pause."""
    from services.goal_condition_service import reconcile_goal
    from services.goal_loading import load_fractal_goals_for_serialization

    resumed = [goal for goal in goals if goal.completion_condition == COMPLETION_CONDITION_ACTIVITY_THRESHOLD]
    if not resumed:
        return
    db_session.flush()
    goals_by_id = load_fractal_goals_for_serialization(db_session, resumed[0].root_id)
    for goal in resumed:
        reconcile_goal(db_session, goals_by_id.get(goal.id, goal), goals_by_id, pending_events, trigger='sequence_advanced')


def apply_track_pauses(db_session, track_id: str, now: datetime | None = None, *, resume_first: bool = True) -> list[Any]:
    """Pause later incomplete steps for the sequence; resume the active one if the sequence held it.

    Returns the goals this resumed.
    """
    now = now or _now()
    incomplete = [goal for goal in track_steps(db_session, track_id) if not goal.completed]
    resumed = []
    for index, goal in enumerate(incomplete):
        if index == 0:
            if resume_first and is_paused_for_sequence(goal):
                _resume(goal, now)
                resumed.append(goal)
        elif not goal.paused:
            _pause_for_sequence(db_session, goal, now)
    return resumed


def next_step(db_session, goal: Any) -> Any:
    """The first incomplete step after `goal` in its track."""
    if not goal.sequence_track_id:
        return None
    return next((
        step for step in track_steps(db_session, goal.sequence_track_id)
        if step.id != goal.id and not step.completed
        and (step.sequence_position or 0) > (goal.sequence_position or 0)
    ), None)


def sequence_begun_by_id(goal: Any) -> str | None:
    """The predecessor whose completion began this open step, while it still runs."""
    if goal.paused or goal.completed or not goal.sequence_track_id:
        return None
    latest = max((goal.pause_intervals or []), key=lambda interval: interval.paused_at, default=None)
    if latest is None or latest.resumed_at is None:
        return None
    return latest.resumed_by_goal_id


def step_resumed_by(db_session, goal: Any) -> Any:
    """The step that completing `goal` resumed and that is still open (so un-completing can re-pause it)."""
    if not goal.sequence_track_id:
        return None
    for step in track_steps(db_session, goal.sequence_track_id):
        if step.id == goal.id or step.completed or step.paused:
            continue
        latest = max((step.pause_intervals or []), key=lambda interval: interval.paused_at, default=None)
        if latest is not None and latest.resumed_by_goal_id == goal.id:
            return step
    return None


def advance_after_completion(db_session, goal: Any, pending_events: list, *, begin_next: bool = True) -> Any:
    """In the completing transaction: resume the next step if the sequence was holding it."""
    if not begin_next or not goal.completed:
        return None
    upcoming = next_step(db_session, goal)
    if upcoming is None or not is_paused_for_sequence(upcoming):
        return None
    _resume(upcoming, _now(), resumed_by=goal)
    _reconcile_resumed(db_session, [upcoming], pending_events)
    return upcoming


def revert_after_uncompletion(db_session, goal: Any, *, pause_next: bool = True) -> Any:
    """In the un-completing transaction: re-pause the step this goal's completion resumed."""
    if not pause_next or goal.completed:
        return None
    resumed = step_resumed_by(db_session, goal)
    if resumed is None:
        return None
    _pause_for_sequence(db_session, resumed, _now())
    return resumed


def leave_track(db_session, goal: Any, pending_events: list | None = None, *, begin_next: bool = True) -> None:
    """Take a goal out of its track (moved, converted, deleted): it resumes if only the sequence held
    it, the rest renumber, and a track left with one step dissolves."""
    track_id = goal.sequence_track_id
    if not track_id:
        return
    now = _now()
    resumed = []
    if is_paused_for_sequence(goal) and not goal.deleted_at:
        _resume(goal, now)
        resumed.append(goal)
    goal.sequence_track_id = None
    goal.sequence_position = None
    db_session.flush()
    remaining = track_steps(db_session, track_id)
    if len(remaining) < MIN_STEPS:
        for step in remaining:
            if is_paused_for_sequence(step):
                _resume(step, now)
                resumed.append(step)
            step.sequence_track_id = None
            step.sequence_position = None
        track = db_session.get(GoalSequenceTrack, track_id)
        if track is not None:
            track.deleted_at = now
    else:
        _renumber(db_session, remaining, track_id)
        resumed.extend(apply_track_pauses(db_session, track_id, now, resume_first=begin_next))
    if pending_events is not None:
        _reconcile_resumed(db_session, resumed, pending_events)


def _renumber(db_session, ordered: list[Any], track_id: str) -> None:
    """Place `ordered` at positions 1..n of the track. Positions are unique per track and a track
    id never goes without a position, so steps pass through distinct negative positions first."""
    for index, goal in enumerate(ordered, start=1):
        goal.sequence_track_id = track_id
        goal.sequence_position = -index
    db_session.flush()
    for index, goal in enumerate(ordered, start=1):
        goal.sequence_position = index
    db_session.flush()


class GoalSequenceError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class GoalSequenceService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _authorize(self, root_id, current_user_id) -> None:
        if not validate_root_goal(self.db_session, root_id, owner_id=current_user_id):
            raise GoalSequenceError("Fractal not found or access denied", 404)

    def _lock_parent(self, root_id, parent_id) -> Any:
        parent = self.db_session.query(Goal).filter_by(
            id=parent_id, root_id=root_id, deleted_at=None,
        ).with_for_update().first()
        if not parent:
            raise GoalSequenceError("Parent goal not found", 404)
        parent.row_version += 1
        return parent

    def _validated_steps(self, root_id, parent: Goal, goal_ids: list[str], track_id: str | None) -> list[Any]:
        if len(goal_ids) != len(set(goal_ids)):
            raise GoalSequenceError("A goal can appear in a sequence only once")
        if not MIN_STEPS <= len(goal_ids) <= MAX_STEPS:
            raise GoalSequenceError(f"A sequence needs {MIN_STEPS} to {MAX_STEPS} goals")
        goals = self.db_session.query(Goal).filter(
            Goal.id.in_(goal_ids), Goal.root_id == root_id, Goal.deleted_at.is_(None),
        ).all()
        by_id = {goal.id: goal for goal in goals}
        missing = [goal_id for goal_id in goal_ids if goal_id not in by_id]
        if missing:
            raise GoalSequenceError("Goal not found in this fractal", 404)
        ordered = [by_id[goal_id] for goal_id in goal_ids]
        if any(goal.parent_id != parent.id for goal in ordered):
            raise GoalSequenceError("A sequence holds sibling goals of one parent")
        if len({goal.level_id for goal in ordered}) != 1:
            raise GoalSequenceError("A sequence holds goals of one level")
        if any(goal.sequence_track_id and goal.sequence_track_id != track_id for goal in ordered):
            raise GoalSequenceError("A goal can be in only one sequence")
        return ordered

    def _finish(self, track_id: str, pending_events: list, commit: bool) -> list[Any]:
        resumed = apply_track_pauses(self.db_session, track_id)
        _reconcile_resumed(self.db_session, resumed, pending_events)
        if commit:
            self.db_session.commit()
            _emit_pending_events(pending_events)
        else:
            self.db_session.flush()
        return track_steps(self.db_session, track_id)

    def _fail(self, error: GoalSequenceError, commit: bool) -> tuple[None, str, int]:
        # Inside a caller's transaction (commit=False) the caller decides what to roll back.
        if commit:
            self.db_session.rollback()
        return None, str(error), error.status

    def create_track(
        self, root_id, current_user_id, parent_goal_id, goal_ids, *, commit=True, pending_events=None,
    ) -> ServiceResult[dict]:
        try:
            self._authorize(root_id, current_user_id)
            parent = self._lock_parent(root_id, parent_goal_id)
            ordered = self._validated_steps(root_id, parent, list(goal_ids or []), None)
        except GoalSequenceError as error:
            return self._fail(error, commit)
        track: Any = GoalSequenceTrack(root_id=root_id, parent_goal_id=parent.id, level_id=ordered[0].level_id)
        self.db_session.add(track)
        self.db_session.flush()
        for position, goal in enumerate(ordered, start=1):
            goal.sequence_track_id = track.id
            goal.sequence_position = position
        steps = self._finish(track.id, pending_events if pending_events is not None else [], commit)
        return {'id': track.id, 'parent_goal_id': parent.id, 'goal_ids': [goal.id for goal in steps]}, None, 201

    def set_track_steps(
        self, root_id, current_user_id, track_id, goal_ids, *, commit=True, pending_events=None,
    ) -> ServiceResult[dict]:
        """Reorder, add or remove steps; fewer than two steps dissolves the track."""
        track = self.db_session.query(GoalSequenceTrack).filter_by(id=track_id, root_id=root_id, deleted_at=None).first()
        if not track:
            return None, "Sequence not found", 404
        goal_ids = list(goal_ids or [])
        events = pending_events if pending_events is not None else []
        try:
            self._authorize(root_id, current_user_id)
            parent = self._lock_parent(root_id, track.parent_goal_id)
            if len(goal_ids) < MIN_STEPS:
                for goal in track_steps(self.db_session, track.id):
                    leave_track(self.db_session, goal, events)
                if commit:
                    self.db_session.commit()
                    _emit_pending_events(events)
                else:
                    self.db_session.flush()
                return {'id': track.id, 'parent_goal_id': parent.id, 'goal_ids': [], 'dissolved': True}, None, 200
            ordered = self._validated_steps(root_id, parent, goal_ids, track.id)
        except GoalSequenceError as error:
            return self._fail(error, commit)
        kept = {goal.id for goal in ordered}
        now = _now()
        for goal in track_steps(self.db_session, track.id):
            if goal.id not in kept:
                if is_paused_for_sequence(goal):
                    _resume(goal, now)
                goal.sequence_track_id = None
                goal.sequence_position = None
        self.db_session.flush()
        _renumber(self.db_session, ordered, track.id)
        steps = self._finish(track.id, events, commit)
        return {'id': track.id, 'parent_goal_id': parent.id, 'goal_ids': [goal.id for goal in steps]}, None, 200

    def sequence_goals(self, root_id, current_user_id, goal_ids, *, commit=True, pending_events=None) -> ServiceResult[dict]:
        """Sequence sibling goals in this order: replaces the sequence they're already in, or creates
        one under their parent. Used by agent proposals, which name goals rather than tracks."""
        goal_ids = list(goal_ids or [])
        goals = self.db_session.query(Goal).filter(
            Goal.id.in_(goal_ids), Goal.root_id == root_id, Goal.deleted_at.is_(None),
        ).all() if goal_ids else []
        if not goals:
            return None, "Goal not found in this fractal", 404
        track_ids = {goal.sequence_track_id for goal in goals if goal.sequence_track_id}
        if len(track_ids) > 1:
            return None, "These goals are in different sequences; change one sequence at a time", 400
        if track_ids:
            return self.set_track_steps(
                root_id, current_user_id, track_ids.pop(), goal_ids, commit=commit, pending_events=pending_events,
            )
        return self.create_track(
            root_id, current_user_id, goals[0].parent_id, goal_ids, commit=commit, pending_events=pending_events,
        )

    def dissolve_track(self, root_id, current_user_id, track_id) -> ServiceResult[dict]:
        return self.set_track_steps(root_id, current_user_id, track_id, [])

    def hold_step(self, root_id, current_user_id, goal_id) -> ServiceResult[dict]:
        """Undo an automatic begin: re-pause a step its predecessor's completion began, as waiting
        on the sequence. The predecessor stays complete."""
        try:
            self._authorize(root_id, current_user_id)
            goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id, deleted_at=None).first()
            if not goal:
                raise GoalSequenceError("Goal not found", 404)
            self._lock_parent(root_id, goal.parent_id)
        except GoalSequenceError as error:
            self.db_session.rollback()
            return None, str(error), error.status
        if sequence_begun_by_id(goal) is None:
            return None, "This goal wasn't begun by its sequence, so there's nothing to undo", 409
        _pause_for_sequence(self.db_session, goal, _now())
        self.db_session.commit()
        return {'id': goal.id, 'paused': True, 'pause_reason': PAUSE_REASON_SEQUENCE}, None, 200

    def get_goal_sequence(self, root_id, current_user_id, goal_id) -> ServiceResult[dict]:
        """A goal's track, the step completing it would begin, and the step its completion began."""
        try:
            self._authorize(root_id, current_user_id)
        except GoalSequenceError as error:
            return None, str(error), error.status
        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id, deleted_at=None).first()
        if not goal:
            return None, "Goal not found", 404
        summary = lambda step: {'id': step.id, 'name': step.name} if step is not None else None  # noqa: E731
        upcoming = next_step(self.db_session, goal)
        return {
            'track_id': goal.sequence_track_id,
            'position': goal.sequence_position,
            'steps': [{
                'id': step.id, 'name': step.name, 'position': step.sequence_position,
                'completed': bool(step.completed), 'paused': bool(step.paused),
                'paused_for_sequence': is_paused_for_sequence(step),
            } for step in track_steps(self.db_session, goal.sequence_track_id)],
            'next_step': summary(upcoming if upcoming is not None and is_paused_for_sequence(upcoming) else None),
            'next_step_begun_by_this': summary(step_resumed_by(self.db_session, goal)),
        }, None, 200
