import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from config import config

# Connection params (extract from config or hardcode based on env)
# We need to connect to 'postgres' or existing db to create a new one
DEFAULT_DB = 'fractal_goals' 
NEW_DB = 'fractal_goals_test'
USER = 'fractal'
PASSWORD = 'fractal_dev_password'
HOST = 'localhost'

def create_test_db():
    try:
        # Connect to default database
        con = psycopg2.connect(dbname=DEFAULT_DB, user=USER, host=HOST, password=PASSWORD)
        con.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = con.cursor()
        
        # Check if exists
        cur.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{NEW_DB}'")
        exists = cur.fetchone()
        
        if not exists:
            print(f"Creating database {NEW_DB}...")
            cur.execute(f"CREATE DATABASE {NEW_DB}")
            print("Database created successfully.")
        else:
            print(f"Database {NEW_DB} already exists.")
            
        cur.close()
        con.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_test_db()
