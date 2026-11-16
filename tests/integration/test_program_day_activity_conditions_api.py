"""Program days that ask for activities (optionally tagged) besides session templates."""
from datetime import datetime, timedelta, timezone

import pytest

from models import ActivityTagDefinition, Goal


@pytest.fixture
def program(authed_client, sample_ultimate_goal):
    root_id = sample_ultimate_goal.id
    start = datetime.now(timezone.utc)
    response = authed_client.post(f'/api/{root_id}/programs', json={
        'name': 'Skills', 'start_date': start.isoformat(),
        'end_date': (start + timedelta(days=14)).isoformat(), 'selectedGoals': [root_id],
    })
    assert response.status_code == 201
    return response.get_json()


@pytest.fixture
def clean_tag(db_session, sample_ultimate_goal):
    tag = ActivityTagDefinition(root_id=sample_ultimate_goal.id, name='Clean')
    db_session.add(tag)
    db_session.commit()
    return tag


def _days_url(root_id, program_id, day_id=None):
    base = f'/api/{root_id}/programs/{program_id}/days'
    return f'{base}/{day_id}' if day_id else base


@pytest.mark.integration
class TestProgramDayActivityConditions:
    def test_a_day_saves_its_activities_with_tags_and_counts_them_in_the_minimum(
        self, authed_client, sample_ultimate_goal, program, sample_activity_definition, sample_session_template, clean_tag,
    ):
        root_id = sample_ultimate_goal.id
        response = authed_client.post(_days_url(root_id, program['id']), json={
            'name': 'Skill day',
            'template_configs': [{'template_id': sample_session_template.id, 'is_required': False}],
            'activity_conditions': [
                {'activity_definition_id': sample_activity_definition.id, 'is_required': True,
                 'tag_ids': [clean_tag.id], 'tag_match': 'exact'},
                # The same activity with the same tags again is dropped; untagged is another condition.
                {'activity_definition_id': sample_activity_definition.id, 'tag_ids': [clean_tag.id], 'tag_match': 'exact'},
                {'activity_definition_id': sample_activity_definition.id, 'is_required': False},
            ],
            # One pool: 1 template + 2 activities.
            'completion_min_templates': 3,
        })

        assert response.status_code == 201, response.get_json()
        day = response.get_json()
        assert day['completion_min_templates'] == 3
        assert [(c['activity_name'], c['is_required'], c['tag_match'], [t['name'] for t in c['tags']], c['order'])
                for c in day['activity_conditions']] == [
            (sample_activity_definition.name, True, 'exact', ['Clean'], 0),
            (sample_activity_definition.name, False, 'contains', [], 1),
        ]

        updated = authed_client.put(_days_url(root_id, program['id'], day['id']), json={
            'activity_conditions': [{'activity_definition_id': sample_activity_definition.id}],
            'completion_min_templates': 2,
        })
        assert updated.status_code == 200, updated.get_json()
        assert len(updated.get_json()['activity_conditions']) == 1

        copy = authed_client.post(f"{_days_url(root_id, program['id'], day['id'])}/duplicate")
        assert copy.status_code in (200, 201), copy.get_json()
        assert [c['activity_definition_id'] for c in copy.get_json()['activity_conditions']] == [
            sample_activity_definition.id,
        ]

    def test_the_minimum_cannot_exceed_the_days_sessions_and_activities(
        self, authed_client, sample_ultimate_goal, program, sample_activity_definition,
    ):
        response = authed_client.post(_days_url(sample_ultimate_goal.id, program['id']), json={
            'name': 'Too many', 'activity_conditions': [{'activity_definition_id': sample_activity_definition.id}],
            'completion_min_templates': 2,
        })
        assert response.status_code == 400

    def test_activities_and_tags_must_belong_to_the_fractal(
        self, authed_client, db_session, sample_ultimate_goal, program, sample_activity_definition, test_user,
    ):
        other_root = Goal(name='Other', owner_id=test_user.id)
        db_session.add(other_root)
        db_session.flush()
        other_root.root_id = other_root.id
        foreign_tag = ActivityTagDefinition(root_id=other_root.id, name='Foreign')
        db_session.add(foreign_tag)
        db_session.commit()
        url = _days_url(sample_ultimate_goal.id, program['id'])

        # Like a missing session template: what the day refers to isn't found.
        assert authed_client.post(url, json={
            'name': 'Foreign activity', 'activity_conditions': [{'activity_definition_id': 'missing'}],
        }).status_code == 404
        assert authed_client.post(url, json={
            'name': 'Foreign tag', 'activity_conditions': [{
                'activity_definition_id': sample_activity_definition.id, 'tag_ids': [foreign_tag.id],
            }],
        }).status_code == 404


