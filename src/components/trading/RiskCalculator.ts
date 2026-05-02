// Pip values per standard lot (1.0) for common instruments
const PIP_VALUES: Record<string, number> = {
  EURUSD: 10, GBPUSD: 10, AUDUSD: 10, NZDUSD: 10,
  USDCAD: 10, USDCHF: 10,
  USDJPY: 9.09, EURJPY: 9.09, GBPJPY: 9.09,
  XAUUSD: 1,   // Gold: $1 per 0.01 move per 0.01 lot
};

export type SetupGrade = "A+" | "A" | "B" | "C";

const GRADE_RISK: Record<SetupGrade, number> = {
  "A+": 300,
  "A": 210,
  "B": 150,
  "C": 0,
};

export function getPipValue(instrument: string): number {
  return PIP_VALUES[instrument.toUpperCase()] ?? 10;
}

export function getPips(instrument: string, price1: number, price2: number): number {
  const inst = instrument.toUpperCase();
  const diff = Math.abs(price1 - price2);
  if (inst.includes("JPY")) return diff * 100;
  if (inst === "XAUUSD") return diff * 10;
  return diff * 10000;
}

export function calcLots(
  instrument: string,
  entry: number,
  sl: number,
  grade: SetupGrade
): { lots: number; riskUsd: number; slPips: number } {
  const riskUsd = GRADE_RISK[grade];
  if (riskUsd === 0) return { lots: 0, riskUsd: 0, slPips: 0 };

  const slPips = getPips(instrument, entry, sl);
  if (slPips === 0) return { lots: 0, riskUsd, slPips: 0 };

  const pipValue = getPipValue(instrument);
  const lots = riskUsd / (slPips * pipValue);

  return { lots: Math.floor(lots * 100) / 100, riskUsd, slPips };
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
