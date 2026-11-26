"""Frozen copies of fractals for the live demo.

Publishing the demo copies each chosen fractal, as it is at that moment, into the
demo account (`services/demo_account_service.py`). Visitors read the copy, so later
edits, private notes and the owner's account never reach the public demo.

The copy is driven by the SQLAlchemy metadata, not a hand-written list:

- **Collect:** every row whose `root_id` is the fractal, then every row of a child or
  association table whose foreign key points at a collected row, until nothing new.
- **Classify:** every table a fractal can reach is in `COPY_TABLES` or `EXCLUDED_TABLES`;
  `tests/integration/test_demo_snapshots.py` fails when a new table is neither.
- **Remap:** each collected id gets a new one (the root gets the stable snapshot id).
  Any string column or JSON value equal to a collected id is rewritten (ids are UUIDs,
  so matching on the value also catches references without a declared foreign key);
  user references become the demo account; references into excluded tables are cleared.
- **Insert** in dependency order. Foreign keys that point at the same or a later table
  (cycles and self-references, such as a goal's parent) are filled in afterwards.

Purging a snapshot walks the same graph in reverse.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from functools import lru_cache

from sqlalchemy import JSON, UniqueConstraint, and_, bindparam, or_, select, update
from sqlalchemy.sql.schema import Table

from models import Base, GoalLevel

logger = logging.getLogger(__name__)

# Tables whose rows belong to a fractal and are part of what a visitor sees.
COPY_TABLES = frozenset({
    'goals',
    'activity_groups', 'activity_tag_families', 'activity_tag_definitions', 'activity_definitions',
    'activity_goal_associations', 'goal_activity_group_associations',
    'activity_progress_defaults', 'activity_progress_default_tags', 'activity_progress_charts',
    'activity_duration_stats', 'fractal_metric_definitions', 'metric_definitions', 'split_definitions',
    'analytics_dashboards', 'goal_analytics_views', 'page_surface_layouts', 'note_filters',
    'calendar_periods', 'event_logs',
    'goal_pause_intervals', 'goal_sequence_tracks',
    'goal_completion_conditions', 'goal_condition_metric_rules', 'goal_condition_tags',
    'programs', 'program_blocks', 'program_block_goals', 'program_goals',
    'program_days', 'program_day_goals', 'program_day_templates', 'program_day_sessions',
    'program_day_activity_conditions', 'program_day_activity_condition_tags',
    'program_day_status_overrides', 'program_day_session_credits',
    'program_day_occurrence_exclusions', 'program_day_occurrence_schedules', 'program_session_plans',
    'session_templates', 'session_template_goals', 'session_template_stats', 'template_section_stats',
    'sessions', 'session_goals', 'session_work_intervals',
    'activity_instances', 'activity_instance_goal_associations', 'activity_instance_tags',
    'activity_instance_compare_tags', 'activity_sets', 'activity_set_tags', 'metric_values',
    'circuit_definitions', 'circuit_slots', 'circuit_runs', 'circuit_rounds', 'circuit_run_slots',
    'circuit_round_members', 'circuit_scope_tags',
    'notes',
})

# Reachable from a fractal but never copied, with the reason.
EXCLUDED_TABLES = {
    'goal_levels': 'copied separately as the fractal\'s effective levels',
    'media_assets': 'the demo serves no media',
    'storage_uploads': 'the demo serves no media',
    'goal_attachments': 'the demo serves no media',
    'note_attachments': 'the demo serves no media',
    'sync_conflicts': 'device sync state belongs to the owner\'s account',
    'sync_changes': 'device sync state belongs to the owner\'s account',
    'product_events': 'telemetry about the owner, not part of the fractal',
    'agent_change_cursors': 'agent state belongs to the owner\'s connections',
    'agent_embedded_conversations': 'agent state belongs to the owner\'s connections',
    'agent_embedded_messages': 'agent state belongs to the owner\'s connections',
    'agent_embedded_runs': 'agent state belongs to the owner\'s connections',
    'agent_embedded_usage': 'agent state belongs to the owner\'s connections',
    'agent_task_briefs': 'agent state belongs to the owner\'s connections',
    'agent_proposals': 'agent state belongs to the owner\'s connections',
    'agent_approvals': 'agent state belongs to the owner\'s connections',
    'agent_runs': 'agent state belongs to the owner\'s connections',
    'agent_operations': 'agent state belongs to the owner\'s connections',
}

_CHUNK = 500

# Database triggers that act on an insert (models/activity.py): a new activity instance takes
# the remembered progress defaults and their compare tags. A copy keeps the source's own, so
# after inserting these tables the copied values are put back and the rows the trigger
# added to the listed tables are removed before the source's are copied.
INSERT_TRIGGER_EFFECTS = {
    'activity_instances': ('activity_instance_compare_tags',),
}

# Snapshot ids are derived, not random: the same source row always gets the same id in its
# snapshot, so links into the demo (a session, `?goal=`) survive a republish.
DEMO_SNAPSHOT_NAMESPACE = uuid.UUID('6f1c2a52-3c1e-4a8e-9c41-2d6a0f5e7b19')


def snapshot_root_id(source_root_id: str) -> str:
    return str(uuid.uuid5(DEMO_SNAPSHOT_NAMESPACE, f'root:{source_root_id}'))


def snapshot_row_id(target_root_id: str, source_id: str) -> str:
    return str(uuid.uuid5(DEMO_SNAPSHOT_NAMESPACE, f'{target_root_id}:{source_id}'))


@dataclass
class SnapshotResult:
    root_id: str
    id_map: dict[str, str]
    counts: dict[str, int] = field(default_factory=dict)


def _chunks(values):
    values = list(values)
    for start in range(0, len(values), _CHUNK):
        yield values[start:start + _CHUNK]


def reachable_fractal_tables() -> set[str]:
    """Every table a fractal's rows can reach: root-scoped tables and their foreign-key descendants."""
    reachable = {'goals'}
    changed = True
    while changed:
        changed = False
        for table in Base.metadata.sorted_tables:
            if table.name in reachable or table.name == 'users':
                continue
            if 'root_id' in table.c or any(fk.column.table.name in reachable for fk in table.foreign_keys):
                reachable.add(table.name)
                changed = True
    return reachable


