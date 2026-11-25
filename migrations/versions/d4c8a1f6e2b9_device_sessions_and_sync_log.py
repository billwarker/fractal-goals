"""Device sessions for native apps, and the change log devices sync from.

Additive: five new empty tables, plus statement-level triggers that log which entity each write
touched. No existing row is read or rewritten. Creating triggers takes a brief SHARE ROW EXCLUSIVE
lock per table. The trigger definitions below are a frozen copy of models/sync.py; a change there
needs its own revision.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4c8a1f6e2b9'
down_revision = '68b47064d279'
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


def upgrade():
    op.create_table(
        'user_devices',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('platform', sa.String(length=16), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('session_version', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint("platform IN ('ios', 'macos')", name='ck_user_devices_platform'),
    )
    op.create_index('ix_user_devices_user_id', 'user_devices', ['user_id'])
    op.create_table(
        'device_refresh_tokens',
        sa.Column('token_hash', sa.String(length=64), primary_key=True),
        sa.Column('device_id', sa.String(), sa.ForeignKey('user_devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('parent_hash', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('superseded_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_device_refresh_tokens_device_id', 'device_refresh_tokens', ['device_id'])
    op.create_table(
        'sync_changes',
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('xid', sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column('entity_type', sa.String(length=32), primary_key=True),
        sa.Column('entity_id', sa.String(), primary_key=True),
        sa.Column('root_id', sa.String(), nullable=True),
        sa.Column('origin', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text("(now() AT TIME ZONE 'utc')")),
    )
    op.create_index('ix_sync_changes_created_at', 'sync_changes', ['created_at'])
    op.create_table(
        'sync_field_edits',
        sa.Column('entity_type', sa.String(length=32), primary_key=True),
        sa.Column('entity_id', sa.String(), primary_key=True),
        sa.Column('field', sa.String(length=32), primary_key=True),
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('edited_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_sync_field_edits_owner_id', 'sync_field_edits', ['owner_id'])
    op.create_index('ix_sync_field_edits_edited_at', 'sync_field_edits', ['edited_at'])
    op.create_table(
        'sync_conflicts',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('entity_type', sa.String(length=32), nullable=False),
        sa.Column('entity_id', sa.String(), nullable=False),
        sa.Column('field', sa.String(length=32), nullable=False),
        sa.Column('kept_value', sa.Text(), nullable=True),
        sa.Column('lost_value', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_sync_conflicts_owner_id', 'sync_conflicts', ['owner_id'])
    op.create_index('ix_sync_conflicts_root_id', 'sync_conflicts', ['root_id'])
    for table in synced_tables():
        for statement in sync_trigger_statements(table):
            op.execute(statement)


def downgrade():
    for table in synced_tables():
        for operation in ('ins', 'upd', 'del'):
            op.execute(f'DROP TRIGGER IF EXISTS sync_{operation}_{table} ON public.{table}')
        op.execute(f'DROP FUNCTION IF EXISTS public.sync_log_{table}()')
    op.drop_table('sync_conflicts')
    op.drop_table('sync_field_edits')
    op.drop_table('sync_changes')
    op.drop_table('device_refresh_tokens')
    op.drop_table('user_devices')
