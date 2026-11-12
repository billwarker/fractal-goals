"""Mixin for LandingPublishService: the live demo's draft, eligibility, snapshot status and tour options.

The draft names *source* fractals (admin-owned) by `root_id`. Publishing copies each one
into the demo account; the private `snapshots` map (source → snapshot root, taken at,
counts) lives beside the draft and is never published.
"""

import logging
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from models import AppSetting, Goal, Note, Session, User
from services.programs import ProgramService
from services.serializers import format_utc
from services.service_types import JsonDict, ServiceResult
from services.session_service import SessionService
from services._landing_common import (
    LANDING_EXAMPLE_CACHE_KEY,
    LANDING_EXAMPLE_DELIVERY_KEY,
    LANDING_EXAMPLE_OPTIONS_SESSIONS_LIMIT,
    LANDING_EXAMPLE_SETTINGS_KEY,
    LANDING_EXAMPLE_TOUR_KEYS,
)

logger = logging.getLogger(__name__)


def _parse_utc(value) -> datetime | None:
    """A stored timestamp (naive UTC datetime or ISO string) as an aware UTC datetime."""
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class _LandingSettingsMixin:
    db_session: Any

    def _get_app_setting_value(self, key: str, default):
        setting = self.db_session.get(AppSetting, key)
        if setting is None or setting.value is None:
            return deepcopy(default)
        return deepcopy(setting.value)

    def _set_app_setting_value(self, key: str, value):
        setting = self.db_session.get(AppSetting, key)
        if setting is None:
            setting = AppSetting(key=key, value=value)
            self.db_session.add(setting)
        else:
            setting.value = value
            flag_modified(setting, "value")
        return setting

    def _get_landing_settings(self) -> JsonDict:
        settings = self._get_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {}) or {}
        return {
            "examples": settings.get("examples") or [],
            "snapshots": settings.get("snapshots") or {},
        }

    def _list_admin_owned_roots(self) -> list[Goal]:
        return self.db_session.query(Goal).join(
            User,
            Goal.owner_id == User.id,
        ).options(
            selectinload(Goal.level),
        ).filter(
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
            User.role == "admin",
            User.is_active.is_(True),
        ).order_by(
            User.username.asc(),
            Goal.created_at.desc(),
            Goal.name.asc(),
        ).all()

    def _serialize_landing_eligible_fractal(self, root: Goal) -> JsonDict:
        return {
            "root_id": root.id,
            "name": root.name,
            "description": root.description,
            "owner": getattr(getattr(root, "owner", None), "username", None),
            "level_name": getattr(getattr(root, "level", None), "name", None),
        }

    @staticmethod
    def _normalize_landing_example_tour(item: JsonDict) -> JsonDict:
        # Drafts saved before the snapshot demo kept these picks under `showcase`.
        tour = item.get("tour") or item.get("showcase") or {}
        return {key: tour.get(key) or None for key in LANDING_EXAMPLE_TOUR_KEYS}

    def _normalize_landing_example_settings(self, examples: list[JsonDict]) -> list[JsonDict]:
        normalized = [
            {
                "root_id": item["root_id"],
                "label": item["label"],
                "sort_order": int(item.get("sort_order", index)),
                "tour": self._normalize_landing_example_tour(item),
            }
            for index, item in enumerate(examples or [])
        ]
        return sorted(normalized, key=lambda item: (item["sort_order"], item["label"].lower()))

    def _validate_landing_example_roots(self, examples: list[JsonDict]) -> tuple[dict[str, Goal], str | None, int]:
        root_ids = [item["root_id"] for item in examples]
        if not root_ids:
            return {}, None, 200

        roots = self.db_session.query(Goal).join(
            User,
            Goal.owner_id == User.id,
        ).filter(
            Goal.id.in_(root_ids),
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
            User.role == "admin",
            User.is_active.is_(True),
        ).all()
        roots_by_id = {root.id: root for root in roots}
        missing = [root_id for root_id in root_ids if root_id not in roots_by_id]
        if missing:
            return {}, "Demo fractals must be active root fractals owned by active admins", 400
        return roots_by_id, None, 200

    def _source_last_changed(self, root_id: str):
        """The latest edit to the source's goals, sessions or notes."""
        latest = [
            self.db_session.query(func.max(model.updated_at)).filter(model.root_id == root_id).scalar()
            for model in (Goal, Session, Note)
        ]
        latest = [value for value in latest if value is not None]
        return max(latest) if latest else None

    def _snapshot_status(self, source_root_id: str, snapshot: JsonDict | None) -> JsonDict | None:
        if not snapshot:
            return None
        last_changed = _parse_utc(self._source_last_changed(source_root_id))
        taken_at = _parse_utc(snapshot.get("taken_at"))
        return {
            **snapshot,
            "source_changed": last_changed is not None and taken_at is not None and last_changed > taken_at,
        }

    def get_landing_example_settings(self) -> ServiceResult[JsonDict]:
        eligible_roots = self._list_admin_owned_roots()
        settings = self._get_landing_settings()
        draft_examples = self._normalize_landing_example_settings(settings["examples"])
        cache = self._get_app_setting_value(LANDING_EXAMPLE_CACHE_KEY, {"published_at": None, "examples": []})
        delivery = self._get_app_setting_value(LANDING_EXAMPLE_DELIVERY_KEY, {})
        return {
            "eligible_fractals": [self._serialize_landing_eligible_fractal(root) for root in eligible_roots],
            "examples": [
                {**example, "snapshot": self._snapshot_status(example["root_id"], settings["snapshots"].get(example["root_id"]))}
                for example in draft_examples
            ],
            "published_at": cache.get("published_at"),
            "published_example_count": len(cache.get("examples") or []),
            "delivery": delivery,
        }, None, 200

    def update_landing_example_settings(self, data: JsonDict) -> ServiceResult[JsonDict]:
        examples = self._normalize_landing_example_settings(data.get("examples", []))
        _, error, status = self._validate_landing_example_roots(examples)
        if error:
            return None, error, status

        settings = self._get_landing_settings()
        self._set_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {**settings, "examples": examples})
        self.db_session.commit()
        return self.get_landing_example_settings()

    def get_landing_example_options(self, root_id: str) -> ServiceResult[JsonDict]:
        """The sessions and programs an admin can feature in the tour, for one source fractal."""
        roots_by_id, error, status = self._validate_landing_example_roots([{"root_id": root_id}])
        if error:
            return None, error, status
        root = roots_by_id[root_id]
        owner_id = root.owner_id

        sessions_result, sessions_error, _ = SessionService(self.db_session).get_fractal_sessions(
            root.id,
            owner_id,
            limit=LANDING_EXAMPLE_OPTIONS_SESSIONS_LIMIT,
            offset=0,
            filters={"sort_by": "session_start", "sort_order": "desc"},
        )
        sessions = sessions_result.get("sessions", []) if sessions_result and not sessions_error else []

        try:
            programs = ProgramService.get_programs(self.db_session, root.id, owner_id)
        except SQLAlchemyError:
            logger.warning("Demo options could not load programs for root_id=%s", root.id, exc_info=True)
            programs = []

        return {
            "root_id": root.id,
            "sessions": [
                {
                    "id": session.get("id"),
                    "name": session.get("name"),
                    "session_start": session.get("session_start"),
                    "activity_instance_count": len(session.get("activity_instances") or []),
                }
                for session in sessions
            ],
            "programs": [
                {
                    "id": program.get("id"),
                    "name": program.get("name"),
                    "start_date": program.get("start_date"),
                    "end_date": program.get("end_date"),
                }
                for program in programs
            ],
        }, None, 200
