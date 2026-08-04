"""add compact JSONB byte accounting function

Revision ID: e8a1c4f7b2d9
Revises: d7f9a2c4e6b8
Create Date: 2026-08-04

Storage quota checks use this immutable function to total logical JSON payload
bytes inside Postgres. Returning one scalar prevents account history from being
transferred through Supavisor on every write.
"""

from alembic import op


revision = "e8a1c4f7b2d9"
down_revision = "d7f9a2c4e6b8"
branch_labels = None
depends_on = None


# Keep migration DDL self-contained: historical migrations must continue to
# run even if application modules are reorganized later.
COMPACT_JSONB_OCTET_LENGTH_SQL = r"""
CREATE OR REPLACE FUNCTION public.compact_jsonb_octet_length(input_value jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
DECLARE
    total bigint;
    item jsonb;
    member record;
    item_count bigint := 0;
BEGIN
    CASE jsonb_typeof(input_value)
        WHEN 'array' THEN
            total := 2;
            FOR item IN SELECT value FROM jsonb_array_elements(input_value)
            LOOP
                IF item_count > 0 THEN total := total + 1; END IF;
                total := total + public.compact_jsonb_octet_length(item);
                item_count := item_count + 1;
            END LOOP;
            RETURN total;
        WHEN 'object' THEN
            total := 2;
            FOR member IN SELECT key, value FROM jsonb_each(input_value)
            LOOP
                IF item_count > 0 THEN total := total + 1; END IF;
                total := total
                    + octet_length(to_jsonb(member.key)::text)
                    + 1
                    + public.compact_jsonb_octet_length(member.value);
                item_count := item_count + 1;
            END LOOP;
            RETURN total;
        ELSE
            RETURN octet_length(input_value::text);
    END CASE;
END;
$$;
"""


def upgrade():
    op.execute(COMPACT_JSONB_OCTET_LENGTH_SQL)


def downgrade():
    op.execute(
        "DROP FUNCTION IF EXISTS public.compact_jsonb_octet_length(jsonb)"
    )
