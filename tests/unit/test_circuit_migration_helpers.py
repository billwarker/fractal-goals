import importlib


migration = importlib.import_module(
    "migrations.versions.5c7d9e1f3a2b_add_circuits_normalized_sets_and_work_intervals"
)


def test_json_object_accepts_mapping_or_encoded_mapping_only():
    assert migration._json_object({"sets": []}) == {"sets": []}
    assert migration._json_object('{"sets": [{"completed": true}]}')["sets"][0]["completed"] is True
    assert migration._json_object("not-json") == {}
    assert migration._json_object("[]") == {}


def test_set_backfill_normalizes_status_and_nonnegative_duration():
    assert migration._normalized_status({"status": " ACTIVE "}) == "active"
    assert migration._normalized_status({"completed": True}) == "completed"
    assert migration._normalized_status({"status": "unknown"}) == "planned"
    assert migration._nonnegative_int("14") == 14
    assert migration._nonnegative_int(-3) == 0
    assert migration._nonnegative_int("invalid") == 0
