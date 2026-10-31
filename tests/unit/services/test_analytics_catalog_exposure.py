"""Every analytics-queryable column is a reviewed decision.

Datasets merge in all model columns, so a new column on a catalog model becomes
readable through structured queries and raw SQL. This snapshot turns that into an
explicit review: confirm the column holds no credential, token, or another
user's data, then regenerate with UPDATE_ANALYTICS_CATALOG_SNAPSHOT=1.
"""

import json
import os
from pathlib import Path

from services._analytics_datasets import DATASETS


SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "analytics_catalog_fields.json"


def _exposed_fields():
    return {dataset_id: sorted(dataset.fields) for dataset_id, dataset in sorted(DATASETS.items())}


def test_analytics_catalog_exposes_only_reviewed_fields():
    exposed = _exposed_fields()
    if os.getenv("UPDATE_ANALYTICS_CATALOG_SNAPSHOT") == "1":
        SNAPSHOT_PATH.write_text(json.dumps(exposed, indent=2) + "\n")

    assert exposed == json.loads(SNAPSHOT_PATH.read_text())
