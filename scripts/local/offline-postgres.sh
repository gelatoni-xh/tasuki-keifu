#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="${TASUKI_OFFLINE_ROOT:-$HOME/.local/share/tasuki-keifu/offline-postgres}"
PORT="${TASUKI_OFFLINE_PORT:-25432}"
PG_BIN="${PG_BIN:-/usr/local/opt/postgresql@17/bin}"
export PATH="$PG_BIN:$PATH"
DATA="$ROOT/data"
SOCKET="$ROOT/socket"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid port' >&2; exit 1; }
# Never inherit a production libpq connection setting.
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGOPTIONS
psql_local() { psql -X -h "$SOCKET" -p "$PORT" -U offline_admin -v ON_ERROR_STOP=1 "$@"; }
managed() { [[ -f "$ROOT/managed-offline-v1" && -f "$DATA/PG_VERSION" ]] || { echo 'Not an initialized offline instance' >&2; exit 1; }; }
start() {
  managed
  if ! pg_ctl -D "$DATA" status >/dev/null 2>&1; then
    pg_ctl -D "$DATA" -l "$ROOT/postgres.log" -w start
  fi
  [[ "$(psql_local -d postgres -Atc 'SHOW data_directory')" == "$DATA" ]] || { echo 'Unexpected PostgreSQL instance' >&2; exit 1; }
}

case "${1:-}" in
  init)
    [[ ! -e "$DATA" && ! -e "$ROOT/admin-password" ]] || { echo 'Refusing to replace an existing cluster' >&2; exit 1; }
    mkdir -p "$ROOT" "$SOCKET"
    chmod 700 "$ROOT" "$SOCKET"
    openssl rand -hex 24 > "$ROOT/admin-password"
    initdb -D "$DATA" -U offline_admin --encoding=UTF8 --locale=C --auth-local=trust --auth-host=scram-sha-256 --pwfile="$ROOT/admin-password" > "$ROOT/initdb.log"
    printf "\nlisten_addresses = '127.0.0.1'\nport = %s\nunix_socket_directories = '%s'\n" "$PORT" "$SOCKET" >> "$DATA/postgresql.conf"
    touch "$ROOT/managed-offline-v1"
    start
    ;;
  start) start ;;
  stop) managed; pg_ctl -D "$DATA" -m fast -w stop ;;
  status) managed; pg_ctl -D "$DATA" status ;;
  restore)
    backup="${2:?Usage: offline-postgres.sh restore /absolute/backup.sql.gz [new_database]}"
    database="${3:-tasuki_dev_$(date -u '+%Y%m%d_%H%M%S')_$$}"
    [[ "$database" =~ ^tasuki_dev_[a-z0-9_]+$ && ${#database} -le 63 ]] || { echo 'Database must start tasuki_dev_ and contain only lowercase letters, digits and underscores (max 63).' >&2; exit 1; }
    gzip -t "$backup"
    start
    # pg_dump does not include cluster roles. Create inert ownership/ACL targets locally.
    for role in tasuki_keifu_user tasuki_gov_runtime tasuki_gov_reader tasuki_gov_site; do
      if [[ "$(psql_local -d postgres -Atc "SELECT count(*) FROM pg_roles WHERE rolname = '$role'")" == 0 ]]; then
        psql_local -d postgres -qc "CREATE ROLE $role NOLOGIN"
      fi
    done
    # CREATE DATABASE fails on a duplicate; no DROP or replacement is performed.
    psql_local -d postgres -qc "CREATE DATABASE $database TEMPLATE template0 LOCALE_PROVIDER libc LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8'"
    log="$ROOT/$database.restore.log"
    if ! gzip -dc "$backup" | psql_local -d "$database" --single-transaction > "$log" 2>&1; then
      echo "Restore failed; inspect $log. No development env was published." >&2
      exit 1
    fi
    psql_local -d "$database" -qc ANALYZE
    password="$(< "$ROOT/admin-password")"
    env_file="$ROOT/$database.env"
    printf "export DATABASE_URL='postgresql://offline_admin:%s@127.0.0.1:%s/%s?schema=public'\n" "$password" "$PORT" "$database" > "$env_file"
    printf '%s\n' "$backup" > "$ROOT/$database.source"
    shasum -a 256 "$backup" > "$ROOT/$database.source.sha256"
    echo "Restored database: $database"
    echo "Development environment: $env_file"
    ;;
  *) echo 'Usage: offline-postgres.sh {init|start|stop|status|restore BACKUP [new_database]}' >&2; exit 1 ;;
esac
