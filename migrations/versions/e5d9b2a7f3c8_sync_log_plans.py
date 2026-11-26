"""Sync log triggers look rows up by id array, so a stale plan can't scan whole tables.

Replaces function bodies only; no table, row or trigger changes. The definitions below are a frozen
copy of models/sync.py; a change there needs its own revision.
"""
import importlib

from alembic import op

revision = 'e5d9b2a7f3c8'
down_revision = 'd4c8a1f6e2b9'
branch_labels = None
depends_on = None

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

_LOG = """
        INSERT INTO public.sync_changes (owner_id, xid, entity_type, entity_id, root_id, origin)
        SELECT {owner}, pg_current_xact_id()::text::bigint, '{entity}', e.id, e.root_id,
            left(NULLIF(current_setting('app.sync_origin', true), ''), 36)
        FROM {source}
        ON CONFLICT DO NOTHING;"""
_USER = "JOIN public.users u ON u.id = {owner} AND u.role <> 'demo'"


def _entity_statements(entity, transition):
    """Log the changed rows of an entity's own table, which a delete leaves only in ``transition``."""
    own = _LOG.format(owner='e.owner_id', entity=entity, source=f"{transition} e {_USER.format(owner='e.owner_id')}{{}}")
    if entity == 'goal_level':
        yield own.format('')
        return
    # One fractal at a time. A child of a root that is itself being deleted has no root left to find.
    yield f"""
        FOR v_root, v_owner IN
            SELECT r.id, r.owner_id FROM public.goals r {_USER.format(owner='r.owner_id')}
            WHERE r.id = ANY(ARRAY(SELECT DISTINCT root_id FROM {transition}))
        LOOP{_LOG.format(owner='v_owner', entity=entity, source=f'{transition} e WHERE e.root_id = v_root')}
        END LOOP;"""
    if entity == 'goal':
        # The deleted root's own row covers its children.
        yield own.format(' WHERE e.id = e.root_id')


def _child_statements(entity, path, transition):
    """Log the entities that own changed child rows, in distinct ids and one key lookup per hop."""
    yield f"""
        v_ids := ARRAY(SELECT DISTINCT {path[0]} FROM {transition} WHERE {path[0]} IS NOT NULL);"""
    for table, column in path[1:]:
        yield f"""
        v_ids := ARRAY(SELECT DISTINCT {column} FROM public.{table} WHERE id = ANY(v_ids) AND {column} IS NOT NULL);"""
    yield _LOG.format(owner='r.owner_id', entity=entity, source=(
        f"public.{SYNC_ENTITIES[entity]} e JOIN public.goals r ON r.id = e.root_id {_USER.format(owner='r.owner_id')} "
        'WHERE e.id = ANY(v_ids)'
    ))


def _log_statements(table, transition):
    statements = []
    for entity, entity_table in SYNC_ENTITIES.items():
        if entity_table == table:
            statements.extend(_entity_statements(entity, transition))
    for entity, path in SYNC_CHILDREN.get(table, ()):
        statements.extend(_child_statements(entity, path, transition))
    return ''.join(statements)


def synced_tables():
    return sorted(set(SYNC_ENTITIES.values()) | set(SYNC_CHILDREN))


def sync_trigger_statements(table):
    """DDL that logs every insert, update and delete on ``table``, once per statement.

    A connection would otherwise plan these once, perhaps while the tables are nearly empty, and keep
    join orders that scan whole tables later. Lookups by id array, planned each time, can't go wrong that way.
    """
    function = f'sync_log_{table}'
    yield f"""
CREATE OR REPLACE FUNCTION public.{function}() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public SET plan_cache_mode = force_custom_plan AS $$
DECLARE
    v_ids text[];
    v_root text;
    v_owner text;
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


def upgrade():
    for table in synced_tables():
        op.execute(next(iter(sync_trigger_statements(table))))


def downgrade():
    previous = importlib.import_module('migrations.versions.d4c8a1f6e2b9_device_sessions_and_sync_log')
    for table in previous.synced_tables():
        op.execute(next(iter(previous.sync_trigger_statements(table))))
