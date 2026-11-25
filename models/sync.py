"""The change log behind device sync, and the triggers that write it.

Each row says "this entity changed in this transaction". Positions are transaction ids, not a
sequence: a sequence value is taken before commit, so a slow transaction could commit behind a
cursor that already passed it. Readers stop below the oldest transaction still running
(``pg_snapshot_xmin``), so nothing can appear behind a cursor. Rows are only inserted, and can
only conflict with their own transaction, so logging never makes two writers wait.
"""
import uuid

import sqlalchemy as sa
from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, String, Text, event

from .base import Base, utc_now


class SyncChange(Base):
    __tablename__ = 'sync_changes'

    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    xid = Column(BigInteger, primary_key=True, autoincrement=False)
    entity_type = Column(String(32), primary_key=True)
    entity_id = Column(String, primary_key=True)
    root_id = Column(String, nullable=True)
    # The app instance that made the change, so it can skip its own echo.
    origin = Column(String(36), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=sa.text("(now() AT TIME ZONE 'utc')"))

    __table_args__ = (sa.Index('ix_sync_changes_created_at', 'created_at'),)


class SyncFieldEdit(Base):
    """When the user last edited a field, so a late-arriving offline edit can be ordered against it."""

    __tablename__ = 'sync_field_edits'

    entity_type = Column(String(32), primary_key=True)
    entity_id = Column(String, primary_key=True)
    field = Column(String(32), primary_key=True)
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    edited_at = Column(DateTime, nullable=False, index=True)


class SyncConflict(Base):
    """Two devices edited the same field without seeing each other: what was kept, and what was not."""

    __tablename__ = 'sync_conflicts'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    root_id = Column(String, ForeignKey('goals.id', ondelete='CASCADE'), nullable=False, index=True)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(String, nullable=False)
    field = Column(String(32), nullable=False)
    kept_value = Column(Text, nullable=True)
    lost_value = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now, server_default=sa.text('now()'))
    resolved_at = Column(DateTime, nullable=True)


# entity type -> the table holding the entity itself
SYNC_ENTITIES = {
    'goal': 'goals',
    'goal_level': 'goal_levels',
    'goal_sequence': 'goal_sequence_tracks',
    'activity_group': 'activity_groups',
    'activity': 'activity_definitions',
    'tag_family': 'activity_tag_families',
    'tag': 'activity_tag_definitions',
    'fractal_metric': 'fractal_metric_definitions',
    'circuit': 'circuit_definitions',
    'template': 'session_templates',
    'program': 'programs',
    'session_plan': 'program_session_plans',
    'calendar_period': 'calendar_periods',
    'session': 'sessions',
    'note': 'notes',
    'note_filter': 'note_filters',
    'dashboard': 'analytics_dashboards',
    'surface_layout': 'page_surface_layouts',
}

