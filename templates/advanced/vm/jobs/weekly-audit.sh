#!/usr/bin/env bash
# weekly-audit.sh: collect live state, then let a cli-run lane draft the gap report.
# Rendered at install time: the install directory and the audit lane came from your selection.
#
# Guarantees this script makes, and how:
#   - every collection step is BOUNDED (a watchdog around curl and each --version probe)
#   - the previous successful report is NEVER truncated: output goes to a temp file and is
#     renamed into place only on a clean exit; failed output is kept beside it for diagnosis
#   - the lane runs with the strongest boundary it offers ({{AUDIT_LANE_BOUNDARY_NOTE}})
#   - rc 10/12/13 from cli-run means no report was produced; the timer's journal shows it
set -uo pipefail
INSTALL_DIR={{INSTALL_DIR_SH}}
AUDIT_LANE="{{AUDIT_LANE}}"
AUDIT_LANE_FLAGS="{{AUDIT_LANE_FLAGS}}"
PROBE_SECS="${PROBE_SECS:-10}"      # per collection probe
RUNNER_SECS="${RUNNER_SECS:-600}"   # the model call; TimeoutStartSec in the unit covers the whole job
{{AUDIT_LANE_GUARD}}
cd "$INSTALL_DIR" || { echo "weekly-audit: $INSTALL_DIR missing" >&2; exit 2; }
mkdir -p reports

# bounded SECS cmd...  : run cmd, and after SECS kill it AND every descendant
# (a probe that forks, or a stub that ignores its own flags, must not hold a
# pipe open). Process groups do not help here: bash disables job control inside
# pipeline subshells, so `kill -- -pid` would kill nothing. A recursive tree
# kill via pgrep works on macOS and Linux alike; `timeout(1)` is not on macOS.
killtree() {
  local p="$1" c
  for c in $(pgrep -P "$p" 2>/dev/null); do killtree "$c"; done
  kill -KILL "$p" 2>/dev/null
}
bounded() {
  local secs="$1"; shift
  ( "$@" ) & local pid=$!
  ( sleep "$secs"; killtree "$pid" ) >/dev/null 2>&1 & local wd=$!
  wait "$pid" 2>/dev/null; local rc=$?
  killtree "$wd" >/dev/null 2>&1; wait "$wd" 2>/dev/null
  return $rc
}

# The gateway key must be a single token: it is interpolated into curl's config
# grammar, and a quote or newline in it would become a second directive.
KEY="${GATEWAY_MASTER_KEY:-}"
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9._-]+$'; then
  echo "weekly-audit: GATEWAY_MASTER_KEY must match ^[A-Za-z0-9._-]+$ (generate it with: openssl rand -hex 32)" >&2
  exit 2
fi

DATE="$(date -u +%F)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
{
  echo "# live state $DATE"; echo
  echo "## gateway lanes"
  if [ -n "$KEY" ]; then
    # The key never enters argv: curl reads the header from a 0600 config file that
    # exists only for this probe. curl's own timeouts AND the watchdog bound it.
    CFG="$(umask 077 && mktemp "${TMPDIR:-/tmp}/audit-curl-XXXXXX")"
    printf 'header = "Authorization: Bearer %s"\n' "$KEY" > "$CFG"
    if ! bounded "$PROBE_SECS" curl -s --connect-timeout 5 --max-time "$PROBE_SECS" --max-filesize 1048576 --config "$CFG" http://127.0.0.1:4000/v1/models \
      | jq -r '.data[].id' 2>/dev/null; then
      echo "UNVERIFIED: gateway unreachable or timed out within ${PROBE_SECS}s"
    fi
    rm -f "$CFG"
  else
    echo "UNVERIFIED: GATEWAY_MASTER_KEY not set; gateway not queried"
  fi
  echo; echo "## timers"
  bounded "$PROBE_SECS" systemctl --user list-timers --no-pager 2>/dev/null || echo "UNVERIFIED: systemd user session unavailable or timed out"
  echo; echo "## cli versions"
  for b in claude codex agy grok hermes qwen; do
    if command -v "$b" >/dev/null 2>&1; then
      printf '%s ' "$b"
      bounded "$PROBE_SECS" "$b" --version 2>/dev/null | head -1 || echo "UNVERIFIED: --version timed out after ${PROBE_SECS}s"
    fi
  done
} > "reports/live-state-$STAMP.md"
ln -sfn "live-state-$STAMP.md" reports/live-state.md

# The brief the lane actually reads: the protocol, the intended configuration,
# and the live state it is meant to diff against.
BRIEF="reports/audit-brief-$STAMP.md"
{
  echo "## Task bundle"
  echo "**Purpose.** Weekly gap analysis: compare the live state below with the intended configuration and name what is missing, dead, or drifted."
  echo "**Task class.** read_only"
  echo "**Denied actions.** Do not run commands, do not modify files, do not call any network service. Enforcement: {{AUDIT_LANE_BOUNDARY_NOTE}}."
  echo "**Report contract.** A ranked list of gaps (what is missing, where it should be, evidence line), then a CLEAN line per area with no gap, then what you could not assess. Treat every UNVERIFIED line below as unknown, never as clean."
  echo "**Exit parameters.** Stop after one pass over the three sections below."
  echo; echo "# Protocol"; cat protocols/gap-analysis.md
  echo; echo "# Intended configuration"; cat DELEGATION_MATRIX.md 2>/dev/null || cat ORCHESTRATOR.md
  echo; echo "# Live state"; cat "reports/live-state-$STAMP.md"
} > "$BRIEF"

# Write to a temp file; the dated report is replaced only by a clean, non-empty run.
FINAL="reports/audit-$DATE.md"
TMP="$(mktemp "reports/.audit-$STAMP-XXXXXX")"
# shellcheck disable=SC2086
node bin/cli-run.mjs "$AUDIT_LANE" $AUDIT_LANE_FLAGS --brief "$BRIEF" --timeout "$RUNNER_SECS" --quiet < /dev/null > "$TMP"
rc=$?
if [ "$rc" -eq 0 ] && [ -s "$TMP" ]; then
  mv -f "$TMP" "$FINAL"
  echo "audit rc=0 lane=$AUDIT_LANE report=$FINAL"
else
  FAILED="reports/failed-audit-$STAMP-rc$rc.md"
  mv -f "$TMP" "$FAILED" 2>/dev/null || rm -f "$TMP"
  echo "audit rc=$rc lane=$AUDIT_LANE; previous report kept; partial output (if any) at $FAILED" >&2
fi
exit $rc
