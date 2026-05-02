#!/bin/zsh
# Inicia el servidor de desarrollo con las claves leídas desde el Keychain.
# Nunca escribe nada en disco — las claves viven solo en memoria del proceso.

SERVICE="kiara-journal"
FUNDED="funded-system-kiara"

# ── Leer desde Keychain ───────────────────────────────────────
SUPABASE_URL=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_URL" -w 2>/dev/null)
SUPABASE_ANON=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_ANON_KEY" -w 2>/dev/null)
SUPABASE_SRK=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_SERVICE_ROLE_KEY" -w 2>/dev/null)

# ANTHROPIC: busca primero en kiara-journal, luego en funded-system-kiara
ANTHROPIC=$(security find-generic-password -s "$SERVICE" -a "ANTHROPIC_API_KEY" -w 2>/dev/null \
         || security find-generic-password -s "$FUNDED" -a "ANTHROPIC_API_KEY" -w 2>/dev/null)

NEWS=$(security find-generic-password -s "$SERVICE" -a "NEWS_API_KEY" -w 2>/dev/null || echo "")

# ── Validar obligatorias ──────────────────────────────────────
missing=0
[[ -z "$SUPABASE_URL" ]]  && echo "✗ SUPABASE_URL no encontrada"  && missing=1
[[ -z "$SUPABASE_ANON" ]] && echo "✗ SUPABASE_ANON_KEY no encontrada" && missing=1
[[ -z "$SUPABASE_SRK" ]]  && echo "✗ SUPABASE_SERVICE_ROLE_KEY no encontrada" && missing=1
[[ -z "$ANTHROPIC" ]]     && echo "✗ ANTHROPIC_API_KEY no encontrada" && missing=1

if [[ $missing -eq 1 ]]; then
  echo "\nEjecuta primero: ./scripts/setup-keychain.sh"
  exit 1
fi

echo "✓ Claves cargadas desde Keychain — iniciando dev server...\n"

# ── Arrancar Next.js con las claves como env vars ─────────────
NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SRK" \
ANTHROPIC_API_KEY="$ANTHROPIC" \
NEWS_API_KEY="$NEWS" \
bun run dev
