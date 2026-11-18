"""Product analytics: event context, anonymous public-site events, erasure queue, attribution.

Additive. ``product_events`` gains nullable context columns (existing rows keep NULL);
``web_events`` and ``analytics_erasures`` are new and empty; ``users.acquisition_source``
is nullable, so accounts that signed up before it simply have no recorded source. No data
is rewritten, and every statement takes only brief metadata locks.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = 'b8d2f4a6c0e1'
down_revision = '21c3aad52e2e'
branch_labels = None
depends_on = None

PRODUCT_EVENT_COLUMNS = (
    ('schema_version', sa.SmallInteger()),
    ('visit_id', sa.String(length=36)),
    ('surface', sa.String(length=16)),
    ('app_version', sa.String(length=40)),
)


def upgrade():
    for name, column_type in PRODUCT_EVENT_COLUMNS:
        op.add_column('product_events', sa.Column(name, column_type, nullable=True))

    op.create_table(
        'web_events',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('event_name', sa.String(length=80), nullable=False),
        sa.Column('schema_version', sa.SmallInteger(), nullable=False),
        sa.Column('path', sa.String(length=255), nullable=True),
        sa.Column('properties', JSONB(), nullable=True),
        sa.Column('visitor_day_hash', sa.String(length=64), nullable=False),
        sa.Column('referrer_host', sa.String(length=255), nullable=True),
        sa.Column('utm_source', sa.String(length=80), nullable=True),
        sa.Column('utm_medium', sa.String(length=80), nullable=True),
        sa.Column('utm_campaign', sa.String(length=80), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_web_events_event_name_created_at', 'web_events', ['event_name', 'created_at'])
    op.create_index('ix_web_events_created_at_id', 'web_events', ['created_at', 'id'])

    op.create_table(
        'analytics_erasures',
        sa.Column('user_id', sa.String(), primary_key=True),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
    )

    op.add_column('users', sa.Column('acquisition_source', sa.String(length=80), nullable=True))


def downgrade():
    op.drop_column('users', 'acquisition_source')
    op.drop_table('analytics_erasures')
    op.drop_index('ix_web_events_created_at_id', table_name='web_events')
    op.drop_index('ix_web_events_event_name_created_at', table_name='web_events')
    op.drop_table('web_events')
    for name, _ in reversed(PRODUCT_EVENT_COLUMNS):
        op.drop_column('product_events', name)
