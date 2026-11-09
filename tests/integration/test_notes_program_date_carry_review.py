"""Program calendar-date notes, next-instance pins (carry forward) and structured goal reviews."""
import json
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from models import ActivityInstance, Goal, Note, Program, ProgramDay, ProgramDayOccurrenceSchedule, Session


def _program_with_day(db_session, root_id, dates, *, name='Heavy day'):
    start = min(dates) - timedelta(days=3)
    program = Program(
        id=str(uuid.uuid4()), root_id=root_id, name='Strength block',
        start_date=datetime.combine(start, datetime.min.time()),
        end_date=datetime.combine(start + timedelta(days=40), datetime.min.time()),
        weekly_schedule=[],
    )
    day = ProgramDay(
        program=program, name=name,
        occurrence_schedules=[ProgramDayOccurrenceSchedule(date=value) for value in dates],
    )
    db_session.add_all([program, day])
    db_session.commit()
    return program, day


def _session(db_session, root_id, *, quick=False):
    owner_id = db_session.get(Goal, root_id).owner_id
    attributes = {'session_data': {'session_type': 'quick'}} if quick else {}
    session = Session(
        id=str(uuid.uuid4()), root_id=root_id, owner_id=owner_id, name='Practice',
        session_start=datetime.now(timezone.utc), created_at=datetime.now(timezone.utc),
        attributes=json.dumps(attributes),
    )
    db_session.add(session)
    db_session.commit()
    return session


def _finish(db_session, session):
    """Only one session may be open per fractal; finish one before starting the next."""
    session.completed = True
    session.completed_at = datetime.now(timezone.utc)
    db_session.commit()


def _instance(db_session, session, activity):
    instance = ActivityInstance(
        id=str(uuid.uuid4()), session_id=session.id, activity_definition_id=activity.id,
        root_id=session.root_id, created_at=datetime.now(timezone.utc), data=json.dumps({}),
    )
    db_session.add(instance)
    db_session.commit()
    return instance


