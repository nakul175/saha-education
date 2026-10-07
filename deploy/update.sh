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

exec 9>"$LOCK"; flock -n 9 || { echo "another update is running"; exit 0; }

git_pull() {
  git -C "$SRC" -c credential.helper="!f(){ echo username=x-access-token; echo password=\$(cat /etc/saha/${APP}.git-token); }; f" "$@"
}

record() { printf '{"commit":"%s","state":"%s","at":"%s"}\n' "${1:-unknown}" "$2" "$(date -u +%FT%TZ)" > "$STATUS"; }

git_pull fetch --depth 1 origin "$BRANCH"
NEW="$(git -C "$SRC" rev-parse FETCH_HEAD)"
CUR="$(git -C "$SRC" rev-parse HEAD)"
if [ "$NEW" = "$CUR" ] && [ -d "$SRC/dist/server" ]; then exit 0; fi

trap 'record "$NEW" failed' ERR
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
chown -R saha:saha "/var/lib/${APP}"
systemctl start "${APP}.service"
sleep 5
curl -fsS -o /dev/null http://127.0.0.1:3200/ && record "$NEW" ok
