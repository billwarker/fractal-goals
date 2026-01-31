#!/bin/bash
set -e

# Configuration
LOCAL_DB_CONTAINER="fractal-goals-db"
LOCAL_DB_NAME="fractal_goals"
LOCAL_DB_USER="fractal" # Updated from docker-compose.yml
CLOUD_CONNECTION_NAME="fractal-goals:us-east1:fractal-goals-postgres"
DUMP_FILE="fractal_prod_dump.bak"
PROXY_PORT=5432

echo "=================================================="
echo "🚀 Fractal Goals: Database Migration Utility"
echo "=================================================="
echo "This script will:"
echo "1. Export your local '${LOCAL_DB_NAME}' database."
echo "2. Import it into the Cloud SQL instance '${CLOUD_CONNECTION_NAME}'."
echo "=================================================="

# Check for required tools
if ! command -v docker &> /dev/null; then
    echo "❌ Error: 'docker' is not installed or not in PATH."
    exit 1
fi

# Check if container is running
if ! docker ps | grep -q "$LOCAL_DB_CONTAINER"; then
    echo "❌ Error: Container '$LOCAL_DB_CONTAINER' is not running."
    echo "   Please run: docker compose up -d postgres"
    exit 1
fi


# Check if we have EITHER pg_restore OR docker
if ! command -v pg_restore &> /dev/null && ! command -v docker &> /dev/null; then
    echo "❌ Error: Neither 'pg_restore' nor 'docker' is installed."
    echo "   We need one of them to import the data."
    exit 1
fi

if ! command -v ./cloud-sql-proxy &> /dev/null && ! command -v cloud-sql-proxy &> /dev/null; then
    echo "⚠️  Warning: 'cloud-sql-proxy' not found in current directory or PATH."
    echo "   Please download it from: https://cloud.google.com/sql/docs/postgres/sql-proxy"
    echo "   Or if you installed it via brew, make sure it's available as 'cloud-sql-proxy'."
    read -p "   Press Enter to continue if you have it installed elsewhere, or Ctrl+C to abort."
fi

echo ""
echo "Step 1: Exporting local data from Docker container..."
# Run pg_dump inside the container and pipe output to host file
docker exec "$LOCAL_DB_CONTAINER" pg_dump -Fc -U "$LOCAL_DB_USER" "$LOCAL_DB_NAME" > "$DUMP_FILE"
echo "✅ Export complete: $DUMP_FILE"

echo ""
echo "Step 2: Connecting to Cloud SQL..."
echo "👉 Make sure you have the Cloud SQL Auth Proxy running in another terminal:"
echo "   ./cloud-sql-proxy $CLOUD_CONNECTION_NAME"
echo ""
read -p "Pres Enter when the proxy is ready and listening on port $PROXY_PORT..."

echo ""
echo "Step 3: Importing to Cloud SQL..."
echo "⚠️  WARNING: This will overwrite data in the remote 'fractal_goals' database!"
read -p "Are you sure? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborting."
    exit 1
fi

echo ""
echo "🔑 Please enter the Cloud SQL database password (user: postgres):"
read -s DB_PASSWORD
echo ""

# Note: pg_restore still needs to run on HOST because it connects to the Proxy on localhost
# If host doesn't have pg_restore, we can use the docker container to run it too!

if command -v pg_restore &> /dev/null; then
    echo "Processing with local pg_restore..."
    RESTORE_CMD="pg_restore"
    # Local restore connects to proxy on localhost
    PGPASSWORD="$DB_PASSWORD" $RESTORE_CMD -h localhost -p $PROXY_PORT -U postgres -d "fractal_goals" --clean --no-owner --role=postgres "$DUMP_FILE" || {
        echo "⚠️  pg_restore executed with some warnings (check logs above)."
    }
else
    echo "Local 'pg_restore' not found. Restoring via Docker container..."
    echo "   (Connecting to host.docker.internal:$PROXY_PORT to reach your Cloud SQL Proxy)"
    
    # Copy dump file into container temporarily
    docker cp "$DUMP_FILE" "$LOCAL_DB_CONTAINER:/tmp/restore.bak"
    
    # Run pg_restore inside the container, pointing to the HOST's proxy
    # 'host.docker.internal' is special DNS name in Docker Desktop for Mac
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$LOCAL_DB_CONTAINER" pg_restore \
        -h host.docker.internal \
        -p "$PROXY_PORT" \
        -U postgres \
        -d "fractal_goals" \
        --clean \
        --no-owner \
        --role=postgres \
        "/tmp/restore.bak" || {
            echo "⚠️  pg_restore executed with some warnings (check logs above)."
        }
        
    # Cleanup inside container
    docker exec "$LOCAL_DB_CONTAINER" rm "/tmp/restore.bak"
fi

echo ""
echo "=================================================="
echo "🎉 Migration Complete!"
echo "=================================================="
rm "$DUMP_FILE"
echo "Cleanup: Removed temporary dump file."
