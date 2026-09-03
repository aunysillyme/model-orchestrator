#!/usr/bin/env bash
# weekly-audit.sh: enumerate live state, then let a cli-run lane draft the gap report.
# Rendered at install time: the install directory and the audit lane below came from your selection.
# rc 10/12/13 means no report was produced; the timer's journal shows it.
set -uo pipefail
INSTALL_DIR={{INSTALL_DIR_SH}}
AUDIT_LANE="{{AUDIT_LANE}}"
{{AUDIT_LANE_GUARD}}
cd "$INSTALL_DIR" || { echo "weekly-audit: $INSTALL_DIR missing" >&2; exit 2; }
mkdir -p reports

# The gateway key must be a single token: it is interpolated into curl's config
# grammar, and a quote or newline in it would become a second directive.
KEY="${GATEWAY_MASTER_KEY:-}"
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9._-]+$'; then
  echo "weekly-audit: GATEWAY_MASTER_KEY must match ^[A-Za-z0-9._-]+$ (generate it with: openssl rand -hex 32)" >&2
  exit 2
fi

{
  echo "# live state $(date -u +%F)"; echo
  echo "## gateway lanes"
  if [ -n "$KEY" ]; then
    # The key never enters argv: curl reads the header from stdin.
    printf 'header = "Authorization: Bearer %s"\n' "$KEY" \
      | curl -s --config - http://127.0.0.1:4000/v1/models | jq -r '.data[].id' 2>/dev/null || echo "gateway unreachable"
  else
    echo "GATEWAY_MASTER_KEY not set; gateway not queried"
  fi
  echo; echo "## timers"; systemctl --user list-timers --no-pager 2>/dev/null || echo "systemd user session unavailable"
  echo; echo "## cli versions"
  for b in claude codex agy grok hermes qwen; do
    command -v "$b" >/dev/null 2>&1 && printf '%s ' "$b" && ("$b" --version 2>/dev/null | head -1 || echo unknown)
  done
} > reports/live-state.md

# The brief the lane actually reads: the protocol, the intended configuration,
# and the live state it is meant to diff against.
BRIEF="reports/audit-brief-$(date -u +%F).md"
{
  echo "## Task bundle"
  echo "**Purpose.** Weekly gap analysis: compare the live state below with the intended configuration and name what is missing, dead, or drifted."
  echo "**Task class.** read_only"
  echo "**Denied actions.** Do not run commands, do not modify files, do not call any network service."
  echo "**Report contract.** A ranked list of gaps (what is missing, where it should be, evidence line), then a CLEAN line per area with no gap, then what you could not assess."
  echo "**Exit parameters.** Stop after one pass over the three sections below."
  echo; echo "# Protocol"; cat protocols/gap-analysis.md
  echo; echo "# Intended configuration"; cat DELEGATION_MATRIX.md 2>/dev/null || cat ORCHESTRATOR.md
  echo; echo "# Live state"; cat reports/live-state.md
} > "$BRIEF"

node bin/cli-run.js "$AUDIT_LANE" --brief "$BRIEF" --timeout 600 --quiet < /dev/null > "reports/audit-$(date -u +%F).md"
rc=$?
echo "audit rc=$rc lane=$AUDIT_LANE"
exit $rc
