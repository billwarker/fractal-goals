"""
Extensions module to hold Flask extension instances.
Avoids circular imports between app.py and blueprints.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Initialize Limiter with no app yet (will be initialized in app.py)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["2000 per day", "500 per hour"]
)
