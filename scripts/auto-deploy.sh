#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=${ENGCLASS_REPO_DIR:-$(cd -- "$script_dir/.." && pwd)}
branch=${ENGCLASS_BRANCH:-main}
state_dir=${ENGCLASS_STATE_DIR:-$repo_dir/.deploy}
env_file=${ENGCLASS_ENV_FILE:-$repo_dir/.env.production}
mode=${1:---once}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

# Git may replace this script during the update. Execute a private snapshot so
# Bash never continues reading a file that has changed beneath it.
if [[ "$mode" != --install-* && ${ENGCLASS_DEPLOY_SNAPSHOT:-0} != 1 ]]; then
  mkdir -p -- "$state_dir"
  run_copy=$(mktemp "$state_dir/run-XXXXXXXX.sh")
  cp -- "${BASH_SOURCE[0]}" "$run_copy"
  run_status=0
  ENGCLASS_DEPLOY_SNAPSHOT=1 ENGCLASS_REPO_DIR="$repo_dir" /bin/bash "$run_copy" "$@" || run_status=$?
  rm -f -- "$run_copy"
  exit "$run_status"
fi

# Cron starts every job with the account's current groups and runs within a minute
# of boot. Replaces any systemd timer to avoid two schedulers.
if [[ "$mode" == --install-cron ]]; then
  [[ $(id -u) -ne 0 ]] || die 'Install the cron job as the account that owns the repository.'
  command -v crontab >/dev/null || die 'crontab is required.'
  mkdir -p -- "$state_dir"
  marker='# engclass-auto-deploy'
  job="* * * * * ENGCLASS_REPO_DIR='$repo_dir' PATH=/usr/local/bin:/usr/bin:/bin /bin/bash '$repo_dir/scripts/auto-deploy.sh' --once 2>&1 | grep --line-buffered -v 'no changes' >> '$state_dir/cron.log' $marker"
  { crontab -l 2>/dev/null | grep -vF "$marker" || true; printf '%s\n' "$job"; } | crontab -
  if command -v systemctl >/dev/null && systemctl --user is-enabled engclass-update.timer >/dev/null 2>&1; then
    systemctl --user disable --now engclass-update.timer
    log 'Disabled the systemd update timer; cron now schedules updates.'
  fi
  log "Cron job installed; it checks $branch every minute, including right after boot. Log: $state_dir/cron.log"
  exit 0
fi

[[ "$mode" == --once || "$mode" == --force ]] || die 'Usage: auto-deploy.sh [--once|--force|--install-cron]'
for program in git docker flock timeout; do
  command -v "$program" >/dev/null || die "$program is required."
done
[[ -f "$env_file" ]] || die "Missing environment file: $env_file"
[[ -f "$repo_dir/compose.production.yml" ]] || die 'Production Compose file is missing.'
mkdir -p -- "$state_dir/backups"
exec 9> "$state_dir/update.lock"
if ! flock -n 9; then log 'Another deployment is running; skipped.'; exit 0; fi

git -C "$repo_dir" rev-parse --is-inside-work-tree >/dev/null
[[ $(git -C "$repo_dir" symbolic-ref --short HEAD) == "$branch" ]] || die "Check out branch $branch before deploying."
[[ -z $(git -C "$repo_dir" status --porcelain) ]] || die 'Repository has local edits; refusing to overwrite them.'
export GIT_TERMINAL_PROMPT=0
timeout 120 git -C "$repo_dir" fetch --prune origin
target=$(git -C "$repo_dir" rev-parse "refs/remotes/origin/$branch")
[[ "$target" =~ ^[0-9a-f]{40}$ ]] || die 'Invalid remote revision.'
previous_commit=''
previous_image=''
[[ ! -f "$state_dir/active" ]] || read -r previous_commit previous_image < "$state_dir/active"
if [[ "$mode" != --force && "$previous_commit" == "$target" ]]; then
  log "Already deployed ${target:0:12}; no changes."
  exit 0
