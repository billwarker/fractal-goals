"""Calendar time grains for chart buckets: which grain a span gets and where its buckets start.

Mirrored by `client/src/utils/chartGrain.js`; both are checked against
`tests/fixtures/chart_grain_cases.json`.
"""
from datetime import date, timedelta

GRAINS = ('day', 'week', 'month')
AUTO = 'auto'
AUTO_DAY_MAX_SPAN_DAYS = 45
AUTO_WEEK_MAX_SPAN_DAYS = 400


def bucket_start(day: date, grain: str) -> date:
    """The first day of the bucket holding `day` (weeks start on Monday)."""
    if grain == 'week':
        return day - timedelta(days=day.weekday())
    if grain == 'month':
        return day.replace(day=1)
    return day


def bucket_count(first: date, last: date, grain: str) -> int:
    """How many buckets of `grain` the inclusive span first..last touches."""
    start, end = bucket_start(first, grain), bucket_start(last, grain)
    if grain == 'week':
        return (end - start).days // 7 + 1
    if grain == 'month':
        return (end.year - start.year) * 12 + end.month - start.month + 1
    return (end - start).days + 1


def resolve_grain(requested: str | None, first: date, last: date, point_budget: int) -> str:
    """The requested grain (or the auto choice for the span), coarsened until it fits the budget."""
    if requested in GRAINS:
        grain = requested
    else:
        span_days = (last - first).days
        grain = ('day' if span_days <= AUTO_DAY_MAX_SPAN_DAYS
                 else 'week' if span_days <= AUTO_WEEK_MAX_SPAN_DAYS else 'month')
    index = GRAINS.index(grain)
    while index < len(GRAINS) - 1 and bucket_count(first, last, GRAINS[index]) > point_budget:
        index += 1
    return GRAINS[index]
