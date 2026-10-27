"""Media attached to goal descriptions: saving, authorization, playback, usage, deletion and loading."""
import time

import pytest
from cryptography.fernet import Fernet

from config import config
from models import Goal, GoalAttachment, StorageConnection
from services import storage_providers as providers
from services.goal_loading import load_fractal_goals_for_serialization
from services.goal_service import GoalService
from services.media_service import MediaService
from services.serializers import serialize_goal
from services.storage_common import StorageError, seal
from services.storage_connection_service import StorageConnectionService


@pytest.fixture
def setup(db_session, test_user, sample_goal_hierarchy, monkeypatch):
    for key, value in {'STORAGE_ENCRYPTION_KEYS': Fernet.generate_key().decode(),
                       'GOOGLE_DRIVE_CLIENT_ID': 'client', 'GOOGLE_DRIVE_CLIENT_SECRET': 'secret',
                       'GOOGLE_PICKER_API_KEY': 'k', 'GOOGLE_PICKER_APP_ID': '1',
                       'APP_BASE_URL': 'https://app.example.test'}.items():
        monkeypatch.setattr(config, key, value)
    connection = StorageConnection(user_id=test_user.id, provider='google_drive', account_id='acct', account_label='me',
                                   credentials=seal({'access_token': 't', 'refresh_token': 'r', 'expires_at': time.time() + 3600}))
    db_session.add(connection)
    db_session.commit()
    root = sample_goal_hierarchy['ultimate']
    asset = MediaService(db_session).store_asset(root.id, connection.id, {
        'file_id': 'file-1', 'name': 'form.png', 'mime_type': 'image/png', 'size_bytes': 10, 'revision': 'r1'})
    db_session.commit()
    goal = sample_goal_hierarchy['long_term']
    return type('Setup', (), {'db': db_session, 'user': test_user, 'root': root, 'goal': goal, 'asset': asset,
                              'connection': connection, 'service': GoalService(db_session)})


def attach(setup, attachments):
    return setup.service.update_fractal_goal(setup.root.id, setup.goal.id, setup.user.id, {'attachments': attachments})


def test_goal_update_saves_reorders_and_clears_description_media(setup):
    goal, error, status = attach(setup, [{'asset_id': setup.asset.id, 'alt_text': 'Form check'}])
    assert error is None and status == 200
    assert serialize_goal(goal, include_children=False)['attachments'][0]['alt_text'] == 'Form check'
    goal, error, _ = attach(setup, [])
    assert error is None and setup.db.query(GoalAttachment).count() == 0
    assert setup.db.query(Goal).filter_by(id=setup.goal.id).one().description is not None


def test_goal_attachments_reject_foreign_or_disconnected_assets(setup):
    _, error, status = attach(setup, [{'asset_id': 'missing'}])
    assert status == 404 and error
    setup.connection.deactivate('disconnected')
    setup.db.commit()
    _, error, status = attach(setup, [{'asset_id': setup.asset.id}])
    assert status == 404


def test_description_media_is_playable_until_the_goal_is_deleted(setup):
    media = MediaService(setup.db)
    with pytest.raises(StorageError):
        media.playable_asset(setup.root.id, setup.user.id, setup.asset.id)
    attach(setup, [{'asset_id': setup.asset.id}])
    assert media.playable_asset(setup.root.id, setup.user.id, setup.asset.id).id == setup.asset.id
    with pytest.raises(StorageError):
        media.playable_asset(setup.root.id, 'someone-else', setup.asset.id)
    from datetime import datetime
    setup.goal.deleted_at = datetime(2026, 10, 27)
    setup.db.commit()
    with pytest.raises(StorageError):
        media.playable_asset(setup.root.id, setup.user.id, setup.asset.id)


def test_usage_settings_counts_and_cloud_deletion_include_goals(setup, monkeypatch):
    attach(setup, [{'asset_id': setup.asset.id}])
    media = MediaService(setup.db)
    assert media.usage(setup.root.id, setup.user.id, setup.asset.id) == {'notes': 0, 'goals': 1, 'provider': 'google_drive'}
    drive = StorageConnectionService(setup.db).list_connections(setup.user.id)['providers'][0]
    assert drive['attachment_count'] == 1
    monkeypatch.setattr(providers, 'trash', lambda *args: None)
    assert media.delete_from_storage(setup.root.id, setup.user.id, setup.asset.id)['goals_updated'] == 1
    assert setup.db.query(GoalAttachment).count() == 0


def test_goal_trees_do_not_load_description_media(setup):
    attach(setup, [{'asset_id': setup.asset.id}])
    setup.db.expire_all()
    goals = load_fractal_goals_for_serialization(setup.db, setup.root.id)
    assert 'attachments' not in serialize_goal(goals[setup.goal.id], include_children=False)


def test_description_media_is_read_on_demand(setup, authed_client):
    attach(setup, [{'asset_id': setup.asset.id, 'alt_text': 'Form'}])
    response = authed_client.get(f'/api/{setup.root.id}/goals/{setup.goal.id}/attachments')
    assert response.status_code == 200
    assert [(item['id'], item['alt_text']) for item in response.get_json()] == [(setup.asset.id, 'Form')]
    assert response.headers['Cache-Control'] == 'private, no-store'
    assert authed_client.get(f'/api/{setup.root.id}/goals/missing/attachments').status_code == 404
    with pytest.raises(StorageError):
        MediaService(setup.db).goal_attachments(setup.root.id, 'someone-else', setup.goal.id)


def test_http_goal_update_accepts_attachments(setup, authed_client):
    response = authed_client.put(f'/api/{setup.root.id}/goals/{setup.goal.id}', json={'attachments': [{'asset_id': setup.asset.id}]})
    assert response.status_code == 200
    assert response.get_json()['attachments'][0]['id'] == setup.asset.id
    bad = authed_client.put(f'/api/{setup.root.id}/goals/{setup.goal.id}', json={'attachments': [{'asset_id': setup.asset.id, 'extra': 1}]})
    assert bad.status_code == 400
