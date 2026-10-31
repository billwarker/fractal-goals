"""Tag-scoped activity thresholds and consistency streaks, end to end."""
from datetime import timedelta
import json
from pathlib import Path
import uuid

import pytest

from models import ActivityTagDefinition
from tests.integration.test_goal_conditions_api import (
    _complete,
    _create_goal,
    _goal,
    _instance,
    _metric,
    _now,
    _session,
    _threshold,
)


def _tag(db_session, root, name):
    tag = ActivityTagDefinition(id=str(uuid.uuid4()), root_id=root.id, name=name)
    db_session.add(tag)
    db_session.commit()
    return tag


def _put_tags(client, root_id, path, tag_ids):
    response = client.put(f"/api/{root_id}/{path}/tags", json={"tag_ids": tag_ids})
    assert response.status_code == 200, response.get_json()


def _consistency(activity, *, reps, required_count, **extra):
    return {
        "activity_definition_id": activity.id, "kind": "consistency", "measure": "sets",
        "required_count": required_count,
        "rules": [{"metric_definition_id": _metric(activity, "Reps").id, "operator": ">=", "value": reps}],
        **extra,
    }


@pytest.mark.integration
class TestTaggedThresholds:
    def test_tags_round_trip_and_reject_foreign_or_excess_tags(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        strict = _tag(db_session, root, "Strict")
        goal = _create_goal(authed_client, root.id, root.id, {
            **_threshold(sample_activity_definition), "tag_ids": [strict.id, strict.id],
        })

        assert goal["condition"]["tag_ids"] == [strict.id]
        assert goal["condition"]["tags"][0]["name"] == "Strict"
        assert goal["condition"]["consecutive"] is False

        for tag_ids, message in (
            ([str(uuid.uuid4())], "Choose tags in this fractal"),
            ([f"t{index}" for index in range(11)], "Use at most 10 tags"),
        ):
            response = authed_client.put(f"/api/{root.id}/goals/{goal['id']}/condition", json={
                "completion_condition": "activity_threshold",
                "condition": {**_threshold(sample_activity_definition), "tag_ids": tag_ids},
            })
            assert response.status_code == 400
            assert response.get_json()["error"] == message

    def test_retagging_a_set_completes_and_reverts_the_goal(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        strict = _tag(db_session, root, "Strict")
        goal = _create_goal(authed_client, root.id, root.id, {
            **_threshold(sample_activity_definition, weight=100), "tag_ids": [strict.id],
        })
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 150}],
                             occurred=_now() + timedelta(minutes=1))

        assert _complete(authed_client, root.id, instance)["completed_goals"] == []
        assert _goal(db_session, goal["id"]).completed is False

        set_id = instance.sets[0].id
        _put_tags(authed_client, root.id, f"activity-sets/{set_id}", [strict.id])
        stored = _goal(db_session, goal["id"])
        assert stored.completed is True
        assert stored.completion_source == "condition"

        _put_tags(authed_client, root.id, f"activity-sets/{set_id}", [])
        assert _goal(db_session, goal["id"]).completed is False

    def test_instance_tags_are_inherited_by_its_sets(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        strict = _tag(db_session, root, "Strict")
        goal = _create_goal(authed_client, root.id, root.id, {
            **_threshold(sample_activity_definition, weight=100), "tag_ids": [strict.id],
        })
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 150}],
                             occurred=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, instance)

        _put_tags(authed_client, root.id, f"activity-instances/{instance.id}", [strict.id])

        assert _goal(db_session, goal["id"]).completed is True

    def test_merging_a_tag_repoints_the_condition_and_reconciles(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        strict, clean = _tag(db_session, root, "Strict"), _tag(db_session, root, "Clean")
        goal = _create_goal(authed_client, root.id, root.id, {
            **_threshold(sample_activity_definition, weight=100), "tag_ids": [clean.id],
        })
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 150}],
                             occurred=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, instance)
        _put_tags(authed_client, root.id, f"activity-sets/{instance.sets[0].id}", [strict.id])
        assert _goal(db_session, goal["id"]).completed is False

        db_session.expire_all()
        versions = {tag.id: tag.version for tag in db_session.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.id.in_([strict.id, clean.id]),
        )}
        response = authed_client.post(f"/api/{root.id}/activity-tags/merge", json={
            "target_id": clean.id, "source_ids": [strict.id], "versions": versions,
        })
        assert response.status_code == 200, response.get_json()

        stored = _goal(db_session, goal["id"])
        assert [tag.id for tag in stored.condition.tags] == [clean.id]
        assert stored.completed is True


