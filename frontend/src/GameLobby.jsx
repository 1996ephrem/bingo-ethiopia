import { useState } from "react";
import * as realApi from "./api";
import * as mockApi from "./mockApi";

const { api } = window.Telegram?.WebApp?.initData ? realApi : mockApi;

export default function GameLobby({ user, onJoined }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleJoin() {
    setLoading(true);
    setError("");
    try {
      const data = await api.joinGame();
      onJoined(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.container}>

      {/* Hero */}
      <div style={s.hero}>
        <div style={s.ballWrap}>
          <span style={s.ball}>🎱</span>
          <div style={s.ballGlow} />
        </div>
        <h1 style={s.title}>EthioBingo</h1>
        <p style={s.subtitle}>Real-time multiplayer bingo</p>
      </div>

      {/* Stats grid */}
      <div style={s.grid}>
        {[
          { icon: "🎯", label: "Entry Fee",    value: "10 BIRR"      },
          { icon: "🏆", label: "Prize Pool",   value: "80% of bets"  },
          { icon: "⏱️", label: "Draw Speed",   value: "Every 30s"    },
          { icon: "🔢", label: "Numbers",      value: "1 – 75"       },
        ].map(({ icon, label, value }) => (
          <div key={label} style={s.statCard}>
            <span style={s.statIcon}>{icon}</span>
            <span style={s.statValue}>{value}</span>
            <span style={s.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Balance */}
      <div style={s.balanceRow}>
        <span style={s.balLabel}>Your balance</span>
        <span style={s.balValue}>{user?.balance_birr?.toFixed(2)} BIRR</span>
      </div>

      {error && <p style={s.error}>{error}</p>}

      {/* CTA */}
      <button style={{ ...s.joinBtn, opacity: loading ? 0.7 : 1 }}
        onClick={handleJoin} disabled={loading}>
        {loading
          ? <><span style={s.btnSpinner} /> Joining…</>
          : "🎯  Join Game — 10 BIRR"}
      </button>

      <p style={s.fine}>First complete row, column or diagonal wins</p>
    </div>
  );
}

const s = {
  container: {
    flex: 1, display: "flex", flexDirection: "column",
    padding: "16px 16px 20px",
    gap: 14, overflow: "hidden",
  },

  /* Hero */
  hero: {
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 4, paddingTop: 4,
  },
  ballWrap: { position: "relative", display: "inline-flex" },
  ball: { fontSize: 52, lineHeight: 1, position: "relative", zIndex: 1 },
  ballGlow: {
    position: "absolute", inset: -8,
    background: "radial-gradient(circle, rgba(74,144,217,0.25) 0%, transparent 70%)",
    borderRadius: "50%",
  },
  title: {
    margin: 0, fontSize: 26, fontWeight: 900,
    color: "#fff", letterSpacing: 0.5,
    background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  subtitle: { margin: 0, fontSize: 12, color: "#555" },

  /* Stats */
  grid: {
    display: "grid", gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  statCard: {
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 3,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 12, padding: "12px 8px",
  },
  statIcon:  { fontSize: 20 },
  statValue: { fontSize: 14, fontWeight: 700, color: "#fff" },
  statLabel: { fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 0.8 },

  /* Balance */
  balanceRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "rgba(74,144,217,0.08)",
    border: "1px solid rgba(74,144,217,0.2)",
    borderRadius: 10, padding: "10px 14px",
  },
  balLabel: { fontSize: 12, color: "#555" },
  balValue: { fontSize: 16, fontWeight: 700, color: "#4a90d9" },

  error: { margin: 0, fontSize: 13, color: "#e74c3c", textAlign: "center" },

  /* Join button */
  joinBtn: {
    marginTop: "auto",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: "linear-gradient(135deg, #4a90d9 0%, #2563b0 100%)",
    color: "#fff", border: "none", borderRadius: 14,
    padding: "16px", fontSize: 16, fontWeight: 800,
    cursor: "pointer", letterSpacing: 0.3,
    boxShadow: "0 6px 24px rgba(74,144,217,0.4)",
  },
  btnSpinner: {
    display: "inline-block",
    width: 14, height: 14,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid #fff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },

  fine: { margin: 0, fontSize: 11, color: "#333", textAlign: "center" },
};
