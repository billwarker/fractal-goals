"""Acquisition and engagement metrics (services/growth_metrics_service.py)."""
import datetime
import uuid

import pytest

from models import BetaSignupRequest, Goal, ProductEvent, Session, User, WebEvent
from services.analytics_export_service import flush_exported
from services.app_settings import ANALYTICS_EXPORT_STATE_KEY, set_app_setting
from services.growth_metrics_service import GrowthMetricsService

UTC = datetime.timezone.utc
# A Wednesday, so its ISO week runs Monday 2026-11-16 to Sunday 2026-11-22.
NOW = datetime.datetime(2026, 11, 18, 12, 0, tzinfo=UTC)
WINDOW_START = datetime.datetime(2026, 11, 1, tzinfo=UTC)
WINDOW_END = datetime.datetime(2026, 11, 19, tzinfo=UTC)


def _user(db_session, name, *, role='user', created_at=None):
    user = User(
        id=str(uuid.uuid4()), username=name, email=f'{name}@example.com', role=role,
        created_at=created_at or datetime.datetime(2026, 10, 1, tzinfo=UTC),
    )
    user.set_password('Password123')
    db_session.add(user)
    db_session.flush()
    return user


def _root(db_session, owner):
    goal = Goal(id=str(uuid.uuid4()), name='Root', owner_id=owner.id)
    goal.root_id = goal.id
    db_session.add(goal)
    db_session.flush()
    return goal


def _completed_session(db_session, owner, completed_at, *, deleted=False):
    root = db_session.query(Goal).filter_by(owner_id=owner.id).first() or _root(db_session, owner)
    db_session.add(Session(
        owner_id=owner.id, root_id=root.id, name='Practice', completed=True, completed_at=completed_at,
        deleted_at=completed_at if deleted else None,
    ))
    db_session.flush()


def _web(db_session, name, visitor, at, **fields):
    db_session.add(WebEvent(
        event_name=name, schema_version=1, visitor_day_hash=visitor * 64, created_at=at, **fields,
    ))


def _summary(db_session):
    return GrowthMetricsService(db_session).summary(
        WINDOW_START, WINDOW_END, WINDOW_START.date(), (WINDOW_END - datetime.timedelta(days=1)).date(), NOW,
    )


@pytest.mark.integration
class TestWeeklyActivePractitioners:
    def test_counts_distinct_completers_per_iso_week(self, db_session):
        ana = _user(db_session, 'ana')
        ben = _user(db_session, 'ben')
        _completed_session(db_session, ana, datetime.datetime(2026, 11, 16, 0, 0))  # Monday 00:00: this week
        _completed_session(db_session, ana, datetime.datetime(2026, 11, 17, 9, 0))  # same person, once
        _completed_session(db_session, ben, datetime.datetime(2026, 11, 15, 23, 59))  # Sunday: last week
        db_session.commit()

        wap = _summary(db_session)['wap']

        assert wap['current'] == {'week_start': '2026-11-16', 'count': 1, 'accounts': 2}
        assert wap['previous']['week_start'] == '2026-11-09'
        assert wap['previous']['count'] == 1
        assert len(wap['weeks']) == 8
        assert wap['weeks'][0]['week_start'] == '2026-09-28'

    def test_flushing_exported_events_leaves_the_weekly_history_alone(self, db_session):
        """WAP reads completed sessions, so clearing analytics out of Postgres can't change it."""
        ana = _user(db_session, 'ana')
        six_weeks_ago = NOW - datetime.timedelta(weeks=6)
        _completed_session(db_session, ana, six_weeks_ago)
        db_session.add(ProductEvent(id='old-view', user_id=ana.id, event_name='page_view', created_at=six_weeks_ago))
        db_session.commit()
        before = _summary(db_session)['wap']
        set_app_setting(db_session, ANALYTICS_EXPORT_STATE_KEY, {'tables': {'product_events': {
            'last_ts': six_weeks_ago.isoformat(), 'last_id': 'old-view',
        }}})

        assert flush_exported(db_session, now=NOW)['product_events'] == 1
        assert _summary(db_session)['wap'] == before

    def test_excludes_demo_admin_deleted_and_unfinished_sessions(self, db_session):
        demo = _user(db_session, 'demo', role='demo')
        admin = _user(db_session, 'admin', role='admin')
        cara = _user(db_session, 'cara')
        moment = datetime.datetime(2026, 11, 17, 9, 0)
        _completed_session(db_session, demo, moment)
        _completed_session(db_session, admin, moment)
        _completed_session(db_session, cara, moment, deleted=True)
        root = _root(db_session, _user(db_session, 'dan'))
        db_session.add(Session(owner_id=root.owner_id, root_id=root.id, name='Open', completed=False))
        db_session.commit()

        current = _summary(db_session)['wap']['current']

        assert current['count'] == 0
        assert current['accounts'] == 2

    def test_accounts_created_after_the_week_are_not_counted(self, db_session):
        _user(db_session, 'early', created_at=datetime.datetime(2026, 11, 1, tzinfo=UTC))
        _user(db_session, 'late', created_at=datetime.datetime(2026, 11, 23, tzinfo=UTC))
        db_session.commit()

        assert _summary(db_session)['wap']['current']['accounts'] == 1


