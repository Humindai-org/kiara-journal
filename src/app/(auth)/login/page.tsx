"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Ingresa tu email primero para recuperar la contraseña.");
      return;
    }
    setResetLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://kiara-journal.vercel.app/update-password",
    });
    setResetLoading(false);
    if (error) { setError(error.message); return; }
    setResetSent(true);
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 justify-center">
        <div className="size-9 rounded-xl bg-accent flex items-center justify-center">
          <TrendingUp className="size-5 text-bg" />
        </div>
        <div className="leading-tight">
          <p className="text-text-primary font-medium">Trading Kiara</p>
          <p className="text-text-secondary text-xs">Journal</p>
        </div>
      </div>

      {/* Card */}
      <div className="card p-6">
        <h1 className="text-text-primary font-medium mb-1">Iniciar sesión</h1>
        <p className="text-text-secondary text-xs mb-6">
          Cuenta fondeada TTP CFD Prime $100K
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-loss bg-[#2b0f0f] border border-loss/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {resetSent && (
            <p className="text-xs text-profit bg-[#0f2b1a] border border-profit/20 rounded-lg px-3 py-2">
              Te enviamos un email de recuperación. Revisá tu bandeja (y spam).
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={resetLoading || resetSent}
            className="w-full text-xs text-text-disabled hover:text-text-secondary transition-colors disabled:opacity-40"
          >
            {resetLoading ? "Enviando…" : "¿Olvidaste tu contraseña?"}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-text-disabled mt-4">
        Trading Kiara Journal · Phase 2
      </p>
    </div>
  );
}
