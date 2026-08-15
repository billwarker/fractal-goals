import uuid

import sqlalchemy as sa
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .base import Base, JSON_TYPE, utc_now


class CircuitDefinition(Base):
    __tablename__ = "circuit_definitions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(String, ForeignKey("activity_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="", server_default="")
    version = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now, server_default=sa.func.now())
    deleted_at = Column(DateTime, nullable=True)

    slots = relationship(
        "CircuitSlot",
        back_populates="definition",
        cascade="all, delete-orphan",
        order_by="CircuitSlot.sort_order",
    )
    group = relationship("ActivityGroup", backref="circuits")

    __table_args__ = (
        CheckConstraint("version > 0", name="ck_circuit_definitions_version_positive"),
        Index("ix_circuit_definitions_root_deleted", "root_id", "deleted_at"),
    )


class CircuitSlot(Base):
    __tablename__ = "circuit_slots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    circuit_definition_id = Column(
        String,
        ForeignKey("circuit_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_definition_id = Column(
        String,
        ForeignKey("activity_definitions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sort_order = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now, server_default=sa.func.now())

    definition = relationship("CircuitDefinition", back_populates="slots")
    activity_definition = relationship("ActivityDefinition")

    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="ck_circuit_slots_sort_order_nonnegative"),
        UniqueConstraint("circuit_definition_id", "sort_order", name="uq_circuit_slots_definition_order"),
    )


class CircuitRun(Base):
    __tablename__ = "circuit_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    circuit_definition_id = Column(
        String,
        ForeignKey("circuit_definitions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_version = Column(Integer, nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="", server_default="")
    status = Column(String(16), nullable=False, default="planned", server_default="planned")
    time_start = Column(DateTime, nullable=True)
    time_stop = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    is_paused = Column(Boolean, nullable=False, default=False, server_default=sa.text("false"))
    last_paused_at = Column(DateTime, nullable=True)
    total_paused_seconds = Column(Integer, nullable=False, default=0, server_default=sa.text("0"))
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now, server_default=sa.func.now())
    completed_at = Column(DateTime, nullable=True)

    definition = relationship("CircuitDefinition")
    session = relationship("Session", back_populates="circuit_runs")
    slots = relationship(
        "CircuitRunSlot",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="CircuitRunSlot.sort_order",
    )
    rounds = relationship(
        "CircuitRound",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="CircuitRound.round_number",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('planned', 'active', 'paused', 'completed')",
            name="ck_circuit_runs_status",
        ),
        CheckConstraint("duration_seconds IS NULL OR duration_seconds >= 0", name="ck_circuit_runs_duration"),
        CheckConstraint("total_paused_seconds >= 0", name="ck_circuit_runs_paused_duration"),
        CheckConstraint(
            "time_stop IS NULL OR (time_start IS NOT NULL AND time_stop >= time_start)",
            name="ck_circuit_runs_time_order",
        ),
        CheckConstraint(
            "(status = 'planned' AND time_start IS NULL AND time_stop IS NULL "
            "AND duration_seconds IS NULL AND is_paused = false "
            "AND last_paused_at IS NULL AND completed_at IS NULL) OR "
            "(status = 'active' AND time_start IS NOT NULL AND time_stop IS NULL "
            "AND duration_seconds IS NULL AND is_paused = false "
            "AND last_paused_at IS NULL AND completed_at IS NULL) OR "
            "(status = 'paused' AND time_start IS NOT NULL AND time_stop IS NULL "
            "AND duration_seconds IS NULL AND is_paused = true "
            "AND last_paused_at IS NOT NULL AND completed_at IS NULL) OR "
            "(status = 'completed' AND time_start IS NOT NULL AND time_stop IS NOT NULL "
            "AND duration_seconds IS NOT NULL AND is_paused = false "
            "AND last_paused_at IS NULL AND completed_at IS NOT NULL)",
            name="ck_circuit_runs_lifecycle_timing",
        ),
        Index("ix_circuit_runs_session_status", "session_id", "status"),
    )


