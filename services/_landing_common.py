"""Live demo publication settings keys, schema version and limits.
"""

import threading


LANDING_EXAMPLE_SETTINGS_KEY = "landing_example_settings"


LANDING_EXAMPLE_CACHE_KEY = "landing_example_cache"


LANDING_EXAMPLE_DELIVERY_KEY = "landing_example_delivery"


# PostgreSQL transaction-scoped advisory lock key for the single public
# landing publication stream. The in-process lock covers SQLite/tests and also
# avoids duplicate work between threads before PostgreSQL grants the lock.
LANDING_EXAMPLE_PUBLISH_LOCK_KEY = 1_176_518_982


_landing_publish_process_lock = threading.Lock()


# Bump when the published manifest's shape changes. 14: examples are demo snapshots
# (root_id is the snapshot), carrying only label, name, icon, tour links and appearance.
# 15: each example also carries a read-only preview (its goal tree and effective levels).
LANDING_EXAMPLE_SCHEMA_VERSION = 15


# What the landing's read-only flow tree draws, per goal and per level; nothing else in
# the app's goal payload is published (no descriptions, notes, targets or owners).
LANDING_PREVIEW_GOAL_FIELDS = (
    "id", "name", "type", "level_id", "level_name", "completed", "completed_at", "paused",
    "deadline", "is_smart", "sequence_track_id", "sequence_position",
)
LANDING_PREVIEW_GOAL_ATTRIBUTES = ("parent_id", "created_at")
LANDING_PREVIEW_LEVEL_FIELDS = ("id", "name", "rank", "color", "secondary_color", "icon", "sort_children_by")


# Bound the admin tour picker so the options endpoint stays light.
LANDING_EXAMPLE_OPTIONS_SESSIONS_LIMIT = 50


# The tour's optional featured picks, by source id; publishing maps them onto the snapshot.
LANDING_EXAMPLE_TOUR_KEYS = ("session_id", "program_id")


# The owner preferences a demo carries (how completed goals are coloured).
LANDING_EXAMPLE_APPEARANCE_KEYS = ("completed_primary_color", "completed_secondary_color")
