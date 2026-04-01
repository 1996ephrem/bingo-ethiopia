"""CryptoBot API integration for USDT deposits and withdrawals."""
import httpx
import os
from typing import Optional

CRYPTOBOT_API_URL = "https://pay.crypt.bot/api"
CRYPTOBOT_TOKEN = os.getenv("CRYPTOBOT_TOKEN", "")

# Exchange rate: how many BIRR per 1 USDT (update via live feed in production)
BIRR_PER_USDT = float(os.getenv("BIRR_PER_USDT", "55.0"))


def usdt_to_birr(usdt: float) -> float:
    return round(usdt * BIRR_PER_USDT, 2)


def birr_to_usdt(birr: float) -> float:
    return round(birr / BIRR_PER_USDT, 6)


async def create_invoice(amount_usdt: float, user_id: int, description: str = "Bingo Deposit") -> dict:
    """Create a CryptoBot payment invoice. Returns invoice data including pay_url."""
    headers = {"Crypto-Pay-API-Token": CRYPTOBOT_TOKEN}
    payload = {
        "asset": "USDT",
        "amount": str(round(amount_usdt, 2)),
        "description": description,
        "payload": str(user_id),          # we store telegram_id as payload
        "paid_btn_name": "callback",
        "paid_btn_url": os.getenv("WEBHOOK_BASE_URL", "") + "/crypto/paid",
        "allow_comments": False,
        "allow_anonymous": False,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{CRYPTOBOT_API_URL}/createInvoice", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"CryptoBot error: {data}")
        return data["result"]


async def get_invoice(invoice_id: str) -> dict:
    """Fetch invoice status from CryptoBot."""
    headers = {"Crypto-Pay-API-Token": CRYPTOBOT_TOKEN}
    params = {"invoice_ids": invoice_id}
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{CRYPTOBOT_API_URL}/getInvoices", params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"CryptoBot error: {data}")
        items = data["result"].get("items", [])
        return items[0] if items else {}


async def transfer_to_user(telegram_id: str, amount_usdt: float, comment: str = "Bingo Withdrawal") -> dict:
    """
    Send USDT to a user via CryptoBot transfer.
    Requires the user to have started @CryptoBot.
    """
    headers = {"Crypto-Pay-API-Token": CRYPTOBOT_TOKEN}
    payload = {
        "user_id": int(telegram_id),
        "asset": "USDT",
        "amount": str(round(amount_usdt, 6)),
        "comment": comment,
        "spend_id": f"withdraw_{telegram_id}_{amount_usdt}",  # idempotency key
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{CRYPTOBOT_API_URL}/transfer", json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"CryptoBot transfer error: {data}")
        return data["result"]


def verify_webhook_signature(token: str, body: bytes, signature: str) -> bool:
    """Verify CryptoBot webhook HMAC-SHA256 signature."""
    import hmac, hashlib
    secret = hashlib.sha256(token.encode()).digest()
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
