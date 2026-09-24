"""Landing-example settings, snapshot building, and publish pipeline.

Extracted from AdminService so the ~1k-line landing read-model builder lives
in its own service boundary. AdminService and the admin blueprint compose this
service; the public landing read path (`PublicService.get_landing_examples`)
consumes the published cache via `LANDING_EXAMPLE_CACHE_KEY`.
"""
import gzip
import logging
import uuid
from contextlib import contextmanager
from time import perf_counter

from sqlalchemy import text

from config import config
from models import (
    utc_now,
)
from services.goal_loading import load_fractal_goals_for_serialization
from services.goal_history_read_model import GoalHistoryReadModel
from services.ops_log import log_ops_event
from services.serializers import (
    format_utc,
)
from services.service_types import JsonDict, ServiceResult
from services._landing_common import (
    LANDING_EXAMPLE_CACHE_KEY,
    LANDING_EXAMPLE_DELIVERY_KEY,
    LANDING_EXAMPLE_PUBLISH_LOCK_KEY,
    LANDING_EXAMPLE_SCHEMA_VERSION,
    LANDING_EXAMPLE_SETTINGS_KEY,
    _landing_publish_process_lock,
)
from services._landing_public_tree import _LandingPublicTreeMixin
from services._landing_settings import _LandingSettingsMixin
from services._landing_showcase import _LandingShowcaseMixin
from services._landing_static_snapshot import _LandingStaticSnapshotMixin

logger = logging.getLogger(__name__)


class LandingPublishService(
    _LandingSettingsMixin,
    _LandingPublicTreeMixin,
    _LandingShowcaseMixin,
    _LandingStaticSnapshotMixin,
):
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
        source_examples = examples_override
        if source_examples is None:
            source_examples = self._get_app_setting_value(
                LANDING_EXAMPLE_SETTINGS_KEY, {"examples": []}
            ).get("examples", [])
        examples = self._normalize_landing_example_settings(source_examples)
        _, error, status = self._validate_landing_example_roots(examples)
        if error:
            return None, error, status

        published_examples = []
        showcase_warnings: list[str] = []
        for item in examples:
            published, error = self._build_published_example(item, showcase_warnings)
            if error:
                return (None, *error)
            published_examples.append(published)

        cache = {
            "published_at": format_utc(utc_now()),
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
            return (None, *error)

        delivery_started = perf_counter()
        static_snapshot, error = self._deliver_and_commit_landing_snapshot(
            cache,
            examples,
            serialized_snapshot=serialized_snapshot,
            compressed_snapshot=compressed_snapshot,
            snapshot_bytes=snapshot_bytes,
            compressed_bytes=compressed_bytes,
        )
        if error:
            return (None, *error)
        committed_ms = round((perf_counter() - publish_started) * 1000)
        delivery_ms = round((perf_counter() - delivery_started) * 1000)
        total_ms = round((perf_counter() - publish_started) * 1000)
        logger.info(
            "Landing publish completed examples=%s snapshot_bytes=%s committed_ms=%s "
            "delivery_ms=%s total_ms=%s static_snapshot=%s",
            len(published_examples),
            snapshot_bytes,
            committed_ms,
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
        )
        return {
            "published_at": cache["published_at"],
            "revision": cache["revision"],
            "published_example_count": len(published_examples),
            "examples": examples,
            "showcase_warnings": showcase_warnings,
            "static_snapshot": static_snapshot,
            "publish_duration_ms": total_ms,
            "snapshot_bytes": snapshot_bytes,
            "compressed_snapshot_bytes": compressed_bytes,
        }, None, 200

    def _build_published_example(self, item, showcase_warnings):
        """Build one example's public snapshot; resolved selections are written back to ``item``."""
        example_started = perf_counter()
        goals_by_id = load_fractal_goals_for_serialization(
            self.db_session, item["root_id"], include_group_activities=True,
        )
        root = goals_by_id.get(item["root_id"])
        if not root:
            return None, ("Landing example root not found", 404)
        effective_levels_by_name = self._load_effective_landing_levels(root.owner_id, root.id)
        history = GoalHistoryReadModel(self.db_session, root.id).preload(set(goals_by_id), goals_by_id=goals_by_id)
        serialized_tree = self._serialize_public_goal_tree(root, effective_levels_by_name)
        self._enrich_landing_tree_with_history(
            serialized_tree, root, goals_by_id, effective_levels_by_name, history,
        )
        flowtree_data = self._build_landing_flowtree_data(root, serialized_tree, goals_by_id)
        resolved_showcase, warnings = self._resolve_landing_showcase(root, item.get("showcase"))
        showcase_warnings.extend(f"{item['label']}: {warning}" for warning in warnings)
        resolved_content, content_warnings = self._resolve_landing_goal_content(
            root, item.get("landing_content")
        )
        showcase_warnings.extend(f"{item['label']}: {warning}" for warning in content_warnings)
        item["showcase"] = resolved_showcase
        item["landing_content"] = resolved_content
        showcase_data = self._build_landing_showcase_data(root, resolved_showcase)
        target_analytics = self._build_landing_target_analytics(
            root, serialized_tree, goals_by_id, history,
        )
        published = {
            "root_id": root.id,
            "label": item["label"],
            "sort_order": item["sort_order"],
            "root_name": root.name,
            "schema_version": LANDING_EXAMPLE_SCHEMA_VERSION,
            "tree": serialized_tree,
            "evidence_goal_ids": flowtree_data["evidence_goal_ids"],
            "metrics_summary": flowtree_data["metrics_summary"],
            "programs": flowtree_data["programs"],
            "showcase": resolved_showcase,
            "tree_view_settings": item["tree_view_settings"],
            "landing_content": resolved_content,
            "sessions": showcase_data["sessions"],
            "activity_definitions": showcase_data["activity_definitions"],
            "activity_groups": showcase_data["activity_groups"],
            "activity_instantiation_summary": showcase_data["activity_instantiation_summary"],
            "analytics_views": showcase_data["analytics_views"],
            "analytics_activity_instances": showcase_data["analytics_activity_instances"],
            "target_analytics": target_analytics,
            "session_templates": showcase_data["session_templates"],
        }
        logger.info(
            "Landing publish example built root_id=%s goals=%s duration_ms=%s",
            root.id,
            len(goals_by_id),
            round((perf_counter() - example_started) * 1000),
        )
        return published, None

    def _landing_snapshot_size_error(self, snapshot_bytes, compressed_bytes):
        """Reject snapshots over the expanded or transfer size limits, rolling back the draft."""
        if snapshot_bytes > config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:
            self.db_session.rollback()
            return (
                "Landing snapshot is too large to publish "
                f"({snapshot_bytes:,} expanded bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:,}; "
                f"{compressed_bytes:,} transfer bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:,}). "
                "Choose fewer or smaller example fractals."
            ), 413
        if compressed_bytes > config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:
            self.db_session.rollback()
            return (
                "Compressed landing snapshot is too large to publish "
                f"({compressed_bytes:,} transfer bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:,}; "
                f"{snapshot_bytes:,} expanded bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:,}). "
                "Choose fewer or smaller example fractals."
            ), 413
        return None

    def _deliver_and_commit_landing_snapshot(
        self, cache, examples, *, serialized_snapshot, compressed_snapshot, snapshot_bytes, compressed_bytes,
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

        # Reconcile stale references back into the editable draft so an
        # unavailable hidden selection warns once instead of on every publish.
        self._set_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {"examples": examples})
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
