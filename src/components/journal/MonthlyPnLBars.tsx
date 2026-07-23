"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface MonthlyPnLBarsProps {
  userId: string;
  /** Scopes the chart to one account, matching the dashboard. */
  accountId?: string | null;
}

type MonthBucket = { year: number; month: number; pnl: number; hasTrades: boolean };

export default function MonthlyPnLBars({ userId, accountId }: MonthlyPnLBarsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [buckets, setBuckets] = useState<MonthBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const now = new Date();
    // Last 12 months, oldest first
    const months: MonthBucket[] = Array.from({ length: 12 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), pnl: 0, hasTrades: false };
    });
    const from = new Date(months[0].year, months[0].month, 1).toISOString();

    let query = supabase
      .from("trades")
      .select("open_time, net_pnl")
      .eq("user_id", userId)
      .gte("open_time", from);
    if (accountId) query = query.eq("account_id", accountId);

    query
      .then(({ data }) => {
        if (data) {
          for (const t of data as { open_time: string; net_pnl: number | null }[]) {
            const d = new Date(t.open_time);
            const bucket = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth());
            if (bucket) {
              bucket.pnl += t.net_pnl ?? 0;
              bucket.hasTrades = true;
            }
          }
        }
        setBuckets(months);
        setLoading(false);
      });
  }, [supabase, userId, accountId]);

  const yearTotal = buckets.reduce((s, b) => s + b.pnl, 0);
  const maxAbs = Math.max(...buckets.map(b => Math.abs(b.pnl)), 1);
  const now = new Date();

  return (
    <div className="bg-surface rounded-2xl p-6 border border-border">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-text-primary">Monthly P&L</h3>
        <span className={cn(
          "text-sm font-mono font-semibold",
          yearTotal >= 0 ? "text-profit" : "text-loss"
        )}>
          {yearTotal >= 0 ? "+" : ""}${yearTotal.toFixed(2)}
        </span>
      </div>

      {loading ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-text-disabled">
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-2 items-stretch h-[180px]">
          {buckets.map((b, i) => {
            const isCurrent = b.year === now.getFullYear() && b.month === now.getMonth();
            const barH = b.hasTrades ? Math.max((Math.abs(b.pnl) / maxAbs) * 80, 4) : 0;
            const isProfit = b.pnl >= 0;
            return (
              <div key={i} className="flex flex-col items-center justify-end h-full">
                {/* Value above (profit) */}
                <div className="flex-1 flex flex-col justify-end items-center w-full">
                  {b.hasTrades && isProfit && (
                    <span className="text-[10px] font-mono text-profit mb-1">
                      ${Math.round(b.pnl)}
                    </span>
                  )}
                  {b.hasTrades && isProfit && (
                    <div
                      className="w-full max-w-[28px] rounded-t bg-profit/70"
                      style={{ height: `${barH}px` }}
                    />
                  )}
                </div>

                {/* Zero axis */}
                <div className={cn(
                  "w-full h-px",
                  isCurrent ? "bg-accent" : "bg-border-light"
                )} />

                {/* Value below (loss) */}
                <div className="flex-1 flex flex-col justify-start items-center w-full">
                  {b.hasTrades && !isProfit && (
                    <div
                      className="w-full max-w-[28px] rounded-b bg-loss/70"
                      style={{ height: `${barH}px` }}
                    />
                  )}
                  {b.hasTrades && !isProfit && (
                    <span className="text-[10px] font-mono text-loss mt-1">
                      -${Math.abs(Math.round(b.pnl))}
                    </span>
                  )}
                  {!b.hasTrades && (
                    <div className="w-full max-w-[28px] h-0.5 bg-border mt-0.5" />
                  )}
                </div>

                <span className={cn(
                  "text-[10px] mt-2",
                  isCurrent ? "text-accent font-medium" : "text-text-disabled"
                )}>
                  {MONTH_LABELS[b.month]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
