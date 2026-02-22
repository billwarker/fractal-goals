import sys, os, traceback
print("Script started")
os.environ['ENV'] = 'testing'

try:
    print("Importing config")
    from config import config
    
    print("Importing models")
    import models

    print("Importing app factory from tests")
    # Actually, we can just use Flask directly to test the route
    from flask import Flask
    from blueprints.auth_api import auth_bp
    
    print("Creating app")
    test_app = Flask(__name__)
    test_app.config['TESTING'] = True
    test_app.register_blueprint(auth_bp)
    
    print("Mocking engine")
    from sqlalchemy import create_engine
    engine = create_engine(config.get_database_url(), echo=True)
    models.get_engine = lambda db_path=None: engine
    
    print("Dropping all tables")
    models.Base.metadata.drop_all(engine)
    print("Creating all tables")
    models.init_db(engine)
    
    print("Creating test client")
    client = test_app.test_client()
    
    print("Sending POST request to /api/auth/signup")
    import json
    payload = {
        'username': 'newuser',
        'email': 'newuser@example.com',
        'password': 'Securepassword123'
    }
    response = client.post('/api/auth/signup', data=json.dumps(payload), content_type='application/json')
    
    print("Response received:", response.status_code)
    print(response.data)
except Exception as e:
    print("Exception!")
    traceback.print_exc()

print("Script finished")
