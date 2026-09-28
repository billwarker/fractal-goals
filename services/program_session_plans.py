"""Dated program session plans: one template's planned session for one program-day date.

A plan is an independent snapshot of a template's sections whose activity items may
carry planned values and notes (``prescription``). Plans are *virtual* until first
saved: reading an unplanned occurrence returns a seed built from the latest earlier
visible plan of the same day and template, else from the template itself. Template
edits never rewrite plans; ``template_changed`` offers an explicit pull instead.

Plans are reference-only programming. They never create targets, credit program
days, or change session results.
"""
import copy
import functools
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

import models
from models import (
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDayTemplate,
    ProgramSessionPlan,
    Session,
    SessionTemplate,
    validate_root_goal,
)
from models.program import get_program_day_template_rules
from services import Event, Events, event_bus
from services.plan_sections import (
    merge_template_changes,
    section_names as _section_names,
    stored_plan_sections as _plan_sections,
    typed_template_sections,
)
from services.prescriptions import check_section_prescriptions
from services.program_metrics_service import MAX_WINDOW_DAYS
from services.program_day_occurrences import date_part, iter_dates, program_day_scheduled_on
from services.quota_service import QuotaService
from services.session_filters import resolve_timezone
from services.session_runtime import get_template_color
from validators.core import validate_section_items

# Occurrence statuses come from the day read model, so share its window cap.
MAX_OCCURRENCE_WINDOW_DAYS = MAX_WINDOW_DAYS
CANDIDATE_LOOKBACK_DAYS = 14
MAX_PLAN_SECTIONS = 50
MAX_PLAN_ITEMS = 200
SEED_SCAN_LIMIT = 30

SOURCE_PLAN = 'plan'
SOURCE_PREVIOUS_PLAN = 'previous_plan'
SOURCE_TEMPLATE = 'template'


class PlanRequestError(Exception):
    """A plan request that cannot proceed; carries the HTTP-style status for the route."""

    def __init__(self, message, status):
        super().__init__(message)
        self.message = message
        self.status = status


def _handles_plan_errors(method):
    """Turn PlanRequestError into a rolled-back ``(None, message, status)`` service result."""
    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        try:
            return method(self, *args, **kwargs)
        except PlanRequestError as exc:
            self.db_session.rollback()
            return None, exc.message, exc.status
    return wrapper


@dataclass
class _PlanTarget:
    """The locked program day, template rule, date, and stored plan (if any) a write acts on."""
    day: ProgramDay
    block: ProgramBlock
    rule: dict
    plan_date: date
    stored: ProgramSessionPlan | None


def _iso(value):
    value = date_part(value)
    return value.isoformat() if value else None


def _parse_date(value, field='date'):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ValueError(f'Invalid {field}. Use YYYY-MM-DD.')


def _day_row(fact, day):
    """This program day's occurrence row within one date fact, if it occurs then."""
    if fact is None:
        return None
    return next((row for row in fact["occurrences"] if row["program_day"].id == day.id), None)


def _occurrence_statuses(facts_by_date, day, dates):
    """Canonical day status inputs for each of a day's dates, and the sessions credited to it.

    Uses the same evaluator facts as the calendar and day review, so the Days tab shows the
    same check, X, moon, or scheduled circle for an occurrence.
    """
    statuses = {}
    for value in dates:
        fact = facts_by_date.get(value)
        row = _day_row(fact, day)
        if row is None:
            continue
        statuses[value] = {
            'state': fact["state"],
            'manual_status': fact["manual_status"],
            'closed': fact["closed"],
            'program_day_completed': bool(row["evaluation"]["requirements_met"]),
            'sessions': [
                {
                    'id': credit["session"].id,
                    'name': credit["session"].name,
                    'completed': bool(credit["session"].completed),
                    'template_id': credit["template_id"],
                }
                for credit in _unique_credits(row["credits"])
            ],
        }
    return statuses


def _unique_credits(credits):
    """One credit per session (a session credits each template at most once per occurrence)."""
    seen = {}
    for credit in credits or []:
        seen.setdefault(credit["session"].id, credit)
    return list(seen.values())


