"""unified tags, tag families, and tag-aware progress comparison

Revision ID: f3a5c7e9b1d2
Revises: e8f9a0b1c2d3
Create Date: 2026-10-21

Kind: restructuring, with data rewrite. See planning/tag-families-and-tag-aware-progress.md.

1. One tag identity. Per-activity bindings (``activity_tags``) are removed: instance and set
   links reference ``activity_tag_definitions`` directly, and any tag can be used on any
   activity. Same-name definitions in a fractal are merged first (survivor: active, then
   formerly "global", then most used, then oldest), so names become unique per fractal,
   archived tags included, through the generated ``normalized_name`` column.
2. Planned tags inside stored plans (templates, dated plans, session snapshots and instance
   plan snapshots) are rewritten from binding ids to definition ids; unknown ids are dropped.
3. Circuit scope tags become pure catalog references (no name/color copies).
4. Tag families: ordered groups of tags, optionally "pick one".
5. Tag-aware progress: trigger-maintained ``tag_signature`` columns, a per-instance comparison
   override, and the retirement of saved progress views.
"""

import hashlib
import json
import logging

import sqlalchemy as sa
from alembic import op


revision = "f3a5c7e9b1d2"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")

NORMALIZED = r"regexp_replace(lower(btrim({column})), '\s+', ' ', 'g')"

TAG_LINK_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION enforce_activity_tag_link_root() RETURNS trigger AS $$
DECLARE owner_root text;
BEGIN
    IF TG_TABLE_NAME = 'activity_set_tags' THEN
        SELECT instance.root_id INTO owner_root
        FROM activity_sets activity_set
        JOIN activity_instances instance ON instance.id = activity_set.activity_instance_id
        WHERE activity_set.id = NEW.activity_set_id;
    ELSE
        SELECT root_id INTO owner_root FROM activity_instances WHERE id = NEW.activity_instance_id;
    END IF;
    IF owner_root IS NULL OR NOT EXISTS (
        SELECT 1 FROM activity_tag_definitions WHERE id = NEW.tag_definition_id AND root_id = owner_root
    ) THEN
        RAISE EXCEPTION 'tag and tagged activity must share a fractal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_activity_tag_signature() RETURNS trigger AS $$