# child table -> the ways its rows belong to an entity: (entity, path). A path is the row's own
# column, then (table, column) hops; the last value is the entity's id.
SYNC_CHILDREN = {
    'goal_pause_intervals': [('goal', ('goal_id',))],
    'goal_completion_conditions': [('goal', ('goal_id',))],
    'goal_condition_metric_rules': [('goal', ('condition_id', ('goal_completion_conditions', 'goal_id')))],
    'goal_condition_tags': [('goal', ('condition_id', ('goal_completion_conditions', 'goal_id')))],
    'goal_analytics_views': [('goal', ('goal_id',)), ('dashboard', ('dashboard_id',))],
    'goal_activity_group_associations': [('goal', ('goal_id',)), ('activity_group', ('activity_group_id',))],
    'activity_goal_associations': [('goal', ('goal_id',)), ('activity', ('activity_id',))],
    'goal_attachments': [('goal', ('goal_id',))],
    'metric_definitions': [('activity', ('activity_id',))],
    'split_definitions': [('activity', ('activity_id',))],
    'activity_progress_defaults': [('activity', ('activity_definition_id',))],
    'activity_progress_default_tags': [
        ('activity', ('default_id', ('activity_progress_defaults', 'activity_definition_id'))),
    ],
    'activity_progress_charts': [('activity', ('activity_definition_id',))],
    'circuit_slots': [('circuit', ('circuit_definition_id',))],
    'session_template_goals': [('template', ('session_template_id',))],
    'program_blocks': [('program', ('program_id',))],
    'program_block_goals': [('program', ('program_block_id', ('program_blocks', 'program_id')))],
    'program_goals': [('program', ('program_id',))],
    'program_days': [('program', ('program_id',))],
    'program_day_goals': [('program', ('program_day_id', ('program_days', 'program_id')))],
    'program_day_templates': [('program', ('program_day_id', ('program_days', 'program_id')))],
    'program_day_sessions': [
        ('program', ('program_day_id', ('program_days', 'program_id'))), ('session', ('session_id',)),
    ],
    'program_day_activity_conditions': [('program', ('program_day_id', ('program_days', 'program_id')))],
    'program_day_activity_condition_tags': [
        ('program', ('condition_id', ('program_day_activity_conditions', 'program_day_id'),
                     ('program_days', 'program_id'))),
    ],
    'program_day_status_overrides': [('program', ('program_id',))],
    'program_day_session_credits': [('program', ('program_id',)), ('session', ('session_id',))],
    'program_day_occurrence_exclusions': [('program', ('program_day_id', ('program_days', 'program_id')))],
    'program_day_occurrence_schedules': [('program', ('program_day_id', ('program_days', 'program_id')))],
    'session_goals': [('session', ('session_id',))],
    'session_work_intervals': [('session', ('session_id',))],
    'activity_instances': [('session', ('session_id',))],
    'activity_instance_goal_associations': [
        ('session', ('activity_instance_id', ('activity_instances', 'session_id'))),
    ],
    'activity_instance_tags': [('session', ('activity_instance_id', ('activity_instances', 'session_id')))],
    'activity_instance_compare_tags': [('session', ('activity_instance_id', ('activity_instances', 'session_id')))],
    'activity_sets': [('session', ('activity_instance_id', ('activity_instances', 'session_id')))],
    'activity_set_tags': [
        ('session', ('activity_set_id', ('activity_sets', 'activity_instance_id'),
                     ('activity_instances', 'session_id'))),
    ],
    'metric_values': [('session', ('activity_instance_id', ('activity_instances', 'session_id')))],
    'circuit_runs': [('session', ('session_id',))],
    'circuit_rounds': [('session', ('circuit_run_id', ('circuit_runs', 'session_id')))],
    'circuit_run_slots': [('session', ('circuit_run_id', ('circuit_runs', 'session_id')))],
    'circuit_round_members': [
        ('session', ('circuit_round_id', ('circuit_rounds', 'circuit_run_id'), ('circuit_runs', 'session_id'))),
    ],
    'circuit_scope_tags': [
        ('session', ('circuit_run_id', ('circuit_runs', 'session_id'))),
        ('session', ('circuit_round_id', ('circuit_rounds', 'circuit_run_id'), ('circuit_runs', 'session_id'))),
    ],
    'note_attachments': [('note', ('note_id',))],
}

# Reachable from a fractal but not synced, with the reason.
SYNC_EXCLUDED = {
    'sync_conflicts': 'read through /api/sync/conflicts',
    'sync_changes': 'the change log itself',
    'event_logs': 'operational history, read through the Logs API',
    'product_events': 'telemetry about the owner',
    'session_template_stats': 'derived; recomputed by the server',
    'template_section_stats': 'derived; recomputed by the server',
    'activity_duration_stats': 'derived; recomputed by the server',
    'media_assets': 'media is online-only',
    'storage_uploads': 'media is online-only',
    'agent_change_cursors': 'agent state belongs to the connection',
    'agent_embedded_conversations': 'agent state belongs to the connection',
    'agent_embedded_messages': 'agent state belongs to the connection',
    'agent_embedded_runs': 'agent state belongs to the connection',
    'agent_embedded_usage': 'agent state belongs to the connection',
    'agent_task_briefs': 'agent state belongs to the connection',
    'agent_proposals': 'agent state belongs to the connection',
    'agent_approvals': 'agent state belongs to the connection',
    'agent_runs': 'agent state belongs to the connection',
    'agent_operations': 'agent state belongs to the connection',
}


