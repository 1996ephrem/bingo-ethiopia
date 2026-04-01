// Mock API for local UI preview — simulates backend responses

let mockDrawn = [];
let mockCard = null;
let mockMarked = null;
let mockGameId = null;
let mockBalance = 500.0;

export const api = {
  getMe: async () => ({
    id: 1,
    telegram_id: "123456",
    username: "demo_user",
    first_name: "Demo",
    balance_birr: mockBalance,
    balance_usdt: 9.09,
  }),

  getCurrentGame: async () => {
    if (!mockGameId) return { game: null };
    return {
      game_id: mockGameId,
      status: mockDrawn.length === 0 ? "waiting" : "active",
      drawn_numbers: mockDrawn,
      current_number: mockDrawn[mockDrawn.length - 1] || null,
      prize_pool: 16.0,
      players: 2,
      card: mockCard,
      marked: mockMarked,
    };
  },

  joinGame: async () => {
    mockBalance -= 10;
    mockGameId = 1;
    mockCard = generateCard();
    mockMarked = generateMarked(mockCard);
    mockDrawn = [];
    return {
      game_id: 1,
      session_id: 1,
      card: mockCard,
      marked: mockMarked,
    };
  },

  claimBingo: async () => {
    mockBalance += 16;
    mockGameId = null;
    return { message: "Bingo! You won!", prize: 16.0 };
  },

  deposit: async (amount_usdt) => ({
    pay_url: "https://t.me/CryptoBot",
    invoice_id: "DEMO_INVOICE",
  }),

  withdraw: async (amount_birr) => {
    mockBalance -= amount_birr;
    return { message: `Sent ${(amount_birr / 55).toFixed(4)} USDT to your CryptoBot wallet` };
  },
};

export function createWebSocket(gameId, onMessage) {
  // Simulate number draws every 3 seconds in demo mode
  let interval = setInterval(() => {
    if (mockDrawn.length >= 75) { clearInterval(interval); return; }
    const pool = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !mockDrawn.includes(n));
    const num = pool[Math.floor(Math.random() * pool.length)];
    mockDrawn.push(num);
    if (mockCard) mockMarked = autoMark(mockCard, mockMarked, mockDrawn);
    onMessage({
      event: "number_drawn",
      number: num,
      drawn: [...mockDrawn],
      column: ["B", "I", "N", "G", "O"][Math.floor((num - 1) / 15)],
    });
    // Simulate game starting after 2 numbers
    if (mockDrawn.length === 2) {
      onMessage({ event: "game_started", players: 2, prize_pool: 16.0 });
    }
  }, 3000);

  return {
    close: () => clearInterval(interval),
    onmessage: null,
    onerror: null,
  };
}

// Inline card logic (no backend needed for demo)
function generateCard() {
  const ranges = [[1,15],[16,30],[31,45],[46,60],[61,75]];
  const cols = ranges.map(([lo, hi]) => {
    const pool = Array.from({ length: hi - lo + 1 }, (_, i) => i + lo);
    return pool.sort(() => Math.random() - 0.5).slice(0, 5);
  });
  const grid = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => cols[c][r]));
  grid[2][2] = null; // FREE
  return grid;
}

function generateMarked(card) {
  const m = Array.from({ length: 5 }, () => Array(5).fill(false));
  m[2][2] = true;
  return m;
}

function autoMark(card, marked, drawn) {
  const m = marked.map(r => [...r]);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if (card[r][c] !== null && drawn.includes(card[r][c])) m[r][c] = true;
  m[2][2] = true;
  return m;
}
