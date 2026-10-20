"""Migration A converts live targets, and reverses cleanly, against PostgreSQL."""
from datetime import datetime
import importlib.util
from pathlib import Path
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
import pytest
from sqlalchemy import inspect, text

from services.target_condition_conversion import _stable_id

LEGACY_TABLES = """
CREATE TABLE targets (
    id VARCHAR PRIMARY KEY, goal_id VARCHAR NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    root_id VARCHAR NOT NULL, activity_id VARCHAR, activity_instance_id VARCHAR, name VARCHAR NOT NULL,
    type VARCHAR, time_scope VARCHAR, frequency_count INTEGER, completed BOOLEAN, completed_at TIMESTAMP,
    completed_session_id VARCHAR, created_at TIMESTAMP, deleted_at TIMESTAMP
);
CREATE TABLE target_metric_conditions (
    id VARCHAR PRIMARY KEY, target_id VARCHAR NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    metric_definition_id VARCHAR NOT NULL, operator VARCHAR NOT NULL, target_value INTEGER NOT NULL
);
"""


def _migration(filename='e1a2c3d4f5b6_goal_completion_conditions.py'):
    path = Path(__file__).resolve().parents[2] / 'migrations/versions' / filename
    spec = importlib.util.spec_from_file_location(f'migration_{path.stem}', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Revisions after migration A that reshape what it creates, or retire what it left behind;
# re-applied whenever A is rebuilt so later tests see the schema the models describe.
LATER_REVISIONS = (
    'f3c4d5e6a7b8_relax_goal_sequence_pair_check.py',
    'a4b5c6d7e8f9_drop_legacy_targets.py',
    'c6d7e8f9a0b1_retire_relevance_statements.py',
)


@pytest.mark.integration
def test_migration_converts_targets_and_is_reversible(db_session, sample_goal_hierarchy, sample_activity_definition):
    module = _migration()
    root_id = sample_goal_hierarchy['ultimate'].id
    mid_id, short_id = sample_goal_hierarchy['mid_term'].id, sample_goal_hierarchy['short_term'].id
    activity_id = sample_activity_definition.id
    weight_id = next(metric.id for metric in sample_activity_definition.metric_definitions if metric.name == 'Weight')
    immediate_id = str(uuid.uuid4())
    db_session.close()

    engine = db_session.get_bind()
    try:
        with engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                module.downgrade()
                assert 'goal_completion_conditions' not in inspect(connection).get_table_names()
                connection.execute(text(LEGACY_TABLES))
                levels = {}
                for name, rank in (('Mid Term Goal', 2), ('Short Term Goal', 3), ('Immediate Goal', 4)):
                    levels[name] = connection.execute(text(
                        'SELECT id FROM goal_levels WHERE name = :name AND owner_id IS NULL LIMIT 1'
                    ), {'name': name}).scalar() or str(uuid.uuid4())
                    connection.execute(text(
                        'INSERT INTO goal_levels (id, name, rank) VALUES (:id, :name, :rank) ON CONFLICT DO NOTHING'
                    ), {'id': levels[name], 'name': name, 'rank': rank})
                connection.execute(text('UPDATE goals SET level_id = :level WHERE id = :goal'),
                                   {'level': levels['Mid Term Goal'], 'goal': mid_id})
                level_id = levels['Immediate Goal']
                connection.execute(text("""
                    INSERT INTO goals (id, name, parent_id, root_id, level_id, created_at, completed, row_version,
                                       inherit_parent_activities)
                    VALUES (:id, 'Immediate', :parent, :root, :level, now(), false, 1, false)
                """), {'id': immediate_id, 'parent': short_id, 'root': root_id, 'level': level_id})
                rows = [
                    ('t-short', short_id, 'threshold', None),
                    ('t-mid-1', mid_id, 'threshold', None), ('t-mid-2', mid_id, 'frequency', 3),
                    ('t-imm-1', immediate_id, 'threshold', None), ('t-imm-2', immediate_id, 'threshold', None),
                ]
                for index, (target_id, goal_id, kind, frequency) in enumerate(rows):
                    connection.execute(text("""
                        INSERT INTO targets (id, goal_id, root_id, activity_id, name, type, frequency_count,
                                             completed, created_at)
                        VALUES (:id, :goal, :root, :activity, :name, :type, :frequency, false, :created)
                    """), {'id': target_id, 'goal': goal_id, 'root': root_id, 'activity': activity_id,
                           'name': target_id, 'type': kind, 'frequency': frequency,
                           'created': datetime(2026, 9, 1, 0, index)})
                    connection.execute(text("""
                        INSERT INTO target_metric_conditions (id, target_id, metric_definition_id, operator, target_value)
                        VALUES (:id, :target, :metric, '>=', 225)
                    """), {'id': f'c-{target_id}', 'target': target_id, 'metric': weight_id})

                module.upgrade()

                goals = {row.id: row for row in connection.execute(text(
                    'SELECT id, parent_id, level_id, completion_condition, sequence_track_id, sequence_position, paused '
                    'FROM goals'
                ))}
                assert goals[short_id].completion_condition == 'activity_threshold'
                assert goals[mid_id].completion_condition == 'children'
                children = [_stable_id('goal-from-target', 't-mid-1'), _stable_id('goal-from-target', 't-mid-2')]
                assert all(goals[child].parent_id == mid_id for child in children)
                assert all(goals[child].level_id == levels['Short Term Goal'] for child in children)
                sibling = goals[_stable_id('goal-from-target', 't-imm-2')]
                assert (sibling.parent_id, sibling.sequence_position, sibling.paused) == (short_id, 2, True)
                assert goals[immediate_id].sequence_position == 1
                assert sibling.level_id == level_id
                kinds = dict(connection.execute(text('SELECT goal_id, kind FROM goal_completion_conditions')).all())
                assert kinds[children[1]] == 'consistency'
                assert connection.execute(text(
                    "SELECT count(*) FROM goal_pause_intervals WHERE reason = 'sequence'"
                )).scalar() == 1
                assert connection.execute(text(
                    'SELECT count(*) FROM activity_goal_associations WHERE goal_id = :goal'
                ), {'goal': short_id}).scalar() == 1

                module.downgrade()
                remaining = {row[0] for row in connection.execute(text('SELECT id FROM goals'))}
                assert not set(children) & remaining
                assert 'goal_sequence_tracks' not in inspect(connection).get_table_names()
    finally:
        with engine.begin() as connection:
            if 'goal_completion_conditions' not in inspect(connection).get_table_names():
                with Operations.context(MigrationContext.configure(connection)):
                    connection.execute(text('DROP TABLE IF EXISTS target_metric_conditions'))
                    connection.execute(text('DROP TABLE IF EXISTS targets'))
                    module.upgrade()
            with Operations.context(MigrationContext.configure(connection)):
                for filename in LATER_REVISIONS:
                    _migration(filename).upgrade()
            connection.execute(text('DROP TABLE IF EXISTS target_metric_conditions'))
            connection.execute(text('DROP TABLE IF EXISTS targets'))
