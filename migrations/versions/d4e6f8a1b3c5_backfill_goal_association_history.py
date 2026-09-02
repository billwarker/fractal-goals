"""Backfill immutable goal association history.

Revision ID: d4e6f8a1b3c5
Revises: c3d5e7f9a1b2
"""
from alembic import op
import sqlalchemy as sa


revision = "d4e6f8a1b3c5"
down_revision = "c3d5e7f9a1b2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "ix_event_logs_root_association_goal_timestamp_desc",
        "event_logs",
        [
            "root_id",
            sa.text("(payload ->> 'goal_id')"),
            sa.text('timestamp DESC'),
        ],
        postgresql_where=sa.text(
            "event_type IN ('activity.associated', 'activity.disassociated', "
            "'activity_group.associated', 'activity_group.disassociated')"
        ),
    )
    op.execute("""
        INSERT INTO event_logs (
            id, root_id, event_type, entity_type, entity_id,
            description, payload, source, timestamp
        )
        SELECT
            md5('aga-associated:' || aga.goal_id || ':' || aga.activity_id),
            g.root_id,
            'activity.associated',
            'activity',
            ad.id,
            'Associated activity: ' || ad.name,
            jsonb_build_object(
                'goal_id', g.id,
                'activity_definition_id', ad.id,
                'activity_name', ad.name
            ),
            'association_backfill',
            aga.created_at
        FROM activity_goal_associations aga
        JOIN goals g ON g.id = aga.goal_id
        JOIN activity_definitions ad ON ad.id = aga.activity_id
        WHERE aga.deleted_at IS NULL
          AND g.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM event_logs existing
              WHERE existing.event_type = 'activity.associated'
                AND existing.entity_id = ad.id
                AND existing.payload ->> 'goal_id' = g.id
          )
    """)
    op.execute("""
        INSERT INTO event_logs (
            id, root_id, event_type, entity_type, entity_id,
            description, payload, source, timestamp
        )
        SELECT
            md5(
                'group-associated:' || gaga.goal_id || ':' ||
                gaga.activity_group_id
            ),
            g.root_id,
            'activity_group.associated',
            'activity_group',
            ag.id,
            'Associated activity group: ' || ag.name,
            jsonb_build_object(
                'goal_id', g.id,
                'activity_group_id', ag.id,
                'activity_group_name', ag.name
            ),
            'association_backfill',
            gaga.created_at
        FROM goal_activity_group_associations gaga
        JOIN goals g ON g.id = gaga.goal_id
        JOIN activity_groups ag ON ag.id = gaga.activity_group_id
        WHERE gaga.deleted_at IS NULL
          AND g.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM event_logs existing
              WHERE existing.event_type = 'activity_group.associated'
                AND existing.entity_id = ag.id
                AND existing.payload ->> 'goal_id' = g.id
          )
    """)


def downgrade():
    op.execute("DELETE FROM event_logs WHERE source = 'association_backfill'")
    op.execute(
        "DROP INDEX IF EXISTS "
        "ix_event_logs_root_association_goal_timestamp_desc"
    )
