"""Shared account tier constants.

Keep backend validation, quota behavior, and admin serialization on the same
contract so new tiers do not become scattered string literals.
"""

TIER_FREE = "free"
TIER_PAID = "paid"
TIER_LEGACY = "legacy"

ACCOUNT_TIERS = (TIER_FREE, TIER_PAID, TIER_LEGACY)
FINITE_QUOTA_TIERS = (TIER_FREE, TIER_PAID)
UNLIMITED_QUOTA_TIERS = (TIER_LEGACY,)
DEFAULT_ACCOUNT_TIER = TIER_FREE
ACCOUNT_TIER_PATTERN = rf"^({'|'.join(ACCOUNT_TIERS)})$"
