import sqlalchemy as sa
from sqlalchemy import Column, DateTime, Integer, String, Text

from .base import Base, utc_now


class IdempotencyRecord(Base):
    """One claimed ``Idempotency-Key`` per user; stores the first successful response.

    Short-lived (14 days, pruned per user on their next keyed write), so ``user_id`` is a
    plain key column rather than a foreign key.
    """

    __tablename__ = 'idempotency_records'

    user_id = Column(String, primary_key=True)
    key = Column(String(255), primary_key=True)
    method = Column(String(10), nullable=False)
    path = Column(String(1024), nullable=False)
    request_hash = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False, default='in_progress')
    response_status = Column(Integer, nullable=True)
    response_mimetype = Column(String(128), nullable=True)
    response_body = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    __table_args__ = (
        sa.Index('ix_idempotency_records_created_at', 'created_at'),
    )
