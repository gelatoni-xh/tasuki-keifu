#!/usr/bin/env bash
set -euo pipefail
umask 077

STATE_DIR="${STATE_DIR:-$HOME/.local/state/tasuki-keifu}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/.local/share/tasuki-keifu/backups}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-24}"
PROXY_ADDRESS="${PROXY_ADDRESS:-127.0.0.1:7877}"
KEY_PATH="${KEY_PATH:-/Users/xuhuan/workspace_new/server-access/lightsail-ap-northeast-1.pem}"
REMOTE_HOST="${REMOTE_HOST:-ubuntu@13.230.244.67}"
LAST_SUCCESS_FILE="$STATE_DIR/last_backup_pull_at"
[[ "$MAX_AGE_HOURS" =~ ^[0-9]+$ ]] || { echo 'Invalid MAX_AGE_HOURS' >&2; exit 1; }
mkdir -p "$STATE_DIR" "$BACKUP_DIR"
mkdir "$STATE_DIR/backup-pull.lock" || { echo 'Another pull is active (check backup-pull.lock).' >&2; exit 1; }
partial=''
cleanup() {
  [[ -z "$partial" ]] || rm -f "$partial"
  rmdir "$STATE_DIR/backup-pull.lock"
}
trap cleanup EXIT
last_success=0
[[ ! -f "$LAST_SUCCESS_FILE" ]] || read -r last_success < "$LAST_SUCCESS_FILE"
[[ "$last_success" =~ ^[0-9]+$ ]] || { echo 'Invalid last-success timestamp' >&2; exit 1; }
if (( $(date +%s) - last_success < MAX_AGE_HOURS * 3600 )); then
  echo 'Skipping backup pull: last successful sync is still fresh.'
  exit 0
fi

# Use identical routing and host verification for command execution and transfer.
ssh_options=(-i "$KEY_PATH" -o IdentitiesOnly=yes -o BatchMode=yes
  -o StrictHostKeyChecking=yes -o ConnectTimeout=20
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3
  -o "ProxyCommand=/usr/bin/nc -x $PROXY_ADDRESS -X 5 %h %p")
remote_path="$(ssh "${ssh_options[@]}" "$REMOTE_HOST" bash -s <<'REMOTE'
set -euo pipefail
umask 077
output_dir=/opt/apps/tasuki-keifu/tmp/backups
mkdir -p "$output_dir"
output="$output_dir/tasuki-keifu-$(date -u '+%Y-%m-%dT%H-%M-%S')-$$.sql.gz"
trap 'rm -f "$output.partial"' EXIT
sudo docker exec tasuki-keifu-postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip -c > "$output.partial"
gzip -t "$output.partial"
mv "$output.partial" "$output"
printf '%s\n' "$output"
REMOTE
)"
if [[ ! "$remote_path" =~ ^/opt/apps/tasuki-keifu/tmp/backups/tasuki-keifu-[0-9T-]+\.sql\.gz$ ]]; then
  echo 'Unexpected remote backup path; refusing transfer and cleanup.' >&2
  exit 1
fi
# remote_path has passed the strict filename allowlist above.
# shellcheck disable=SC2029
remote_hash="$(ssh "${ssh_options[@]}" "$REMOTE_HOST" "sha256sum '$remote_path'")"
remote_hash="${remote_hash%% *}"
[[ "$remote_hash" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid remote checksum' >&2; exit 1; }
destination="$BACKUP_DIR/${remote_path##*/}"
[[ ! -e "$destination" ]] || { echo 'Backup already exists; refusing overwrite.' >&2; exit 1; }
partial="$(mktemp "$BACKUP_DIR/.pull.XXXXXX")"
scp "${ssh_options[@]}" "$REMOTE_HOST:$remote_path" "$partial"
local_hash="$(shasum -a 256 "$partial")"
[[ "${local_hash%% *}" == "$remote_hash" ]] || { echo 'Transfer checksum mismatch' >&2; exit 1; }
gzip -t "$partial"
# A hard link publishes without replacing an existing dated snapshot.
ln "$partial" "$destination"
rm "$partial"
partial=''
printf '%s  %s\n' "$remote_hash" "${destination##*/}" > "$destination.sha256"
# shellcheck disable=SC2029
ssh "${ssh_options[@]}" "$REMOTE_HOST" "rm -f '$remote_path'"
date +%s > "$LAST_SUCCESS_FILE"
echo "Verified backup: $destination"
# Original snapshots are retained. Pruning requires a separate explicit decision.
