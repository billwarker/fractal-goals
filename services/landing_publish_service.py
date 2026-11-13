"""The live demo's publish pipeline: snapshot the chosen fractals, publish a small manifest.

Publishing copies each draft example (an admin-owned source fractal) into the demo
account with `DemoSnapshotService`. Snapshot ids derive from the source's, so demo links
stay the same across publishes. The public manifest (`LANDING_EXAMPLE_CACHE_KEY`,
also written to the static delivery) names the snapshots; `blueprints/demo_access.py`
serves them read-only. Everything happens in one transaction under the publish lock.
"""

import gzip
import logging
import uuid
from contextlib import contextmanager
from time import perf_counter

from sqlalchemy import text

from config import config
from models import Goal, GoalLevel, Program, Session, User, _safe_load_json, utc_now
from services.demo_account_service import DemoAccountService
from services.goal_level_service import GoalLevelService
from services.goal_service import GoalService
from services.demo_snapshot_service import DemoSnapshotService, SnapshotResult, snapshot_root_id
from services.ops_log import log_ops_event
from services.serializers import format_utc, serialize_goal
from services._serialize_common import calculate_smart_status
from services.service_types import JsonDict, ServiceResult
from services._landing_common import (
    LANDING_EXAMPLE_APPEARANCE_KEYS,
    LANDING_EXAMPLE_CACHE_KEY,
    LANDING_EXAMPLE_DELIVERY_KEY,
    LANDING_EXAMPLE_PUBLISH_LOCK_KEY,
    LANDING_EXAMPLE_SCHEMA_VERSION,
    LANDING_EXAMPLE_SETTINGS_KEY,
    LANDING_PREVIEW_GOAL_ATTRIBUTES,
    LANDING_PREVIEW_GOAL_FIELDS,
    LANDING_PREVIEW_LEVEL_FIELDS,
    _landing_publish_process_lock,
)
from services._landing_settings import _LandingSettingsMixin
from services._landing_static_snapshot import _LandingStaticSnapshotMixin

logger = logging.getLogger(__name__)

# The tour opens the first goal worth opening: the most concrete level that has one.
TOUR_GOAL_LEVELS = ("Short Term Goal", "Mid Term Goal", "Long Term Goal")