def _copy_order() -> list[Table]:
    return [table for table in Base.metadata.sorted_tables if table.name in COPY_TABLES]


def _single_id(table: Table) -> bool:
    keys = list(table.primary_key.columns)
    return len(keys) == 1 and keys[0].name == 'id'


def _row_key(table: Table, row: dict):
    return tuple(row[column.name] for column in table.primary_key.columns)


@lru_cache(maxsize=None)
def _fresh_unique_columns(table: Table) -> frozenset[str]:
    """Unique columns that aren't references (an event's id): a copy needs its own value."""
    foreign = {fk.parent.name for fk in table.foreign_keys}
    single = {column.name for column in table.columns if column.unique}
    single |= {
        next(iter(index.columns)).name for index in table.indexes if index.unique and len(index.columns) == 1
    }
    single |= {
        next(iter(constraint.columns)).name for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint) and len(constraint.columns) == 1
    }
    return frozenset(name for name in single if name not in foreign and not table.c[name].primary_key)


def _deferred_columns(order: list[Table]) -> dict[str, list[str]]:
    """Foreign keys to the same or a later table: written after every row exists."""
    position = {table.name: index for index, table in enumerate(order)}
    deferred = {}
    for table in order:
        names = [
            fk.parent.name for fk in table.foreign_keys
            if fk.column.table.name in position and position[fk.column.table.name] >= position[table.name]
        ]
        if names:
            deferred[table.name] = names
    return deferred


