import { Bell } from "lucide-react";
import AccountSelector from "./AccountSelector";

interface TopBarProps {
  title?: string;
}

export default function TopBar({ title }: TopBarProps) {
  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface shrink-0">
      {title && (
        <h1 className="text-sm font-medium text-text-primary">{title}</h1>
      )}

      <div className="flex items-center gap-3 ml-auto">
        <button
          className="relative size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="size-4" />
        </button>

        <AccountSelector />
      </div>
    </header>
  );
}
