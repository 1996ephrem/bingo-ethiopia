"""Entry point: runs FastAPI + Telegram bot in the same process."""
import asyncio
import os
import uvicorn
from app.main import app
from app.bot import create_bot_app

WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")


async def main():
    bot_app = create_bot_app()

    if WEBHOOK_BASE_URL:
        # Production: use webhook
        await bot_app.bot.set_webhook(f"{WEBHOOK_BASE_URL}/bot/webhook")
        print(f"Webhook set to {WEBHOOK_BASE_URL}/bot/webhook")
    else:
        # Development: use polling
        await bot_app.initialize()
        await bot_app.start()
        await bot_app.updater.start_polling()
        print("Bot polling started")

    config = uvicorn.Config(app, host="0.0.0.0", port=8000, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
