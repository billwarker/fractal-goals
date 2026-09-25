"""Landing publication settings keys, schema version, payload limits, and defaults.
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


# Bump when the published landing snapshot shape changes so the frontend / future
# migrations can detect and handle stale caches.
LANDING_EXAMPLE_SCHEMA_VERSION = 12


# Match the production goal timeline's first-page depth so the landing modal
# keeps feature parity while the payload stays lean through field compaction.
LANDING_EXAMPLE_TIMELINE_LIMIT = 50


LANDING_EXAMPLE_NOTES_LIMIT = 30


LANDING_EXAMPLE_SESSIONS_LIMIT = 4


LANDING_EXAMPLE_TEMPLATES_LIMIT = 4


LANDING_EXAMPLE_ANALYTICS_LIMIT = 24


# Bound the admin showcase picker lists so the options endpoint stays light.
LANDING_EXAMPLE_OPTIONS_SESSIONS_LIMIT = 50


LANDING_EXAMPLE_OPTIONS_ACTIVITIES_LIMIT = 200


LANDING_EXAMPLE_ACTIVITY_CATALOGUE_LIMIT = 200


LANDING_EXAMPLE_SHOWCASE_ACTIVITY_LIMIT = 1


LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT = 3


LANDING_EXAMPLE_SHOWCASE_KEYS = (
    "session_id",
    "activity_ids",
    "program_id",
    "program_start_date",
    "program_end_date",
    "analytics_view_ids",
)


LANDING_TREE_VIEW_SETTING_KEYS = (
    "fadeInactiveBranches",
    "hideInactiveGoals",
    "hideCompletedGoals",
    "showMetricsOverlay",
)


LANDING_GOAL_BULLET_DEFAULTS = (
    {
        "key": "break_down",
        "heading": "Break it down",
        "body": "Turn ambitious outcomes into achievable child goals. Map the journey one step at a time—and build momentum every time you complete one.",
    },
    {
        "key": "associate_activities",
        "heading": "Connect your work to your goals",
        "body": "Attach activities as evidence of progress. Each completed activity advances the goal it supports and carries that evidence up through its lineage.",
    },
    {
        "key": "set_targets",
        "heading": "Set measurable targets",
        "body": "Define performance targets for the activities behind each goal, then see your progress build over time.",
    },
)
