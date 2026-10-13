"""Add idempotency records for replay-safe offline session writes."""
from alembic import op
import sqlalchemy as sa

revision = 'b7d9f1a3c5e7'
down_revision = 'a4c6e8f0b2d4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'idempotency_records',
        sa.Column('user_id', sa.String(), primary_key=True),
        sa.Column('key', sa.String(length=255), primary_key=True),
        sa.Column('method', sa.String(length=10), nullable=False),
        sa.Column('path', sa.String(length=1024), nullable=False),
        sa.Column('request_hash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='in_progress'),
        sa.Column('response_status', sa.Integer(), nullable=True),
        sa.Column('response_mimetype', sa.String(length=128), nullable=True),
        sa.Column('response_body', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_idempotency_records_created_at', 'idempotency_records', ['created_at'])


def downgrade():
    op.drop_index('ix_idempotency_records_created_at', table_name='idempotency_records')
    op.drop_table('idempotency_records')
