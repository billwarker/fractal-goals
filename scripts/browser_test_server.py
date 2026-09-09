"""Serve the real Flask app and built client against a disposable local database."""

from pathlib import Path
import os
import signal
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["ENV"] = "testing"
os.environ["FLASK_DEBUG"] = "false"
os.environ["SENTRY_DSN"] = ""
os.environ["RATELIMIT_ENABLED"] = "false"

from config import config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def main():
    source = make_url(config.get_database_url())
    if source.host not in ("localhost", "127.0.0.1", "::1"):
        raise SystemExit("Browser fixtures require a local PostgreSQL server")
    name = "fractal_browser_test_" + uuid.uuid4().hex[:12]
    admin = create_engine(source.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{name}"'))
    database = source.set(database=name)
    type(config).DATABASE_URL = database.render_as_string(hide_password=False)
    os.environ["DATABASE_URL"] = config.DATABASE_URL
    engine = None
    try:
        import models
        from models import (
            ActivityDefinition,
            ActivityInstance,
            Goal,
            GoalLevel,
            Session,
            User,
        )
        from datetime import datetime, timezone

        engine = models.get_engine()
        if engine.url.database != name:
            raise RuntimeError("Browser fixture database isolation failed")
        models.init_db(engine)
        with models.get_session(engine) as db:
            now = datetime.now(timezone.utc)
            user = User(
                id="browser-user",
                username="browser_user",
                email="browser@example.invalid",
                terms_accepted_version=config.TERMS_VERSION,
                terms_accepted_at=now,
                privacy_accepted_version=config.PRIVACY_VERSION,
                privacy_accepted_at=now,
            )
            user.set_password("BrowserTest123!")
            db.add(user)
            ultimate_level = GoalLevel(
                id="browser-ultimate-level",
                name="Ultimate Goal",
                rank=0,
            )
            db.add(ultimate_level)
            db.flush()
            for suffix in ("desktop", "mobile"):
                root_id = f"browser-root-{suffix}"
                db.add(
                    Goal(
                        id=root_id,
                        root_id=root_id,
                        owner_id=user.id,
                        level_id=ultimate_level.id,
                        name=f"Browser Practice {suffix}",
                    )
                )
                db.flush()
                db.add(
                    Session(
                        id=f"browser-session-{suffix}",
                        root_id=root_id,
                        owner_id=user.id,
                        name=f"Browser Session {suffix}",
                        session_start=now,
                        attributes={
                            "session_data": {
                                "sections": [
                                    {
                                        "id": "practice",
                                        "name": "Practice",
                                        "activity_ids": [f"browser-instance-{suffix}"],
                                    }
                                ]
                            }
                        },
                    )
                )
                db.add(
                    ActivityDefinition(
                        id=f"browser-activity-{suffix}",
                        root_id=root_id,
                        name="Focused Practice",
                        has_metrics=False,
                        has_sets=False,
                    )
                )
                db.flush()
                db.add(
                    ActivityInstance(
                        id=f"browser-instance-{suffix}",
                        root_id=root_id,
                        session_id=f"browser-session-{suffix}",
                        activity_definition_id=f"browser-activity-{suffix}",
                        data={},
                    )
                )
            db.commit()
        from app import app

        signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
        app.run(host="127.0.0.1", port=8012, use_reloader=False)
    finally:
        if engine is not None:
            models.remove_session()
            engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin.dispose()


if __name__ == "__main__":
    main()
