#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Verifies the latest PostgreSQL backup by restoring it into a disposable postgres:16-alpine container,
# counting rows in all core tables, and removing the temporary container afterwards.
# Usage: scripts/verify-backup.sh [path/to/backup.dump]

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=${ENGCLASS_REPO_DIR:-$(cd -- "$script_dir/.." && pwd)}
state_dir=${ENGCLASS_STATE_DIR:-$repo_dir/.deploy}
backup_dir=${ENGCLASS_BACKUP_DIR:-$state_dir/backups}
pg_image=${ENGCLASS_VERIFY_PG_IMAGE:-postgres:16-alpine}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

if [[ -n "${CONTAINER_RUNTIME:-}" ]]; then
  runtime="$CONTAINER_RUNTIME"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  runtime="docker"
elif command -v podman >/dev/null 2>&1; then
  runtime="podman"
else
  die 'Neither docker nor podman is available.'
fi

backup_file="${1:-}"
if [[ -z "$backup_file" ]]; then
  backup_file=$(find "$backup_dir" -maxdepth 1 -type f \( -name 'deploy-*.dump' -o -name '*.dump' -o -name '*.sql' \) -print 2>/dev/null | sort -r | head -n 1 || true)
fi
[[ -n "$backup_file" && -f "$backup_file" ]] || die "No backup file found (checked: ${backup_file:-$backup_dir})."
[[ -s "$backup_file" ]] || die "Backup file is empty: $backup_file"

container_name="engclass-verify-backup-$$-$(date +%s)"
pg_pass="verify_$(date +%s)_$$"
pg_user="verify"
pg_db="verify_db"

cleanup() {
  "$runtime" rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Starting temporary container ($runtime, $pg_image) to verify: $backup_file"
"$runtime" run -d --rm \
  --name "$container_name" \
  -e "POSTGRES_USER=$pg_user" \
  -e "POSTGRES_PASSWORD=$pg_pass" \
  -e "POSTGRES_DB=$pg_db" \
  "$pg_image" >/dev/null

ready=false
for _ in $(seq 1 30); do
  if "$runtime" exec "$container_name" pg_isready -U "$pg_user" -d "$pg_db" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || die 'Temporary PostgreSQL container did not become ready in time.'

# Detect PostgreSQL custom dump header ("PGDMP") vs plain SQL
magic=$(head -c 5 "$backup_file" 2>/dev/null || true)
if [[ "$magic" == "PGDMP" ]]; then
  log "Restoring custom-format dump via pg_restore..."
  "$runtime" exec -i "$container_name" \
    pg_restore --no-owner --no-privileges --exit-on-error -U "$pg_user" -d "$pg_db" < "$backup_file"
else
  log "Restoring plain SQL dump via psql..."
  "$runtime" exec -i "$container_name" \
    psql -v ON_ERROR_STOP=1 -U "$pg_user" -d "$pg_db" < "$backup_file" >/dev/null
fi

log "Restore succeeded. Counting rows in core tables:"
"$runtime" exec -i "$container_name" psql -U "$pg_user" -d "$pg_db" -v ON_ERROR_STOP=1 --pset=pager=off <<'SQL'
DO $$
DECLARE
  tbl text;
  cnt bigint;
  tables text[] := ARRAY[
    'User',
    'Class',
    'Enrollment',
    'Worksheet',
    'Field',
    'Assignment',
    'Submission',
    'Answer',
    'Notification',
    'DriveFile',
    'AuditLog',
    'ErrorLog'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO cnt;
      RAISE NOTICE '  % : % rows', rpad(tbl, 14), cnt;
    ELSE
      RAISE NOTICE '  % : (table not present in this backup)', rpad(tbl, 14);
    END IF;
  END LOOP;
END $$;
SQL

# Verify critical tables exist and have valid schema
user_count=$("$runtime" exec "$container_name" psql -U "$pg_user" -d "$pg_db" -tAc 'SELECT count(*) FROM public."User";')
[[ "$user_count" =~ ^[0-9]+$ ]] || die 'Failed to query public."User" after restore.'
log "Backup verification PASSED (User count: $user_count). Temporary container will be removed."
