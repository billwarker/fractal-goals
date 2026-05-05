from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from statistics import median
from typing import Any

import models
from models import (
    ActivityDurationStats,
    ActivityInstance,
    Session,
    SessionTemplate,
    SessionTemplateStats,
    TemplateSectionStats,
)
from sqlalchemy.orm import selectinload


MAX_DURATION_SECONDS = 24 * 60 * 60


def _safe_json(value: Any, fallback: Any):
    return models._safe_load_json(value, fallback)


def _format_utc(value):
    if not value:
        return None
    if isinstance(value, str):
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def _as_datetime(value):
    if not value:
        return None
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None
    return value


def _duration_from_session(session: Session):
    if session.total_duration_seconds is not None:
        seconds = int(session.total_duration_seconds)
    elif session.session_start and session.session_end:
        seconds = int((session.session_end - session.session_start).total_seconds())
    elif session.duration_minutes is not None:
        seconds = int(session.duration_minutes) * 60
    else:
        return None

    if seconds <= 0 or seconds > MAX_DURATION_SECONDS:
        return None
    return seconds


def _duration_from_instance(instance: ActivityInstance):
    if instance.duration_seconds is None:
        return None
    seconds = int(instance.duration_seconds)
    if seconds <= 0 or seconds > MAX_DURATION_SECONDS:
        return None
    return seconds


def _observed_at(session: Session):
    return session.session_start or session.completed_at or session.updated_at or session.created_at


def _summary(values):
    cleaned = [int(value) for value in values if value is not None]
    if not cleaned:
        return {
            "sample_count": 0,
            "average_duration_seconds": None,
            "median_duration_seconds": None,
            "min_duration_seconds": None,
            "max_duration_seconds": None,
        }
    return {
        "sample_count": len(cleaned),
        "average_duration_seconds": int(round(sum(cleaned) / len(cleaned))),
        "median_duration_seconds": int(round(median(cleaned))),
        "min_duration_seconds": min(cleaned),
        "max_duration_seconds": max(cleaned),
    }


def _section_key(section, index):
    if not isinstance(section, dict):
        return None
    for key in ("template_section_id", "id"):
        value = section.get(key)
        if isinstance(value, str) and value:
            return value
    name = str(section.get("name") or "").strip().lower()
    return f"legacy:{index}:{name}" if name else f"legacy:{index}"


