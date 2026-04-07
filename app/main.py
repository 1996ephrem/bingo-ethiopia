"""FastAPI main application — REST endpoints + WebSocket + game loop."""
import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import get_db, init_db, User, Game, GameSession, Transaction, GameStatus, TransactionType, TransactionStatus
from .game_engine import (
    generate_card, generate_marked, auto_mark, validate_bingo_claim,
    draw_number, calculate_prize_pool, BET_AMOUNT
)
from .websocket import manager
from .security import verify_telegram_webapp_data, rate_limit, sanitize_amount
from .crypto import create_invoice, transfer_to_user, usdt_to_birr, birr_to_usdt, verify_webhook_signature

CRYPTOBOT_TOKEN = os.getenv("CRYPTOBOT_TOKEN", "")
DRAW_INTERVAL = 30  # seconds between number draws
MIN_PLAYERS = 2     # minimum players to start a game


# ── Game loop ────────────────────────────────────────────────────────────────

async def game_loop():
    """Background task: manage game lifecycle and number drawing."""
    from .database import SessionLocal
    while True:
        await asyncio.sleep(5)
        db = SessionLocal()
        try:
            # Start waiting game if enough players joined
            waiting = db.query(Game).filter(Game.status == GameStatus.waiting).first()
            if waiting:
                player_count = len(waiting.sessions)
                if player_count >= MIN_PLAYERS:
                    waiting.status = GameStatus.active
                    waiting.started_at = datetime.utcnow()
                    pool = calculate_prize_pool(player_count)
                    waiting.prize_pool = pool["prize"]
                    waiting.house_fee = pool["house"]
                    db.commit()
                    await manager.broadcast(waiting.id, {
                        "event": "game_started",
                        "game_id": waiting.id,
                        "players": player_count,
                        "prize_pool": waiting.prize_pool,
                    })

            # Draw numbers for active games
            active_games = db.query(Game).filter(Game.status == GameStatus.active).all()
            for game in active_games:
                drawn = game.drawn_numbers or []
                number = draw_number(drawn)
                if number is None:
                    # All 75 numbers drawn — no winner, refund
                    game.status = GameStatus.finished
                    game.finished_at = datetime.utcnow()
                    db.commit()
                    await manager.broadcast(game.id, {"event": "game_draw", "message": "No winner — refunds issued"})
                    continue

                drawn.append(number)
                game.drawn_numbers = drawn
                game.current_number = number
                db.commit()

                # Auto-mark all sessions and broadcast
                for session in game.sessions:
                    session.marked = auto_mark(session.card, session.marked, drawn)
                db.commit()

                await manager.broadcast(game.id, {
                    "event": "number_drawn",
                    "number": number,
                    "drawn": drawn,
                    "column": ["B", "I", "N", "G", "O"][(number - 1) // 15],
                })

                await asyncio.sleep(DRAW_INTERVAL)

        except Exception as e:
            print(f"Game loop error: {e}")
        finally:
            db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(game_loop())
    yield


app = FastAPI(title="Telegram Bingo Bot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth helper ──────────────────────────────────────────────────────────────

def get_current_user(init_data: str = Header(...), db: Session = Depends(get_db)) -> User:
    try:
        user_data = verify_telegram_webapp_data(init_data)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    telegram_id = str(user_data["id"])
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(
            telegram_id=telegram_id,
            username=user_data.get("username"),
            first_name=user_data.get("first_name"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if user.is_banned:
        raise HTTPException(status_code=403, detail="Account banned")
    return user


# ── REST Endpoints ───────────────────────────────────────────────────────────

@app.get("/api/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "username": user.username,
        "first_name": user.first_name,
        "balance_birr": user.balance_birr,
        "balance_usdt": user.balance_usdt,
    }


@app.post("/api/game/join")
def join_game(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not rate_limit(user.telegram_id):
        raise HTTPException(status_code=429, detail="Too many requests")

    if user.balance_birr < BET_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Need {BET_AMOUNT} BIRR")

    # Check if already in an active/waiting game
    existing = (
        db.query(GameSession)
        .join(Game)
        .filter(GameSession.user_id == user.id, Game.status.in_([GameStatus.waiting, GameStatus.active]))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already in a game")

    # Find or create a waiting game
    game = db.query(Game).filter(Game.status == GameStatus.waiting).first()
    if not game:
        game = Game(status=GameStatus.waiting, drawn_numbers=[])
        db.add(game)
        db.commit()
        db.refresh(game)

    card = generate_card()
    marked = generate_marked(card)

    session = GameSession(user_id=user.id, game_id=game.id, card=card, marked=marked, bet_amount=BET_AMOUNT)
    db.add(session)

    # Deduct bet
    user.balance_birr -= BET_AMOUNT
    tx = Transaction(user_id=user.id, type=TransactionType.bet, status=TransactionStatus.completed,
                     amount_birr=BET_AMOUNT, note=f"Bet for game #{game.id}")
    db.add(tx)
    db.commit()

    return {"game_id": game.id, "session_id": session.id, "card": card, "marked": marked}


@app.post("/api/game/claim-bingo")
def claim_bingo(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = (
        db.query(GameSession)
        .join(Game)
        .filter(GameSession.user_id == user.id, Game.status == GameStatus.active)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="No active game session")

    game = session.game
    if session.has_claimed:
        raise HTTPException(status_code=400, detail="Already claimed")

    # Server-side validation — never trust client
    valid = validate_bingo_claim(session.card, session.marked, game.drawn_numbers)
    if not valid:
        session.has_claimed = True  # prevent spam claims
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid bingo claim")

    # Award prize
    game.status = GameStatus.finished
    game.winner_id = user.id
    game.finished_at = datetime.utcnow()
    user.balance_birr += game.prize_pool

    prize_tx = Transaction(
        user_id=user.id, type=TransactionType.prize,
        status=TransactionStatus.completed, amount_birr=game.prize_pool,
        note=f"Bingo prize game #{game.id}"
    )
    db.add(prize_tx)
    db.commit()

    asyncio.create_task(manager.broadcast(game.id, {
        "event": "bingo_winner",
        "winner": user.first_name or user.username,
        "prize": game.prize_pool,
    }))

    return {"message": "Bingo! You won!", "prize": game.prize_pool}


@app.get("/api/game/current")
def get_current_game(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = (
        db.query(GameSession)
        .join(Game)
        .filter(GameSession.user_id == user.id, Game.status.in_([GameStatus.waiting, GameStatus.active]))
        .first()
    )
    if not session:
        return {"game": None}
    game = session.game
    return {
        "game_id": game.id,
        "status": game.status,
        "drawn_numbers": game.drawn_numbers,
        "current_number": game.current_number,
        "prize_pool": game.prize_pool,
        "players": len(game.sessions),
        "card": session.card,
        "marked": session.marked,
    }


@app.post("/api/deposit")
async def create_deposit(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    body = await request.json()
    amount_usdt = sanitize_amount(body.get("amount_usdt", 0))
    invoice = await create_invoice(amount_usdt, int(user.telegram_id))

    tx = Transaction(
        user_id=user.id, type=TransactionType.deposit,
        status=TransactionStatus.pending,
        amount_usdt=amount_usdt,
        amount_birr=usdt_to_birr(amount_usdt),
        crypto_invoice_id=str(invoice["invoice_id"]),
    )
    db.add(tx)
    db.commit()
    return {"pay_url": invoice["pay_url"], "invoice_id": invoice["invoice_id"]}


@app.post("/api/withdraw")
async def withdraw(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    body = await request.json()
    amount_birr = sanitize_amount(body.get("amount_birr", 0))
    amount_usdt = birr_to_usdt(amount_birr)

    if user.balance_birr < amount_birr:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    result = await transfer_to_user(user.telegram_id, amount_usdt)
    user.balance_birr -= amount_birr

    tx = Transaction(
        user_id=user.id, type=TransactionType.withdrawal,
        status=TransactionStatus.completed,
        amount_birr=amount_birr, amount_usdt=amount_usdt,
        note="Withdrawal via CryptoBot"
    )
    db.add(tx)
    db.commit()
    return {"message": f"Sent {amount_usdt} USDT to your CryptoBot wallet"}


@app.post("/crypto/paid")
async def crypto_webhook(request: Request, db: Session = Depends(get_db)):
    """CryptoBot webhook — called when a payment is confirmed."""
    body = await request.body()
    signature = request.headers.get("crypto-pay-api-signature", "")

    if not verify_webhook_signature(CRYPTOBOT_TOKEN, body, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    data = json.loads(body)
    if data.get("update_type") != "invoice_paid":
        return {"ok": True}

    invoice = data["payload"]
    invoice_id = str(invoice["invoice_id"])
    telegram_id = invoice.get("payload")  # we stored telegram_id here

    tx = db.query(Transaction).filter(Transaction.crypto_invoice_id == invoice_id).first()
    if not tx or tx.status == TransactionStatus.completed:
        return {"ok": True}

    tx.status = TransactionStatus.completed
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if user:
        user.balance_birr += tx.amount_birr
        user.balance_usdt += tx.amount_usdt
    db.commit()
    return {"ok": True}


# ── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: int):
    await manager.connect(websocket, game_id)
    try:
        while True:
            await websocket.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket, game_id)
