import TopBar from "@/components/layout/TopBar";

interface Props {
  params: Promise<{ tradeId: string }>;
}

export default async function TradeJournalPage({ params }: Props) {
  const { tradeId } = await params;

  return (
    <>
      <TopBar title={`Trade #${tradeId.slice(0, 8)}`} />
      <main className="flex-1 overflow-y-auto p-6 flex gap-6">
        <div className="flex-1 card p-6">
          <p className="text-xs text-text-secondary mb-4">Trade Details</p>
          <div className="text-text-disabled text-sm">Loading…</div>
        </div>
        <div className="w-80 card p-6">
          <p className="text-xs text-text-secondary mb-4">Charts & Reflection</p>
          <div className="text-text-disabled text-sm">Loading…</div>
        </div>
      </main>
    </>
  );
}
