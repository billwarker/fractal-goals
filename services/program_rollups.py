"""Pure per-date rollups for programs, blocks, weeks, and program days.

Consistency is met scheduled program days over observed scheduled program days
(rest and event-protected days excluded; a manual Complete counts as met). Each
scheduled date also carries the calendar's status symbol, which drives status
counts and streaks.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

DAYS_PER_WEEK = 7


def _rate(numerator, denominator):
    return round(numerator / denominator, 6) if denominator else None


@dataclass(frozen=True)
class BlockWeek:
    index: int
    start: date
    end: date

    @property
    def partial(self) -> bool:
        return (self.end - self.start).days + 1 < DAYS_PER_WEEK

    def contains(self, value: date) -> bool:
        return self.start <= value <= self.end


def block_weeks(start: date | None, end: date | None, week_start_day: int | None = None) -> list[BlockWeek]:
    """A block's weeks, mirrored by ``blockWeeks`` (client/src/utils/programBlockWeeks.js).

    Week 1 starts on ``start``. Every later week starts on ``week_start_day``
    (Python weekday, 0 = Monday), so Week 1 may be partial; the last week is
    clipped to ``end``. ``None`` anchors weeks on ``start``'s own weekday, which
    is plain 7-day stepping from the start date.
    """
    if start is None or end is None or end < start:
        return []
    anchor = start.weekday() if week_start_day is None else week_start_day
    first_boundary = start + timedelta(days=(anchor - start.weekday()) % DAYS_PER_WEEK or DAYS_PER_WEEK)
    weeks = [BlockWeek(1, start, min(first_boundary - timedelta(days=1), end))]
    cursor, index = first_boundary, 2
    while cursor <= end:
        weeks.append(BlockWeek(index, cursor, min(cursor + timedelta(days=DAYS_PER_WEEK - 1), end)))
        cursor += timedelta(days=DAYS_PER_WEEK)
        index += 1
    return weeks


def tracked_week_start_day(block) -> int | None:
    """The weekday a block's weeks start on, or None (start-date stepping) when untracked."""
    if not getattr(block, "track_weeks", False):
        return None
    return getattr(block, "week_start_day", None)


def date_status(fact) -> str:
    """The program-day status symbol for a date, as the calendar shows it.

    Mirrors ``getProgramDayStatusSymbol`` (client/src/utils/programDayState.js):
    a manual status wins, then a met date is complete, a rest date is rest, and
    anything else is missed once the date has closed or scheduled before then.
    """
    manual = fact.get("manual_status")
    if manual == "complete" or (manual is None and fact["state"] == "scheduled_met"):
        return "complete"
    if manual == "rest" or fact["state"] == "rest":
        return "rest"
    return "missed" if fact["closed"] else "scheduled"


@dataclass(frozen=True)
class DateRecord:
    """One scheduled date: its block and program days, whether it counts, and its status."""
    date: date
    block_id: str | None
    program_day_ids: tuple[str, ...]
    counts: bool
    met: bool
    status: str


def build_date_records(day_facts) -> list[DateRecord]:
    """Evaluate every scheduled date in ``day_facts`` (from ``build_day_facts``)."""
    records = []
    for fact in day_facts:
        occurrences = fact["occurrences"]
        if not fact["scheduled"] or not occurrences:
            continue
        met = bool(fact["counts_as_success"])
        records.append(DateRecord(
            date=fact["date"],
            block_id=str(occurrences[0]["block"].id) if occurrences[0]["block"] is not None else None,
            program_day_ids=tuple(dict.fromkeys(str(row["program_day"].id) for row in occurrences)),
            counts=bool(fact["counts_toward_adherence"] and (fact["closed"] or met)),
            met=met,
            status=date_status(fact),
        ))
    return records


def consistency_rollup(records: Iterable[DateRecord]) -> dict:
    eligible = [record for record in records if record.counts]
    met_days = sum(record.met for record in eligible)
    return {
        "met_days": met_days,
        "scheduled_days_observed": len(eligible),
        "rate": _rate(met_days, len(eligible)),
    }


def status_counts(records: Iterable[DateRecord]) -> dict:
    """Scheduled dates by status symbol, plus the total scheduled.

    ``pending`` counts dates not yet due; ``scheduled`` counts every scheduled date,
    whatever its status, so complete + missed + rest + pending == scheduled.
    """
    counts = {"complete": 0, "missed": 0, "rest": 0, "pending": 0, "scheduled": 0}
    for record in records:
        counts["pending" if record.status == "scheduled" else record.status] += 1
        counts["scheduled"] += 1
    return counts


def longest_streak(records: Iterable[DateRecord]) -> int:
    """The longest run of completed dates. Rest and not-yet-due dates bridge a run; a missed date ends it."""
    longest = running = 0
    for record in sorted(records, key=lambda item: item.date):
        if record.status == "complete":
            running += 1
            longest = max(longest, running)
        elif record.status == "missed":
            running = 0
    return longest
