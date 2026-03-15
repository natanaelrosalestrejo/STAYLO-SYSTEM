"""
Read-only configuration and constants for the STAYLO backend.
Environment loading and production checks run at import time.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Production mode: when ENVIRONMENT=production, strict security checks apply (JWT secret, CORS).
IS_PRODUCTION = os.environ.get("ENVIRONMENT", "").strip().lower() == "production"

# MongoDB
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# JWT
_jwt_secret = os.environ.get("JWT_SECRET_KEY", "hotel-secret-2024")
if IS_PRODUCTION:
    if not _jwt_secret or _jwt_secret == "hotel-secret-2024":
        raise ValueError(
            "In production (ENVIRONMENT=production), JWT_SECRET_KEY must be set and must not be the default value. "
            "Set a strong secret in your environment."
        )
SECRET_KEY = _jwt_secret
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 24

# Optional / integration keys
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
HOTEL_NOTIFICATION_EMAIL = os.environ.get("HOTEL_NOTIFICATION_EMAIL")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")

# CORS: in production require explicit origins; in development allow default wildcard for local use.
_cors_raw = os.environ.get("CORS_ORIGINS", "*").strip()
if IS_PRODUCTION:
    if not _cors_raw or _cors_raw == "*":
        raise ValueError(
            "In production (ENVIRONMENT=production), CORS_ORIGINS must be set to explicit origins "
            "(comma-separated), not '*'."
        )
CORS_ORIGINS_LIST = [o.strip() for o in _cors_raw.split(",") if o.strip()]

# Extras catalog (prices in MXN)
EXTRAS_CATALOG = {
    "desayuno": {"name": "Desayuno incluido", "price_per_person_per_night": 200},
    "early_checkin": {"name": "Early Check-in (desde las 11am)", "price_flat": 300},
    "late_checkout": {"name": "Late Check-out (hasta las 2pm)", "price_flat": 300},
}
