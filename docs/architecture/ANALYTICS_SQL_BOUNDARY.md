# Analytics raw-SQL boundary

Raw SQL in the Analytics console (`POST /api/analytics/query/run` with `mode: "sql"`)
runs user-written SELECTs against the governed catalog. The October 28, 2026 audit
showed the previous regex guard let a query read any relation, including another
account's password hash. These layers now hold the boundary; each one must stay.

1. **Feature flag on the API.** `analytics_sql_explorer` (default off) gates the
   endpoint and saved-profile writes, not only the console UI.
2. **Parse-based allowlist** (`services/_analytics_sql_guard.py`). sqlglot parses the
   statement. It is accepted only when it is one query, every relation resolves (with
   PostgreSQL CTE scoping) to a catalog dataset or a CTE defined earlier in the query,
   every function is allowlisted, and no DML, DDL, `INTO`, locking, recursive CTE, or
   parameter appears anywhere. Names are default-deny: schema-qualified functions
   (including table functions such as `s.generate_series`), tables, columns and types,
   and `OPERATOR(schema.op)`, are refused. Every type anywhere in the tree, including
   array element types, must be a plain value type, so `regclass[]` and custom types
   are refused.
3. **Validated SQL only.** The executed text is regenerated from the validated tree,
   so a tokenizer disagreement between sqlglot and PostgreSQL cannot hide a relation.
4. **Tenant-scoped CTEs.** Each catalog dataset's table name is shadowed by its
   canonical scoped query (`build_scoped_dataset_query`), so the user query only
   sees the caller's rows. `CATALOG_RELATIONS` is exactly the dataset ids.
5. **Read-only, time-bounded savepoint with a pinned `search_path`.** `SET TRANSACTION
   READ ONLY` and a statement timeout apply inside a savepoint, the mode is read back
   before running, and the savepoint is rolled back afterwards. Raw SQL also runs with
   `search_path = pg_catalog, pg_temp`, so an unqualified call can only reach a
   built-in, never a lookalike or closer-typed overload in an application schema; the
   catalog CTEs are compiled with schema-qualified table names to match. Structured
   queries use the same scope with their own timeout.
6. **Output budget.** Row limits and timeouts bound rows and time, not bytes. Raw SQL is
   measured inside PostgreSQL first (`octet_length(row_to_json(row))` per row, plus the
   total), and the typed rows are fetched only when every row is within
   `MAX_RESULT_ROW_BYTES` (64 KiB) and the total within `MAX_RESULT_BYTES` (4 MiB), so an
   oversized value never reaches the application. Structured results are checked
   against the same total after their bounded fetch.
7. **Optional least-privilege role.** When `ANALYTICS_SQL_ROLE` is set, the query also
   runs under `SET LOCAL ROLE`. The role is an allowlist: SELECT on exactly the tables
   the catalog CTEs read, generated from the catalog so a later table (credentials,
   tokens, provider state) is never readable until it joins the catalog:

   ```sql
   CREATE ROLE analytics_reader NOLOGIN;
   GRANT analytics_reader TO <application role>;
   ```
   ```bash
   python scripts/analytics_sql_role_grants.py analytics_reader | psql "$DATABASE_URL"
   ```

   Re-run the grants after a migration adds a catalog dataset.
   `test_least_privilege_role_runs_catalog_sql_and_denies_account_tables` grants only
   this set and proves catalog SQL works while the account table is denied.

## Changing the boundary

- **New dataset:** register it with a tenant policy and soft-delete field, then update
  `tests/fixtures/analytics_catalog_fields.json` with
  `UPDATE_ANALYTICS_CATALOG_SNAPSHOT=1` after confirming no column holds credentials,
  tokens, or another user's data.
- **New function:** add it to the allowlist only if it is pure, cannot read files,
  settings, or other relations, and cannot execute SQL text.
- **Explanation SQL:** `tests/fixtures/analytics_sql_corpus.json` is generated from
  the visualization builders (`UPDATE_ANALYTICS_SQL_CORPUS=1` in the client suite) and
  every entry must pass the guard and run against PostgreSQL.
- Regressions live in `tests/integration/test_analytics_sql_guard.py`. Add every new
  escape idea there as a probe that must be refused.
