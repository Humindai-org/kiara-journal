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
    daily_dd_remaining: number;
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
  confirmedWarnings: Set<string>;
  onToggleWarning: (type: string) => void;
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
  confirmedWarnings,
  onToggleWarning,
  onStop,
  onOverride,
  isSubmitting = false,
}: RiskGuardianModalProps) {
  const { verdict, checks, discipline_warnings, debug } = result;
  const hasStops = checks.some(c => c.result === "STOP");
  const allWarningsConfirmed = discipline_warnings.every(w => confirmedWarnings.has(w.type));
  const canProceed = allWarningsConfirmed;

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
              <p className="text-xs text-text-secondary">{instrument} {direction}</p>
            </div>
          </div>
          <button
            onClick={onStop}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Daily summary strip */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border bg-surface-2">
          <div className="px-3 py-2 text-center">
            <p className="text-[11px] text-text-secondary">Trades today</p>
            <p className="text-sm font-mono font-medium text-text-primary">{debug.trades_today}</p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className="text-[11px] text-text-secondary">Daily remaining</p>
            <p className={cn(
              "text-sm font-mono font-medium",
              debug.daily_dd_remaining <= 0 ? "text-loss"
              : debug.daily_dd_remaining < 90 ? "text-warning"
              : "text-profit"
            )}>
              ${debug.daily_dd_remaining.toFixed(0)}
            </p>
          </div>
          <div className="px-3 py-2 text-center">
            <p className="text-[11px] text-text-secondary">R:R</p>
            <p className={cn(
              "text-sm font-mono font-medium",
              debug.rr >= 2 ? "text-profit" : debug.rr >= 1.5 ? "text-warning" : "text-loss"
            )}>
              {debug.rr > 0 ? `1:${debug.rr}` : "—"}
            </p>
          </div>
        </div>

        {/* Advisory header */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-text-secondary shrink-0" />
          <p className="text-[11px] text-text-secondary">
            Before entering this trade, review these points:
          </p>
        </div>

        {/* Risk checks */}
        <div className="px-4 pb-3">
          <div>
            {checks.map(check => (
              <CheckRow key={check.id} check={check} />
            ))}
          </div>
        </div>

        {/* Discipline warnings */}
        {discipline_warnings.length > 0 && (
          <div className="px-4 pb-3 border-t border-border/50">
            <p className="text-[11px] font-medium text-warning uppercase tracking-wider mt-3 mb-2 flex items-center gap-1.5">
              <TrendingDown className="size-3.5" />
              Discipline rules
            </p>
            <div className="space-y-2.5">
              {discipline_warnings.map(warning => (
                <label key={warning.type} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={confirmedWarnings.has(warning.type)}
                    onChange={() => onToggleWarning(warning.type)}
                    className="mt-0.5 shrink-0 accent-warning cursor-pointer"
                  />
                  <span className="text-xs text-warning leading-snug group-hover:text-warning/80">
                    {warning.message}
                  </span>
                </label>
              ))}
              {!allWarningsConfirmed && (
                <p className="text-[11px] text-text-secondary">
                  Check all boxes above to proceed.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
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
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors",
              hasStops
                ? "bg-surface-2 border border-loss/40 text-loss/70 hover:bg-loss/10 hover:text-loss hover:border-loss disabled:opacity-40"
                : verdict === "CAUTION"
                ? "bg-warning text-bg hover:bg-warning/90 disabled:opacity-40"
                : direction === "LONG"
                ? "bg-profit text-bg hover:bg-profit/90 disabled:opacity-40"
                : "bg-loss text-bg hover:bg-loss/90 disabled:opacity-40",
              "disabled:cursor-not-allowed"
            )}
          >
            {isSubmitting ? "Saving..."
              : hasStops ? "Enter anyway"
              : discipline_warnings.length > 0 ? "Override & enter"
              : "Confirm → Execute in MT5"}
          </button>
        </div>
      </div>
    </div>
  );
}
