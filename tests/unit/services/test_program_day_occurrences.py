from datetime import date, datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from services.program_day_occurrences import (
    apply_chain_facts,
    build_day_facts,
    effective_session_date,
    evaluate_occurrence,
    summarize_chain_facts,
)


def template_rule(template_id, *, required=True, order=0):
    template = SimpleNamespace(id=template_id, deleted_at=None)
    return SimpleNamespace(
        session_template_id=template_id,
        is_required=required,
        order=order,
        template=template,
    )


def scheduled_program(day_value, rules, *, minimum=None):
    day = SimpleNamespace(
        id="day-1", date=day_value, day_of_week=[], template_links=rules,
        templates=[rule.template for rule in rules], completion_min_templates=minimum,
    )
    block = SimpleNamespace(
        id="block-1", start_date=day_value, end_date=day_value, days=[day],
    )
    return SimpleNamespace(id="program-1", blocks=[block]), day


def completed_session(template_id, day_value, *, program_day_id="day-1"):
    return SimpleNamespace(
        id=f"session-{template_id}", template_id=template_id,
        program_day_id=program_day_id, completed=True, deleted_at=None,
        session_start=datetime.combine(day_value, datetime.min.time(), tzinfo=timezone.utc),
        completed_at=None, created_at=None,
    )


def test_evaluator_requires_required_templates_and_minimum():
    program, day = scheduled_program(
        date(2026, 9, 1),
        [template_rule("required"), template_rule("optional", required=False)],
        minimum=2,
    )
    assert evaluate_occurrence(day, [completed_session("required", date(2026, 9, 1))])["requirements_met"] is False
    assert evaluate_occurrence(day, [
        completed_session("required", date(2026, 9, 1)),
        completed_session("optional", date(2026, 9, 1)),
    ])["requirements_met"] is True
    assert program.id == "program-1"


def test_evaluator_ignores_completed_templates_not_configured_for_occurrence():
    _program, day = scheduled_program(
        date(2026, 9, 1),
        [template_rule("required"), template_rule("optional", required=False)],
        minimum=2,
    )

    evaluation = evaluate_occurrence(day, [
        completed_session("required", date(2026, 9, 1)),
        completed_session("unrelated", date(2026, 9, 1)),
    ])

    assert evaluation["completed_template_ids"] == ["required"]
    assert evaluation["requirements_met"] is False


def test_today_is_pending_and_closed_partial_breaks_chain():
    zone = ZoneInfo("UTC")
    program, _day = scheduled_program(date(2026, 9, 1), [template_rule("a"), template_rule("b")])
    pending = build_day_facts(program, date(2026, 9, 1), date(2026, 9, 1), [], [], zone, date(2026, 9, 1))[0]
    assert (pending["state"], pending["breaks_chain"]) == ("scheduled_pending", False)

    partial = build_day_facts(
        program, date(2026, 9, 1), date(2026, 9, 1),
        [completed_session("a", date(2026, 9, 1))], [], zone, date(2026, 9, 2),
    )[0]
    assert (partial["state"], partial["breaks_chain"]) == ("scheduled_partial", True)


def test_date_is_met_only_when_every_scheduled_occurrence_is_met():
    zone = ZoneInfo("UTC")
    day_value = date(2026, 9, 1)
    program, first = scheduled_program(day_value, [template_rule("a")])
    second = SimpleNamespace(
        id="day-2", date=day_value, day_of_week=[],
        template_links=[template_rule("b")], templates=[], completion_min_templates=None,
    )
    program.blocks[0].days.append(second)

    partial = build_day_facts(
        program, day_value, day_value,
        [completed_session("a", day_value, program_day_id=first.id)],
        [], zone, date(2026, 9, 2),
    )[0]
    assert partial["state"] == "scheduled_partial"

    met = build_day_facts(
        program, day_value, day_value,
        [
            completed_session("a", day_value, program_day_id=first.id),
            completed_session("b", day_value, program_day_id=second.id),
        ],
        [], zone, date(2026, 9, 2),
    )[0]
    assert met["state"] == "scheduled_met"


def test_overlapping_occurrences_use_one_deduplicated_day_threshold():
    zone = ZoneInfo("UTC")
    day_value = date(2026, 9, 1)
    program, first = scheduled_program(
        day_value,
        [template_rule("a", required=False), template_rule("b", required=False)],
        minimum=2,
    )
    second = SimpleNamespace(
        id="day-2",
        date=day_value,
        day_of_week=[],
        template_links=[
            template_rule("b", required=False),
            template_rule("c", required=False),
        ],
        templates=[],
        completion_min_templates=2,
    )
    program.blocks[0].days.append(second)

    fact = build_day_facts(
        program,
        day_value,
        day_value,
        [
            completed_session("a", day_value, program_day_id=first.id),
            completed_session("b", day_value, program_day_id=second.id),
        ],
        [],
        zone,
        date(2026, 9, 2),
    )[0]

    assert fact["state"] == "scheduled_met"
    assert fact["completed_template_count"] == 2
    assert fact["scheduled_template_count"] == 3
    assert fact["completion_min_templates"] == 2


