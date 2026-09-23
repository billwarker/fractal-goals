from datetime import date, datetime, timedelta, timezone
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


def test_manual_statuses_override_effective_state_without_fabricating_evidence():
    zone = ZoneInfo("UTC")
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    complete = build_day_facts(
        program, day_value, day_value, [], [], zone, date(2026, 9, 2),
        status_overrides=[SimpleNamespace(date=day_value, status="complete")],
    )[0]
    assert complete["automatic_state"] == "scheduled_missed"
    assert complete["state"] == "scheduled_met"
    assert complete["status_source"] == "manual"
    assert complete["requirements_met"] is False
    assert complete["completed_template_count"] == 0
    assert complete["counts_as_success"] is True

    rest = build_day_facts(
        program, day_value, day_value,
        [completed_session("a", day_value)], [], zone, date(2026, 9, 2),
        status_overrides=[SimpleNamespace(date=day_value, status="rest")],
    )[0]
    assert rest["automatic_state"] == "scheduled_met"
    assert rest["state"] == "rest"
    assert rest["requirements_met"] is True
    assert rest["counts_as_success"] is False
    assert rest["counts_toward_adherence"] is False
    assert rest["breaks_chain"] is False


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


def credit_session(identifier, template_id, day_value, *, program_id=None, program_day_id=None, completed=True):
    return SimpleNamespace(
        id=identifier, template_id=template_id, program_id=program_id,
        program_day_id=program_day_id, completed=completed, deleted_at=None,
        session_start=datetime.combine(day_value, datetime.min.time(), tzinfo=timezone.utc),
        completed_at=None, created_at=None,
    )


def stored_credit(session_id, day_value, disposition, template_id=None):
    return SimpleNamespace(
        session_id=session_id, date=day_value, disposition=disposition, template_id=template_id,
    )


def facts_for(program, day_value, sessions, credits=()):
    return build_day_facts(
        program, day_value, day_value, sessions, [], ZoneInfo("UTC"), day_value + timedelta(days=1),
        session_credits=list(credits),
    )[0]


def test_unlinked_session_with_a_scheduled_template_is_template_matched():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    fact = facts_for(program, day_value, [credit_session("s1", "a", day_value)])

    assert fact["state"] == "scheduled_met"
    assert fact["session_credits"]["s1"]["source"] == "template_match"
    assert fact["occurrences"][0]["credits"][0]["source"] == "template_match"


def test_session_linked_to_another_program_is_never_auto_credited():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    fact = facts_for(program, day_value, [
        credit_session("s1", "a", day_value, program_id="other-program"),
    ])

    assert fact["state"] == "scheduled_missed"
    assert "s1" not in fact["session_credits"]


def test_same_program_session_linked_to_another_day_matches_by_template():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    fact = facts_for(program, day_value, [
        credit_session("s1", "a", day_value, program_id="program-1", program_day_id="tuesday"),
    ])

    assert fact["requirements_met"] is True
    assert fact["session_credits"]["s1"]["source"] == "template_match"


def test_exact_link_wins_over_template_match():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    fact = facts_for(program, day_value, [
        credit_session("s1", "a", day_value, program_id="program-1", program_day_id="day-1"),
    ])

    assert fact["session_credits"]["s1"]["source"] == "linked"


def test_manual_credit_counts_a_substitute_template():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])
    session = credit_session("s1", "unrelated", day_value)

    automatic = facts_for(program, day_value, [session])
    manual = facts_for(program, day_value, [session], [stored_credit("s1", day_value, "credit", "a")])

    assert automatic["state"] == "scheduled_missed"
    assert manual["state"] == "scheduled_met"
    assert manual["session_credits"]["s1"] | {"program_day_ids": None} == {
        "source": "manual", "template_id": "a", "program_day_ids": None,
        "excluded": False, "stored_disposition": "credit",
    }


def test_manual_credit_for_an_unscheduled_template_is_dormant():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    fact = facts_for(
        program, day_value, [credit_session("s1", "a", day_value)],
        [stored_credit("s1", day_value, "credit", "removed-template")],
    )

    assert fact["session_credits"]["s1"]["source"] == "template_match"
    assert fact["requirements_met"] is True


