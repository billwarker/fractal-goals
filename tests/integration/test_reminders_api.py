from datetime import datetime, timedelta, timezone
import uuid

import pytest

from models import Goal, GoalLevel, Program, ProgramDay, Session, User, utc_now
from services.reminder_service import ReminderService
from tests.conftest import session_headers_for


def _id():
    return str(uuid.uuid4())


@pytest.fixture
def root(db_session, test_user):
    level = GoalLevel(id=_id(), name='Ultimate Goal', rank=0, owner_id=test_user.id, uses_reviews=True,
                      review_cadence_value=1, review_cadence_unit='months')
    root = Goal(id=_id(), name='Guitar', owner_id=test_user.id, level=level,
                started_at=(utc_now() - timedelta(days=60)).replace(tzinfo=None))
    root.root_id = root.id
    db_session.add_all([level, root])
    db_session.commit()
    return root


def _read(client, user, **query):
    response = client.get('/api/reminders/upcoming', query_string=query, headers=session_headers_for(user))
    return response.status_code, response.get_json()


def _of(body, kind):
    return [item for item in body['reminders'] if item['kind'] == kind]


def test_a_due_review_is_one_stable_reminder_until_it_is_written(client, db_session, test_user, root):
    _, body = _read(client, test_user)
    [first] = _of(body, 'goal_review')
    assert (first['entity_id'], first['title'], first['path']) == (root.id, 'Guitar', f'/{root.id}/goals?goal={root.id}')
    assert _of(_read(client, test_user)[1], 'goal_review') == [first]
    root.completed = True
    db_session.commit()
    assert _of(_read(client, test_user)[1], 'goal_review') == []


def test_todays_program_day_asks_until_it_is_done(client, db_session, test_user, root):
    today = datetime.now(timezone.utc).date()
    program = Program(id=_id(), root_id=root.id, name='Plan', weekly_schedule=[],
                      start_date=datetime.combine(today - timedelta(days=3), datetime.min.time()),
                      end_date=datetime.combine(today + timedelta(days=30), datetime.min.time()))
    day = ProgramDay(id=_id(), program_id=program.id, day_number=1, name='Scales',
                     day_of_week=[(today + timedelta(days=1)).strftime('%A')], repeat_every_weeks=1)
    db_session.add_all([program, day])
    db_session.commit()
    [item] = _of(_read(client, test_user)[1], 'program_day')
    assert (item['entity_id'], item['date'], item['program_id']) == (
        day.id, (today + timedelta(days=1)).isoformat(), program.id)
    response = client.patch(f'/api/{root.id}/programs/{program.id}/day-statuses', headers=session_headers_for(test_user),
                            json={'dates': [item['date']], 'status': 'rest', 'timezone': 'UTC'})
    assert response.status_code == 200, response.get_json()
    assert _of(_read(client, test_user)[1], 'program_day') == []


@pytest.mark.parametrize('hours,count', [(2, 0), (4, 1)])
def test_only_a_session_left_open_is_mentioned(client, db_session, test_user, root, hours, count):
    db_session.add(Session(id=_id(), root_id=root.id, owner_id=test_user.id, name='Practice',
                           session_start=(utc_now() - timedelta(hours=hours)).replace(tzinfo=None)))
    db_session.commit()
    assert len(_of(_read(client, test_user)[1], 'open_session')) == count


def test_each_kind_can_be_turned_off(client, db_session, test_user, root):
    db_session.get(User, test_user.id).preferences = {'reminders': {'goal_review': False}}
    db_session.commit()
    _, body = _read(client, test_user)
    assert body['preferences'] == {'goal_review': False, 'program_day': True, 'open_session': True}
    assert body['reminders'] == []


def test_dates_follow_the_readers_timezone(db_session, test_user, root):
    moment = datetime(2026, 11, 25, 3, tzinfo=timezone.utc)
    service = ReminderService(db_session)
    assert service.upcoming(test_user, 'America/New_York', now=moment)[0]['today'] == '2026-11-24'
    assert service.upcoming(test_user, 'Asia/Tokyo', now=moment)[0]['today'] == '2026-11-25'


def test_private_and_validated(client, db_session, test_user, root):
    other = User(username='quiet', email='quiet@example.test', terms_accepted_version=test_user.terms_accepted_version,
                 privacy_accepted_version=test_user.privacy_accepted_version)
    other.set_password('QuietUser123!')
    db_session.add(other)
    db_session.commit()
    assert _read(client, other)[1]['reminders'] == []
    assert _read(client, test_user, timezone='Nowhere/City')[0] == 400
    assert client.get('/api/reminders/upcoming').status_code == 401
    root.deleted_at = utc_now()
    db_session.commit()
    assert _read(client, test_user)[1]['reminders'] == []
