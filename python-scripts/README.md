# Python Scripts Directory

Utility scripts for database management, debugging, and data generation.

> ## ⚠️ Status & scope (read first)
>
> **Schema migrations are owned by Alembic** (`migrations/versions/`), not this
> directory. The schema-mutating scripts here predate Alembic (which landed
> 2026-01-17) and are **historical / reference-only** — do NOT run them against a
> current database. They are kept in place (paths unchanged) because the
> migration runbooks in `docs/migrations/` link to them.
>
> ### Historical — superseded by Alembic, do not run
> - All of `migrations/` (`migrate_to_db.py`, `migrate_add_*.py`,
>   `backfill_goal_levels.py`, `fix_activity_instances_constraint.py`, …)
> - Top-level one-off migrations: `migrate_smart_goals.py`,
>   `migrate_add_notes_table.py`, `migrate_add_image_to_notes.py`
> - `utilities/` schema mutators: `add_metric_flags.py`,
>   `add_metrics_multiplicative_column.py`, `add_updated_at_column.py`,
>   `update_schema.py`, `init_new_tables.py`, `recreate_program_tables.py`
>
> ### Still operational — safe to use
> - `debug/` and `utilities/inspect_*` / `list_*` / `get_*` — read-only inspection
> - `demo-data/` — sample data generation for dev DBs
> - Data-only backfills/cleanups that are not schema changes (e.g.
>   `recompute_session_template_stats.py`, `utilities/cleanup_empty_days.py`,
>   `utilities/resync_programs.py`) — review before running; dev DB first.
>
> **New schema change?** Add an Alembic revision (`db_migrate.py`), never a script here.

## Directory Structure

### `/migrations/` *(historical — see status note above)*
**Purpose:** Pre-Alembic database schema migration scripts. Superseded by `migrations/versions/`.

**Usage:**
```bash
source fractal-goals-venv/bin/activate
python python-scripts/migrations/migrate_<name>.py
```

**Contents:**
- Schema migration scripts
- Data transformation scripts
- Backfill scripts

**When to add scripts here:**
- Creating new database migrations
- Modifying existing schema
- Backfilling data after schema changes

---

### `/debug/`
**Purpose:** Database inspection and debugging utilities.

**Usage:**
```bash
source fractal-goals-venv/bin/activate
python python-scripts/debug/debug_<name>.py
```

**Contents:**
- Database inspection scripts
- Query testing scripts
- Data validation scripts

**When to add scripts here:**
- Debugging database issues
- Inspecting data integrity
- Testing database queries

---

### `/demo-data/`
**Purpose:** Scripts for creating demo/test data.

**Usage:**
```bash
source fractal-goals-venv/bin/activate
python python-scripts/demo-data/create_<name>.py
```

**Contents:**
- Demo data creation scripts
- Test data generators
- Data association scripts

**When to add scripts here:**
- Creating sample data for testing
- Populating test databases
- Generating realistic demo data

---

### `/utilities/`
**Purpose:** General utility scripts for maintenance and operations.

**Usage:**
```bash
source fractal-goals-venv/bin/activate
python python-scripts/utilities/<script_name>.py
```

**Contents:**
- Database maintenance scripts
- Data cleanup utilities
- Cross-environment data copying
- Schema update helpers

**When to add scripts here:**
- One-off maintenance tasks
- Data cleanup operations
- Environment synchronization
- Testing utilities

---

## Script Organization Protocol

### Naming Conventions

- **Migration scripts:** `migrate_<description>.py`
- **Debug scripts:** `debug_<target>.py` or `inspect_<target>.py` or `check_<target>.py`
- **Demo data scripts:** `create_<data_type>.py` or `associate_<relationship>.py`
- **Utility scripts:** `<action>_<target>.py` (e.g., `cleanup_empty_days.py`)

### Before Creating a New Script

1. **Check existing scripts** - Avoid duplication
2. **Choose the right category** - Use guidelines above
3. **Use descriptive names** - Make purpose clear from filename
4. **Add docstrings** - Document what the script does and how to use it

### Script Template

```python
"""
Brief description of what this script does.

Usage:
    source fractal-goals-venv/bin/activate
    python python-scripts/<category>/<script_name>.py

Requirements:
    - List any prerequisites
    - Environment variables needed
    - Database state requirements
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app, db
from models import Goal, PracticeSession  # Import needed models

def main():
    """Main script logic."""
    with app.app_context():
        # Your code here
        pass

if __name__ == '__main__':
    main()
```

### Best Practices

✅ **DO:**
- Add clear docstrings explaining purpose and usage
- Include error handling
- Print progress for long-running operations
- Commit database changes explicitly
- Test on development database first
- Add backup creation for destructive operations

❌ **DON'T:**
- Run destructive operations without backups
- Hardcode environment-specific values
- Leave uncommitted database changes
- Mix multiple unrelated operations in one script
- Forget to activate virtual environment

---

## Common Operations

### Running a Migration
```bash
source fractal-goals-venv/bin/activate
python python-scripts/migrations/migrate_<name>.py
```

### Inspecting Database
```bash
source fractal-goals-venv/bin/activate
python python-scripts/debug/inspect_<target>.py
```

### Creating Demo Data
```bash
source fractal-goals-venv/bin/activate
python python-scripts/demo-data/create_demo_<type>.py
```

### Database Backup Before Migration
```bash
cp goals.db goals.db.backup_$(date +%Y%m%d_%H%M%S)
```

---

**Last Updated:** 2026-01-01  
**Maintained By:** Project AI Agents
