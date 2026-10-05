import pytest
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from threading import Barrier
from sqlalchemy import event
from services.events import Events
from models import Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule, ProgramDayStatusOverride, ProgramDayTemplate, Session, get_engine, get_session, program_goals, program_block_goals
from services.program_day_read_model_service import ProgramDayReadModelService
from services.programs import ProgramService


def _delete_sample_blocks(client, root_id, program_id):
    """Free the sample program's dates; blocks in one program may not overlap."""
    program = client.get(f'/api/{root_id}/programs/{program_id}').get_json()
    for block in program['blocks']:
        assert client.delete(f'/api/{root_id}/programs/{program_id}/blocks/{block["id"]}').status_code == 200

def _clear_program_focus(db_session, program_id):
    """Drop the fixture's root-goal focus so a test can seed its own goal scope."""
    block_ids = [block_id for (block_id,) in db_session.query(ProgramBlock.id).filter_by(program_id=program_id)]
    db_session.execute(program_block_goals.delete().where(program_block_goals.c.program_block_id.in_(block_ids)))
    db_session.execute(program_goals.delete().where(program_goals.c.program_id == program_id))
    db_session.commit()

@pytest.fixture
def sample_program(authed_client, sample_ultimate_goal):
    """Create a sample program for testing."""
    root_id = sample_ultimate_goal.id
    start_date = datetime.utcnow()
    end_date = start_date + timedelta(days=7)
    
    payload = {
        'name': 'Test Program',
        'description': 'A test program',
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'weeklySchedule': [],
        'selectedGoals': [root_id]
    }
    
    response = authed_client.post(
        f'/api/{root_id}/programs',
        data=json.dumps(payload),
        content_type='application/json'
    )
    assert response.status_code == 201
    program = json.loads(response.data)
    block_response = authed_client.post(
        f'/api/{root_id}/programs/{program["id"]}/blocks',
        data=json.dumps({
            'name': 'Week 1',
            'start_date': start_date.date().isoformat(),
            'end_date': end_date.date().isoformat(),
            'color': '#3A86FF',
        }),
        content_type='application/json',
    )
    assert block_response.status_code == 201
    return authed_client.get(f'/api/{root_id}/programs/{program["id"]}').get_json()

