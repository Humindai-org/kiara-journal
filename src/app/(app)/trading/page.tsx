"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

export default function TradingPage() {
  const [symbol, setSymbol] = useState("FX:EURUSD");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [todayPnL, setTodayPnL] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawTrades } = await (supabase as any)
      .from("trades")
      .select("net_pnl")
      .eq("account_id", activeAccountId)
      .gte("close_time", todayStart.toISOString());

    const todayTrades = rawTrades as Array<{ net_pnl: number | null }> | null;

    if (todayTrades) {
      setTodayCount(todayTrades.length);
      setTodayPnL(todayTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0));
    }
  }, [activeAccountId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function updatePlan(
    field: "max_daily_loss" | "max_daily_profit" | "max_trades_per_day",
    value: number,
  ) {
    if (!plan) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
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

            <div className="card p-4">
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-3">
                New Order
              </p>
              <OrderForm
                onSymbolChange={handleSymbolChange}
                tradesUsed={todayCount}
                maxTrades={maxTrades}
                newsBlock={null}
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
