"""Telegram bot — Mini App entry point + commands."""
import os
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup,
    WebAppInfo, MenuButtonWebApp, BotCommand
)
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from .database import SessionLocal, User, Transaction, TransactionType, TransactionStatus
from .game_engine import BET_AMOUNT
from .crypto import create_invoice, usdt_to_birr

BOT_TOKEN  = os.getenv("BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://yourdomain.com")


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_or_create_user(telegram_id: str, username: str = None, first_name: str = None) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_id == telegram_id).first()
        if not user:
            user = User(telegram_id=telegram_id, username=username, first_name=first_name)
            db.add(user)
            db.commit()
            db.refresh(user)
        return user
    finally:
        db.close()


def mini_app_button(label: str = "🎱 Play Bingo") -> InlineKeyboardMarkup:
    """Returns an inline keyboard with the Mini App launch button."""
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(label, web_app=WebAppInfo(url=WEBAPP_URL))
    ]])


# ── Commands ─────────────────────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    get_or_create_user(str(user.id), user.username, user.first_name)

    await update.message.reply_text(
        f"👋 Hey {user.first_name}! Welcome to *EthioBingo*\n\n"
        f"🎯 Bet *{BET_AMOUNT} BIRR* per game\n"
        f"💰 Win *80%* of the prize pool\n"
        f"🔢 Numbers drawn every *30 seconds*\n"
        f"📱 Tap the button below to open the game",
        parse_mode="Markdown",
        reply_markup=mini_app_button(),
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Quick shortcut to open the Mini App."""
    await update.message.reply_text(
        "Tap below to open EthioBingo 👇",
        reply_markup=mini_app_button(),
    )


async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.telegram_id == str(user.id)).first()
        if not db_user:
            await update.message.reply_text("Use /start first.")
            return
        await update.message.reply_text(
            f"💳 *Your Balance*\n\n"
            f"BIRR: `{db_user.balance_birr:.2f}`\n"
            f"USDT: `{db_user.balance_usdt:.6f}`",
            parse_mode="Markdown",
            reply_markup=mini_app_button("Open Game"),
        )
    finally:
        db.close()


async def deposit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Usage: /deposit <amount_usdt>"""
    user = update.effective_user
    args = context.args

    if not args or not args[0].replace(".", "").isdigit():
        await update.message.reply_text(
            "Usage: `/deposit <amount_usdt>`\nExample: `/deposit 5`\n\n"
            "Or use the Deposit tab inside the game 👇",
            parse_mode="Markdown",
            reply_markup=mini_app_button(),
        )
        return

    amount_usdt = float(args[0])
    if amount_usdt < 0.5:
        await update.message.reply_text("Minimum deposit is 0.5 USDT")
        return

    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.telegram_id == str(user.id)).first()
        if not db_user:
            await update.message.reply_text("Use /start first.")
            return

        invoice = await create_invoice(amount_usdt, user.id, "EthioBingo Deposit")
        birr_amount = usdt_to_birr(amount_usdt)

        tx = Transaction(
            user_id=db_user.id,
            type=TransactionType.deposit,
            status=TransactionStatus.pending,
            amount_usdt=amount_usdt,
            amount_birr=birr_amount,
            crypto_invoice_id=str(invoice["invoice_id"]),
        )
        db.add(tx)
        db.commit()

        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("💳 Pay Now", url=invoice["pay_url"]),
            InlineKeyboardButton("🎱 Open Game", web_app=WebAppInfo(url=WEBAPP_URL)),
        ]])
        await update.message.reply_text(
            f"💰 *Deposit Invoice*\n\n"
            f"Amount: `{amount_usdt} USDT` ≈ `{birr_amount} BIRR`\n"
            f"Invoice: `{invoice['invoice_id']}`\n\n"
            f"Balance updates automatically after payment.",
            parse_mode="Markdown",
            reply_markup=keyboard,
        )
    except Exception as e:
        await update.message.reply_text(f"Error creating invoice: {e}")
    finally:
        db.close()


async def withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Usage: /withdraw <amount_birr>"""
    user = update.effective_user
    args = context.args

    if not args or not args[0].replace(".", "").isdigit():
        await update.message.reply_text(
            "Usage: `/withdraw <amount_birr>`\nExample: `/withdraw 100`\n\n"
            "Or use the Withdraw tab inside the game 👇",
            parse_mode="Markdown",
            reply_markup=mini_app_button(),
        )
        return

    amount_birr = float(args[0])
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.telegram_id == str(user.id)).first()
        if not db_user:
            await update.message.reply_text("Use /start first.")
            return

        if db_user.balance_birr < amount_birr:
            await update.message.reply_text(
                f"❌ Insufficient balance.\nYou have `{db_user.balance_birr:.2f} BIRR`",
                parse_mode="Markdown",
            )
            return

        from .crypto import birr_to_usdt, transfer_to_user
        amount_usdt = birr_to_usdt(amount_birr)
        await transfer_to_user(str(user.id), amount_usdt, "EthioBingo Withdrawal")
        db_user.balance_birr -= amount_birr

        tx = Transaction(
            user_id=db_user.id,
            type=TransactionType.withdrawal,
            status=TransactionStatus.completed,
            amount_birr=amount_birr,
            amount_usdt=amount_usdt,
        )
        db.add(tx)
        db.commit()

        await update.message.reply_text(
            f"✅ *Withdrawal successful!*\n\nSent `{amount_usdt} USDT` to your CryptoBot wallet.",
            parse_mode="Markdown",
        )
    except Exception as e:
        await update.message.reply_text(f"Withdrawal failed: {e}")
    finally:
        db.close()


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🎱 *EthioBingo — How to Play*\n\n"
        "1. Deposit USDT using /deposit\n"
        "2. Open the game and tap *Join Game*\n"
        "3. Each game costs *10 BIRR*\n"
        "4. Numbers drawn every *30 seconds*\n"
        "5. Your card is marked automatically\n"
        "6. Tap *BINGO!* when you complete a line\n"
        "7. First valid claim wins *80%* of the pool\n\n"
        "📋 *Commands*\n"
        "/play — Open the game\n"
        "/balance — Check balance\n"
        "/deposit — Add funds\n"
        "/withdraw — Cash out",
        parse_mode="Markdown",
        reply_markup=mini_app_button(),
    )


# ── App setup ────────────────────────────────────────────────────────────────

async def post_init(application: Application):
    """Set bot commands and menu button after startup."""
    commands = [
        BotCommand("start",    "Welcome message"),
        BotCommand("play",     "Open EthioBingo game"),
        BotCommand("balance",  "Check your balance"),
        BotCommand("deposit",  "Deposit USDT"),
        BotCommand("withdraw", "Withdraw funds"),
        BotCommand("help",     "How to play"),
    ]
    await application.bot.set_my_commands(commands)

    # Set the menu button to open the Mini App directly
    await application.bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="🎱 Play Bingo", web_app=WebAppInfo(url=WEBAPP_URL))
    )


def create_bot_app() -> Application:
    app = (
        Application.builder()
        .token(BOT_TOKEN)
        .post_init(post_init)
        .build()
    )
    app.add_handler(CommandHandler("start",    start))
    app.add_handler(CommandHandler("play",     play))
    app.add_handler(CommandHandler("balance",  balance))
    app.add_handler(CommandHandler("deposit",  deposit))
    app.add_handler(CommandHandler("withdraw", withdraw))
    app.add_handler(CommandHandler("help",     help_cmd))
    return app
