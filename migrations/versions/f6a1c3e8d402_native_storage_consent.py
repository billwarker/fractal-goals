"""Storage consent begun in a native app.

Additive: one column with a constant default on a table of ten-minute rows.
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a1c3e8d402'
down_revision = 'e5d9b2a7f3c8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('storage_authorizations', sa.Column('native', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('storage_authorizations', 'native')