class SessionTemplateStatsService:
    """Derived session/template duration intelligence.

    The source of truth stays in sessions and activity instances. This service
    exposes a stable stats contract that can later be backed by persisted cache
    rows without changing serializers or UI callers.
    """

    def __init__(self, db_session):
        self.db_session = db_session

    def _serialize_template_row(self, row):
        if not row:
            return None
        section_rows = self.db_session.query(TemplateSectionStats).filter(
            TemplateSectionStats.template_id == row.template_id,
            TemplateSectionStats.root_id == row.root_id,
        ).all()
        return {
            "usage_count": row.usage_count or 0,
            "session_count": row.session_count or 0,
            "sample_count": row.session_count or 0,
            "average_duration_seconds": row.average_duration_seconds,
            "median_duration_seconds": row.median_duration_seconds,
            "min_duration_seconds": row.min_duration_seconds,
            "max_duration_seconds": row.max_duration_seconds,
            "last_used_at": _format_utc(row.last_used_at),
            "section_stats": {
                section.section_key: {
                    "sample_count": section.sample_count or 0,
                    "average_duration_seconds": section.average_duration_seconds,
                    "median_duration_seconds": section.median_duration_seconds,
                    "min_duration_seconds": section.min_duration_seconds,
                    "max_duration_seconds": section.max_duration_seconds,
                    "calculation_version": section.calculation_version or 1,
                }
                for section in section_rows
            },
            "calculation_version": row.calculation_version or 1,
        }

    def _serialize_activity_row(self, row):
        if not row:
            return None
        return {
            "sample_count": row.sample_count or 0,
            "average_duration_seconds": row.average_duration_seconds,
            "median_duration_seconds": row.median_duration_seconds,
            "min_duration_seconds": row.min_duration_seconds,
            "max_duration_seconds": row.max_duration_seconds,
            "last_observed_at": _format_utc(row.last_observed_at),
            "calculation_version": row.calculation_version or 1,
        }

    def persisted_stats_for_templates(self, root_id, template_ids):
        ids = [template_id for template_id in template_ids if template_id]
        if not ids:
            return {}
        rows = self.db_session.query(SessionTemplateStats).filter(
            SessionTemplateStats.root_id == root_id,
            SessionTemplateStats.template_id.in_(ids),
        ).all()
        return {
            row.template_id: self._serialize_template_row(row)
            for row in rows
        }

    def persisted_activity_duration_stats(self, root_id, activity_definition_ids=None):
        query = self.db_session.query(ActivityDurationStats).filter(
            ActivityDurationStats.root_id == root_id,
        )
        if activity_definition_ids:
            query = query.filter(ActivityDurationStats.activity_definition_id.in_(activity_definition_ids))
        return {
            row.activity_definition_id: self._serialize_activity_row(row)
            for row in query.all()
        }

    def stats_for_templates(self, root_id, template_ids):
        ids = [template_id for template_id in template_ids if template_id]
        if not ids:
            return {}

        sessions = self.db_session.query(Session).options(
            selectinload(Session.activity_instances),
        ).filter(
            Session.root_id == root_id,
            Session.template_id.in_(ids),
            Session.deleted_at.is_(None),
        ).all()

        stats = {
            template_id: {
                "usage_count": 0,
                "session_count": 0,
                "average_duration_seconds": None,
                "median_duration_seconds": None,
                "min_duration_seconds": None,
                "max_duration_seconds": None,
                "last_used_at": None,
                "section_stats": {},
                "calculation_version": 1,
            }
            for template_id in ids
        }
        durations_by_template = defaultdict(list)
        section_durations = defaultdict(lambda: defaultdict(list))
        last_used_by_template = {}

        for session in sessions:
            template_id = session.template_id
            if template_id not in stats:
                continue
            stats[template_id]["usage_count"] += 1

            observed_at = _observed_at(session)
            if observed_at and (
                template_id not in last_used_by_template
                or observed_at > last_used_by_template[template_id]
            ):
                last_used_by_template[template_id] = observed_at

            duration = _duration_from_session(session)
            if session.completed and duration is not None:
                durations_by_template[template_id].append(duration)

            if not session.completed:
                continue

            attrs = _safe_json(session.attributes, {})
            session_data = attrs.get("session_data") if isinstance(attrs, dict) else None
            if not isinstance(session_data, dict):
                session_data = attrs if isinstance(attrs, dict) else {}
            sections = session_data.get("sections") if isinstance(session_data, dict) else None
            if not isinstance(sections, list):
                continue

            instance_by_id = {
                instance.id: instance
                for instance in session.activity_instances or []
                if not instance.deleted_at
            }
            for index, section in enumerate(sections):
                key = _section_key(section, index)
                if not key:
                    continue
                activity_ids = section.get("activity_ids") if isinstance(section, dict) else None
                if not isinstance(activity_ids, list):
                    continue
                section_seconds = 0
                for instance_id in activity_ids:
                    instance = instance_by_id.get(instance_id)
                    instance_duration = _duration_from_instance(instance) if instance else None
                    if instance_duration is not None:
                        section_seconds += instance_duration
                if section_seconds > 0:
                    section_durations[template_id][key].append(section_seconds)

        for template_id in ids:
            duration_summary = _summary(durations_by_template[template_id])
            stats[template_id].update(duration_summary)
            stats[template_id]["session_count"] = duration_summary["sample_count"]
            stats[template_id]["last_used_at"] = _format_utc(last_used_by_template.get(template_id))
            stats[template_id]["section_stats"] = {
                key: _summary(values)
                for key, values in section_durations[template_id].items()
            }

        return stats

    def persist_template_stats(self, root_id, template_id, stats):
        row = self.db_session.get(SessionTemplateStats, template_id)
        if not row:
            row = SessionTemplateStats(template_id=template_id, root_id=root_id)
            self.db_session.add(row)

        row.root_id = root_id
        row.usage_count = int(stats.get("usage_count") or 0)
        row.session_count = int(stats.get("session_count") or stats.get("sample_count") or 0)
        row.average_duration_seconds = stats.get("average_duration_seconds")
        row.median_duration_seconds = stats.get("median_duration_seconds")
        row.min_duration_seconds = stats.get("min_duration_seconds")
        row.max_duration_seconds = stats.get("max_duration_seconds")
        row.last_used_at = _as_datetime(stats.get("last_used_at"))
        row.calculation_version = int(stats.get("calculation_version") or 1)
        row.updated_at = models.utc_now()

        existing_sections = {
            section.section_key: section
            for section in self.db_session.query(TemplateSectionStats).filter(
                TemplateSectionStats.root_id == root_id,
                TemplateSectionStats.template_id == template_id,
            ).all()
        }
        next_section_keys = set()
        for section_key, section_stats in (stats.get("section_stats") or {}).items():
            next_section_keys.add(section_key)
            section_row = existing_sections.get(section_key)
            if not section_row:
                section_row = TemplateSectionStats(
                    template_id=template_id,
                    section_key=section_key,
                    root_id=root_id,
                )
                self.db_session.add(section_row)
            section_row.sample_count = int(section_stats.get("sample_count") or 0)
            section_row.average_duration_seconds = section_stats.get("average_duration_seconds")
            section_row.median_duration_seconds = section_stats.get("median_duration_seconds")
            section_row.min_duration_seconds = section_stats.get("min_duration_seconds")
            section_row.max_duration_seconds = section_stats.get("max_duration_seconds")
            section_row.calculation_version = int(section_stats.get("calculation_version") or 1)
            section_row.updated_at = models.utc_now()

        for section_key, section_row in existing_sections.items():
            if section_key not in next_section_keys:
                self.db_session.delete(section_row)

        self.db_session.flush()
        return self._serialize_template_row(row)

    def recompute_template_stats(self, root_id, template_id):
        stats = self.stats_for_templates(root_id, [template_id]).get(template_id)
        if stats is None:
            return None
        return self.persist_template_stats(root_id, template_id, stats)

    def activity_duration_stats(self, root_id, activity_definition_ids=None):
        query = self.db_session.query(ActivityInstance).join(
            Session,
            Session.id == ActivityInstance.session_id,
        ).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None),
            ActivityInstance.completed.is_(True),
            Session.deleted_at.is_(None),
        )
        if activity_definition_ids:
            query = query.filter(ActivityInstance.activity_definition_id.in_(activity_definition_ids))

        durations_by_activity = defaultdict(list)
        last_observed = {}
        for instance in query.all():
            seconds = _duration_from_instance(instance)
            if seconds is None:
                continue
            activity_id = instance.activity_definition_id
            durations_by_activity[activity_id].append(seconds)
            observed_at = instance.time_stop or instance.updated_at or instance.created_at
            if observed_at and (
                activity_id not in last_observed
                or observed_at > last_observed[activity_id]
            ):
                last_observed[activity_id] = observed_at

        return {
            activity_id: {
                **_summary(values),
                "last_observed_at": _format_utc(last_observed.get(activity_id)),
                "calculation_version": 1,
            }
            for activity_id, values in durations_by_activity.items()
        }

    def persist_activity_stats(self, root_id, activity_definition_id, stats):
        row = self.db_session.get(ActivityDurationStats, (root_id, activity_definition_id))
        if not row:
            row = ActivityDurationStats(root_id=root_id, activity_definition_id=activity_definition_id)
            self.db_session.add(row)
        row.sample_count = int(stats.get("sample_count") or 0)
        row.average_duration_seconds = stats.get("average_duration_seconds")
        row.median_duration_seconds = stats.get("median_duration_seconds")
        row.min_duration_seconds = stats.get("min_duration_seconds")
        row.max_duration_seconds = stats.get("max_duration_seconds")
        row.last_observed_at = _as_datetime(stats.get("last_observed_at"))
        row.calculation_version = int(stats.get("calculation_version") or 1)
        row.updated_at = models.utc_now()
        self.db_session.flush()
        return self._serialize_activity_row(row)

    def recompute_activity_stats(self, root_id, activity_definition_ids=None):
        ids = [activity_id for activity_id in (activity_definition_ids or []) if activity_id]
        if not ids:
            ids = [
                activity_id
                for (activity_id,) in self.db_session.query(ActivityInstance.activity_definition_id).filter(
                    ActivityInstance.root_id == root_id,
                    ActivityInstance.deleted_at.is_(None),
                ).distinct().all()
                if activity_id
            ]
        computed = self.activity_duration_stats(root_id, ids)
        persisted = {}
        for activity_id in ids:
            stats = computed.get(activity_id) or {
                **_summary([]),
                "last_observed_at": None,
                "calculation_version": 1,
            }
            persisted[activity_id] = self.persist_activity_stats(root_id, activity_id, stats)
        return persisted

    def recompute_for_session(self, session_or_id):
        session = session_or_id
        if isinstance(session_or_id, str):
            session = self.db_session.query(Session).options(
                selectinload(Session.activity_instances),
            ).filter(Session.id == session_or_id).first()
        if not session:
            return {}

        result = {"template": None, "activity_durations": {}}
        if session.template_id:
            result["template"] = self.recompute_template_stats(session.root_id, session.template_id)
        activity_ids = sorted({
            instance.activity_definition_id
            for instance in (session.activity_instances or [])
            if instance.activity_definition_id
        })
        if activity_ids:
            result["activity_durations"] = self.recompute_activity_stats(session.root_id, activity_ids)
        return result

    def rebuild_root(self, root_id):
        template_ids = [
            template_id
            for (template_id,) in self.db_session.query(SessionTemplate.id).filter(
                SessionTemplate.root_id == root_id,
                SessionTemplate.deleted_at.is_(None),
            ).all()
        ]
        templates = {
            template_id: self.recompute_template_stats(root_id, template_id)
            for template_id in template_ids
        }
        activities = self.recompute_activity_stats(root_id)
        return {
            "templates": templates,
            "activities": activities,
        }
