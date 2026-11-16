"""Goals remember when the "add a completion note" prompt was dismissed.

Goal Detail asks for a completion note on a completed goal that has none (a threshold or its
children may complete a goal with no chance to write one). Dismissing it stamps this; the prompt
returns only for a later completion (`completed_at` after the stamp).
"""
from alembic import op
import sqlalchemy as sa

revision = '67829adf72b4'
down_revision = 'aa1d1082d073'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('goals', sa.Column('completion_note_dismissed_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('goals', 'completion_note_dismissed_at')
