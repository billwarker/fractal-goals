"""Add external storage and note attachments (additive; originals stay in the provider)."""
from alembic import op
import sqlalchemy as sa

revision = 'e2f4a6c8d0b3'
down_revision = 'd1f3a5c7e9b2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('storage_connections',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('account_id', sa.String(length=255), nullable=False),
        sa.Column('account_label', sa.String(length=255), nullable=False),
        sa.Column('credentials', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("provider IN ('google_drive', 'dropbox')", name='ck_storage_provider'),
        sa.UniqueConstraint('user_id', 'provider', name='uq_storage_connection_provider'),
    )
    op.create_index('ix_storage_connections_user_id', 'storage_connections', ['user_id'])
    op.create_table('storage_authorizations',
        sa.Column('state_hash', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('verifier', sa.Text(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_storage_authorizations_user_id', 'storage_authorizations', ['user_id'])
    op.create_table('media_assets',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('connection_id', sa.String(), sa.ForeignKey('storage_connections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_id', sa.String(length=255), nullable=False),
        sa.Column('resource_key', sa.String(length=255), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('revision', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint('size_bytes > 0', name='ck_media_positive_size'),
        sa.UniqueConstraint('root_id', 'connection_id', 'file_id', name='uq_media_provider_file'),
    )
    op.create_index('ix_media_assets_connection_id', 'media_assets', ['connection_id'])
    op.create_index('ix_media_assets_root_id', 'media_assets', ['root_id'])
    op.create_table('note_attachments',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('note_id', sa.String(), sa.ForeignKey('notes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(), sa.ForeignKey('media_assets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('alt_text', sa.String(length=500), nullable=False),
        sa.UniqueConstraint('note_id', 'asset_id', name='uq_note_asset'),
        sa.UniqueConstraint('note_id', 'position', name='uq_note_attachment_position'),
    )
    op.create_index('ix_note_attachments_asset_id', 'note_attachments', ['asset_id'])
    op.create_index('ix_note_attachments_note_id', 'note_attachments', ['note_id'])
    op.create_table('storage_uploads',
        sa.Column('id', sa.String(), primary_key=True, nullable=False),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('connection_id', sa.String(), sa.ForeignKey('storage_connections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider_session', sa.Text(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('offset', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.String(), sa.ForeignKey('media_assets.id', ondelete='SET NULL'), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_storage_uploads_connection_id', 'storage_uploads', ['connection_id'])
    op.create_index('ix_storage_uploads_root_id', 'storage_uploads', ['root_id'])


def downgrade():
    op.drop_table('storage_uploads')
    op.drop_table('note_attachments')
    op.drop_table('media_assets')
    op.drop_table('storage_authorizations')
    op.drop_table('storage_connections')
