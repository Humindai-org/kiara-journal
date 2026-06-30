"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  BookOpen,
  Newspaper,
  Bot,
  ClipboardList,
  NotebookPen,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trading", label: "Trading", icon: TrendingUp },
  { href: "/plan-mode", label: "Plan Mode", icon: ClipboardList },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/notebook", label: "Notebook", icon: NotebookPen },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/ai-bot",   label: "AI Bot",   icon: Bot      },
  { href: "/settings", label: "Cuentas",  icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-border transition-[width] duration-200 shrink-0",
        collapsed ? "w-14" : "w-52"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center h-14 px-4 border-b border-border shrink-0",
          collapsed ? "justify-center" : "gap-3"
        )}
      >
        <div className="size-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <TrendingUp className="size-4 text-bg" />
        </div>
        {!collapsed && (
          <span className="font-medium text-text-primary text-sm leading-tight">
            Kiara<br />
            <span className="text-text-secondary text-xs font-normal">Journal</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors",
                    active
                      ? "bg-[--color-accent-glow] text-accent border-l-2 border-accent pl-[6px]"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-2",
                    collapsed && "justify-center px-0 border-l-0 pl-0"
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border shrink-0">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-text-disabled hover:text-text-secondary hover:bg-surface-2 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
