import { useState, useEffect, useRef } from "react";
import BingoCard from "./BingoCard";
import GameLobby from "./GameLobby";
import { useTelegramApp } from "./useTelegram";
import * as realApi from "./api";
import * as mockApi from "./mockApi";

const { api, createWebSocket } = window.Telegram?.WebApp?.initData ? realApi : mockApi;
const tgApp = useTelegramApp();

export default function App() {
  const [user, setUser]           = useState(null);
  const [game, setGame]           = useState(null);
  const [lastDrawn, setLastDrawn] = useState(null);
  const [toast, setToast]         = useState("");
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState("game");
  const [depositAmt, setDepositAmt]   = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const wsRef    = useRef(null);
  const toastRef = useRef(null);

  function showToast(msg, duration = 3500) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), duration);
  }

  useEffect(() => {
    // Init Telegram Mini App
    tgApp.ready();
    tgApp.applyTheme();

    (async () => {
      try {
        const me = await api.getMe();
        setUser(me);
        const current = await api.getCurrentGame();
        if (current.game_id) { setGame(current); connectWs(current.game_id); }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
    return () => { wsRef.current?.close(); clearTimeout(toastRef.current); };
  }, []);

  function connectWs(gameId) {
    wsRef.current?.close();
    wsRef.current = createWebSocket(gameId, handleWsMessage);
  }

  function handleWsMessage(msg) {
    if (msg.event === "number_drawn") {
      setLastDrawn(msg.number);
      setGame(g => {
        if (!g) return g;
        const m = g.marked.map(r => [...r]);
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 5; c++)
            if (g.card[r][c] !== null && msg.drawn.includes(g.card[r][c])) m[r][c] = true;
        m[2][2] = true;
        return { ...g, drawn_numbers: msg.drawn, current_number: msg.number, marked: m };
      });
    }
    if (msg.event === "game_started") {
      setGame(g => g ? { ...g, status: "active", prize_pool: msg.prize_pool, players: msg.players } : g);
      showToast(`🎮 Game on! ${msg.players} players · Prize: ${msg.prize_pool} BIRR`);
      api.getMe().then(setUser);
    }
    if (msg.event === "bingo_winner") {
      showToast(`🏆 Winner! +${msg.prize} BIRR`, 5000);
      setTimeout(() => { setGame(null); setLastDrawn(null); }, 5000);
    }
  }

  // Show Telegram back button when not on game view
  useEffect(() => {
    if (view !== "game") {
      tgApp.showBackButton(() => { setView("game"); tgApp.hideBackButton(); });
    } else {
      tgApp.hideBackButton();
    }
  }, [view]);

  async function handleJoined(data) {
    tgApp.haptic.medium();
    setGame({ ...data, status: "waiting", drawn_numbers: [], players: 1 });
    connectWs(data.game_id);
    api.getMe().then(setUser);
  }

  async function handleClaimBingo() {
    tgApp.haptic.heavy();
    try {
      const res = await api.claimBingo();
      tgApp.haptic.success();
      showToast(`🎉 BINGO! You won ${res.prize} BIRR!`, 5000);
      api.getMe().then(setUser);
      setTimeout(() => { setGame(null); setLastDrawn(null); }, 5000);
    } catch (e) {
      tgApp.haptic.error();
      showToast(`❌ ${e.message}`);
    }
  }

  async function handleDeposit() {
    if (!depositAmt || isNaN(depositAmt)) return showToast("Enter a valid amount");
    try {
      const res = await api.deposit(parseFloat(depositAmt));
      tgApp.openLink(res.pay_url);
      showToast("Invoice created — pay via CryptoBot");
      setDepositAmt("");
    } catch (e) { showToast(`❌ ${e.message}`); }
  }

  async function handleWithdraw() {
    if (!withdrawAmt || isNaN(withdrawAmt)) return showToast("Enter a valid amount");
    try {
      const res = await api.withdraw(parseFloat(withdrawAmt));
      tgApp.haptic.success();
      showToast(res.message);
      api.getMe().then(setUser);
      setWithdrawAmt("");
    } catch (e) { showToast(`❌ ${e.message}`); }
  }

  if (loading) return (
    <div style={s.fullCenter}>
      <div style={s.spinner} />
      <p style={s.loadingText}>Loading Bingo...</p>
    </div>
  );

  const drawnCol = lastDrawn ? ["B","I","N","G","O"][Math.floor((lastDrawn - 1) / 15)] : null;

  return (
    <div style={s.app}>

      {/* ── Top bar ── */}
      <div style={s.topBar}>
        <div style={s.brandRow}>
          <span style={s.brandIcon}>🎱</span>
          <span style={s.brandName}>EthioBingo</span>
        </div>
        <div style={s.balanceChip}>
          <span style={s.balanceIcon}>💰</span>
          <span style={s.balanceAmt}>{user?.balance_birr?.toFixed(2)}</span>
          <span style={s.balanceCur}>BIRR</span>
        </div>
      </div>

      {/* ── Nav tabs ── */}
      <div style={s.navBar}>
        {[
          { key: "game",     icon: "🎮", label: "Play"     },
          { key: "deposit",  icon: "➕", label: "Deposit"  },
          { key: "withdraw", icon: "💸", label: "Withdraw" },
        ].map(({ key, icon, label }) => (
          <button key={key} style={{ ...s.navBtn, ...(view === key ? s.navBtnActive : {}) }}
            onClick={() => setView(key)}>
            <span style={s.navIcon}>{icon}</span>
            <span style={s.navLabel}>{label}</span>
            {view === key && <div style={s.navUnderline} />}
          </button>
        ))}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={s.toast}>
          <span>{toast}</span>
        </div>
      )}

      {/* ── Content ── */}
      <div style={s.content}>

        {/* Deposit */}
        {view === "deposit" && (
          <div style={s.formCard}>
            <div style={s.formHeader}>
              <span style={s.formIcon}>➕</span>
              <span style={s.formTitle}>Deposit USDT</span>
            </div>
            <p style={s.formSub}>Funds converted to BIRR at live rate</p>
            <label style={s.label}>Amount (USDT)</label>
            <input style={s.input} type="number" inputMode="decimal"
              placeholder="e.g. 5.00"
              value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
            <div style={s.rateRow}>
              <span style={s.rateText}>≈ {depositAmt ? (parseFloat(depositAmt||0)*55).toFixed(2) : "0.00"} BIRR</span>
              <span style={s.rateNote}>Rate: 1 USDT = 55 BIRR</span>
            </div>
            <button style={s.primaryBtn} onClick={handleDeposit}>
              Create CryptoBot Invoice
            </button>
          </div>
        )}

        {/* Withdraw */}
        {view === "withdraw" && (
          <div style={s.formCard}>
            <div style={s.formHeader}>
              <span style={s.formIcon}>💸</span>
              <span style={s.formTitle}>Withdraw</span>
            </div>
            <p style={s.formSub}>Sent as USDT to your CryptoBot wallet</p>
            <label style={s.label}>Amount (BIRR)</label>
            <input style={s.input} type="number" inputMode="decimal"
              placeholder="e.g. 100"
              value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} />
            <div style={s.rateRow}>
              <span style={s.rateText}>≈ {withdrawAmt ? (parseFloat(withdrawAmt||0)/55).toFixed(4) : "0.0000"} USDT</span>
              <span style={s.rateNote}>Available: {user?.balance_birr?.toFixed(2)} BIRR</span>
            </div>
            <button style={s.primaryBtn} onClick={handleWithdraw}>
              Withdraw to CryptoBot
            </button>
          </div>
        )}

        {/* Game */}
        {view === "game" && (
          <>
            {!game ? (
              <GameLobby user={user} onJoined={handleJoined} />
            ) : (
              <div style={s.gameArea}>

                {/* Status strip */}
                {game.status === "waiting" ? (
                  <div style={s.waitingStrip}>
                    <div style={s.pulsingDot} />
                    <span style={s.waitingText}>Waiting for players to join…</span>
                  </div>
                ) : (
                  <div style={s.statusStrip}>
                    {/* Last drawn */}
                    <div style={s.drawnBox}>
                      <span style={s.drawnColLabel}>{drawnCol}</span>
                      <span style={s.drawnNumber}>{lastDrawn ?? "—"}</span>
                    </div>
                    {/* Prize */}
                    <div style={s.prizeBox}>
                      <span style={s.prizeLabel}>PRIZE</span>
                      <span style={s.prizeValue}>{game.prize_pool} BIRR</span>
                    </div>
                    {/* Players */}
                    <div style={s.playersBox}>
                      <span style={s.playersLabel}>PLAYERS</span>
                      <span style={s.playersValue}>👥 {game.players}</span>
                    </div>
                  </div>
                )}

                {/* Drawn numbers ticker */}
                <div style={s.tickerWrap}>
                  {game.drawn_numbers?.length > 0
                    ? [...game.drawn_numbers].reverse().slice(0, 12).map((n, i) => (
                        <span key={n} style={{
                          ...s.tickChip,
                          opacity: Math.max(0.3, 1 - i * 0.07),
                          background: n === lastDrawn ? "#c0392b" : "#1e1e3a",
                          color: n === lastDrawn ? "#fff" : "#aaa",
                        }}>{n}</span>
                      ))
                    : <span style={s.tickEmpty}>Numbers will appear here</span>
                  }
                </div>

                {/* Card — fills all remaining space */}
                <div style={s.cardContainer}>
                  <BingoCard card={game.card} marked={game.marked} lastDrawn={lastDrawn} />
                </div>

                {/* BINGO button */}
                {game.status === "active" && (
                  <button style={s.bingoBtn} onClick={handleClaimBingo}>
                    🎉 &nbsp;BINGO!
                  </button>
                )}

              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

/* ── Styles ── */
const s = {
  app: {
    width: "100vw",
    height: "100dvh",
    background: "linear-gradient(160deg, #0d0d1f 0%, #0a0a1a 100%)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: "#e0e0e0",
    overflow: "hidden",
  },
  fullCenter: {
    width: "100vw", height: "100dvh",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "#0d0d1f", gap: 12,
  },
  spinner: {
    width: 40, height: 40,
    border: "3px solid #1e1e3a",
    borderTop: "3px solid #4a90d9",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: { color: "#444", fontSize: 13, margin: 0 },

  /* Top bar */
  topBar: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 7 },
  brandIcon: { fontSize: 22 },
  brandName: { fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: 0.5 },
  balanceChip: {
    display: "flex", alignItems: "center", gap: 5,
    background: "rgba(74,144,217,0.15)",
    border: "1px solid rgba(74,144,217,0.3)",
    borderRadius: 20, padding: "5px 12px",
  },
  balanceIcon: { fontSize: 13 },
  balanceAmt: { fontSize: 15, fontWeight: 700, color: "#4a90d9" },
  balanceCur: { fontSize: 10, color: "#4a90d9", opacity: 0.7, marginTop: 1 },

  /* Nav */
  navBar: {
    display: "flex",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  navBtn: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "8px 0", background: "transparent",
    border: "none", cursor: "pointer", position: "relative",
    gap: 2,
  },
  navBtnActive: {},
  navIcon: { fontSize: 18 },
  navLabel: { fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 0.8 },
  navUnderline: {
    position: "absolute", bottom: 0, left: "20%", right: "20%",
    height: 2, background: "#4a90d9", borderRadius: 2,
  },

  /* Toast */
  toast: {
    background: "linear-gradient(90deg, #1a3a5c, #1e2a4a)",
    borderBottom: "1px solid rgba(74,144,217,0.3)",
    padding: "9px 16px", fontSize: 13,
    color: "#7ec8f7", textAlign: "center",
    flexShrink: 0,
  },

  /* Content area */
  content: {
    flex: 1, display: "flex", flexDirection: "column",
    overflow: "hidden",
  },

  /* Form cards */
  formCard: {
    flex: 1, display: "flex", flexDirection: "column",
    padding: "20px 16px", gap: 10,
  },
  formHeader: { display: "flex", alignItems: "center", gap: 8 },
  formIcon: { fontSize: 22 },
  formTitle: { fontSize: 18, fontWeight: 700, color: "#fff" },
  formSub: { margin: 0, fontSize: 12, color: "#555" },
  label: { fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    padding: "13px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff", fontSize: 16, outline: "none",
    transition: "border 0.2s",
  },
  rateRow: {
    display: "flex", justifyContent: "space-between",
    fontSize: 12, color: "#555",
  },
  rateText: { color: "#4a90d9", fontWeight: 600 },
  rateNote: {},
  primaryBtn: {
    marginTop: "auto",
    background: "linear-gradient(135deg, #4a90d9 0%, #2563b0 100%)",
    color: "#fff", border: "none", borderRadius: 12,
    padding: "14px", fontSize: 15, fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(74,144,217,0.35)",
  },

  /* Game area */
  gameArea: {
    flex: 1, display: "flex", flexDirection: "column",
    padding: "10px 12px", gap: 8, overflow: "hidden",
  },

  /* Waiting */
  waitingStrip: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.04)",
    borderRadius: 10, padding: "10px 14px",
    border: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  pulsingDot: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#f39c12",
    boxShadow: "0 0 0 0 rgba(243,156,18,0.4)",
    animation: "pulse 1.5s infinite",
    flexShrink: 0,
  },
  waitingText: { fontSize: 13, color: "#888" },

  /* Status strip */
  statusStrip: {
    display: "flex", gap: 8, flexShrink: 0,
  },
  drawnBox: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #c0392b, #922b21)",
    borderRadius: 10, padding: "6px 14px",
    minWidth: 60,
    boxShadow: "0 3px 12px rgba(192,57,43,0.4)",
  },
  drawnColLabel: { fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  drawnNumber: { fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1.1 },
  prizeBox: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "rgba(39,174,96,0.12)",
    border: "1px solid rgba(39,174,96,0.25)",
    borderRadius: 10, padding: "6px 10px",
  },
  prizeLabel: { fontSize: 9, color: "#27ae60", letterSpacing: 1, textTransform: "uppercase" },
  prizeValue: { fontSize: 15, fontWeight: 700, color: "#2ecc71" },
  playersBox: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10, padding: "6px 12px",
  },
  playersLabel: { fontSize: 9, color: "#555", letterSpacing: 1, textTransform: "uppercase" },
  playersValue: { fontSize: 14, fontWeight: 600, color: "#aaa" },

  /* Ticker */
  tickerWrap: {
    display: "flex", gap: 5, overflowX: "auto",
    flexShrink: 0, paddingBottom: 2,
    scrollbarWidth: "none",
    minHeight: 28,
    alignItems: "center",
  },
  tickChip: {
    flexShrink: 0, borderRadius: 6,
    padding: "3px 8px", fontSize: 12,
    fontWeight: 600, transition: "all 0.3s",
  },
  tickEmpty: { fontSize: 11, color: "#333", fontStyle: "italic" },

  /* Card */
  cardContainer: {
    flex: 1,
    display: "flex",
    alignItems: "stretch",
    minHeight: 0,
  },

  /* Bingo button */
  bingoBtn: {
    flexShrink: 0,
    background: "linear-gradient(135deg, #e74c3c 0%, #922b21 100%)",
    color: "#fff", border: "none", borderRadius: 12,
    padding: "15px", fontSize: 20, fontWeight: 900,
    cursor: "pointer", letterSpacing: 1,
    boxShadow: "0 5px 20px rgba(231,76,60,0.5)",
    animation: "glow 2s ease-in-out infinite",
  },
};
