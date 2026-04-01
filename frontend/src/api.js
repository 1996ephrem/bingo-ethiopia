// API client — passes Telegram WebApp initData as auth header
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getInitData() {
  return window.Telegram?.WebApp?.initData || "";
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "init-data": getInitData(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  getMe: () => request("/api/me"),
  getCurrentGame: () => request("/api/game/current"),
  joinGame: () => request("/api/game/join", { method: "POST" }),
  claimBingo: () => request("/api/game/claim-bingo", { method: "POST" }),
  deposit: (amount_usdt) =>
    request("/api/deposit", { method: "POST", body: JSON.stringify({ amount_usdt }) }),
  withdraw: (amount_birr) =>
    request("/api/withdraw", { method: "POST", body: JSON.stringify({ amount_birr }) }),
};

export function createWebSocket(gameId, onMessage) {
  const wsUrl = BASE_URL.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsUrl}/ws/${gameId}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror = (e) => console.error("WS error", e);
  return ws;
}
