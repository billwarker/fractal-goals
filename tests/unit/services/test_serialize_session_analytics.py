"""The analytics session payload's template and program-day fields (Analytics scope filters)."""

import json

from models import Program, ProgramDay, Session, SessionTemplate
from services._serialize_sessions import serialize_session_for_analytics


def test_carries_the_template_colour_and_the_program_day_s_program():
    program = Program(id='program-1', name='Q4', color='#f97316')
    day = ProgramDay(id='day-1', name='Upper Body Day 2', program_id=program.id, program=program)
    template = SessionTemplate(id='tpl-1', name='Upper Body - Heavy', template_data={'template_color': '#ef4444'})
    session = Session(
        id='session-1', name='Monday', template_id=template.id, template=template,
        program_day_id=day.id, program_day=day, attributes=json.dumps({}),
    )
    payload = serialize_session_for_analytics(session)
    assert (payload['template_id'], payload['template_name'], payload['template_color']) == ('tpl-1', 'Upper Body - Heavy', '#ef4444')
    assert (payload['program_day_id'], payload['program_day_name']) == ('day-1', 'Upper Body Day 2')
    assert (payload['program_id'], payload['program_name'], payload['program_color']) == ('program-1', 'Q4', '#f97316')


def test_sessions_without_a_template_or_program_day_leave_them_empty():
    payload = serialize_session_for_analytics(Session(id='session-2', name='Ad hoc', attributes=json.dumps({})))
    assert payload['template_color'] is None
    assert (payload['program_day_id'], payload['program_id'], payload['program_name'], payload['program_color']) == (None, None, None, None)
