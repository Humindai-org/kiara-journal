import TopBar from "@/components/layout/TopBar";

export default function NotebookPage() {
  return (
    <>
      <TopBar title="Notebook" />
      <main className="flex-1 overflow-hidden flex">
        <div className="w-56 border-r border-border bg-surface p-4">
          <p className="text-xs text-text-secondary mb-3">Folders</p>
          {["Playbook", "Mindset", "Templates", "Productivity"].map((f) => (
            <div
              key={f}
              className="px-2 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 cursor-pointer transition-colors"
            >
              {f}
            </div>
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center text-text-disabled text-sm">
          Select a note to edit
        </div>
      </main>
    </>
  );
}