def test_sessions_are_bucketed_by_occurrence_date_not_name():
    zone = ZoneInfo("UTC")
    program, _day = scheduled_program(date(2026, 9, 1), [template_rule("a")])
    wrong_day = completed_session("a", date(2026, 9, 2))
    fact = build_day_facts(
        program, date(2026, 9, 1), date(2026, 9, 1),
        [wrong_day], [], zone, date(2026, 9, 2),
    )[0]
    assert fact["state"] == "scheduled_missed"


def test_effective_session_date_respects_iana_timezone_and_dst_boundaries():
    spring = SimpleNamespace(
        session_start=datetime(2026, 3, 8, 4, 30, tzinfo=timezone.utc),
        completed_at=None, created_at=None,
    )
    fall = SimpleNamespace(
        session_start=datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc),
        completed_at=None, created_at=None,
    )

    assert effective_session_date(spring, ZoneInfo("America/Toronto")) == date(2026, 3, 7)
    assert effective_session_date(spring, ZoneInfo("Europe/London")) == date(2026, 3, 8)
    assert effective_session_date(fall, ZoneInfo("America/Toronto")) == date(2026, 11, 1)


def test_rest_bridges_between_met_dates_without_incrementing_run():
    zone = ZoneInfo("UTC")
    first_program, first_day = scheduled_program(date(2026, 9, 1), [template_rule("a")])
    second_day = SimpleNamespace(
        id="day-2", date=date(2026, 9, 3), day_of_week=[],
        template_links=[template_rule("a")], templates=[], completion_min_templates=None,
    )
    first_program.blocks[0].end_date = date(2026, 9, 3)
    first_program.blocks[0].days.append(second_day)
    sessions = [
        completed_session("a", date(2026, 9, 1), program_day_id=first_day.id),
        completed_session("a", date(2026, 9, 3), program_day_id=second_day.id),
    ]
    facts = build_day_facts(
        first_program, date(2026, 9, 1), date(2026, 9, 3),
        sessions, [], zone, date(2026, 9, 4),
    )
    assert [item["state"] for item in facts] == ["scheduled_met", "rest", "scheduled_met"]
    assert facts[1]["chain_role"] == "bridge"
    assert facts[2]["run_length_at_date"] == 2


@pytest.mark.parametrize(
    ("length", "expected"),
    [
        (1, ["single"]),
        (2, ["start", "end"]),
        (3, ["start", "member", "end"]),
        (4, ["start", "member", "member", "end"]),
        (5, ["start", "member", "member", "member", "end"]),
    ],
)
def test_chain_roles_are_stable_for_consecutive_success_runs(length, expected):
    facts = [
        {"state": "scheduled_met", "counts_as_success": True, "breaks_chain": False}
        for _index in range(length)
    ]

    assert apply_chain_facts(facts) is None
    stats = summarize_chain_facts(facts)

    assert [fact["chain_role"] for fact in facts] == expected
    assert stats == {
        "current_streak": length,
        "longest_streak": length,
        "chain_breaks": 0,
    }


@pytest.mark.parametrize(
    ("states", "expected_roles", "expected_summary"),
    [
        (
            ["scheduled_met", "rest", "scheduled_met"],
            ["start", "bridge", "end"],
            {"current_streak": 2, "longest_streak": 2, "chain_breaks": 0},
        ),
        (
            ["scheduled_met", "rest", "scheduled_missed", "scheduled_met"],
            ["single", "none", "none", "single"],
            {"current_streak": 1, "longest_streak": 1, "chain_breaks": 1},
        ),
        (
            ["scheduled_met", "scheduled_missed", "scheduled_missed"],
            ["single", "none", "none"],
            {"current_streak": 0, "longest_streak": 1, "chain_breaks": 1},
        ),
    ],
)
def test_chain_roles_cover_bridges_breaks_and_restarts(states, expected_roles, expected_summary):
    facts = [
        {
            "state": state,
            "counts_as_success": state == "scheduled_met",
            "breaks_chain": state == "scheduled_missed",
        }
        for state in states
    ]

    apply_chain_facts(facts)

    assert [fact["chain_role"] for fact in facts] == expected_roles
    assert summarize_chain_facts(facts) == expected_summary


def test_chain_roles_and_breaks_use_one_canonical_definition():
    facts = [
        {"state": "scheduled_met", "counts_as_success": True, "breaks_chain": False},
        {"state": "rest", "counts_as_success": False, "breaks_chain": False},
        {"state": "scheduled_met", "counts_as_success": True, "breaks_chain": False},
        {"state": "scheduled_missed", "counts_as_success": False, "breaks_chain": True},
        {"state": "scheduled_missed", "counts_as_success": False, "breaks_chain": True},
    ]

    apply_chain_facts(facts)
    stats = summarize_chain_facts(facts)

    assert [fact["chain_role"] for fact in facts] == ["start", "bridge", "end", "none", "none"]
    assert [fact["broke_active_chain"] for fact in facts] == [False, False, False, True, False]
    assert stats == {"current_streak": 0, "longest_streak": 2, "chain_breaks": 1}
