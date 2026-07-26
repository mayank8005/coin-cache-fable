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
  # The directory can be renamed out from under us between the mkdir and this
  # write; a failed write means we never owned it, not that the run should die.
  printf '%s\n' "$$" > "$lock_pid_file" 2>/dev/null || return 1
  sleep 0.2
  [[ "$(read_owner_pid)" == "$$" ]] || return 1
  lock_acquired=1
  return 0
}

# A claim in progress publishes its pid within milliseconds. Wait a bounded
# grace for it rather than declaring the run dead, wherever we judge a lock.
await_owner_pid() {
  local dir="$1" pid waited=0
  pid="$(read_owner_pid "$dir")"
  while [[ -z "$pid" && "$waited" -lt 50 ]]; do
    [[ -d "$dir" ]] || break
    sleep 0.1
    waited=$((waited + 1))
    pid="$(read_owner_pid "$dir")"
  done
  printf '%s' "$pid"
}

# Renamed-away locks whose owner is gone: collect them, but never touch one that
# is still live (a hand-back we skipped because a third party re-claimed).
sweep_stale_dirs() {
  local dir
  shopt -s nullglob
  for dir in "$lock_dir".stale.*; do
    [[ -d "$dir" ]] || continue
    pid_is_live "$(read_owner_pid "$dir")" || rm -rf "$dir"
  done
  shopt -u nullglob
}

acquire_lock() {
  local attempt owner stale_dir
  sweep_stale_dirs
  for attempt in 1 2 3; do
    try_claim && return 0

    owner="$(await_owner_pid "$lock_dir")"

    # A live owner always wins, and we never touch its lock.
    if pid_is_live "$owner"; then
      return 1
    fi

    # Stale (crashed run, garbage pid, or no pid within the grace). Rename it
    # away: exactly one racer's `mv` can succeed, so two waiters can't both
    # clear the lock and then both claim it. The name is unique per attempt so
    # it can never collide with leftover litter — `mv` onto an existing
    # directory would nest the lock inside it instead of failing.
    stale_dir="$lock_dir.stale.$$.$attempt.$(date +%s)"
    if mv "$lock_dir" "$stale_dir" 2>/dev/null; then
      # The lock may have been claimed between our staleness check and this
      # rename, so judge the renamed directory with the same grace: if an owner
      # turns up alive, we are holding a live run's lock — give it back.
      if pid_is_live "$(await_owner_pid "$stale_dir")"; then
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
