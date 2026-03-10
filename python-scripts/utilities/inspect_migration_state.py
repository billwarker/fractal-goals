"""
Inspect a target PostgreSQL database and recommend an Alembic migration path.

Usage:
    ENV=production DATABASE_URL=postgresql://... \
    python python-scripts/utilities/inspect_migration_state.py

Optional:
    python python-scripts/utilities/inspect_migration_state.py --json

Requirements:
    - DATABASE_URL must point at the database you want to inspect
    - Intended for PostgreSQL targets such as Supabase
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

BASELINE_REVISION = "5d02309afbcb"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON output.",
    )
    return parser


def get_database_url() -> str:
    from config import config

    return config.get_database_url()


def get_alembic_heads() -> list[str]:
    alembic_config = AlembicConfig(str(PROJECT_ROOT / "alembic.ini"))
    script = ScriptDirectory.from_config(alembic_config)
    return sorted(script.get_heads())


def get_columns(inspector, table_name: str) -> set[str]:
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def get_column_type(connection, table_name: str, column_name: str) -> str | None:
    query = text(
        """
        SELECT udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = :table_name
          AND column_name = :column_name
        """
    )
    return connection.execute(
        query,
        {"table_name": table_name, "column_name": column_name},
    ).scalar()


def get_index_names(connection, table_name: str) -> set[str]:
    query = text(
        """
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = :table_name
        """
    )
    rows = connection.execute(query, {"table_name": table_name}).fetchall()
    return {row[0] for row in rows}


def get_alembic_versions(connection, table_names: set[str]) -> list[str]:
    if "alembic_version" not in table_names:
        return []
    rows = connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()
    return sorted(row[0] for row in rows)


def build_marker_report(connection, inspector, table_names: set[str]) -> tuple[dict, list[str]]:
    goals_columns = get_columns(inspector, "goals")
    goal_levels_columns = get_columns(inspector, "goal_levels")
    targets_columns = get_columns(inspector, "targets")
    session_goals_columns = get_columns(inspector, "session_goals")
    programs_columns = get_columns(inspector, "programs")
    program_blocks_columns = get_columns(inspector, "program_blocks")
    activity_instances_columns = get_columns(inspector, "activity_instances")
    metric_values_columns = get_columns(inspector, "metric_values")

    latest_markers = {
        "goal_levels_table_exists": "goal_levels" in table_names,
        "goals_use_level_id_not_type": "level_id" in goals_columns and "type" not in goals_columns,
        "program_day_sessions_table_exists": "program_day_sessions" in table_names,
        "targets_use_template_links": (
            "template_id" in targets_columns
            and "activity_group_id" in targets_columns
            and "metrics" not in targets_columns
        ),
        "program_goal_arrays_removed": (
            "goal_ids" not in programs_columns and "goal_ids" not in program_blocks_columns
        ),
        "legacy_practice_session_id_removed": "practice_session_id" not in activity_instances_columns,
        "metric_values_root_id_removed": "root_id" not in metric_values_columns,
        "session_goal_provenance_present": "association_source" in session_goals_columns,
        "goal_levels_customization_columns_present": {
            "owner_id",
            "root_id",
            "allow_manual_completion",
            "track_activities",
            "requires_smart",
        }.issubset(goal_levels_columns),
        "goal_levels_deadline_value_unit_columns_present": {
            "deadline_min_value",
            "deadline_min_unit",
            "deadline_max_value",
            "deadline_max_unit",
            "default_deadline_offset_value",
            "default_deadline_offset_unit",
        }.issubset(goal_levels_columns),
        "goal_levels_legacy_deadline_day_columns_removed": {
            "deadline_min_days",
            "deadline_max_days",
            "default_deadline_offset_days",
        }.isdisjoint(goal_levels_columns),
    }

    jsonb_targets = {
        ("activity_instances", "data"),
        ("goals", "targets"),
        ("sessions", "attributes"),
        ("session_templates", "template_data"),
        ("visualization_annotations", "visualization_context"),
        ("visualization_annotations", "selected_points"),
        ("visualization_annotations", "selection_bounds"),
    }

    jsonb_program_columns = {
        ("programs", "weekly_schedule"),
    }

    jsonb_column_types = {}
    for table_name, column_name in sorted(jsonb_targets | jsonb_program_columns):
        if column_name in get_columns(inspector, table_name):
            jsonb_column_types[f"{table_name}.{column_name}"] = get_column_type(
                connection,
                table_name,
                column_name,
            )

    if "goal_ids" in programs_columns:
        jsonb_column_types["programs.goal_ids"] = get_column_type(
            connection,
            "programs",
            "goal_ids",
        )

    latest_markers["native_jsonb_columns_present"] = all(
        value == "jsonb" for value in jsonb_column_types.values()
    )

    drift_flags = []
    if "type" in goals_columns and "level_id" in goals_columns:
        drift_flags.append("goals has both legacy 'type' and new 'level_id' columns")
    if "metrics" in targets_columns and (
        "template_id" in targets_columns or "activity_group_id" in targets_columns
    ):
        drift_flags.append("targets mixes legacy metrics column with new template/activity group columns")
    if (
        {"deadline_min_days", "deadline_max_days", "default_deadline_offset_days"} & goal_levels_columns
        and {
            "deadline_min_value",
            "deadline_min_unit",
            "deadline_max_value",
            "deadline_max_unit",
            "default_deadline_offset_value",
            "default_deadline_offset_unit",
        }
        & goal_levels_columns
    ):
        drift_flags.append("goal_levels contains both legacy deadline day columns and new value/unit columns")
    if "goal_levels" in table_names and "owner_id" not in goal_levels_columns:
        drift_flags.append("goal_levels exists but lacks later customization columns")
    if "program_day_sessions" in table_names and "goal_levels" not in table_names:
        drift_flags.append("program_day_sessions exists without goal_levels, suggesting partial schema-improvements migration")

    indexes = {
        "goals": get_index_names(connection, "goals") if "goals" in table_names else set(),
        "activity_instances": (
            get_index_names(connection, "activity_instances")
            if "activity_instances" in table_names
            else set()
        ),
        "sessions": get_index_names(connection, "sessions") if "sessions" in table_names else set(),
        "event_logs": get_index_names(connection, "event_logs") if "event_logs" in table_names else set(),
    }

    report = {
        "latest_markers": latest_markers,
        "jsonb_column_types": jsonb_column_types,
        "notable_indexes": {
            "ix_goals_root_deleted_level": "ix_goals_root_deleted_level" in indexes["goals"],
            "ix_activity_instances_root_deleted_session": (
                "ix_activity_instances_root_deleted_session" in indexes["activity_instances"]
            ),
            "ix_sessions_root_deleted_created": "ix_sessions_root_deleted_created" in indexes["sessions"],
            "ix_event_logs_root_timestamp": "ix_event_logs_root_timestamp" in indexes["event_logs"],
        },
    }
    return report, drift_flags


def build_recommendation(
    table_names: set[str],
    alembic_versions: list[str],
    alembic_heads: list[str],
    marker_report: dict,
    drift_flags: list[str],
) -> dict:
    core_tables = {"goals", "sessions", "activity_instances", "programs", "users"}
    core_present = core_tables.issubset(table_names)
    latest_markers = marker_report["latest_markers"]
    all_latest = all(latest_markers.values())
    any_latest = any(latest_markers.values())

    if not core_present:
        return {
            "path": "upgrade_head",
            "reason": "Core application tables are missing, so this looks like a fresh database.",
            "commands": [
                "ENV=production DATABASE_URL='postgresql://...' python db_migrate.py upgrade",
            ],
        }

    if alembic_versions:
        if alembic_versions == alembic_heads and not drift_flags:
            return {
                "path": "already_at_head",
                "reason": "alembic_version already matches the repo head and no schema drift markers were detected.",
                "commands": [],
            }
        if drift_flags:
            return {
                "path": "manual_reconcile",
                "reason": "The database has Alembic history but also shows schema drift. Reconcile the schema before trusting upgrade paths.",
                "commands": [],
            }
        return {
            "path": "upgrade_from_recorded_revision",
            "reason": "alembic_version is present and behind head, so the safest path is a normal Alembic upgrade after backup.",
            "commands": [
                "ENV=production DATABASE_URL='postgresql://...' python db_migrate.py current",
                "ENV=production DATABASE_URL='postgresql://...' python db_migrate.py upgrade",
            ],
        }

    if drift_flags:
        return {
            "path": "manual_reconcile",
            "reason": "No alembic_version table exists and the schema has mixed old/new markers. Blind stamping would hide drift.",
            "commands": [],
        }

    if all_latest:
        return {
            "path": "stamp_head",
            "reason": "Schema markers match current head closely, but the database is missing Alembic history.",
            "commands": [
                "ENV=production DATABASE_URL='postgresql://...' python db_migrate.py stamp head",
            ],
        }

    if not any_latest:
        return {
            "path": "stamp_baseline_then_upgrade",
            "reason": "Core tables exist but later Alembic markers are absent, which matches an imported pre-Alembic/manual schema.",
            "commands": [
                f"ENV=production DATABASE_URL='postgresql://...' python db_migrate.py stamp {BASELINE_REVISION}",
                "ENV=production DATABASE_URL='postgresql://...' python db_migrate.py upgrade",
            ],
        }

    return {
        "path": "manual_reconcile",
        "reason": "The schema appears to be mid-transition. Identify the missing/manual changes before stamping or upgrading.",
        "commands": [],
    }


def inspect_database() -> dict:
    database_url = get_database_url()
    alembic_heads = get_alembic_heads()
    engine = create_engine(database_url, pool_pre_ping=True)

    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        alembic_versions = get_alembic_versions(connection, table_names)
        marker_report, drift_flags = build_marker_report(connection, inspector, table_names)
        recommendation = build_recommendation(
            table_names,
            alembic_versions,
            alembic_heads,
            marker_report,
            drift_flags,
        )

        return {
            "database": {
                "name": connection.execute(text("SELECT current_database()")).scalar(),
                "schema": connection.execute(text("SELECT current_schema()")).scalar(),
                "server_version": connection.execute(text("SHOW server_version")).scalar(),
            },
            "alembic": {
                "versions": alembic_versions,
                "heads": alembic_heads,
                "version_table_present": "alembic_version" in table_names,
            },
            "table_count": len(table_names),
            "tables_sample": sorted(table_names)[:20],
            "markers": marker_report,
            "drift_flags": drift_flags,
            "recommendation": recommendation,
        }


def print_text_report(report: dict) -> None:
    print("Migration State Report")
    print("======================")
    print(f"Database:       {report['database']['name']}")
    print(f"Schema:         {report['database']['schema']}")
    print(f"Server version: {report['database']['server_version']}")
    print("")
    print("Alembic")
    print("-------")
    print(f"Version table present: {report['alembic']['version_table_present']}")
    print(f"Recorded revisions:    {report['alembic']['versions'] or 'none'}")
    print(f"Repo heads:            {report['alembic']['heads']}")
    print("")
    print("Schema Markers")
    print("--------------")
    for name, value in sorted(report["markers"]["latest_markers"].items()):
        print(f"{name}: {value}")
    print("")
    print("JSONB Columns")
    print("-------------")
    for name, value in sorted(report["markers"]["jsonb_column_types"].items()):
        print(f"{name}: {value}")
    print("")
    if report["drift_flags"]:
        print("Drift Flags")
        print("-----------")
        for flag in report["drift_flags"]:
            print(f"- {flag}")
        print("")
    print("Recommendation")
    print("--------------")
    print(f"Path:   {report['recommendation']['path']}")
    print(f"Reason: {report['recommendation']['reason']}")
    if report["recommendation"]["commands"]:
        print("Commands:")
        for command in report["recommendation"]["commands"]:
            print(f"  {command}")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        report = inspect_database()
    except SQLAlchemyError as exc:
        print(f"Database inspection failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Inspection failed: {exc}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_text_report(report)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
