"""Deleting a session, activity, goal or program takes the notes written on it (services/note_ownership.py)."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

from models import ActivityInstance, Note, Program, Session as PracticeSession


@pytest.fixture
def world(db_session, sample_goal_hierarchy, sample_practice_session, sample_activity_instance, sample_activity_definition):
    root = sample_goal_hierarchy['ultimate']
    session = sample_practice_session
    instance = sample_activity_instance

    def note(content, context_type, context_id, **fields):
        row = Note(id=str(uuid.uuid4()), root_id=root.id, context_type=context_type, context_id=context_id,
                   content=content, created_at=datetime.now(timezone.utc), **fields)
        db_session.add(row)
        return row

    other_session = PracticeSession(
        id=str(uuid.uuid4()), owner_id=root.owner_id, name='Evening', root_id=root.id, completed=True,
        session_start=datetime.now(timezone.utc), created_at=datetime.now(timezone.utc), attributes='{}',
    )
    db_session.add(other_session)
    db_session.flush()
    rows = {
        'session': note('Felt strong', 'session', session.id, session_id=session.id),
        'activity': note('Elbow ok', 'activity_instance', instance.id, session_id=session.id,
                         activity_instance_id=instance.id, activity_definition_id=sample_activity_definition.id,
                         goal_id=sample_goal_hierarchy['short_term'].id),
        'elsewhere': note('Other session', 'session', other_session.id, session_id=other_session.id),
        # Pinned in another session, then delivered into this one and its activity.
        'pinned_session': note('Warm up longer', 'session', other_session.id, session_id=other_session.id,
                               carry_forward_at=datetime.now(timezone.utc), carried_into_session_id=session.id),
        'pinned_activity': note('Lock elbows', 'session', other_session.id, session_id=other_session.id,
                                activity_definition_id=sample_activity_definition.id,
                                carry_forward_at=datetime.now(timezone.utc), carried_into_instance_id=instance.id),
        'mid_goal': note('Mid note', 'goal', sample_goal_hierarchy['mid_term'].id,
                         goal_id=sample_goal_hierarchy['mid_term'].id),
        'short_review': note('Review', 'goal', sample_goal_hierarchy['short_term'].id,
                             goal_id=sample_goal_hierarchy['short_term'].id, note_kind='goal_review'),
        'long_goal': note('Long note', 'goal', sample_goal_hierarchy['long_term'].id,
                          goal_id=sample_goal_hierarchy['long_term'].id),
    }
    db_session.commit()
    return type('World', (), {'root': root, 'session': session, 'instance': instance, 'rows': rows,
                              'goals': sample_goal_hierarchy, 'db': db_session})


def _live_contents(client, root_id):
    payload = client.get(f'/api/{root_id}/notes?page_size=100').get_json()
    return {note['content'] for note in payload['notes']}


def _count(client, root_id, **params):
    query = '&'.join(f'{key}={value}' for key, value in params.items())
    response = client.get(f'/api/{root_id}/notes/owned-count?{query}')
    return response.status_code, response.get_json()


@pytest.mark.integration
class TestNoteCascadeOnDelete:
    def test_deleting_a_session_takes_its_notes_and_frees_its_pins(self, authed_client, world):
        root_id = world.root.id
        assert _count(authed_client, root_id, session_id=world.session.id) == (200, {'count': 2})

        response = authed_client.delete(f'/api/{root_id}/sessions/{world.session.id}')
        assert response.status_code == 200

        world.db.expire_all()
        session = world.db.get(PracticeSession, world.session.id)
        for key in ('session', 'activity'):
            assert world.db.get(Note, world.rows[key].id).deleted_at == session.deleted_at
        live = _live_contents(authed_client, root_id)
        assert {'Felt strong', 'Elbow ok'}.isdisjoint(live)
        assert {'Other session', 'Warm up longer', 'Lock elbows', 'Mid note'} <= live
        # Pins this session used up wait for the next one again.
        assert world.db.get(Note, world.rows['pinned_session'].id).carried_into_session_id is None
        assert world.db.get(Note, world.rows['pinned_activity'].id).carried_into_instance_id is None

    def test_removing_an_activity_takes_its_notes_only(self, authed_client, world):
        root_id = world.root.id
        assert _count(authed_client, root_id, activity_instance_id=world.instance.id) == (200, {'count': 1})

        response = authed_client.delete(f'/api/{root_id}/sessions/{world.session.id}/activities/{world.instance.id}')
        assert response.status_code == 200

        world.db.expire_all()
        instance = world.db.get(ActivityInstance, world.instance.id)
        assert world.db.get(Note, world.rows['activity'].id).deleted_at == instance.deleted_at
        live = _live_contents(authed_client, root_id)
        assert 'Elbow ok' not in live
        assert 'Felt strong' in live
        assert world.db.get(Note, world.rows['pinned_activity'].id).carried_into_instance_id is None
        assert world.db.get(Note, world.rows['pinned_session'].id).carried_into_session_id == world.session.id

    def test_deleting_a_goal_takes_its_subtree_notes_but_not_notes_that_only_link_it(self, authed_client, world):
        root_id = world.root.id
        mid = world.goals['mid_term']
        assert _count(authed_client, root_id, goal_id=mid.id) == (200, {'count': 2})

        response = authed_client.delete(f'/api/{root_id}/goals/{mid.id}')
        assert response.status_code == 200

        live = _live_contents(authed_client, root_id)
        assert {'Mid note', 'Review'}.isdisjoint(live)
        assert {'Long note', 'Elbow ok'} <= live
        # The activity note linked the deleted short-term goal; it survives without naming it.
        payload = authed_client.get(f'/api/{root_id}/notes?page_size=100').get_json()
        (activity,) = [note for note in payload['notes'] if note['content'] == 'Elbow ok']
        assert 'goal_name' not in activity

    def test_deleting_a_program_deletes_its_notes(self, authed_client, world):
        root_id = world.root.id
        program = Program(
            id=str(uuid.uuid4()), root_id=root_id, name='Block', start_date=date.today(),
            end_date=date.today() + timedelta(days=10), weekly_schedule=[],
        )
        world.db.add(program)
        world.db.flush()
        for context_type, extra in (('program', {}), ('program_date', {'calendar_date': date.today()})):
            world.db.add(Note(id=str(uuid.uuid4()), root_id=root_id, context_type=context_type, context_id=program.id,
                              program_id=program.id, content=f'{context_type} note', **extra))
        world.db.commit()
        program_id = program.id
        assert _count(authed_client, root_id, program_id=program_id) == (200, {'count': 2})

        response = authed_client.delete(f'/api/{root_id}/programs/{program_id}')
        assert response.status_code == 200

        world.db.expire_all()
        assert world.db.query(Note).filter(Note.program_id == program_id).count() == 0
        assert {'program note', 'program_date note'}.isdisjoint(_live_contents(authed_client, root_id))

    def test_count_needs_exactly_one_target(self, authed_client, world):
        root_id = world.root.id
        assert _count(authed_client, root_id)[0] == 400
        assert _count(authed_client, root_id, session_id=world.session.id, goal_id=world.goals['mid_term'].id)[0] == 400
        assert _count(authed_client, root_id, session_id='missing')[0] == 404