def _owner_select(entity, source):
    """(owner, entity id, root) for changed entity rows aliased ``e``."""
    if entity == 'goal_level':
        return f"SELECT e.owner_id, e.id, e.root_id FROM {source} WHERE e.owner_id IS NOT NULL"
    if entity == 'goal':
        # A child of a root that is itself being deleted has no root left; the root's own row covers it.
        return (
            f"SELECT r.owner_id, e.id, e.root_id FROM {source} JOIN public.goals r ON r.id = e.root_id "
            f"UNION SELECT e.owner_id, e.id, e.root_id FROM {source} "
            "WHERE e.id = e.root_id AND e.owner_id IS NOT NULL"
        )
    return f"SELECT r.owner_id, e.id, e.root_id FROM {source} JOIN public.goals r ON r.id = e.root_id"


def _changed_selects(table, transition):
    for entity, entity_table in SYNC_ENTITIES.items():
        if entity_table == table:
            yield entity, _owner_select(entity, f'{transition} e')
    for entity, path in SYNC_CHILDREN.get(table, ()):
        value = f'c.{path[0]}'
        source = f'{transition} c'
        for index, (hop_table, column) in enumerate(path[1:]):
            source += f' JOIN public.{hop_table} h{index} ON h{index}.id = {value}'
            value = f'h{index}.{column}'
        yield entity, _owner_select(entity, f'{source} JOIN public.{SYNC_ENTITIES[entity]} e ON e.id = {value}')


def _log_statements(table, transition):
    return '\n'.join(f"""
        INSERT INTO public.sync_changes (owner_id, xid, entity_type, entity_id, root_id, origin)
        SELECT DISTINCT s.owner_id, pg_current_xact_id()::text::bigint, '{entity}', s.id, s.root_id,
            left(NULLIF(current_setting('app.sync_origin', true), ''), 36)
        FROM ({select}) AS s(owner_id, id, root_id)
        JOIN public.users u ON u.id = s.owner_id AND u.role <> 'demo'
        ON CONFLICT DO NOTHING;""" for entity, select in _changed_selects(table, transition))


def synced_tables():
    return sorted(set(SYNC_ENTITIES.values()) | set(SYNC_CHILDREN))


def sync_trigger_statements(table):
    """DDL that logs every insert, update and delete on ``table``, once per statement."""
    function = f'sync_log_{table}'
    yield f"""
CREATE OR REPLACE FUNCTION public.{function}() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN {_log_statements(table, 'old_rows')}
    END IF;
    IF TG_OP <> 'DELETE' THEN {_log_statements(table, 'new_rows')}
    END IF;
    RETURN NULL;
END;
$$"""
    for operation, referencing in (
        ('insert', 'NEW TABLE AS new_rows'),
        ('update', 'OLD TABLE AS old_rows NEW TABLE AS new_rows'),
        ('delete', 'OLD TABLE AS old_rows'),
    ):
        name = f'sync_{operation[:3]}_{table}'
        yield f'DROP TRIGGER IF EXISTS {name} ON public.{table}'
        yield (
            f'CREATE TRIGGER {name} AFTER {operation.upper()} ON public.{table} '
            f'REFERENCING {referencing} FOR EACH STATEMENT EXECUTE FUNCTION public.{function}()'
        )


def _install_sync_triggers(_metadata, connection, **_kw):
    existing = set(sa.inspect(connection).get_table_names(schema='public'))
    for table in synced_tables():
        if table not in existing or 'sync_changes' not in existing:
            continue
        for statement in sync_trigger_statements(table):
            connection.exec_driver_sql(statement)


event.listen(Base.metadata, 'after_create', _install_sync_triggers)