class ProgramSessionPlanService:
    """Read models and mutations for dated program session plans; routes stay thin."""

    def __init__(self, db_session):
        self.db_session = db_session

    # ------------------------------------------------------------------ loading

    def _load_day(self, root_id, owner_id, program_id, day_id, *, for_update=False):
        if not validate_root_goal(self.db_session, root_id, owner_id=owner_id):
            raise PlanRequestError("Fractal not found or access denied", 404)
        query = (
            self.db_session.query(ProgramDay)
            .join(ProgramBlock, ProgramBlock.id == ProgramDay.block_id)
            .join(Program, Program.id == ProgramBlock.program_id)
            .options(
                joinedload(ProgramDay.block).joinedload(ProgramBlock.program),
                selectinload(ProgramDay.template_links).joinedload(ProgramDayTemplate.template),
            )
            .filter(
                ProgramDay.id == day_id,
                Program.id == program_id,
                Program.root_id == root_id,
            )
        )
        if for_update:
            query = query.populate_existing().with_for_update(of=ProgramDay)
        day = query.first()
        if day is None:
            raise PlanRequestError("Program day not found", 404)
        return day, day.block

    def _occurrence_date(self, day, block, raw_date):
        try:
            plan_date = _parse_date(raw_date)
        except ValueError as exc:
            raise PlanRequestError(str(exc), 400)
        if not program_day_scheduled_on(day, block, plan_date):
            raise PlanRequestError('This program day does not occur on that date', 404)
        return plan_date

    def _template_rule(self, day, template_id):
        return next(
            (rule for rule in get_program_day_template_rules(day) if rule['template_id'] == template_id),
            None,
        )

    def _stored_plan(self, day_id, template_id, plan_date, *, for_update=False):
        query = self.db_session.query(ProgramSessionPlan).filter(
            ProgramSessionPlan.program_day_id == day_id,
            ProgramSessionPlan.session_template_id == template_id,
            ProgramSessionPlan.date == plan_date,
            ProgramSessionPlan.deleted_at.is_(None),
        )
        if for_update:
            query = query.with_for_update()
        return query.first()

    def _previous_plan(self, day, block, template_id, plan_date):
        """Latest earlier plan whose date is still an occurrence (dormant plans never seed)."""
        candidates = (
            self.db_session.query(ProgramSessionPlan)
            .filter(
                ProgramSessionPlan.program_day_id == day.id,
                ProgramSessionPlan.session_template_id == template_id,
                ProgramSessionPlan.date < plan_date,
                ProgramSessionPlan.deleted_at.is_(None),
            )
            .order_by(ProgramSessionPlan.date.desc())
            .limit(SEED_SCAN_LIMIT)
            .all()
        )
        return next(
            (plan for plan in candidates if program_day_scheduled_on(day, block, date_part(plan.date))),
            None,
        )

    def _executed_sessions(self, plan_ids):
        if not plan_ids:
            return {}
        rows = (
            self.db_session.query(Session)
            .filter(
                Session.program_session_plan_id.in_(plan_ids),
                Session.deleted_at.is_(None),
            )
            .order_by(Session.created_at.asc())
            .all()
        )
        executed = {}
        for session in rows:
            executed.setdefault(session.program_session_plan_id, []).append({
                'id': session.id,
                'name': session.name,
                'completed': bool(session.completed),
            })
        return executed

    def _resolve(self, day, block, template, plan_date, *, stored=None):
        """The effective plan state for one template occurrence, stored or virtual."""
        previous = self._previous_plan(day, block, template.id, plan_date)
        if stored is not None:
            source = SOURCE_PLAN
            sections = _plan_sections(stored)
            source_revision = stored.source_template_revision
        elif previous is not None:
            source = SOURCE_PREVIOUS_PLAN
            sections = _plan_sections(previous)
            source_revision = previous.source_template_revision
        else:
            source = SOURCE_TEMPLATE
            sections = typed_template_sections(template)
            source_revision = template.revision or 1
        return {
            'stored': stored,
            'previous': previous,
            'source': source,
            'sections': sections,
            'source_revision': source_revision,
        }

    def _serialize(self, template, rule, plan_date, resolved, executed_sessions):
        stored = resolved['stored']
        previous = resolved['previous']
        return {
            'template': {
                'id': template.id,
                'name': template.name,
                'color': get_template_color(template.template_data),
                'revision': template.revision or 1,
            },
            'is_required': bool(rule['is_required']) if rule else True,
            'date': plan_date.isoformat(),
            'plan_id': stored.id if stored else None,
            'row_version': stored.row_version if stored else None,
            'source': resolved['source'],
            'seeded_from_date': previous.date.isoformat() if previous and not stored else None,
            'template_changed': resolved['source_revision'] < (template.revision or 1),
            'sections': resolved['sections'],
            # The previous plan's values show as placeholders so the user sees the step.
            'previous': {
                'date': previous.date.isoformat(),
                'sections': _plan_sections(previous),
            } if previous else None,
            'executed_sessions': executed_sessions,
        }

    # ------------------------------------------------------------------ reads

    def _load_program(self, root_id, owner_id, program_id):
        if not validate_root_goal(self.db_session, root_id, owner_id=owner_id):
            raise PlanRequestError("Fractal not found or access denied", 404)
        program = (
            self.db_session.query(Program)
            .options(
                selectinload(Program.blocks)
                .selectinload(ProgramBlock.days)
                .selectinload(ProgramDay.template_links)
                .joinedload(ProgramDayTemplate.template),
            )
            .filter(Program.id == program_id, Program.root_id == root_id)
            .first()
        )
        if program is None:
            raise PlanRequestError("Program not found", 404)
        return program

    @staticmethod
    def _occurrence_window(program, local_today):
        """The program's span, capped at the read model window around today for very long programs."""
        start = date_part(program.start_date)
        end = date_part(program.end_date)
        if start is None or end is None or end < start:
            return None, None
        if (end - start).days + 1 > MAX_OCCURRENCE_WINDOW_DAYS:
            half = MAX_OCCURRENCE_WINDOW_DAYS // 2
            start = max(start, min(local_today - timedelta(days=half), end - timedelta(days=MAX_OCCURRENCE_WINDOW_DAYS - 1)))
            end = start + timedelta(days=MAX_OCCURRENCE_WINDOW_DAYS - 1)
        return start, end

    @_handles_plan_errors
    def list_program_occurrences(self, root_id, owner_id, program_id, timezone_name=None):
        """Every plannable program day's dates, with plan states and canonical day statuses.

        One evaluator pass covers the whole program, so the Days side pane can show every
        day's status rail without a request per day.
        """
        zone = resolve_timezone(timezone_name)
        if zone is None:
            raise PlanRequestError('Invalid timezone', 400)
        program = self._load_program(root_id, owner_id, program_id)
        start, end = self._occurrence_window(program, datetime.now(zone).date())
        if start is None or end is None:
            return {'program_id': program.id, 'days': []}, None, 200

        dated_days = []
        for block in program.blocks or []:
            for day in block.days or []:
                rules = get_program_day_template_rules(day)
                if not rules:
                    continue
                dates = [value for value in iter_dates(start, end) if program_day_scheduled_on(day, block, value)]
                dated_days.append((day, rules, dates))
        day_ids = [day.id for day, _, _ in dated_days]
        plans = self.db_session.query(ProgramSessionPlan).filter(
            ProgramSessionPlan.program_day_id.in_(day_ids),
            ProgramSessionPlan.date >= start,
            ProgramSessionPlan.date <= end,
            ProgramSessionPlan.deleted_at.is_(None),
        ).all() if day_ids else []
        plan_by_key = {(plan.program_day_id, plan.session_template_id, date_part(plan.date)): plan for plan in plans}
        executed = self._executed_sessions([plan.id for plan in plans])
        facts_by_date = self._facts_by_date(root_id, owner_id, program, start, end, zone) if day_ids else {}

        days = []
        for day, rules, dates in dated_days:
            statuses = _occurrence_statuses(facts_by_date, day, dates)
            occurrences = []
            for value in dates:
                templates = []
                for rule in rules:
                    plan = plan_by_key.get((day.id, rule['template_id'], value))
                    state = 'seeded'
                    if plan:
                        state = 'executed' if executed.get(plan.id) else 'planned'
                    templates.append({'template_id': rule['template_id'], 'plan_id': plan.id if plan else None, 'state': state})
                occurrences.append({'date': value.isoformat(), 'templates': templates, **statuses.get(value, {})})
            days.append({'day_id': day.id, 'dates': occurrences})
        return {
            'program_id': program.id,
            'window': {'start': start.isoformat(), 'end': end.isoformat()},
            'days': days,
        }, None, 200

    def _facts_by_date(self, root_id, owner_id, program, start, end, zone):
        from services.program_day_read_model_service import ProgramDayReadModelService

        facts = ProgramDayReadModelService(self.db_session).build_range_facts(
            root_id, owner_id, program, start, end, zone,
        )["facts"]
        return {fact["date"]: fact for fact in facts}

    def _logged_sessions_by_template(self, root_id, owner_id, block, day, plan_date, zone):
        """Sessions credited to this occurrence, grouped by the template they count as.

        The Days tab shows these sessions (as on the Sessions page) in place of the plan.
        """
        if plan_date > datetime.now(zone).date():
            return {}
        facts_by_date = self._facts_by_date(root_id, owner_id, block.program, plan_date, plan_date, zone)
        row = _day_row(facts_by_date.get(plan_date), day)
        if row is None:
            return {}
        logged = {}
        for credit in _unique_credits(row["credits"]):
            session = credit["session"]
            logged.setdefault(credit["template_id"], []).append({
                'id': session.id,
                'name': session.name,
                'completed': bool(session.completed),
            })
        return logged

    @_handles_plan_errors
    def get_day_plans(self, root_id, owner_id, program_id, day_id, raw_date, timezone_name=None):
        day, block = self._load_day(root_id, owner_id, program_id, day_id)
        plan_date = self._occurrence_date(day, block, raw_date)
        zone = resolve_timezone(timezone_name)
        if zone is None:
            raise PlanRequestError('Invalid timezone', 400)
        logged_by_template = self._logged_sessions_by_template(root_id, owner_id, block, day, plan_date, zone)

        rules = get_program_day_template_rules(day)
        stored_by_template = {
            plan.session_template_id: plan
            for plan in self.db_session.query(ProgramSessionPlan).filter(
                ProgramSessionPlan.program_day_id == day.id,
                ProgramSessionPlan.date == plan_date,
                ProgramSessionPlan.deleted_at.is_(None),
            ).all()
        }
        executed = self._executed_sessions([plan.id for plan in stored_by_template.values()])
        plans = []
        for rule in rules:
            template = rule['template']
            stored = stored_by_template.get(template.id)
            resolved = self._resolve(day, block, template, plan_date, stored=stored)
            entry = self._serialize(
                template, rule, plan_date, resolved, executed.get(stored.id, []) if stored else [],
            )
            entry['logged_sessions'] = logged_by_template.get(template.id, [])
            plans.append(entry)
        return {
            'date': plan_date.isoformat(),
            'program_day': {'id': day.id, 'name': day.name, 'block_id': block.id},
            'plans': plans,
        }, None, 200

    # ------------------------------------------------------------------ writes

    def _validate_sections(self, root_id, sections, expected_section_names):
        if not isinstance(sections, list) or not sections:
            raise ValueError('A plan must keep at least one section')
        if len(sections) > MAX_PLAN_SECTIONS:
            raise ValueError(f'A plan can have at most {MAX_PLAN_SECTIONS} sections')
        if _section_names(sections) != expected_section_names:
            raise ValueError("A plan keeps its template's sections; only their activities can change")
        seen_item_keys = set()
        item_count = 0
        for section in sections:
            if not isinstance(section, dict) or not isinstance(section.get('items'), list):
                raise ValueError('Each plan section must list its items')
            item_count += len(section['items'])
            validate_section_items(section['items'], seen_item_keys)
        if item_count > MAX_PLAN_ITEMS:
            raise ValueError(f'A plan can have at most {MAX_PLAN_ITEMS} items')
        check_section_prescriptions(self.db_session, root_id, sections)

    def _materialize(self, day, block, template, plan_date, sections, current_user_id, *, resolved):
        """Stage a new stored plan; the caller owns the transaction."""
        previous = resolved['previous']
        plan = ProgramSessionPlan(
            root_id=block.program.root_id,
            program_id=block.program_id,
            program_day_id=day.id,
            session_template_id=template.id,
            date=plan_date,
            plan_data={'sections': sections},
            source_template_revision=resolved['source_revision'],
            seeded_from_plan_id=previous.id if previous and resolved['source'] == SOURCE_PREVIOUS_PLAN else None,
            created_by_user_id=current_user_id,
        )
        self.db_session.add(plan)
        return plan

    def _load_for_write(
        self, root_id, owner_id, program_id, day_id, template_id, raw_date, timezone_name=None,
    ) -> _PlanTarget:
        zone = resolve_timezone(timezone_name)
        if zone is None:
            raise PlanRequestError('Invalid timezone', 400)
        day, block = self._load_day(root_id, owner_id, program_id, day_id, for_update=True)
        plan_date = self._occurrence_date(day, block, raw_date)
        # Plans program what is still ahead; a past program day keeps the plan it had.
        if plan_date < datetime.now(zone).date():
            raise PlanRequestError("Past program days can't be re-planned", 409)
        rule = self._template_rule(day, template_id)
        if not rule:
            raise PlanRequestError('That template is not part of this program day', 404)
        stored = self._stored_plan(day.id, template_id, plan_date, for_update=True)
        return _PlanTarget(day=day, block=block, rule=rule, plan_date=plan_date, stored=stored)

    def _conflict(self):
        self.db_session.rollback()
        return None, 'This plan changed since you opened it. Reload to see the latest version.', 409

    @_handles_plan_errors
    def save_plan(self, root_id, owner_id, program_id, day_id, template_id, raw_date, data, timezone_name=None):
        target = self._load_for_write(root_id, owner_id, program_id, day_id, template_id, raw_date, timezone_name)
        day, block, rule, plan_date, stored = target.day, target.block, target.rule, target.plan_date, target.stored
        template = rule['template']
        expected_version = data.get('row_version')
        if stored is not None and expected_version != stored.row_version:
            return self._conflict()
        if stored is None and expected_version is not None:
            # The plan this edit started from was reset or never existed.
            return self._conflict()

        resolved = self._resolve(day, block, template, plan_date, stored=stored)
        sections = copy.deepcopy(data.get('sections'))
        try:
            self._validate_sections(root_id, sections, _section_names(resolved['sections']))
        except ValueError as exc:
            self.db_session.rollback()
            return None, str(exc), 400

        quota = QuotaService(self.db_session)
        _, storage_error, storage_status = quota.check_storage_available(
            owner_id, QuotaService._payload_size({'sections': sections}),
        )
        if storage_error:
            self.db_session.rollback()
            return None, storage_error, storage_status

        if stored is None:
            stored = self._materialize(day, block, template, plan_date, sections, owner_id, resolved=resolved)
        else:
            stored.plan_data = {'sections': sections}
        try:
            self.db_session.commit()
        except IntegrityError:
            # Another request materialized the same occurrence first.
            return self._conflict()
        self._emit(Events.PROGRAM_SESSION_PLAN_SAVED, root_id, stored, template)
        return self._reload_entry(day, block, rule, plan_date, stored)

    @_handles_plan_errors
    def reset_plan(self, root_id, owner_id, program_id, day_id, template_id, raw_date, timezone_name=None):
        target = self._load_for_write(root_id, owner_id, program_id, day_id, template_id, raw_date, timezone_name)
        if target.stored is not None:
            target.stored.deleted_at = models.utc_now()  # pyright: ignore[reportAttributeAccessIssue] - legacy Column typing
            self.db_session.commit()
            self._emit(Events.PROGRAM_SESSION_PLAN_RESET, root_id, target.stored, target.rule['template'])
        else:
            self.db_session.rollback()
        return self._reload_entry(target.day, target.block, target.rule, target.plan_date, None)

    @_handles_plan_errors
    def pull_template_changes(self, root_id, owner_id, program_id, day_id, template_id, raw_date, data, timezone_name=None):
        target = self._load_for_write(root_id, owner_id, program_id, day_id, template_id, raw_date, timezone_name)
        day, block, rule, plan_date, stored = target.day, target.block, target.rule, target.plan_date, target.stored
        if stored is not None and data.get('row_version') != stored.row_version:
            return self._conflict()
        template = rule['template']
        resolved = self._resolve(day, block, template, plan_date, stored=stored)
        merged = merge_template_changes(resolved['sections'], typed_template_sections(template))
        try:
            seen_item_keys = set()
            for section in merged:
                validate_section_items(section['items'], seen_item_keys)
            # Planned values whose metrics were since removed from the activity would fail
            # validation; drop just those prescriptions instead of blocking the pull.
            self._drop_invalid_prescriptions(root_id, merged)
        except ValueError as exc:
            self.db_session.rollback()
            return None, str(exc), 400

        if stored is None:
            stored = self._materialize(day, block, template, plan_date, merged, owner_id, resolved=resolved)
        else:
            stored.plan_data = {'sections': merged}
        stored.source_template_revision = template.revision or 1  # pyright: ignore[reportAttributeAccessIssue] - legacy Column typing
        try:
            self.db_session.commit()
        except IntegrityError:
            return self._conflict()
        self._emit(Events.PROGRAM_SESSION_PLAN_SAVED, root_id, stored, template)
        return self._reload_entry(day, block, rule, plan_date, stored)

    def _drop_invalid_prescriptions(self, root_id, sections):
        for section in sections:
            for item in section.get('items') or []:
                if not item.get('prescription'):
                    continue
                try:
                    check_section_prescriptions(self.db_session, root_id, [{'items': [item]}])
                except ValueError:
                    item.pop('prescription', None)

    def _reload_entry(self, day, block, rule, plan_date, stored):
        template = rule['template']
        resolved = self._resolve(day, block, template, plan_date, stored=stored)
        executed = self._executed_sessions([stored.id]) if stored else {}
        return self._serialize(
            template, rule, plan_date, resolved, executed.get(stored.id, []) if stored else [],
        ), None, 200

    @staticmethod
    def _emit(name, root_id, plan, template):
        event_bus.emit(Event(name, {
            'root_id': root_id,
            'program_id': plan.program_id,
            'program_day_id': plan.program_day_id,
            'program_session_plan_id': plan.id,
            'template_id': template.id,
            'template_name': template.name,
            'date': _iso(plan.date),
        }, source=f'ProgramSessionPlanService.{name.rsplit(".", 1)[-1]}'))

    # ------------------------------------------------------------------ sessions

    def plan_candidates(self, root_id, owner_id, template_id, raw_date):
        """Plans a new session of ``template_id`` can execute on ``raw_date``.

        Today's occurrences come first (stored or virtual), then stored plans from the
        previous ``CANDIDATE_LOOKBACK_DAYS`` days that no session has executed yet.
        """
        if not validate_root_goal(self.db_session, root_id, owner_id=owner_id):
            return None, "Fractal not found or access denied", 404
        try:
            target_date = _parse_date(raw_date)
        except ValueError as exc:
            return None, str(exc), 400
        template = self.db_session.query(SessionTemplate).filter(
            SessionTemplate.id == template_id,
            SessionTemplate.root_id == root_id,
            SessionTemplate.deleted_at.is_(None),
        ).first()
        if not template:
            return None, 'Template not found', 404

        days = (
            self.db_session.query(ProgramDay)
            .join(ProgramDayTemplate, ProgramDayTemplate.program_day_id == ProgramDay.id)
            .join(ProgramBlock, ProgramBlock.id == ProgramDay.block_id)
            .join(Program, Program.id == ProgramBlock.program_id)
            .options(joinedload(ProgramDay.block).joinedload(ProgramBlock.program))
            .filter(
                Program.root_id == root_id,
                ProgramDayTemplate.session_template_id == template_id,
            )
            .all()
        )
        today = []
        for day in days:
            if program_day_scheduled_on(day, day.block, target_date):
                today.append((day, target_date, self._stored_plan(day.id, template_id, target_date)))

        lookback_start = target_date - timedelta(days=CANDIDATE_LOOKBACK_DAYS)
        earlier = (
            self.db_session.query(ProgramSessionPlan)
            .options(
                joinedload(ProgramSessionPlan.program_day)
                .joinedload(ProgramDay.block)
                .joinedload(ProgramBlock.program)
            )
            .filter(
                ProgramSessionPlan.root_id == root_id,
                ProgramSessionPlan.session_template_id == template_id,
                ProgramSessionPlan.date >= lookback_start,
                ProgramSessionPlan.date < target_date,
                ProgramSessionPlan.deleted_at.is_(None),
            )
            .order_by(ProgramSessionPlan.date.desc())
            .all()
        )
        stored_ids = [plan.id for _, _, plan in today if plan] + [plan.id for plan in earlier]
        executed = self._executed_sessions(stored_ids)

        candidates = [
            self._candidate(day, plan_date, plan, is_today=True, executed=bool(plan and executed.get(plan.id)))
            for day, plan_date, plan in today
        ]
        for plan in earlier:
            day = plan.program_day
            plan_date = date_part(plan.date)
            if executed.get(plan.id) or not program_day_scheduled_on(day, day.block, plan_date):
                continue
            candidates.append(self._candidate(day, plan_date, plan, is_today=False, executed=False))
        return {'template_id': template_id, 'date': target_date.isoformat(), 'candidates': candidates}, None, 200

    @staticmethod
    def _candidate(day, plan_date, stored, *, is_today, executed):
        program = day.block.program
        return {
            'plan_id': stored.id if stored else None,
            'program_id': program.id,
            'program_name': program.name,
            'program_day_id': day.id,
            'program_day_name': day.name,
            'date': plan_date.isoformat(),
            'is_today': is_today,
            'executed': executed,
        }

    def resolve_for_session(self, root_id, template, ref, current_user_id):
        """Return the stored plan a new session executes, materializing a virtual one.

        ``ref`` is ``{'program_session_plan_id': id}`` or ``{'program_day_id', 'date'}``.
        Staged in the caller's transaction; raises ValueError for a mismatched reference.
        """
        plan_id = ref.get('program_session_plan_id')
        if plan_id:
            plan = self.db_session.query(ProgramSessionPlan).filter(
                ProgramSessionPlan.id == plan_id,
                ProgramSessionPlan.root_id == root_id,
                ProgramSessionPlan.deleted_at.is_(None),
            ).first()
            if not plan:
                raise ValueError('Plan not found in this fractal')
            if plan.session_template_id != template.id:
                raise ValueError('That plan belongs to a different template')
            return plan

        day_id = ref.get('program_day_id')
        plan_date = _parse_date(ref.get('date'))
        day = (
            self.db_session.query(ProgramDay)
            .join(ProgramBlock, ProgramBlock.id == ProgramDay.block_id)
            .join(Program, Program.id == ProgramBlock.program_id)
            .options(
                joinedload(ProgramDay.block).joinedload(ProgramBlock.program),
                selectinload(ProgramDay.template_links).joinedload(ProgramDayTemplate.template),
            )
            .filter(ProgramDay.id == day_id, Program.root_id == root_id)
            .first()
        )
        if not day or not program_day_scheduled_on(day, day.block, plan_date):
            raise ValueError('That program day does not occur on the planned date')
        if not self._template_rule(day, template.id):
            raise ValueError('That template is not part of this program day')
        stored = self._stored_plan(day.id, template.id, plan_date)
        if stored:
            return stored
        resolved = self._resolve(day, day.block, template, plan_date)
        sections = resolved['sections']
        seen_item_keys = set()
        for section in sections:
            validate_section_items(section.get('items') or [], seen_item_keys)
        plan = self._materialize(day, day.block, template, plan_date, sections, current_user_id, resolved=resolved)
        self.db_session.flush()
        return plan


def plan_sections_for_session(plan):
    return _plan_sections(plan)
