#!/bin/sh
set -eu

PRIMARY_DB="${POSTGRES_DB:-fractal_goals}"
TEST_DB="${POSTGRES_TEST_DB:-fractal_goals_test}"
POSTGRES_USER="${POSTGRES_USER:-fractal}"

database_exists() {
    local name="$1"
    psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$name'" | grep -q 1
}

ensure_database() {
    local name="$1"
    if database_exists "$name"; then
        echo "Database '$name' already exists"
        return
    fi

    echo "Creating database '$name'"
    createdb -U "$POSTGRES_USER" "$name"
}

ensure_extensions() {
    local name="$1"
    echo "Ensuring extensions for '$name'"
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$name" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOSQL
}

ensure_database "$PRIMARY_DB"
ensure_extensions "$PRIMARY_DB"

if [ "$TEST_DB" != "$PRIMARY_DB" ]; then
    ensure_database "$TEST_DB"
    ensure_extensions "$TEST_DB"
fi
