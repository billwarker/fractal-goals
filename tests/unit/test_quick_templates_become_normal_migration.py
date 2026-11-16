"""Quick templates become one-section templates, reversibly; session_type leaves every template."""

import json
from importlib import import_module

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _templates(connection):
    rows = connection.exec_driver_sql("SELECT id, template_data FROM session_templates ORDER BY id").all()
    return {row[0]: json.loads(row[1]) for row in rows}


def test_quick_templates_become_one_section_templates_and_back(monkeypatch):
    migration = import_module("migrations.versions.aa1d1082d073_quick_templates_become_normal")
    engine = sa.create_engine("sqlite:///:memory:")
    quick = {'session_type': 'quick', 'template_color': '#123456', 'activities': [
        {'activity_id': 'a-1', 'name': 'Weigh-in'}, 'a-2', {'activityId': 'a-3'}, {'name': 'no id'},
    ]}
    normal = {'session_type': 'normal', 'sections': [{'name': 'Main', 'items': []}]}
    untyped = {'sections': [{'name': 'Main', 'items': []}]}
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE session_templates (id VARCHAR PRIMARY KEY, template_data TEXT)")
        for template_id, data in (('1-quick', quick), ('2-normal', normal), ('3-untyped', untyped)):
            connection.exec_driver_sql(
                "INSERT INTO session_templates VALUES (?, ?)", (template_id, json.dumps(data)),
            )
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))

        migration.upgrade()
        after = _templates(connection)
        converted = after['1-quick']
        assert 'session_type' not in converted and 'activities' not in converted
        assert converted['converted_from_quick'] is True
        assert converted['template_color'] == '#123456'
        [section] = converted['sections']
        assert section['name'] == 'Activities'
        assert [item['activity_id'] for item in section['items']] == ['a-1', 'a-2', 'a-3']
        assert all(item['type'] == 'activity' and item['item_key'] for item in section['items'])
        assert section['items'][0]['name'] == 'Weigh-in'
        assert after['2-normal'] == untyped
        assert after['3-untyped'] == untyped

        migration.upgrade()
        assert _templates(connection) == after

        migration.downgrade()
        restored = _templates(connection)
        assert restored['1-quick']['session_type'] == 'quick'
        assert [item.get('activity_id') for item in restored['1-quick']['activities']] == ['a-1', 'a-2', 'a-3']
        assert 'sections' not in restored['1-quick']
        assert restored['2-normal'] == normal
