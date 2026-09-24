"""Pure helpers shared by AdminService and its mixins: secrets, hashing, and UTC coercion.
"""

import datetime
import hashlib
import secrets
import string


def hash_invite_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_secret(prefix: str = "fg") -> str:
    token = secrets.token_urlsafe(24).replace("-", "").replace("_", "")
    return f"{prefix}_{token}"


def generate_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    password = ''.join(secrets.choice(alphabet) for _ in range(length - 2))
    return f"A1{password}"


def as_aware_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)
