"""Give storage connections an explicit lifecycle status and connection timestamps."""
from alembic import op
import sqlalchemy as sa

revision = 'f3a5c7e9b1d4'
down_revision = 'e2f4a6c8d0b3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('storage_connections', sa.Column('status', sa.String(length=24), nullable=True))
    op.add_column('storage_connections', sa.Column('scopes', sa.Text(), nullable=True))
    op.add_column('storage_connections', sa.Column('connected_at', sa.DateTime(), nullable=True))
    op.add_column('storage_connections', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.execute("""
        UPDATE storage_connections
        SET status = CASE WHEN credentials IS NULL THEN 'disconnected' ELSE 'active' END,
            connected_at = created_at,
            updated_at = created_at
    """)
    op.alter_column('storage_connections', 'status', nullable=False)
    op.alter_column('storage_connections', 'connected_at', nullable=False)
    op.alter_column('storage_connections', 'updated_at', nullable=False)
    op.create_check_constraint(
        'ck_storage_connection_status', 'storage_connections',
        "status IN ('active', 'reconnect_required', 'disconnected')",
    )
    # Credentials exist exactly while a connection is usable.
    op.create_check_constraint(
        'ck_storage_connection_credentials', 'storage_connections',
        "(status = 'active') = (credentials IS NOT NULL)",
    )


def downgrade():
    op.drop_constraint('ck_storage_connection_credentials', 'storage_connections', type_='check')
    op.drop_constraint('ck_storage_connection_status', 'storage_connections', type_='check')
    op.drop_column('storage_connections', 'updated_at')
    op.drop_column('storage_connections', 'connected_at')
    op.drop_column('storage_connections', 'scopes')
    op.drop_column('storage_connections', 'status')
