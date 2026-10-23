"""Goal completion conditions, sequence tracks, and target conversion (migration A, additive).

Adds the condition tables, `goals.completion_condition` / `started_at` / sequence placement and
pause-interval provenance, then converts every live target with
`services.target_condition_conversion`. Legacy target tables and retired columns are left in place
(read-only) for the separate destructive migration B. Downgrade removes everything this revision
added, including the goals it generated (their ids are derived from the source target ids).
"""
from datetime import datetime, timezone
import uuid

import logging

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger('alembic.runtime.migration')

revision = 'e1a2c3d4f5b6'
down_revision = 'b7d9f1a3c5e7'
branch_labels = None
depends_on = None

_LEVEL_RANKS = {
    'Ultimate Goal': 0, 'Long Term Goal': 1, 'Mid Term Goal': 2, 'Short Term Goal': 3, 'Immediate Goal': 4,
}


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def upgrade():
    op.create_table(
        'goal_sequence_tracks',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('parent_goal_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('level_id', sa.String(), sa.ForeignKey('goal_levels.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_goal_sequence_tracks_root_id', 'goal_sequence_tracks', ['root_id'])
    op.create_index('ix_goal_sequence_tracks_parent_goal_id', 'goal_sequence_tracks', ['parent_goal_id'])

    op.create_table(
        'goal_completion_conditions',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('goal_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('root_id', sa.String(), sa.ForeignKey('goals.id', ondelete='CASCADE'), nullable=False),
        sa.Column('activity_definition_id', sa.String(),
                  sa.ForeignKey('activity_definitions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('measure', sa.String(), nullable=False),
        sa.Column('min_sets', sa.Integer(), nullable=True),
        sa.Column('required_count', sa.Integer(), nullable=True),
        sa.Column('metric_definition_id', sa.String(),
                  sa.ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=True),
        sa.Column('operator', sa.String(), nullable=True),
        sa.Column('target_value', sa.Numeric(14, 4), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint("kind IN ('single_session', 'cumulative', 'consistency')", name='ck_goal_conditions_kind'),
        sa.CheckConstraint(
            "(kind = 'single_session' AND measure IN ('sets', 'yield'))"
            " OR (kind = 'cumulative' AND measure IN ('metric', 'yield'))"
            " OR (kind = 'consistency' AND measure = 'sets')",
            name='ck_goal_conditions_kind_measure',
        ),
        sa.CheckConstraint("measure <> 'sets' OR kind <> 'single_session' OR min_sets >= 1",
                           name='ck_goal_conditions_min_sets'),
        sa.CheckConstraint("kind <> 'consistency' OR required_count >= 1", name='ck_goal_conditions_required_count'),
        sa.CheckConstraint(
            "measure NOT IN ('yield', 'metric') OR (target_value IS NOT NULL AND operator IN ('>=', '>', '<=', '<'))",
            name='ck_goal_conditions_total',
        ),
        sa.CheckConstraint("measure <> 'metric' OR metric_definition_id IS NOT NULL", name='ck_goal_conditions_metric'),
    )
    op.create_index('ix_goal_completion_conditions_goal_id', 'goal_completion_conditions', ['goal_id'])
    op.create_index('ix_goal_completion_conditions_root_id', 'goal_completion_conditions', ['root_id'])
    op.create_index('ix_goal_completion_conditions_activity_definition_id', 'goal_completion_conditions',
                    ['activity_definition_id'])
    op.create_index('uq_goal_completion_conditions_live_goal', 'goal_completion_conditions', ['goal_id'],
                    unique=True, postgresql_where=sa.text('deleted_at IS NULL'))

    op.create_table(
        'goal_condition_metric_rules',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('condition_id', sa.String(),
                  sa.ForeignKey('goal_completion_conditions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('metric_definition_id', sa.String(),
                  sa.ForeignKey('metric_definitions.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('operator', sa.String(), nullable=False),
        sa.Column('value', sa.Numeric(14, 4), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.UniqueConstraint('condition_id', 'metric_definition_id', name='uq_goal_condition_rule_metric'),
        sa.CheckConstraint("operator IN ('>=', '>', '<=', '<', '==')", name='ck_goal_condition_rules_operator'),
    )
    op.create_index('ix_goal_condition_metric_rules_condition_id', 'goal_condition_metric_rules', ['condition_id'])

    op.add_column('goals', sa.Column('completion_condition', sa.String(), nullable=False, server_default='manual'))
    op.add_column('goals', sa.Column('started_at', sa.DateTime(), nullable=True))
    op.execute('UPDATE goals SET started_at = COALESCE(created_at, now())')
    op.alter_column('goals', 'started_at', nullable=False, server_default=sa.func.now())
    op.add_column('goals', sa.Column('sequence_track_id', sa.String(), nullable=True))
    op.add_column('goals', sa.Column('sequence_position', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_goals_sequence_track_id_goal_sequence_tracks', 'goals', 'goal_sequence_tracks',
        ['sequence_track_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_goals_sequence_track_id', 'goals', ['sequence_track_id'])
    op.create_index(
        'uq_goals_sequence_track_position', 'goals', ['sequence_track_id', 'sequence_position'], unique=True,
        postgresql_where=sa.text('sequence_track_id IS NOT NULL AND deleted_at IS NULL'),
    )

    op.add_column('goal_pause_intervals',
                  sa.Column('reason', sa.String(), nullable=False, server_default='manual'))
    op.add_column('goal_pause_intervals', sa.Column('resumed_by_goal_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_goal_pause_intervals_resumed_by_goal_id_goals', 'goal_pause_intervals', 'goals',
        ['resumed_by_goal_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_goal_pause_intervals_resumed_by_goal_id', 'goal_pause_intervals', ['resumed_by_goal_id'])
    op.create_check_constraint('ck_goal_pause_intervals_reason', 'goal_pause_intervals',
                               "reason IN ('manual', 'sequence')")

    _convert_targets(op.get_bind())
    _complete_goals_already_met(op.get_bind())

    op.execute("""
        UPDATE goals SET completion_source = CASE
            WHEN completion_source = 'target' THEN 'condition'
            WHEN completion_source IN ('condition', 'children', 'manual', 'manual_override') THEN completion_source
            ELSE 'manual'
        END
        WHERE completion_source IS NOT NULL
    """)
    op.create_check_constraint(
        'ck_goals_completion_condition', 'goals', "completion_condition IN ('activity_threshold', 'children', 'manual')",
    )
    op.create_check_constraint(
        'ck_goals_completion_source', 'goals',
        "completion_source IS NULL OR completion_source IN ('condition', 'children', 'manual', 'manual_override')",
    )
    op.create_check_constraint(
        'ck_goals_sequence_pair', 'goals', '(sequence_track_id IS NULL) = (sequence_position IS NULL)',
    )


def _table_names(bind):
    return set(sa.inspect(bind).get_table_names())


def _convert_targets(bind):
    from services.target_condition_conversion import load_conversion_inputs, plan_conversion

    inputs = load_conversion_inputs(bind)
    if inputs is None:
        return
    goals, targets, metric_conditions, child_sort_start = inputs
    plan = plan_conversion(goals, targets, metric_conditions, child_sort_start=child_sort_start)
    now = _now()
    level_ids = {}

    def level_id_for(name, known_id=None):
        if known_id or not name:
            return known_id
        if name not in level_ids:
            found = bind.execute(sa.text(
                'SELECT id FROM goal_levels WHERE name = :name AND owner_id IS NULL AND deleted_at IS NULL LIMIT 1'
            ), {'name': name}).scalar()
            if not found:
                found = str(uuid.uuid4())
                bind.execute(sa.text(
                    'INSERT INTO goal_levels (id, name, rank, created_at, updated_at) VALUES (:id, :name, :rank, :now, :now)'
                ), {'id': found, 'name': name, 'rank': _LEVEL_RANKS.get(name, 0), 'now': now})
            level_ids[name] = found
        return level_ids[name]

    for track in plan.tracks:
        bind.execute(sa.text("""
            INSERT INTO goal_sequence_tracks (id, root_id, parent_goal_id, level_id, created_at, updated_at)
            VALUES (:id, :root_id, :parent_goal_id, :level_id, :now, :now)
        """), {'id': track.id, 'root_id': track.root_id, 'parent_goal_id': track.parent_goal_id,
               'level_id': level_id_for(track.level_name, track.level_id), 'now': now})

    for goal in plan.new_goals:
        bind.execute(sa.text("""
            INSERT INTO goals (id, level_id, name, description, deadline, completed, completed_at, completed_session_id,
                               completion_source, completion_reason, created_at, updated_at, parent_id, sort_order,
                               root_id, owner_id, inherit_parent_activities, track_activities, paused, paused_at,
                               completion_condition, started_at, sequence_track_id, sequence_position, row_version)
            VALUES (:id, :level_id, :name, '', :deadline, :completed, :completed_at, :completed_session_id,
                    :completion_source, :completion_reason, :now, :now, :parent_id, :sort_order,
                    :root_id, :owner_id, :inherit_parent_activities, true, :paused, :paused_at,
                    :completion_condition, :started_at, :sequence_track_id, :sequence_position, 1)
        """), {
            'id': goal.id, 'level_id': level_id_for(goal.level_name, goal.level_id), 'name': goal.name, 'deadline': goal.deadline,
            'completed': goal.completed, 'completed_at': goal.completed_at,
            'completed_session_id': goal.completed_session_id, 'completion_source': goal.completion_source,
            'completion_reason': 'converted_from_target' if goal.completed else None, 'now': now,
            'parent_id': goal.parent_id, 'sort_order': goal.sort_order, 'root_id': goal.root_id,
            'owner_id': goal.owner_id, 'inherit_parent_activities': goal.inherit_parent_activities,
            'paused': goal.paused, 'paused_at': now if goal.paused else None,
            'completion_condition': goal.completion_condition, 'started_at': goal.started_at or now,
            'sequence_track_id': goal.sequence_track_id, 'sequence_position': goal.sequence_position,
        })
        if goal.paused:
            bind.execute(sa.text("""
                INSERT INTO goal_pause_intervals (id, goal_id, root_id, paused_at, reason, created_at)
                VALUES (:id, :goal_id, :root_id, :now, 'sequence', :now)
            """), {'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'conversion-pause:{goal.id}')),
                   'goal_id': goal.id, 'root_id': goal.root_id, 'now': now})

    for goal_id, values in plan.goal_updates.items():
        assignments = ', '.join(f'{column} = :{column}' for column in values)
        bind.execute(sa.text(f'UPDATE goals SET {assignments} WHERE id = :goal_id'), {**values, 'goal_id': goal_id})

    for condition in plan.conditions:
        bind.execute(sa.text("""
            INSERT INTO goal_completion_conditions (id, goal_id, root_id, activity_definition_id, kind, measure,
                min_sets, required_count, metric_definition_id, operator, target_value, created_at, updated_at)
            VALUES (:id, :goal_id, :root_id, :activity_definition_id, :kind, :measure, :min_sets, :required_count,
                    :metric_definition_id, :operator, :target_value, :now, :now)
        """), {**{key: getattr(condition, key) for key in (
            'id', 'goal_id', 'root_id', 'activity_definition_id', 'kind', 'measure', 'min_sets', 'required_count',
            'metric_definition_id', 'operator', 'target_value')}, 'now': now})
        for rule in condition.rules:
            bind.execute(sa.text("""
                INSERT INTO goal_condition_metric_rules (id, condition_id, metric_definition_id, operator, value, position)
                VALUES (:id, :condition_id, :metric_definition_id, :operator, :value, :position)
            """), {**rule, 'condition_id': condition.id})

    for goal_id, activity_id in plan.activity_associations:
        bind.execute(sa.text("""
            INSERT INTO activity_goal_associations (activity_id, goal_id, created_at)
            VALUES (:activity_id, :goal_id, :now)
            ON CONFLICT (activity_id, goal_id) DO UPDATE SET deleted_at = NULL
        """), {'activity_id': activity_id, 'goal_id': goal_id, 'now': now})

    for source_goal_id, goal_id in plan.program_memberships:
        bind.execute(sa.text("""
            INSERT INTO program_goals (program_id, goal_id, created_at)
            SELECT program_id, :goal_id, :now FROM program_goals WHERE goal_id = :source_goal_id
            ON CONFLICT DO NOTHING
        """), {'goal_id': goal_id, 'source_goal_id': source_goal_id, 'now': now})


MET_AT_MIGRATION = 'condition_met_at_migration'


def _complete_goals_already_met(bind):
    """Complete incomplete goals whose new condition existing evidence already satisfies.

    Old targets counted evidence only from their own creation; conditions use the goal's active
    period, so earlier achievements now count. Completed goals are never reverted here.
    """
    from migrations.condition_backfill import met_conditions

    completed = []
    root_ids = [row[0] for row in bind.execute(sa.text("""
        SELECT DISTINCT g.root_id FROM goals g
        WHERE g.completion_condition = 'activity_threshold' AND g.deleted_at IS NULL AND NOT COALESCE(g.completed, false)
    """))]
    for root_id in root_ids:
        for goal, evaluation in met_conditions(bind, root_id):
            completed.append((goal.id, goal.name, evaluation.achieved_at.replace(tzinfo=None),
                              evaluation.achieving_session_id))
    for goal_id, name, achieved_at, session_id in completed:
        bind.execute(sa.text("""
            UPDATE goals SET completed = true, completed_at = :achieved_at, completed_session_id = :session_id,
                             completion_source = 'condition', completion_reason = :reason,
                             manually_uncompleted_at = NULL
            WHERE id = :goal_id
        """), {'achieved_at': achieved_at, 'session_id': session_id, 'reason': MET_AT_MIGRATION, 'goal_id': goal_id})
        logger.info('Completed goal already meeting its condition: %s (%s) at %s', name, goal_id, achieved_at)


def _generated_goal_ids(bind):
    from services.target_condition_conversion import _stable_id
    if 'targets' not in _table_names(bind):
        return []
    target_ids = bind.execute(sa.text('SELECT id FROM targets')).scalars().all()
    return [_stable_id('goal-from-target', target_id) for target_id in target_ids]


def downgrade():
    bind = op.get_bind()
    op.drop_constraint('ck_goals_sequence_pair', 'goals', type_='check')
    op.drop_constraint('ck_goals_completion_source', 'goals', type_='check')
    op.drop_constraint('ck_goals_completion_condition', 'goals', type_='check')
    bind.execute(sa.text("""
        UPDATE goals SET completed = false, completed_at = NULL, completed_session_id = NULL,
                         completion_source = NULL, completion_reason = NULL
        WHERE completion_reason = :reason
    """), {'reason': MET_AT_MIGRATION})
    generated = _generated_goal_ids(bind)
    if generated:
        bind.execute(sa.text('DELETE FROM goals WHERE id = ANY(:ids)'), {'ids': generated})
    op.execute("UPDATE goals SET completion_source = 'target' WHERE completion_source = 'condition'")
    op.execute("UPDATE goals SET completion_source = 'manual' WHERE completion_source = 'manual_override'")

    op.drop_constraint('ck_goal_pause_intervals_reason', 'goal_pause_intervals', type_='check')
    op.drop_index('ix_goal_pause_intervals_resumed_by_goal_id', table_name='goal_pause_intervals')
    op.drop_constraint('fk_goal_pause_intervals_resumed_by_goal_id_goals', 'goal_pause_intervals', type_='foreignkey')
    op.drop_column('goal_pause_intervals', 'resumed_by_goal_id')
    op.drop_column('goal_pause_intervals', 'reason')

    op.drop_index('uq_goals_sequence_track_position', table_name='goals')
    op.drop_index('ix_goals_sequence_track_id', table_name='goals')
    op.drop_constraint('fk_goals_sequence_track_id_goal_sequence_tracks', 'goals', type_='foreignkey')
    op.drop_column('goals', 'sequence_position')
    op.drop_column('goals', 'sequence_track_id')
    op.drop_column('goals', 'started_at')
    op.drop_column('goals', 'completion_condition')

    op.drop_index('ix_goal_condition_metric_rules_condition_id', table_name='goal_condition_metric_rules')
    op.drop_table('goal_condition_metric_rules')
    op.drop_index('uq_goal_completion_conditions_live_goal', table_name='goal_completion_conditions')
    op.drop_index('ix_goal_completion_conditions_activity_definition_id', table_name='goal_completion_conditions')
    op.drop_index('ix_goal_completion_conditions_root_id', table_name='goal_completion_conditions')
    op.drop_index('ix_goal_completion_conditions_goal_id', table_name='goal_completion_conditions')
    op.drop_table('goal_completion_conditions')
    op.drop_index('ix_goal_sequence_tracks_parent_goal_id', table_name='goal_sequence_tracks')
    op.drop_index('ix_goal_sequence_tracks_root_id', table_name='goal_sequence_tracks')
    op.drop_table('goal_sequence_tracks')