@pytest.mark.integration
class TestProgramCRUD:
    """Test Program CRUD operations."""

    def test_create_program(self, authed_client, sample_ultimate_goal):
        """Test creating a new training program."""
        root_id = sample_ultimate_goal.id
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=14)
        
        payload = {
            'name': 'New Program',
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'color': '#06A77D',
            'weeklySchedule': []
        }
        
        response = authed_client.post(
            f'/api/{root_id}/programs',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'New Program'
        assert data['color'] == '#06A77D'
        assert data['root_id'] == root_id

    def test_create_program_rejects_invalid_color(self, authed_client, sample_ultimate_goal):
        """Test creating a program rejects non-hex colors."""
        root_id = sample_ultimate_goal.id
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=14)

        response = authed_client.post(
            f'/api/{root_id}/programs',
            data=json.dumps({
                'name': 'New Program',
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'color': 'blue',
                'weeklySchedule': [],
            }),
            content_type='application/json'
        )

        assert response.status_code == 400

    def test_get_programs(self, authed_client, sample_ultimate_goal, sample_program):
        """Test listing programs."""
        root_id = sample_ultimate_goal.id
        response = authed_client.get(f'/api/{root_id}/programs')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(p['id'] == sample_program['id'] for p in data)

    def test_get_program_calendar_summaries_omits_program_details(
        self, authed_client, sample_ultimate_goal, sample_program,
    ):
        response = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/calendar?timezone=UTC'
        )

        assert response.status_code == 200
        summaries = response.get_json()
        assert len(summaries) == 1
        assert summaries[0] == {
            'id': sample_program['id'],
            'root_id': sample_ultimate_goal.id,
            'name': 'Test Program',
            'color': sample_program['color'],
            'start_date': sample_program['start_date'],
            'end_date': sample_program['end_date'],
        }

    def test_active_days_honors_requested_date_and_preserves_program_contract(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        sample_program,
        sample_goal_hierarchy,
        sample_session_template,
    ):
        target_date = datetime.now(timezone.utc).date()
        _clear_program_focus(db_session, sample_program['id'])
        program = db_session.query(Program).filter_by(id=sample_program['id']).one()
        program.color = '#22c55e'
        program.start_date = datetime.combine(target_date, datetime.min.time())
        program.end_date = datetime.combine(target_date, datetime.max.time())
        block = db_session.query(ProgramBlock).filter_by(program_id=program.id).first()
        block.start_date = target_date
        block.end_date = target_date
        day = ProgramDay(
            program_id=block.program_id,
            occurrence_schedules=[ProgramDayOccurrenceSchedule(date=target_date)],
            day_number=4,
            name='Today',
            completion_min_templates=1,
        )
        db_session.add(day)
        db_session.flush()
        sample_session_template.template_data = json.dumps({'template_color': '#d946ef'})
        db_session.add(ProgramDayTemplate(
            program_day_id=day.id,
            session_template_id=sample_session_template.id,
            is_required=False,
            order=3,
        ))
        db_session.execute(program_goals.insert().values(
            program_id=program.id,
            goal_id=sample_goal_hierarchy['mid_term'].id,
        ))
        db_session.execute(program_block_goals.insert().values(
            program_block_id=block.id,
            goal_id=sample_goal_hierarchy['short_term'].id,
        ))
        db_session.commit()

        response = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/day-options'
            f'?date={target_date.isoformat()}&timezone=UTC'
        )
        assert response.status_code == 200
        row = next(item for item in response.get_json() if item['day_id'] == day.id)
        assert row['program_goal_ids'] == [sample_goal_hierarchy['mid_term'].id]
        assert row['program_color'] == '#22c55e'
        assert 'block_goal_ids' not in row
        # Retained block goal rows no longer seed the program scope.
        assert row['scope_seed_goal_ids'] == [sample_goal_hierarchy['mid_term'].id]
        assert row['scope_goal_ids'] == sorted([
            sample_goal_hierarchy['mid_term'].id,
            sample_goal_hierarchy['short_term'].id,
        ])
        assert row['completion_min_templates'] == 1
        assert row['completed_session_count'] == 0
        assert row['completed_template_ids'] == []
        assert row['sessions'][0]['is_required'] is False
        assert row['sessions'][0]['order'] == 3
        assert row['sessions'][0]['template_color'] == '#d946ef'
        compatibility_response = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/active-days'
            f'?date={target_date.isoformat()}&timezone=UTC'
        )
        assert compatibility_response.get_json() == response.get_json()

        other_date = target_date + timedelta(days=1)
        assert authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/active-days?date={other_date.isoformat()}'
        ).get_json() == []

    def test_active_days_rejects_malformed_date(self, authed_client, sample_ultimate_goal):
        response = authed_client.get(f'/api/{sample_ultimate_goal.id}/programs/active-days?date=tomorrow')
        assert response.status_code == 400
        assert response.get_json()['error'] == 'Invalid date. Use YYYY-MM-DD.'

    def test_program_day_read_model_returns_canonical_summary_and_detail(
        self, authed_client, db_session, sample_ultimate_goal, sample_program, sample_session_template
    ):
        target_date = datetime.now(timezone.utc).date()
        program = db_session.query(Program).filter_by(id=sample_program['id']).one()
        program.start_date = datetime.combine(target_date, datetime.min.time())
        program.end_date = datetime.combine(target_date, datetime.max.time())
        block = db_session.query(ProgramBlock).filter_by(program_id=program.id).first()
        block.start_date = target_date
        block.end_date = target_date
        day = ProgramDay(program_id=block.program_id, occurrence_schedules=[ProgramDayOccurrenceSchedule(date=target_date)], name='Canonical day')
        db_session.add(day)
        db_session.flush()
        db_session.add(ProgramDayTemplate(
            program_day_id=day.id,
            session_template_id=sample_session_template.id,
            is_required=True,
            order=0,
        ))
        db_session.commit()

        response = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/{program.id}/day-read-model'
            f'?range_start={target_date.isoformat()}&range_end={target_date.isoformat()}'
            f'&detail_date={target_date.isoformat()}&timezone=UTC'
        )
        assert response.status_code == 200
        payload = response.get_json()
        assert payload['schema_version'] == 7
        assert payload['chain']['context_start'] == target_date.isoformat()
        assert payload['chain']['context_truncated_before'] is False
        assert payload['days'][0]['state'] == 'scheduled_pending'
        assert payload['days'][0]['broke_active_chain'] is False
        assert payload['days'][0]['required_template_count'] == 1
        assert payload['days'][0]['completion_min_templates'] is None
        assert payload['detail']['requirements'] == {
            'required_template_ids': [sample_session_template.id],
            'completed_template_ids': [],
            'scheduled_template_ids': [sample_session_template.id],
            'scheduled_template_count': 1,
            'required_template_count': 1,
            'completion_min_templates': None,
            'requirements_met': False,
        }
        assert payload['detail']['occurrences'][0]['program_day_id'] == day.id
        assert payload['detail']['occurrences'][0]['templates'][0]['status'] == 'pending'
        metrics = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/{program.id}/metrics'
            f'?range_start={target_date.isoformat()}&range_end={target_date.isoformat()}&timezone=UTC'
        ).get_json()
        assert metrics['days'][0]['state'] == payload['days'][0]['state']
        assert metrics['days'][0]['required_template_count'] == payload['days'][0]['required_template_count']

    def test_program_day_read_model_validates_contract(
        self, authed_client, sample_ultimate_goal, sample_program
    ):
        base = f'/api/{sample_ultimate_goal.id}/programs/{sample_program["id"]}/day-read-model'
        assert authed_client.get(f'{base}?range_start=2026-01-01&range_end=2026-01-01').status_code == 400
        assert authed_client.get(
            f'{base}?range_start=2026-01-02&range_end=2026-01-01&timezone=UTC'
        ).status_code == 400
        assert authed_client.get(
            f'{base}?range_start=2026-01-01&range_end=2026-01-01&timezone=Not/AZone'
        ).status_code == 400
        assert authed_client.get(
            f'{base}?range_start=2026-01-01&range_end=2026-01-01'
            f'&detail_date=2026-01-01&timezone=UTC&session_cursor=invalid'
        ).status_code == 400

    def test_manual_day_statuses_are_atomic_idempotent_and_override_read_models(
        self, authed_client, db_session, sample_ultimate_goal, sample_program, sample_session_template
    ):
        today = datetime.now(timezone.utc).date()
        future = today + timedelta(days=1)
        program = db_session.query(Program).filter_by(id=sample_program['id']).one()
        program.start_date = datetime.combine(today, datetime.min.time())
        program.end_date = datetime.combine(today + timedelta(days=7), datetime.max.time())
        block = db_session.query(ProgramBlock).filter_by(program_id=program.id).first()
        block.start_date = today
        block.end_date = today + timedelta(days=7)
        days = [
            ProgramDay(program_id=block.program_id, occurrence_schedules=[ProgramDayOccurrenceSchedule(date=value)], name=f'Day {value}')
            for value in (today, future)
        ]
        db_session.add_all(days)
        db_session.flush()
        db_session.add_all([
            ProgramDayTemplate(
                program_day_id=day.id,
                session_template_id=sample_session_template.id,
                is_required=True,
                order=0,
            ) for day in days
        ])
        db_session.commit()
        url = f'/api/{sample_ultimate_goal.id}/programs/{program.id}/day-statuses'

        malformed = authed_client.patch(url, json={
            'dates': [f'{today.isoformat()}T12:00:00Z'],
            'status': 'complete',
            'timezone': 'UTC',
        })
        assert malformed.status_code == 400

        complete = authed_client.patch(url, json={
            'dates': [today.isoformat(), today.isoformat()],
            'status': 'complete',
            'timezone': 'UTC',
        })
        assert complete.status_code == 200
        assert complete.get_json()['updated_count'] == 1
        assert db_session.query(ProgramDayStatusOverride).filter_by(
            program_id=program.id, date=today, status='complete'
        ).count() == 1

        read_model = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/{program.id}/day-read-model'
            f'?range_start={today.isoformat()}&range_end={today.isoformat()}&timezone=UTC'
        ).get_json()['days'][0]
        assert read_model['automatic_state'] == 'scheduled_pending'
        assert read_model['state'] == 'scheduled_met'
        assert read_model['manual_status'] == 'complete'
        assert read_model['requirements_met'] is False
        options = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/day-options'
            f'?date={today.isoformat()}&timezone=UTC'
        ).get_json()
        assert next(row for row in options if row['day_id'] == days[0].id)['manual_status'] == 'complete'
        assert all('is_completed' not in row for row in options)

        rejected = authed_client.patch(url, json={
            'dates': [today.isoformat(), future.isoformat()],
            'status': 'complete',
            'timezone': 'UTC',
        })
        assert rejected.status_code == 400
        assert rejected.get_json()['code'] == 'ineligible_dates'
        assert db_session.query(ProgramDayStatusOverride).filter_by(
            program_id=program.id, date=future
        ).count() == 0

        outside = today + timedelta(days=8)
        block.end_date = outside
        days[1].date = outside
        db_session.commit()
        outside_response = authed_client.patch(url, json={
            'dates': [outside.isoformat()], 'status': 'rest', 'timezone': 'UTC',
        })
        assert outside_response.status_code == 400
        days[1].date = future
        db_session.commit()

        db_session.add(Session(
            owner_id=sample_ultimate_goal.owner_id,
            root_id=sample_ultimate_goal.id,
            name='Completed linked work',
            completed=True,
            template_id=sample_session_template.id,
            program_id=program.id,
            program_block_id=block.id,
            program_day_id=days[0].id,
            session_start=datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc),
        ))
        db_session.commit()
        needs_confirmation = authed_client.patch(url, json={
            'dates': [today.isoformat()], 'status': 'rest', 'timezone': 'UTC',
        })
        assert needs_confirmation.status_code == 409
        assert needs_confirmation.get_json()['code'] == 'completed_evidence_confirmation_required'
        assert authed_client.patch(url, json={
            'dates': [today.isoformat()],
            'status': 'rest',
            'timezone': 'UTC',
            'acknowledge_completed_evidence': True,
        }).status_code == 200
        metrics = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/{program.id}/metrics'
            f'?range_start={today.isoformat()}&range_end={today.isoformat()}&timezone=UTC'
        ).get_json()
        assert metrics['days'][0]['state'] == 'rest'
        assert metrics['days'][0]['requirements_met'] is True
        assert metrics['consistency']['denominator_days'] == 0
        assert metrics['consistency']['manual_rest_days'] == 1
        assert metrics['templates'][0]['completed_occurrences'] == 1
        options = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/programs/day-options'
            f'?date={today.isoformat()}&timezone=UTC'
        ).get_json()
        assert next(row for row in options if row['day_id'] == days[0].id)['manual_status'] == 'rest'

        assert authed_client.patch(url, json={
            'dates': [future.isoformat()], 'status': 'rest', 'timezone': 'UTC',
        }).status_code == 200
        days[1].date = future + timedelta(days=1)
        db_session.commit()
        assert authed_client.patch(url, json={
            'dates': [future.isoformat()], 'status': 'automatic', 'timezone': 'UTC',
        }).status_code == 200
        assert db_session.query(ProgramDayStatusOverride).filter_by(
            program_id=program.id, date=future
        ).count() == 0
        assert authed_client.patch(url, json={
            'dates': [today.isoformat()], 'status': 'automatic', 'timezone': 'UTC',
        }).status_code == 200
        assert db_session.query(ProgramDayStatusOverride).filter_by(
            program_id=program.id, date=today
        ).count() == 0

    def test_concurrent_day_status_upserts_keep_one_occurrence_row(
        self, db_session, sample_ultimate_goal, sample_program
    ):
        today = datetime.now(timezone.utc).date()
        program = db_session.query(Program).filter_by(id=sample_program['id']).one()
        program.start_date = datetime.combine(today, datetime.min.time())
        program.end_date = datetime.combine(today, datetime.max.time())
        block = db_session.query(ProgramBlock).filter_by(program_id=program.id).first()
        block.start_date = today
        block.end_date = today
        db_session.add(ProgramDay(program_id=block.program_id, occurrence_schedules=[ProgramDayOccurrenceSchedule(date=today)], name='Concurrent day'))
        db_session.commit()
        barrier = Barrier(2)

        def write_status(status):
            worker_session = get_session(get_engine())
            try:
                barrier.wait(timeout=10)
                return ProgramService.set_program_day_statuses(
                    worker_session, sample_ultimate_goal.id, program.id,
                    {'dates': [today], 'status': status, 'timezone': 'UTC'},
                    sample_ultimate_goal.owner_id,
                )
            finally:
                worker_session.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write_status, ('complete', 'rest')))
        assert {result['status'] for result in results} == {'complete', 'rest'}
        db_session.expire_all()
        rows = db_session.query(ProgramDayStatusOverride).filter_by(
            program_id=program.id, date=today,
        ).all()
        assert len(rows) == 1
        assert rows[0].status in {'complete', 'rest'}
    def test_get_specific_program(self, authed_client, sample_ultimate_goal, sample_program):
        """Test retrieving a specific program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == program_id
        assert data['name'] == sample_program['name']
        assert 'scope_seed_goal_ids' in data
        assert 'scope_goal_ids' in data

    def test_program_metrics_contract_and_validation(
        self, authed_client, sample_ultimate_goal, sample_program
    ):
        url = f'/api/{sample_ultimate_goal.id}/programs/{sample_program["id"]}/metrics'
        response = authed_client.get(f'{url}?timezone=UTC')
        assert response.status_code == 200
        payload = response.get_json()
        assert payload['calculation_version'] == 9
        assert payload['window']['timezone'] == 'UTC'
        assert payload['semantics'] == {
            'attribution': 'current_state',
            'data_layer': 'analytics_engine',
            'effort_allocation': 'equal_split',
            'execution_linkage': 'explicit',
        }
        assert authed_client.get(f'{url}?timezone=Not/AZone').status_code == 400
        assert authed_client.get(f'{url}?range_start=2026-01-01').status_code == 400
        first = sample_program['start_date'][:10]
        third = (date.fromisoformat(first) + timedelta(days=2)).isoformat()
        selected = authed_client.get(f'{url}?timezone=UTC&dates={third},{first}')
        assert selected.status_code == 200
        assert selected.get_json()['window']['dates'] == [first, third]
        assert selected.get_json()['window']['total_days'] == 2
        assert authed_client.get(f'{url}?timezone=UTC&dates={first}&range_start={first}').status_code == 400
        assert authed_client.get(f'{url}?timezone=UTC&dates={first},not-a-date').status_code == 400

    def test_narrowing_program_goals_requires_confirming_day_goal_removal(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        """Program goals bound program-day goals; narrowing them never silently drops a day's goals."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term = sample_goal_hierarchy['mid_term']
        long_term = sample_goal_hierarchy['long_term']
        day = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/days',
            json={'name': 'Focused', 'goal_ids': [long_term.id]},
        ).get_json()

        conflict = authed_client.put(f'/api/{root_id}/programs/{program_id}', json={'selectedGoals': [mid_term.id]})
        assert conflict.status_code == 409
        payload = conflict.get_json()
        assert payload['code'] == 'program_day_goal_out_of_scope'
        assert payload['conflicts'] == [{
            'kind': 'day', 'day_id': day['id'], 'name': 'Focused',
            'goal_id': long_term.id, 'goal_name': long_term.name,
        }]
        assert authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()['goal_ids'] == [root_id]

        confirmed = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term.id], 'prune_day_goals': True},
        )
        assert confirmed.status_code == 200
        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        assert program_data['goal_ids'] == [mid_term.id]
        assert program_data['days'][0]['goal_ids'] == []
        assert 'goal_ids' not in program_data['blocks'][0]

    def test_update_program(self, authed_client, sample_ultimate_goal, sample_program):
        """Test updating a program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        payload = {
            'name': 'Updated Program Name',
            'description': 'Updated description',
            'color': '#EF476F'
        }
        
        response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Program Name'
        assert data['description'] == 'Updated description'
        assert data['color'] == '#EF476F'

    def test_update_program_rejects_invalid_color(self, authed_client, sample_ultimate_goal, sample_program):
        """Test updating a program rejects malformed hex colors."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']

        response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            data=json.dumps({'color': '#12345'}),
            content_type='application/json'
        )

        assert response.status_code == 400

    def test_program_day_read_model_has_bounded_query_plan(
        self, db_session, test_user, sample_ultimate_goal, sample_program
    ):
        target = date.today()
        statements = []
        engine = db_session.get_bind()

        def capture_statement(_conn, _cursor, statement, _params, _context, _many):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", capture_statement)
        try:
            payload, error, status = ProgramDayReadModelService(db_session).get(
                sample_ultimate_goal.id,
                sample_program['id'],
                test_user.id,
                range_start=target.isoformat(),
                range_end=target.isoformat(),
                detail_date=target.isoformat(),
                timezone_name="UTC",
            )
        finally:
            event.remove(engine, "before_cursor_execute", capture_statement)

        assert (error, status) == (None, 200)
        assert payload["schema_version"] == 7
        assert len(statements) <= 40

    def test_delete_program(self, authed_client, db_session, sample_ultimate_goal, sample_program):
        """Test deleting a program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        db_session.add(ProgramDayStatusOverride(
            program_id=program_id,
            date=datetime.now(timezone.utc).date(),
            status='rest',
            set_by_user_id=sample_ultimate_goal.owner_id,
        ))
        db_session.commit()
        
        response = authed_client.delete(f'/api/{root_id}/programs/{program_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        assert response.status_code == 404
        assert db_session.query(ProgramDayStatusOverride).filter_by(
            program_id=program_id
        ).count() == 0

@pytest.mark.integration
class TestProgramStructure:
    """Test Program Blocks, Days, and Sessions."""

    def test_block_crud(self, authed_client, sample_ultimate_goal, sample_program):
        """Test creating, updating, and deleting a block via dedicated endpoints."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        _delete_sample_blocks(authed_client, root_id, program_id)
        
        # 1. Create a Block
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=7)
        
        create_payload = {
            'name': 'New Phase Block',
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'color': '#ff0000',
        }
        
        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks',
            data=json.dumps(create_payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        new_block = json.loads(response.data)
        assert new_block['name'] == 'New Phase Block'
        block_id = new_block['id']
        
        # 2. Update the Block
        update_payload = {
            'name': 'Updated Phase Block',
            'color': '#00ff00'
        }
        
        response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}',
            data=json.dumps(update_payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        updated_block = json.loads(response.data)
        assert updated_block['name'] == 'Updated Phase Block'
        assert updated_block['color'] == '#00ff00'
        
        # 3. Delete the Block
        response = authed_client.delete(f'/api/{root_id}/programs/{program_id}/blocks/{block_id}')
        assert response.status_code == 200
        delete_data = json.loads(response.data)
        assert delete_data['message'] == 'Block deleted'
        
        # Verify deletion via program fetch
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        assert not any(b['id'] == block_id for b in program_data['blocks'])

    def test_block_create_accepts_camel_case_dates_and_starts_empty(self, authed_client, sample_ultimate_goal, sample_program):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        _delete_sample_blocks(authed_client, root_id, program_id)

        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=6)

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks',
            json={
                'name': 'Dragged Block',
                'startDate': start_date.strftime('%Y-%m-%d'),
                'endDate': end_date.strftime('%Y-%m-%d'),
                'color': '#3366ff',
            }
        )

        assert response.status_code == 201
        block = response.get_json()
        assert block['start_date'] == start_date.strftime('%Y-%m-%d')
        assert block['end_date'] == end_date.strftime('%Y-%m-%d')
        assert 'days' not in block
        assert (block['track_weeks'], block['week_start_day']) == (False, None)

    def test_create_program_day_endpoint(self, authed_client, sample_ultimate_goal, sample_program, sample_session_template):
        """Program days belong to the program and are listed once at its top level."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        # Get the first block ID
        payload = {
            'name': 'Heavy Day',
            'day_of_week': [datetime.utcnow().strftime('%A')], # Current day
            'template_id': sample_session_template.id,
        }
        
        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/days',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        created = response.get_json()
        assert created['name'] == 'Heavy Day'
        assert created['program_id'] == program_id

        data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        assert all('days' not in block for block in data['blocks'])
        [day] = [entry for entry in data['days'] if entry['id'] == created['id']]
        assert [template['id'] for template in day['templates']] == [sample_session_template.id]

    def _reusable_day(self, authed_client, root_id, program_id, name):
        block = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()['blocks'][0]
        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/days',
            json={'name': name},
        )
        assert response.status_code == 201
        return block, response.get_json()['id']

    def _detail_occurrences(self, authed_client, root_id, program_id, day_value):
        payload = authed_client.get(
            f'/api/{root_id}/programs/{program_id}/day-read-model'
            f'?range_start={day_value}&range_end={day_value}&detail_date={day_value}&timezone=UTC'
        ).get_json()
        return payload['detail']['occurrences']

    def test_schedule_program_day_endpoint_creates_dated_occurrence(
        self, authed_client, db_session, sample_ultimate_goal, sample_program,
    ):
        """Scheduling adds an occurrence the canonical evaluator sees, never a placeholder session."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        block, day_id = self._reusable_day(authed_client, root_id, program_id, 'Schedule Me')
        scheduled_date = block['start_date']
        url = f'/api/{root_id}/programs/{program_id}/days/{day_id}/schedule'

        response = authed_client.post(url, json={'date': scheduled_date})

        assert response.status_code == 201
        assert response.get_json() | {'id': None} == {
            'id': None, 'program_day_id': day_id,
            'program_id': program_id, 'name': 'Schedule Me', 'date': scheduled_date,
        }
        assert db_session.query(Session).filter_by(root_id=root_id).count() == 0
        occurrences = self._detail_occurrences(authed_client, root_id, program_id, scheduled_date)
        assert [(row['program_day_id'], row['scheduled_explicitly']) for row in occurrences] == [(day_id, True)]
        program = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        scheduled_day = next(day for day in program['days'] if day['id'] == day_id)
        assert scheduled_day['scheduled_dates'] == [scheduled_date]

        duplicate = authed_client.post(url, json={'date': scheduled_date})
        assert duplicate.status_code == 400
        assert 'already occurs' in duplicate.get_json()['error']
        outside = authed_client.post(url, json={'date': '1999-01-01'})
        assert outside.status_code == 400
        assert outside.get_json()['code'] == 'program_day_date_outside_program'
        assert authed_client.post(url, json={}).status_code == 400
        assert authed_client.post(url, json={'date': '2026-9-1'}).status_code == 400

        next_date = (date.fromisoformat(scheduled_date) + timedelta(days=1)).isoformat()
        legacy = authed_client.post(url, json={'session_start': f'{next_date}T12:00:00Z'})
        assert legacy.status_code == 201
        assert legacy.get_json()['date'] == next_date

    def test_unschedule_program_day_occurrence_removes_schedule_and_legacy_placeholder(
        self, authed_client, db_session, test_user, sample_ultimate_goal, sample_program,
    ):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        block, day_id = self._reusable_day(authed_client, root_id, program_id, 'Recurring Day')
        scheduled_date = block['start_date']
        base = f'/api/{root_id}/programs/{program_id}/days/{day_id}'
        assert authed_client.post(f'{base}/schedule', json={'date': scheduled_date}).status_code == 201
        placeholder = Session(
            owner_id=test_user.id, root_id=root_id, name='Recurring Day', completed=False,
            program_id=program_id, program_day_id=day_id,
            session_start=datetime.combine(date.fromisoformat(scheduled_date), datetime.min.time(), tzinfo=timezone.utc)
            + timedelta(hours=12),
        )
        db_session.add(placeholder)
        db_session.commit()

        response = authed_client.post(f'{base}/unschedule', json={'date': scheduled_date, 'timezone': 'UTC'})

        assert response.status_code == 200
        payload = response.get_json()
        assert payload['removed_schedule_count'] == 1
        assert payload['removed_session_ids'] == [placeholder.id]
        assert self._detail_occurrences(authed_client, root_id, program_id, scheduled_date) == []

    def test_create_program_day_with_scheduled_dates_creates_explicit_occurrences(
        self, authed_client, sample_ultimate_goal, sample_program,
    ):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        block = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()['blocks'][0]
        first = block['start_date']
        second = (date.fromisoformat(first) + timedelta(days=2)).isoformat()

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/days',
            json={'name': 'Specific', 'day_of_week': [], 'scheduled_dates': [second, first, first]},
        )

        assert response.status_code == 201
        day = response.get_json()
        assert 'date' not in day
        assert sorted(day['scheduled_dates']) == [first, second]
        for value in (first, second):
            occurrences = self._detail_occurrences(authed_client, root_id, program_id, value)
            assert [(row['program_day_id'], row['scheduled_explicitly']) for row in occurrences] == [(day['id'], True)]

    def test_update_program_day_replaces_scheduled_dates_atomically(
        self, authed_client, db_session, sample_ultimate_goal, sample_program,
    ):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        block, day_id = self._reusable_day(authed_client, root_id, program_id, 'Replace Dates')
        start = date.fromisoformat(block['start_date'])
        kept, dropped, added = (start + timedelta(days=offset) for offset in (0, 1, 3))
        url = f'/api/{root_id}/programs/{program_id}/days/{day_id}'
        assert authed_client.put(url, json={'scheduled_dates': [kept.isoformat(), dropped.isoformat()]}).status_code == 200
        version_before = db_session.get(ProgramDay, day_id).row_version
        db_session.expire_all()

        response = authed_client.put(url, json={'scheduled_dates': [kept.isoformat(), added.isoformat()]})

        assert response.status_code == 200
        assert sorted(response.get_json()['scheduled_dates']) == [kept.isoformat(), added.isoformat()]
        assert self._detail_occurrences(authed_client, root_id, program_id, dropped.isoformat()) == []
        db_session.expire_all()
        assert db_session.get(ProgramDay, day_id).row_version > version_before

        outside = authed_client.put(url, json={'scheduled_dates': ['1999-01-01']})
        assert outside.status_code == 400
        assert outside.get_json()['code'] == 'program_day_date_outside_program'
        # A rejected save leaves the previous schedule untouched.
        refreshed = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        day = next(entry for entry in refreshed['days'] if entry['id'] == day_id)
        assert sorted(day['scheduled_dates']) == [kept.isoformat(), added.isoformat()]

        cleared = authed_client.put(url, json={'scheduled_dates': [], 'day_of_week': ['Monday']})
        assert cleared.status_code == 200
        assert cleared.get_json()['scheduled_dates'] == []
        assert cleared.get_json()['day_of_week'] == ['Monday']

    def test_unschedule_program_day_occurrence_emits_program_day_unscheduled(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy, monkeypatch):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id], 'prune_block_goals': True}
        )

        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block_id = program_data['blocks'][0]['id']
        scoped_deadline = (
            datetime.strptime(program_data['blocks'][0]['start_date'], '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')

        authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/goals',
            json={
                'goal_id': short_term_goal.id,
                'deadline': scoped_deadline,
            }
        )
        authed_client.post(
            f'/api/{root_id}/programs/{program_id}/days',
            json={'name': 'Recurring Day'}
        )

        refreshed_program = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block = next(entry for entry in refreshed_program['blocks'] if entry['id'] == block_id)
        day_id = next(day['id'] for day in refreshed_program['days'] if day.get('name') == 'Recurring Day')
        scheduled_date = block['start_date']

        schedule_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/days/{day_id}/schedule',
            json={'session_start': f'{scheduled_date}T12:00:00Z'}
        )
        assert schedule_response.status_code == 201

        emitted = []
        monkeypatch.setattr('services.events.event_bus.emit', lambda event: emitted.append(event))

        unschedule_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/days/{day_id}/unschedule',
            json={'date': scheduled_date, 'timezone': 'UTC'}
        )

        assert unschedule_response.status_code == 200
        assert Events.PROGRAM_DAY_UNSCHEDULED in [event.name for event in emitted]

    def test_set_goal_deadline_for_program_date_enforces_scope_and_returns_goal(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        update_response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id], 'prune_block_goals': True}
        )
        assert update_response.status_code == 200
        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        deadline_date = (
            datetime.strptime(program_data['start_date'][:10], '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/goal-deadlines',
            json={
                'goal_id': short_term_goal.id,
                'deadline': deadline_date,
            }
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload['id'] == short_term_goal.id
        assert payload['deadline'][:10] == deadline_date

    def test_set_goal_deadline_for_program_date_returns_structured_parent_deadline_error(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id], 'prune_block_goals': True}
        )
        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        start_date = datetime.strptime(program_data['start_date'][:10], '%Y-%m-%d')
        parent_deadline = (start_date + timedelta(days=4)).strftime('%Y-%m-%d')
        child_deadline = (start_date + timedelta(days=5)).strftime('%Y-%m-%d')
        authed_client.put(
            f'/api/{root_id}/goals/{mid_term_goal.id}',
            json={'deadline': parent_deadline}
        )

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/goal-deadlines',
            json={
                'goal_id': short_term_goal.id,
                'deadline': child_deadline,
            }
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload['error'] == 'Child deadline cannot be later than parent deadline'
        assert payload['parent_deadline'] == parent_deadline

    def test_duplicate_program_day_copies_its_definition_unscheduled(self, authed_client, sample_ultimate_goal, sample_program, sample_session_template):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        source = authed_client.post(f'/api/{root_id}/programs/{program_id}/days', json={
            'name': 'Copy Me', 'day_of_week': ['Friday'], 'template_ids': [sample_session_template.id],
        }).get_json()

        response = authed_client.post(f'/api/{root_id}/programs/{program_id}/days/{source["id"]}/duplicate')

        assert response.status_code == 201
        copy = response.get_json()
        assert copy['name'] == 'Copy Me (copy)'
        assert (copy['day_of_week'], copy['scheduled_dates']) == ([], [])
        assert [template['id'] for template in copy['templates']] == [sample_session_template.id]
        missing = authed_client.post(f'/api/{root_id}/programs/{program_id}/days/not-a-day/duplicate')
        assert missing.status_code == 404

    def test_block_week_tracking_round_trips_through_the_api(self, authed_client, sample_ultimate_goal, sample_program):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        block = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()['blocks'][0]
        url = f'/api/{root_id}/programs/{program_id}/blocks/{block["id"]}'

        missing_day = authed_client.post(f'/api/{root_id}/programs/{program_id}/blocks', json={
            'name': 'Untracked', 'track_weeks': True,
        })
        assert missing_day.status_code == 400
        assert authed_client.put(url, json={'week_start_day': 7}).status_code == 400

        updated = authed_client.put(url, json={'track_weeks': True, 'week_start_day': 6})

        assert updated.status_code == 200
        assert (updated.get_json()['track_weeks'], updated.get_json()['week_start_day']) == (True, 6)


