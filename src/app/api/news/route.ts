import { NextResponse } from "next/server";

// Free weekly economic calendar feed (Forex Factory mirror, JSON).
const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

type RawEvent = {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual?: string;
};

export type NewsEvent = {
  id: string;
  title: string;
  currency: string;
  date: string; // ISO
  impact: "HIGH" | "MEDIUM" | "LOW" | "HOLIDAY";
  forecast: string;
  previous: string;
  actual: string;
};

function normalizeImpact(raw: string): NewsEvent["impact"] {
  const s = raw.toLowerCase();
  if (s.includes("high")) return "HIGH";
  if (s.includes("medium")) return "MEDIUM";
  if (s.includes("low")) return "LOW";
  return "HOLIDAY";
}

export async function GET() {
  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "KiaraJournal/1.0" },
      // Cache for 30 minutes — calendar rarely changes intraday
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      return NextResponse.json({ events: [], error: `Feed returned ${res.status}` }, { status: 200 });
    }

    const raw = (await res.json()) as RawEvent[];
    const events: NewsEvent[] = raw.map((e, i) => ({
      id: `${e.country}-${e.date}-${i}`,
      title: e.title,
      currency: e.country,
      date: e.date,
      impact: normalizeImpact(e.impact),
      forecast: e.forecast ?? "",
      previous: e.previous ?? "",
      actual: e.actual ?? "",
    }));

    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { events: [], error: err instanceof Error ? err.message : "fetch failed" },
      { status: 200 }
    );
  }
}