class LandingPublishService(_LandingSettingsMixin, _LandingStaticSnapshotMixin):
    def __init__(self, db_session):
        self.db_session = db_session

    @contextmanager
    def _landing_publish_lock(self):
        """Serialize the one global landing publication stream.

        Production uses a PostgreSQL transaction advisory lock so ordering is
        preserved across threads and instances. The process lock supplies the
        equivalent invariant for SQLite tests and local development.
        """
        with _landing_publish_process_lock:
            bind = self.db_session.get_bind()
            if bind is not None and bind.dialect.name == "postgresql":
                self.db_session.execute(
                    text("SELECT pg_advisory_xact_lock(:lock_key)"),
                    {"lock_key": LANDING_EXAMPLE_PUBLISH_LOCK_KEY},
                )
            yield

    def publish_landing_examples(
        self, *, examples_override: list[JsonDict] | None = None,
    ) -> ServiceResult[JsonDict]:
        with self._landing_publish_lock():
            return self._publish_landing_examples_locked(examples_override=examples_override)

    def _publish_landing_examples_locked(
        self, *, examples_override: list[JsonDict] | None = None,
    ) -> ServiceResult[JsonDict]:
        publish_started = perf_counter()
        settings = self._get_landing_settings()
        examples = self._normalize_landing_example_settings(
            settings["examples"] if examples_override is None else examples_override
        )
        roots_by_id, error, status = self._validate_landing_example_roots(examples)
        if error:
            return None, error, status

        account_id = str(DemoAccountService(self.db_session).ensure().id)
        snapshot_service = DemoSnapshotService(self.db_session)
        previous = settings["snapshots"]
        now = utc_now()
        # To the microsecond: "source changed since snapshot" compares edits against it.
        taken_at = now.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        snapshots: dict[str, JsonDict] = {}
        published_examples = []
        for item in examples:
            source = roots_by_id[item["root_id"]]
            source_id = str(source.id)
            target_root_id = snapshot_root_id(source_id)
            snapshot_service.purge(target_root_id, account_id)
            result = snapshot_service.snapshot(source_id, target_root_id, account_id)
            snapshots[source_id] = {"root_id": target_root_id, "taken_at": taken_at, "counts": result.counts}
            published_examples.append(self._build_published_example(item, source, result))
        for source_root_id, snapshot in previous.items():
            if source_root_id not in snapshots and snapshot.get("root_id"):
                snapshot_service.purge(snapshot["root_id"], account_id)

        cache = {
            "published_at": format_utc(now),
            "revision": str(uuid.uuid4()),
            "schema_version": LANDING_EXAMPLE_SCHEMA_VERSION,
            "examples": published_examples,
        }
        serialized_snapshot = self._serialized_landing_snapshot(cache)
        snapshot_bytes = len(serialized_snapshot.encode("utf-8"))
        compressed_snapshot = gzip.compress(
            serialized_snapshot.encode("utf-8"), compresslevel=9, mtime=0,
        )
        compressed_bytes = len(compressed_snapshot)
        error = self._landing_snapshot_size_error(snapshot_bytes, compressed_bytes)
        if error:
            message, status = error
            return None, message, status

        delivery_started = perf_counter()
        static_snapshot, error = self._deliver_and_commit_landing_snapshot(
            cache,
            {"examples": examples, "snapshots": snapshots},
            serialized_snapshot=serialized_snapshot,
            compressed_snapshot=compressed_snapshot,
            snapshot_bytes=snapshot_bytes,
            compressed_bytes=compressed_bytes,
        )
        if error:
            message, status = error
            return None, message, status
        delivery_ms = round((perf_counter() - delivery_started) * 1000)
        total_ms = round((perf_counter() - publish_started) * 1000)
        logger.info(
            "Demo publish completed examples=%s snapshot_bytes=%s delivery_ms=%s total_ms=%s static_snapshot=%s",
            len(published_examples),
            snapshot_bytes,
            delivery_ms,
            total_ms,
            static_snapshot,
        )
        log_ops_event(
            "landing.publish_delivered",
            revision=cache["revision"],
            examples=len(published_examples),
            snapshot_bytes=snapshot_bytes,
            compressed_bytes=compressed_bytes,
            static_snapshot=static_snapshot,
            duration_ms=total_ms,
        )
        payload, _, _ = self.get_landing_example_settings()
        return {
            **(payload or {}),
            "revision": cache["revision"],
            "static_snapshot": static_snapshot,
            "publish_duration_ms": total_ms,
            "snapshot_bytes": snapshot_bytes,
            "compressed_snapshot_bytes": compressed_bytes,
        }, None, 200

    def _build_published_example(self, item: JsonDict, source: Goal, result: SnapshotResult) -> JsonDict:
        """One manifest entry: what the landing draws and where the tour goes, on the snapshot."""
        root_id = result.root_id
        root = self.db_session.get(Goal, root_id)
        owner = self.db_session.get(User, source.owner_id)
        preferences = _safe_load_json(owner.preferences, {}) if owner else {}
        if not isinstance(preferences, dict):
            preferences = {}
        levels = self._preview_levels(root)
        return {
            "root_id": root_id,
            "label": item["label"],
            "sort_order": item["sort_order"],
            "root_name": source.name,
            "icon": self._root_icon(root, levels),
            "tour": {
                "goal_id": self._tour_goal_id(root_id),
                "session_id": self._tour_session_id(root_id, result.id_map.get(item["tour"].get("session_id") or "")),
                "program_id": self._tour_program_id(root_id, result.id_map.get(item["tour"].get("program_id") or "")),
            },
            "appearance": {key: preferences[key] for key in LANDING_EXAMPLE_APPEARANCE_KEYS if preferences.get(key)},
            "preview": {"levels": levels, "tree": self._preview_tree(root_id)},
        }

    def _preview_levels(self, root: Goal) -> list[JsonDict]:
        """The snapshot's effective levels (system, then account, then fractal), as the app merges them."""
        levels, _, _ = GoalLevelService(self.db_session).list_goal_levels(root.owner_id, root_id=root.id)
        return [{field: getattr(level, field) for field in LANDING_PREVIEW_LEVEL_FIELDS} for level in levels]

    def _preview_tree(self, root_id: str) -> JsonDict:
        """The snapshot's goal tree as the app serializes it, cut to what the flow tree draws."""
        goals_by_id = GoalService(self.db_session)._load_fractal_goals_for_serialization(root_id)

        def trim(node: JsonDict) -> JsonDict:
            attributes = node.get("attributes") or {}
            return {
                **{field: node.get(field) for field in LANDING_PREVIEW_GOAL_FIELDS},
                "attributes": {field: attributes.get(field) for field in LANDING_PREVIEW_GOAL_ATTRIBUTES},
                "children": [trim(child) for child in node.get("children", [])],
            }

        return trim(serialize_goal(goals_by_id[root_id]))

    def _root_icon(self, root: Goal, levels: list[JsonDict]) -> JsonDict:
        # The root's level in the preview's own levels, so the picker and the tree agree.
        level = next((level for level in levels if level["id"] == root.level_id), None) \
            or next((level for level in levels if level["name"] == getattr(root.level, "name", None)), {})
        return {
            "shape": level.get("icon"),
            "color": level.get("color"),
            "secondary_color": level.get("secondary_color"),
            "smart": all(calculate_smart_status(root).values()),
        }

    def _tour_goal_id(self, root_id: str) -> str | None:
        for level_name in TOUR_GOAL_LEVELS:
            goal = self.db_session.query(Goal).join(GoalLevel, Goal.level_id == GoalLevel.id).filter(
                Goal.root_id == root_id,
                Goal.deleted_at.is_(None),
                GoalLevel.name == level_name,
            ).order_by(Goal.created_at.asc(), Goal.id.asc()).first()
            if goal:
                return goal.id
        return None

    def _tour_session_id(self, root_id: str, picked: str | None) -> str | None:
        live = self.db_session.query(Session.id).filter(Session.root_id == root_id, Session.deleted_at.is_(None))
        if picked and live.filter(Session.id == picked).first():
            return picked
        latest = live.order_by(Session.session_start.desc().nullslast(), Session.created_at.desc()).first()
        return latest[0] if latest else None

    def _tour_program_id(self, root_id: str, picked: str | None) -> str | None:
        programs = self.db_session.query(Program.id).filter(Program.root_id == root_id)
        if picked and programs.filter(Program.id == picked).first():
            return picked
        first = programs.order_by(Program.is_active.desc(), Program.created_at.asc()).first()
        return first[0] if first else None

    def _landing_snapshot_size_error(self, snapshot_bytes, compressed_bytes) -> tuple[str, int] | None:
        """Reject snapshots over the expanded or transfer size limits, rolling back the draft."""
        if snapshot_bytes > config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:
            self.db_session.rollback()
            return (
                "The demo manifest is too large to publish "
                f"({snapshot_bytes:,} expanded bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:,}; "
                f"{compressed_bytes:,} transfer bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:,}). "
                "Choose fewer or smaller example fractals."
            ), 413
        if compressed_bytes > config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:
            self.db_session.rollback()
            return (
                "The compressed demo manifest is too large to publish "
                f"({compressed_bytes:,} transfer bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:,}; "
                f"{snapshot_bytes:,} expanded bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:,}). "
                "Choose fewer or smaller example fractals."
            ), 413
        return None

    def _deliver_and_commit_landing_snapshot(
        self, cache, settings, *, serialized_snapshot, compressed_snapshot, snapshot_bytes, compressed_bytes,
    ):
        """Write the static snapshot, then commit the settings; restore the static copy if the commit fails."""
        previous_cache = self._get_app_setting_value(
            LANDING_EXAMPLE_CACHE_KEY, {"published_at": None, "examples": []},
        )
        static_snapshot = self._write_landing_static_snapshot(
            cache,
            payload=serialized_snapshot,
            compressed_payload=compressed_snapshot,
        )
        if static_snapshot == "failed":
            self.db_session.rollback()
            logger.error(
                "Landing publish delivery failed revision=%s; database snapshot unchanged",
                cache["revision"],
            )
            log_ops_event(
                "landing.publish_failed",
                level="error",
                revision=cache["revision"],
                reason="static_delivery",
            )
            return None, ((
                "Static landing snapshot delivery failed; published examples were not changed. "
                "Retry publishing."
            ), 503)

        # The draft as published, with the private source → snapshot map.
        self._set_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, settings)
        self._set_app_setting_value(LANDING_EXAMPLE_CACHE_KEY, cache)
        delivery = {
            "revision": cache["revision"],
            "status": "delivered" if static_snapshot == "ok" else "database_only",
            "published_at": cache["published_at"],
            "snapshot_bytes": snapshot_bytes,
            "compressed_snapshot_bytes": compressed_bytes,
        }
        self._set_app_setting_value(LANDING_EXAMPLE_DELIVERY_KEY, delivery)
        try:
            self.db_session.commit()
        except Exception:
            # Compensating boundary: undo the already-delivered static snapshot, then re-raise.
            self.db_session.rollback()
            if static_snapshot == "ok":
                restored = self._restore_landing_static_snapshot(previous_cache)
                if not restored:
                    logger.critical(
                        "Landing publish database commit failed and static rollback failed revision=%s",
                        cache["revision"],
                        exc_info=True,
                    )
                    log_ops_event(
                        "landing.publish_failed",
                        level="error",
                        revision=cache["revision"],
                        reason="database_commit_and_static_rollback",
                    )
            raise
        return static_snapshot, None
