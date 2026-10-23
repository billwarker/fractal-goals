"""goal reviews, success vision and explicit note kinds (migration C)

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-10-19

Kind: additive, with a data step that seeds level defaults.

- goal_levels: uses_success_vision (NOT NULL, default false), review_cadence_value/unit.
  Ultimate, Long Term and Mid Term levels (system defaults and user copies, matched by name) use a
  success vision and are reviewed yearly, quarterly and monthly. The seed only fills levels whose
  cadence is unset, so re-running converges.
- goals: review_cadence_value/unit (override the level), review_disabled (NOT NULL, default
  false), review_deferred_until.
- notes: note_kind is limited to 'goal_completion' and 'goal_review' (existing rows are either
  NULL or 'goal_completion').

Locks are brief: nullable columns and NOT NULL columns with constant defaults add without a rewrite
on PostgreSQL 11+, and the CHECK constraints validate against small tables.
"""

import sqlalchemy as sa
from alembic import op


revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None

UNITS_SQL = "('days', 'weeks', 'months', 'years')"
LEVEL_DEFAULTS = (
    ("Ultimate Goal", 1, "years"),
    ("Long Term Goal", 3, "months"),
    ("Mid Term Goal", 1, "months"),
)


def _add_cadence(table):
    op.add_column(table, sa.Column("review_cadence_value", sa.Integer(), nullable=True))
    op.add_column(table, sa.Column("review_cadence_unit", sa.String(), nullable=True))
    op.create_check_constraint(
        f"ck_{table}_review_cadence_unit", table,
        f"review_cadence_unit IS NULL OR review_cadence_unit IN {UNITS_SQL}",
    )
    op.create_check_constraint(
        f"ck_{table}_review_cadence_pair", table,
        "(review_cadence_value IS NULL) = (review_cadence_unit IS NULL)"
        " AND (review_cadence_value IS NULL OR review_cadence_value > 0)",
    )


def upgrade():
    op.add_column("goal_levels", sa.Column(
        "uses_success_vision", sa.Boolean(), nullable=False, server_default=sa.false(),
    ))
    _add_cadence("goal_levels")
    for name, value, unit in LEVEL_DEFAULTS:
        op.execute(sa.text(
            "UPDATE goal_levels SET uses_success_vision = true, review_cadence_value = :value, "
            "review_cadence_unit = :unit WHERE name = :name AND review_cadence_value IS NULL"
        ).bindparams(name=name, value=value, unit=unit))

    _add_cadence("goals")
    op.add_column("goals", sa.Column("review_disabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("goals", sa.Column("review_deferred_until", sa.DateTime(), nullable=True))

    op.create_check_constraint(
        "ck_notes_note_kind", "notes", "note_kind IS NULL OR note_kind IN ('goal_completion', 'goal_review')",
    )


def downgrade():
    op.drop_constraint("ck_notes_note_kind", "notes", type_="check")
    op.drop_column("goals", "review_deferred_until")
    op.drop_column("goals", "review_disabled")
    for table in ("goals", "goal_levels"):
        op.drop_constraint(f"ck_{table}_review_cadence_pair", table, type_="check")
        op.drop_constraint(f"ck_{table}_review_cadence_unit", table, type_="check")
        op.drop_column(table, "review_cadence_unit")
        op.drop_column(table, "review_cadence_value")
    op.drop_column("goal_levels", "uses_success_vision")
