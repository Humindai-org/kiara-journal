import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { undeployAccount, removeAccount } from "@/lib/metaapi-client";

export async function POST(req: NextRequest) {
  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { account_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_id } = body;
  if (!account_id) return NextResponse.json({ error: "account_id required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (supabase as any)
    .from("accounts")
    .select("id, metaapi_account_id")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!account.metaapi_account_id) {
    return NextResponse.json({ error: "MetaApi not connected" }, { status: 400 });
  }

  try {
    await undeployAccount(token, account.metaapi_account_id);
    await removeAccount(token, account.metaapi_account_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("accounts")
      .update({ metaapi_account_id: null })
      .eq("id", account_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[metaapi/disconnect]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
