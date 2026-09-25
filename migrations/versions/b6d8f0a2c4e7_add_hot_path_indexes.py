"""Add indexes for hot reverse lookups and cascade paths.

Association tables' composite primary keys lead with their owning column, so
lookups by goal (goal metrics, session analytics, activity/goal associations)
and cascading goal deletes scanned the whole table. Goals also gain a
parent-first index for child lookups that do not filter by root.

Indexes are built CONCURRENTLY on PostgreSQL so writes are never blocked. The
statements are idempotent (IF [NOT] EXISTS), so a partially applied run can be
re-run safely.

Revision ID: b6d8f0a2c4e7
Revises: a4c6e8f0b2d5
"""
from alembic import op


revision = "b6d8f0a2c4e7"
down_revision = "a4c6e8f0b2d5"
branch_labels = None
depends_on = None

INDEXES = (
    ("ix_session_goals_goal_id", "session_goals", ["goal_id"]),
    ("ix_activity_goal_associations_goal_id", "activity_goal_associations", ["goal_id"]),
    ("ix_goal_activity_group_associations_activity_group_id", "goal_activity_group_associations", ["activity_group_id"]),
    ("ix_session_template_goals_goal_id", "session_template_goals", ["goal_id"]),
    ("ix_program_day_goals_goal_id", "program_day_goals", ["goal_id"]),
    ("ix_program_goals_goal_id", "program_goals", ["goal_id"]),
    ("ix_program_block_goals_goal_id", "program_block_goals", ["goal_id"]),
    ("ix_program_day_templates_session_template_id", "program_day_templates", ["session_template_id"]),
    ("ix_goals_parent_deleted", "goals", ["parent_id", "deleted_at"]),
    ("ix_goals_completed_session_id", "goals", ["completed_session_id"]),
    ("ix_targets_completed_session_id", "targets", ["completed_session_id"]),
    ("ix_targets_completed_instance_id", "targets", ["completed_instance_id"]),
    ("ix_metric_values_metric_definition_id", "metric_values", ["metric_definition_id"]),
    ("ix_target_metric_conditions_metric_definition_id", "target_metric_conditions", ["metric_definition_id"]),
    ("ix_activity_duration_stats_activity_definition_id", "activity_duration_stats", ["activity_definition_id"]),
)


def _is_postgres():
    return op.get_bind().dialect.name == "postgresql"


def upgrade():
    if not _is_postgres():
        for name, table, columns in INDEXES:
            op.create_index(name, table, columns, if_not_exists=True)
        return
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for name, table, columns in INDEXES:
            op.create_index(name, table, columns, postgresql_concurrently=True, if_not_exists=True)


def downgrade():
    if not _is_postgres():
        for name, table, _ in reversed(INDEXES):
            op.drop_index(name, table_name=table, if_exists=True)
        return
    with op.get_context().autocommit_block():
        for name, table, _ in reversed(INDEXES):
            op.drop_index(name, table_name=table, postgresql_concurrently=True, if_exists=True)
