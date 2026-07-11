"use client";

// ─── Types ────────────────────────────────────────────────────

export type DiagramType = "RPB" | "BPB" | "IPB" | "EF" | "generic";

export const DIAGRAM_OPTIONS: { type: DiagramType; label: string }[] = [
  { type: "RPB", label: "RPB" },
  { type: "BPB", label: "BPB" },
  { type: "IPB", label: "IPB" },
  { type: "EF",  label: "EF"  },
];

/** Reads the acronym from the model label and returns the matching diagram type. */
export function detectDiagramType(label: string): DiagramType {
  const upper = label.trim().toUpperCase();
  if (upper.startsWith("RPB")) return "RPB";
  if (upper.startsWith("BPB")) return "BPB";
  if (upper.startsWith("IPB")) return "IPB";
  const afterEF = upper.slice(2);
  if (upper.startsWith("EF") && (!afterEF || afterEF[0] === " " || afterEF[0] === "—" || afterEF[0] === "-")) return "EF";
  return "generic";
}

// ─── Palette ──────────────────────────────────────────────────

const C = {
  accent:      "#9d8bff",
  accentFill:  "rgba(139,92,246,0.14)",
  accentBdr:   "rgba(157,139,255,0.45)",
  accentDim:   "rgba(157,139,255,0.28)",
  profit:      "#44e4b2",
  profitFill:  "rgba(68,228,178,0.55)",
  lossFill:    "rgba(255,107,138,0.55)",
  lossBdr:     "rgba(255,107,138,0.8)",
  wick:        "rgba(180,174,207,0.32)",
  text:        "rgba(157,139,255,0.85)",
  textDim:     "rgba(127,120,155,0.55)",
  sigma:       "rgba(255,107,138,0.7)",
  sigmaDim:    "rgba(255,107,138,0.35)",
  vwap:        "rgba(68,228,178,0.7)",
};

// ─── SVG helpers ──────────────────────────────────────────────

function HLine({ x1, x2, y, stroke, w = 0.9, dash }: {
  x1: number; x2: number; y: number;
  stroke: string; w?: number; dash?: string;
}) {
  return <line x1={x1} x2={x2} y1={y} y2={y} stroke={stroke} strokeWidth={w} strokeDasharray={dash} />;
}

