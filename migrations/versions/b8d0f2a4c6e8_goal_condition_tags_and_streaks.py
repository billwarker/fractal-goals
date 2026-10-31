"""Activity thresholds can require tags on counted sets, and consistency can require a streak.

Additive: existing conditions keep no tags and `consecutive = false`, so their evaluation is
unchanged.
"""
from alembic import op
import sqlalchemy as sa

revision = 'b8d0f2a4c6e8'
down_revision = 'a7c9e1b3d5f7'
branch_labels = None
depends_on = None

# Frozen copy of models.goal.GOAL_CONDITION_TAG_TRIGGER_SQL at this revision.
TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION enforce_goal_condition_tag_root() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM goal_completion_conditions condition_row
        JOIN activity_tag_definitions tag ON tag.root_id = condition_row.root_id
        WHERE condition_row.id = NEW.condition_id AND tag.id = NEW.tag_definition_id
    ) THEN
        RAISE EXCEPTION 'condition and tag must share a fractal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_goal_condition_tags_root ON goal_condition_tags;
CREATE TRIGGER trg_goal_condition_tags_root BEFORE INSERT OR UPDATE ON goal_condition_tags
FOR EACH ROW EXECUTE FUNCTION enforce_goal_condition_tag_root();
"""


def upgrade():
    op.add_column(
        'goal_completion_conditions',
        sa.Column('consecutive', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.create_check_constraint(
        'ck_goal_conditions_consecutive', 'goal_completion_conditions', "NOT consecutive OR kind = 'consistency'",
    )
    op.create_table(
        'goal_condition_tags',
        sa.Column(
            'condition_id', sa.String(),
            sa.ForeignKey('goal_completion_conditions.id', ondelete='CASCADE'), primary_key=True,
        ),
        sa.Column(
            'tag_definition_id', sa.String(),
            sa.ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'), primary_key=True,
        ),
    )
    op.create_index('ix_goal_condition_tags_tag', 'goal_condition_tags', ['tag_definition_id', 'condition_id'])
    op.execute(TRIGGER_SQL)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_goal_condition_tags_root ON goal_condition_tags")
    op.execute("DROP FUNCTION IF EXISTS enforce_goal_condition_tag_root()")
    op.drop_index('ix_goal_condition_tags_tag', table_name='goal_condition_tags')
    op.drop_table('goal_condition_tags')
    op.drop_constraint('ck_goal_conditions_consecutive', 'goal_completion_conditions', type_='check')
    op.drop_column('goal_completion_conditions', 'consecutive')