def test_exclusion_removes_automatic_credit_but_keeps_the_fact():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    fact = facts_for(
        program, day_value, [credit_session("s1", "a", day_value)],
        [stored_credit("s1", day_value, "exclude")],
    )

    assert fact["state"] == "scheduled_missed"
    assert fact["occurrences"][0]["credits"] == []
    assert fact["session_credits"]["s1"]["excluded"] is True


def test_credits_on_another_local_date_are_dormant():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])
    late_session = credit_session("s1", "unrelated", day_value)
    late_session.session_start = datetime(2026, 9, 2, 1, tzinfo=timezone.utc)

    fact = build_day_facts(
        program, day_value, day_value, [late_session], [], ZoneInfo("America/Toronto"), date(2026, 9, 3),
        session_credits=[stored_credit("s1", date(2026, 9, 2), "credit", "a")],
    )[0]

    # 01:00 UTC on Sep 2 is Sep 1 in Toronto; the Sep 2 credit row does not apply.
    assert fact["session_credits"] == {}
    assert fact["state"] == "scheduled_missed"


def test_incomplete_template_match_is_attributed_but_never_completes_the_day():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(day_value, [template_rule("a")])

    fact = facts_for(program, day_value, [credit_session("s1", "a", day_value, completed=False)])

    assert fact["occurrences"][0]["credits"][0]["source"] == "template_match"
    assert fact["requirements_met"] is False


def test_duplicate_template_sessions_count_once_toward_the_minimum():
    day_value = date(2026, 9, 1)
    program, _day = scheduled_program(
        day_value, [template_rule("a"), template_rule("b", required=False)], minimum=2,
    )

    one_template = facts_for(program, day_value, [
        credit_session("s1", "a", day_value), credit_session("s2", "a", day_value),
    ])
    two_templates = facts_for(program, day_value, [
        credit_session("s1", "a", day_value), credit_session("s2", "b", day_value),
    ])

    assert (one_template["completed_template_count"], one_template["requirements_met"]) == (1, False)
    assert (two_templates["completed_template_count"], two_templates["requirements_met"]) == (2, True)


def period(identifier, start, end, *, protects=True, deleted=False):
    return {
        "id": identifier, "start_date": start, "end_date": end,
        "protects_streaks": protects, "deleted_at": "gone" if deleted else None,
    }


def range_program(start, end, rules):
    """A block covering start..end with one definition recurring every day."""
    day = SimpleNamespace(
        id="day-1", date=None, day_of_week=[
            "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
        ], template_links=rules, templates=[rule.template for rule in rules],
        completion_min_templates=None, occurrence_schedules=[],
    )
    block = SimpleNamespace(id="block-1", start_date=start, end_date=end, days=[day])
    return SimpleNamespace(id="program-1", blocks=[block])


def period_facts(program, start, end, sessions=(), *, periods=(), overrides=(), today):
    return build_day_facts(
        program, start, end, list(sessions), [], ZoneInfo("UTC"), today,
        status_overrides=list(overrides), periods=list(periods),
    )


def test_protecting_period_turns_unmet_days_into_rest_but_keeps_met_days():
    start, end = date(2026, 9, 1), date(2026, 9, 5)
    program = range_program(start, end, [template_rule("a")])
    facts = period_facts(
        program, start, end,
        [credit_session("met", "a", date(2026, 9, 3), program_id="program-1", program_day_id="day-1")],
        periods=[period("vacation", date(2026, 9, 2), date(2026, 9, 4))],
        today=date(2026, 9, 10),
    )
    by_date = {fact["date"]: fact for fact in facts}

    # Boundaries: the days just outside the period are unaffected.
    assert by_date[date(2026, 9, 1)]["state"] == "scheduled_missed"
    assert by_date[date(2026, 9, 5)]["state"] == "scheduled_missed"
    assert (by_date[date(2026, 9, 2)]["state"], by_date[date(2026, 9, 2)]["status_source"]) == ("rest", "period")
    assert by_date[date(2026, 9, 2)]["period_id"] == "vacation"
    assert by_date[date(2026, 9, 2)]["counts_toward_adherence"] is False
    assert by_date[date(2026, 9, 2)]["breaks_chain"] is False
    assert by_date[date(2026, 9, 4)]["state"] == "rest"
    met = by_date[date(2026, 9, 3)]
    assert (met["state"], met["status_source"], met["counts_as_success"]) == ("scheduled_met", "automatic", True)
    assert met["period_ids"] == ["vacation"]
    assert by_date[date(2026, 9, 1)]["period_ids"] == []


