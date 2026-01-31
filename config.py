"""
Configuration module for Fractal Goals application.
Loads environment-specific settings from .env files.

Supports both SQLite (development) and PostgreSQL (production).
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Determine the base directory (project root)
BASE_DIR = Path(__file__).resolve().parent

# Determine which environment to load
# Priority: ENV environment variable > default to development
ENV = os.getenv('ENV', 'development')

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
    ENV = os.getenv('FLASK_ENV', 'development')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() in ('true', '1', 'yes')
    
    # Flask Server
    HOST = os.getenv('FLASK_HOST', '0.0.0.0')
    PORT = int(os.getenv('FLASK_PORT', '8001'))
    
    # Database Configuration
    # Priority: DATABASE_URL (full connection string) > DATABASE_PATH (SQLite file)
    DATABASE_URL = os.getenv('DATABASE_URL', None)
    DATABASE_PATH = os.getenv('DATABASE_PATH', 'goals.db')
    
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
    JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))

    # Rate Limiting Storage URL (Redis)
    RATELIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'memory://')

    @classmethod
    def check_production_security(cls):
        """Verify critical security settings in production."""
        if cls.ENV == 'production':
            if cls.JWT_SECRET_KEY == 'default-jwt-secret-keep-it-safe':
                raise ValueError("CRITICAL: JWT_SECRET_KEY must be set in production environment!")
            
            if '*' in cls.CORS_ORIGINS:
                raise ValueError("CRITICAL: Wildcard CORS origin (*) is NOT allowed in production!")

    @classmethod
    def get_database_url(cls):
        """
        Get the database connection URL.
        
        If DATABASE_URL is set, use it directly (supports PostgreSQL, MySQL, etc.)
        Otherwise, construct a SQLite URL from DATABASE_PATH.
        
        Returns:
            str: SQLAlchemy-compatible database URL
        """
        if cls.DATABASE_URL:
            # Production: Use provided DATABASE_URL
            # Handle Heroku-style postgres:// URLs
            url = cls.DATABASE_URL
            if url.startswith('postgres://'):
                url = url.replace('postgres://', 'postgresql://', 1)
            return url
        else:
            # Development: Use SQLite
            db_path = cls.get_db_path()
            return f"sqlite:///{db_path}"
    
    @classmethod
    def is_postgres(cls):
        """Check if the database is PostgreSQL."""
        url = cls.get_database_url()
        return url.startswith('postgresql') or url.startswith('postgres')
    
    @classmethod
    def is_sqlite(cls):
        """Check if the database is SQLite."""
        return cls.get_database_url().startswith('sqlite://')
    
    @classmethod
    def get_db_path(cls):
        """Get the absolute path to the SQLite database file."""
        if cls.DATABASE_URL:
            return None  # Not applicable for non-SQLite databases
        if os.path.isabs(cls.DATABASE_PATH):
            return cls.DATABASE_PATH
        return str(BASE_DIR / cls.DATABASE_PATH)
    
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
        print(f"Database Type:  {'PostgreSQL' if cls.is_postgres() else 'SQLite'}")
        print(f"Log File:       {cls.get_log_path()}")
        print(f"Log Level:      {cls.LOG_LEVEL}")
        print(f"CORS Origins:   {', '.join(cls.CORS_ORIGINS)}")
        print("="*50 + "\n")


# Create a singleton config instance
config = Config()