@pytest.mark.integration
class TestConsecutiveThresholds:
    def test_consecutive_is_only_for_consistency(
        self, authed_client, sample_ultimate_goal, sample_activity_definition,
    ):
        response = authed_client.post(f"/api/{sample_ultimate_goal.id}/goals", json={
            "name": "Bad", "type": "ShortTermGoal", "parent_id": sample_ultimate_goal.id,
            "completion_condition": "activity_threshold",
            "condition": {**_threshold(sample_activity_definition), "consecutive": True},
        })

        assert response.status_code == 400
        assert response.get_json()["error"] == "Only consistency thresholds can require a streak"

    def test_a_miss_resets_the_streak(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _consistency(
            sample_activity_definition, reps=5, required_count=2, consecutive=True,
        ))
        assert goal["condition"]["consecutive"] is True
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        for minute, reps in enumerate((6, 1, 7), start=1):
            instance = _instance(db_session, session, sample_activity_definition, [{"Reps": reps}],
                                 occurred=_now() + timedelta(minutes=minute))
            _complete(authed_client, root.id, instance)

        assert _goal(db_session, goal["id"]).completed is False
        progress = authed_client.get(f"/api/{root.id}/goals/condition-progress?goal_ids={goal['id']}").get_json()
        payload = progress["goals"][goal["id"]]
        assert (payload["current"], payload["required"], payload["best_streak"]) == (1, 2, 1)

        last = _instance(db_session, session, sample_activity_definition, [{"Reps": 8}],
                         occurred=_now() + timedelta(minutes=5))
        _complete(authed_client, root.id, last)
        assert _goal(db_session, goal["id"]).completed is True


@pytest.mark.integration
class TestConditionPreview:
    def test_previews_an_unsaved_threshold_without_writing(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition, weight=500))
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 150}],
                             occurred=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, instance)

        url = f"/api/{root.id}/goals/{goal['id']}/condition/preview"
        met = authed_client.post(url, json={"condition": _threshold(sample_activity_definition, weight=100)})
        short = authed_client.post(url, json={"condition": _threshold(sample_activity_definition, weight=200)})
        invalid = authed_client.post(url, json={"condition": {**_threshold(sample_activity_definition), "min_sets": 0}})

        assert met.status_code == 200, met.get_json()
        assert met.get_json()["progress"]["met"] is True
        assert met.get_json()["progress"]["achieving_instance_id"] == instance.id
        assert short.get_json()["progress"]["met"] is False
        assert short.get_json()["progress"]["rule_bests"][0]["best"] == 150
        assert invalid.status_code == 400
        assert invalid.get_json() == {"error": "Sets must be between 1 and 100", "field": "condition"}
        stored = _goal(db_session, goal["id"])
        assert stored.completed is False
        assert float(stored.condition.rules[0].value) == 500


PARITY_CASES = json.loads(
    (Path(__file__).resolve().parents[1] / 'fixtures' / 'goal_condition_validation_cases.json').read_text()
)['cases']


