"""tag and family names normalize by collapsing whitespace, then trimming

Revision ID: a6c8e0f2b4d6
Revises: f3a5c7e9b1d2
Create Date: 2026-10-21

Kind: constraint tightening. ``btrim`` trims spaces only, so trimming before collapsing
left a name ending in a tab or newline normalized with a trailing space, outside the
uniqueness guard. Stored names are first canonicalized (as the API already does), then
the generated ``normalized_name`` columns are rebuilt with the corrected expression.
"""

from alembic import op


revision = "a6c8e0f2b4d6"
down_revision = "f3a5c7e9b1d2"
branch_labels = None
depends_on = None

COLLAPSE_THEN_TRIM = r"btrim(regexp_replace(lower(name), '\s+', ' ', 'g'))"
TRIM_THEN_COLLAPSE = r"regexp_replace(lower(btrim(name)), '\s+', ' ', 'g')"
TABLES = (
    ("activity_tag_definitions", "uq_activity_tag_definitions_root_name"),
    ("activity_tag_families", "uq_activity_tag_families_root_name"),
)


def _rebuild(expression):
    for table, constraint in TABLES:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS normalized_name")
        op.execute(f"ALTER TABLE {table} ADD COLUMN normalized_name varchar GENERATED ALWAYS AS ({expression}) STORED")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {constraint} UNIQUE (root_id, normalized_name)")


def upgrade():
    for table, _constraint in TABLES:
        op.execute(rf"""
            UPDATE {table} SET name = btrim(regexp_replace(name, '\s+', ' ', 'g'))
            WHERE name <> btrim(regexp_replace(name, '\s+', ' ', 'g'))
        """)
    _rebuild(COLLAPSE_THEN_TRIM)


def downgrade():
    _rebuild(TRIM_THEN_COLLAPSE)
