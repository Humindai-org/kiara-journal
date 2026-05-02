import TopBar from "@/components/layout/TopBar";

export default function PlanModePage() {
  return (
    <>
      <TopBar title="Plan Mode" />
      <main className="flex-1 overflow-y-auto p-6 flex gap-6">
        <div className="flex-1 card p-6">
          <p className="text-sm text-text-secondary mb-4">No active plan yet.</p>
          <button className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors">
            Create Plan
          </button>
        </div>
        <div className="w-72 flex flex-col gap-4">
          <div className="card p-4">
            <p className="text-xs text-text-secondary mb-2">Plan Stats</p>
            <div className="text-text-disabled text-sm">No data</div>
          </div>
          <div className="card p-4">
            <p className="text-xs text-text-secondary mb-2">Risk Controls</p>
            <div className="space-y-2">
              {[
                { label: "Max Trades/Day", value: "3" },
                { label: "Max Daily Loss", value: "$300" },
                { label: "Risk/Trade", value: "0.30%" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-xs text-text-secondary">{label}</span>
                  <span className="text-xs font-mono text-text-primary">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
