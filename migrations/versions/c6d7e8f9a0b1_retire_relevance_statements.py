"""retire relevance statements; SMART's R is now Reviewed (migration D)

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-10-20

Kind: contract, with a data step that keeps every statement.

- Every non-empty goals.relevance_statement (live or deleted goals) becomes a goal note, id
  'relevance-<goal id>', reading "Why this matters (was this goal's relevance statement)" and then
  the text. Then the column is dropped. Nothing is discarded: downgrade restores the column from
  those notes and removes them. Re-running converges (ON CONFLICT DO NOTHING; IF EXISTS).
- goal_levels.uses_success_vision is renamed uses_reviews: the flag now only means "this level
  reviews its goals", which SMART's R (Reviewed) reads.

Backup before rollout (local: backups/pre-migration-d/, recorded in
planning/goal-conditions-hierarchy-creation-sequencing.md).

Verification (expect 0, then the converted count):
    SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'goals' AND column_name = 'relevance_statement';
    SELECT count(*) FROM notes WHERE id LIKE 'relevance-%';
"""

from alembic import op


revision = "c6d7e8f9a0b1"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None

NOTE_HEADING = "**Why this matters** (was this goal's relevance statement)"


def _column_exists(table, column):
    bind = op.get_bind()
    return bind.exec_driver_sql(
        "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
        (table, column),
    ).first() is not None


def upgrade():
    if _column_exists("goals", "relevance_statement"):
        op.execute(f"""
            INSERT INTO notes (id, root_id, context_type, context_id, goal_id, content, created_at, updated_at)
            SELECT 'relevance-' || g.id, COALESCE(g.root_id, g.id), 'goal', g.id, g.id,
                   '{NOTE_HEADING.replace("'", "''")}' || E'\\n\\n' || btrim(g.relevance_statement),
                   COALESCE(g.updated_at, g.created_at, now()), now()
            FROM goals g
            WHERE btrim(COALESCE(g.relevance_statement, '')) <> ''
            ON CONFLICT (id) DO NOTHING
        """)
        op.drop_column("goals", "relevance_statement")
    if _column_exists("goal_levels", "uses_success_vision"):
        op.alter_column("goal_levels", "uses_success_vision", new_column_name="uses_reviews")


def downgrade():
    if _column_exists("goal_levels", "uses_reviews"):
        op.alter_column("goal_levels", "uses_reviews", new_column_name="uses_success_vision")
    op.execute("ALTER TABLE goals ADD COLUMN IF NOT EXISTS relevance_statement TEXT")
    prefix_length = len(NOTE_HEADING) + 2  # heading, then a blank line
    op.execute(f"""
        UPDATE goals g SET relevance_statement = substr(n.content, {prefix_length + 1})
        FROM notes n
        WHERE n.id = 'relevance-' || g.id
    """)
    op.execute("DELETE FROM notes WHERE id LIKE 'relevance-%'")
