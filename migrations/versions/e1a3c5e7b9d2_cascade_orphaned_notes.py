"""Notes written on deleted sessions, activities and goals go with them.

Data repair: until now deleting a session, removing an activity from a session or deleting a goal left the
notes written on it live (services/note_ownership.py now deletes them in the same transaction). Each orphan
is soft-deleted with its parent's own `deleted_at`, and pins used up by a deleted session or activity wait
for the next one again. Idempotent: only live notes and set pins are touched.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e1a3c5e7b9d2'
down_revision = 'd4f6b8a0c2e3'
branch_labels = None
depends_on = None

STATEMENTS = (
    # Notes written in a deleted session: session, activity, set and circuit notes.
    """
    UPDATE notes SET deleted_at = (SELECT s.deleted_at FROM sessions s WHERE s.id = notes.session_id)
    WHERE deleted_at IS NULL
      AND session_id IN (SELECT id FROM sessions WHERE deleted_at IS NOT NULL)
    """,
    # Notes on an activity removed from its session.
    """
    UPDATE notes SET deleted_at = (
        SELECT ai.deleted_at FROM activity_instances ai WHERE ai.id = notes.activity_instance_id
    )
    WHERE deleted_at IS NULL
      AND activity_instance_id IN (SELECT id FROM activity_instances WHERE deleted_at IS NOT NULL)
    """,
    # A deleted goal's own notes, reviews and completion notes.
    """
    UPDATE notes SET deleted_at = (SELECT g.deleted_at FROM goals g WHERE g.id = notes.goal_id)
    WHERE deleted_at IS NULL
      AND context_type = 'goal'
      AND goal_id IN (SELECT id FROM goals WHERE deleted_at IS NOT NULL)
    """,
    # Pins used up by a deleted session or activity wait for the next one.
    """
    UPDATE notes SET carried_into_session_id = NULL
    WHERE carried_into_session_id IN (SELECT id FROM sessions WHERE deleted_at IS NOT NULL)
    """,
    """
    UPDATE notes SET carried_into_instance_id = NULL
    WHERE carried_into_instance_id IN (SELECT id FROM activity_instances WHERE deleted_at IS NOT NULL)
    """,
)


def upgrade():
    for statement in STATEMENTS:
        op.execute(sa.text(statement))


def downgrade():
    # A data repair: the orphans were never meant to be live.
    pass
