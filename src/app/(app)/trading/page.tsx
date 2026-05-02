"use client";

import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import TradingViewWidget from "@/components/trading/TradingViewWidget";
import OrderForm from "@/components/trading/OrderForm";
import TradeCounter from "@/components/trading/TradeCounter";
import PositionsTable from "@/components/trading/PositionsTable";

export default function TradingPage() {
  const [symbol, setSymbol] = useState("FX:EURUSD");

  function handleSymbolChange(instrument: string) {
    // Map instrument to TradingView symbol format
    const tvSymbol = instrument === "XAUUSD"
      ? "OANDA:XAUUSD"
      : `FX:${instrument}`;
    setSymbol(tvSymbol);
  }

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
          <div className="p-4 flex flex-col gap-4">
            {/* Trade counter */}
            <TradeCounter used={0} max={3} />

            {/* Order form */}
            <div className="card p-4">
              <p className="text-xs text-text-secondary mb-4 font-medium uppercase tracking-wide">
                Nueva Orden
              </p>
              <OrderForm
                onSymbolChange={handleSymbolChange}
                tradesUsed={0}
                maxTrades={3}
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
