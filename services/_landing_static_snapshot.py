"""Mixin for LandingPublishService: writing, restoring, and deleting the static GCS snapshot.
"""

import logging
import gzip
import json
import os
import tempfile
from pathlib import Path
from google.api_core.retry import Retry
from google.cloud import storage
from config import config
from services.service_types import JsonDict

logger = logging.getLogger(__name__)


class _LandingStaticSnapshotMixin:
    @staticmethod
    def _serialized_landing_snapshot(cache: JsonDict) -> str:
        return json.dumps(cache, ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def _write_landing_static_snapshot(
        cls,
        cache: JsonDict,
        *,
        payload: str | None = None,
        compressed_payload: bytes | None = None,
    ) -> str:
        """Materialize the candidate snapshot before its database commit.

        A configured static destination is part of the publication contract:
        failure leaves the prior database/static publication unchanged.
        """
        payload = payload or cls._serialized_landing_snapshot(cache)
        compressed_payload = compressed_payload or gzip.compress(
            payload.encode("utf-8"), compresslevel=9, mtime=0,
        )

        bucket_name = config.LANDING_EXAMPLES_STATIC_GCS_BUCKET
        if bucket_name:
            try:
                bucket = storage.Client().bucket(bucket_name)
                blob = bucket.blob(config.LANDING_EXAMPLES_STATIC_GCS_BLOB or "landing-examples.json")
                # The URL is stable across publishes, so browsers must
                # revalidate it instead of retaining an older selection for a
                # fixed TTL. GCS ETags make unchanged responses inexpensive,
                blob.cache_control = "public, max-age=0, must-revalidate, no-transform"
                # Cloud Storage does not dynamically compress objects. Store
                # the JSON as deterministic gzip so landing hydration transfers
                blob.content_encoding = "gzip"
                blob.upload_from_string(
                    compressed_payload,
                    content_type="application/json",
                    timeout=min(5.0, config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS),
                    retry=Retry(
                        initial=0.25,
                        maximum=1.0,
                        multiplier=2.0,
                        deadline=config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS,
                    ),
                )
                return "ok"
            except Exception:
                logger.warning("Landing static GCS snapshot write failed", exc_info=True)
                return "failed"

        static_path = config.LANDING_EXAMPLES_STATIC_PATH
        if not static_path:
            if config.ENV == "production":
                logger.error(
                    "Landing static snapshot destination is not configured in production"
                )
                return "failed"
            return "skipped"

        temp_name = None
        try:
            destination = Path(static_path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=destination.parent,
                prefix=f".{destination.name}.",
                suffix=".tmp",
                delete=False,
            ) as temp_file:
                temp_file.write(payload)
                temp_file.write("\n")
                temp_name = temp_file.name
            os.replace(temp_name, destination)
            return "ok"
        except OSError:
            if temp_name:
                try:
                    os.unlink(temp_name)
                except OSError:
                    pass
            logger.warning("Landing static filesystem snapshot write failed for %s", static_path, exc_info=True)
            return "failed"

    @classmethod
    def _restore_landing_static_snapshot(cls, previous_cache: JsonDict) -> bool:
        """Compensate an external write when the database commit fails."""
        if previous_cache.get("published_at"):
            return cls._write_landing_static_snapshot(previous_cache) == "ok"
        return cls._delete_landing_static_snapshot()

    @staticmethod
    def _delete_landing_static_snapshot() -> bool:
        bucket_name = config.LANDING_EXAMPLES_STATIC_GCS_BUCKET
        if bucket_name:
            try:
                blob = storage.Client().bucket(bucket_name).blob(
                    config.LANDING_EXAMPLES_STATIC_GCS_BLOB or "landing-examples.json"
                )
                blob.delete(
                    timeout=min(5.0, config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS),
                    retry=Retry(deadline=config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS),
                )
                return True
            except Exception:
                logger.critical("Landing static GCS rollback delete failed", exc_info=True)
                return False

        static_path = config.LANDING_EXAMPLES_STATIC_PATH
        if not static_path:
            return True
        try:
            Path(static_path).unlink(missing_ok=True)
            return True
        except OSError:
            logger.critical(
                "Landing static filesystem rollback delete failed for %s",
                static_path,
                exc_info=True,
            )
            return False
