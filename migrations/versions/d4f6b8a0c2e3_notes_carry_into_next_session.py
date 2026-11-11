"""Session notes can be pinned to the next session.

Additive: `notes.carried_into_session_id` records the session that used a session note's next-time pin,
as `carried_into_instance_id` does for activity notes. The pending-pin index and shape check now count
either target as consumed.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4f6b8a0c2e3'
down_revision = 'c2e4a6b8d0f1'
branch_labels = None
depends_on = None

PENDING = 'carry_forward_at IS NOT NULL AND carried_into_instance_id IS NULL AND deleted_at IS NULL'


def upgrade():
    op.add_column('notes', sa.Column('carried_into_session_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_notes_carried_into_session_id', 'notes', 'sessions',
        ['carried_into_session_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_notes_carried_into_session_id', 'notes', ['carried_into_session_id'])
    op.drop_constraint('ck_notes_carry_forward_shape', 'notes', type_='check')
    op.create_check_constraint(
        'ck_notes_carry_forward_shape', 'notes',
        'carry_forward_at IS NOT NULL OR (carried_into_instance_id IS NULL AND carried_into_session_id IS NULL)',
    )
    op.drop_index('ix_notes_pending_carry', table_name='notes')
    op.create_index(
        'ix_notes_pending_carry', 'notes', ['root_id', 'activity_definition_id'],
        postgresql_where=sa.text(f'{PENDING} AND carried_into_session_id IS NULL'),
    )


def downgrade():
    op.drop_index('ix_notes_pending_carry', table_name='notes')
    op.create_index('ix_notes_pending_carry', 'notes', ['root_id', 'activity_definition_id'], postgresql_where=sa.text(PENDING))
    op.drop_constraint('ck_notes_carry_forward_shape', 'notes', type_='check')
    op.create_check_constraint(
        'ck_notes_carry_forward_shape', 'notes', 'carry_forward_at IS NOT NULL OR carried_into_instance_id IS NULL',
    )
    op.drop_index('ix_notes_carried_into_session_id', table_name='notes')
    op.drop_constraint('fk_notes_carried_into_session_id', 'notes', type_='foreignkey')
    op.drop_column('notes', 'carried_into_session_id')
