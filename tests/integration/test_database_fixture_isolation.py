"""The faster fixture must isolate committed data and preserve real transactions."""

import pytest

from models import AppSetting, get_scoped_session, get_session


@pytest.mark.parametrize('iteration', range(3))
def test_committed_rows_do_not_survive_between_tests(db_session, iteration):
    # Reuse the same primary key across cases: a missing reset must fail, even
    # when all other tests happen to use randomly generated identifiers.
    assert db_session.get(AppSetting, 'fixture-isolation-probe') is None
    db_session.add(AppSetting(key='fixture-isolation-probe', value={'iteration': iteration}))
    db_session.commit()

    with get_session(db_session.get_bind()) as independent_session:
        assert independent_session.get(AppSetting, 'fixture-isolation-probe').value == {
            'iteration': iteration,
        }


def test_request_sessions_share_engine_but_not_uncommitted_data(app, db_session):
    with app.app_context():
        request_session = get_scoped_session()
        assert request_session.get_bind() is db_session.get_bind()
        db_session.add(AppSetting(key='uncommitted-fixture-probe', value={}))
        db_session.flush()
        assert request_session.get(AppSetting, 'uncommitted-fixture-probe') is None
        db_session.rollback()
        assert request_session.get(AppSetting, 'uncommitted-fixture-probe') is None


def test_query_counter_observes_request_sql(client, query_counter):
    query_counter['total'] = 0
    response = client.get('/api/readyz')
    assert response.status_code == 200
    assert query_counter['total'] >= 1
