import uuid

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, SmallInteger, String

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
    # Context sent once per batch (services/tracking_plan.json owns the event shapes).
    schema_version = Column(SmallInteger, nullable=True)
    visit_id = Column(String(36), nullable=True)
    surface = Column(String(16), nullable=True)
    app_version = Column(String(40), nullable=True)


class WebEvent(Base):
    """Anonymous public-site events: the landing page, the live demo and the waitlist.

    There is no user, IP address, user agent or device identifier. ``visitor_day_hash``
    hashes the request's IP and user agent with a salt that is replaced, and the old one
    discarded, every UTC day (services/web_telemetry_service.py), so it counts unique
    visitors within a day and cannot link visits across days or to an account.
    """
    __tablename__ = 'web_events'
    __table_args__ = (
        sa.Index('ix_web_events_event_name_created_at', 'event_name', 'created_at'),
        sa.Index('ix_web_events_created_at_id', 'created_at', 'id'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_name = Column(String(80), nullable=False)
    schema_version = Column(SmallInteger, nullable=False)
    path = Column(String(255), nullable=True)
    properties = Column(JSON_TYPE, nullable=True)
    visitor_day_hash = Column(String(64), nullable=False)
    referrer_host = Column(String(255), nullable=True)
    utm_source = Column(String(80), nullable=True)
    utm_medium = Column(String(80), nullable=True)
    utm_campaign = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class AnalyticsErasure(Base):
    """An erased account whose rows the next export deletes from the analytics warehouse.

    Holds only the id: the account row is already gone when this is written. The export
    removes the id's warehouse rows, then this row.
    """
    __tablename__ = 'analytics_erasures'

    user_id = Column(String, primary_key=True)
    requested_at = Column(DateTime, default=utc_now, nullable=False)
