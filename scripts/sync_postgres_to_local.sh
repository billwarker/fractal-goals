#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_TARGET_URL="postgresql://fractal:fractal_dev_password@localhost:5432/fractal_goals"
TARGET_DATABASE_URL="${LOCAL_DATABASE_URL:-}"
BACKUP_DIR="$PROJECT_ROOT/backups/postgres-sync"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
DUMP_FILE="$BACKUP_DIR/source_${TIMESTAMP}.sql"
LOCAL_BACKUP_FILE="$BACKUP_DIR/local_before_sync_${TIMESTAMP}.dump"

usage() {
    cat <<'EOF'
Usage:
  ./scripts/sync_postgres_to_local.sh [SOURCE_DATABASE_URL]

Sync a remote/source PostgreSQL database into the local development database.

Only the source public schema is synced. This avoids provider-managed schemas
and extensions such as Supabase vault/auth/storage that do not belong in local
development.

Environment:
  LOCAL_DATABASE_URL  Override the local restore target.

If SOURCE_DATABASE_URL is omitted, the script prompts for it.
The local target defaults to .env.development DATABASE_URL, then the standard
Docker Compose database:
  postgresql://fractal:fractal_dev_password@localhost:5432/fractal_goals
EOF
}

mask_url() {
    python3 - "$1" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

url = sys.argv[1]
try:
    parts = urlsplit(url)
    if parts.password is None:
        print(url)
    else:
        host = parts.hostname or ""
        if parts.port:
            host = f"{host}:{parts.port}"
        user = parts.username or ""
        netloc = f"{user}:***@{host}" if user else host
        print(urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment)))
except Exception:
    print("<unparseable database url>")
PY
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

load_default_target_url() {
    if [ -n "$TARGET_DATABASE_URL" ]; then
        return
    fi

    if [ -f "$PROJECT_ROOT/.env.development" ]; then
        TARGET_DATABASE_URL="$(
            awk -F= '/^DATABASE_URL=/ {print substr($0, index($0, "=") + 1); exit}' "$PROJECT_ROOT/.env.development"
        )"
    fi

    if [ -z "$TARGET_DATABASE_URL" ]; then
        TARGET_DATABASE_URL="$DEFAULT_TARGET_URL"
    fi
}

main() {
    if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
        usage
        exit 0
    fi

    require_command pg_dump
    require_command psql
    require_command python3

    load_default_target_url

    SOURCE_DATABASE_URL="${1:-}"
    if [ -z "$SOURCE_DATABASE_URL" ]; then
        printf "Source PostgreSQL connection URL: "
        read -r SOURCE_DATABASE_URL
    fi

    if [ -z "$SOURCE_DATABASE_URL" ]; then
        echo "Source PostgreSQL connection URL is required." >&2
        exit 1
    fi

    if [ "$SOURCE_DATABASE_URL" = "$TARGET_DATABASE_URL" ]; then
        echo "Source and local target URLs are identical. Refusing to continue." >&2
        exit 1
    fi

    echo "Source: $(mask_url "$SOURCE_DATABASE_URL")"
    echo "Target: $(mask_url "$TARGET_DATABASE_URL")"
    echo ""
    echo "This will replace all data and schema objects in the local target database."
    printf "Type 'sync local' to continue: "
    read -r CONFIRMATION

    if [ "$CONFIRMATION" != "sync local" ]; then
        echo "Aborted."
        exit 0
    fi

    mkdir -p "$BACKUP_DIR"

    echo "Backing up current local database..."
    pg_dump --format=custom --no-owner --no-acl --file "$LOCAL_BACKUP_FILE" "$TARGET_DATABASE_URL"
    echo "Local backup written to: $LOCAL_BACKUP_FILE"

    echo "Dumping source public schema..."
    pg_dump \
        --format=plain \
        --schema=public \
        --no-owner \
        --no-acl \
        --file "$DUMP_FILE.tmp" \
        "$SOURCE_DATABASE_URL"

    # Supabase may run a newer Postgres than local Docker. PostgreSQL 16 does
    # not recognize this setting, and it is not relevant to restored app data.
    sed '/^SET transaction_timeout = 0;$/d' "$DUMP_FILE.tmp" > "$DUMP_FILE"
    rm "$DUMP_FILE.tmp"

    echo "Clearing local public schema..."
    psql --set ON_ERROR_STOP=1 --dbname "$TARGET_DATABASE_URL" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
SQL

    echo "Restoring source dump into local database..."
    psql --set ON_ERROR_STOP=1 --dbname "$TARGET_DATABASE_URL" --file "$DUMP_FILE"

    echo "Ensuring local extensions..."
    psql --set ON_ERROR_STOP=1 --dbname "$TARGET_DATABASE_URL" <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
SQL

    echo "Sync complete."
    echo "Source dump retained at: $DUMP_FILE"
    echo "Previous local backup retained at: $LOCAL_BACKUP_FILE"
}

main "$@"
