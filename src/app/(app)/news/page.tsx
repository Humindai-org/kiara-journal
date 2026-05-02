import TopBar from "@/components/layout/TopBar";

export default function NewsPage() {
  return (
    <>
      <TopBar title="News & Calendar" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="card p-6 flex items-center justify-center text-text-disabled text-sm h-96">
          Bloomberg-style news layout — Coming soon
        </div>
      </main>
    </>
  );
}
