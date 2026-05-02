import TopBar from "@/components/layout/TopBar";

export default function DashboardPage() {
  return (
    <>
      <TopBar title="Dashboard" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: "Account Balance", value: "$96,867.01", sub: "TTP CFD Prime", color: "text-text-primary" },
            { label: "Total P&L", value: "-$3,132.99", sub: "All time", color: "text-loss" },
            { label: "Win Rate", value: "—", sub: "No trades yet", color: "text-text-secondary" },
            { label: "Profit Factor", value: "—", sub: "No trades yet", color: "text-text-secondary" },
            { label: "Avg Risk/Trade", value: "$300", sub: "0.30%", color: "text-warning" },
          ].map((kpi) => (
            <div key={kpi.label} className="card p-4">
              <p className="text-xs text-text-secondary mb-1">{kpi.label}</p>
              <p className={`text-xl font-mono font-medium ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-text-disabled mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 card p-4">
            <p className="text-sm font-medium text-text-primary mb-4">Equity Curve</p>
            <div className="h-48 flex items-center justify-center text-text-disabled text-sm">
              No trade data yet
            </div>
          </div>
          <div className="card p-4">
            <p className="text-sm font-medium text-text-primary mb-4">Discipline Score</p>
            <div className="h-48 flex flex-col items-center justify-center gap-4">
              {[
                { label: "Performance", value: "—" },
                { label: "Discipline", value: "—" },
                { label: "Consistency", value: "—" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between w-full">
                  <span className="text-xs text-text-secondary">{s.label}</span>
                  <span className="text-sm font-mono text-text-disabled">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
