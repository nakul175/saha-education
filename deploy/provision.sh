#!/usr/bin/env bash
# One-time (idempotent) setup of a DigitalOcean droplet (Ubuntu 24.04, 2 GB RAM or more) for this app.
# Run as root on the droplet:
#   SAHA_GIT_TOKEN=<read-only GitHub token> SAHA_HOST=<name>.<ip-dashed>.sslip.io bash provision.sh
# The git token is stored in /etc/saha/<app>.git-token (mode 600) and never printed.
set -euo pipefail

APP="saha-education"
REPO="https://github.com/nakul175/saha-education.git"
PORT="3200"
: "${SAHA_HOST:?set SAHA_HOST, e.g. education.1-2-3-4.sslip.io (or your own domain)}"
: "${SAHA_GIT_TOKEN:?set SAHA_GIT_TOKEN to a read-only GitHub token for ${REPO}}"
export DEBIAN_FRONTEND=noninteractive

# --- swap (2 GB): the build needs more memory than a small droplet has ---
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update -y
apt-get install -y ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https ufw build-essential

# --- Node 22 (wrangler 4 needs >= 22.13) ---
if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y && apt-get install -y nodejs
fi
command -v pnpm >/dev/null || npm install -g pnpm@11.25.0

# --- Caddy (official apt repo) ---
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# --- user, directories, secrets ---
id saha >/dev/null 2>&1 || useradd --system --home-dir "/var/lib/${APP}" --shell /usr/sbin/nologin saha
install -d -o root -g root -m 0755 /etc/saha "/opt/${APP}"
install -d -o saha -g saha -m 0750 "/var/lib/${APP}" "/var/lib/${APP}/state"
( umask 077; printf '%s' "$SAHA_GIT_TOKEN" > "/etc/saha/${APP}.git-token" )
chown root:root "/etc/saha/${APP}.git-token"; chmod 600 "/etc/saha/${APP}.git-token"

# --- source checkout (kept as root; the app runs as user saha) ---
if [ ! -d "/opt/${APP}/src/.git" ]; then
  git -c credential.helper="!f(){ echo username=x-access-token; echo password=\$(cat /etc/saha/${APP}.git-token); }; f" \
    clone --depth 1 "$REPO" "/opt/${APP}/src"
fi

# --- units, updater, proxy ---
HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
SRC="/opt/${APP}/src/deploy"
install -m 0755 "$SRC/update.sh" "/usr/local/bin/${APP}-update"
install -m 0644 "$SRC/${APP}.service" "/etc/systemd/system/${APP}.service"
install -m 0644 "$SRC/${APP}-update.service" "/etc/systemd/system/${APP}-update.service"
install -m 0644 "$SRC/${APP}-update.timer" "/etc/systemd/system/${APP}-update.timer"
# One Caddy serves every app on this droplet: the main Caddyfile only imports one file per app.
install -d -m 0755 /etc/caddy/conf.d
grep -q '^import /etc/caddy/conf.d/' /etc/caddy/Caddyfile 2>/dev/null || printf 'import /etc/caddy/conf.d/*.caddy\n' > /etc/caddy/Caddyfile
sed "s/SAHA_HOST/${SAHA_HOST}/" "$SRC/Caddyfile" > "/etc/caddy/conf.d/${APP}.caddy"
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable caddy "${APP}.service" "${APP}-update.timer"
systemctl reload-or-restart caddy

# --- firewall: 22, 80, 443 only ---
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443
ufw --force enable

# --- first build and start (the timer repeats this every 3 minutes) ---
"/usr/local/bin/${APP}-update"
systemctl start "${APP}-update.timer"
echo "provision done: https://${SAHA_HOST}/"
