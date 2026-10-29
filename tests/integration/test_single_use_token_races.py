"""Single-use credentials are claimed atomically across independent connections.

Each worker uses its own session (its own PostgreSQL connection) and all start
together, so a check-then-write implementation lets several of them observe the
token as unused before any commits.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

from config import config
from models import PasswordResetToken, SignupInviteKey, User, get_engine, get_session, utc_now
from services.admin_service import hash_invite_key
from services.auth_service import AuthService


WORKERS = 4


def _race(action):
    barrier = Barrier(WORKERS)

    def run(index):
        worker_session = get_session(get_engine())
        try:
            barrier.wait(timeout=10)
            _payload, error, status = action(worker_session, index)
            return status, error
        finally:
            worker_session.close()

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        return list(pool.map(run, range(WORKERS)))


def test_concurrent_password_resets_consume_a_token_once(db_session, test_user):
    raw_token = "race-reset-token"
    db_session.add(PasswordResetToken(
        user_id=test_user.id,
        token_hash=AuthService._hash_token(raw_token),
        expires_at=utc_now() + timedelta(minutes=30),
    ))
    db_session.commit()

    results = _race(lambda session, index: AuthService(session).reset_password({
        "token": raw_token,
        "new_password": f"Racepassword{index}A",
    }))

    assert sorted(status for status, _error in results) == [200, 400, 400, 400]
    db_session.expire_all()
    assert db_session.query(PasswordResetToken).one().used_at is not None


def test_expired_reset_token_stays_spent(db_session, test_user):
    raw_token = "expired-reset-token"
    db_session.add(PasswordResetToken(
        user_id=test_user.id,
        token_hash=AuthService._hash_token(raw_token),
        expires_at=utc_now() - timedelta(minutes=1),
    ))
    db_session.commit()
    service = AuthService(db_session)

    assert service.reset_password({"token": raw_token, "new_password": "Newpassword456"})[2] == 400
    assert db_session.query(PasswordResetToken).one().used_at is not None
    assert service.reset_password({"token": raw_token, "new_password": "Newpassword456"})[2] == 400


def test_concurrent_signups_consume_an_unassigned_invite_once(db_session):
    raw_key = "fg_invite_race"
    db_session.add(SignupInviteKey(key_hash=hash_invite_key(raw_key), label="Unassigned historical invite"))
    db_session.commit()

    results = _race(lambda session, index: AuthService(session).signup({
        "username": f"racer{index}",
        "email": f"racer{index}@example.com",
        "password": "Password123",
        "terms_version": config.TERMS_VERSION,
        "privacy_version": config.PRIVACY_VERSION,
        "invite_key": raw_key,
    }))

    assert sorted(status for status, _error in results) == [201, 400, 400, 400]
    db_session.expire_all()
    invite = db_session.query(SignupInviteKey).one()
    assert invite.used_at is not None
    assert db_session.query(User).filter(User.username.like("racer%")).count() == 1
