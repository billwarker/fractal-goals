"""merge_heads

Revision ID: 2402e697b10b
Revises: 2f1a9d3c7b10, c1f4c9d0a123
Create Date: 2026-02-18 15:13:10.683662

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2402e697b10b'
down_revision: Union[str, Sequence[str], None] = ('2f1a9d3c7b10', 'c1f4c9d0a123')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
