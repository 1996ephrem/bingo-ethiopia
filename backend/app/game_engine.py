"""Core Bingo game logic: card generation, drawing, validation."""
import random
from typing import List, Optional

# Standard Bingo columns: B(1-15), I(16-30), N(31-45), G(46-60), O(61-75)
COLUMN_RANGES = {
    0: range(1, 16),    # B
    1: range(16, 31),   # I
    2: range(31, 46),   # N
    3: range(46, 61),   # G
    4: range(61, 76),   # O
}
COLUMNS = ["B", "I", "N", "G", "O"]
BET_AMOUNT = 10.0       # BIRR per game
HOUSE_FEE_PCT = 0.20    # 20% house fee


def generate_card() -> List[List[Optional[int]]]:
    """Generate a standard 5x5 Bingo card. Center (N column, row 2) is FREE."""
    card = []
    for col_idx in range(5):
        nums = random.sample(list(COLUMN_RANGES[col_idx]), 5)
        card.append(nums)
    # Transpose so card[row][col]
    grid = [[card[col][row] for col in range(5)] for row in range(5)]
    grid[2][2] = None  # FREE space
    return grid


def generate_marked(card: List[List[Optional[int]]]) -> List[List[bool]]:
    """Initial marked state — only FREE space is pre-marked."""
    marked = [[False] * 5 for _ in range(5)]
    marked[2][2] = True  # FREE space
    return marked


def auto_mark(card: List[List[Optional[int]]], marked: List[List[bool]], drawn: List[int]) -> List[List[bool]]:
    """Mark all drawn numbers on the card."""
    for row in range(5):
        for col in range(5):
            if card[row][col] in drawn:
                marked[row][col] = True
    marked[2][2] = True  # always keep FREE marked
    return marked


def check_bingo(marked: List[List[bool]]) -> bool:
    """Check rows, columns, and both diagonals for a complete Bingo."""
    # Rows
    for row in marked:
        if all(row):
            return True
    # Columns
    for col in range(5):
        if all(marked[row][col] for row in range(5)):
            return True
    # Diagonals
    if all(marked[i][i] for i in range(5)):
        return True
    if all(marked[i][4 - i] for i in range(5)):
        return True
    return False


def validate_bingo_claim(
    card: List[List[Optional[int]]],
    marked: List[List[bool]],
    drawn_numbers: List[int]
) -> bool:
    """
    Server-side anti-cheat: recompute marks from drawn numbers and verify
    the claimed bingo is legitimate. Never trust client-sent marked state.
    """
    server_marked = generate_marked(card)
    server_marked = auto_mark(card, server_marked, drawn_numbers)
    return check_bingo(server_marked)


def draw_number(already_drawn: List[int]) -> Optional[int]:
    """Draw the next random number from remaining pool (1-75)."""
    pool = [n for n in range(1, 76) if n not in already_drawn]
    if not pool:
        return None
    return random.choice(pool)


def calculate_prize_pool(player_count: int) -> dict:
    total = player_count * BET_AMOUNT
    house = total * HOUSE_FEE_PCT
    prize = total - house
    return {"total": total, "prize": prize, "house": house}


def format_card_text(card: List[List[Optional[int]]]) -> str:
    """ASCII representation of a bingo card for Telegram messages."""
    header = "  B    I    N    G    O"
    rows = []
    for row in range(5):
        cells = []
        for col in range(5):
            val = card[row][col]
            cells.append(" ** " if val is None else f"{val:3d} ")
        rows.append("|" + "|".join(cells) + "|")
    return header + "\n" + "\n".join(rows)
