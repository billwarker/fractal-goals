"""Replay-safe writes for clients that retry (the offline session outbox).

A request carrying ``Idempotency-Key`` is executed at most once per user and key.
The first 2xx response is stored and replayed verbatim to later retries. Non-2xx
responses release the key so a retry re-executes; rejections are deterministic,
so the client still sees the same answer. Requests without the header behave
exactly as before.
"""
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Response, jsonify, make_response, request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

import models
from models import IdempotencyRecord

logger = logging.getLogger(__name__)

IDEMPOTENCY_HEADER = 'Idempotency-Key'
REPLAY_HEADER = 'Idempotent-Replayed'
MAX_KEY_LENGTH = 255
# A claim older than this belongs to a request that died mid-flight.
STALE_CLAIM_AFTER = timedelta(minutes=2)
RECORD_TTL = timedelta(days=14)
# Larger responses are recorded as status only; the client's post-sync refresh fetches the data.
MAX_STORED_BODY_BYTES = 64 * 1024
GLOBAL_PURGE_INTERVAL = timedelta(hours=1)
_last_global_purge = None


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _request_hash() -> str:
    digest = hashlib.sha256()
    digest.update(request.method.encode())
    digest.update(b'\0')
    digest.update(request.path.encode())
    digest.update(b'\0')
    digest.update(request.get_data(cache=True) or b'')
    return digest.hexdigest()


def _replay(record: IdempotencyRecord) -> Response:
    response = Response(
        record.response_body if record.response_body is not None else '{"replayed": true}',
        status=record.response_status or 200,
        mimetype=record.response_mimetype or 'application/json',
    )
    response.headers[REPLAY_HEADER] = 'true'
    return response


def _claim(db, user_id, key, request_hash):
    """Claim the key for this request. Returns (True, None) or (None, early_response)."""
    now = _utc_now_naive()
    db.query(IdempotencyRecord).filter(
        IdempotencyRecord.user_id == user_id,
        IdempotencyRecord.created_at < now - RECORD_TTL,
    ).delete(synchronize_session=False)
    _purge_globally_if_due(db, now)
    db.add(IdempotencyRecord(
        user_id=user_id,
        key=key,
        method=request.method,
        path=request.path[:1024],
        request_hash=request_hash,
        status='in_progress',
        created_at=now,
    ))
    try:
        db.commit()
        return True, None
    except IntegrityError:
        db.rollback()

    existing = db.get(IdempotencyRecord, (user_id, key), with_for_update=True)
    if existing is None:
        # Released between our insert and read; the client's retry will claim it.
        db.rollback()
        return None, (jsonify({'error': 'Request already in progress', 'code': 'idempotency_in_flight'}), 409)
    if existing.request_hash != request_hash:
        db.rollback()
        return None, (jsonify({
            'error': 'Idempotency-Key was reused with a different request',
            'code': 'idempotency_key_mismatch',
        }), 422)
    if existing.status == 'done':
        replay = _replay(existing)
        db.rollback()
        return None, replay
    if existing.created_at and now - existing.created_at < STALE_CLAIM_AFTER:
        db.rollback()
        return None, (jsonify({'error': 'Request already in progress', 'code': 'idempotency_in_flight'}), 409)

    existing.created_at = now
    db.commit()
    return True, None


def purge_expired_idempotency_records(db, *, now=None) -> int:
    """Remove every user's expired records (inactive users never trigger the per-user purge)."""
    deleted = db.query(IdempotencyRecord).filter(
        IdempotencyRecord.created_at < (now or _utc_now_naive()) - RECORD_TTL,
    ).delete(synchronize_session=False)
    return deleted


def _purge_globally_if_due(db, now):
    global _last_global_purge
    if _last_global_purge is not None and now - _last_global_purge < GLOBAL_PURGE_INTERVAL:
        return
    _last_global_purge = now
    purge_expired_idempotency_records(db, now=now)


def _finish(db, user_id, key, response: Response):
    record = db.get(IdempotencyRecord, (user_id, key))
    if record is None:
        return
    if 200 <= response.status_code < 300:
        body = response.get_data(as_text=True)
        record.status = 'done'
        record.response_status = response.status_code
        record.response_mimetype = response.mimetype
        record.response_body = body if len(body.encode('utf-8')) <= MAX_STORED_BODY_BYTES else None
    else:
        db.delete(record)
    db.commit()


def _release(db, user_id, key):
    record = db.get(IdempotencyRecord, (user_id, key))
    if record is not None:
        db.delete(record)
        db.commit()


def idempotent(handler):
    """Decorate a ``@token_required`` write handler (place it below ``token_required``)."""

    @wraps(handler)
    def wrapper(current_user, *args, **kwargs):
        key = (request.headers.get(IDEMPOTENCY_HEADER) or '').strip()
        if not key or request.method in ('GET', 'HEAD', 'OPTIONS'):
            return handler(current_user, *args, **kwargs)
        if len(key) > MAX_KEY_LENGTH:
            return jsonify({'error': f'{IDEMPOTENCY_HEADER} must be at most {MAX_KEY_LENGTH} characters'}), 400

        user_id = current_user.id
        db = models.get_session(models.get_engine())
        try:
            claimed, early_response = _claim(db, user_id, key, _request_hash())
            if not claimed:
                return early_response
            response = None
            try:
                response = make_response(handler(current_user, *args, **kwargs))
            finally:
                if response is None:
                    # The handler raised: free the key so the client's retry re-executes.
                    db.rollback()
                    _release(db, user_id, key)
            try:
                _finish(db, user_id, key, response)
            except SQLAlchemyError:
                db.rollback()
                logger.exception('Failed to store idempotent response key=%s', key)
            return response
        finally:
            db.close()

    return wrapper
