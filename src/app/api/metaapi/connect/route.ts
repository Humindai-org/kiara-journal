import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionAccount, deployAccount } from "@/lib/metaapi-client";

export async function POST(req: NextRequest) {
  const token = process.env.METAAPI_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "METAAPI_TOKEN not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { account_id: string; mt5_password: string; mt5_server?: string; mt5_login?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account_id, mt5_password, mt5_server, mt5_login } = body;
  if (!account_id || !mt5_password) {
    return NextResponse.json({ error: "account_id and mt5_password are required" }, { status: 400 });
  }

  // Verify ownership and get account details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: accErr } = await (supabase as any)
    .from("accounts")
    .select("id, name, type, account_number, mt5_server, metaapi_account_id")
    .eq("id", account_id)
    .eq("user_id", user.id)
    .single();

  if (accErr || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (account.type !== "MT5") {
    return NextResponse.json({ error: "MetaApi only supports MT5 accounts" }, { status: 400 });
  }
  if (account.metaapi_account_id) {
    return NextResponse.json({ error: "Account already connected to MetaApi" }, { status: 409 });
  }

  const serverName = mt5_server || account.mt5_server;
  if (!serverName) {
    return NextResponse.json({ error: "mt5_server is required" }, { status: 400 });
  }

  const loginNumber = mt5_login || account.account_number;
  if (!loginNumber) {
    return NextResponse.json({ error: "MT5 login number is required" }, { status: 400 });
  }

  try {
    // Register account with MetaApi (password sent once, never stored by us)
    const { id: metaapiId } = await provisionAccount(token, {
      login:    loginNumber,
      password: mt5_password,
      name:     account.name,
      server:   serverName,
      platform: "mt5",
    });

    // Deploy (starts the connection to the MT5 broker)
    await deployAccount(token, metaapiId);

    // Persist MetaApi ID + correct account_number and mt5_server if they were missing/wrong
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("accounts")
      .update({
        metaapi_account_id: metaapiId,
        ...(mt5_server ? { mt5_server } : {}),
        ...(mt5_login  ? { account_number: mt5_login } : {}),
      })
      .eq("id", account_id);

    return NextResponse.json({ ok: true, metaapi_account_id: metaapiId, status: "deploying" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[metaapi/connect]", message);

    // Surface MetaApi-specific errors (e.g. unknown server, auth failure, plan limit)
    if (message.includes("400")) {
      return NextResponse.json({ error: "Invalid server name or credentials" }, { status: 400 });
    }
    if (message.includes("402") || message.includes("limit")) {
      return NextResponse.json({ error: "MetaApi account limit reached on current plan" }, { status: 402 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