def test_period_rest_bridges_the_chain_without_extending_it():
    start, end = date(2026, 9, 1), date(2026, 9, 4)
    program = range_program(start, end, [template_rule("a")])
    sessions = [
        credit_session(f"s{day}", "a", date(2026, 9, day), program_id="program-1", program_day_id="day-1")
        for day in (1, 4)
    ]
    facts = period_facts(
        program, start, end, sessions,
        periods=[period("trip", date(2026, 9, 2), date(2026, 9, 3))],
        today=date(2026, 9, 10),
    )

    assert [fact["run_length_at_date"] for fact in facts] == [1, 1, 1, 2]
    assert summarize_chain_facts(facts)["chain_breaks"] == 0


def test_partial_day_inside_period_is_rest():
    day_value = date(2026, 9, 2)
    program = range_program(day_value, day_value, [template_rule("a"), template_rule("b")])
    fact = period_facts(
        program, day_value, day_value,
        [credit_session("s1", "a", day_value, program_id="program-1", program_day_id="day-1")],
        periods=[period("trip", day_value, day_value)], today=date(2026, 9, 10),
    )[0]

    assert (fact["automatic_state"], fact["state"]) == ("scheduled_partial", "rest")


def test_manual_override_beats_period_and_unprotected_or_deleted_periods_do_nothing():
    day_value = date(2026, 9, 2)
    program = range_program(day_value, day_value, [template_rule("a")])
    override = SimpleNamespace(date=day_value, status="complete")

    manual = period_facts(
        program, day_value, day_value, periods=[period("trip", day_value, day_value)],
        overrides=[override], today=date(2026, 9, 10),
    )[0]
    informational = period_facts(
        program, day_value, day_value, periods=[period("note", day_value, day_value, protects=False)],
        today=date(2026, 9, 10),
    )[0]
    deleted = period_facts(
        program, day_value, day_value, periods=[period("old", day_value, day_value, deleted=True)],
        today=date(2026, 9, 10),
    )[0]

    assert (manual["state"], manual["status_source"]) == ("scheduled_met", "manual")
    assert (informational["state"], informational["period_ids"]) == ("scheduled_missed", ["note"])
    assert (deleted["state"], deleted["period_ids"]) == ("scheduled_missed", [])


def test_future_protected_dates_are_planned_rest_and_unscheduled_dates_keep_their_state():
    start, end = date(2026, 9, 1), date(2026, 9, 3)
    program = range_program(date(2026, 9, 2), date(2026, 9, 2), [template_rule("a")])
    facts = period_facts(
        program, start, end, periods=[period("trip", start, end)], today=date(2026, 8, 30),
    )

    assert [(fact["state"], fact["status_source"]) for fact in facts] == [
        ("upcoming", "automatic"), ("rest", "period"), ("upcoming", "automatic"),
    ]
    assert all(fact["period_ids"] == ["trip"] for fact in facts)


def test_overlapping_periods_union_coverage_and_explicit_schedules_create_occurrences():
    start, end = date(2026, 9, 1), date(2026, 9, 4)
    rules = [template_rule("a")]
    day = SimpleNamespace(
        id="day-1", date=None, day_of_week=[], template_links=rules,
        templates=[rule.template for rule in rules], completion_min_templates=None,
        occurrence_schedules=[SimpleNamespace(date=date(2026, 9, 3))],
    )
    program = SimpleNamespace(id="program-1", blocks=[
        SimpleNamespace(id="block-1", start_date=start, end_date=end, days=[day]),
    ])
    facts = period_facts(
        program, start, end,
        periods=[period("a", start, date(2026, 9, 2)), period("b", date(2026, 9, 2), end)],
        today=date(2026, 9, 10),
    )

    assert [fact["period_ids"] for fact in facts] == [["a"], ["a", "b"], ["b"], ["b"]]
    assert [fact["scheduled"] for fact in facts] == [False, False, True, False]
    assert facts[2]["state"] == "rest"
