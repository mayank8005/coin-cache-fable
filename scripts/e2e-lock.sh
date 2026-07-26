#!/usr/bin/env bash
# Single-run lock for the E2E suite (throwaway DB container + fixed app port).
#
# Ownership is the lock directory, and the pid file inside it is the proof of
# ownership. Three rules keep that honest:
#   * a claim is `mkdir` (atomic, exactly one winner) and is only complete once
#     the pid file is written — waiters treat "directory but no pid yet" as a
#     run mid-claim, never as abandoned;
#   * reclaiming a stale lock renames it away first, so only one waiter can
#     clear it and nobody deletes a directory another run just created;
#   * releasing checks the lock still holds OUR pid before removing it.

lock_dir="${TMPDIR:-/tmp}/coincache-e2e.lock"
lock_pid_file="$lock_dir/pid"
lock_acquired=0

# `ps`, not `kill -0`: kill reports EPERM for another user's live process, which
# reads as "dead" and evicts them. Pid 0 is rejected outright — `kill -0 0`
# always succeeds, which would make a bogus lock unbreakable.
pid_is_live() {
  local pid="${1:-}"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || return 1
  ps -p "$pid" >/dev/null 2>&1
}

read_owner_pid() {
  local dir="${1:-$lock_dir}" pid=""
  if [[ -r "$dir/pid" ]]; then
    IFS= read -r pid < "$dir/pid" || true
  fi
  printf '%s' "$pid"
}

# Not acquired until the pid is published AND still ours a moment later: a
# waiter that judged this path stale just before we created it can still rename
# the directory away. Whoever's pid survives the settle is the single owner.
try_claim() {
  mkdir "$lock_dir" 2>/dev/null || return 1
  printf '%s\n' "$$" > "$lock_pid_file"
  sleep 0.2
  [[ "$(read_owner_pid)" == "$$" ]] || return 1
  lock_acquired=1
  return 0
}

acquire_lock() {
  local attempt owner waited stale_dir
  for attempt in 1 2 3; do
    try_claim && return 0

    owner="$(read_owner_pid)"
    waited=0
    # A claim in progress publishes its pid within milliseconds; give it a
    # bounded grace instead of declaring the run dead.
    while [[ -z "$owner" && "$waited" -lt 50 ]]; do
      [[ -d "$lock_dir" ]] || break
      sleep 0.1
      waited=$((waited + 1))
      owner="$(read_owner_pid)"
    done

    # A live owner always wins, and we never touch its lock.
    if pid_is_live "$owner"; then
      return 1
    fi

    # Stale (crashed run, garbage pid, or no pid within the grace). Rename it
    # away: exactly one racer's `mv` can succeed, so two waiters can't both
    # clear the lock and then both claim it.
    stale_dir="$lock_dir.stale.$$"
    if mv "$lock_dir" "$stale_dir" 2>/dev/null; then
      # The lock may have been re-claimed between our staleness check and this
      # rename, in which case we are holding a live run's lock: give it back
      # instead of deleting it.
      if pid_is_live "$(read_owner_pid "$stale_dir")"; then
        if [[ ! -e "$lock_dir" ]]; then
          mv "$stale_dir" "$lock_dir" 2>/dev/null || true
        fi
        return 1
      fi
      rm -rf "$stale_dir"
    fi
  done
  return 1
}

release_lock() {
  [[ "$lock_acquired" == "1" ]] || return 0
  # Only ever remove a lock that is still ours: a blanket `rm -rf` here would
  # delete the lock a newer run has already claimed.
  [[ "$(read_owner_pid)" == "$$" ]] || return 0
  rm -f "$lock_pid_file"
  rmdir "$lock_dir" 2>/dev/null || true
  lock_acquired=0
}
