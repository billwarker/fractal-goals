import pytest

from models import VisualizationAnnotation


@pytest.mark.integration
class TestAnnotationsApi:
    def test_create_and_get_annotations(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id

        create_response = authed_client.post(
            f"/api/roots/{root_id}/annotations",
            json={
                "visualization_type": "goal-analytics",
                "visualization_context": {"view": "weekly"},
                "selected_points": [{"x": 1, "y": 2}],
                "content": "Investigate this spike",
            },
        )

        assert create_response.status_code == 201
        annotation_id = create_response.get_json()["data"]["id"]

        list_response = authed_client.get(
            f"/api/roots/{root_id}/annotations",
            query_string={"visualization_type": "goal-analytics"},
        )

        assert list_response.status_code == 200
        payload = list_response.get_json()["data"]
        assert any(annotation["id"] == annotation_id for annotation in payload)

        stored = db_session.query(VisualizationAnnotation).filter_by(id=annotation_id).first()
        assert stored is not None

    def test_update_and_delete_annotation(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        annotation = VisualizationAnnotation(
            root_id=root_id,
            visualization_type="goal-analytics",
            selected_points=[{"x": 3, "y": 4}],
            content="Original note",
        )
        db_session.add(annotation)
        db_session.commit()

        update_response = authed_client.put(
            f"/api/roots/{root_id}/annotations/{annotation.id}",
            json={"content": "Updated note"},
        )
        assert update_response.status_code == 200
        assert update_response.get_json()["data"]["content"] == "Updated note"

        delete_response = authed_client.delete(f"/api/roots/{root_id}/annotations/{annotation.id}")
        assert delete_response.status_code == 200

        db_session.refresh(annotation)
        assert annotation.deleted_at is not None
