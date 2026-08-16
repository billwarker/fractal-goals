"""harden tag and progress-view ownership integrity

Revision ID: b3d5f7a9c2e4
Revises: a2c4e6f8b1d3
Create Date: 2026-08-16

This forward-only corrective revision also contracts a head-stamped database
that retained the obsolete progress_records table. ``IF EXISTS`` keeps fresh
databases, where the preceding revision already removed it, deterministic.
"""

import sqlalchemy as sa
from alembic import op


revision = "b3d5f7a9c2e4"
down_revision = "a2c4e6f8b1d3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("DROP TABLE IF EXISTS progress_records CASCADE")

    op.add_column(
        "activity_instances",
        sa.Column("tag_assignment_version", sa.Integer(), server_default="1", nullable=False),
    )
    op.create_check_constraint(
        "ck_activity_instances_tag_assignment_version_positive",
        "activity_instances",
        "tag_assignment_version > 0",
    )
    op.add_column(
        "activity_sets",
        sa.Column("tag_assignment_version", sa.Integer(), server_default="1", nullable=False),
    )
    op.create_check_constraint(
        "ck_activity_sets_tag_assignment_version_positive",
        "activity_sets",
        "tag_assignment_version > 0",
    )

    op.create_index(
        "ix_activity_instances_progress_history",
        "activity_instances",
        ["activity_definition_id", "root_id", "time_stop", "created_at", "id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_activity_progress_views_active_activity_updated",
        "activity_progress_views",
        ["activity_definition_id", "updated_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_activity_tags_activity_order_active",
        "activity_tags",
        ["activity_definition_id", "sort_order", "name"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_activity_owned_child_scope()
        RETURNS trigger AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM activity_definitions definition
                WHERE definition.id = NEW.activity_definition_id
                  AND definition.root_id = NEW.root_id
            ) THEN
                RAISE EXCEPTION 'activity-owned record must share its activity root'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_activity_tags_owned_scope
        BEFORE INSERT OR UPDATE OF root_id, activity_definition_id ON activity_tags
        FOR EACH ROW EXECUTE FUNCTION enforce_activity_owned_child_scope()
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_activity_progress_views_owned_scope
        BEFORE INSERT OR UPDATE OF root_id, activity_definition_id ON activity_progress_views
        FOR EACH ROW EXECUTE FUNCTION enforce_activity_owned_child_scope()
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_activity_instance_tag_scope()
        RETURNS trigger AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM activity_instances instance
                JOIN activity_tags tag ON tag.id = NEW.activity_tag_id
                WHERE instance.id = NEW.activity_instance_id
                  AND instance.root_id = tag.root_id
                  AND instance.activity_definition_id = tag.activity_definition_id
            ) THEN
                RAISE EXCEPTION 'instance tag must belong to the same root and activity'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_activity_instance_tags_scope
        BEFORE INSERT OR UPDATE ON activity_instance_tags
        FOR EACH ROW EXECUTE FUNCTION enforce_activity_instance_tag_scope()
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_activity_set_tag_scope()
        RETURNS trigger AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM activity_sets activity_set
                JOIN activity_instances instance ON instance.id = activity_set.activity_instance_id
                JOIN activity_tags tag ON tag.id = NEW.activity_tag_id
                WHERE activity_set.id = NEW.activity_set_id
                  AND instance.root_id = tag.root_id
                  AND instance.activity_definition_id = tag.activity_definition_id
            ) THEN
                RAISE EXCEPTION 'set tag must belong to the same root and activity'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_activity_set_tags_scope
        BEFORE INSERT OR UPDATE ON activity_set_tags
        FOR EACH ROW EXECUTE FUNCTION enforce_activity_set_tag_scope()
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_active_progress_view_scope()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.active_progress_view_id IS NOT NULL AND NOT EXISTS (
                SELECT 1
                FROM activity_progress_views progress_view
                WHERE progress_view.id = NEW.active_progress_view_id
                  AND progress_view.activity_definition_id = NEW.id
                  AND progress_view.root_id = NEW.root_id
                  AND progress_view.deleted_at IS NULL
            ) THEN
                RAISE EXCEPTION 'active progress view must be active and belong to this activity'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_activity_definitions_active_progress_view_scope
        BEFORE INSERT OR UPDATE OF active_progress_view_id, root_id ON activity_definitions
        FOR EACH ROW EXECUTE FUNCTION enforce_active_progress_view_scope()
        """
    )


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_activity_definitions_active_progress_view_scope ON activity_definitions")
    op.execute("DROP FUNCTION IF EXISTS enforce_active_progress_view_scope()")
    op.execute("DROP TRIGGER IF EXISTS trg_activity_set_tags_scope ON activity_set_tags")
    op.execute("DROP FUNCTION IF EXISTS enforce_activity_set_tag_scope()")
    op.execute("DROP TRIGGER IF EXISTS trg_activity_instance_tags_scope ON activity_instance_tags")
    op.execute("DROP FUNCTION IF EXISTS enforce_activity_instance_tag_scope()")
    op.execute("DROP TRIGGER IF EXISTS trg_activity_progress_views_owned_scope ON activity_progress_views")
    op.execute("DROP TRIGGER IF EXISTS trg_activity_tags_owned_scope ON activity_tags")
    op.execute("DROP FUNCTION IF EXISTS enforce_activity_owned_child_scope()")
    op.drop_index("ix_activity_tags_activity_order_active", table_name="activity_tags")
    op.drop_index("ix_activity_progress_views_active_activity_updated", table_name="activity_progress_views")
    op.drop_index("ix_activity_instances_progress_history", table_name="activity_instances")
    op.drop_constraint("ck_activity_sets_tag_assignment_version_positive", "activity_sets", type_="check")
    op.drop_column("activity_sets", "tag_assignment_version")
    op.drop_constraint("ck_activity_instances_tag_assignment_version_positive", "activity_instances", type_="check")
    op.drop_column("activity_instances", "tag_assignment_version")
