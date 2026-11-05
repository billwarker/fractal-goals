"""Time Spent Per Goal as series that can be stacked honestly.

A goal's analytics evidence is whatever is linked to it: sessions linked by hand to that goal
(usually a deep goal), plus activity instances linked to it or to a descendant. So a goal's own
total is neither "direct" nor "including sub-goals", and per-goal totals can't be rolled up
without double counting or losing time.

The roll-up therefore works on the evidence itself. Each goal maps to one series: the topmost
goal at or below the chosen level on its branch (or, when drilled into a goal, the child it sits
under), and a goal above the level maps to its own "· other" series. Each session (or activity
instance) then counts once per series, and an item already shown in a sub-goal series is left out
of every "· other" series. Siblings that share a session still each count it.
"""
from sqlalchemy import Date, String, cast, column, func, literal, select, values

OTHER_SUFFIX = ':other'


def _rank(goal):
    level = getattr(goal, 'level', None)
    return level.rank if level is not None else 1_000


def _level_type(goal):
    level = getattr(goal, 'level', None)
    return level.name.replace(' ', '') if level is not None else 'Goal'


def _tree(goals):
    by_id = {goal.id: goal for goal in goals}
    children = {}
    for goal in goals:
        parent_id = goal.parent_id if goal.parent_id in by_id else None
        children.setdefault(parent_id, []).append(goal)
    for siblings in children.values():
        siblings.sort(key=lambda goal: ((goal.name or '').lower(), goal.id))
    order = []

    def visit(parent_id):
        for goal in children.get(parent_id, []):
            order.append(goal)
            visit(goal.id)

    visit(None)
    return by_id, children, order


def _level_mapping(by_id, order, rank):
    """goal id -> series key for stacking at `rank`; the members in stable order."""
    mapping, members, above = {}, [], []
    for goal in order:  # depth-first, so a parent is mapped before its children
        if _rank(goal) < rank:
            mapping[goal.id] = goal.id + OTHER_SUFFIX
            above.append(goal)
            continue
        parent = by_id.get(goal.parent_id)
        if parent is None or _rank(parent) < rank:
            mapping[goal.id] = goal.id
            members.append(goal)
        else:
            mapping[goal.id] = mapping[parent.id]
    return mapping, members, above


def _focus_mapping(children, focus):
    mapping, members = {focus.id: focus.id + OTHER_SUFFIX}, list(children.get(focus.id, []))

    def claim(goal, key):
        mapping[goal.id] = key
        for child in children.get(goal.id, []):
            claim(child, key)

    for child in members:
        claim(child, child.id)
    return mapping, members, [focus]


def level_options(goals, goals_with_evidence):
    """Levels present in the tree, each with how many series it would stack."""
    by_id, _children, order = _tree(goals)
    options = []
    for rank in sorted({_rank(goal) for goal in goals if getattr(goal, 'level', None) is not None}):
        mapping, _members, _above = _level_mapping(by_id, order, rank)
        keys = {mapping[goal_id] for goal_id in goals_with_evidence if goal_id in mapping}
        level = next(goal.level for goal in goals if _rank(goal) == rank)
        options.append({'rank': rank, 'label': level.name, 'series_count': sum(not key.endswith(OTHER_SUFFIX) for key in keys)})
    return options


def _automatic_rank(options):
    """The highest level that splits the time between goals; else the highest level below the top
    with any time (one goal is still more specific than the root); else the top."""
    for option in options:
        if option['series_count'] >= 2:
            return option['rank']
    below_top = [option for option in options[1:] if option['series_count'] >= 1]
    return (below_top or options or [{'rank': 0}])[0]['rank']


def plan_rollup(goals, goals_with_evidence, *, rank=None, focus_goal_id=None):
    """Which series to draw and which goals feed each. Returns None for an unknown focus goal."""
    by_id, children, order = _tree(goals)
    options = level_options(goals, goals_with_evidence)
    if focus_goal_id is not None:
        focus = by_id.get(focus_goal_id)
        if focus is None:
            return None
        mapping, members, above = _focus_mapping(children, focus)
        rank = None
    else:
        if rank not in {option['rank'] for option in options}:
            rank = _automatic_rank(options)
        mapping, members, above = _level_mapping(by_id, order, rank)
    series = [{
        'key': goal.id, 'goal_id': goal.id, 'name': goal.name, 'type': _level_type(goal),
        'remainder': False, 'drillable': bool(children.get(goal.id)),
    } for goal in members] + [{
        'key': goal.id + OTHER_SUFFIX, 'goal_id': goal.id, 'name': goal.name, 'type': _level_type(goal),
        'remainder': bool(children.get(goal.id)), 'drillable': False,
    } for goal in above]
    breadcrumb = []
    cursor = by_id.get(focus_goal_id) if focus_goal_id else None
    while cursor is not None:
        breadcrumb.insert(0, {'id': cursor.id, 'name': cursor.name})
        cursor = by_id.get(cursor.parent_id)
    return {'mapping': mapping, 'series': series, 'rank': rank, 'focus_goal_id': focus_goal_id,
            'levels': options, 'breadcrumb': breadcrumb}


def rollup_bucket_rows(db_session, evidence, evidence_id, mapping, bucket):
    """Seconds per (series key, bucket), each evidence item counted once per series, and per bucket
    with each item counted once overall.

    `evidence` is the analytics evidence CTE (goal_id, duration_seconds, ...), `evidence_id` its
    session or instance id column and `bucket` its calendar bucket expression.
    """
    if not mapping:
        return [], []
    targets = values(column('goal_id', String), column('series_key', String), name='rollup_targets').data(
        sorted(mapping.items()))
    per_item = select(
        targets.c.series_key, evidence_id.label('item_id'), cast(bucket, Date).label('bucket'),
        func.max(func.coalesce(evidence.c.duration_seconds, 0)).label('seconds'),
    ).join(targets, targets.c.goal_id == evidence.c.goal_id).where(evidence.c.session_start.is_not(None)).group_by(
        targets.c.series_key, evidence_id, cast(bucket, Date),
    ).cte('rollup_items')
    shown = per_item.alias('shown')
    in_sub_goal = select(literal(1)).select_from(shown).where(
        shown.c.item_id == per_item.c.item_id, ~shown.c.series_key.endswith(OTHER_SUFFIX),
    ).exists()
    kept = select(per_item).where(~per_item.c.series_key.endswith(OTHER_SUFFIX) | ~in_sub_goal).subquery()
    rows = db_session.execute(select(
        kept.c.series_key, kept.c.bucket, func.sum(kept.c.seconds).label('seconds'),
    ).group_by(kept.c.series_key, kept.c.bucket).order_by(kept.c.bucket)).all()
    # Each item once, however many series show it: the bucket's true total.
    unique = select(kept.c.item_id, kept.c.bucket, func.max(kept.c.seconds).label('seconds')).group_by(
        kept.c.item_id, kept.c.bucket).subquery()
    totals = db_session.execute(select(unique.c.bucket, func.sum(unique.c.seconds).label('seconds')).group_by(
        unique.c.bucket).order_by(unique.c.bucket)).all()
    return rows, totals
