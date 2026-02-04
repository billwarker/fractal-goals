#!/usr/bin/env python3
"""
Script to backup PostgreSQL database and upload to Google Cloud Storage.
Usage: python3 backup_to_gcs.py
"""

import os
import sys
import subprocess
import shutil
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env.production')

# Configuration
GCS_BUCKET_NAME = os.getenv('GCS_BUCKET_NAME')
GCS_SERVICE_ACCOUNT_KEY_PATH = os.getenv('GCS_SERVICE_ACCOUNT_KEY_PATH', 'service-account-key.json')
DATABASE_URL = os.getenv('DATABASE_URL')
BACKUP_DIR = BASE_DIR / 'backups'

def log(message):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")

def check_requirements():
    if not GCS_BUCKET_NAME:
        log("❌ Error: GCS_BUCKET_NAME environment variable is not set.")
        sys.exit(1)
    
    if not DATABASE_URL:
        log("❌ Error: DATABASE_URL environment variable is not set.")
        sys.exit(1)
        
    # Check if pg_dump is available
    if not shutil.which('pg_dump'):
        log("❌ Error: pg_dump command not found.")
        sys.exit(1)

def backup_database():
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"fractal_goals_backup_{timestamp}.sql"
    filepath = BACKUP_DIR / filename
    
    # Ensure backup directory exists
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    log(f"Starting backup to {filepath}...")
    
    try:
        # Run pg_dump
        # Note: We pass the DATABASE_URL which pg_dump understands
        command = ['pg_dump', DATABASE_URL, '-f', str(filepath)]
        
        # Mask password in log
        log_command = command.copy()
        if '://' in DATABASE_URL:
             log_command[1] = DATABASE_URL.split('@')[0].rsplit(':',1)[0] + ':***@' + DATABASE_URL.split('@')[1]
        
        subprocess.run(command, check=True)
        log("✅ Database dump successful.")
        return filepath, filename
    except subprocess.CalledProcessError as e:
        log(f"❌ Error dumping database: {e}")
        sys.exit(1)

def upload_to_gcs(filepath, filename):
    try:
        from google.cloud import storage
        from google.oauth2 import service_account
    except ImportError:
        log("❌ Error: google-cloud-storage library not installed. Run 'pip install google-cloud-storage'.")
        sys.exit(1)

    log(f"Uploading {filename} to GCS bucket: {GCS_BUCKET_NAME}...")
    
    try:
        # Initialize client
        if os.path.exists(GCS_SERVICE_ACCOUNT_KEY_PATH):
            credentials = service_account.Credentials.from_service_account_file(GCS_SERVICE_ACCOUNT_KEY_PATH)
            client = storage.Client(credentials=credentials, project=credentials.project_id)
        else:
            log("⚠️ Service account key not found. Attempting to use default credentials...")
            client = storage.Client()

        bucket = client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(f"backups/{filename}")
        
        blob.upload_from_filename(filepath)
        log("✅ Upload successful!")
        
    except Exception as e:
        log(f"❌ Error uploading to GCS: {e}")
        sys.exit(1)

def cleanup(filepath):
    log("Cleaning up local backup file...")
    try:
        filepath.unlink()
        log("✅ Local cleanup successful.")
    except Exception as e:
        log(f"⚠️ Warning: Could not delete local file: {e}")

def main():
    log("--- Starting GCS Backup Job ---")
    check_requirements()
    
    filepath, filename = backup_database()
    
    upload_to_gcs(filepath, filename)
    
    cleanup(filepath)
    log("--- Backup Job Completed Successfully ---")

if __name__ == '__main__':
    main()