@pytest.mark.integration
class TestProgramDateNotes:
    def _note(self, authed_client, root_id, program, on, content='Slept badly, kept it light'):
        return authed_client.post(f'/api/{root_id}/notes', json={
            'content': content, 'context_type': 'program_date',
            'context_id': program.id, 'calendar_date': on.isoformat(),
        })

    def test_note_on_any_date_of_the_program(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        scheduled = date.today() + timedelta(days=2)
        program, _day = _program_with_day(db_session, root_id, [scheduled])
        free = scheduled + timedelta(days=1)

        response = self._note(authed_client, root_id, program, free)

        assert response.status_code == 201, response.get_json()
        payload = response.get_json()
        assert payload['note_type'] == 'program_date_note'
        assert payload['note_category'] == 'programs'
        assert (payload['program_id'], payload['calendar_date']) == (program.id, free.isoformat())
        assert payload['program_name'] == 'Strength block'
        feed = authed_client.get(f'/api/{root_id}/notes?categories=programs').get_json()
        assert [note['id'] for note in feed['notes']] == [payload['id']]

    def test_rejects_dates_outside_the_program_foreign_programs_and_links(
        self, authed_client, db_session, sample_ultimate_goal, sample_goal_hierarchy,
    ):
        root_id = sample_ultimate_goal.id
        on = date.today() + timedelta(days=2)
        program, _day = _program_with_day(db_session, root_id, [on])
        base = {'content': 'x', 'context_type': 'program_date', 'context_id': program.id}

        assert authed_client.post(f'/api/{root_id}/notes', json=base).status_code == 400
        assert self._note(authed_client, root_id, program, on - timedelta(days=30)).status_code == 400
        assert self._note(authed_client, root_id, program, on + timedelta(days=60)).status_code == 400
        assert authed_client.post(f'/api/{root_id}/notes', json={
            **base, 'calendar_date': on.isoformat(), 'goal_id': sample_goal_hierarchy['mid_term'].id,
        }).status_code == 400
        assert authed_client.post(f'/api/{root_id}/notes', json={
            **base, 'context_id': str(uuid.uuid4()), 'calendar_date': on.isoformat(),
        }).status_code == 400

    def test_notes_stay_on_their_date_when_a_day_moves_away(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        source = date.today() + timedelta(days=2)
        program, day = _program_with_day(db_session, root_id, [source])
        note_id = self._note(authed_client, root_id, program, source).get_json()['id']

        moved = authed_client.post(f'/api/{root_id}/programs/{program.id}/days/{day.id}/move', json={
            'source_date': source.isoformat(), 'target_date': (source + timedelta(days=1)).isoformat(),
        })
        assert moved.status_code == 200, moved.get_json()
        db_session.expire_all()
        assert db_session.get(Note, note_id).calendar_date == source

    def test_day_read_model_lists_the_dates_notes(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        on = date.today() + timedelta(days=2)
        program, _day = _program_with_day(db_session, root_id, [on])
        self._note(authed_client, root_id, program, on, 'Shown in the pane')
        self._note(authed_client, root_id, program, on + timedelta(days=1), 'Another date')

        response = authed_client.get(
            f'/api/{root_id}/programs/{program.id}/day-read-model'
            f'?range_start={on.isoformat()}&range_end={on.isoformat()}&detail_date={on.isoformat()}&timezone=UTC'
        )
        assert response.status_code == 200, response.get_json()
        assert [note['content'] for note in response.get_json()['detail']['notes']] == ['Shown in the pane']


@pytest.mark.integration
class TestCarryForward:
    def _pinned_note(self, authed_client, root_id, instance):
        note = authed_client.post(f'/api/{root_id}/notes', json={
            'content': 'Grip wider next time', 'context_type': 'activity_instance',
            'context_id': instance.id, 'activity_instance_id': instance.id,
        }).get_json()
        response = authed_client.put(f'/api/{root_id}/notes/{note["id"]}', json={'carry_forward': True})
        assert response.status_code == 200, response.get_json()
        assert response.get_json()['carry_forward'] == 'pending'
        return note['id']

    def test_pending_on_the_next_session_until_its_instance_completes(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        first = _session(db_session, root_id)
        note_id = self._pinned_note(authed_client, root_id, _instance(db_session, first, sample_activity_definition))
        _finish(db_session, first)
        second = _session(db_session, root_id)
        nxt = _instance(db_session, second, sample_activity_definition)

        assert authed_client.get(f'/api/{root_id}/sessions/{first.id}/carried-notes').get_json()['pending'] == []
        carried = authed_client.get(f'/api/{root_id}/sessions/{second.id}/carried-notes').get_json()
        assert [note['id'] for note in carried['pending']] == [note_id]

        completed = authed_client.put(f'/api/{root_id}/sessions/{second.id}/activities/{nxt.id}', json={'completed': True})
        assert completed.status_code == 200, completed.get_json()

        db_session.expire_all()
        assert db_session.get(Note, note_id).carried_into_instance_id == nxt.id
        carried = authed_client.get(f'/api/{root_id}/sessions/{second.id}/carried-notes').get_json()
        assert carried['pending'] == []
        assert [(note['id'], note['carry_forward']) for note in carried['delivered']] == [(note_id, 'delivered')]
        _finish(db_session, second)
        third = _session(db_session, root_id)
        _instance(db_session, third, sample_activity_definition)
        assert authed_client.get(f'/api/{root_id}/sessions/{third.id}/carried-notes').get_json()['pending'] == []

    def test_session_completion_consumes_once_for_a_repeated_activity(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        first = _session(db_session, root_id)
        note_id = self._pinned_note(authed_client, root_id, _instance(db_session, first, sample_activity_definition))
        _finish(db_session, first)
        second = _session(db_session, root_id)
        instances = [_instance(db_session, second, sample_activity_definition) for _ in range(2)]

        response = authed_client.put(f'/api/{root_id}/sessions/{second.id}', json={'completed': True})
        assert response.status_code == 200, response.get_json()

        db_session.expire_all()
        assert db_session.get(Note, note_id).carried_into_instance_id in {instance.id for instance in instances}

    def test_completing_the_notes_own_session_or_a_quick_session_does_not_consume(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        first = _session(db_session, root_id)
        own = _instance(db_session, first, sample_activity_definition)
        note_id = self._pinned_note(authed_client, root_id, own)
        own.completed = True
        db_session.commit()
        _finish(db_session, first)
        quick = _session(db_session, root_id, quick=True)
        quick_instance = _instance(db_session, quick, sample_activity_definition)

        quick_instance.completed = True
        db_session.commit()

        db_session.expire_all()
        assert db_session.get(Note, note_id).carried_into_instance_id is None

    def test_unpin_before_and_no_toggle_after_consumption(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        first = _session(db_session, root_id)
        note_id = self._pinned_note(authed_client, root_id, _instance(db_session, first, sample_activity_definition))

        unpinned = authed_client.put(f'/api/{root_id}/notes/{note_id}', json={'carry_forward': False})
        assert unpinned.get_json()['carry_forward'] is None
        _finish(db_session, first)
        second = _session(db_session, root_id)
        nxt = _instance(db_session, second, sample_activity_definition)
        assert authed_client.get(f'/api/{root_id}/sessions/{second.id}/carried-notes').get_json()['pending'] == []

        authed_client.put(f'/api/{root_id}/notes/{note_id}', json={'carry_forward': True})
        nxt.completed = True
        db_session.commit()
        assert authed_client.put(f'/api/{root_id}/notes/{note_id}', json={'carry_forward': False}).status_code == 409

    def test_session_notes_carry_to_the_next_session_until_it_completes(
        self, authed_client, db_session, sample_ultimate_goal,
    ):
        root_id = sample_ultimate_goal.id
        first = _session(db_session, root_id)
        note_id = authed_client.post(f'/api/{root_id}/notes', json={
            'content': 'Warm up the shoulder first', 'context_type': 'session', 'context_id': first.id,
            'session_id': first.id,
        }).get_json()['id']
        pinned = authed_client.put(f'/api/{root_id}/notes/{note_id}', json={'carry_forward': True})
        assert pinned.get_json()['carry_forward'] == 'pending'
        assert authed_client.get(f'/api/{root_id}/sessions/{first.id}/carried-notes').get_json()['pending'] == []
        _finish(db_session, first)
        db_session.expire_all()
        assert db_session.get(Note, note_id).carried_into_session_id is None

        second = _session(db_session, root_id)
        carried = authed_client.get(f'/api/{root_id}/sessions/{second.id}/carried-notes').get_json()
        assert [note['id'] for note in carried['pending']] == [note_id]

        assert authed_client.put(f'/api/{root_id}/sessions/{second.id}', json={'completed': True}).status_code == 200
        db_session.expire_all()
        assert db_session.get(Note, note_id).carried_into_session_id == second.id
        carried = authed_client.get(f'/api/{root_id}/sessions/{second.id}/carried-notes').get_json()
        assert carried['pending'] == []
        assert [(note['id'], note['carry_forward']) for note in carried['delivered']] == [(note_id, 'delivered')]
        assert authed_client.put(f'/api/{root_id}/notes/{note_id}', json={'carry_forward': False}).status_code == 409

    def test_pending_pins_show_only_on_open_sessions(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        old = _session(db_session, root_id)
        _instance(db_session, old, sample_activity_definition)
        _finish(db_session, old)
        current = _session(db_session, root_id)
        self._pinned_note(authed_client, root_id, _instance(db_session, current, sample_activity_definition))
        assert authed_client.get(f'/api/{root_id}/sessions/{old.id}/carried-notes').get_json()['pending'] == []

    def test_pin_to_top_is_retired(self, authed_client, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        note = authed_client.post(f'/api/{root_id}/notes', json={
            'content': 'General', 'context_type': 'root', 'context_id': root_id,
        }).get_json()
        assert 'is_pinned' not in note
        assert authed_client.put(f'/api/{root_id}/notes/{note["id"]}/pin').status_code in (404, 405)
        # A pin queued offline before the change still syncs, and does nothing.
        ignored = authed_client.put(f'/api/{root_id}/notes/{note["id"]}', json={'pin': True})
        assert ignored.status_code == 200 and 'is_pinned' not in ignored.get_json()
        # Filters saved with "pinned only" still load and now match every note.
        assert authed_client.get(f'/api/{root_id}/notes?pinned_only=true').status_code == 200

    def test_only_activity_notes_can_be_carried(self, authed_client, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        note = authed_client.post(f'/api/{root_id}/notes', json={
            'content': 'General', 'context_type': 'root', 'context_id': root_id,
        }).get_json()
        assert authed_client.put(f'/api/{root_id}/notes/{note["id"]}', json={'carry_forward': True}).status_code == 400

    def test_deleted_target_instance_releases_nothing_and_other_fractals_are_isolated(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        first = _session(db_session, root_id)
        note_id = self._pinned_note(authed_client, root_id, _instance(db_session, first, sample_activity_definition))
        _finish(db_session, first)
        second = _session(db_session, root_id)
        doomed = _instance(db_session, second, sample_activity_definition)
        doomed.deleted_at = datetime.now(timezone.utc)
        doomed.completed = True
        db_session.commit()

        db_session.expire_all()
        assert db_session.get(Note, note_id).carried_into_instance_id is None
        assert authed_client.get(f'/api/{uuid.uuid4()}/sessions/{second.id}/carried-notes').status_code == 404


@pytest.mark.integration
class TestStructuredGoalReviews:
    def test_review_data_derives_searchable_content_and_restarts_the_cadence(
        self, authed_client, db_session, sample_goal_hierarchy,
    ):
        goal = sample_goal_hierarchy['long_term']
        root_id = sample_goal_hierarchy['ultimate'].id
        response = authed_client.post(f'/api/{root_id}/notes', json={
            'context_type': 'goal', 'context_id': goal.id, 'goal_id': goal.id, 'note_kind': 'goal_review',
            'review_data': {'status': 'at_risk', 'went_well': 'Trained four times a week', 'next_focus': 'Sleep'},
        })

        assert response.status_code == 201, response.get_json()
        payload = response.get_json()
        assert payload['review_data'] == {
            'schema': 1, 'status': 'at_risk', 'went_well': 'Trained four times a week',
            'change': '', 'next_focus': 'Sleep',
        }
        assert 'Status: At risk' in payload['content']
        assert 'Trained four times a week' in payload['content']
        feed = authed_client.get(f'/api/{root_id}/notes?text=four%20times').get_json()['notes']
        assert [note['id'] for note in feed] == [payload['id']]

        updated = authed_client.put(f'/api/{root_id}/notes/{payload["id"]}', json={
            'review_data': {'status': 'on_track', 'change': 'Nothing'},
        }).get_json()
        assert updated['review_data']['status'] == 'on_track'
        assert 'Trained four times' not in updated['content']

    def test_review_data_is_validated(self, authed_client, sample_goal_hierarchy):
        goal = sample_goal_hierarchy['long_term']
        root_id = sample_goal_hierarchy['ultimate'].id
        base = {'context_type': 'goal', 'context_id': goal.id, 'goal_id': goal.id}
        for body in (
            {**base, 'note_kind': 'goal_review', 'review_data': {}},
            {**base, 'note_kind': 'goal_review', 'review_data': {'status': 'great'}},
            {**base, 'review_data': {'went_well': 'x'}},
            {**base, 'note_kind': 'goal_review', 'review_data': {'went_well': 'x' * 2001}},
        ):
            assert authed_client.post(f'/api/{root_id}/notes', json=body).status_code == 400

    def test_legacy_markdown_reviews_are_untouched(self, authed_client, sample_goal_hierarchy):
        goal = sample_goal_hierarchy['long_term']
        root_id = sample_goal_hierarchy['ultimate'].id
        payload = authed_client.post(f'/api/{root_id}/notes', json={
            'context_type': 'goal', 'context_id': goal.id, 'goal_id': goal.id, 'note_kind': 'goal_review',
            'content': '## Review\n**What went well**',
        }).get_json()
        assert payload['review_data'] is None
        assert payload['content'] == '## Review\n**What went well**'


@pytest.mark.integration
class TestFeedContext:
    def _set_note(self, authed_client, db_session, root_id, session, activity):
        from models import ActivitySet, MetricValue
        instance = _instance(db_session, session, activity)
        metric = activity.metric_definitions[0]
        activity_set = ActivitySet(id=str(uuid.uuid4()), activity_instance_id=instance.id, sort_order=1)
        db_session.add(activity_set)
        db_session.add(MetricValue(
            activity_instance_id=instance.id, activity_set_id=activity_set.id,
            metric_definition_id=metric.id, value=80,
        ))
        db_session.commit()
        return authed_client.post(f'/api/{root_id}/notes', json={
            'content': 'Felt heavy', 'context_type': 'activity_instance', 'context_id': instance.id,
            'activity_instance_id': instance.id, 'activity_set_id': activity_set.id,
        }).get_json(), instance, metric

    def test_activity_and_goal_notes_carry_their_context(
        self, authed_client, db_session, sample_goal_hierarchy, sample_activity_definition,
    ):
        root_id = sample_goal_hierarchy['ultimate'].id
        note, _instance, metric = self._set_note(
            authed_client, db_session, root_id, _session(db_session, root_id), sample_activity_definition,
        )
        goal = sample_goal_hierarchy['mid_term']
        authed_client.post(f'/api/{root_id}/notes', json={
            'content': 'Goal context', 'context_type': 'goal', 'context_id': goal.id, 'goal_id': goal.id,
        })

        feed = {item['content']: item for item in authed_client.get(f'/api/{root_id}/notes').get_json()['notes']}
        activity_note = feed['Felt heavy']
        assert activity_note['instance_completed'] is False
        assert [(m['metric_definition_id'], m['value']) for m in activity_note['set_metrics']] == [(metric.id, 80)]
        assert [(item['id'], [m['value'] for m in item['metrics']]) for item in activity_note['instance_sets']] == [
            (note['activity_set_id'], [80]),
        ]
        expected_path = [sample_goal_hierarchy['ultimate'].name, sample_goal_hierarchy['long_term'].name]
        assert feed['Goal context']['goal_path'] == expected_path
        assert 'instance_sets' not in feed['Goal context']

    def test_instances_without_values_carry_no_activity_context(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        instance = _instance(db_session, _session(db_session, root_id), sample_activity_definition)
        instance.prescription = {'schema': 1, 'notes': 'Top set at RPE 8'}
        db_session.commit()
        authed_client.post(f'/api/{root_id}/notes', json={
            'content': 'Nothing logged', 'context_type': 'activity_instance', 'context_id': instance.id,
            'activity_instance_id': instance.id,
        })
        [note] = authed_client.get(f'/api/{root_id}/notes').get_json()['notes']
        assert 'instance_sets' not in note and 'instance_metrics' not in note
        assert 'instance_plan_note' not in note

    def test_feed_query_count_does_not_grow_with_the_page(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition, query_counter,
    ):
        root_id = sample_ultimate_goal.id
        session = _session(db_session, root_id)

        def feed_queries():
            query_counter['total'] = 0
            assert authed_client.get(f'/api/{root_id}/notes?page_size=100').status_code == 200
            return query_counter['total']

        self._set_note(authed_client, db_session, root_id, session, sample_activity_definition)
        small = feed_queries()
        for _ in range(6):
            self._set_note(authed_client, db_session, root_id, session, sample_activity_definition)
        assert feed_queries() == small