class DemoSnapshotService:
    def __init__(self, db_session):
        self.db_session = db_session

    # --- Collect -------------------------------------------------------------------

    def collect(self, root_id: str) -> dict[str, dict[tuple, dict]]:
        """Every copyable row of the fractal, by table, keyed by primary key."""
        unclassified = reachable_fractal_tables() - COPY_TABLES - set(EXCLUDED_TABLES)
        if unclassified:
            raise RuntimeError(f'Demo snapshot tables not classified: {sorted(unclassified)}')

        order = _copy_order()
        rows: dict[str, dict[tuple, dict]] = {table.name: {} for table in order}
        ids: dict[str, set] = {table.name: set() for table in order}
        queried: dict[tuple[str, str], set] = {}
        changed = True
        first_pass = True
        while changed:
            changed = False
            for table in order:
                for row in self._candidate_rows(table, root_id, ids, queried, first_pass):
                    key = _row_key(table, row)
                    if key in rows[table.name]:
                        continue
                    rows[table.name][key] = row
                    if _single_id(table):
                        ids[table.name].add(row['id'])
                    changed = True
            first_pass = False
        return rows

    def _candidate_rows(self, table: Table, root_id: str, ids: dict[str, set], queried: dict, first_pass: bool):
        if table.name == 'goals':
            if first_pass:
                yield from self._fetch(select(table).where(or_(table.c.id == root_id, table.c.root_id == root_id)))
            return
        if 'root_id' in table.c:
            if first_pass:
                yield from self._fetch(select(table).where(table.c.root_id == root_id))
            return
        for fk in table.foreign_keys:
            # Only parents found since this foreign key was last followed.
            done = queried.setdefault((table.name, fk.parent.name), set())
            parent_ids = ids.get(fk.column.table.name, set()) - done
            done |= parent_ids
            for chunk in _chunks(parent_ids):
                yield from self._fetch(select(table).where(fk.parent.in_(chunk)))

    def _fetch(self, statement):
        return [dict(row) for row in self.db_session.execute(statement).mappings()]

    # --- Copy ----------------------------------------------------------------------

    def snapshot(self, source_root_id: str, target_root_id: str, demo_owner_id: str) -> SnapshotResult:
        """Copy the fractal into the demo account under `target_root_id`. Caller commits."""
        rows = self.collect(source_root_id)
        source_owner_id = next(
            (row['owner_id'] for row in rows['goals'].values() if row['id'] == source_root_id),
            None,
        )
        if source_owner_id is None:
            raise ValueError('Snapshot source is not a fractal root')

        id_map: dict[str, str] = {source_root_id: target_root_id}
        order = _copy_order()
        for table in order:
            if _single_id(table):
                for row in rows[table.name].values():
                    id_map.setdefault(row['id'], snapshot_row_id(target_root_id, row['id']))
        id_map.update(self._copy_levels(source_owner_id, source_root_id, target_root_id, demo_owner_id))

        deferred = _deferred_columns(order)
        links: dict[str, list[dict]] = {}
        for table in order:
            names = deferred.get(table.name, ())
            # Keep `onupdate` columns (updated_at) as copied: the link update is part of the insert.
            kept = [column.name for column in table.columns if column.onupdate is not None]
            copies = []
            for row in rows[table.name].values():
                copied = self._remap_row(table, row, id_map, demo_owner_id, target_root_id)
                if copied is None:
                    continue
                if any(copied.get(name) is not None for name in names):
                    links.setdefault(table.name, []).append({
                        '_id': copied['id'],
                        **{f'_{name}': copied[name] for name in (*names, *kept)},
                    })
                    for name in names:
                        copied[name] = None
                copies.append(copied)
            for chunk in _chunks(copies):
                self.db_session.execute(table.insert(), chunk)
            if table.name in INSERT_TRIGGER_EFFECTS:
                self._undo_insert_triggers(table, copies)
        for table_name, params in links.items():
            table = Base.metadata.tables[table_name]
            names = (*deferred[table_name], *(column.name for column in table.columns if column.onupdate is not None))
            statement = update(table).where(table.c.id == bindparam('_id')).values(
                {name: bindparam(f'_{name}') for name in names}
            )
            for chunk in _chunks(params):
                self.db_session.execute(statement, chunk)
        self.db_session.flush()
        return SnapshotResult(root_id=target_root_id, id_map=id_map, counts=self._counts(rows))

    def _undo_insert_triggers(self, table: Table, copies: list[dict]) -> None:
        if not copies:
            return
        ids = [copied['id'] for copied in copies]
        for child_name in INSERT_TRIGGER_EFFECTS[table.name]:
            child = Base.metadata.tables[child_name]
            column = next(fk.parent for fk in child.foreign_keys if fk.column.table is table)
            for chunk in _chunks(ids):
                self.db_session.execute(child.delete().where(column.in_(chunk)))
        names = [
            column.name for column in table.columns
            if not column.primary_key and column.computed is None and column.name in copies[0]
        ]
        statement = update(table).where(table.c.id == bindparam('_id')).values(
            {name: bindparam(f'_{name}') for name in names}
        )
        for chunk in _chunks(copies):
            self.db_session.execute(statement, [
                {'_id': copied['id'], **{f'_{name}': copied[name] for name in names}} for copied in chunk
            ])

    def _copy_levels(self, owner_id, source_root_id, target_root_id, demo_owner_id) -> dict[str, str]:
        """The source's effective levels, owned by the snapshot.

        Levels merge by name (system, then the owner's own, then the fractal's own), so
        each name the owner customised becomes one fractal-scoped level on the copy, and
        every owner level of that name points at it. System levels are shared as they are.
        """
        table = GoalLevel.__table__
        owner_levels = self._fetch(select(table).where(
            table.c.owner_id == owner_id,
            or_(table.c.root_id == source_root_id, table.c.root_id.is_(None)),
        ))
        by_name: dict[str, list[dict]] = {}
        for level in owner_levels:
            by_name.setdefault(level['name'], []).append(level)

        level_map: dict[str, str] = {}
        for levels in by_name.values():
            live = [level for level in levels if level['deleted_at'] is None]
            chosen = (
                next((level for level in live if level['root_id'] == source_root_id), None)
                or next((level for level in live if level['root_id'] is None), None)
            )
            for source in ([chosen] if chosen else levels):
                new_id = snapshot_row_id(target_root_id, f"level:{source['id']}")
                self.db_session.execute(table.insert(), [
                    {**source, 'id': new_id, 'owner_id': demo_owner_id, 'root_id': target_root_id},
                ])
                for level in (levels if chosen else [source]):
                    level_map[level['id']] = new_id
        return level_map

    def _remap_row(
        self, table: Table, row: dict, id_map: dict[str, str], demo_owner_id: str, target_root_id: str,
    ) -> dict | None:
        foreign = {fk.parent.name: fk.column.table.name for fk in table.foreign_keys}
        fresh = _fresh_unique_columns(table)
        copied = {}
        for column in table.columns:
            if column.computed is not None:
                continue  # generated by the database from the copied columns
            value = row[column.name]
            target = foreign.get(column.name)
            if value is not None and column.name in fresh:
                value = snapshot_row_id(target_root_id, f'{table.name}.{column.name}:{value}')
            elif value is not None and target == 'users':
                value = demo_owner_id
            elif value is not None and target and target not in COPY_TABLES and target != 'goal_levels':
                if not column.nullable:
                    return None
                value = None
            elif isinstance(value, str):
                value = id_map.get(value, value)
            elif isinstance(column.type, JSON) or isinstance(value, (dict, list)):
                value = _remap_json(value, id_map)
            copied[column.name] = value
        return copied

    @staticmethod
    def _counts(rows: dict[str, dict[tuple, dict]]) -> dict[str, int]:
        def live(name):
            return sum(1 for row in rows.get(name, {}).values() if row.get('deleted_at') is None)
        return {
            'goals': live('goals'),
            'sessions': live('sessions'),
            'programs': live('programs'),
            'notes': live('notes'),
        }

    # --- Purge ---------------------------------------------------------------------

    def purge(self, root_id: str, demo_owner_id: str) -> None:
        """Delete a snapshot made by `snapshot`. Only the demo account's fractals can be purged."""
        root = self.db_session.execute(
            select(Base.metadata.tables['goals']).where(Base.metadata.tables['goals'].c.id == root_id)
        ).mappings().first()
        if root is None:
            return
        if root['owner_id'] != demo_owner_id:
            raise PermissionError('Only demo snapshots can be purged')

        rows = self.collect(root_id)
        order = _copy_order()
        for table_name, names in _deferred_columns(order).items():
            table = Base.metadata.tables[table_name]
            keys = [key[0] for key in rows[table_name]] if _single_id(table) else []
            for chunk in _chunks(keys):
                self.db_session.execute(update(table).where(table.c.id.in_(chunk)).values({name: None for name in names}))
        for table in reversed(order):
            table_rows = rows[table.name]
            if not table_rows:
                continue
            first_key = list(table.primary_key.columns)[0]
            values = {key[0] for key in table_rows}
            for chunk in _chunks(values):
                self.db_session.execute(table.delete().where(first_key.in_(chunk)))
        self.db_session.execute(GoalLevel.__table__.delete().where(and_(
            GoalLevel.__table__.c.root_id == root_id,
            GoalLevel.__table__.c.owner_id == demo_owner_id,
        )))
        self.db_session.flush()


def _remap_json(value, id_map):
    if isinstance(value, str):
        return id_map.get(value, value)
    if isinstance(value, list):
        return [_remap_json(item, id_map) for item in value]
    if isinstance(value, dict):
        return {id_map.get(key, key): _remap_json(item, id_map) for key, item in value.items()}
    return value
