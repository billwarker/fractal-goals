"""Program days can ask for activities, besides session templates.

A day's activity condition is met by any completed instance of the activity on the occurrence's
date, in any session; with tags, only an instance with a set carrying them. Activities count with
the day's templates toward "required" and "at least N completed".

Additive: existing days have no activity conditions, so their evaluation is unchanged.
"""
from alembic import op
import sqlalchemy as sa

revision = '21c3aad52e2e'
down_revision = '67829adf72b4'
branch_labels = None
depends_on = None

# Frozen copy of models.program.PROGRAM_DAY_ACTIVITY_CONDITION_TAG_TRIGGER_SQL at this revision.
TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION enforce_program_day_activity_condition_tag_root() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM program_day_activity_conditions condition_row
        JOIN activity_tag_definitions tag ON tag.root_id = condition_row.root_id
        WHERE condition_row.id = NEW.condition_id AND tag.id = NEW.tag_definition_id
    ) THEN
        RAISE EXCEPTION 'condition and tag must share a fractal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_program_day_activity_condition_tags_root ON program_day_activity_condition_tags;
CREATE TRIGGER trg_program_day_activity_condition_tags_root
BEFORE INSERT OR UPDATE ON program_day_activity_condition_tags
FOR EACH ROW EXECUTE FUNCTION enforce_program_day_activity_condition_tag_root();
"""


def upgrade():
    op.create_table(
        'program_day_activity_conditions',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column(
            'program_day_id', sa.String(), sa.ForeignKey('program_days.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column(
            'activity_definition_id', sa.String(),
            sa.ForeignKey('activity_definitions.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('is_required', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tag_match', sa.String(), nullable=False, server_default='contains'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint("tag_match IN ('contains', 'exact')", name='ck_program_day_activity_conditions_tag_match'),
    )
    for column in ('program_day_id', 'root_id', 'activity_definition_id'):
        op.create_index(
            f'ix_program_day_activity_conditions_{column}', 'program_day_activity_conditions', [column],
        )
    op.create_table(
        'program_day_activity_condition_tags',
        sa.Column(
            'condition_id', sa.String(),
            sa.ForeignKey('program_day_activity_conditions.id', ondelete='CASCADE'), primary_key=True,
        ),
        sa.Column(
            'tag_definition_id', sa.String(),
            sa.ForeignKey('activity_tag_definitions.id', ondelete='CASCADE'), primary_key=True,
        ),
    )
    op.create_index(
        'ix_program_day_activity_condition_tags_tag', 'program_day_activity_condition_tags',
        ['tag_definition_id', 'condition_id'],
    )
    op.execute(TRIGGER_SQL)


def downgrade():
    op.execute(
        "DROP TRIGGER IF EXISTS trg_program_day_activity_condition_tags_root ON program_day_activity_condition_tags"
    )
    op.execute("DROP FUNCTION IF EXISTS enforce_program_day_activity_condition_tag_root()")
    op.drop_index('ix_program_day_activity_condition_tags_tag', table_name='program_day_activity_condition_tags')
    op.drop_table('program_day_activity_condition_tags')
    for column in ('program_day_id', 'root_id', 'activity_definition_id'):
        op.drop_index(f'ix_program_day_activity_conditions_{column}', table_name='program_day_activity_conditions')
    op.drop_table('program_day_activity_conditions')
