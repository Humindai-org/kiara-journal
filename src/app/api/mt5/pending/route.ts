import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trades importados desde MT5 que aún no tienen entrada de journal
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data, error } = await db
    .from("trades")
    .select("id, instrument, direction, net_pnl, open_time, close_time, mt5_ticket, journal_entries(id)")
    .eq("user_id", user.id)
    .eq("source", "MT5")
    .is("journal_entries.id", null)
    .order("close_time", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trades: data ?? [], count: data?.length ?? 0 });
}
