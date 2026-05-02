import TopBar from "@/components/layout/TopBar";

interface Props {
  params: Promise<{ weekId: string }>;
}

export default async function WeekReportPage({ params }: Props) {
  const { weekId } = await params;

  return (
    <>
      <TopBar title={`Weekly Report — ${weekId}`} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="card p-6 flex items-center justify-center text-text-disabled text-sm h-96">
          Weekly report — Coming soon
        </div>
      </main>
    </>
  );
}
