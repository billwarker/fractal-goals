"""Additive storage migration preserves notes and can be reversed on PostgreSQL."""
import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, text


def load_migration(filename):
    path = Path(__file__).resolve().parents[2] / 'migrations/versions' / filename
    spec = importlib.util.spec_from_file_location(filename.removesuffix('.py'), path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Later revisions that build on e2f4a6c8d0b3's tables, in upgrade order. Reversing the
# original migration requires unwinding these first, exactly as `alembic downgrade` would.
STORAGE_DEPENDENTS = (
    'f3a5c7e9b1d4_storage_connection_status.py',
    'a6c8e0b2d4f7_storage_upload_default.py',
    'c9e1a3b5d7f2_goal_attachments.py',  # goal_attachments references media_assets.
)


def test_storage_migration_preserves_existing_notes(db_session, sample_ultimate_goal):
    from models import Note
    note = Note(root_id=sample_ultimate_goal.id, context_type='root', context_id=sample_ultimate_goal.id, content='Existing text')
    db_session.add(note)
    db_session.flush()
    note_id = note.id
    db_session.commit()
    module = load_migration('e2f4a6c8d0b3_external_storage_attachments.py')
    dependents = [load_migration(filename) for filename in STORAGE_DEPENDENTS]
    with db_session.get_bind().begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            for dependent in reversed(dependents):
                dependent.downgrade()
            module.downgrade()
            assert 'media_assets' not in inspect(connection).get_table_names()
            module.upgrade()
            assert 'media_assets' in inspect(connection).get_table_names()
            assert connection.execute(text('SELECT content FROM notes WHERE id = :id'), {'id': note_id}).scalar() == 'Existing text'
            assert all(key['options']['ondelete'] == 'CASCADE' for key in inspect(connection).get_foreign_keys('note_attachments'))
            for dependent in dependents:  # Leave the schema at head.
                dependent.upgrade()
            assert 'goal_attachments' in inspect(connection).get_table_names()


def test_connection_status_migration_backfills_and_reverses(db_session, test_user):
    from models import StorageConnection
    db_session.add_all([
        StorageConnection(user_id=test_user.id, provider='google_drive', account_id='g', account_label='g', credentials='sealed'),
        StorageConnection(user_id=test_user.id, provider='dropbox', account_id='d', account_label='d',
                          credentials=None, status='disconnected'),
    ])
    db_session.commit()
    module = load_migration('f3a5c7e9b1d4_storage_connection_status.py')
    with db_session.get_bind().begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            upload_default = load_migration('a6c8e0b2d4f7_storage_upload_default.py')
            upload_default.downgrade()
            module.downgrade()
            assert 'status' not in {column['name'] for column in inspect(connection).get_columns('storage_connections')}
            module.upgrade()
            rows = dict(connection.execute(text('SELECT provider, status FROM storage_connections')).all())
            assert rows == {'google_drive': 'active', 'dropbox': 'disconnected'}
            assert connection.execute(text(
                'SELECT count(*) FROM storage_connections WHERE connected_at IS NULL OR updated_at IS NULL')).scalar() == 0
            upload_default.upgrade()
            assert connection.execute(text('SELECT bool_or(upload_default) FROM storage_connections')).scalar() is False
