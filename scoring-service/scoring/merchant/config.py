"""Configuration constants for the scoring system"""

import os
from dotenv import load_dotenv

load_dotenv()

# Tinybird/ClickHouse connection
TINYBIRD_TOKEN = os.getenv("TINYBIRD_TOKEN", "")
TINYBIRD_HOST = os.getenv("TINYBIRD_HOST", "api.tinybird.co")

# Scoring parameters
MIN_PAID_INVOICES = int(os.getenv("MIN_INVOICES", "3"))
MIN_TENURE_DAYS = int(os.getenv("MIN_TENURE_DAYS", "30"))

# Merchant configuration
DEFAULT_MERCHANT_ID = os.getenv("MERCHANT_ID", "inmobiliaria")

# Score weights (must sum to 1.0)
WEIGHT_RELIABILITY = 0.40
WEIGHT_INTENT = 0.30
WEIGHT_TIMELINESS = 0.20
WEIGHT_CAPACITY = 0.10
TENURE_MULTIPLIER = 0.10  # Bonus, not part of main weights

# Failure reason classifications
HIGH_RISK_FAILURES = [
    "NOT_ENOUGH_FUNDS",
    "ACCOUNT_LIMIT_REACHED",
    "ACCOUNT_BLOCKED_OR_INACTIVE",
    "INVALID_ACCOUNT",
]

MEDIUM_RISK_FAILURES = [
    "CUSTOMER_CANCELLATION",
    "AUTHENTICATION_FAILED",
    "TOO_MANY_ATTEMPTS",
    "INVALID_AMOUNT",
]

LOW_RISK_FAILURES = [
    "BANK_NOT_AVAILABLE",
    "EXPIRED",
    "ERROR",
    "DECLINED_BY_BANK",
    "PAYMENT_METHOD_UNAVAILABLE",
    "DECLINED_FOR_SECURITY",
    "",  # Empty status message
]

# Penalty points for failures
PENALTY_HIGH_RISK = 15
PENALTY_MEDIUM_RISK = 5
PENALTY_LOW_RISK = 1
PENALTY_INSUFFICIENT_FUNDS_THRESHOLD = 0.3  # 30% of failures
PENALTY_INSUFFICIENT_FUNDS_SEVERE = 50

# Tier thresholds
TIER_THRESHOLDS = {
    "PRIME": 750,
    "STANDARD": 600,
    "SUBPRIME": 450,
    "HIGH_RISK": 300,
}

# Credit multipliers by tier
CREDIT_MULTIPLIERS = {
    "PRIME": 3.0,
    "STANDARD": 2.0,
    "SUBPRIME": 1.0,
    "HIGH_RISK": 0.0,
    "VERY_HIGH_RISK": 0.0,
}

# Interest rates by tier (monthly %)
INTEREST_RATES = {
    "PRIME": (2.0, 2.5),
    "STANDARD": (3.5, 4.0),
    "SUBPRIME": (5.0, 6.0),
    "HIGH_RISK": None,
    "VERY_HIGH_RISK": None,
}

# Expected default rates by tier
EXPECTED_DEFAULT_RATES = {
    "PRIME": 0.03,
    "STANDARD": 0.065,
    "SUBPRIME": 0.15,
    "HIGH_RISK": 0.30,
    "VERY_HIGH_RISK": 0.50,
}