function Candle({ cx, top, bot, bull, opacity = 1 }: {
  cx: number; top: number; bot: number;
  bull: boolean; opacity?: number;
}) {
  const bodyH = Math.max(bot - top, 2);
  const color = bull ? C.profitFill : C.lossFill;
  const bdr   = bull ? C.profit     : C.lossBdr;
  return (
    <g opacity={opacity}>
      <line x1={cx} y1={top - 2} x2={cx} y2={bot + 2} stroke={C.wick} strokeWidth={0.7} />
      <rect x={cx - 2.8} y={top} width={5.6} height={bodyH} fill={color} stroke={bdr} strokeWidth={0.6} rx={0.5} />
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, color = C.profit }: {
  x1: number; y1: number; x2: number; y2: number; color?: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const tip = { x: x2, y: y2 };
  const base1 = { x: x2 - ux * 6 + px * 3, y: y2 - uy * 6 + py * 3 };
  const base2 = { x: x2 - ux * 6 - px * 3, y: y2 - uy * 6 - py * 3 };
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - ux * 4} y2={y2 - uy * 4}
        stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <polygon points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`} fill={color} />
    </g>
  );
}

// ─── RPB — Return Pullback ────────────────────────────────────
// Price exits VA upward → returns to VAH → rejected → SHORT to POC

function RPBSvg({ dim }: { dim: boolean }) {
  return (
    <svg viewBox="0 0 80 52" className="w-full h-full" preserveAspectRatio="xMidYMid meet" opacity={dim ? 0.35 : 1}>
      {/* VA zone fill */}
      <rect x="4" y="26" width="48" height="20" fill={C.accentFill} />

      {/* VAH / POC / VAL */}
      <HLine x1={4}  x2={52} y={26} stroke={C.accentBdr} w={1.1} />
      <HLine x1={4}  x2={52} y={36} stroke={C.accentDim} w={0.7} dash="3,2" />
      <HLine x1={4}  x2={52} y={46} stroke={C.accentDim} w={0.6} />

      {/* Labels */}
      <text x="5"  y="24.5" fontSize="5" fill={C.text}    fontFamily="ui-monospace,monospace">VAH</text>
      <text x="5"  y="34.5" fontSize="4" fill={C.textDim} fontFamily="ui-monospace,monospace">POC</text>

      {/* 3 bear candles above VAH — price exited upward */}
      <Candle cx={58} top={10} bot={20} bull={false} />
      <Candle cx={66} top={6}  bot={16} bull={false} />
      {/* Rejection candle — touches VAH from above, accent color */}
      <g>
        <line x1={74} y1={10} x2={74} y2={32} stroke={C.wick} strokeWidth={0.7} />
        <rect x={71.2} y={20} width={5.6} height={10} fill={C.accentFill} stroke={C.accentBdr} strokeWidth={0.8} rx={0.5} />
      </g>

      {/* SHORT arrow → toward POC */}
      <Arrow x1={71} y1={32} x2={56} y2={35} color={C.profit} />
    </svg>
  );
}

// ─── BPB — Breakout Pullback ──────────────────────────────────
// Compression inside VA → strong break above VAH → pullback to VAH → LONG

function BPBSvg({ dim }: { dim: boolean }) {
  return (
    <svg viewBox="0 0 80 52" className="w-full h-full" preserveAspectRatio="xMidYMid meet" opacity={dim ? 0.35 : 1}>
      {/* VA zone fill */}
      <rect x="4" y="28" width="42" height="18" fill={C.accentFill} />

      {/* VAH — key breakout level, extends full width */}
      <HLine x1={4} x2={76} y={28} stroke={C.accentBdr} w={1.1} />
      <HLine x1={4} x2={46} y={37} stroke={C.accentDim} w={0.7} dash="3,2" />
      <HLine x1={4} x2={46} y={46} stroke={C.accentDim} w={0.6} />

      {/* Label */}
      <text x="5" y="26.5" fontSize="5" fill={C.text} fontFamily="ui-monospace,monospace">VAH</text>

      {/* Compression candles inside VA (small, neutral) */}
      {[{ cx: 50, top: 32, bot: 38 }, { cx: 57, top: 31, bot: 38 }].map(({ cx, top, bot }) => (
        <g key={cx} opacity={0.5}>
          <line x1={cx} y1={top - 1} x2={cx} y2={bot + 1} stroke={C.wick} strokeWidth={0.7} />
          <rect x={cx - 2.8} y={top} width={5.6} height={bot - top} fill="rgba(127,120,155,0.25)" stroke="rgba(127,120,155,0.4)" strokeWidth={0.5} rx={0.5} />
        </g>
      ))}

      {/* Strong breakout candle — bull, breaks above VAH */}
      <Candle cx={65} top={11} bot={29} bull={true} />

      {/* Pullback candle — small red, returns to VAH */}
      <Candle cx={73} top={22} bot={30} bull={false} opacity={0.8} />

      {/* LONG continuation arrow */}
      <Arrow x1={73} y1={22} x2={73} y2={10} color={C.profit} />
    </svg>
  );
}

// ─── IPB — Imbalance Pullback ─────────────────────────────────
// IBU breaks DVA-H → pullback to DVA-H → LONG continuation of the imbalance

function IPBSvg({ dim }: { dim: boolean }) {
  return (
    <svg viewBox="0 0 80 52" className="w-full h-full" preserveAspectRatio="xMidYMid meet" opacity={dim ? 0.35 : 1}>
      {/* DVA zone fill */}
      <rect x="4" y="16" width="48" height="22" fill={C.accentFill} />

      {/* DVA-H — broken level */}
      <HLine x1={4} x2={76} y={16} stroke={C.accentBdr} w={1.1} />
      {/* VWAP */}
      <HLine x1={4} x2={76} y={27} stroke={C.vwap}      w={0.8} dash="4,2" />
      {/* DVA-L */}
      <HLine x1={4} x2={52} y={38} stroke={C.accentDim} w={0.6} />

      {/* Labels */}
      <text x="5" y="14.5" fontSize="5"   fill={C.text}    fontFamily="ui-monospace,monospace">DVA-H</text>
      <text x="5" y="25.5" fontSize="4.5" fill={C.vwap}    fontFamily="ui-monospace,monospace">VWAP</text>

      {/* IBU — big bull candle breaking DVA-H */}
      <Candle cx={58} top={5} bot={38} bull={true} />

      {/* IBU label */}
      <text x="62" y="10" fontSize="4.5" fill={C.profit} fontFamily="sans-serif" opacity={0.75}>IBU</text>

      {/* Pullback candle — small red back to DVA-H zone */}
      <Candle cx={68} top={13} bot={21} bull={false} opacity={0.85} />

      {/* LONG continuation arrow */}
      <Arrow x1={68} y1={13} x2={68} y2={4} color={C.profit} />
    </svg>
  );
}

// ─── EF — Extreme Fade ────────────────────────────────────────
// Price reaches +2σ or +3σ → FCS rejection → SHORT fade to VWAP

function EFSvg({ dim }: { dim: boolean }) {
  return (
    <svg viewBox="0 0 80 52" className="w-full h-full" preserveAspectRatio="xMidYMid meet" opacity={dim ? 0.35 : 1}>
      {/* Extreme zone fill (+2σ to +3σ) */}
      <rect x="4" y="6" width="72" height="10" fill="rgba(255,107,138,0.08)" />

      {/* +3σ */}
      <HLine x1={4} x2={76} y={6}  stroke={C.sigmaDim} w={0.7} dash="4,2" />
      {/* +2σ — entry level */}
      <HLine x1={4} x2={76} y={16} stroke={C.sigma}    w={1.1} />
      {/* VWAP / mean */}
      <HLine x1={4} x2={76} y={32} stroke={C.vwap}     w={1}   dash="4,2" />
      {/* -2σ */}
      <HLine x1={4} x2={76} y={46} stroke={C.sigmaDim} w={0.6} dash="3,2" />

      {/* Labels */}
      <text x="5" y="4.5"  fontSize="4.5" fill={C.sigmaDim} fontFamily="ui-monospace,monospace">+3σ</text>
      <text x="5" y="14.5" fontSize="5"   fill={C.sigma}    fontFamily="ui-monospace,monospace">+2σ</text>
      <text x="5" y="30.5" fontSize="4.5" fill={C.vwap}     fontFamily="ui-monospace,monospace">VWAP</text>
      <text x="5" y="44.5" fontSize="4"   fill={C.sigmaDim} fontFamily="ui-monospace,monospace">-2σ</text>

      {/* Price spike to +2σ zone */}
      <Candle cx={56} top={8}  bot={36} bull={false} />

      {/* Rejection / FCS candle at +2σ */}
      <g>
        <line x1={66} y1={10} x2={66} y2={26} stroke={C.wick} strokeWidth={0.7} />
        <rect x={63.2} y={15} width={5.6} height={9} fill={C.accentFill} stroke={C.accentBdr} strokeWidth={0.8} rx={0.5} />
      </g>
      <text x="71" y="22" fontSize="4.5" fill={C.text} fontFamily="sans-serif" opacity={0.75}>FCS</text>

      {/* SHORT arrow → toward VWAP */}
      <Arrow x1={66} y1={26} x2={66} y2={31} color={C.profit} />
    </svg>
  );
}

// ─── Generic fallback ─────────────────────────────────────────

function GenericSvg({ dim }: { dim: boolean }) {
  return (
    <svg viewBox="0 0 80 52" className="w-full h-full" preserveAspectRatio="xMidYMid meet" opacity={dim ? 0.3 : 1}>
      <rect x="4" y="20" width="72" height="14" fill="rgba(139,92,246,0.07)" />
      <HLine x1={4} x2={76} y={20} stroke="rgba(139,92,246,0.28)" dash="4,2" />
      <HLine x1={4} x2={76} y={34} stroke="rgba(139,92,246,0.18)" dash="4,2" />
      <polyline
        points="8,40 18,36 28,32 38,28 50,22 62,17 72,12"
        fill="none" stroke="rgba(157,139,255,0.35)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────

interface ModelDiagramProps {
  type: DiagramType;
  enabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ModelDiagram({ type, enabled = true, className = "", style }: ModelDiagramProps) {
  const dim = !enabled;
  return (
    <div className={className} style={style}>
      {type === "RPB" && <RPBSvg dim={dim} />}
      {type === "BPB" && <BPBSvg dim={dim} />}
      {type === "IPB" && <IPBSvg dim={dim} />}
      {type === "EF"  && <EFSvg  dim={dim} />}
      {type === "generic" && <GenericSvg dim={dim} />}
    </div>
  );
}

// ─── Inline type picker (for custom models in edit mode) ──────

interface DiagramTypePickerProps {
  value: string | undefined;
  detectedType: DiagramType;
  onChange: (type: string | undefined) => void;
}

export function DiagramTypePicker({ value, detectedType, onChange }: DiagramTypePickerProps) {
  const effective = (value as DiagramType) || detectedType;
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5">
      <span className="text-[8px] text-[rgba(127,120,155,0.55)] shrink-0 mr-0.5">Diagram</span>
      {DIAGRAM_OPTIONS.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // If already the detected type and no override, clicking sets override;
            // if clicking current explicit override, remove it (go back to auto)
            if (value === type) onChange(undefined);
            else onChange(type);
          }}
          className={`flex-1 py-0.5 rounded text-[8px] font-mono font-bold transition-colors ${
            effective === type
              ? "bg-[rgba(157,139,255,0.2)] text-[#9d8bff] border border-[rgba(157,139,255,0.4)]"
              : "text-[rgba(127,120,155,0.55)] hover:text-[rgba(157,139,255,0.7)] border border-transparent"
          }`}
        >
          {label}
        </button>
      ))}
      {/* Auto indicator when no override */}
      {!value && detectedType !== "generic" && (
        <span className="text-[7px] text-[rgba(68,228,178,0.6)] shrink-0 ml-0.5">auto</span>
      )}
    </div>
  );
}
