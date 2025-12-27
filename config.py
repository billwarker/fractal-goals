"""
Configuration module for Fractal Goals application.
Loads environment-specific settings from .env files.
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
    
    # Database
    DATABASE_PATH = os.getenv('DATABASE_PATH', 'goals.db')
    DATABASE_URL = f"sqlite:///{DATABASE_PATH}"
    
    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'server.log')
    
    # Frontend API URL (for documentation/reference)
    VITE_API_URL = os.getenv('VITE_API_URL', 'http://localhost:8001/api')
    
    @classmethod
    def get_db_path(cls):
        """Get the absolute path to the database file."""
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
        print("\n" + "="*50)
        print(f"FRACTAL GOALS - {cls.ENV.upper()} ENVIRONMENT")
        print("="*50)
        print(f"Debug Mode:     {cls.DEBUG}")
        print(f"Host:           {cls.HOST}")
        print(f"Port:           {cls.PORT}")
        print(f"Database:       {cls.get_db_path()}")
        print(f"Log File:       {cls.get_log_path()}")
        print(f"Log Level:      {cls.LOG_LEVEL}")
        print(f"CORS Origins:   {', '.join(cls.CORS_ORIGINS)}")
        print("="*50 + "\n")


# Create a singleton config instance
config = Config()