DECLARE target text;
BEGIN
    IF TG_TABLE_NAME = 'activity_set_tags' THEN
        FOR target IN
            SELECT DISTINCT id FROM (VALUES
                (CASE WHEN TG_OP <> 'INSERT' THEN OLD.activity_set_id END),
                (CASE WHEN TG_OP <> 'DELETE' THEN NEW.activity_set_id END)
            ) AS changed(id) WHERE id IS NOT NULL
        LOOP
            UPDATE activity_sets SET tag_signature = COALESCE((
                SELECT string_agg(tag_definition_id, ',' ORDER BY tag_definition_id COLLATE "C")
                FROM activity_set_tags WHERE activity_set_id = target
            ), '') WHERE id = target;
        END LOOP;
    ELSE
        FOR target IN
            SELECT DISTINCT id FROM (VALUES
                (CASE WHEN TG_OP <> 'INSERT' THEN OLD.activity_instance_id END),
                (CASE WHEN TG_OP <> 'DELETE' THEN NEW.activity_instance_id END)
            ) AS changed(id) WHERE id IS NOT NULL
        LOOP
            UPDATE activity_instances SET tag_signature = COALESCE((
                SELECT string_agg(tag_definition_id, ',' ORDER BY tag_definition_id COLLATE "C")
                FROM activity_instance_tags WHERE activity_instance_id = target
            ), '') WHERE id = target;
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
"""


def _tag_link_triggers(table_name, *, signature=True):
    statements = [
        f"DROP TRIGGER IF EXISTS trg_{table_name}_root ON {table_name}",
        f"CREATE TRIGGER trg_{table_name}_root BEFORE INSERT OR UPDATE ON {table_name} "
        "FOR EACH ROW EXECUTE FUNCTION enforce_activity_tag_link_root()",
    ]
    if signature:
        statements += [
            f"DROP TRIGGER IF EXISTS trg_{table_name}_signature ON {table_name}",
            f"CREATE TRIGGER trg_{table_name}_signature AFTER INSERT OR UPDATE OR DELETE ON {table_name} "
            "FOR EACH ROW EXECUTE FUNCTION refresh_activity_tag_signature()",
        ]
    return statements


# --- Planned-tag rewrites (frozen copy; services/tag_reference_rewrites.py owns runtime) ---

def _rewrite_prescription(prescription, resolve):
    """Map planned tag ids with ``resolve(tag_id) -> new id | None``; returns (value, changed)."""
    if not isinstance(prescription, dict):
        return prescription, False
    changed = False
    result = dict(prescription)

    def mapped(tag_ids):
        output = []
        for tag_id in tag_ids if isinstance(tag_ids, list) else []:
            new_id = resolve(tag_id)
            if new_id is not None and new_id not in output:
                output.append(new_id)
        return output

    if "tags" in result:
        tags = mapped(result["tags"])
        if tags != result["tags"]:
            changed = True
            if tags:
                result["tags"] = tags
            else:
                result.pop("tags")
    if isinstance(result.get("sets"), list):
        new_sets = []
        for planned_set in result["sets"]:
            if isinstance(planned_set, dict) and "tags" in planned_set:
                tags = mapped(planned_set["tags"])
                if tags != planned_set["tags"]:
                    changed = True
                    planned_set = dict(planned_set)
                    if tags:
                        planned_set["tags"] = tags
                    else:
                        planned_set.pop("tags")
            new_sets.append(planned_set)
        result["sets"] = new_sets
    return result, changed


def _item_activity_id(item):
    return item.get("activity_definition_id") or item.get("activity_id") or item.get("id")


def _rewrite_tree(value, resolve_for_activity, activity_id=None):
    """Rewrite every nested ``prescription``; the enclosing item supplies its activity id."""
    if isinstance(value, list):
        changed = False
        items = []
        for item in value:
            rewritten, item_changed = _rewrite_tree(item, resolve_for_activity, activity_id)
            items.append(rewritten)
            changed = changed or item_changed
        return items, changed
    if not isinstance(value, dict):
        return value, False
    if value.get("type") == "activity":
        activity_id = _item_activity_id(value)
    changed = False
    result = {}
    for key, item in value.items():
        if key == "prescription":
            rewritten, item_changed = _rewrite_prescription(
                item, lambda tag_id, activity=activity_id: resolve_for_activity(activity, tag_id),
            )
        else:
            rewritten, item_changed = _rewrite_tree(item, resolve_for_activity, activity_id)
        result[key] = rewritten
        changed = changed or item_changed
    return result, changed


def _rewrite_documents(bind, resolve_for_activity):
    """Rewrite planned tags in every stored plan document; returns the number of rows changed."""
    changed_rows = 0
    for table, column in (
        ("session_templates", "template_data"),
        ("program_session_plans", "plan_data"),
        ("sessions", "attributes"),
    ):
        rows = bind.execute(sa.text(
            f"SELECT id, {column} FROM {table} WHERE CAST({column} AS text) LIKE '%tags%'"
        )).all()
        for row_id, raw in rows:
            stored_as_string = isinstance(raw, str)
            try:
                document = json.loads(raw) if stored_as_string else raw
            except ValueError:
                continue
            rewritten, changed = _rewrite_tree(document, resolve_for_activity)
            if not changed:
                continue
            value = json.dumps(rewritten)
            bind.execute(
                sa.text(f"UPDATE {table} SET {column} = CAST(:value AS jsonb) WHERE id = :id"),
                {"value": json.dumps(value) if stored_as_string else value, "id": row_id},
            )
            changed_rows += 1
    rows = bind.execute(sa.text(
        "SELECT id, activity_definition_id, prescription FROM activity_instances "
        "WHERE CAST(prescription AS text) LIKE '%tags%'"
    )).all()
    for row_id, activity_id, prescription in rows:
        rewritten, changed = _rewrite_prescription(
            prescription, lambda tag_id, activity=activity_id: resolve_for_activity(activity, tag_id),
        )
        if changed:
            bind.execute(
                sa.text("UPDATE activity_instances SET prescription = CAST(:value AS jsonb) WHERE id = :id"),
                {"value": json.dumps(rewritten), "id": row_id},
            )
            changed_rows += 1
    return changed_rows


def upgrade():
    bind = op.get_bind()

    # Retired integrity triggers that reference bindings and saved views.
    for statement in (
        "DROP TRIGGER IF EXISTS trg_activity_tags_owned_scope ON activity_tags",
        "DROP TRIGGER IF EXISTS trg_activity_tag_definitions_no_overlap ON activity_tag_definitions",
        "DROP TRIGGER IF EXISTS trg_activity_instance_tags_scope ON activity_instance_tags",
        "DROP TRIGGER IF EXISTS trg_activity_set_tags_scope ON activity_set_tags",
        "DROP TRIGGER IF EXISTS trg_activity_progress_views_owned_scope ON activity_progress_views",
        "DROP TRIGGER IF EXISTS trg_activity_definitions_active_progress_view_scope ON activity_definitions",
        "DROP FUNCTION IF EXISTS enforce_activity_tag_catalog_binding()",
        "DROP FUNCTION IF EXISTS enforce_activity_tag_definition_overlap()",
        "DROP FUNCTION IF EXISTS enforce_activity_instance_tag_scope()",
        "DROP FUNCTION IF EXISTS enforce_activity_set_tag_scope()",
        "DROP FUNCTION IF EXISTS enforce_active_progress_view_scope()",
    ):
        op.execute(statement)

    # 1. Merge same-name definitions per fractal.
    op.execute(f"""
        CREATE TEMP TABLE tag_merge_map ON COMMIT DROP AS
        WITH usage AS (
            SELECT binding.definition_id, count(*) AS uses
            FROM activity_tags binding
            JOIN (
                SELECT activity_tag_id FROM activity_instance_tags
                UNION ALL SELECT activity_tag_id FROM activity_set_tags
            ) link ON link.activity_tag_id = binding.id
            GROUP BY binding.definition_id
        ), ranked AS (
            SELECT definition.id, definition.root_id, {NORMALIZED.format(column='definition.name')} AS normalized,
                   row_number() OVER (
                       PARTITION BY definition.root_id, {NORMALIZED.format(column='definition.name')}
                       ORDER BY (definition.deleted_at IS NOT NULL), (definition.scope = 'global') DESC,
                                COALESCE(usage.uses, 0) DESC, definition.created_at, definition.id
                   ) AS rank
            FROM activity_tag_definitions definition
            LEFT JOIN usage ON usage.definition_id = definition.id
        )
        SELECT source.id AS source_id, survivor.id AS target_id
        FROM ranked source
        JOIN ranked survivor
          ON survivor.root_id = source.root_id AND survivor.normalized = source.normalized AND survivor.rank = 1
        WHERE source.rank > 1
    """)
    merged = bind.execute(sa.text("SELECT count(*) FROM tag_merge_map")).scalar() or 0
    op.execute("""
        CREATE TEMP TABLE tag_binding_map ON COMMIT DROP AS
        SELECT binding.id AS binding_id, COALESCE(merge.target_id, binding.definition_id) AS definition_id
        FROM activity_tags binding
        LEFT JOIN tag_merge_map merge ON merge.source_id = binding.definition_id
    """)

    # 2. Instance and set links reference definitions directly.
    for table, owner in (("activity_instance_tags", "activity_instance_id"), ("activity_set_tags", "activity_set_id")):
        op.add_column(table, sa.Column("tag_definition_id", sa.String(), nullable=True))
        op.execute(f"""
            UPDATE {table} link SET tag_definition_id = map.definition_id
            FROM tag_binding_map map WHERE map.binding_id = link.activity_tag_id
        """)
        op.execute(f"DELETE FROM {table} WHERE tag_definition_id IS NULL")
        op.execute(f"""
            DELETE FROM {table} duplicate USING {table} kept
            WHERE duplicate.{owner} = kept.{owner}
              AND duplicate.tag_definition_id = kept.tag_definition_id
              AND duplicate.activity_tag_id > kept.activity_tag_id
        """)
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_tag")
        op.drop_column(table, "activity_tag_id")
        op.alter_column(table, "tag_definition_id", nullable=False)
        op.create_primary_key(f"{table}_pkey", table, [owner, "tag_definition_id"])
        op.create_foreign_key(
            f"fk_{table}_tag_definition_id", table, "activity_tag_definitions",
            ["tag_definition_id"], ["id"], ondelete="CASCADE",
        )
        op.create_index(f"ix_{table}_tag", table, ["tag_definition_id", owner])

    # 3. Circuit scopes reference the surviving catalog tag; scopes without one get it by name.
    op.execute("""
        UPDATE circuit_scope_tags scope SET activity_tag_definition_id = merge.target_id
        FROM tag_merge_map merge WHERE merge.source_id = scope.activity_tag_definition_id
    """)
    op.execute(f"""
        UPDATE circuit_scope_tags scope SET activity_tag_definition_id = definition.id
        FROM activity_tag_definitions definition
        LEFT JOIN tag_merge_map merge ON merge.source_id = definition.id
        WHERE scope.activity_tag_definition_id IS NULL
          AND merge.source_id IS NULL
          AND definition.root_id = scope.root_id
          AND {NORMALIZED.format(column='definition.name')} = {NORMALIZED.format(column='scope.name')}
    """)
    op.execute(f"""
        INSERT INTO activity_tag_definitions (id, root_id, name, color, scope, sort_order, version, created_at, updated_at)
        SELECT DISTINCT ON (scope.root_id, {NORMALIZED.format(column='scope.name')})
               md5(random()::text || scope.id), scope.root_id, scope.name, scope.color, 'selected',
               COALESCE((SELECT max(sort_order) + 1 FROM activity_tag_definitions existing WHERE existing.root_id = scope.root_id), 0),
               1, now(), now()
        FROM circuit_scope_tags scope
        WHERE scope.activity_tag_definition_id IS NULL
        ORDER BY scope.root_id, {NORMALIZED.format(column='scope.name')}, scope.created_at
    """)
    op.execute(f"""
        UPDATE circuit_scope_tags scope SET activity_tag_definition_id = definition.id
        FROM activity_tag_definitions definition
        WHERE scope.activity_tag_definition_id IS NULL
          AND definition.root_id = scope.root_id
          AND {NORMALIZED.format(column='definition.name')} = {NORMALIZED.format(column='scope.name')}
    """)
    op.execute("""
        DELETE FROM circuit_scope_tags duplicate USING circuit_scope_tags kept
        WHERE duplicate.circuit_run_id = kept.circuit_run_id
          AND duplicate.circuit_round_id IS NOT DISTINCT FROM kept.circuit_round_id
          AND duplicate.activity_tag_definition_id = kept.activity_tag_definition_id
          AND duplicate.id > kept.id
    """)
    op.execute("DROP INDEX IF EXISTS uq_circuit_scope_tags_run_name")
    op.execute("DROP INDEX IF EXISTS uq_circuit_scope_tags_round_name")
    op.drop_column("circuit_scope_tags", "name")
    op.drop_column("circuit_scope_tags", "color")
    op.alter_column("circuit_scope_tags", "activity_tag_definition_id", nullable=False)
    op.create_index(
        "uq_circuit_scope_tags_run_definition", "circuit_scope_tags",
        ["circuit_run_id", "activity_tag_definition_id"], unique=True,
        postgresql_where=sa.text("circuit_round_id IS NULL"),
    )
    op.create_index(
        "uq_circuit_scope_tags_round_definition", "circuit_scope_tags",
        ["circuit_round_id", "activity_tag_definition_id"], unique=True,
        postgresql_where=sa.text("circuit_round_id IS NOT NULL"),
    )

    # 4. Planned tags: binding ids become definition ids.
    binding_map = dict(bind.execute(sa.text("SELECT binding_id, definition_id FROM tag_binding_map")).all())
    definition_ids = {row[0] for row in bind.execute(sa.text(
        "SELECT id FROM activity_tag_definitions WHERE id NOT IN (SELECT source_id FROM tag_merge_map)"
    )).all()}
    merge_map = dict(bind.execute(sa.text("SELECT source_id, target_id FROM tag_merge_map")).all())

    def resolve(_activity_id, tag_id):
        if tag_id in binding_map:
            return binding_map[tag_id]
        if tag_id in merge_map:
            return merge_map[tag_id]
        return tag_id if tag_id in definition_ids else None

    rewritten_plans = _rewrite_documents(bind, resolve)

    # 5. Remove bindings and merged definitions; names become unique per fractal.
    op.drop_table("activity_tags")
    op.execute("DELETE FROM activity_tag_definitions WHERE id IN (SELECT source_id FROM tag_merge_map)")
    op.execute("DROP INDEX IF EXISTS uq_activity_tag_definitions_global_name")
    op.drop_column("activity_tag_definitions", "scope")
    op.execute(r"""
        UPDATE activity_tag_definitions SET name = regexp_replace(btrim(name), '\s+', ' ', 'g')
        WHERE name <> regexp_replace(btrim(name), '\s+', ' ', 'g')
    """)
    op.execute(
        "ALTER TABLE activity_tag_definitions ADD COLUMN normalized_name varchar "
        f"GENERATED ALWAYS AS ({NORMALIZED.format(column='name')}) STORED"
    )
    op.create_unique_constraint(
        "uq_activity_tag_definitions_root_name", "activity_tag_definitions", ["root_id", "normalized_name"],
    )

    # 6. Tag families.
    op.create_table(
        "activity_tag_families",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("normalized_name", sa.String(), sa.Computed(NORMALIZED.format(column="name"), persisted=True)),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("single_select", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("root_id", "normalized_name", name="uq_activity_tag_families_root_name"),
        sa.CheckConstraint("sort_order >= 0", name="ck_activity_tag_families_sort_order_nonnegative"),
        sa.CheckConstraint("version > 0", name="ck_activity_tag_families_version_positive"),
    )
    op.create_index("ix_activity_tag_families_root_id", "activity_tag_families", ["root_id"])
    op.add_column("activity_tag_definitions", sa.Column(
        "family_id", sa.String(), sa.ForeignKey(
            "activity_tag_families.id", ondelete="SET NULL", name="fk_activity_tag_definitions_family_id",
        ), nullable=True,
    ))
    op.create_index("ix_activity_tag_definitions_family_id", "activity_tag_definitions", ["family_id"])

    # 7. Tag signatures and the per-instance comparison override.
    op.add_column("activity_instances", sa.Column("tag_signature", sa.String(), nullable=False, server_default=""))
    op.add_column("activity_sets", sa.Column("tag_signature", sa.String(), nullable=False, server_default=""))
    op.execute("""
        UPDATE activity_instances instance SET tag_signature = signatures.signature
        FROM (
            SELECT activity_instance_id, string_agg(tag_definition_id, ',' ORDER BY tag_definition_id COLLATE "C") AS signature
            FROM activity_instance_tags GROUP BY activity_instance_id
        ) signatures WHERE signatures.activity_instance_id = instance.id
    """)
    op.execute("""
        UPDATE activity_sets activity_set SET tag_signature = signatures.signature
        FROM (
            SELECT activity_set_id, string_agg(tag_definition_id, ',' ORDER BY tag_definition_id COLLATE "C") AS signature
            FROM activity_set_tags GROUP BY activity_set_id
        ) signatures WHERE signatures.activity_set_id = activity_set.id
    """)
    op.create_index(
        "ix_activity_instances_activity_tag_signature", "activity_instances",
        ["activity_definition_id", "tag_signature"], postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.add_column("activity_instances", sa.Column("progress_compare_mode", sa.String(length=8), nullable=True))
    op.add_column("activity_instances", sa.Column(
        "progress_compare_version", sa.Integer(), nullable=False, server_default="1",
    ))
    op.create_check_constraint(
        "ck_activity_instances_progress_compare_mode", "activity_instances",
        "progress_compare_mode IS NULL OR progress_compare_mode IN ('all', 'tags')",
    )
    op.create_check_constraint(
        "ck_activity_instances_progress_compare_version_positive", "activity_instances",
        "progress_compare_version > 0",
    )
    op.create_table(
        "activity_instance_compare_tags",
        sa.Column("activity_instance_id", sa.String(), sa.ForeignKey("activity_instances.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_definition_id", sa.String(), sa.ForeignKey("activity_tag_definitions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_activity_instance_compare_tags_tag", "activity_instance_compare_tags", ["tag_definition_id"])

    # 8. Saved progress views are retired.
    op.execute("ALTER TABLE activity_definitions DROP CONSTRAINT IF EXISTS fk_activity_definitions_active_progress_view_id")
    op.execute("DROP INDEX IF EXISTS ix_activity_definitions_active_progress_view_id")
    op.drop_column("activity_definitions", "active_progress_view_id")
    op.drop_table("activity_progress_views")

    op.execute(TAG_LINK_TRIGGER_SQL)
    for statement in [
        *_tag_link_triggers("activity_instance_tags"),
        *_tag_link_triggers("activity_set_tags"),
        *_tag_link_triggers("activity_instance_compare_tags", signature=False),
    ]:
        op.execute(statement)

    logger.info(
        "unified tags: merged %s duplicate tag definitions; rewrote planned tags in %s stored plans",
        merged, rewritten_plans,
    )


def downgrade():
    """Restore per-activity bindings (one per activity a tag is used on) and saved-view tables.

    Saved progress views and per-instance comparison overrides cannot be recovered; merged
    duplicate tags stay merged. Families are dropped (tags keep their names and order), and
    the binding-era integrity triggers of earlier revisions are not reinstalled.
    """
    bind = op.get_bind()
    for table in ("activity_instance_tags", "activity_set_tags", "activity_instance_compare_tags"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_root ON {table}")
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_signature ON {table}")
    op.execute("DROP FUNCTION IF EXISTS refresh_activity_tag_signature()")
    op.execute("DROP FUNCTION IF EXISTS enforce_activity_tag_link_root()")

    op.create_table(
        "activity_progress_views",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_definition_id", sa.String(), sa.ForeignKey("activity_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("config", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("version > 0", name="ck_activity_progress_views_version_positive"),
    )
    op.create_index("ix_activity_progress_views_root_id", "activity_progress_views", ["root_id"])
    op.create_index("ix_activity_progress_views_activity_definition_id", "activity_progress_views", ["activity_definition_id"])
    op.add_column("activity_definitions", sa.Column("active_progress_view_id", sa.String(), sa.ForeignKey(
        "activity_progress_views.id", ondelete="SET NULL", name="fk_activity_definitions_active_progress_view_id",
    ), nullable=True))
    op.create_index("ix_activity_definitions_active_progress_view_id", "activity_definitions", ["active_progress_view_id"])

    op.drop_table("activity_instance_compare_tags")
    op.drop_constraint("ck_activity_instances_progress_compare_version_positive", "activity_instances", type_="check")
    op.drop_constraint("ck_activity_instances_progress_compare_mode", "activity_instances", type_="check")
    op.drop_column("activity_instances", "progress_compare_version")
    op.drop_column("activity_instances", "progress_compare_mode")
    op.drop_index("ix_activity_instances_activity_tag_signature", table_name="activity_instances")
    op.drop_column("activity_sets", "tag_signature")
    op.drop_column("activity_instances", "tag_signature")

    op.drop_index("ix_activity_tag_definitions_family_id", table_name="activity_tag_definitions")
    op.drop_column("activity_tag_definitions", "family_id")
    op.drop_table("activity_tag_families")
    op.drop_constraint("uq_activity_tag_definitions_root_name", "activity_tag_definitions", type_="unique")
    op.drop_column("activity_tag_definitions", "normalized_name")
    op.add_column("activity_tag_definitions", sa.Column("scope", sa.String(length=16), nullable=False, server_default="selected"))
    op.create_check_constraint(
        "ck_activity_tag_definitions_scope", "activity_tag_definitions", "scope IN ('selected', 'global')",
    )

    op.create_table(
        "activity_tags",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_definition_id", sa.String(), sa.ForeignKey("activity_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("definition_id", sa.String(), sa.ForeignKey("activity_tag_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("activity_definition_id", "definition_id", name="uq_activity_tags_activity_definition"),
    )
    op.create_index("ix_activity_tags_root_id", "activity_tags", ["root_id"])
    op.create_index("ix_activity_tags_activity_definition_id", "activity_tags", ["activity_definition_id"])
    op.create_index("ix_activity_tags_definition_id", "activity_tags", ["definition_id"])
    op.create_index(
        "ix_activity_tags_activity_active", "activity_tags", ["activity_definition_id", "definition_id"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.execute("""
        INSERT INTO activity_tags (id, root_id, activity_definition_id, definition_id)
        SELECT md5(used.activity_definition_id || ':' || used.definition_id), definition.root_id,
               used.activity_definition_id, used.definition_id
        FROM (
            SELECT instance.activity_definition_id, link.tag_definition_id AS definition_id
            FROM activity_instance_tags link JOIN activity_instances instance ON instance.id = link.activity_instance_id
            UNION
            SELECT instance.activity_definition_id, link.tag_definition_id
            FROM activity_set_tags link
            JOIN activity_sets activity_set ON activity_set.id = link.activity_set_id
            JOIN activity_instances instance ON instance.id = activity_set.activity_instance_id
            UNION
            SELECT slot.activity_definition_id, scope.activity_tag_definition_id
            FROM circuit_scope_tags scope JOIN circuit_run_slots slot ON slot.circuit_run_id = scope.circuit_run_id
        ) used
        JOIN activity_tag_definitions definition ON definition.id = used.definition_id
    """)

    for table, owner, parent_join in (
        ("activity_instance_tags", "activity_instance_id",
         "JOIN activity_instances instance ON instance.id = link.activity_instance_id"),
        ("activity_set_tags", "activity_set_id",
         "JOIN activity_sets activity_set ON activity_set.id = link.activity_set_id "
         "JOIN activity_instances instance ON instance.id = activity_set.activity_instance_id"),
    ):
        op.add_column(table, sa.Column("activity_tag_id", sa.String(), nullable=True))
        op.execute(f"""
            UPDATE {table} target SET activity_tag_id = binding.id
            FROM {table} link {parent_join}
            JOIN activity_tags binding
              ON binding.activity_definition_id = instance.activity_definition_id
             AND binding.definition_id = link.tag_definition_id
            WHERE target.{owner} = link.{owner} AND target.tag_definition_id = link.tag_definition_id
        """)
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_tag")
        op.drop_column(table, "tag_definition_id")
        op.alter_column(table, "activity_tag_id", nullable=False)
        op.create_primary_key(f"{table}_pkey", table, [owner, "activity_tag_id"])
        op.create_foreign_key(
            f"{table}_activity_tag_id_fkey", table, "activity_tags", ["activity_tag_id"], ["id"], ondelete="CASCADE",
        )
        op.create_index(f"ix_{table}_tag", table, ["activity_tag_id", owner])

    bindings = {
        (activity_id, definition_id): binding_id
        for binding_id, activity_id, definition_id in bind.execute(sa.text(
            "SELECT id, activity_definition_id, definition_id FROM activity_tags"
        )).all()
    }
    root_by_activity = dict(bind.execute(sa.text("SELECT id, root_id FROM activity_definitions")).all())
    root_by_definition = dict(bind.execute(sa.text("SELECT id, root_id FROM activity_tag_definitions")).all())

    def resolve(activity_id, definition_id):
        if activity_id is None or definition_id not in root_by_definition:
            return None
        key = (activity_id, definition_id)
        if key not in bindings:
            if root_by_activity.get(activity_id) != root_by_definition[definition_id]:
                return None
            bindings[key] = hashlib.md5(f"{activity_id}:{definition_id}".encode()).hexdigest()
            bind.execute(sa.text(
                "INSERT INTO activity_tags (id, root_id, activity_definition_id, definition_id) "
                "VALUES (:id, :root_id, :activity_id, :definition_id)"
            ), {"id": bindings[key], "root_id": root_by_activity[activity_id], "activity_id": activity_id, "definition_id": definition_id})
        return bindings[key]

    _rewrite_documents(bind, resolve)

    op.drop_index("uq_circuit_scope_tags_round_definition", table_name="circuit_scope_tags")
    op.drop_index("uq_circuit_scope_tags_run_definition", table_name="circuit_scope_tags")
    op.alter_column("circuit_scope_tags", "activity_tag_definition_id", nullable=True)
    op.add_column("circuit_scope_tags", sa.Column("name", sa.String(), nullable=True))
    op.add_column("circuit_scope_tags", sa.Column("color", sa.String(length=7), nullable=True))
    op.execute("""
        UPDATE circuit_scope_tags scope SET name = definition.name, color = definition.color
        FROM activity_tag_definitions definition WHERE definition.id = scope.activity_tag_definition_id
    """)
    op.alter_column("circuit_scope_tags", "name", nullable=False)
    op.create_check_constraint("ck_circuit_scope_tags_color", "circuit_scope_tags", "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'")
    op.execute(
        "CREATE UNIQUE INDEX uq_circuit_scope_tags_run_name ON circuit_scope_tags (circuit_run_id, lower(name)) "
        "WHERE circuit_round_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_circuit_scope_tags_round_name ON circuit_scope_tags (circuit_round_id, lower(name)) "
        "WHERE circuit_round_id IS NOT NULL"
    )
