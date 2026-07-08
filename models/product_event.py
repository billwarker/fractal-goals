import uuid

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, String

from .base import Base, JSON_TYPE, utc_now


class ProductEvent(Base):
    """First-party product telemetry: page views and curated UI feature events.

    Distinct from EventLog (domain audit history, root-scoped): product events
    are user-scoped, name-allowlisted in the telemetry service, and exist only
    to answer "how are beta users using the app" questions in the admin usage
    dashboard. Paths are normalized before storage (root ids replaced) so
    aggregation stays low-cardinality.
    """
    __tablename__ = 'product_events'
    __table_args__ = (
        sa.Index('ix_product_events_user_created_at', 'user_id', 'created_at'),
        sa.Index('ix_product_events_event_name_created_at', 'event_name', 'created_at'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    event_name = Column(String(80), nullable=False)
    path = Column(String(255), nullable=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='SET NULL'), nullable=True)
    properties = Column(JSON_TYPE, nullable=True)
    client_ts = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False, index=True)
