---
description: How to migrate the PostgreSQL database from local to a cloud service
---

# Cloud Database Migration Workflow

This workflow describes the steps to migrate your local PostgreSQL data to a cloud-based PostgreSQL service (e.g., Supabase, Neon, AWS RDS, GCP Cloud SQL).

## 1. Prepare the Cloud Instance
1. Create a new PostgreSQL instance on your chosen provider.
2. Obtain the connection string (e.g., `postgresql://user:password@host:port/database`).
3. Ensure the database is accessible (white-list your IP or enable public access if necessary).

## 2. Generate Schema on Cloud
Apply the Alembic migrations to the cloud database to create the table structure.
```bash
# Set your cloud DATABASE_URL in the environment
export DATABASE_URL="your-cloud-connection-string"

# Apply migrations
python db_migrate.py upgrade
```

## 3. Migrate Data
Use the `migrate_sqlite_to_postgres.py` script to transfer data from your local storage to the cloud. You can either migrate from your local SQLite file or use `pg_dump`.

### Option A: From Local SQLite (Recommended if you have the file)
```bash
python migrate_sqlite_to_postgres.py --source goals.db --target "your-cloud-connection-string" --clean
```

### Option B: Using pg_dump (If you want to migrate between PostgreSQL instances)
1. **Export local data:**
   ```bash
   docker exec fractal-goals-db pg_dump -U fractal -d fractal_goals --clean --no-owner --no-privileges > backup.sql
   ```
2. **Import to cloud:**
   ```bash
   psql "your-cloud-connection-string" < backup.sql
   ```

## 4. Update Application Configuration
1. Update your `.env.production` or CI/CD environment variables.
2. Set `DATABASE_URL` to your cloud connection string.
3. Restart the application.

```bash
# Example .env.production update
DATABASE_URL=postgresql://user:password@cloud-host.com:5432/fractal_goals
```

## 5. Verify
Run the sanity check command to ensure the application can see the data in the cloud:
```bash
source fractal-goals-venv/bin/activate
python -c "from models import get_engine, get_session, Goal; print(get_session(get_engine()).query(Goal).count())"
```
