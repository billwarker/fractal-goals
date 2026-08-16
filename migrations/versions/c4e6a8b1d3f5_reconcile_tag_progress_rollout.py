"""reconcile partially stamped tag-progress rollouts

Revision ID: c4e6a8b1d3f5
Revises: b3d5f7a9c2e4
Create Date: 2026-08-16

Some local databases were stamped at the preceding revision while its
transactional column/index work was absent.  Keep this revision idempotent so
both complete and partially applied databases converge without touching user
data.
"""

from alembic import op


revision = "c4e6a8b1d3f5"
down_revision = "b3d5f7a9c2e4"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE activity_instances "
        "ADD COLUMN IF NOT EXISTS tag_assignment_version INTEGER NOT NULL DEFAULT 1"
    )
    op.execute(
        "ALTER TABLE activity_sets "
        "ADD COLUMN IF NOT EXISTS tag_assignment_version INTEGER NOT NULL DEFAULT 1"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_activity_instances_tag_assignment_version_positive'
                  AND conrelid = 'activity_instances'::regclass
            ) THEN
                ALTER TABLE activity_instances
                ADD CONSTRAINT ck_activity_instances_tag_assignment_version_positive
                CHECK (tag_assignment_version > 0);
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_activity_sets_tag_assignment_version_positive'
                  AND conrelid = 'activity_sets'::regclass
            ) THEN
                ALTER TABLE activity_sets
                ADD CONSTRAINT ck_activity_sets_tag_assignment_version_positive
                CHECK (tag_assignment_version > 0);
            END IF;
        END
        $$;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_activity_instances_progress_history "
        "ON activity_instances (activity_definition_id, root_id, time_stop, created_at, id) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_activity_progress_views_active_activity_updated "
        "ON activity_progress_views (activity_definition_id, updated_at) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_activity_tags_activity_order_active "
        "ON activity_tags (activity_definition_id, sort_order, name) "
        "WHERE deleted_at IS NULL"
    )


def downgrade():
    # The preceding revision defines these same canonical objects. A no-op
    # downgrade preserves the schema contract while allowing re-upgrade tests.
    pass
