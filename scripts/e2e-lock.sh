#!/usr/bin/env bash
# Single-run lock for the E2E suite (throwaway DB container + fixed app port).
#
# Ownership is the lock directory, and the pid file inside it is the proof of
# ownership. Three rules keep that honest:
#   * a claim is `mkdir` (atomic, exactly one winner) and is only complete once
#     the pid file is written — waiters treat "directory but no pid yet" as a
#     run mid-claim, never as abandoned until a bounded grace expires;
#   * reclaiming a stale lock renames it away first, so only one waiter can
#     clear it and nobody deletes a directory another run just created;
#   * releasing checks the lock still holds OUR pid before removing it.

lock_dir="${TMPDIR:-/tmp}/coincache-e2e.lock"
lock_pid_file="$lock_dir/pid"
lock_acquired=0
# Why the last acquire_lock failed: "busy" (a live run holds it) or "unwritable"
# (the lock path itself can't be created), so callers can say something true.
lock_failure_reason=""

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
  if ! mkdir "$lock_dir" 2>/dev/null; then
    # No directory at all means the parent is what refused us, not a busy lock.
    [[ -d "$lock_dir" ]] || lock_failure_reason="unwritable"
    return 1
  fi
  # The directory can be renamed out from under us between the mkdir and this
  # write; a failed write means we never owned it, not that the run should die.
  # The redirection must be inside the group — a failing open on the redirect
  # itself is reported before a trailing `2>/dev/null` takes effect.
  #
  # noclobber (in a subshell, so the option can't leak): if a pid file already
  # exists at this path it belongs to somebody else — a stalled claim whose
  # directory was recycled must never overwrite the new owner's proof.
  if ! ( set -C; printf '%s\n' "$$" > "$lock_pid_file" ) 2>/dev/null; then
    # Why did it fail? The write bit is not the answer: a `d-w-------` directory
    # reports writable yet refuses creation, and a full filesystem refuses it
    # too. Ask the directory directly, after ruling out the contention shapes.
    if [[ ! -d "$lock_dir" ]]; then
      lock_failure_reason="busy" # a waiter renamed our directory away
    elif [[ -s "$lock_pid_file" ]]; then
      lock_failure_reason="busy" # somebody else's proof landed here first
    elif ( : > "$lock_dir/.probe.$$" ) 2>/dev/null; then
      rm -f "$lock_dir/.probe.$$" 2>/dev/null || true
      lock_failure_reason="busy" # the directory takes files; transient failure
    else
      lock_failure_reason="unwritable"
      rmdir "$lock_dir" 2>/dev/null || true
    fi
    return 1
  fi
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
  local dir had_nullglob had_failglob
  # Sourced library: leave the caller's glob options exactly as we found them.
  # Both matter here — nullglob makes a no-match glob expand to nothing, but it
  # does NOT stop failglob from aborting the function on that same no-match, so
  # failglob has to be off for the duration too.
  had_nullglob="$(shopt -p nullglob || true)"
  had_failglob="$(shopt -p failglob || true)"
  shopt -s nullglob || true
  shopt -u failglob || true
  # The prefix stays quoted so glob metacharacters in TMPDIR (a literal "[" is
  # enough) can't turn the path itself into a pattern.
  for dir in "$lock_dir".stale.*; do
    [[ -d "$dir" ]] || continue
    # Undeletable litter (foreign owner in a shared /tmp, read-only mode) must
    # not print on every future run.
    pid_is_live "$(read_owner_pid "$dir")" || rm -rf "$dir" 2>/dev/null || true
  done
  eval "$had_nullglob" || true
  eval "$had_failglob" || true
}

acquire_lock() {
  local attempt owner stale_dir
  lock_failure_reason=""
  sweep_stale_dirs
  for attempt in 1 2 3; do
    try_claim && return 0

    owner="$(await_owner_pid "$lock_dir")"

    # A live owner always wins, and we never touch its lock.
    if pid_is_live "$owner"; then
      lock_failure_reason="busy"
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
        lock_failure_reason="busy"
        return 1
      fi
      rm -rf "$stale_dir" 2>/dev/null || true
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
