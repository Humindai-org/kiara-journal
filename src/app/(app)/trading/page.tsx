import TopBar from "@/components/layout/TopBar";

export default function TradingPage() {
  return (
    <>
      <TopBar title="Trading" />
      <main className="flex-1 overflow-hidden flex">
        {/* TradingView Chart placeholder */}
        <div className="flex-1 bg-bg border-r border-border flex items-center justify-center text-text-disabled text-sm">
          TradingView Widget — Coming soon
        </div>

        {/* Order panel */}
        <div className="w-80 flex flex-col overflow-y-auto bg-surface p-4 gap-4">
          <div className="card p-4">
            <p className="text-xs text-text-secondary mb-3">New Order</p>
            <div className="h-64 flex items-center justify-center text-text-disabled text-sm">
              Order form — Coming soon
            </div>
          </div>
          <div className="card p-4">
            <p className="text-xs text-text-secondary mb-2">Trade Counter</p>
            <p className="text-2xl font-mono font-medium text-text-primary">0 / 3</p>
            <p className="text-xs text-text-disabled mt-1">trades today</p>
          </div>
        </div>
      </main>

      {/* Positions table */}
      <div className="h-48 border-t border-border bg-surface p-4 shrink-0">
        <p className="text-xs text-text-secondary mb-2">Positions</p>
        <div className="flex items-center justify-center h-28 text-text-disabled text-sm">
          No open positions
        </div>
      </div>
    </>
  );
}
