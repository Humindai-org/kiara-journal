#!/bin/zsh
# Build de producción con claves desde Keychain.

SERVICE="kiara-journal"
FUNDED="funded-system-kiara"

SUPABASE_URL=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_URL" -w 2>/dev/null)
SUPABASE_ANON=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_ANON_KEY" -w 2>/dev/null)
SUPABASE_SRK=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_SERVICE_ROLE_KEY" -w 2>/dev/null)
ANTHROPIC=$(security find-generic-password -s "$SERVICE" -a "ANTHROPIC_API_KEY" -w 2>/dev/null \
         || security find-generic-password -s "$FUNDED" -a "ANTHROPIC_API_KEY" -w 2>/dev/null)
NEWS=$(security find-generic-password -s "$SERVICE" -a "NEWS_API_KEY" -w 2>/dev/null || echo "")

NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SRK" \
ANTHROPIC_API_KEY="$ANTHROPIC" \
NEWS_API_KEY="$NEWS" \
bun run build
