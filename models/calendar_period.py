from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Index, String, Text
import uuid

from .base import Base, utc_now


CALENDAR_PERIOD_KINDS = ('vacation', 'travel', 'illness', 'other')


class CalendarPeriod(Base):
    """A named, fractal-wide span of time off (vacation, travel, illness, ...).

    Streak-protecting periods turn scheduled program dates that would otherwise
    be missed or partial into rest; completed dates still count as met.
    """

    __tablename__ = 'calendar_periods'
    __table_args__ = (
        CheckConstraint(
            "kind IN ('vacation', 'travel', 'illness', 'other')",
            name='ck_calendar_period_kind',
        ),
        CheckConstraint('end_date >= start_date', name='ck_calendar_period_date_order'),
        Index('ix_calendar_periods_root_dates', 'root_id', 'start_date', 'end_date'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False)
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    kind = Column(String, nullable=False, default='vacation')
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    protects_streaks = Column(Boolean, nullable=False, default=True, server_default='true')
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)
    deleted_at = Column(DateTime, nullable=True)
