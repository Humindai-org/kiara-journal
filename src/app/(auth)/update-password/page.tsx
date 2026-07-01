"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return; }
    if (password.length < 6) { setError("Mínimo 6 caracteres."); return; }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = "/dashboard"; }, 2000);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3 mb-8 justify-center">
        <div className="size-9 rounded-xl bg-accent flex items-center justify-center">
          <TrendingUp className="size-5 text-bg" />
        </div>
        <div className="leading-tight">
          <p className="text-text-primary font-medium">Trading Kiara</p>
          <p className="text-text-secondary text-xs">Journal</p>
        </div>
      </div>

      <div className="card p-6">
        <h1 className="text-text-primary font-medium mb-1">Nueva contraseña</h1>
        <p className="text-text-secondary text-xs mb-6">Elegí una contraseña nueva para tu cuenta.</p>

        {done ? (
          <p className="text-xs text-profit bg-[#0f2b1a] border border-profit/20 rounded-lg px-3 py-2">
            Contraseña actualizada. Redirigiendo…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Nueva contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Confirmar contraseña</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-xs text-loss bg-[#2b0f0f] border border-loss/20 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
