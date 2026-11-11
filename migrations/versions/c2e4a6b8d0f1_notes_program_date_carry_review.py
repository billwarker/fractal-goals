"""Notes on a program's calendar dates, carry-forward pins and structured goal reviews.

Additive: new nullable columns, indexes and check constraints on `notes`. `program_id` is backfilled
for existing program notes. The new `ck_notes_context_type` closes a gap where only request
validation constrained `context_type`; the migration aborts, listing them, if any row already holds
a value outside the known set, rather than rewriting notes.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c2e4a6b8d0f1'
down_revision = 'a7c9e1f3b5d7'
branch_labels = None
depends_on = None

CONTEXT_TYPES = (
    'root', 'goal', 'session', 'program', 'program_date',
    'activity_instance', 'activity_definition', 'circuit_run', 'circuit_round',
)
QUOTED = ', '.join(f"'{value}'" for value in CONTEXT_TYPES)


def upgrade():
    bind = op.get_bind()
    stray = bind.execute(sa.text(f"""
        SELECT context_type, count(*) FROM notes
        WHERE context_type NOT IN ({QUOTED})
        GROUP BY context_type ORDER BY context_type
    """)).all()
    if stray:
        listed = ', '.join(f'{value} ({count})' for value, count in stray)
        raise RuntimeError(f'Notes hold unknown context types: {listed}. Resolve them, then re-run the migration.')

    op.add_column('notes', sa.Column('program_id', sa.String(), nullable=True))
    op.add_column('notes', sa.Column('calendar_date', sa.Date(), nullable=True))
    op.add_column('notes', sa.Column('carry_forward_at', sa.DateTime(), nullable=True))
    op.add_column('notes', sa.Column('carried_into_instance_id', sa.String(), nullable=True))
    op.add_column('notes', sa.Column('review_data', postgresql.JSONB(), nullable=True))
    op.create_foreign_key('fk_notes_program_id', 'notes', 'programs', ['program_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key(
        'fk_notes_carried_into_instance_id', 'notes', 'activity_instances',
        ['carried_into_instance_id'], ['id'], ondelete='SET NULL',
    )

    bind.execute(sa.text("""
        UPDATE notes SET program_id = notes.context_id
        FROM programs
        WHERE notes.context_type = 'program' AND programs.id = notes.context_id
    """))

    op.create_check_constraint('ck_notes_context_type', 'notes', f'context_type IN ({QUOTED})')
    op.create_check_constraint(
        'ck_notes_program_date_shape', 'notes',
        "context_type <> 'program_date' OR (program_id IS NOT NULL AND calendar_date IS NOT NULL)",
    )
    op.create_check_constraint(
        'ck_notes_carry_forward_shape', 'notes',
        'carry_forward_at IS NOT NULL OR carried_into_instance_id IS NULL',
    )
    op.create_check_constraint(
        'ck_notes_review_data', 'notes', "review_data IS NULL OR note_kind = 'goal_review'",
    )

    op.create_index('ix_notes_program_id', 'notes', ['program_id'])
    op.create_index('ix_notes_carried_into_instance_id', 'notes', ['carried_into_instance_id'])
    op.create_index(
        'ix_notes_program_calendar_date', 'notes', ['program_id', 'calendar_date'],
        postgresql_where=sa.text('deleted_at IS NULL AND calendar_date IS NOT NULL'),
    )
    op.create_index(
        'ix_notes_pending_carry', 'notes', ['root_id', 'activity_definition_id'],
        postgresql_where=sa.text(
            'carry_forward_at IS NOT NULL AND carried_into_instance_id IS NULL AND deleted_at IS NULL'
        ),
    )


def downgrade():
    blocked = op.get_bind().execute(sa.text(
        "SELECT count(*) FROM notes WHERE context_type = 'program_date'"
    )).scalar()
    if blocked:
        raise RuntimeError(
            f'{blocked} program calendar-date note(s) exist; the previous schema cannot hold them. '
            'Export or delete them before downgrading.'
        )
    for name in ('ix_notes_pending_carry', 'ix_notes_program_calendar_date', 'ix_notes_carried_into_instance_id',
                 'ix_notes_program_id'):
        op.drop_index(name, table_name='notes')
    for name in ('ck_notes_review_data', 'ck_notes_carry_forward_shape', 'ck_notes_program_date_shape',
                 'ck_notes_context_type'):
        op.drop_constraint(name, 'notes', type_='check')
    for name in ('fk_notes_carried_into_instance_id', 'fk_notes_program_id'):
        op.drop_constraint(name, 'notes', type_='foreignkey')
    for column in ('review_data', 'carried_into_instance_id', 'carry_forward_at', 'calendar_date', 'program_id'):
        op.drop_column('notes', column)
