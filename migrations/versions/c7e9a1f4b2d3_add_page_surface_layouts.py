"""add page_surface_layouts table

Revision ID: c7e9a1f4b2d3
Revises: a6f3d2c1b9e8
Create Date: 2026-06-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c7e9a1f4b2d3'
down_revision: Union[str, Sequence[str], None] = 'a6f3d2c1b9e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'page_surface_layouts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('page', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_default', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('desktop_config', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
        sa.Column('mobile_config', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['root_id'], ['goals.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_page_surface_layouts_root_id', 'page_surface_layouts', ['root_id'], unique=False)
    op.create_index('ix_page_surface_layouts_user_id', 'page_surface_layouts', ['user_id'], unique=False)
    op.create_index(
        'ix_page_surface_layouts_root_user_page_deleted',
        'page_surface_layouts',
        ['root_id', 'user_id', 'page', 'deleted_at'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_page_surface_layouts_root_user_page_deleted', table_name='page_surface_layouts')
    op.drop_index('ix_page_surface_layouts_user_id', table_name='page_surface_layouts')
    op.drop_index('ix_page_surface_layouts_root_id', table_name='page_surface_layouts')
    op.drop_table('page_surface_layouts')
