from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_

from models import ActivityInstance, ActivitySet, Session, SessionWorkInterval


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class WorkIntervalConflict(Exception):
    def __init__(self, interval):
        self.interval = interval
        super().__init__("Another session item is already accruing work time")


class WorkIntervalService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_open(self, session_id):
        return self.db_session.query(SessionWorkInterval).filter(
            SessionWorkInterval.session_id == session_id,
            SessionWorkInterval.ended_at.is_(None),
        ).first()

    def _lock_session(self, session_id):
        return self.db_session.query(Session).filter(Session.id == session_id).with_for_update().first()

    @staticmethod
    def describe(interval):
        if not interval:
            return None
        instance = getattr(interval, "activity_instance", None)
        definition = getattr(instance, "definition", None) if instance else None
        return {
            "interval_id": interval.id,
            "activity_instance_id": interval.activity_instance_id,
            "activity_set_id": interval.activity_set_id,
            "activity_name": getattr(definition, "name", None),
            "started_at": interval.started_at.isoformat() if interval.started_at else None,
        }

    def start(
        self,
        *,
        root_id,
        session_id,
        activity_instance_id,
        activity_set_id=None,
        started_at=None,
        switch=False,
    ):
        if not self._lock_session(session_id):
            raise ValueError("Session not found")
        open_interval = self.get_open(session_id)
        same_subject = open_interval and (
            open_interval.activity_instance_id == activity_instance_id
            and open_interval.activity_set_id == activity_set_id
        )
        if same_subject:
            return open_interval, False
        if open_interval and not switch:
            raise WorkIntervalConflict(open_interval)
        now = started_at or utc_now_naive()
        if open_interval:
            interrupted_set_id = open_interval.activity_set_id
            self.close(open_interval, ended_at=now)
            if interrupted_set_id:
                interrupted_set = self.db_session.get(ActivitySet, interrupted_set_id)
                if interrupted_set and interrupted_set.status == "active":
                    interrupted_set.status = "planned"
        interval = SessionWorkInterval(
            root_id=root_id,
            session_id=session_id,
            activity_instance_id=activity_instance_id,
            activity_set_id=activity_set_id,
            started_at=now,
        )
        self.db_session.add(interval)
        self.db_session.flush()
        return interval, True

    def close(self, interval, *, ended_at=None):
        if not interval or interval.ended_at is not None:
            return interval
        end = ended_at or utc_now_naive()
        if end < interval.started_at:
            raise ValueError("Work interval end cannot precede its start")
        interval.ended_at = end
        interval.duration_seconds = max(0, int((end - interval.started_at).total_seconds()))
        self.db_session.flush()
        self.recompute_subjects(interval)
        return interval

    def close_open(self, session_id, *, ended_at=None):
        self._lock_session(session_id)
        return self.close(self.get_open(session_id), ended_at=ended_at)

    def recompute_subjects(self, interval):
        instance_total = self.db_session.query(
            func.coalesce(func.sum(SessionWorkInterval.duration_seconds), 0)
        ).filter(
            SessionWorkInterval.activity_instance_id == interval.activity_instance_id,
            SessionWorkInterval.ended_at.is_not(None),
        ).scalar() or 0
        instance = self.db_session.get(ActivityInstance, interval.activity_instance_id)
        if instance:
            instance.duration_seconds = int(instance_total)
            boundaries = self.db_session.query(
                func.min(SessionWorkInterval.started_at),
                func.max(SessionWorkInterval.ended_at),
            ).filter(
                SessionWorkInterval.activity_instance_id == interval.activity_instance_id,
                SessionWorkInterval.ended_at.is_not(None),
            ).one()
            instance.time_start = boundaries[0]
            instance.time_stop = boundaries[1]

        if interval.activity_set_id:
            set_total = self.db_session.query(
                func.coalesce(func.sum(SessionWorkInterval.duration_seconds), 0)
            ).filter(
                SessionWorkInterval.activity_set_id == interval.activity_set_id,
                SessionWorkInterval.ended_at.is_not(None),
            ).scalar() or 0
            activity_set = self.db_session.get(ActivitySet, interval.activity_set_id)
            if activity_set:
                activity_set.duration_seconds = int(set_total)

    def replace_ordinary_intervals(self, instance, boundaries):
        existing = list(self.db_session.query(SessionWorkInterval).filter(
            SessionWorkInterval.activity_instance_id == instance.id,
        ).all())
        normalized = sorted(boundaries, key=lambda pair: pair[0])
        previous_end = None
        existing_ids = [interval.id for interval in existing]
        for start, end in normalized:
            if not start or not end or end < start:
                raise ValueError("Each corrected interval requires an end at or after its start")
            if previous_end and start < previous_end:
                raise ValueError("Work intervals cannot overlap")
            overlap = self.db_session.query(SessionWorkInterval.id).filter(
                SessionWorkInterval.session_id == instance.session_id,
                SessionWorkInterval.id.notin_(existing_ids) if existing_ids else True,
                SessionWorkInterval.started_at < end,
                or_(SessionWorkInterval.ended_at.is_(None), SessionWorkInterval.ended_at > start),
            ).first()
            if overlap:
                raise ValueError("Corrected work intervals overlap another session item")
            previous_end = end
        for interval in existing:
            self.db_session.delete(interval)
        self.db_session.flush()
        created = []
        for start, end in normalized:
            interval = SessionWorkInterval(
                root_id=instance.root_id,
                session_id=instance.session_id,
                activity_instance_id=instance.id,
                started_at=start,
                ended_at=end,
                duration_seconds=max(0, int((end - start).total_seconds())),
            )
            self.db_session.add(interval)
            created.append(interval)
        self.db_session.flush()
        if created:
            self.recompute_subjects(created[0])
        else:
            instance.time_start = None
            instance.time_stop = None
            instance.duration_seconds = None
        return created
