"""Parse-based security boundary for analytics raw SQL.

Raw SQL runs beneath the governed catalog CTEs, which shadow each dataset's table
name with a tenant-scoped query. That shadowing alone does not stop a query from
naming any other relation, so this guard parses the statement and accepts it only
when every relation resolves to a catalog dataset or a CTE the query itself
defines, and every function and cast target is allowlisted.

The caller executes the SQL regenerated from the validated tree rather than the
submitted text, so a tokenizer disagreement between sqlglot and PostgreSQL cannot
hide a relation from validation. Names are default-deny: schema-qualified functions,
tables, columns, types, and operators are refused, and execution pins
``search_path`` to ``pg_catalog`` so unqualified calls cannot reach a lookalike.
"""

from dataclasses import dataclass

import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError


# sqlglot normalizes most PostgreSQL functions into typed nodes; their ``key`` is
# the lowercase class name. Anything outside this list (including every
# unrecognized ``Anonymous`` function not named below) is rejected.
ALLOWED_FUNCTION_KEYS = frozenset({
    # Aggregates
    "count", "sum", "avg", "min", "max", "arrayagg", "groupconcat", "stddev", "stddevpop",
    "stddevsamp", "variance", "variancepop", "percentilecont", "percentiledisc", "boolagg",
    "logicaland", "logicalor", "corr", "median",
    # Window functions
    "rownumber", "rank", "denserank", "lag", "lead", "firstvalue", "lastvalue", "nthvalue",
    "ntile", "percentrank", "cumedist",
    # Conditionals and comparison
    "case", "if", "coalesce", "nullif", "greatest", "least",
    # Casts
    "cast", "trycast",
    # Numeric
    "abs", "round", "floor", "ceil", "sign", "sqrt", "pow", "ln", "log", "exp", "mod",
    # Strings
    "lower", "upper", "length", "trim", "substring", "concat", "concatws", "replace", "left",
    "right", "lpad", "rpad", "initcap", "split", "splitpart", "strposition", "regexpreplace",
    "regexplike", "regexpextract", "md5", "repeat",
    # Dates and times
    "extract", "timestamptrunc", "datetrunc", "currenttimestamp", "currentdate", "timetostr",
    "strtotime", "strtodate", "todays", "age", "makeinterval", "interval",
    # Set-returning and JSON helpers
    "explodinggenerateseries", "generateseries", "unnest", "explode", "jsonextract",
    "jsonextractscalar", "jsonbextract", "jsonbextractscalar", "jsonarraycontains",
    "jsonbcontains", "jsonobject", "jsonarray", "array", "arraysize", "arraylength",
    "struct", "toarray",
})

# PostgreSQL functions sqlglot leaves as ``Anonymous`` that are pure and safe.
ALLOWED_ANONYMOUS_FUNCTIONS = frozenset({
    "date_part", "jsonb_array_elements", "jsonb_array_elements_text", "json_array_elements",
    "json_array_elements_text", "jsonb_array_length", "json_array_length", "jsonb_typeof",
    "json_typeof", "jsonb_object_keys", "json_object_keys", "jsonb_each", "jsonb_each_text",
    "json_each", "json_each_text", "jsonb_extract_path", "jsonb_extract_path_text",
    "json_extract_path", "json_extract_path_text", "to_timestamp", "to_date", "to_number",
    "date_bin", "justify_days", "justify_hours", "justify_interval", "width_bucket",
    "array_length", "array_position", "array_to_string", "string_to_array", "cardinality",
    "trunc", "div", "char_length", "btrim", "ltrim", "rtrim", "regexp_match", "regexp_matches",
    "regexp_split_to_array", "date", "every", "bool_and", "bool_or",
})

# Types limited to plain value types anywhere in a query (casts, array elements, literals);
# ``reg*``, custom, and schema-qualified types are refused.
ALLOWED_CAST_TYPES = frozenset({
    "TEXT", "VARCHAR", "CHAR", "NCHAR", "NVARCHAR", "INT", "SMALLINT", "BIGINT", "TINYINT",
    "DECIMAL", "FLOAT", "DOUBLE", "BOOLEAN", "DATE", "TIME", "TIMETZ", "TIMESTAMP",
    "TIMESTAMPTZ", "INTERVAL", "JSON", "JSONB", "UUID", "ARRAY", "BIGDECIMAL",
})

# Statement shapes that can never appear anywhere in an analytics query.
_FORBIDDEN_NODES = tuple(
    getattr(exp, name)
    for name in (
        "Insert", "Update", "Delete", "Merge", "Create", "Drop", "Alter", "TruncateTable",
        "Command", "Set", "Into", "Lock", "Copy", "Pragma", "Use", "Transaction", "Commit",
        "Rollback", "Placeholder", "Parameter", "Grant", "Revoke", "Analyze",
    )
    if hasattr(exp, name)
)


