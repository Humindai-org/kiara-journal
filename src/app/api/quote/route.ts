import { NextRequest, NextResponse } from "next/server";
import { toQuoteSymbol } from "@/components/trading/RiskCalculator";

// Free-tier real-time-ish quote for the OrderForm's "current price" preview —
// this app never executes orders, so a few seconds of staleness is fine.
// Get a free key at https://twelvedata.com/pricing (no card required) and
// store it in Keychain as TWELVE_DATA_API_KEY (service "kiara-journal"), same
// as the other keys scripts/build.sh pulls.
const API_KEY = process.env.TWELVE_DATA_API_KEY;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: "TWELVE_DATA_API_KEY not configured" }, { status: 200 });
  }

  try {
    const quoteSymbol = toQuoteSymbol(symbol);
    const res = await fetch(
      `https://api.twelvedata.com/price?symbol=${encodeURIComponent(quoteSymbol)}&apikey=${API_KEY}`,
      { next: { revalidate: 0 } },
    );
    const data = await res.json();

    if (!res.ok || data.status === "error" || !data.price) {
      return NextResponse.json({ error: data.message ?? `Quote unavailable for ${symbol}` }, { status: 200 });
    }

    return NextResponse.json({ price: parseFloat(data.price) });
  } catch {
    return NextResponse.json({ error: "Quote feed unreachable" }, { status: 200 });
  }
}