fi
if [[ "$mode" != --force && -f "$state_dir/failed" ]]; then
  read -r failed_commit failed_at < "$state_dir/failed"
  if [[ "$failed_commit" == "$target" && "$failed_at" =~ ^[0-9]+$ ]] &&
    (( $(date +%s) - failed_at < ${ENGCLASS_RETRY_SECONDS:-300} )); then
    log 'Recent attempt failed; retry postponed for five minutes.'
    exit 0
  fi
fi
git -C "$repo_dir" merge-base --is-ancestor HEAD "$target" || die 'Local and remote histories diverged; no reset performed.'
git -C "$repo_dir" merge --ff-only --no-edit "$target"
image="${ENGCLASS_IMAGE_PREFIX:-engclass-app}:${target:0:12}"
rollout_started=false

pg_user=$(grep -E '^POSTGRES_USER=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
pg_db=$(grep -E '^POSTGRES_DB=' "$env_file" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
pg_user=${pg_user:-engclass}
pg_db=${pg_db:-engclass}

compose() {
  ENGCLASS_IMAGE="$image" docker compose --project-name engclass --env-file "$env_file" \
    -f "$repo_dir/compose.production.yml" "$@"
}
failed() {
  status=$?
  trap - ERR
  printf '%s %s\n' "$target" "$(date +%s)" > "$state_dir/failed"
  log "Deployment failed for ${target:0:12}; see cron.log or docker logs."
  if [[ "$rollout_started" == true && -n "$previous_image" ]]; then
    image=$previous_image
    log "Restoring previous application image: $image"
    log 'Database schema is NOT rolled back. Only backward-compatible migrations are safe; restore a backup manually after review if needed.'
    if ! compose up -d --no-deps --wait --wait-timeout 120 app; then
      log 'Application rollback failed. Database backup is retained for recovery.'
    fi
  fi
  exit "$status"
}
trap failed ERR
docker info >/dev/null
compose config --quiet
log "Building revision ${target:0:12}; running application remains active during the build."
compose build app
compose up -d --wait --wait-timeout 120 postgres
backup="$state_dir/backups/deploy-$(date -u +%Y%m%dT%H%M%S)-${target:0:12}-$$.dump"
timeout --kill-after=15s 300 docker compose --project-name engclass --env-file "$env_file" \
  -f "$repo_dir/compose.production.yml" exec -T postgres pg_dump -U "$pg_user" -d "$pg_db" -Fc > "$backup.tmp"
[[ -s "$backup.tmp" ]] || die 'Database backup is empty; refusing rollout.'
mv -- "$backup.tmp" "$backup"
rollout_started=true
compose up -d --wait --wait-timeout 180
printf '%s %s\n' "$target" "$image" > "$state_dir/active.tmp"
mv -- "$state_dir/active.tmp" "$state_dir/active"
rm -f -- "$state_dir/failed"
trap - ERR

# Retain only this script's three most recent database backups.
mapfile -t old_backups < <(find "$state_dir/backups" -maxdepth 1 -type f -name 'deploy-*.dump' -print | sort -r | tail -n +4)
if ((${#old_backups[@]})); then rm -- "${old_backups[@]}"; fi
if managed_images=$(docker image ls --format '{{.Repository}}:{{.Tag}}'); then
  while IFS= read -r candidate; do
    if [[ "${candidate%:*}" == "${ENGCLASS_IMAGE_PREFIX:-engclass-app}" && "$candidate" =~ :[0-9a-f]{12}$ &&
      "$candidate" != "$image" && "$candidate" != "$previous_image" ]]; then
      docker image rm "$candidate" >/dev/null 2>&1 || log "Image still in use; retained $candidate"
    fi
  done <<< "$managed_images"
fi
log "Deployed ${target:0:12}; app is healthy, database backup retained."