@dataclass(frozen=True)
class GuardedSql:
    sql: str


class SqlGuardError(ValueError):
    pass


def guard_analytics_sql(sql: str, catalog_relations: frozenset[str]) -> GuardedSql:
    """Return executable SQL for ``sql`` or raise ``SqlGuardError`` with a user-facing reason."""
    try:
        statements = sqlglot.parse(sql, read="postgres")
    except SqlglotError as error:
        raise SqlGuardError("Analytics SQL could not be parsed") from error
    statements = [statement for statement in statements if statement is not None]
    if len(statements) != 1:
        raise SqlGuardError("Only one SQL statement can be executed at a time")
    tree = statements[0]
    if not isinstance(tree, exp.Query):
        raise SqlGuardError("Analytics SQL must be a single SELECT query")

    for node in tree.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise SqlGuardError("Analytics SQL is read-only and cannot contain mutating statements")
        if isinstance(node, exp.Operator):
            # OPERATOR(schema.op) can name an operator outside the built-in set.
            raise SqlGuardError("OPERATOR() syntax is not available in analytics SQL")
        if isinstance(node, exp.Dot) and isinstance(node.expression, exp.Func):
            # schema.fn(...) resolves outside pg_catalog, so the bare name proves nothing.
            raise SqlGuardError("Schema-qualified functions are not available in analytics SQL")
        if isinstance(node, exp.Column) and (node.args.get("db") or node.args.get("catalog")):
            raise SqlGuardError("Use catalog table names without schema qualification")
        if isinstance(node, exp.Func):
            _check_function(node)
        if isinstance(node, exp.DataType):
            # Every type, including array element types nested inside another type.
            _check_data_type(node)

    _check_relations(tree, catalog_relations)
    return GuardedSql(sql=tree.sql(dialect="postgres"))


def _check_function(node: exp.Func) -> None:
    if isinstance(node, (exp.Connector, exp.Binary, exp.Unary)):
        # Operators (AND, arithmetic, comparisons) are modeled as functions by sqlglot.
        return
    if isinstance(node, exp.Anonymous):
        name = str(node.name).lower()
        if name in ALLOWED_ANONYMOUS_FUNCTIONS:
            return
        raise SqlGuardError(f"Function {name}() is not available in analytics SQL")
    if node.key not in ALLOWED_FUNCTION_KEYS:
        raise SqlGuardError(f"Function {node.sql_name().lower()}() is not available in analytics SQL")


def _check_data_type(node: exp.DataType) -> None:
    type_name = node.this.name if isinstance(node.this, exp.DataType.Type) else str(node.this)
    # USERDEFINED covers reg* and any schema-qualified or custom type.
    if type_name not in ALLOWED_CAST_TYPES or node.args.get("kind") is not None:
        raise SqlGuardError(f"The type {node.sql(dialect='postgres')} is not available in analytics SQL")


def _check_relations(tree: exp.Query, catalog_relations: frozenset[str]) -> None:
    """Resolve every relation with PostgreSQL's CTE scoping.

    A name defined by a non-recursive ``WITH`` is visible to later CTEs in the same
    list and to its query body, but not to its own definition or earlier siblings;
    there the name resolves to a real table, which is exactly what must be refused.
    """

    def visit(node, visible: frozenset[str]) -> None:
        with_clause = node.args.get("with_") if isinstance(node, exp.Query) else None
        if isinstance(with_clause, exp.With):
            if with_clause.args.get("recursive"):
                raise SqlGuardError("Recursive CTEs are not available in analytics SQL")
            scope = set(visible)
            for cte in with_clause.expressions:
                if not isinstance(cte.this, exp.Query):
                    raise SqlGuardError("Analytics SQL is read-only and cannot contain mutating statements")
                visit(cte.this, frozenset(scope))
                scope.add(_relation_name(cte.args["alias"].this))
            visible = frozenset(scope)

        if isinstance(node, exp.Table):
            _check_table(node, visible)

        for child in node.iter_expressions():
            if child is with_clause:
                continue
            visit(child, visible)

    visit(tree, catalog_relations)


def _relation_name(identifier: exp.Identifier) -> str:
    # PostgreSQL folds unquoted identifiers to lower case and matches quoted ones exactly.
    return identifier.name if identifier.quoted else identifier.name.lower()


def _check_table(node: exp.Table, visible: frozenset[str]) -> None:
    # Qualifiers first: a qualified table function resolves outside pg_catalog too.
    if node.args.get("db") or node.args.get("catalog"):
        raise SqlGuardError("Use catalog table names without schema qualification")
    if not isinstance(node.this, exp.Identifier):
        # Table functions such as generate_series(); their functions are checked separately.
        return
    if _relation_name(node.this) not in visible:
        raise SqlGuardError(f"Unknown analytics table: {node.name}. Query catalog datasets only")
