import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    worked: {
      type: "array",
      items: { type: "string" },
      description: "2-3 bullet points on what worked this week",
    },
    didntWork: {
      type: "array",
      items: { type: "string" },
      description: "2-3 bullet points on what didn't work this week",
    },
    focus: {
      type: "string",
      description: "One specific, actionable behavior to focus on next week",
    },
  },
  required: ["worked", "didntWork", "focus"],
  additionalProperties: false,
};

type TradePayload = {
  instrument: string;
  direction: string;
  netPnL: number;
  returnR: number | null;
  riskPercent: number | null;
  session: string | null;
  setup: string | null;
  followedPlan: boolean | null;
};

type ViolationPayload = { type: string; date: string };

export async function POST(req: NextRequest) {
  try {
    const { weekId, trades, stats, violations } = await req.json();

    if (!Array.isArray(trades) || trades.length === 0) {
      return NextResponse.json({ error: "No trades to analyze" }, { status: 400 });
    }

    const tradeList = (trades as TradePayload[])
      .map(
        (t, i) =>
          `${i + 1}. ${t.direction} ${t.instrument} | P&L: $${t.netPnL.toFixed(2)} | R: ${t.returnR?.toFixed(2) ?? "—"} | Risk: ${t.riskPercent != null ? `${t.riskPercent.toFixed(2)}%` : "—"} | Session: ${t.session ?? "—"} | Setup: ${t.setup ?? "—"} | Plan: ${t.followedPlan === true ? "✓" : t.followedPlan === false ? "✗" : "—"}`,
      )
      .join("\n");

    const violationList =
      (violations as ViolationPayload[])
        ?.map((v) => `- ${v.type} on ${v.date}`)
        .join("\n") || "None";

    const prompt = `You are a trading performance coach reviewing a funded trader's weekly journal. The trader uses Market Profile / Volume Profile methodology (MATVARD) on a funded account with strict risk rules.

Week: ${weekId}

PERFORMANCE STATS:
- Net P&L: $${stats?.netPnL?.toFixed(2) ?? "N/A"}
- Win Rate: ${stats?.winRate?.toFixed(0) ?? "N/A"}%
- Profit Factor: ${stats?.profitFactor?.toFixed(2) ?? "N/A"}
- Expectancy: $${stats?.expectancy?.toFixed(2) ?? "N/A"} per trade
- Avg R:R: ${stats?.avgRR?.toFixed(2) ?? "N/A"}R
- Best Trade: $${stats?.bestTrade?.toFixed(2) ?? "N/A"}
- Worst Trade: $${stats?.worstTrade?.toFixed(2) ?? "N/A"}
- Max Drawdown (intraweek): $${stats?.maxDrawdown?.toFixed(2) ?? "N/A"}

TRADES (${trades.length} total):
${tradeList}

DISCIPLINE VIOLATIONS:
${violationList}

Analyze the week. Be direct and specific — reference actual trades, setups, and numbers from the data. Each bullet should be one concise sentence. The focus item must be a single concrete behavior for next week, not a vague goal.`;

    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      output_config: {
        format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
      },
      messages: [{ role: "user", content: prompt }],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json({ error: "Analysis declined" }, { status: 502 });
    }

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    const analysis = JSON.parse(text) as {
      worked: string[];
      didntWork: string[];
      focus: string;
    };

    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[report/analyze]", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
