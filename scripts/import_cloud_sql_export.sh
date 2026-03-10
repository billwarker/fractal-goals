#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: DATABASE_URL=postgresql://... $0 /path/to/export.sql" >&2
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL is required." >&2
    exit 1
fi

SQL_FILE="$1"

if [ ! -f "$SQL_FILE" ]; then
    echo "SQL file not found: $SQL_FILE" >&2
    exit 1
fi

psql \
    --single-transaction \
    --variable ON_ERROR_STOP=1 \
    --file "$SQL_FILE" \
    --dbname "$DATABASE_URL"