def _detail(client, root_id, program_id, day_value):
    response = client.get(
        f'/api/{root_id}/programs/{program_id}/day-read-model'
        f'?range_start={day_value}&range_end={day_value}&detail_date={day_value}&timezone=UTC'
    )
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _quick_session(client, root_id, activity_id):
    response = client.post(f'/api/{root_id}/sessions/quick-complete', json={
        'session_start': datetime.now(timezone.utc).isoformat(),
        'activity_instances': [{'activity_definition_id': activity_id, 'metrics': [], 'sets': []}],
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()


@pytest.mark.integration
class TestProgramDayActivityEvaluation:
    def test_a_quick_session_meets_a_day_that_asks_for_its_activity(
        self, authed_client, sample_ultimate_goal, program, sample_activity_definition, sample_session_template,
    ):
        root_id = sample_ultimate_goal.id
        today = datetime.now(timezone.utc).date().isoformat()
        day = authed_client.post(_days_url(root_id, program['id']), json={
            'name': 'Front lever day', 'scheduled_dates': [today],
            'template_configs': [{'template_id': sample_session_template.id, 'is_required': False}],
            'activity_conditions': [{'activity_definition_id': sample_activity_definition.id}],
        }).get_json()

        before = _detail(authed_client, root_id, program['id'], today)['detail']
        [occurrence] = before['occurrences']
        assert occurrence['requirements']['requirements_met'] is False
        assert [(a['activity_name'], a['status']) for a in occurrence['activities']] == [
            (sample_activity_definition.name, 'pending'),
        ]

        _quick_session(authed_client, root_id, sample_activity_definition.id)

        after = _detail(authed_client, root_id, program['id'], today)
        [occurrence] = after['detail']['occurrences']
        assert occurrence['program_day_id'] == day['id']
        assert occurrence['requirements']['requirements_met'] is True
        assert occurrence['requirements']['completed_item_count'] == 1
        assert occurrence['activities'][0]['status'] == 'completed'
        [summary_day] = [item for item in after['days'] if item['date'] == today]
        assert summary_day['state'] == 'scheduled_met'

        options = authed_client.get(f'/api/{root_id}/programs/active-days?date={today}&timezone=UTC').get_json()
        [option] = [item for item in options if item['day_id'] == day['id']]
        assert option['requirements_met'] is True
        assert option['activity_conditions'][0]['completed'] is True

    def test_a_tagged_activity_counts_only_when_a_set_carries_the_tag(
        self, authed_client, db_session, sample_ultimate_goal, program, sample_activity_definition, clean_tag,
    ):
        from models import ActivityInstance, ActivitySet, Session

        root_id = sample_ultimate_goal.id
        today = datetime.now(timezone.utc).date().isoformat()
        authed_client.post(_days_url(root_id, program['id']), json={
            'name': 'Clean reps only', 'scheduled_dates': [today],
            'activity_conditions': [{'activity_definition_id': sample_activity_definition.id, 'tag_ids': [clean_tag.id]}],
        })
        session = db_session.get(Session, _quick_session(authed_client, root_id, sample_activity_definition.id)['id'])
        [instance] = db_session.query(ActivityInstance).filter_by(session_id=session.id).all()

        detail = _detail(authed_client, root_id, program['id'], today)['detail']
        assert detail['occurrences'][0]['requirements']['requirements_met'] is False

        db_session.add(ActivitySet(activity_instance_id=instance.id, sort_order=0, status='completed', tags=[clean_tag]))
        db_session.commit()

        detail = _detail(authed_client, root_id, program['id'], today)['detail']
        assert detail['occurrences'][0]['requirements']['requirements_met'] is True


@pytest.mark.integration
class TestProgramDayActivityConditionTags:
    def test_merging_a_tag_moves_it_onto_the_days_that_ask_for_it(
        self, authed_client, db_session, sample_ultimate_goal, program, sample_activity_definition, clean_tag,
    ):
        root_id = sample_ultimate_goal.id
        strict = ActivityTagDefinition(root_id=root_id, name='Strict')
        db_session.add(strict)
        db_session.commit()
        day = authed_client.post(_days_url(root_id, program['id']), json={
            'name': 'Strict reps', 'activity_conditions': [
                {'activity_definition_id': sample_activity_definition.id, 'tag_ids': [strict.id]},
            ],
        }).get_json()
        versions = {tag.id: tag.version for tag in db_session.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.id.in_([strict.id, clean_tag.id]),
        )}

        response = authed_client.post(f'/api/{root_id}/activity-tags/merge', json={
            'target_id': clean_tag.id, 'source_ids': [strict.id], 'versions': versions,
        })

        assert response.status_code == 200, response.get_json()
        days = authed_client.get(f"/api/{root_id}/programs/{program['id']}").get_json()['days']
        [stored] = [item for item in days if item['id'] == day['id']]
        assert stored['activity_conditions'][0]['tag_ids'] == [clean_tag.id]
