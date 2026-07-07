import { NextRequest, NextResponse } from "next/server";

// Throttle: one alert per account per 5 minutes to avoid spam.
// Simple in-process map — resets on server restart but good enough for Vercel.
const lastAlertAt = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const userId = process.env.TELEGRAM_USER_ID;

  if (!botToken || !userId) {
    // Not configured — silently succeed so callers don't fail
    return NextResponse.json({ ok: true, skipped: "telegram not configured" });
  }

  let body: { message: string; throttle_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, throttle_key } = body;
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Throttle check
  if (throttle_key) {
    const last = lastAlertAt.get(throttle_key) ?? 0;
    if (Date.now() - last < THROTTLE_MS) {
      return NextResponse.json({ ok: true, throttled: true });
    }
    lastAlertAt.set(throttle_key, Date.now());
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: userId,
      text: message,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[notify/telegram] error:", text);
    return NextResponse.json({ error: "Telegram API error", detail: text }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
