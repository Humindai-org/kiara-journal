"use client";

import { useRef, useState } from "react";
import { Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { parseMT5CSV, type ParsedTrade } from "@/lib/parse-mt5-csv";

type Step = "upload" | "preview" | "done";

type Props = {
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

export default function ImportCSVModal({ accountId, onClose, onSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep]       = useState<Step>("upload");
  const [trades, setTrades]   = useState<ParsedTrade[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting]   = useState(false);
  const [result, setResult]   = useState<{ total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    setParseError(null);
    if (!file.name.endsWith(".csv")) {
      setParseError("El archivo debe ser .csv");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseMT5CSV(text);
      if (parsed.length === 0) {
        const preview = text.slice(0, 300).replace(/\r?\n/g, " ↵ ");
        setParseError(`No se encontraron trades. Contenido detectado:\n${preview}`);
        return;
      }
      setTrades(parsed);
      setStep("preview");
    };
    reader.readAsText(file, "utf-8");
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleConfirm() {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/trades/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, trades }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setResult({ total: data.total });
      setStep("done");
      onSuccess();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  const preview = trades.slice(0, 5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative card p-6 w-full max-w-lg mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-text-primary">Importar trades desde MT5</h2>
          <button
            onClick={onClose}
            className="text-text-disabled hover:text-text-primary transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Step: upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              En MT5: <span className="text-text-primary">Account History</span> → clic derecho → <span className="text-text-primary">Save as Detailed Report</span> → guarda como <span className="text-text-primary">.csv</span>
            </p>

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 transition-colors cursor-pointer",
                dragging ? "border-accent bg-accent/5" : "border-border-light hover:border-accent/50"
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <Upload className={cn("size-8", dragging ? "text-accent" : "text-text-disabled")} />
              <div className="text-center">
                <p className="text-xs font-medium text-text-primary">Arrastra el archivo aquí</p>
                <p className="text-[11px] text-text-disabled mt-0.5">o haz clic para seleccionar</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onInputChange}
              />
            </div>

            {parseError && (
              <div className="flex items-start gap-2 text-xs text-loss bg-loss/10 rounded-md px-3 py-2">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap break-all">{parseError}</span>
              </div>
            )}
          </div>
        )}

        {/* Step: preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-secondary">
                Se encontraron{" "}
                <span className="text-text-primary font-medium">{trades.length} trades</span>
                {" "}— mostrando los primeros {Math.min(5, trades.length)}
              </p>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/40">
                    {["Par", "Dir.", "PnL neto", "Fecha", "Ticket"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-text-secondary font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((t) => (
                    <tr key={t.mt5_ticket} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-medium text-text-primary">{t.instrument}</td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          t.direction === "LONG" ? "badge-profit" : "badge-loss"
                        )}>
                          {t.direction}
                        </span>
                      </td>
                      <td className={cn(
                        "px-3 py-2 font-mono font-medium",
                        t.net_pnl >= 0 ? "text-profit" : "text-loss"
                      )}>
                        {t.net_pnl >= 0 ? "+" : ""}${t.net_pnl.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{fmtDate(t.open_time)}</td>
                      <td className="px-3 py-2 font-mono text-text-disabled">{t.mt5_ticket}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-text-disabled">
              Los trades que ya existen (mismo ticket MT5) se actualizarán sin crear duplicados.
            </p>

            {importError && (
              <div className="flex items-start gap-2 text-xs text-loss bg-loss/10 rounded-md px-3 py-2">
                <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                {importError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setStep("upload"); setTrades([]); }}
                className="flex-1 h-8 text-xs text-text-secondary border border-border-light rounded-md hover:text-text-primary transition-colors"
                disabled={importing}
              >
                Volver
              </button>
              <button
                onClick={handleConfirm}
                disabled={importing}
                className="flex-1 h-8 text-xs font-medium bg-accent text-bg rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {importing ? "Importando…" : `Confirmar ${trades.length} trades`}
              </button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && result && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle className="size-10 text-profit" />
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">
                {result.total} trades procesados
              </p>
              <p className="text-xs text-text-secondary mt-1">
                Los trades ya existentes fueron actualizados sin duplicados.
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-2 h-8 px-6 text-xs font-medium bg-accent text-bg rounded-md hover:opacity-90 transition-opacity"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
