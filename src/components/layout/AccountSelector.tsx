"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, LogOut, Settings, Plus } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";
import { cn } from "@/lib/cn";
import { useRouter } from "next/navigation";

export default function AccountSelector() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { accounts, activeAccountId, setAccounts, setActiveAccount, activeAccount } =
    useAccountStore();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("accounts")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        if (data) setAccounts(data);
      });
  }, [setAccounts]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const account = activeAccount();
  const isProfit = account ? account.current_balance >= account.initial_balance : false;

  return (
    <div className="flex items-center gap-2">
      {/* Account dropdown */}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-2 hover:bg-border transition-colors text-sm"
        >
          {account ? (
            <span className="flex flex-col items-start leading-tight">
              <span className="text-text-primary text-xs font-medium">
                {account.name}
              </span>
              <span
                className={cn(
                  "font-mono text-xs",
                  isProfit ? "text-profit" : "text-loss"
                )}
              >
                ${account.current_balance.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </span>
          ) : (
            <span className="text-text-disabled text-xs">No account</span>
          )}
          <ChevronDown className="size-3 text-text-secondary shrink-0" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-surface-2 border border-border rounded-lg shadow-lg z-50 py-1">
            {accounts.map((acc) => {
              const pnl = acc.current_balance - acc.initial_balance;
              return (
                <button
                  key={acc.id}
                  onClick={() => { setActiveAccount(acc.id); setOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-surface transition-colors text-left"
                >
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs font-medium text-text-primary">{acc.name}</span>
                    <span className="text-xs font-mono flex items-center gap-1.5">
                      <span className="text-text-secondary">
                        ${acc.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                      <span className={pnl >= 0 ? "text-profit" : "text-loss"}>
                        ({pnl >= 0 ? "+" : ""}{pnl.toFixed(0)})
                      </span>
                    </span>
                  </span>
                  {acc.id === activeAccountId && <Check className="size-3 text-accent shrink-0" />}
                </button>
              );
            })}
            <div className="border-t border-border mt-1 pt-1">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface transition-colors text-xs text-text-secondary hover:text-text-primary"
              >
                <Plus className="size-3.5" />
                Add account
              </Link>
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface transition-colors text-xs text-text-secondary hover:text-text-primary"
              >
                <Settings className="size-3.5" />
                Manage accounts
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="size-8 flex items-center justify-center rounded-lg text-text-disabled hover:text-loss hover:bg-surface-2 transition-colors"
        aria-label="Sign out"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