@pytest.mark.integration
@pytest.mark.parametrize('case', PARITY_CASES, ids=[case['name'] for case in PARITY_CASES])
def test_server_validation_matches_the_shared_cases(authed_client, sample_ultimate_goal, sample_activity_definition, case):
    """The client validator runs the same cases (client/src/utils/__tests__/goalConditionParity.test.js)."""
    ids = {'weight': _metric(sample_activity_definition, 'Weight').id, 'reps': _metric(sample_activity_definition, 'Reps').id,
           'foreign': str(uuid.uuid4())}
    condition = json.loads(json.dumps(case['condition']))
    for rule in condition.get('rules', []):
        rule['metric_definition_id'] = ids[rule['metric_definition_id']]
    if 'metric_definition_id' in condition:
        condition['metric_definition_id'] = ids[condition['metric_definition_id']]
    condition['activity_definition_id'] = sample_activity_definition.id

    response = authed_client.post(f"/api/{sample_ultimate_goal.id}/goals", json={
        "name": "Parity", "type": "ShortTermGoal", "parent_id": sample_ultimate_goal.id,
        "completion_condition": "activity_threshold", "condition": condition,
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == case["message"]


@pytest.mark.integration
class TestSetAverageThresholds:
    def _average(self, activity, *, kind='single_session', **extra):
        return {
            "activity_definition_id": activity.id, "kind": kind, "measure": "sets", "set_aggregate": "average",
            "min_sets": 3,
            "rules": [{"metric_definition_id": _metric(activity, "Weight").id, "operator": ">=", "value": 100}],
            **extra,
        }

    def test_an_average_across_a_sessions_sets_completes_the_goal(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, self._average(sample_activity_definition))
        assert goal["condition"]["set_aggregate"] == "average"
        assert goal["condition"]["min_sets"] == 3
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))

        low = _instance(db_session, session, sample_activity_definition,
                        [{"Weight": 120}, {"Weight": 100}, {"Weight": 60}], occurred=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, low)
        assert _goal(db_session, goal["id"]).completed is False

        high = _instance(db_session, session, sample_activity_definition,
                         [{"Weight": 120}, {"Weight": 100}, {"Weight": 90}], occurred=_now() + timedelta(minutes=2))
        _complete(authed_client, root.id, high)
        assert _goal(db_session, goal["id"]).completed is True

    def test_consistency_averages_keep_their_set_minimum(
        self, authed_client, sample_ultimate_goal, sample_activity_definition,
    ):
        goal = _create_goal(authed_client, sample_ultimate_goal.id, sample_ultimate_goal.id, self._average(
            sample_activity_definition, kind="consistency", required_count=4, min_sets=2,
        ))

        assert (goal["condition"]["required_count"], goal["condition"]["min_sets"]) == (4, 2)

    def test_averages_need_an_activity_that_logs_sets(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        sample_activity_definition.has_sets = False
        db_session.commit()

        response = authed_client.post(f"/api/{sample_ultimate_goal.id}/goals", json={
            "name": "Bad", "type": "ShortTermGoal", "parent_id": sample_ultimate_goal.id,
            "completion_condition": "activity_threshold", "condition": self._average(sample_activity_definition),
        })

        assert response.status_code == 400
        assert response.get_json()["error"] == "'Bench Press' logs no sets to average"


@pytest.mark.integration
def test_exact_tag_match_round_trips_and_needs_tags(authed_client, db_session, sample_ultimate_goal, sample_activity_definition):
    root = sample_ultimate_goal
    strict = _tag(db_session, root, "Strict")

    tagged = _create_goal(authed_client, root.id, root.id, {
        **_threshold(sample_activity_definition), "tag_ids": [strict.id], "tag_match": "exact",
    })
    untagged = _create_goal(authed_client, root.id, root.id, {**_threshold(sample_activity_definition), "tag_match": "exact"})
    invalid = authed_client.post(f"/api/{root.id}/goals", json={
        "name": "Bad", "type": "ShortTermGoal", "parent_id": root.id, "completion_condition": "activity_threshold",
        "condition": {**_threshold(sample_activity_definition), "tag_match": "some"},
    })

    assert tagged["condition"]["tag_match"] == "exact"
    assert untagged["condition"]["tag_match"] == "contains"
    assert invalid.get_json()["error"] == "Match tags by containing or exactly"
