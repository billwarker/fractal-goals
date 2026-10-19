"""Bounded evidence identity pages and database-aggregated calendar days."""
from sqlalchemy import Date, case, cast, func, select, tuple_, literal
from services.goal_evidence_query import timeline_evidence_query
from services.goal_timeline_page import timeline_page_options, timeline_pagination


class GoalEvidenceReadModel:
    def __init__(self, db, root_id, goal_ids, *, inherited_parent_id=None):
        self.db = db
        self.evidence = timeline_evidence_query(root_id, goal_ids, inherited_parent_id=inherited_parent_id)

    def query(self, start, end, *, exclusive_end=None):
        e = self.evidence
        query = select(e).where(e.c.timestamp >= start, e.c.timestamp <= end)
        if exclusive_end is not None:
            query = query.where(e.c.timestamp < exclusive_end)
        return query

    def page(self, start, end, metric, page_size, cursor, *, exclusive_end=None):
        size, boundary = timeline_page_options(metric, page_size, cursor)
        e = self.evidence
        query = self.query(start, end, exclusive_end=exclusive_end)
        if metric != 'events':
            query = query.where(e.c.event_type == 'activity.completed')
        if metric == 'duration':
            query = query.where(e.c.duration_seconds > 0)
        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        if boundary:
            query = query.where(tuple_(e.c.timestamp, e.c.id.collate('C')) < tuple_(literal(boundary[0]), literal(boundary[1])))
        rows = self.db.execute(query.order_by(e.c.timestamp.desc(), e.c.id.collate('C').desc()).limit(size + 1)).all()
        return timeline_pagination(rows, total, size)

    def days(self, start, end, zone):
        e = self.query(start, end).subquery('lifetime_evidence')
        day = cast(func.timezone(zone.key, func.timezone('UTC', e.c.timestamp)), Date)
        activity = e.c.event_type == 'activity.completed'
        return self.db.execute(select(
            day.label('date'), func.count().label('events'),
            func.sum(case((activity, 1), else_=0)).label('activities'),
            func.sum(case((activity, func.greatest(e.c.duration_seconds, 0)), else_=0)).label('duration_seconds'),
            func.sum(case((e.c.event_type == 'goal.completed', 1), else_=0)).label('milestones'),
        ).group_by(day).order_by(day)).all()
