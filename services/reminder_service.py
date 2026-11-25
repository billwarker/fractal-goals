"""What an app may remind someone of: reviews due, days their programs ask for, a session left open.

Read by native apps, which schedule notifications from it on the device. Nothing is stored or sent
from here. Dates follow the rules that own them, so a reminder never disagrees with the calendar.
"""
from datetime import datetime, time, timedelta, timezone

from sqlalchemy.orm import joinedload, selectinload

from models import Goal, GoalLevel, Program, Session, format_utc
from models.base import _safe_load_json
from services._serialize_common import format_utc as serialize_utc
from services.goal_review_rules import attach_last_review_dates, goal_review_state
from services.program_calendar_feed_service import feed_load_options
from services.program_day_read_model_service import ProgramDayReadModelService
from services.session_filters import resolve_timezone

HORIZON_DAYS = 7
OPEN_SESSION_AFTER = timedelta(hours=3)
KINDS = ('goal_review', 'program_day', 'open_session')
# The calendar states in which a date still asks for something.
OPEN_STATES = {'scheduled_pending', 'scheduled_partial'}


class ReminderService:
    def __init__(self, db_session):
        self.db_session = db_session

    def upcoming(self, user, timezone_name, *, now=None):
        zone = resolve_timezone(timezone_name)
        if zone is None:
            return None, 'Invalid timezone', 400
        now = now or datetime.now(timezone.utc)
        today = now.astimezone(zone).date()
        stored = _safe_load_json(user.preferences, {})
        preferences = stored.get('reminders') if isinstance(stored, dict) else None
        preferences = preferences if isinstance(preferences, dict) else {}
        wanted = [kind for kind in KINDS if preferences.get(kind) is not False]
        roots = {root.id: root.name for root in self.db_session.query(Goal.id, Goal.name).filter(
            Goal.owner_id == user.id, Goal.parent_id.is_(None), Goal.deleted_at.is_(None),
        )}
        items = []
        if roots:
            for kind in wanted:
                items.extend(getattr(self, f'_{kind}')(user.id, roots, today, now, zone))
        items.sort(key=lambda item: (item['date'], item['kind'], item['entity_id']))
        return {
            'generated_at': format_utc(now), 'today': today.isoformat(), 'horizon_days': HORIZON_DAYS,
            'preferences': {kind: kind in wanted for kind in KINDS}, 'reminders': items,
        }, None, 200

    def _item(self, kind, root_id, roots, entity_id, title, day, path, **extra):
        return {
            # The same reminder keeps its id, so a device replaces it instead of repeating it.
            'id': f'{kind}:{entity_id}:{day.isoformat()}', 'kind': kind, 'root_id': root_id,
            'root_name': roots[root_id], 'entity_id': entity_id, 'title': title, 'date': day.isoformat(),
            'path': path, 'overdue': False, **extra,
        }

    def _goal_review(self, _user_id, roots, today, _now, _zone):
        goals = self.db_session.query(Goal).join(GoalLevel, GoalLevel.id == Goal.level_id).options(
            joinedload(Goal.level), selectinload(Goal.pause_intervals),
        ).filter(
            Goal.root_id.in_(roots), Goal.deleted_at.is_(None), Goal.completed.is_not(True),
            GoalLevel.uses_reviews.is_(True),
        ).all()
        attach_last_review_dates(self.db_session, goals)
        for goal in goals:
            state = goal_review_state(goal, today)
            due = str(state['next_review_on'] or '') if state else ''
            if not due or due > (today + timedelta(days=HORIZON_DAYS)).isoformat():
                continue
            yield self._item(
                'goal_review', goal.root_id, roots, goal.id, goal.name, datetime.fromisoformat(due).date(),
                f'/{goal.root_id}/goals?goal={goal.id}', overdue=due < today.isoformat(),
            )

    def _program_day(self, user_id, roots, today, _now, zone):
        end = today + timedelta(days=HORIZON_DAYS - 1)
        read_model = ProgramDayReadModelService(self.db_session)
        programs = self.db_session.query(Program).options(*feed_load_options()).filter(
            Program.root_id.in_(roots),
            Program.start_date < datetime.combine(end + timedelta(days=1), time.min),
            Program.end_date >= datetime.combine(today, time.min),
        ).all()
        for program in programs:
            facts = read_model.build_range_facts(program.root_id, user_id, program, today, end, zone)['facts']
            for fact in facts:
                if fact['state'] not in OPEN_STATES:
                    continue
                for row in fact['occurrences']:
                    day = row['program_day']
                    yield self._item(
                        'program_day', program.root_id, roots, day.id, day.name or program.name, fact['date'],
                        f'/{program.root_id}/create-session?source=program', program_id=program.id,
                    )

    def _open_session(self, user_id, roots, _today, now, zone):
        opened_before = (now - OPEN_SESSION_AFTER).replace(tzinfo=None)
        for session in self.db_session.query(Session).filter(
            Session.owner_id == user_id, Session.root_id.in_(roots), Session.completed.is_not(True),
            Session.deleted_at.is_(None), Session.session_start.isnot(None), Session.session_start < opened_before,
        ):
            started = session.session_start.replace(tzinfo=timezone.utc).astimezone(zone)
            yield self._item(
                'open_session', session.root_id, roots, session.id, session.name, started.date(),
                f'/{session.root_id}/session/{session.id}', started_at=serialize_utc(session.session_start),
            )
