"use client";

import { useEffect, useState, useMemo } from "react";
import { Copy, Check, Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type SyncStatus = "connected" | "never" | "stale";

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)  return "ahora";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export default function MT5ConnectionCard() {
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [token, setToken]           = useState<string | null>(null);
  const [lastSync, setLastSync]     = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedURL, setCopiedURL]   = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const [loading, setLoading]       = useState(true);

  const webhookURL = typeof window !== "undefined"
    ? `${window.location.origin}/api/mt5/webhook`
    : "/api/mt5/webhook";

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { setLoading(false); return; }
      const { data: acc } = await db
        .from("accounts")
        .select("webhook_token, last_synced_at")
        .eq("user_id", data.user.id)
        .eq("is_active", true)
        .single();
      if (acc) {
        setToken(acc.webhook_token);
        setLastSync(acc.last_synced_at);
      }
      setLoading(false);
    });
  }, [supabase, db]);

  function copy(text: string, which: "token" | "url") {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "token") { setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000); }
      else                   { setCopiedURL(true);   setTimeout(() => setCopiedURL(false),   2000); }
    });
  }

  const status: SyncStatus = !lastSync
    ? "never"
    : Date.now() - new Date(lastSync).getTime() < 3600 * 1000 * 24
      ? "connected"
      : "stale";

  const statusColor = status === "connected" ? "text-profit" : status === "stale" ? "text-warning" : "text-text-disabled";
  const statusLabel = status === "connected" ? "Conectado" : status === "stale" ? "Sin actividad reciente" : "Sin conectar";

  if (loading) return null;

  return (
    <div className="card p-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          {status === "connected"
            ? <Wifi className="size-3.5 text-profit" />
            : <WifiOff className="size-3.5 text-text-disabled" />}
          <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
            Conexión MT5
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-medium", statusColor)}>{statusLabel}</span>
          {expanded ? <ChevronUp className="size-3.5 text-text-disabled" /> : <ChevronDown className="size-3.5 text-text-disabled" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {lastSync && (
            <div className="flex items-center gap-1.5 text-[10px] text-text-disabled">
              <RefreshCw className="size-3" />
              <span>Último trade: {timeSince(lastSync)}</span>
            </div>
          )}

          {/* Webhook URL */}
          <div>
            <p className="text-[10px] text-text-disabled mb-1">Webhook URL</p>
            <div className="flex items-center gap-1.5 bg-surface-2 rounded-lg px-2.5 py-1.5">
              <code className="text-[9px] text-text-secondary flex-1 truncate">{webhookURL}</code>
              <button
                onClick={() => copy(webhookURL, "url")}
                className="shrink-0 text-text-disabled hover:text-text-primary transition-colors"
                title="Copiar URL"
              >
                {copiedURL ? <Check className="size-3 text-profit" /> : <Copy className="size-3" />}
              </button>
            </div>
          </div>

          {/* Token */}
          {token && (
            <div>
              <p className="text-[10px] text-text-disabled mb-1">Tu token</p>
              <div className="flex items-center gap-1.5 bg-surface-2 rounded-lg px-2.5 py-1.5">
                <code className="text-[9px] text-text-secondary flex-1 truncate font-mono">
                  {token}
                </code>
                <button
                  onClick={() => copy(token, "token")}
                  className="shrink-0 text-text-disabled hover:text-text-primary transition-colors"
                  title="Copiar token"
                >
                  {copiedToken ? <Check className="size-3 text-profit" /> : <Copy className="size-3" />}
                </button>
              </div>
            </div>
          )}

          <div className="text-[9px] text-text-disabled leading-relaxed space-y-1 pt-1 border-t border-border">
            <p>1. Copiar <code className="bg-surface-2 px-1 rounded">KiaraJournalBridge.mq5</code> a MT5/Experts/</p>
            <p>2. Compilar en MetaEditor (F7) y adjuntar a cualquier gráfico</p>
            <p>3. En Opciones → Expert Advisors → WebRequest: agregar la URL</p>
            <p>4. Pegar la URL y el token en los parámetros del EA</p>
          </div>
        </div>
      )}
    </div>
  );
}
