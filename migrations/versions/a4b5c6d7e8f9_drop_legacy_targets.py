"""drop legacy targets (migration B: destructive contract)

Revision ID: a4b5c6d7e8f9
Revises: f3c4d5e6a7b8
Create Date: 2026-10-19

Kind: destructive contract. Completion conditions replaced targets in e1a2c3d4f5b6 (migration A),
which converted every target and left the legacy schema in place. No application code reads it
any more; this revision removes it.

Discarded data:
- tables ``targets``, ``target_metric_conditions``, ``target_contribution_ledgers`` and
  ``target_templates``;
- columns ``goals.targets`` (legacy JSON), ``goals.completed_via_children`` and
  ``goals.allow_manual_completion``;
- columns ``goal_levels.can_have_targets``, ``goal_levels.auto_complete_when_children_done`` and
  ``goal_levels.allow_manual_completion``.

Rollout: take a restorable backup first (local: backups/pre-migration-b/, recorded in
planning/goal-conditions-hierarchy-creation-sequencing.md). Every drop uses IF EXISTS, so fresh
databases and databases built from the models converge. Locks are brief: dropping tables and
nullable columns rewrites nothing.

Verification (expect no rows):
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
        ('targets', 'target_metric_conditions', 'target_contribution_ledgers', 'target_templates')
    UNION ALL
    SELECT table_name || '.' || column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND (
        (table_name = 'goals' AND column_name IN ('targets', 'completed_via_children', 'allow_manual_completion'))
        OR (table_name = 'goal_levels'
            AND column_name IN ('can_have_targets', 'auto_complete_when_children_done', 'allow_manual_completion')));

Downgrade recreates the schema empty, so migration A's downgrade can run; the discarded rows come
back only from the backup.
"""

from alembic import op


revision = "a4b5c6d7e8f9"
down_revision = "f3c4d5e6a7b8"
branch_labels = None
depends_on = None

LEGACY_TABLES = ("target_contribution_ledgers", "target_metric_conditions", "targets", "target_templates")
GOAL_COLUMNS = ("targets", "completed_via_children", "allow_manual_completion")
LEVEL_COLUMNS = ("can_have_targets", "auto_complete_when_children_done", "allow_manual_completion")


def upgrade():
    for table in LEGACY_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    for column in GOAL_COLUMNS:
        op.execute(f"ALTER TABLE goals DROP COLUMN IF EXISTS {column}")
    for column in LEVEL_COLUMNS:
        op.execute(f"ALTER TABLE goal_levels DROP COLUMN IF EXISTS {column}")


def downgrade():
    op.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS targets JSONB")
    op.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS completed_via_children BOOLEAN")
    op.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS allow_manual_completion BOOLEAN")
    for column in LEVEL_COLUMNS:
        op.execute(f"ALTER TABLE goal_levels ADD COLUMN IF NOT EXISTS {column} BOOLEAN")

    op.execute("""
        CREATE TABLE IF NOT EXISTS target_templates (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            description VARCHAR,
            type VARCHAR,
            time_scope VARCHAR,
            frequency_days INTEGER,
            frequency_count INTEGER,
            default_metrics JSONB,
            created_at TIMESTAMP WITHOUT TIME ZONE,
            updated_at TIMESTAMP WITHOUT TIME ZONE,
            deleted_at TIMESTAMP WITHOUT TIME ZONE
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS targets (
            id VARCHAR PRIMARY KEY,
            goal_id VARCHAR NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            root_id VARCHAR NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            activity_id VARCHAR REFERENCES activity_definitions(id) ON DELETE SET NULL,
            name VARCHAR NOT NULL,
            type VARCHAR,
            time_scope VARCHAR,
            start_date TIMESTAMP WITHOUT TIME ZONE,
            end_date TIMESTAMP WITHOUT TIME ZONE,
            linked_block_id VARCHAR REFERENCES program_blocks(id) ON DELETE SET NULL,
            frequency_days INTEGER,
            frequency_count INTEGER,
            completed BOOLEAN,
            completed_at TIMESTAMP WITHOUT TIME ZONE,
            completed_session_id VARCHAR REFERENCES sessions(id) ON DELETE SET NULL,
            completed_instance_id VARCHAR REFERENCES activity_instances(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE,
            updated_at TIMESTAMP WITHOUT TIME ZONE,
            deleted_at TIMESTAMP WITHOUT TIME ZONE,
            template_id VARCHAR REFERENCES target_templates(id) ON DELETE SET NULL,
            activity_group_id VARCHAR REFERENCES activity_groups(id) ON DELETE SET NULL,
            activity_instance_id VARCHAR REFERENCES activity_instances(id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS target_metric_conditions (
            id VARCHAR PRIMARY KEY,
            target_id VARCHAR NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
            metric_definition_id VARCHAR NOT NULL REFERENCES metric_definitions(id) ON DELETE RESTRICT,
            operator VARCHAR NOT NULL,
            target_value INTEGER NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE,
            updated_at TIMESTAMP WITHOUT TIME ZONE
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS target_contribution_ledgers (
            id VARCHAR PRIMARY KEY,
            target_id VARCHAR NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
            activity_instance_id VARCHAR NOT NULL REFERENCES activity_instances(id) ON DELETE CASCADE,
            metric_condition_id VARCHAR NOT NULL REFERENCES target_metric_conditions(id) ON DELETE CASCADE,
            contributed_value INTEGER NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE
        )
    """)
    for table, columns in (
        ("targets", ("activity_group_id", "activity_id", "activity_instance_id", "completed",
                     "completed_instance_id", "completed_session_id", "goal_id", "root_id")),
        ("target_metric_conditions", ("metric_definition_id", "target_id")),
        ("target_contribution_ledgers", ("activity_instance_id", "target_id")),
    ):
        for column in columns:
            op.execute(f"CREATE INDEX IF NOT EXISTS ix_{table}_{column} ON {table} ({column})")
    op.execute("CREATE INDEX IF NOT EXISTS ix_targets_goal_deleted ON targets (goal_id, deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_targets_root_deleted ON targets (root_id, deleted_at)")
    for table in LEGACY_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
