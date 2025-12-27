# Environment Configuration Guide

This document explains how to use the environment-based configuration system for Fractal Goals.

## Overview

The application supports three environments:
- **Development** (`development`) - For local development with debug mode
- **Testing** (`testing`) - For QA and staging with test data
- **Production** (`production`) - For production deployment

Each environment has its own:
- Database file
- Configuration settings
- Log files
- CORS origins

## Git Branch Strategy

```
main        → production environment
develop     → testing environment
feature/*   → development environment
```

## Environment Files

### Backend (Flask)

Environment files are located in the project root:

- `.env.development` - Development settings
- `.env.testing` - Testing settings
- `.env.production` - Production settings
- `.env.example` - Template for custom .env file

**Configuration Options:**

```bash
# Application Environment
FLASK_ENV=development          # development, testing, or production
FLASK_DEBUG=True               # Enable/disable debug mode
FLASK_HOST=0.0.0.0            # Server host
FLASK_PORT=8001               # Server port

# Database
DATABASE_PATH=goals_dev.db    # Path to SQLite database

# Frontend API URL (for reference)
VITE_API_URL=http://localhost:8001/api

# CORS Origins (comma-separated)
CORS_ORIGINS=http://localhost:5173,http://localhost:5174

# Logging
LOG_LEVEL=DEBUG               # DEBUG, INFO, WARNING, ERROR
LOG_FILE=logs/dev_server.log  # Log file path
```

### Frontend (React/Vite)

Environment files are located in `client/`:

- `client/.env.development` - Development settings
- `client/.env.testing` - Testing settings
- `client/.env.production` - Production settings
- `client/.env.example` - Template

**Configuration Options:**

```bash
VITE_API_URL=http://localhost:8001/api  # Backend API URL
VITE_ENV=development                     # Environment name
```

## Database Files

Each environment uses a separate database:

- **Development**: `goals_dev.db`
- **Testing**: `goals_test.db`
- **Production**: `goals_prod.db`

All database files are gitignored to prevent accidental commits.

## Usage

### Starting the Application

#### Option 1: Start with Default Environment (Development)

```bash
# Backend only
./shell-scripts/start-flask.sh

# Frontend only
./shell-scripts/start-frontend.sh

# Both services
./shell-scripts/start-all.sh
```

#### Option 2: Start with Specific Environment

```bash
# Development
./shell-scripts/start-flask.sh development
./shell-scripts/start-frontend.sh development
./shell-scripts/start-all.sh development

# Testing
./shell-scripts/start-flask.sh testing
./shell-scripts/start-frontend.sh testing
./shell-scripts/start-all.sh testing

# Production
./shell-scripts/start-flask.sh production
./shell-scripts/start-frontend.sh production
./shell-scripts/start-all.sh production
```

### Environment Variable Loading

The application automatically loads the correct environment file based on the `ENV` environment variable:

```bash
# Set environment before starting
export ENV=testing
python app.py
```

If no `ENV` is set, it defaults to `development`.

### Checking Current Configuration

The application prints its configuration on startup:

```
==================================================
FRACTAL GOALS - DEVELOPMENT ENVIRONMENT
==================================================
Debug Mode:     True
Host:           0.0.0.0
Port:           8001
Database:       /path/to/goals_dev.db
Log File:       /path/to/logs/dev_server.log
Log Level:      DEBUG
CORS Origins:   http://localhost:5173, http://localhost:5174
==================================================
```

You can also check the health endpoint:

```bash
curl http://localhost:8001/health
```

Response:
```json
{
  "status": "healthy",
  "message": "Fractal Goals Flask Server",
  "environment": "development",
  "database": "goals_dev.db"
}
```

## Development Workflow

### Feature Development (feature/* branches)

1. Checkout feature branch
2. Use development environment
3. Work with `goals_dev.db`

```bash
git checkout -b feature/new-feature
./shell-scripts/start-all.sh development
```

### Testing (develop branch)

1. Merge feature to develop
2. Use testing environment
3. Work with `goals_test.db`

```bash
git checkout develop
git merge feature/new-feature
./shell-scripts/start-all.sh testing
```

### Production (main branch)

1. Merge develop to main
2. Use production environment
3. Work with `goals_prod.db`

```bash
git checkout main
git merge develop
./shell-scripts/start-all.sh production
```

## Database Migration Between Environments

To copy data from one environment to another:

```bash
# Copy development database to testing
cp goals_dev.db goals_test.db

# Copy testing database to production
cp goals_test.db goals_prod.db

# Backup production database
cp goals_prod.db goals_prod.db.backup.$(date +%Y%m%d)
```

## Logs

Logs are stored in the `logs/` directory:

- `logs/dev_server.log` - Development backend logs
- `logs/test_server.log` - Testing backend logs
- `logs/prod_server.log` - Production backend logs
- `logs/dev_backend.log` - Development backend (from start-all.sh)
- `logs/dev_frontend.log` - Development frontend (from start-all.sh)

All log files are gitignored.

## Creating Custom Environment

You can create a custom `.env` file for local overrides:

```bash
# Copy example
cp .env.example .env

# Edit settings
nano .env

# Start with custom settings
export ENV=custom
python app.py
```

Note: `.env` files are gitignored, so your custom settings won't be committed.

## Troubleshooting

### Wrong Database Being Used

Check the environment variable:
```bash
echo $ENV
```

Check the startup logs for the database path.

### CORS Errors

Make sure the frontend URL is in the `CORS_ORIGINS` setting for your environment.

### Configuration Not Loading

1. Verify the `.env.{environment}` file exists
2. Check that `python-dotenv` is installed: `pip install python-dotenv`
3. Check for syntax errors in the .env file

### Database Not Found

The database will be created automatically on first run. If you get errors:

```bash
# Create database manually
python -c "from models import get_engine, init_db; init_db(get_engine())"
```

## Best Practices

1. **Never commit database files** - They're gitignored for a reason
2. **Never commit .env files** - Use .env.example as a template
3. **Keep production settings secure** - Don't share production .env files
4. **Use testing environment for QA** - Don't test on production data
5. **Backup production database regularly** - Before any major changes
6. **Review configuration on startup** - Check the printed config is correct
7. **Use appropriate log levels** - DEBUG for dev, WARNING for prod

## Security Notes

- Production `.env.production` file should have `FLASK_DEBUG=False`
- Production CORS should only allow your production domain
- Keep production database backups secure
- Don't expose production logs publicly
- Consider using environment variables in production instead of .env files

## Additional Resources

- Flask Configuration: https://flask.palletsprojects.com/en/latest/config/
- Vite Environment Variables: https://vitejs.dev/guide/env-and-mode.html
- python-dotenv: https://github.com/theskumar/python-dotenv
