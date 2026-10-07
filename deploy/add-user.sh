#!/usr/bin/env bash
# Add or reset a sign-in for this app. Run as root on the droplet:
#   saha-education-add-user <email>
# A random password is generated and shown once on this terminal; only its bcrypt hash is stored.
set -euo pipefail

APP="saha-education"
FILE="/etc/saha/${APP}.users"
EMAIL="${1:?usage: ${APP}-add-user <email>}"
[[ "$EMAIL" =~ ^[^[:space:]@\"]+@[^[:space:]@\"]+$ ]] || { echo "not an email address" >&2; exit 1; }

PW="$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)"
HASH="$(printf '%s' "$PW" | python3 -c 'import bcrypt,sys; print(bcrypt.hashpw(sys.stdin.buffer.read(), bcrypt.gensalt(12)).decode())')"

umask 077
TMP="$(mktemp)"
[ -f "$FILE" ] && grep -v -F "${EMAIL} " "$FILE" > "$TMP" || true
echo "${EMAIL} ${HASH}" >> "$TMP"
install -m 0640 -o root -g caddy "$TMP" "$FILE"
rm -f "$TMP"

systemctl reload caddy 2>/dev/null || true
echo "Sign-in for ${EMAIL}"
echo "Password (shown once): ${PW}"
