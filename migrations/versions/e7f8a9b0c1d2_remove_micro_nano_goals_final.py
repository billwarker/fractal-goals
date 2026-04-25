"""remove_micro_nano_goals_final

Revision ID: e7f8a9b0c1d2
Revises: 9d4e5f6a7b8c
Create Date: 2026-04-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, Sequence[str], None] = '9d4e5f6a7b8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reassign any goals still on Micro/Nano level to Immediate Goal
    op.execute("""
        UPDATE goals
        SET level_id = (
            SELECT id FROM goal_levels
            WHERE name = 'Immediate Goal'
              AND owner_id IS NULL
              AND deleted_at IS NULL
            LIMIT 1
        )
        WHERE level_id IN (
            SELECT id FROM goal_levels
            WHERE name IN ('Micro Goal', 'Nano Goal')
        )
          AND deleted_at IS NULL
    """)

    # Soft-delete Micro Goal and Nano Goal system levels
    op.execute("""
        UPDATE goal_levels
        SET deleted_at = NOW()
        WHERE name IN ('Micro Goal', 'Nano Goal')
          AND deleted_at IS NULL
    """)

    # Drop nano_goal_id from notes
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    note_columns = {column['name'] for column in inspector.get_columns('notes')}
    if 'nano_goal_id' in note_columns:
        note_indexes = {index['name'] for index in inspector.get_indexes('notes')}
        if 'ix_notes_nano_goal_id' in note_indexes:
            op.drop_index('ix_notes_nano_goal_id', table_name='notes')

        note_fk_names = {
            fk['name']
            for fk in inspector.get_foreign_keys('notes')
            if fk.get('name') and fk.get('constrained_columns') == ['nano_goal_id']
        }
        with op.batch_alter_table('notes') as batch_op:
            for fk_name in note_fk_names:
                batch_op.drop_constraint(fk_name, type_='foreignkey')
            batch_op.drop_column('nano_goal_id')


def downgrade() -> None:
    with op.batch_alter_table('notes') as batch_op:
        batch_op.add_column(sa.Column('nano_goal_id', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'notes_nano_goal_id_fkey', 'goals',
            ['nano_goal_id'], ['id'],
            ondelete='SET NULL'
        )
    op.create_index('ix_notes_nano_goal_id', 'notes', ['nano_goal_id'], unique=False)

    op.execute("""
        UPDATE goal_levels
        SET deleted_at = NULL
        WHERE name IN ('Micro Goal', 'Nano Goal')
    """)
