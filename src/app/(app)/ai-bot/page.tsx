import TopBar from "@/components/layout/TopBar";

export default function AiBotPage() {
  return (
    <>
      <TopBar title="AI Bot" />
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center text-text-disabled text-sm">
          Chat interface — Coming soon
        </div>
        <div className="border-t border-border p-4 bg-surface shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ask about setups, markets, risk… or /check EURUSD LONG"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
            />
            <button className="px-4 py-2.5 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors">
              Send
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
