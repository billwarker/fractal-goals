"""Let a deleted sequence track clear its goals' track id.

`goals.sequence_track_id` is ON DELETE SET NULL, which leaves `sequence_position` behind; the
original both-or-neither CHECK then rejected the delete (e.g. a fractal's hard delete cascading
to its tracks). The rule that matters is that a track id never goes without a position.

Revision ID: f3c4d5e6a7b8
Revises: e1a2c3d4f5b6
"""
from alembic import op

revision = 'f3c4d5e6a7b8'
down_revision = 'e1a2c3d4f5b6'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint('ck_goals_sequence_pair', 'goals', type_='check')
    op.execute('UPDATE goals SET sequence_position = NULL WHERE sequence_track_id IS NULL')
    op.create_check_constraint(
        'ck_goals_sequence_pair', 'goals', 'sequence_track_id IS NULL OR sequence_position IS NOT NULL',
    )


def downgrade():
    op.drop_constraint('ck_goals_sequence_pair', 'goals', type_='check')
    op.execute('UPDATE goals SET sequence_position = NULL WHERE sequence_track_id IS NULL')
    op.create_check_constraint(
        'ck_goals_sequence_pair', 'goals', '(sequence_track_id IS NULL) = (sequence_position IS NULL)',
    )
