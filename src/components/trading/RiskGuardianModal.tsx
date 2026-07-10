"use client";

import { XCircle, ShieldAlert, CheckCircle, X, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

type CheckResult = "PASS" | "CAUTION" | "STOP";

interface RiskCheck {
  id: string;
  label: string;
  result: CheckResult;
  message: string;
}

interface DisciplineWarning {
  type: string;
  message: string;
}

export interface GuardianResult {
  verdict: "GO" | "CAUTION" | "STOP";
  checks: RiskCheck[];
  discipline_warnings: DisciplineWarning[];
  debug: {
    balance: number;
    daily_cap_remaining: number;
    total_dd_remaining: number;
    risk_usd: number;
    rr: number;
    trades_today: number;
    open_trades: number;
    consecutive_losses: number;
  };
}

interface RiskGuardianModalProps {
  result: GuardianResult;
  instrument: string;
  direction: "LONG" | "SHORT";
  grade: string;
  overrideConfirmed: boolean;
  onToggleOverride: () => void;
  onStop: () => void;
  onOverride: () => void;
  isSubmitting?: boolean;
}

function CheckRow({ check }: { check: RiskCheck }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 border-b border-border/50 last:border-0">
      {check.result === "PASS"
        ? <CheckCircle className="size-4 text-profit shrink-0 mt-0.5" />
        : check.result === "STOP"
        ? <XCircle className="size-4 text-loss shrink-0 mt-0.5" />
        : <ShieldAlert className="size-4 text-warning shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-secondary">{check.label}</p>
        <p className={cn(
          "text-xs font-medium",
          check.result === "STOP" ? "text-loss"
          : check.result === "CAUTION" ? "text-warning"
          : "text-text-primary"
        )}>{check.message}</p>
      </div>
    </div>
  );
}

export default function RiskGuardianModal({
  result,
  instrument,
  direction,
  grade,
  overrideConfirmed,
  onToggleOverride,
  onStop,
  onOverride,
  isSubmitting = false,
}: RiskGuardianModalProps) {
  const { verdict, checks, discipline_warnings, debug } = result;
  const hasStops = checks.some(c => c.result === "STOP");
  const hasWarnings = discipline_warnings.length > 0;
  const needsOverride = hasStops || hasWarnings;
  const canProceed = !needsOverride || overrideConfirmed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className={cn(
          "flex items-center justify-between px-4 py-3 border-b border-border",
          verdict === "STOP" ? "bg-loss/10"
          : verdict === "CAUTION" ? "bg-warning/10"
          : "bg-profit/10"
        )}>
          <div className="flex items-center gap-2">
            {verdict === "STOP"
              ? <XCircle className="size-5 text-loss" />
              : verdict === "CAUTION"
              ? <ShieldAlert className="size-5 text-warning" />
              : <CheckCircle className="size-5 text-profit" />
            }
            <div>
              <p className="text-sm font-semibold text-text-primary">Risk Guardian</p>
              <p className="text-xs text-text-secondary">{instrument} {direction} · Grade {grade}</p>
            </div>
          </div>
          <button
            onClick={onStop}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-surface-2">
          <div className="px-3 py-2 text-center">
            <p className="text-[11px] text-text-secondary">Trades today</p>
            <p className="text-sm font-mono font-medium text-text-primary">{debug.trades_today}</p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className="text-[11px] text-text-secondary">Daily cap left</p>
            <p className={cn(
              "text-sm font-mono font-medium",
              debug.daily_cap_remaining <= 0 ? "text-loss"
              : debug.daily_cap_remaining < 60 ? "text-warning"
              : "text-profit"
            )}>
              ${debug.daily_cap_remaining.toFixed(0)}
            </p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className="text-[11px] text-text-secondary">R:R</p>
            <p className={cn(
              "text-sm font-mono font-medium",
              debug.rr >= 2 ? "text-profit" : debug.rr >= 1.5 ? "text-warning" : "text-text-secondary"
            )}>
              {debug.rr > 0 ? `1:${debug.rr}` : "—"}
            </p>
          </div>
        </div>

        {/* Advisory */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-text-secondary shrink-0" />
          <p className="text-[11px] text-text-secondary">
            Review these points before entering:
          </p>
        </div>

        {/* Risk checks */}
        <div className="px-4 pb-3">
          {checks.map(check => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>

        {/* Discipline warnings */}
        {hasWarnings && (
          <div className="px-4 pb-2 border-t border-border/50">
            <p className="text-[11px] font-medium text-warning uppercase tracking-wider mt-3 mb-2 flex items-center gap-1.5">
              <TrendingDown className="size-3.5" />
              Discipline rules
            </p>
            <div className="space-y-1.5">
              {discipline_warnings.map(warning => (
                <div key={warning.type} className="flex items-start gap-2">
                  <AlertTriangle className="size-3 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning leading-snug">{warning.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single override checkbox */}
        {needsOverride && (
          <div className="px-4 pb-3 pt-2 border-t border-border/50 mt-1">
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={overrideConfirmed}
                onChange={onToggleOverride}
                className="mt-0.5 shrink-0 accent-warning cursor-pointer"
              />
              <span className="text-xs text-text-secondary leading-snug group-hover:text-text-primary transition-colors">
                I understand the risks flagged above and want to proceed anyway. This will be logged as a rule override.
              </span>
            </label>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onStop}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-surface-2 border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={onOverride}
            disabled={!canProceed || isSubmitting}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed",
              hasStops && overrideConfirmed
                ? "bg-loss/20 border border-loss text-loss hover:bg-loss/30 disabled:opacity-40"
                : hasStops
                ? "bg-surface-2 border border-border text-text-disabled disabled:opacity-40"
                : verdict === "CAUTION" && overrideConfirmed
                ? "bg-warning text-bg hover:bg-warning/90 disabled:opacity-40"
                : verdict === "CAUTION"
                ? "bg-surface-2 border border-border text-text-disabled disabled:opacity-40"
                : direction === "LONG"
                ? "bg-profit text-bg hover:bg-profit/90 disabled:opacity-40"
                : "bg-loss text-bg hover:bg-loss/90 disabled:opacity-40"
            )}
          >
            {isSubmitting ? "Saving..."
              : !canProceed ? "Confirm above to proceed"
              : hasStops ? "Override & log violation"
              : discipline_warnings.length > 0 ? "Override & log violation"
              : "Confirm → Execute in MT5"}
          </button>
        </div>
      </div>
    </div>
  );
}