@pytest.mark.integration
class TestFunnelAndTraffic:
    def test_visitors_are_counted_per_day_and_by_source(self, db_session):
        day_one = datetime.datetime(2026, 11, 10, 9, 0)
        day_two = datetime.datetime(2026, 11, 11, 9, 0)
        _web(db_session, 'landing_view', 'a', day_one, referrer_host='news.example.com', utm_source='newsletter')
        _web(db_session, 'demo_started', 'a', day_one, properties={'from_tour': True})
        _web(db_session, 'landing_view', 'b', day_one)
        _web(db_session, 'landing_view', 'c', day_two, referrer_host='news.example.com')
        _web(db_session, 'landing_view', 'd', datetime.datetime(2026, 10, 30, 9, 0))  # before the window
        db_session.commit()

        summary = _summary(db_session)
        traffic = summary['traffic']

        assert traffic['visitor_days'] == 3
        assert traffic['landing_views'] == 3
        assert traffic['demo_starts'] == 1
        by_day = {day['date']: day['count'] for day in traffic['visitors_by_day']}
        assert (by_day['2026-11-10'], by_day['2026-11-11'], by_day['2026-11-12']) == (2, 1, 0)
        assert len(traffic['visitors_by_day']) == 18
        assert traffic['top_referrers'] == [{'name': 'news.example.com', 'visitors': 2}]
        assert traffic['top_campaigns'] == [{'name': 'newsletter', 'visitors': 1}]
        funnel = {step['key']: step['count'] for step in summary['funnel']}
        assert (funnel['visitors'], funnel['demo']) == (3, 1)

    def test_visitors_per_day_start_at_the_oldest_day_postgres_holds(self, db_session):
        _web(db_session, 'landing_view', 'a', datetime.datetime(2026, 11, 10, 9, 0))
        db_session.commit()

        days = [day['date'] for day in _summary(db_session)['traffic']['visitors_by_day']]

        assert days[0] == '2026-11-10'
        assert days[-1] == '2026-11-18'

    def test_conversion_steps_after_the_waitlist(self, db_session):
        db_session.add_all([
            BetaSignupRequest(email='w1@example.com', created_at=datetime.datetime(2026, 11, 5)),
            BetaSignupRequest(email='w2@example.com', created_at=datetime.datetime(2026, 11, 6),
                              invited_at=datetime.datetime(2026, 11, 7)),
            BetaSignupRequest(email='old@example.com', created_at=datetime.datetime(2026, 10, 1)),
        ])
        signed_up = datetime.datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
        active = _user(db_session, 'active', created_at=signed_up)
        slow = _user(db_session, 'slow', created_at=signed_up)
        _user(db_session, 'idle', created_at=signed_up)
        _user(db_session, 'demo', role='demo', created_at=signed_up)
        _completed_session(db_session, active, datetime.datetime(2026, 11, 15, 11, 59))  # 6d 23h 59m: in time
        _completed_session(db_session, slow, datetime.datetime(2026, 11, 15, 12, 0))  # exactly 7 days: too late
        db_session.commit()

        funnel = {step['key']: step['count'] for step in _summary(db_session)['funnel']}

        assert funnel['waitlist'] == 2
        assert funnel['invited'] == 1
        assert funnel['signed_up'] == 3
        assert funnel['first_fractal'] == 2
        assert funnel['activated'] == 1


    def test_steps_say_which_are_counted_alone_and_which_follow_the_cohort(self, db_session):
        stages = [(step['key'], step['stage']) for step in _summary(db_session)['funnel']]

        assert stages == [
            ('visitors', 'public'), ('demo', 'public'), ('waitlist', 'public'), ('invited', 'public'),
            ('signed_up', 'cohort'), ('first_fractal', 'cohort'), ('activated', 'cohort'),
        ]

    def test_a_deleted_fractal_is_not_a_first_fractal(self, db_session):
        owner = _user(db_session, 'quitter', created_at=datetime.datetime(2026, 11, 8, tzinfo=UTC))
        root = _root(db_session, owner)
        root.deleted_at = datetime.datetime(2026, 11, 9)
        db_session.commit()

        funnel = {step['key']: step['count'] for step in _summary(db_session)['funnel']}

        assert funnel['signed_up'] == 1
        assert funnel['first_fractal'] == 0


@pytest.mark.integration
class TestFeatureAdoption:
    def test_share_of_practitioners_by_surface(self, db_session):
        ana = _user(db_session, 'ana')
        ben = _user(db_session, 'ben')
        idle = _user(db_session, 'idle')
        recent = datetime.datetime(2026, 11, 17, 9, 0)
        _completed_session(db_session, ana, recent)
        _completed_session(db_session, ben, recent)
        for user, path in (
            (ana, '/:rootId/programs/:id'), (ana, '/:rootId/session/:id'), (ben, '/:rootId/sessions'),
            (idle, '/:rootId/notes'), (ana, '/'),
        ):
            db_session.add(ProductEvent(user_id=user.id, event_name='page_view', path=path, created_at=recent))
        db_session.add(ProductEvent(
            user_id=ben.id, event_name='page_view', path='/:rootId/analytics',
            created_at=datetime.datetime(2026, 11, 1),
        ))
        db_session.commit()

        adoption = _summary(db_session)['feature_adoption']

        assert adoption['practitioners'] == 2
        assert adoption['features'] == [
            {'feature': 'Sessions', 'users': 2, 'share': 1.0},
            {'feature': 'Programs', 'users': 1, 'share': 0.5},
        ]

    def test_no_practitioners_means_no_shares(self, db_session):
        assert _summary(db_session)['feature_adoption'] == {'practitioners': 0, 'days': 7, 'features': []}
