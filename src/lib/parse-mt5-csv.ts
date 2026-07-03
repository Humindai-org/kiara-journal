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

// "2025.06.15 09:34:00" → "2025-06-15T09:34:00.000Z"
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

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parses an MT5 "Detailed Report" CSV export.
 *
 * Column order (by index — headers repeat "Time" and "Price"):
 *   0:#  1:Time(open)  2:Position  3:Symbol  4:Type  5:Volume
 *   6:Price(entry)  7:S/L  8:T/P  9:Time(close)  10:Price(exit)
 *   11:Commission  12:Swap  13:Profit  14:Balance
 *
 * Rows with Type != "buy"/"sell" (deposits, balance lines) are skipped.
 */
export function parseMT5CSV(text: string): ParsedTrade[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const results: ParsedTrade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 14) continue;

    const type = cols[4].trim().toLowerCase();
    if (type !== "buy" && type !== "sell") continue;

    const ticket = cols[2].trim();
    if (!ticket) continue;

    const openTimeRaw  = cols[1].trim();
    const closeTimeRaw = cols[9].trim();
    if (!openTimeRaw || !closeTimeRaw) continue;

    const openTime  = parseMT5DateTime(openTimeRaw);
    const closeTime = parseMT5DateTime(closeTimeRaw);

    const openMs  = new Date(openTime).getTime();
    const closeMs = new Date(closeTime).getTime();
    const duration = isNaN(openMs) || isNaN(closeMs)
      ? 0
      : Math.round((closeMs - openMs) / 60000);

    const slRaw      = parseFloat(cols[7]);
    const tpRaw      = parseFloat(cols[8]);
    const commission = parseFloat(cols[11]) || 0;
    const swap       = parseFloat(cols[12]) || 0;
    const grossPnl   = parseFloat(cols[13]) || 0;

    results.push({
      mt5_ticket:       ticket,
      instrument:       cols[3].trim(),
      direction:        type === "buy" ? "LONG" : "SHORT",
      lot_size:         parseFloat(cols[5]) || 0,
      entry_price:      parseFloat(cols[6]) || 0,
      exit_price:       parseFloat(cols[10]) || 0,
      sl:               slRaw && slRaw !== 0 ? slRaw : null,
      tp:               tpRaw && tpRaw !== 0 ? tpRaw : null,
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
