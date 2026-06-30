import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type Region = "EUROPEAN" | "AMERICAN" | "ASIAN";

const REGION_META: Record<Region, { label: string; subtitle: string }> = {
  EUROPEAN: { label: "European Opening Briefing", subtitle: "Daily European Opening Briefing" },
  AMERICAN: { label: "American Briefing", subtitle: "Daily US Open Briefing" },
  ASIAN: { label: "Asian Briefing", subtitle: "Daily Asia-Pacific Briefing" },
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ─── Quote fetching (Yahoo Finance, no key) ──────────────────
type Quote = { name: string; value: string; change: string; dir: "up" | "down" | "flat" };

type SymDef = { symbol: string; name: string; fmt: "index" | "fx" | "pct" | "price" | "crypto" };

function formatValue(v: number, fmt: SymDef["fmt"]): string {
  switch (fmt) {
    case "fx": return v.toFixed(4);
    case "pct": return `${v.toFixed(2)}%`;
    case "crypto": return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
    case "price": return v.toFixed(2);
    default: return v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 });
  }
}

async function fetchQuote(def: SymDef): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.symbol)}?interval=1d&range=2d`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    let price: number = meta.regularMarketPrice;
    const prev: number = meta.chartPreviousClose ?? meta.previousClose;
    if (price == null || prev == null) return null;
    // Yahoo reports yields like ^TNX as the value*1 already in percent points
    if (def.fmt === "pct") price = price; // ^TNX already e.g. 4.50
    const pct = prev !== 0 ? ((price - prev) / prev) * 100 : 0;
    const dir = pct > 0.02 ? "up" : pct < -0.02 ? "down" : "flat";
    return {
      name: def.name,
      value: formatValue(price, def.fmt),
      change: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
      dir,
    };
  } catch {
    return null;
  }
}

async function fetchQuotes(defs: SymDef[]): Promise<Quote[]> {
  const results = await Promise.all(defs.map(fetchQuote));
  return results.filter((q): q is Quote => q !== null);
}

// ─── News headlines (Google News RSS, no key) ────────────────
type Headline = { headline: string; body: string; tags?: string[]; link?: string };

function timeAgo(pub: string): string {
  const t = new Date(pub).getTime();
  if (isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function fetchHeadlines(query: string, limit = 5): Promise<Headline[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 600 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
    return items.map((m) => {
      const block = m[1];
      const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim();
      const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim();
      const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "").trim();
      // Google News titles end with " - Source" — strip it
      const headline = source && rawTitle.endsWith(` - ${source}`)
        ? rawTitle.slice(0, -(source.length + 3))
        : rawTitle.replace(/ - [^-]+$/, "");
      const ago = timeAgo(pub);
      return {
        headline,
        body: [source, ago].filter(Boolean).join(" · "),
        tags: source ? [source] : undefined,
        link,
      };
    }).filter((h) => h.headline);
  } catch {
    return [];
  }
}

// ─── Calendar (reuse our existing feed) ──────────────────────
type LookaheadItem = { time: string; event: string; detail?: string };

async function fetchLookahead(origin: string): Promise<LookaheadItem[]> {
  try {
    const res = await fetch(`${origin}/api/news`, { next: { revalidate: 600 } });
    const data = await res.json();
    const events = (data.events ?? []) as { title: string; currency: string; date: string; impact: string }[];
    const today = new Date();
    return events
      .filter((e) => {
        const d = new Date(e.date);
        return d.toDateString() === today.toDateString() && (e.impact === "HIGH" || e.impact === "MEDIUM");
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 10)
      .map((e) => ({
        time: new Date(e.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        event: `${e.currency} · ${e.title}`,
        detail: e.impact === "HIGH" ? "Alto impacto" : "Medio impacto",
      }));
  } catch {
    return [];
  }
}

// ─── Region symbol sets + news queries ───────────────────────
const REGION_CONFIG: Record<Region, {
  tickers: SymDef[];
  equities: SymDef[];
  rates: SymDef[];
  fx: SymDef[];
  commodities: SymDef[];
  crypto: SymDef[];
  news: { title: string; query: string }[];
}> = {
  EUROPEAN: {
    tickers: [
      { symbol: "^GDAXI", name: "DAX", fmt: "index" },
      { symbol: "^STOXX50E", name: "SX5E", fmt: "index" },
      { symbol: "^FTSE", name: "FTSE", fmt: "index" },
      { symbol: "^N225", name: "NKY", fmt: "index" },
      { symbol: "^HSI", name: "HSI", fmt: "index" },
      { symbol: "EURUSD=X", name: "EUR/USD", fmt: "fx" },
      { symbol: "GBPUSD=X", name: "GBP/USD", fmt: "fx" },
      { symbol: "CL=F", name: "WTI", fmt: "price" },
      { symbol: "GC=F", name: "GOLD", fmt: "price" },
    ],
    equities: [
      { symbol: "^GDAXI", name: "DAX", fmt: "index" },
      { symbol: "^STOXX50E", name: "Euro Stoxx 50", fmt: "index" },
      { symbol: "^FTSE", name: "FTSE 100", fmt: "index" },
      { symbol: "^FCHI", name: "CAC 40", fmt: "index" },
      { symbol: "^GSPC", name: "S&P 500", fmt: "index" },
    ],
    rates: [{ symbol: "^TNX", name: "US 10Y", fmt: "pct" }],
    fx: [
      { symbol: "EURUSD=X", name: "EUR/USD", fmt: "fx" },
      { symbol: "GBPUSD=X", name: "GBP/USD", fmt: "fx" },
      { symbol: "EURGBP=X", name: "EUR/GBP", fmt: "fx" },
      { symbol: "DX-Y.NYB", name: "DXY", fmt: "price" },
    ],
    commodities: [
      { symbol: "CL=F", name: "WTI", fmt: "price" },
      { symbol: "BZ=F", name: "Brent", fmt: "price" },
      { symbol: "GC=F", name: "Gold", fmt: "price" },
    ],
    crypto: [
      { symbol: "BTC-USD", name: "Bitcoin", fmt: "crypto" },
      { symbol: "ETH-USD", name: "Ethereum", fmt: "crypto" },
    ],
    news: [
      { title: "MARKET HEADLINES", query: "europe stock markets" },
      { title: "POLICY & MACRO", query: "ECB euro interest rates" },
    ],
  },
  AMERICAN: {
    tickers: [
      { symbol: "^GSPC", name: "SPX", fmt: "index" },
      { symbol: "^IXIC", name: "NDX", fmt: "index" },
      { symbol: "^DJI", name: "DJIA", fmt: "index" },
      { symbol: "^RUT", name: "RUT", fmt: "index" },
      { symbol: "^TNX", name: "US10Y", fmt: "pct" },
      { symbol: "DX-Y.NYB", name: "DXY", fmt: "price" },
      { symbol: "EURUSD=X", name: "EUR/USD", fmt: "fx" },
      { symbol: "CL=F", name: "WTI", fmt: "price" },
      { symbol: "GC=F", name: "GOLD", fmt: "price" },
    ],
    equities: [
      { symbol: "^GSPC", name: "S&P 500", fmt: "index" },
      { symbol: "^IXIC", name: "Nasdaq Comp", fmt: "index" },
      { symbol: "^DJI", name: "Dow Jones", fmt: "index" },
      { symbol: "^RUT", name: "Russell 2000", fmt: "index" },
      { symbol: "^VIX", name: "VIX", fmt: "price" },
    ],
    rates: [
      { symbol: "^TNX", name: "US 10Y", fmt: "pct" },
      { symbol: "^FVX", name: "US 5Y", fmt: "pct" },
      { symbol: "^TYX", name: "US 30Y", fmt: "pct" },
    ],
    fx: [
      { symbol: "DX-Y.NYB", name: "DXY", fmt: "price" },
      { symbol: "EURUSD=X", name: "EUR/USD", fmt: "fx" },
      { symbol: "USDJPY=X", name: "USD/JPY", fmt: "fx" },
    ],
    commodities: [
      { symbol: "CL=F", name: "WTI", fmt: "price" },
      { symbol: "GC=F", name: "Gold", fmt: "price" },
      { symbol: "HG=F", name: "Copper", fmt: "price" },
    ],
    crypto: [
      { symbol: "BTC-USD", name: "Bitcoin", fmt: "crypto" },
      { symbol: "ETH-USD", name: "Ethereum", fmt: "crypto" },
    ],
    news: [
      { title: "MARKET HEADLINES", query: "US stock market wall street" },
      { title: "FED & MACRO", query: "Federal Reserve interest rates inflation" },
    ],
  },
  ASIAN: {
    tickers: [
      { symbol: "^N225", name: "NKY", fmt: "index" },
      { symbol: "^HSI", name: "HSI", fmt: "index" },
      { symbol: "^KS11", name: "KOSPI", fmt: "index" },
      { symbol: "^AXJO", name: "ASX", fmt: "index" },
      { symbol: "000001.SS", name: "SHCOMP", fmt: "index" },
      { symbol: "USDJPY=X", name: "USD/JPY", fmt: "fx" },
      { symbol: "USDCNY=X", name: "USD/CNY", fmt: "fx" },
      { symbol: "GC=F", name: "GOLD", fmt: "price" },
      { symbol: "BTC-USD", name: "BTC", fmt: "crypto" },
    ],
    equities: [
      { symbol: "^N225", name: "Nikkei 225", fmt: "index" },
      { symbol: "^HSI", name: "Hang Seng", fmt: "index" },
      { symbol: "^KS11", name: "KOSPI", fmt: "index" },
      { symbol: "^AXJO", name: "ASX 200", fmt: "index" },
      { symbol: "000001.SS", name: "Shanghai", fmt: "index" },
    ],
    rates: [{ symbol: "^TNX", name: "US 10Y", fmt: "pct" }],
    fx: [
      { symbol: "USDJPY=X", name: "USD/JPY", fmt: "fx" },
      { symbol: "USDCNY=X", name: "USD/CNY", fmt: "fx" },
      { symbol: "AUDUSD=X", name: "AUD/USD", fmt: "fx" },
    ],
    commodities: [
      { symbol: "GC=F", name: "Gold", fmt: "price" },
      { symbol: "CL=F", name: "WTI", fmt: "price" },
      { symbol: "HG=F", name: "Copper", fmt: "price" },
    ],
    crypto: [
      { symbol: "BTC-USD", name: "Bitcoin", fmt: "crypto" },
      { symbol: "ETH-USD", name: "Ethereum", fmt: "crypto" },
    ],
    news: [
      { title: "MARKET HEADLINES", query: "asia stock markets" },
      { title: "CHINA & JAPAN", query: "China economy PBOC Japan BOJ" },
    ],
  },
};

function computeRegime(equities: Quote[]): string {
  if (equities.length === 0) return "DATOS LIMITADOS";
  const ups = equities.filter((q) => q.dir === "up").length;
  const downs = equities.filter((q) => q.dir === "down").length;
  if (ups >= equities.length * 0.66) return "RISK-ON";
  if (downs >= equities.length * 0.66) return "RISK-OFF";
  return "MIXED / CAUTIOUS";
}

export async function GET(req: NextRequest) {
  const regionParam = (req.nextUrl.searchParams.get("region") ?? "EUROPEAN").toUpperCase();
  if (!["EUROPEAN", "AMERICAN", "ASIAN"].includes(regionParam)) {
    return NextResponse.json({ error: "invalid region" }, { status: 400 });
  }
  const region = regionParam as Region;
  const cfg = REGION_CONFIG[region];
  const origin = req.nextUrl.origin;

  const [tickers, equities, rates, fx, commodities, crypto, lookahead, news0, news1] = await Promise.all([
    fetchQuotes(cfg.tickers),
    fetchQuotes(cfg.equities),
    fetchQuotes(cfg.rates),
    fetchQuotes(cfg.fx),
    fetchQuotes(cfg.commodities),
    fetchQuotes(cfg.crypto),
    fetchLookahead(origin),
    fetchHeadlines(cfg.news[0].query, 5),
    fetchHeadlines(cfg.news[1].query, 5),
  ]);

  const sections = [
    { title: cfg.news[0].title, items: news0 },
    { title: cfg.news[1].title, items: news1 },
  ].filter((s) => s.items.length > 0);

  const content = {
    regime: computeRegime(equities),
    tickers: tickers.map((t) => ({ symbol: t.name, value: t.value, change: t.change, dir: t.dir })),
    pulse: { equities, rates, fx, commodities, crypto },
    sections,
    lookahead,
  };

  return NextResponse.json({
    region,
    meta: REGION_META[region],
    content,
    generatedAt: new Date().toISOString(),
    cached: false,
  });
}
