import Sidebar from "@/components/layout/Sidebar";
import { Toaster } from "sonner";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          },
        }}
      />
    </div>
  );
}
