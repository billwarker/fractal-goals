import requests
from app import app
from models import get_engine, get_session, User
from blueprints.auth_api import encode_auth_token

with app.app_context():
    engine = get_engine()
    db_session = get_session(engine)
    user = db_session.query(User).first()
    token = encode_auth_token(user.id)

headers = {"Authorization": f"Bearer {token}"}
r = requests.get("http://localhost:8001/api/goal-levels", headers=headers)
data = r.json()
print(f"Total levels returned: {len(data)}")
for lvl in data:
    print(f"Name: '{lvl['name']}', Owner: '{lvl['owner_id']}'")