class TestProgramCalendarInvariantsApi:
    def test_overlapping_block_returns_structured_409(self, authed_client, sample_ultimate_goal, sample_program):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']

        response = authed_client.post(f'/api/{root_id}/programs/{program_id}/blocks', json={
            'name': 'Overlap',
            'start_date': datetime.utcnow().strftime('%Y-%m-%d'),
            'end_date': (datetime.utcnow() + timedelta(days=2)).strftime('%Y-%m-%d'),
        })

        assert response.status_code == 409
        payload = response.get_json()
        assert payload['code'] == 'program_block_overlap'
        assert payload['conflicts'][0]['name'] == 'Week 1'

    def test_block_with_reversed_dates_is_a_validation_error(self, authed_client, sample_ultimate_goal, sample_program):
        root_id = sample_ultimate_goal.id
        response = authed_client.post(f'/api/{root_id}/programs/{sample_program["id"]}/blocks', json={
            'name': 'Backwards',
            'start_date': (datetime.utcnow() + timedelta(days=3)).strftime('%Y-%m-%d'),
            'end_date': datetime.utcnow().strftime('%Y-%m-%d'),
        })

        assert response.status_code == 400

    def test_double_booked_date_returns_structured_409(self, authed_client, sample_ultimate_goal, sample_program):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        weekday = datetime.utcnow().strftime('%A')
        days_url = f'/api/{root_id}/programs/{program_id}/days'
        assert authed_client.post(days_url, json={'name': 'First', 'day_of_week': [weekday]}).status_code == 201

        response = authed_client.post(days_url, json={'name': 'Second', 'day_of_week': [weekday]})

        assert response.status_code == 409
        payload = response.get_json()
        assert payload['code'] == 'program_day_date_conflict'
        assert {row['day_name'] for row in payload['conflicts']} >= {'First', 'Second'}
