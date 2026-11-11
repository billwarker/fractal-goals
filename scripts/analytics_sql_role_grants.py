#!/usr/bin/env python3
"""Print the GRANTs for ANALYTICS_SQL_ROLE: use of the schema, and SELECT on exactly the tables
the catalog reads.

An allowlist, so a table added later (credentials, tokens, provider state) is never
readable by analytics SQL until it joins the catalog. Schema use is granted outright, as a
database can withhold it from PUBLIC (one whose public schema was recreated, or hardened). See
docs/architecture/ANALYTICS_SQL_BOUNDARY.md. Usage:

    python scripts/analytics_sql_role_grants.py analytics_reader | psql "$DATABASE_URL"
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services._analytics_datasets import catalog_source_tables  # noqa: E402


def grant_statements(role: str) -> list[str]:
    return [
        f'GRANT USAGE ON SCHEMA public TO "{role}";',
        *(f'GRANT SELECT ON "{table}" TO "{role}";' for table in sorted(catalog_source_tables())),
    ]


if __name__ == "__main__":
    print("\n".join(grant_statements(sys.argv[1] if len(sys.argv) > 1 else "analytics_reader")))
