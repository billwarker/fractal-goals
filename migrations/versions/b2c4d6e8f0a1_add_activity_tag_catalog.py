"""add fractal-wide activity tag catalog

Revision ID: b2c4d6e8f0a1
Revises: a1b3c5d7e9f2
Create Date: 2026-08-30
"""

import sqlalchemy as sa
from alembic import op


revision = "b2c4d6e8f0a1"
down_revision = "a1b3c5d7e9f2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "activity_tag_definitions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("root_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("scope", sa.String(length=16), server_default="selected", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'",
            name="ck_activity_tag_definitions_color",
        ),
        sa.CheckConstraint(
            "scope IN ('selected', 'global')",
            name="ck_activity_tag_definitions_scope",
        ),
        sa.CheckConstraint(
            "sort_order >= 0",
            name="ck_activity_tag_definitions_sort_order_nonnegative",
        ),
        sa.CheckConstraint("version > 0", name="ck_activity_tag_definitions_version_positive"),
        sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_tag_definitions_root_id", "activity_tag_definitions", ["root_id"])
    op.create_index(
        "ix_activity_tag_definitions_root_active_order",
        "activity_tag_definitions",
        ["root_id", "sort_order", "name"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_activity_tag_definitions_global_name",
        "activity_tag_definitions",
        ["root_id", sa.text("regexp_replace(lower(btrim(name)), '\\s+', ' ', 'g')")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND scope = 'global'"),
    )

    op.add_column("activity_tags", sa.Column("definition_id", sa.String(), nullable=True))
    op.execute(
        """
        INSERT INTO activity_tag_definitions
            (id, root_id, name, color, scope, sort_order, version, created_at, updated_at, deleted_at)
        SELECT id, root_id, regexp_replace(btrim(name), '\\s+', ' ', 'g'), color,
               'selected', sort_order, 1, created_at, updated_at, deleted_at
        FROM activity_tags
        """
    )
    op.execute("UPDATE activity_tags SET definition_id = id")

    op.add_column(
        "circuit_scope_tags",
        sa.Column("activity_tag_definition_id", sa.String(), nullable=True),
    )

    # Circuit scopes already model one logical tag across participating
    # activities. Consolidate only those provably related bindings; arbitrary
    # same-name tags elsewhere remain separate catalog definitions.
    connection = op.get_bind()
    scopes = connection.execute(sa.text(
        "SELECT id, root_id, circuit_run_id, "
        "regexp_replace(lower(btrim(name)), '\\s+', ' ', 'g') AS normalized_name "
        "FROM circuit_scope_tags ORDER BY created_at, id"
    )).mappings().all()
    for scope in scopes:
        tag_ids = connection.execute(sa.text(
            """
            SELECT at.id, at.definition_id
            FROM activity_tags at
            JOIN circuit_run_slots slot
              ON slot.activity_definition_id = at.activity_definition_id
             AND slot.circuit_run_id = :run_id
            JOIN activity_tag_definitions definition ON definition.id = at.definition_id
            WHERE at.root_id = :root_id
              AND regexp_replace(lower(btrim(definition.name)), '\\s+', ' ', 'g') = :normalized_name
              AND at.deleted_at IS NULL
              AND definition.deleted_at IS NULL
            ORDER BY at.id
            """
        ), scope).mappings().all()
        if not tag_ids:
            continue
        canonical_id = min(row["definition_id"] for row in tag_ids)
        source_ids = sorted({row["definition_id"] for row in tag_ids if row["definition_id"] != canonical_id})
        if source_ids:
            connection.execute(sa.text(
                "UPDATE activity_tags SET definition_id = :canonical_id "
                "WHERE definition_id = ANY(:source_ids)"
            ), {"canonical_id": canonical_id, "source_ids": source_ids})
        connection.execute(sa.text(
            "UPDATE circuit_scope_tags SET activity_tag_definition_id = :definition_id WHERE id = :scope_id"
        ), {"definition_id": canonical_id, "scope_id": scope["id"]})

    op.execute(
        "DELETE FROM activity_tag_definitions definition "
        "WHERE NOT EXISTS (SELECT 1 FROM activity_tags tag WHERE tag.definition_id = definition.id)"
    )

    op.alter_column("activity_tags", "definition_id", nullable=False)
    op.create_foreign_key(
        "fk_activity_tags_definition_id",
        "activity_tags",
        "activity_tag_definitions",
        ["definition_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_activity_tags_definition_id", "activity_tags", ["definition_id"])
    op.create_unique_constraint(
        "uq_activity_tags_activity_definition",
        "activity_tags",
        ["activity_definition_id", "definition_id"],
    )
    op.create_foreign_key(
        "fk_circuit_scope_tags_activity_tag_definition_id",
        "circuit_scope_tags",
        "activity_tag_definitions",
        ["activity_tag_definition_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_circuit_scope_tags_activity_tag_definition_id",
        "circuit_scope_tags",
        ["activity_tag_definition_id"],
    )

    op.drop_index("uq_activity_tags_active_name", table_name="activity_tags")
    op.drop_index("ix_activity_tags_activity_order_active", table_name="activity_tags")
    op.drop_constraint("ck_activity_tags_color", "activity_tags", type_="check")
    op.drop_column("activity_tags", "name")
    op.drop_column("activity_tags", "color")
    op.drop_column("activity_tags", "sort_order")
    op.create_index(
        "ix_activity_tags_activity_active",
        "activity_tags",
        ["activity_definition_id", "definition_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.execute("DROP TRIGGER IF EXISTS trg_activity_tags_owned_scope ON activity_tags")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_activity_tag_catalog_binding()
        RETURNS trigger AS $$
        DECLARE catalog_name text; catalog_archived timestamp;
        BEGIN
            SELECT regexp_replace(lower(btrim(name)), '\\s+', ' ', 'g'), deleted_at
            INTO catalog_name, catalog_archived
            FROM activity_tag_definitions
            WHERE id = NEW.definition_id AND root_id = NEW.root_id;
            IF catalog_name IS NULL OR NOT EXISTS (
                SELECT 1 FROM activity_definitions
                WHERE id = NEW.activity_definition_id AND root_id = NEW.root_id
            ) THEN
                RAISE EXCEPTION 'tag binding, activity, and catalog must share a root'
                    USING ERRCODE = '23514';
            END IF;
            IF NEW.deleted_at IS NULL AND catalog_archived IS NULL AND EXISTS (
                SELECT 1
                FROM activity_tags other
                JOIN activity_tag_definitions definition ON definition.id = other.definition_id
                WHERE other.activity_definition_id = NEW.activity_definition_id
                  AND other.id <> NEW.id
                  AND other.deleted_at IS NULL
                  AND definition.deleted_at IS NULL
                  AND regexp_replace(lower(btrim(definition.name)), '\\s+', ' ', 'g') = catalog_name
            ) THEN
                RAISE EXCEPTION 'duplicate active tag name for activity'
                    USING ERRCODE = '23505';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_activity_tags_owned_scope
        BEFORE INSERT OR UPDATE OF root_id, activity_definition_id, definition_id, deleted_at
        ON activity_tags
        FOR EACH ROW EXECUTE FUNCTION enforce_activity_tag_catalog_binding();

        CREATE OR REPLACE FUNCTION enforce_activity_tag_definition_overlap()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.deleted_at IS NULL AND EXISTS (
                SELECT 1
                FROM activity_tags own_binding
                JOIN activity_tags other_binding
                  ON other_binding.activity_definition_id = own_binding.activity_definition_id
                 AND other_binding.definition_id <> own_binding.definition_id
                 AND other_binding.deleted_at IS NULL
                JOIN activity_tag_definitions other_definition
                  ON other_definition.id = other_binding.definition_id
                 AND other_definition.deleted_at IS NULL
                WHERE own_binding.definition_id = NEW.id
                  AND own_binding.deleted_at IS NULL
                  AND regexp_replace(lower(btrim(other_definition.name)), '\\s+', ' ', 'g')
                      = regexp_replace(lower(btrim(NEW.name)), '\\s+', ' ', 'g')
            ) THEN
                RAISE EXCEPTION 'tag definition overlaps an existing activity tag name'
                    USING ERRCODE = '23505';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_activity_tag_definitions_no_overlap
        BEFORE UPDATE OF name, deleted_at ON activity_tag_definitions
        FOR EACH ROW EXECUTE FUNCTION enforce_activity_tag_definition_overlap();
        """
    )


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_activity_tag_definitions_no_overlap ON activity_tag_definitions")
    op.execute("DROP FUNCTION IF EXISTS enforce_activity_tag_definition_overlap()")
    op.execute("DROP TRIGGER IF EXISTS trg_activity_tags_owned_scope ON activity_tags")
    op.execute("DROP FUNCTION IF EXISTS enforce_activity_tag_catalog_binding()")
    op.add_column("activity_tags", sa.Column("sort_order", sa.Integer(), server_default="0", nullable=True))
    op.add_column("activity_tags", sa.Column("color", sa.String(length=7), nullable=True))
    op.add_column("activity_tags", sa.Column("name", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE activity_tags tag
        SET name = definition.name,
            color = definition.color,
            sort_order = definition.sort_order,
            deleted_at = COALESCE(tag.deleted_at, definition.deleted_at)
        FROM activity_tag_definitions definition
        WHERE definition.id = tag.definition_id
        """
    )
    op.alter_column("activity_tags", "name", nullable=False)
    op.alter_column("activity_tags", "sort_order", nullable=False)
    op.create_check_constraint(
        "ck_activity_tags_color",
        "activity_tags",
        "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'",
    )
    op.drop_index("ix_activity_tags_activity_active", table_name="activity_tags")
    op.create_index(
        "ix_activity_tags_activity_order_active",
        "activity_tags",
        ["activity_definition_id", "sort_order", "name"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_activity_tags_active_name",
        "activity_tags",
        ["activity_definition_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.drop_index("ix_circuit_scope_tags_activity_tag_definition_id", table_name="circuit_scope_tags")
    op.drop_constraint(
        "fk_circuit_scope_tags_activity_tag_definition_id",
        "circuit_scope_tags",
        type_="foreignkey",
    )
    op.drop_column("circuit_scope_tags", "activity_tag_definition_id")
    op.drop_constraint("uq_activity_tags_activity_definition", "activity_tags", type_="unique")
    op.drop_index("ix_activity_tags_definition_id", table_name="activity_tags")
    op.drop_constraint("fk_activity_tags_definition_id", "activity_tags", type_="foreignkey")
    op.drop_column("activity_tags", "definition_id")
    op.execute(
        """
        CREATE TRIGGER trg_activity_tags_owned_scope
        BEFORE INSERT OR UPDATE OF root_id, activity_definition_id ON activity_tags
        FOR EACH ROW EXECUTE FUNCTION enforce_activity_owned_child_scope()
        """
    )
    op.drop_index("uq_activity_tag_definitions_global_name", table_name="activity_tag_definitions")
    op.drop_index("ix_activity_tag_definitions_root_active_order", table_name="activity_tag_definitions")
    op.drop_index("ix_activity_tag_definitions_root_id", table_name="activity_tag_definitions")
    op.drop_table("activity_tag_definitions")
