#!/bin/zsh
# Guarda las claves del Trading Journal en el Keychain de macOS.
# Ejecútalo en un terminal APARTE (no en Claude Code).
# Las claves no aparecen en pantalla ni en el historial del shell.

SERVICE="kiara-journal"

echo "Guardando claves en el Keychain de macOS..."
echo "Pega cada clave cuando se te pida y pulsa Enter.\n"

# ── Supabase ─────────────────────────────────────────────────
read -s "key?SUPABASE_URL (https://xxxx.supabase.co): "
security add-generic-password -U -s "$SERVICE" -a "SUPABASE_URL" -w "$key"
unset key && echo "✓ SUPABASE_URL\n"

read -s "key?SUPABASE_ANON_KEY: "
security add-generic-password -U -s "$SERVICE" -a "SUPABASE_ANON_KEY" -w "$key"
unset key && echo "✓ SUPABASE_ANON_KEY\n"

read -s "key?SUPABASE_SERVICE_ROLE_KEY: "
security add-generic-password -U -s "$SERVICE" -a "SUPABASE_SERVICE_ROLE_KEY" -w "$key"
unset key && echo "✓ SUPABASE_SERVICE_ROLE_KEY\n"

# ── Anthropic ─────────────────────────────────────────────────
echo "ANTHROPIC_API_KEY — deja en blanco si ya está en el servicio 'funded-system-kiara':"
read -s "key?"
if [[ -n "$key" ]]; then
  security add-generic-password -U -s "$SERVICE" -a "ANTHROPIC_API_KEY" -w "$key"
  echo "✓ ANTHROPIC_API_KEY\n"
else
  echo "↩ Usando la clave existente de funded-system-kiara\n"
fi
unset key

# ── News API (opcional) ───────────────────────────────────────
echo "NEWS_API_KEY (opcional — deja en blanco para omitir):"
read -s "key?"
if [[ -n "$key" ]]; then
  security add-generic-password -U -s "$SERVICE" -a "NEWS_API_KEY" -w "$key"
  echo "✓ NEWS_API_KEY\n"
else
  echo "↩ Omitida\n"
fi
unset key

echo "Listo. Verifica con:"
echo "  security find-generic-password -s \"$SERVICE\" -a \"SUPABASE_URL\" -w"
