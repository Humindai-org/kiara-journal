"use client";

import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import TradingViewWidget from "@/components/trading/TradingViewWidget";
import OrderForm from "@/components/trading/OrderForm";
import TradeCounter from "@/components/trading/TradeCounter";
import DailyPnLBar from "@/components/trading/DailyPnLBar";
import SessionIndicator from "@/components/trading/SessionIndicator";
import PositionsTable from "@/components/trading/PositionsTable";

export default function TradingPage() {
  const [symbol, setSymbol] = useState("FX:EURUSD");

  function handleSymbolChange(instrument: string) {
    const tvSymbol = instrument === "XAUUSD"
      ? "OANDA:XAUUSD"
      : `FX:${instrument}`;
    setSymbol(tvSymbol);
  }

  // These will come from Supabase in a future step
  const tradesUsed = 0;
  const maxTrades = 3;
  const dailyPnL = 0;

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

            {/* Session indicator */}
            <SessionIndicator />

            {/* Trade counter + Daily P&L */}
            <div className="grid grid-cols-1 gap-3">
              <TradeCounter used={tradesUsed} max={maxTrades} />
              <DailyPnLBar
                pnl={dailyPnL}
                maxLoss={-300}
                maxProfit={500}
              />
            </div>

            {/* Order form */}
            <div className="card p-4">
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-3">
                Nueva Orden
              </p>
              <OrderForm
                onSymbolChange={handleSymbolChange}
                tradesUsed={tradesUsed}
                maxTrades={maxTrades}
                newsBlock={null}
              />
            </div>

          </div>
        </div>
      </div>

      {/* Positions table */}
      <div className="h-52 border-t border-border bg-surface shrink-0">
        <PositionsTable />
      </div>
    </div>
  );
}
