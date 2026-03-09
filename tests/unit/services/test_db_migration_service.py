from services import db_migration_service


def test_should_auto_run_migrations_defaults_by_environment(monkeypatch):
    config_class = db_migration_service.config.__class__

    monkeypatch.delenv("AUTO_RUN_DB_MIGRATIONS", raising=False)
    monkeypatch.setattr(config_class, "ENV", "development")
    assert db_migration_service.config.should_auto_run_migrations() is True

    monkeypatch.setattr(config_class, "ENV", "testing")
    assert db_migration_service.config.should_auto_run_migrations() is False

    monkeypatch.setattr(config_class, "ENV", "production")
    assert db_migration_service.config.should_auto_run_migrations() is False


def test_should_auto_run_migrations_honors_env_override(monkeypatch):
    monkeypatch.setattr(db_migration_service.config.__class__, "ENV", "production")
    monkeypatch.setenv("AUTO_RUN_DB_MIGRATIONS", "true")
    assert db_migration_service.config.should_auto_run_migrations() is True

    monkeypatch.setenv("AUTO_RUN_DB_MIGRATIONS", "false")
    assert db_migration_service.config.should_auto_run_migrations() is False


def test_apply_startup_migrations_runs_upgrade_once(monkeypatch):
    calls = []

    monkeypatch.setattr(db_migration_service.config, "should_auto_run_migrations", lambda: True)
    monkeypatch.setattr(db_migration_service, "build_alembic_config", lambda: "cfg")
    monkeypatch.setattr(db_migration_service.command, "upgrade", lambda cfg, head: calls.append((cfg, head)))
    monkeypatch.setattr(db_migration_service, "_migrations_applied", False)

    assert db_migration_service.apply_startup_migrations() is True
    assert db_migration_service.apply_startup_migrations() is False
    assert calls == [("cfg", "head")]


def test_apply_startup_migrations_skips_when_disabled(monkeypatch):
    monkeypatch.setattr(db_migration_service.config, "should_auto_run_migrations", lambda: False)
    monkeypatch.setattr(db_migration_service, "_migrations_applied", False)

    assert db_migration_service.apply_startup_migrations() is False
