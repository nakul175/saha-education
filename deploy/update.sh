#!/usr/bin/env bash
# Pull `main`, and when it has moved: build, apply new database migrations, restart.
# Installed as /usr/local/bin/saha-education-update and run by saha-education-update.timer (every 3 minutes).
set -euo pipefail

APP="saha-education"
BRANCH="main"
SRC="/opt/${APP}/src"
STATE="/var/lib/${APP}/state"
LEDGER="/var/lib/${APP}/applied-migrations.txt"
STATUS="/var/lib/${APP}/deploy-status.json"
LOCK="/var/lib/${APP}/update.lock"

DEPLOY_KEY="/etc/saha/${APP}.deploy-key"
if [ -f "$DEPLOY_KEY" ]; then
  export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o UserKnownHostsFile=/etc/ssh/ssh_known_hosts -o StrictHostKeyChecking=accept-new"
fi

exec 9>"$LOCK"; flock -n 9 || { echo "another update is running"; exit 0; }

git_pull() {
  git -C "$SRC" -c credential.helper="!f(){ echo username=x-access-token; echo password=\$(cat /etc/saha/${APP}.git-token); }; f" "$@"
}

record() { printf '{"commit":"%s","state":"%s","at":"%s"}\n' "${1:-unknown}" "$2" "$(date -u +%FT%TZ)" > "$STATUS"; }

git_pull fetch --depth 1 origin "$BRANCH"
NEW="$(git -C "$SRC" rev-parse FETCH_HEAD)"
CUR="$(git -C "$SRC" rev-parse HEAD)"
# wrangler dev keeps its temporary files beside the config file (dist/server/.wrangler); the build runs as
# root but the service runs as user saha, so that directory is created for saha on every run, new build or not.
scratch() { [ -d "$SRC/dist/server" ] && install -d -o saha -g saha "$SRC/dist/server/.wrangler"; return 0; }
if [ "$NEW" = "$CUR" ] && [ -d "$SRC/dist/server" ]; then scratch; exit 0; fi

trap 'record "$NEW" failed' ERR
# Builds are heavy (1-2 GB): when several apps share this droplet, only one builds at a time.
exec 8>/var/lock/saha-build.lock; flock -w 1500 8
git -C "$SRC" reset --hard "$NEW"
cd "$SRC"
pnpm install --frozen-lockfile
pnpm run build

# Migrations: apply each drizzle/*.sql once, in name order, to the persisted local D1 database.
systemctl stop "${APP}.service" || true
touch "$LEDGER"
for f in drizzle/*.sql; do
  name="$(basename "$f")"
  if ! grep -qx "$name" "$LEDGER"; then
    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB \
      --local --config dist/server/wrangler.json --persist-to "$STATE" --file "$f"
    echo "$name" >> "$LEDGER"
  fi
done
scratch
chown -R saha:saha "/var/lib/${APP}"
systemctl start "${APP}.service"
sleep 5
if curl -fsS -m 20 -o /dev/null http://127.0.0.1:3200/; then record "$NEW" ok; else record "$NEW" failed; exit 1; fi
