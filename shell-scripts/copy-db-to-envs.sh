#!/bin/zsh
# Copy goals.db to goals_dev.db and goals_test.db
# Usage: ./shell-scripts/copy-db-to-envs.sh
# 
# This script copies the production database (goals.db) to the development
# and testing environment databases, creating backups of existing files first.

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Get the project root (parent of shell-scripts)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Database file paths
SOURCE_DB="$PROJECT_ROOT/goals.db"
DEV_DB="$PROJECT_ROOT/goals_dev.db"
TEST_DB="$PROJECT_ROOT/goals_test.db"

# Backup directory
BACKUP_DIR="$PROJECT_ROOT/backups"

# Timestamp for backups
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "=================================================="
echo "📋 Database Copy Utility"
echo "=================================================="
echo ""

# Check if source database exists
if [ ! -f "$SOURCE_DB" ]; then
    echo "❌ Error: Source database not found: $SOURCE_DB"
    exit 1
fi

echo "✓ Source database found: goals.db"
echo ""

# Create backups directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Creating backups directory..."
    mkdir -p "$BACKUP_DIR"
    echo "✓ Backups directory created: backups/"
    echo ""
fi

# Function to backup and copy database
copy_database() {
    local target_db=$1
    local db_name=$2
    
    echo "Processing $db_name..."
    
    # Create backup if target exists
    if [ -f "$target_db" ]; then
        local backup_file="$BACKUP_DIR/${db_name}.backup_${TIMESTAMP}"
        echo "  → Creating backup: backups/$(basename $backup_file)"
        cp "$target_db" "$backup_file"
        if [ $? -ne 0 ]; then
            echo "  ❌ Failed to create backup"
            return 1
        fi
    else
        echo "  → No existing database to backup"
    fi
    
    # Copy source to target
    echo "  → Copying goals.db to $db_name..."
    cp "$SOURCE_DB" "$target_db"
    if [ $? -ne 0 ]; then
        echo "  ❌ Failed to copy database"
        return 1
    fi
    
    echo "  ✓ Successfully copied to $db_name"
    echo ""
    return 0
}

# Copy to development database
copy_database "$DEV_DB" "goals_dev.db"
if [ $? -ne 0 ]; then
    echo "❌ Failed to copy to development database"
    exit 1
fi

# Copy to testing database
copy_database "$TEST_DB" "goals_test.db"
if [ $? -ne 0 ]; then
    echo "❌ Failed to copy to testing database"
    exit 1
fi

echo "=================================================="
echo "✅ Database copy completed successfully!"
echo "=================================================="
echo ""
echo "Summary:"
echo "  Source:      goals.db"
echo "  Copied to:   goals_dev.db"
echo "  Copied to:   goals_test.db"
echo ""

# Check if backups were created
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.backup_${TIMESTAMP} 2>/dev/null | wc -l)
if [ $BACKUP_COUNT -gt 0 ]; then
    echo "Backups created with timestamp: $TIMESTAMP"
    echo "  Location: backups/*.backup_$TIMESTAMP"
    echo "  Count: $BACKUP_COUNT file(s)"
fi
echo ""
echo "=================================================="
