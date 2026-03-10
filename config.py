"""
Configuration module for Fractal Goals application.
Loads environment-specific settings from .env files.
"""

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from dotenv import load_dotenv

# Determine the base directory (project root)
BASE_DIR = Path(__file__).resolve().parent

# Determine which environment to load
# Priority: ENV environment variable > FLASK_ENV > default to development
ENV = os.getenv('ENV', os.getenv('FLASK_ENV', 'development'))

# Load the appropriate .env file
env_file = BASE_DIR / f'.env.{ENV}'
if env_file.exists():
    load_dotenv(env_file)
    print(f"✓ Loaded environment config: {env_file}")
else:
    # Fallback to .env if exists
    default_env = BASE_DIR / '.env'
    if default_env.exists():
        load_dotenv(default_env)
        print(f"✓ Loaded default environment config: {default_env}")
    else:
        print(f"⚠ No environment file found. Using defaults.")


class Config:
    """Base configuration class with environment variables."""
    
    # Application Environment
    ENV = os.getenv('ENV', os.getenv('FLASK_ENV', 'development'))
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() in ('true', '1', 'yes')
    
    # Flask Server
    HOST = os.getenv('FLASK_HOST', '0.0.0.0')
    PORT = int(os.getenv('FLASK_PORT', '8001'))
    
    # Database Configuration
    # Use DATABASE_URL for local/test environments.
    # In production/staging, prefer SUPABASE_DATABASE_URL so deployment config
    # can switch providers without overloading the generic local variable.
    DATABASE_URL = os.getenv('DATABASE_URL', None)
    SUPABASE_DATABASE_URL = os.getenv('SUPABASE_DATABASE_URL', None)
    
    # CORS
    # Support comma or semicolon or space as delimiters for flexibility
    CORS_ORIGINS = [
        origin.strip() 
        for origin in os.getenv('CORS_ORIGINS', 'http://localhost:5173').replace(';', ',').replace(' ', ',').split(',') 
        if origin.strip()
    ]
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'server.log')
    
    # Frontend API URL (for documentation/reference)
    # Secret Key for JWT
    # In production, we should fail if these are not set
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'default-jwt-secret-keep-it-safe')
    JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '72'))
    JWT_REFRESH_WINDOW_DAYS = int(os.getenv('JWT_REFRESH_WINDOW_DAYS', '7'))

    # Rate Limiting Storage URL (Redis)
    RATELIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'memory://')

    @classmethod
    def should_auto_run_migrations(cls):
        """Decide whether startup should auto-apply Alembic migrations."""
        raw_value = os.getenv('AUTO_RUN_DB_MIGRATIONS')
        if raw_value is not None:
            return raw_value.lower() in ('true', '1', 'yes', 'on')

        return cls.ENV not in ('production', 'testing')

    @classmethod
    def check_production_security(cls):
        """Verify critical security settings in production/staging environments."""
        if cls.ENV not in ('development', 'testing', 'local'):
            if cls.JWT_SECRET_KEY == 'default-jwt-secret-keep-it-safe':
                raise ValueError(f"CRITICAL: JWT_SECRET_KEY must be set in {cls.ENV} environment!")
            
            if '*' in cls.CORS_ORIGINS:
                raise ValueError(f"CRITICAL: Wildcard CORS origin (*) is NOT allowed in {cls.ENV} environment!")

    @classmethod
    def get_database_url(cls):
        """
        Get the database connection URL.
        
        Strictly requires a PostgreSQL connection URL to be set.
        Only supports PostgreSQL.
        
        Returns:
            str: SQLAlchemy-compatible database URL
        """
        url = cls._select_database_url()
        if not url:
            raise ValueError(
                "CRITICAL: DATABASE_URL must be set, or SUPABASE_DATABASE_URL must be set in production-like environments."
            )

        # Handle Heroku-style postgres:// URLs
        if url.startswith('postgres://'):
            url = url.replace('postgres://', 'postgresql://', 1)
        return cls._normalize_database_url(url)
    
    @classmethod
    def is_postgres(cls):
        """Check if the database is PostgreSQL."""
        return True

    @classmethod
    def get_database_provider(cls):
        """Return the current production database provider label."""
        url = cls.get_database_url()
        hostname = urlparse(url).hostname or ""
        if "supabase" in hostname:
            return "Supabase Postgres"
        return "PostgreSQL"

    @classmethod
    def _select_database_url(cls):
        """Select the appropriate database URL for the current environment."""
        if cls.ENV in ('production', 'staging'):
            return cls.SUPABASE_DATABASE_URL or cls.DATABASE_URL
        return cls.DATABASE_URL

    @classmethod
    def _normalize_database_url(cls, url):
        """Apply provider-specific connection defaults."""
        parsed = urlparse(url)
        hostname = parsed.hostname or ""

        if "supabase" not in hostname:
            return url

        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query.setdefault("sslmode", "require")

        normalized = parsed._replace(query=urlencode(query))
        return urlunparse(normalized)
    
    @classmethod
    def get_log_path(cls):
        """Get the absolute path to the log file."""
        if os.path.isabs(cls.LOG_FILE):
            return cls.LOG_FILE
        log_path = BASE_DIR / cls.LOG_FILE
        # Create logs directory if needed
        log_path.parent.mkdir(parents=True, exist_ok=True)
        return str(log_path)
    
    @classmethod
    def print_config(cls):
        """Print current configuration (for debugging)."""
        db_url = cls.get_database_url()
        # Mask password in database URL for security
        if '@' in db_url:
            # Format: postgresql://user:password@host:port/db
            parts = db_url.split('@')
            prefix = parts[0].rsplit(':', 1)[0]  # Remove password
            db_display = f"{prefix}:***@{parts[1]}"
        else:
            db_display = db_url
        
        print("\n" + "="*50)
        print(f"FRACTAL GOALS - {cls.ENV.upper()} ENVIRONMENT")
        print("="*50)
        print(f"Debug Mode:     {cls.DEBUG}")
        print(f"Host:           {cls.HOST}")
        print(f"Port:           {cls.PORT}")
        print(f"Database:       {db_display}")
        print(f"Database Type:  {cls.get_database_provider()}")
        print(f"Log File:       {cls.get_log_path()}")
        print(f"Log Level:      {cls.LOG_LEVEL}")
        print(f"CORS Origins:   {', '.join(cls.CORS_ORIGINS)}")
        print("="*50 + "\n")


# Create a singleton config instance
config = Config()
