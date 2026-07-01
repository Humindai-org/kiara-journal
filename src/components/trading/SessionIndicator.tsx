"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface Session {
  name: string;
  startUTC: number; // hour in UTC
  endUTC: number;
  color: string;
  tradeable: boolean;
}

const SESSIONS: Session[] = [
  { name: "Tokyo",   startUTC: 0,  endUTC: 9,  color: "text-info",    tradeable: false },
  { name: "London",  startUTC: 8,  endUTC: 17, color: "text-accent",  tradeable: true  },
  { name: "NY",      startUTC: 13, endUTC: 22, color: "text-warning", tradeable: true  },
  { name: "Overlap", startUTC: 13, endUTC: 17, color: "text-profit",  tradeable: true  },
];

function getActiveSessions(utcHour: number, utcDay: number): Session[] {
  // Day: 0=Sun, 1=Mon ... 4=Thu, 5=Fri, 6=Sat
  if (utcDay === 0 || utcDay === 6) return []; // weekend
  return SESSIONS.filter((s) => {
    if (s.endUTC > s.startUTC) {
      return utcHour >= s.startUTC && utcHour < s.endUTC;
    }
    return utcHour >= s.startUTC || utcHour < s.endUTC;
  });
}

function formatTimeUntil(targetUTC: number, nowUTC: number): string {
  let diff = targetUTC - nowUTC;
  if (diff < 0) diff += 24;
  const h = Math.floor(diff);
  const m = Math.round((diff - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SessionIndicator() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const utcDay = now.getUTCDay();
  const active = getActiveSessions(utcHour, utcDay);
  const isWeekend = utcDay === 0 || utcDay === 6;
  const isFriday = utcDay === 5;
  const isTradeableSession = active.some((s) => s.tradeable);

  // Next London open (08:00 UTC)
  const nextLondon = utcHour < 8 ? formatTimeUntil(8, utcHour) : null;

  return (
    <div className={cn(
      "card p-3 space-y-2",
      isTradeableSession ? "border-accent/30" : "border-border"
    )}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">Session</p>
        <div className={cn(
          "size-2 rounded-full",
          isTradeableSession ? "bg-profit shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-surface-2"
        )} />
      </div>

      {isWeekend ? (
        <p className="text-xs text-text-disabled">Market closed (weekend)</p>
      ) : active.length === 0 ? (
        <div>
          <p className="text-xs text-text-disabled">Outside session</p>
          {nextLondon && (
            <p className="text-[10px] text-text-disabled mt-0.5">London opens in {nextLondon}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {active.map((s) => (
            <span
              key={s.name}
              className={cn(
                "text-xs px-2 py-0.5 rounded-full bg-surface-2 font-medium",
                s.color
              )}
            >
              {s.name}
            </span>
          ))}
        </div>
      )}

      {isFriday && isTradeableSession && (
        <p className="text-[10px] text-warning">Friday — A+ setups only</p>
      )}

      {!isTradeableSession && !isWeekend && active.length > 0 && (
        <p className="text-[10px] text-text-disabled">Tokyo — do not trade</p>
      )}
    </div>
  );
}
