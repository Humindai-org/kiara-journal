#!/bin/zsh
SERVICE="kiara-journal"
SUPABASE_URL=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_URL" -w 2>/dev/null)
SERVICE_ROLE_KEY=$(security find-generic-password -s "$SERVICE" -a "SUPABASE_SERVICE_ROLE_KEY" -w 2>/dev/null)

if [[ -z "$SUPABASE_URL" || -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Error: no se encontraron credenciales en Keychain"
  exit 1
fi

USERS=$(curl -s "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}")

echo ""
echo "Usuarios registrados:"
echo "$USERS" | python3 -c "import sys,json; [print(u['email']) for u in json.load(sys.stdin).get('users',[])]"
echo ""

print -n "Email del usuario a resetear: "
read EMAIL

USER_ID=$(echo "$USERS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
email = '${EMAIL}'
for u in data.get('users', []):
    if u.get('email') == email:
        print(u['id'])
" 2>/dev/null)

if [[ -z "$USER_ID" ]]; then
  echo "Error: no se encontró usuario '$EMAIL'"
  exit 1
fi

echo "Usuario encontrado ✓"
echo ""

print -n "Nueva contraseña (no se muestra): "
read -s NEW_PASS
echo ""
print -n "Confirmar contraseña: "
read -s CONFIRM
echo ""

if [[ "$NEW_PASS" != "$CONFIRM" ]]; then
  echo "Error: las contraseñas no coinciden."
  exit 1
fi

if [[ ${#NEW_PASS} -lt 6 ]]; then
  echo "Error: mínimo 6 caracteres."
  exit 1
fi

RESULT=$(curl -s -X PUT "${SUPABASE_URL}/auth/v1/admin/users/${USER_ID}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"${NEW_PASS}\"}")

if echo "$RESULT" | grep -q '"id"'; then
  echo "✓ Contraseña actualizada. Podés entrar en https://kiara-journal.vercel.app"
else
  echo "Error: $RESULT"
  exit 1
fi
