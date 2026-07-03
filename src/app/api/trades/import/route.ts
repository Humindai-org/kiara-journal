import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createWebhookClient } from "@/lib/supabase/server";
import type { ParsedTrade } from "@/lib/parse-mt5-csv";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { account_id: string; trades: ParsedTrade[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_id, trades } = body;
  if (!account_id || !Array.isArray(trades) || trades.length === 0) {
    return NextResponse.json({ error: "account_id and trades[] are required" }, { status: 400 });
  }

  // Verify ownership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: accErr } = await (supabase as any)
    .from("accounts")
    .select("id")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single();

  if (accErr || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const rows = trades.map(t => ({
    ...t,
    account_id,
    user_id: user.id,
  }));

  const serviceSupabase = createWebhookClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceSupabase as any)
    .from("trades")
    .upsert(rows, { onConflict: "mt5_ticket" });

  if (error) {
    console.error("[trades/import]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Recalculate account balance from imported trades
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceSupabase as any).rpc("recalculate_account_balance", { p_account_id: account_id });

  return NextResponse.json({ ok: true, total: rows.length });
}
