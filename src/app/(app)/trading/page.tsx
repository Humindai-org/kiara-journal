"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { cn } from "@/lib/cn";
import TopBar from "@/components/layout/TopBar";
import TradingViewWidget from "@/components/trading/TradingViewWidget";
import OrderForm from "@/components/trading/OrderForm";
import TradeCounter from "@/components/trading/TradeCounter";
import DailyPnLBar from "@/components/trading/DailyPnLBar";
import SessionIndicator from "@/components/trading/SessionIndicator";
import PositionsTable from "@/components/trading/PositionsTable";
import MT5ConnectionCard from "@/components/trading/MT5ConnectionCard";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";

type Plan = {
  id: string;
  max_trades_per_day: number;
  max_daily_loss: number;
  max_daily_profit: number | null;
};

type WarningLevel = "safe" | "caution" | "danger" | "breach";

function ExposureBanner({ pnl, openCount, personalStop, level }: {
  pnl: number; openCount: number; personalStop: number; level: WarningLevel;
}) {
  if (level === "safe") return null;
  const absLoss = Math.abs(Math.min(0, pnl));
  const pct = Math.round(absLoss / personalStop * 100);

  if (level === "breach") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-loss/15 border-b border-loss/30 animate-pulse">
        <TrendingDown className="size-4 text-loss shrink-0" />
        <span className="text-xs font-medium text-loss">
          DAILY STOP HIT — ${absLoss.toFixed(2)} in losses (limit: ${personalStop}). Close all positions.
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2 px-4 py-2 border-b text-xs",
      level === "danger"
        ? "bg-loss/10 border-loss/20 text-warning"
        : "bg-warning/5 border-warning/15 text-warning/70"
    )}>
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>
        {openCount > 0 ? `${openCount} open position${openCount > 1 ? "s" : ""} · ` : ""}
        {pct}% of daily stop used (${absLoss.toFixed(2)} / ${personalStop})
      </span>
    </div>
  );
}

export default function TradingPage() {
  const [symbol, setSymbol] = useState("FX:EURUSD");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [todayPnL, setTodayPnL] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [warningLevel, setWarningLevel] = useState<WarningLevel>("safe");

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    if (!activeAccountId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: planData } = await supabase
      .from("plans")
      .select("id, max_trades_per_day, max_daily_loss, max_daily_profit")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (planData) setPlan(planData as Plan);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: accData } = await (supabase as any)
      .from("accounts")
      .select("personal_daily_stop_usd")
      .eq("id", activeAccountId)
      .single();
    const personalStop: number = accData?.personal_daily_stop_usd ?? (planData as Plan | null)?.max_daily_loss ?? 300;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Count all trades opened today (pending + open + closed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawTrades } = await (supabase as any)
      .from("trades")
      .select("net_pnl, close_time, status")
      .eq("account_id", activeAccountId)
      .gte("open_time", todayStart.toISOString());

    const todayTrades = rawTrades as Array<{ net_pnl: number | null; close_time: string | null; status: string }> | null;

    if (todayTrades) {
      setTodayCount(todayTrades.length);
      const realizedPnL = todayTrades
        .filter(t => t.close_time !== null)
        .reduce((s, t) => s + (t.net_pnl ?? 0), 0);
      setTodayPnL(realizedPnL);

      const open = todayTrades.filter(t => t.status === "open" || (!t.close_time && t.status !== "pending"));
      setOpenCount(open.length);

      const absLoss = Math.abs(Math.min(0, realizedPnL));
      setWarningLevel(
        absLoss >= personalStop ? "breach"
        : absLoss >= personalStop * 0.8 ? "danger"
        : absLoss >= personalStop * 0.6 ? "caution"
        : "safe"
      );
    }
  }, [activeAccountId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription — refresh daily state whenever any trade changes
  useEffect(() => {
    if (!activeAccountId) return;
    const channel = supabase
      .channel(`trading-page-${activeAccountId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades", filter: `account_id=eq.${activeAccountId}` },
        () => fetchData()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeAccountId, supabase, fetchData]);

  async function updatePlan(
    field: "max_daily_loss" | "max_daily_profit" | "max_trades_per_day",
    value: number,
  ) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    if (!plan) {
      // No active plan yet — create a default one with this first value
      const defaults = { max_trades_per_day: 3, max_daily_loss: 300, max_daily_profit: 500 };
      const { data } = await sb
        .from("plans")
        .insert({
          user_id: user.id,
          name: "MATVARD — Fase 2",
          plan_type: "MATVARD",
          is_active: true,
          ...defaults,
          [field]: value,
        })
        .select("id, max_trades_per_day, max_daily_loss, max_daily_profit")
        .maybeSingle();
      if (data) setPlan(data as Plan);
      return;
    }

    const { data } = await sb
      .from("plans")
      .update({ [field]: value })
      .eq("id", plan.id)
      .select("id, max_trades_per_day, max_daily_loss, max_daily_profit")
      .maybeSingle();
    if (data) setPlan(data as Plan);
  }

  function handleSymbolChange(instrument: string) {
    const tvSymbol = instrument === "XAUUSD" ? "OANDA:XAUUSD" : `FX:${instrument}`;
    setSymbol(tvSymbol);
  }

  const maxTrades = plan?.max_trades_per_day ?? 3;
  const maxLoss = -(plan?.max_daily_loss ?? 300);
  const maxProfit = plan?.max_daily_profit ?? undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar title="Trading" />

      {/* Exposure banner — shown when daily risk is elevated */}
      <ExposureBanner
        pnl={todayPnL}
        openCount={openCount}
        personalStop={plan?.max_daily_loss ?? 300}
        level={warningLevel}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Chart */}
        <div className="flex-1 bg-bg overflow-hidden">
          <TradingViewWidget symbol={symbol} />
        </div>

        {/* Right panel */}
        <div className="w-80 flex flex-col overflow-y-auto bg-surface border-l border-border shrink-0">
          <div className="p-4 flex flex-col gap-3">

            <SessionIndicator />

            <div className="grid grid-cols-1 gap-3">
              <TradeCounter
                used={todayCount}
                max={maxTrades}
                onEditMax={(val) => updatePlan("max_trades_per_day", val)}
              />
              <DailyPnLBar
                pnl={todayPnL}
                maxLoss={maxLoss}
                maxProfit={maxProfit}
                onEditMaxLoss={(val) => updatePlan("max_daily_loss", val)}
                onEditMaxProfit={(val) => updatePlan("max_daily_profit", val)}
              />
            </div>

            {/* Open positions mini-indicator */}
            {openCount > 0 && (
              <div className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg border text-xs",
                warningLevel === "breach" || warningLevel === "danger"
                  ? "border-loss/30 bg-loss/10 text-loss"
                  : "border-warning/30 bg-warning/10 text-warning"
              )}>
                <span>{openCount} open position{openCount > 1 ? "s" : ""}</span>
                <span className="font-mono font-medium">
                  {todayPnL >= 0 ? `+$${todayPnL.toFixed(2)}` : `-$${Math.abs(todayPnL).toFixed(2)}`}
                </span>
              </div>
            )}

            <div className="card p-4">
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-3">
                New Order
              </p>
              <OrderForm
                accountId={activeAccountId ?? undefined}
                onSymbolChange={handleSymbolChange}
                tradesUsed={todayCount}
                maxTrades={maxTrades}
                newsBlock={null}
                onTradeLogged={fetchData}
              />
            </div>

            <MT5ConnectionCard />

          </div>
        </div>
      </div>

      <div className="h-72 border-t border-border bg-surface shrink-0">
        <PositionsTable />
      </div>
    </div>
  );
}
