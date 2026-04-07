"""Security utilities: Telegram WebApp data verification, rate limiting."""
import hashlib
import hmac
import json
import os
import time
from urllib.parse import unquote
from functools import wraps
from collections import defaultdict

BOT_TOKEN = os.getenv("BOT_TOKEN", "")

# Simple in-memory rate limiter (use Redis in production)
_rate_store: dict = defaultdict(list)
RATE_LIMIT = 10       # max requests
RATE_WINDOW = 60      # per 60 seconds


def verify_telegram_webapp_data(init_data: str) -> dict:
    """
    Validate Telegram WebApp initData HMAC.
    Returns parsed user dict if valid, raises ValueError if tampered.
    """
    parsed = {}
    data_check_string_parts = []

    for part in unquote(init_data).split("&"):
        key, _, value = part.partition("=")
        if key == "hash":
            received_hash = value
        else:
            data_check_string_parts.append(f"{key}={value}")
            parsed[key] = value

    data_check_string_parts.sort()
    data_check_string = "\n".join(data_check_string_parts)

    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise ValueError("Invalid Telegram WebApp signature")

    # Check freshness (max 1 hour old)
    auth_date = int(parsed.get("auth_date", 0))
    if time.time() - auth_date > 3600:
        raise ValueError("WebApp data expired")

    user_data = json.loads(parsed.get("user", "{}"))
    return user_data


def rate_limit(user_id: str) -> bool:
    """Returns True if request is allowed, False if rate limited."""
    now = time.time()
    window_start = now - RATE_WINDOW
    _rate_store[user_id] = [t for t in _rate_store[user_id] if t > window_start]
    if len(_rate_store[user_id]) >= RATE_LIMIT:
        return False
    _rate_store[user_id].append(now)
    return True


def sanitize_amount(amount) -> float:
    """Validate and sanitize monetary amounts."""
    try:
        val = float(amount)
        if val <= 0 or val > 100_000:
            raise ValueError("Amount out of range")
        return round(val, 2)
    except (TypeError, ValueError):
        raise ValueError("Invalid amount")