class CircuitRunSlot(Base):
    __tablename__ = "circuit_run_slots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    circuit_run_id = Column(String, ForeignKey("circuit_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    source_slot_id = Column(String, ForeignKey("circuit_slots.id", ondelete="SET NULL"), nullable=True)
    activity_definition_id = Column(
        String,
        ForeignKey("activity_definitions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    activity_instance_id = Column(
        String,
        ForeignKey("activity_instances.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    sort_order = Column(Integer, nullable=False)
    activity_name = Column(String, nullable=False)
    has_sets = Column(Boolean, nullable=False)
    has_metrics = Column(Boolean, nullable=False)
    activity_schema = Column(JSON_TYPE, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())

    run = relationship("CircuitRun", back_populates="slots")
    activity_definition = relationship("ActivityDefinition")
    activity_instance = relationship("ActivityInstance", foreign_keys=[activity_instance_id])
    members = relationship("CircuitRoundMember", back_populates="run_slot", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="ck_circuit_run_slots_sort_order_nonnegative"),
        UniqueConstraint("circuit_run_id", "sort_order", name="uq_circuit_run_slots_run_order"),
    )


class CircuitRound(Base):
    __tablename__ = "circuit_rounds"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    circuit_run_id = Column(String, ForeignKey("circuit_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now, server_default=sa.func.now())

    run = relationship("CircuitRun", back_populates="rounds")
    members = relationship(
        "CircuitRoundMember",
        back_populates="round",
        cascade="all, delete-orphan",
        order_by="CircuitRoundMember.sort_order",
    )

    __table_args__ = (
        CheckConstraint("round_number > 0", name="ck_circuit_rounds_number_positive"),
        UniqueConstraint("circuit_run_id", "round_number", name="uq_circuit_rounds_run_number"),
    )


class CircuitRoundMember(Base):
    __tablename__ = "circuit_round_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    circuit_round_id = Column(String, ForeignKey("circuit_rounds.id", ondelete="CASCADE"), nullable=False, index=True)
    circuit_run_slot_id = Column(
        String,
        ForeignKey("circuit_run_slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_instance_id = Column(
        String,
        ForeignKey("activity_instances.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
    )
    activity_set_id = Column(String, ForeignKey("activity_sets.id", ondelete="CASCADE"), nullable=True, unique=True)
    sort_order = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now, server_default=sa.func.now())

    round = relationship("CircuitRound", back_populates="members")
    run_slot = relationship("CircuitRunSlot", back_populates="members")
    activity_instance = relationship("ActivityInstance", foreign_keys=[activity_instance_id])
    activity_set = relationship("ActivitySet", back_populates="circuit_member", foreign_keys=[activity_set_id])

    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="ck_circuit_round_members_sort_order_nonnegative"),
        CheckConstraint(
            "(activity_instance_id IS NULL) <> (activity_set_id IS NULL)",
            name="ck_circuit_round_members_single_result",
        ),
        UniqueConstraint("circuit_round_id", "sort_order", name="uq_circuit_round_members_round_order"),
        UniqueConstraint("circuit_round_id", "circuit_run_slot_id", name="uq_circuit_round_members_round_slot"),
    )


class SessionWorkInterval(Base):
    __tablename__ = "session_work_intervals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    activity_instance_id = Column(
        String,
        ForeignKey("activity_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_set_id = Column(String, ForeignKey("activity_sets.id", ondelete="CASCADE"), nullable=True, index=True)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.func.now())
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now, server_default=sa.func.now())

    session = relationship("Session", back_populates="work_intervals")
    activity_instance = relationship("ActivityInstance", back_populates="work_intervals")
    activity_set = relationship("ActivitySet", back_populates="work_intervals")

    __table_args__ = (
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ck_work_intervals_time_order"),
        CheckConstraint("duration_seconds IS NULL OR duration_seconds >= 0", name="ck_work_intervals_duration"),
        Index(
            "uq_session_work_intervals_one_open",
            "session_id",
            unique=True,
            postgresql_where=sa.text("ended_at IS NULL"),
            sqlite_where=sa.text("ended_at IS NULL"),
        ),
        Index("ix_session_work_intervals_session_started", "session_id", "started_at"),
    )
