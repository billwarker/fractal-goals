"""Serve the real Flask app and built client against a disposable local database."""

from pathlib import Path
import os
import signal
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["ENV"] = "testing"
os.environ["FLASK_DEBUG"] = "false"
os.environ["SENTRY_DSN"] = ""
os.environ["RATELIMIT_ENABLED"] = "false"
os.environ["AGENT_MCP_RESOURCE_URI"] = "https://mcp.browser.invalid/mcp"
os.environ["AGENT_OAUTH_ISSUER"] = "https://issuer.browser.invalid"
os.environ["AGENT_ADAPTER_ID"] = "browser-test-adapter"
os.environ["AGENT_ADAPTER_SHARED_SECRET"] = "browser-test-only-shared-secret"

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
            AgentGrant,
            AgentCredential,
            AgentOAuthClient,
            ActivityDefinition,
            ActivityInstance,
            AppSetting,
            Goal,
            GoalLevel,
            Program,
            ProgramBlock,
            ProgramDay,
            Session,
            User,
        )
        from datetime import datetime, timedelta, timezone

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
            db.add(AppSetting(
                key="feature_flags",
                value={
                    "ai_agent_connectors": True,
                    "ai_agent_writes": True,
                    "ai_agent_embedded": False,
                    "ai_agent_embedded_openai": False,
                    "ai_agent_embedded_anthropic": False,
                },
            ))
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
                oauth_client = AgentOAuthClient(
                    id=f"browser-agent-client-{suffix}",
                    client_id=f"browser-agent-client-{suffix}",
                    client_name=f"Browser AI {suffix}",
                    redirect_uris=[],
                )
                db.add(oauth_client)
                db.flush()
                db.add(AgentGrant(
                    id=f"browser-agent-grant-{suffix}",
                    user_id=user.id,
                    client_id=oauth_client.id,
                    allowed_roots=[root_id],
                    scopes="goals:read goals:write notes:write",
                    audience=config.AGENT_MCP_RESOURCE_URI,
                    expires_at=now + timedelta(days=30),
                ))
                settings_client = AgentOAuthClient(
                    id=f"browser-settings-agent-client-{suffix}",
                    client_id=f"browser-settings-agent-client-{suffix}",
                    client_name=f"Browser AI Settings {suffix}",
                    redirect_uris=[],
                )
                db.add(settings_client)
                db.flush()
                db.add(AgentGrant(
                    id=f"browser-settings-agent-grant-{suffix}",
                    user_id=user.id,
                    client_id=settings_client.id,
                    allowed_roots=[root_id],
                    scopes="goals:read",
                    audience=config.AGENT_MCP_RESOURCE_URI,
                    expires_at=now + timedelta(days=30),
                ))
                db.flush()
                from services.agent_access_service import _token_hash
                db.add(AgentCredential(
                    id=f"browser-agent-credential-{suffix}",
                    token_hash=_token_hash(f"browser-agent-access-token-{suffix}"),
                    token_type="access",
                    grant_id=f"browser-agent-grant-{suffix}",
                    client_id=f"browser-agent-client-{suffix}",
                    audience=config.AGENT_MCP_RESOURCE_URI,
                    scopes="goals:read goals:write notes:write",
                    expires_at=now + timedelta(days=30),
                ))
                today = now.date()
                db.add(
                    Program(
                        id=f"browser-program-{suffix}",
                        root_id=root_id,
                        name=f"Daily Practice {suffix}",
                        start_date=datetime.combine(today - timedelta(days=1), datetime.min.time()),
                        end_date=datetime.combine(today + timedelta(days=7), datetime.max.time()),
                        weekly_schedule={},
                    )
                )
                db.add(
                    ProgramBlock(
                        id=f"browser-block-{suffix}",
                        program_id=f"browser-program-{suffix}",
                        name="Month 1",
                        start_date=today - timedelta(days=1),
                        end_date=today + timedelta(days=7),
                    )
                )
                db.flush()
                for offset in (0, 1, 3):
                    db.add(
                        ProgramDay(
                            id=f"browser-day-{suffix}-{offset}",
                            block_id=f"browser-block-{suffix}",
                            name="Daily Practice",
                            date=today + timedelta(days=offset),
                        )
                    )
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

        worker_environment = os.environ.copy()
        worker_environment["AGENT_WORKER_IDLE_SECONDS"] = "10"
        worker = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve().with_name("run_agent_worker.py"))],
            env=worker_environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
        try:
            app.run(host="127.0.0.1", port=8012, use_reloader=False)
        finally:
            worker.terminate()
            try:
                worker.wait(timeout=10)
            except subprocess.TimeoutExpired:
                worker.kill()
                worker.wait(timeout=5)
    finally:
        if engine is not None:
            models.remove_session()
            engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin.dispose()


if __name__ == "__main__":
    main()
