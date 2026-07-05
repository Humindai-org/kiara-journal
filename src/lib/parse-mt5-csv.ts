export type ParsedTrade = {
  mt5_ticket: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  lot_size: number;
  entry_price: number;
  exit_price: number;
  sl: number | null;
  tp: number | null;
  open_time: string;
  close_time: string;
  duration_minutes: number;
  session: "TOKYO" | "LONDON" | "NEW_YORK" | "OVERLAP";
  gross_pnl: number;
  net_pnl: number;
  fees: number;
  swap: number;
  source: "MT5";
};

// "2026.04.01 19:10:43" → "2026-04-01T19:10:43.000Z"
function parseMT5DateTime(raw: string): string {
  return raw.trim()
    .replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3")
    .replace(" ", "T") + ".000Z";
}

function detectSession(isoUtc: string): ParsedTrade["session"] {
  const h = new Date(isoUtc).getUTCHours();
  if (h >= 7  && h < 12) return "LONDON";
  if (h >= 12 && h < 16) return "OVERLAP";
  if (h >= 16 && h < 21) return "NEW_YORK";
  return "TOKYO";
}

// Handles European locale decimals ("4782,08"), double-dash negatives ("--0,60")
function parseNum(raw: string): number {
  return parseFloat(
    raw.trim()
      .replace(/^--/, "-")   // "--0,60" → "-0,60"
      .replace(",", ".")     // "4782,08" → "4782.08"
  ) || 0;
}

function splitLine(line: string, sep: string): string[] {
  return line.split(sep).map(c => c.trim().replace(/^"(.*)"$/, "$1"));
}

// Section headers that mark non-position data in the report
const SECTION_HEADERS = ["deals", "orders", "open positions", "working orders", "balance operations"];

/**
 * Parses an MT5 Trade History Report CSV (exported via Account History → Save as Report).
 *
 * Only parses rows in the "Positions" section (closed trades).
 * Stops at other section headers (Deals, Orders, etc.).
 *
 * Column layout:
 *   0:Time(open)  1:Position  2:Symbol  3:Type  4:Volume  5:Price(entry)
 *   6:S/L  7:T/P  8:Time(close)  9:Price(exit)  10:Commission  11:Swap  12:Profit
 */
export function parseMT5CSV(text: string): ParsedTrade[] {
  const sep = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const results: ParsedTrade[] = [];
  const dateRe = /^\d{4}\.\d{2}\.\d{2}/;

  let inPositions = false;

  for (const line of lines) {
    const cols = splitLine(line, sep);
    const firstCell = cols[0].trim().toLowerCase();

    // Detect section headers
    if (cols.length <= 3 || (cols.filter(c => c !== "").length <= 2)) {
      const normalized = firstCell.replace(/[^a-z ]/g, "").trim();
      if (normalized === "positions") { inPositions = true; continue; }
      if (SECTION_HEADERS.includes(normalized)) { inPositions = false; continue; }
    }

    if (cols.length < 10) continue;

    // Identify trade rows by Type column (index 3) being "buy" or "sell"
    const type = cols[3].toLowerCase();
    if (type !== "buy" && type !== "sell") continue;

    // Position must be a numeric ticket
    const ticket = cols[1].trim();
    if (!ticket || !/^\d+$/.test(ticket)) continue;

    const openTimeRaw  = cols[0];
    const closeTimeRaw = cols[8];

    // Both timestamps must look like "YYYY.MM.DD ..."
    if (!dateRe.test(openTimeRaw) || !dateRe.test(closeTimeRaw)) continue;

    const exitPrice = parseNum(cols[9]);
    // exit_price = 0 means this is an open position or partial deal — skip
    if (exitPrice === 0) continue;

    const openTime  = parseMT5DateTime(openTimeRaw);
    const closeTime = parseMT5DateTime(closeTimeRaw);

    const openMs  = new Date(openTime).getTime();
    const closeMs = new Date(closeTime).getTime();
    const duration = isNaN(openMs) || isNaN(closeMs)
      ? 0
      : Math.round((closeMs - openMs) / 60000);

    const slRaw      = parseNum(cols[6]);
    const tpRaw      = parseNum(cols[7]);
    const commission = parseNum(cols[10]);
    const swap       = parseNum(cols[11]);
    const grossPnl   = cols[12] !== undefined ? parseNum(cols[12]) : 0;

    results.push({
      mt5_ticket:       ticket,
      instrument:       cols[2].replace(/\.$/, ""),
      direction:        type === "buy" ? "LONG" : "SHORT",
      lot_size:         parseNum(cols[4]),
      entry_price:      parseNum(cols[5]),
      exit_price:       exitPrice,
      sl:               slRaw !== 0 ? slRaw : null,
      tp:               tpRaw !== 0 ? tpRaw : null,
      open_time:        openTime,
      close_time:       closeTime,
      duration_minutes: duration,
      session:          detectSession(openTime),
      gross_pnl:        Math.round(grossPnl   * 100) / 100,
      net_pnl:          Math.round((grossPnl + commission + swap) * 100) / 100,
      fees:             Math.round(commission * 100) / 100,
      swap:             Math.round(swap       * 100) / 100,
      source:           "MT5",
    });
  }

  return results;
}
