// Pip values per standard lot (1.0) for common instruments
const PIP_VALUES: Record<string, number> = {
  EURUSD: 10, GBPUSD: 10, AUDUSD: 10, NZDUSD: 10,
  USDCAD: 10, USDCHF: 10,
  USDJPY: 9.09, EURJPY: 9.09, GBPJPY: 9.09,
  XAUUSD: 1,   // Gold: $1 per 0.01 move per 0.01 lot
};

// Crypto pairs are quoted in the quote currency and sized in units of the base
// asset, so "1 pip" is a $1 move on 1 unit. Detected by suffix rather than a
// hardcoded list, so new pairs work without a code change.
const CRYPTO_QUOTES = ["USDT", "USDC", "USD", "BUSD"];
const CRYPTO_BASES = [
  "BTC", "XBT", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE",
  "AVAX", "LINK", "MATIC", "DOT", "LTC", "TRX", "SUI", "ARB",
];

export type SetupGrade = "A+" | "A" | "B" | "C";

// Fraction of the account's max risk-per-trade allocated to each setup grade.
// A+ takes the full budget; lower grades take proportionally less.
export const GRADE_RISK_FACTOR: Record<SetupGrade, number> = {
  "A+": 1,
  "A": 0.7,
  "B": 0.5,
  "C": 0,
};

// Used only when an account has no plan yet (the onboarding wizard sets a real one).
export const DEFAULT_RISK_PERCENT = 0.3;

export function isCrypto(instrument: string): boolean {
  const inst = instrument.toUpperCase().replace(/[^A-Z]/g, "");
  return CRYPTO_BASES.some(
    (base) => inst.startsWith(base) && CRYPTO_QUOTES.some((q) => inst.endsWith(q))
  );
}

/**
 * Risk budget in account currency for a setup of this grade.
 * Derived from the account balance and the plan's risk-per-trade percentage —
 * never a fixed dollar amount, so it scales from a $400 account to a $100K one.
 */
export function riskForGrade(
  balance: number,
  riskPercent: number,
  grade: SetupGrade
): number {
  if (!(balance > 0) || !(riskPercent > 0)) return 0;
  const maxRisk = balance * (riskPercent / 100);
  return Math.round(maxRisk * GRADE_RISK_FACTOR[grade] * 100) / 100;
}

/** Max risk per trade for the account, ignoring grade (the A+ budget). */
export function maxRiskPerTrade(balance: number, riskPercent: number): number {
  return riskForGrade(balance, riskPercent, "A+");
}

export function getPipValue(instrument: string): number {
  const inst = instrument.toUpperCase();
  if (PIP_VALUES[inst] != null) return PIP_VALUES[inst];
  if (isCrypto(inst)) return 1;  // 1 unit of the base asset per $1 move
  return 10;
}

export function getPips(instrument: string, price1: number, price2: number): number {
  const inst = instrument.toUpperCase();
  const diff = Math.abs(price1 - price2);
  if (isCrypto(inst)) return diff;      // price distance is the risk per unit
  if (inst.includes("JPY")) return diff * 100;
  if (inst === "XAUUSD") return diff * 10;
  return diff * 10000;
}

export function calcLots(
  instrument: string,
  entry: number,
  sl: number,
  riskUsd: number
): { lots: number; riskUsd: number; slPips: number } {
  if (!(riskUsd > 0)) return { lots: 0, riskUsd: 0, slPips: 0 };

  const slPips = getPips(instrument, entry, sl);
  if (slPips === 0) return { lots: 0, riskUsd, slPips: 0 };

  const pipValue = getPipValue(instrument);
  const lots = riskUsd / (slPips * pipValue);

  // Crypto sizes need more precision than forex lots (0.01 BTC is a large position)
  const precision = isCrypto(instrument) ? 1e6 : 100;
  return { lots: Math.floor(lots * precision) / precision, riskUsd, slPips };
}

export function calcRR(
  entry: number,
  sl: number,
  tp: number
): number {
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return 0;
  return Math.round((reward / risk) * 10) / 10;
}

export function getGradeColor(grade: SetupGrade): string {
  return { "A+": "text-profit", A: "text-info", B: "text-warning", C: "text-loss" }[grade];
}
