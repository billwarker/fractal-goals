"""Let a user choose which connected storage account receives new uploads."""
from alembic import op
import sqlalchemy as sa

revision = 'a6c8e0b2d4f7'
down_revision = 'f3a5c7e9b1d4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('storage_connections', sa.Column(
        'upload_default', sa.Boolean(), nullable=False, server_default=sa.false(),
    ))
    op.create_index(
        'uq_storage_connection_upload_default', 'storage_connections', ['user_id'],
        unique=True, postgresql_where=sa.text('upload_default'),
    )


def downgrade():
    op.drop_index('uq_storage_connection_upload_default', table_name='storage_connections')
    op.drop_column('storage_connections', 'upload_default')
