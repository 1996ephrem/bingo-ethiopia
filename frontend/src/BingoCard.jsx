// 5x5 Bingo card — fills 100% of parent, no gaps
const COLUMNS = ["B", "I", "N", "G", "O"];

export default function BingoCard({ card, marked, lastDrawn }) {
  if (!card) return null;

  return (
    <div style={s.wrapper}>
      {/* Header row */}
      <div style={s.row}>
        {COLUMNS.map((col, i) => (
          <div key={col} style={{ ...s.headerCell, background: HEADER_COLORS[i] }}>
            {col}
          </div>
        ))}
      </div>

      {/* Number rows */}
      {card.map((row, rowIdx) => (
        <div key={rowIdx} style={s.row}>
          {row.map((num, colIdx) => {
            const isFree   = num === null;
            const isMarked = marked?.[rowIdx]?.[colIdx];
            const isLast   = num === lastDrawn;

            let bg = "#111827";
            let color = "#9ca3af";
            let shadow = "none";
            let scale = "scale(1)";

            if (isFree) {
              bg = "linear-gradient(135deg, #d97706, #b45309)";
              color = "#fff";
            } else if (isLast) {
              bg = "linear-gradient(135deg, #dc2626, #991b1b)";
              color = "#fff";
              shadow = "inset 0 0 12px rgba(255,100,100,0.3)";
              scale = "scale(1.05)";
            } else if (isMarked) {
              bg = "linear-gradient(135deg, #059669, #047857)";
              color = "#fff";
              shadow = "inset 0 0 8px rgba(0,200,100,0.2)";
            }

            return (
              <div key={colIdx} style={{
                ...s.cell,
                background: bg,
                color,
                boxShadow: shadow,
                transform: scale,
                zIndex: isLast ? 1 : 0,
                fontSize: isFree ? "clamp(16px, 5vw, 24px)" : "clamp(13px, 3.8vw, 19px)",
              }}>
                {isFree ? "★" : num}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const HEADER_COLORS = [
  "linear-gradient(135deg, #1d4ed8, #1e40af)",
  "linear-gradient(135deg, #7c3aed, #6d28d9)",
  "linear-gradient(135deg, #0891b2, #0e7490)",
  "linear-gradient(135deg, #059669, #047857)",
  "linear-gradient(135deg, #d97706, #b45309)",
];

const s = {
  wrapper: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    borderRadius: 14,
    overflow: "hidden",
    border: "2px solid rgba(255,255,255,0.08)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    gap: 2,
    padding: 2,
    background: "#0a0a1a",
  },
  row: {
    display: "flex",
    flex: 1,
    gap: 2,
  },
  headerCell: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    color: "#fff",
    fontSize: "clamp(14px, 4.5vw, 22px)",
    letterSpacing: 1,
    borderRadius: 8,
    textShadow: "0 1px 4px rgba(0,0,0,0.4)",
  },
  cell: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    borderRadius: 8,
    transition: "background 0.3s, transform 0.15s",
    cursor: "default",
    userSelect: "none",
  },
};
