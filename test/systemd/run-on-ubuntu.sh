#!/usr/bin/env bash
# Exercise the GENERATED weekly-audit job under real systemd on Ubuntu.
#
# #11 left this open: "Exercise generated job failure behaviour on Ubuntu,
# including permissions, timeout cleanup, report preservation, and missing
# environment/configuration." Until now TimeoutStartSec and KillMode were
# asserted as text only, never run.
#
# Three claims, each proved or disproved by running the real script as a real
# systemd unit with stub lanes:
#   A  timeout cleanup: on TimeoutStartSec expiry the whole cgroup dies, so a
#      grandchild the lane spawned does not survive
#   B  report preservation: a failed rerun never truncates the previous report,
#      and the partial output is kept beside it
#   C  missing/invalid configuration: a malformed gateway key exits 2 before any
#      report is touched
set -uo pipefail
ROOT="$HOME/orch-systemd-test"
INSTALL="$ROOT/install"
UNIT_DIR="$HOME/.config/systemd/user"
pass=0; fail=0
ok(){ echo "  PASS  $*"; pass=$((pass+1)); }
no(){ echo "  FAIL  $*"; fail=$((fail+1)); }

# Clean only the generated install: weekly-audit.src and this harness live in
# $ROOT and deleting them here would silently invalidate the whole run.
rm -rf "$INSTALL" "$ROOT/grandchild.pid"; mkdir -p "$INSTALL/bin" "$INSTALL/protocols" "$INSTALL/reports" "$UNIT_DIR"
[ -s "$ROOT/weekly-audit.src" ] || { echo "FATAL: $ROOT/weekly-audit.src missing or empty; nothing to test"; exit 2; }

# Minimal files the brief assembly reads.
echo "# gap analysis protocol (stub)" > "$INSTALL/protocols/gap-analysis.md"
echo "# orchestrator (stub)"          > "$INSTALL/ORCHESTRATOR.md"

# The real generated job, with its INSTALL_DIR repointed at this box.
sed "s|^INSTALL_DIR=.*|INSTALL_DIR='$INSTALL'|" "$ROOT/weekly-audit.src" > "$INSTALL/vm-weekly-audit.sh"
chmod +x "$INSTALL/vm-weekly-audit.sh"

# Stub lane runner. MODE picks the behaviour; nothing here calls a vendor.
cat > "$INSTALL/bin/cli-run.mjs" <<'STUB'
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const mode = process.env.STUB_MODE || 'ok';
if (mode === 'hang') {
  // A grandchild that deliberately outlives its parent. If the cgroup kill
  // works, systemd takes this too; if only the direct child were killed, this
  // would survive and the claim in the unit would be false.
  const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' });
  c.unref();
  writeFileSync(process.env.STUB_PIDFILE, String(c.pid));
  setInterval(() => {}, 1 << 30); // hang forever
} else if (mode === 'fail') {
  process.stdout.write('PARTIAL OUTPUT, run did not finish\n');
  process.exit(10); // NO_DELIVERABLE
} else {
  process.stdout.write('# audit report\nfresh content\n');
  process.exit(0);
}
STUB

write_unit(){ # $1 = TimeoutStartSec
cat > "$UNIT_DIR/orch-audit-test.service" <<UNIT
[Unit]
Description=orchestrator generated weekly audit (test)
[Service]
Type=oneshot
WorkingDirectory=$INSTALL
Environment=STUB_MODE=${STUB_MODE:-ok}
Environment=STUB_PIDFILE=$ROOT/grandchild.pid
Environment=GATEWAY_MASTER_KEY=${GATEWAY_MASTER_KEY:-}
ExecStart=/bin/bash $INSTALL/vm-weekly-audit.sh
TimeoutStartSec=$1
KillMode=control-group
UNIT
systemctl --user daemon-reload
}

run_unit(){ systemctl --user reset-failed orch-audit-test.service 2>/dev/null; systemctl --user start orch-audit-test.service 2>/dev/null; }
wait_done(){ local i=0; while systemctl --user is-active --quiet orch-audit-test.service && [ $i -lt 120 ]; do sleep 1; i=$((i+1)); done; }

echo "systemd: $(systemctl --version | head -1)"
echo "os:      $(. /etc/os-release; echo "$PRETTY_NAME")"
echo

echo "A. timeout cleanup (TimeoutStartSec + KillMode=control-group)"
rm -f "$ROOT/grandchild.pid"
STUB_MODE=hang write_unit 15
run_unit; wait_done
GP="$(cat "$ROOT/grandchild.pid" 2>/dev/null || echo)"
RES="$(systemctl --user show orch-audit-test.service -p Result --value)"
[ "$RES" = "timeout" ] && ok "unit result is 'timeout' (got: $RES)" || no "expected Result=timeout, got '$RES'"
if [ -n "$GP" ]; then
  sleep 2
  if kill -0 "$GP" 2>/dev/null; then no "grandchild $GP SURVIVED the timeout: cgroup kill did not reach it"; kill -9 "$GP" 2>/dev/null
  else ok "grandchild $GP was killed with the cgroup"; fi
else no "stub never recorded a grandchild pid"; fi
echo

echo "B. report preservation on a failed rerun"
DATE="$(date -u +%F)"
printf 'PREVIOUS GOOD REPORT\ndo not truncate me\n' > "$INSTALL/reports/audit-$DATE.md"
BEFORE="$(sha256sum "$INSTALL/reports/audit-$DATE.md" | cut -d' ' -f1)"
STUB_MODE=fail write_unit 120
run_unit; wait_done
AFTER="$(sha256sum "$INSTALL/reports/audit-$DATE.md" | cut -d' ' -f1)"
[ "$BEFORE" = "$AFTER" ] && ok "previous report byte-identical after a failed run" || no "previous report CHANGED"
FAILED="$(ls "$INSTALL"/reports/failed-audit-*rc10.md 2>/dev/null | head -1)"
[ -n "$FAILED" ] && ok "partial output kept at $(basename "$FAILED")" || no "no failed-audit-*rc10.md kept"
[ -n "$FAILED" ] && grep -q 'PARTIAL OUTPUT' "$FAILED" && ok "kept file contains the partial output" || no "kept file missing partial output"
# A timed-out run (test A) orphans its temp file: SIGKILL leaves no cleanup path.
# That is expected and swept on a later run (test E). What must hold here is that
# the FAILED-but-not-killed run moved its own temp to failed-*, leaving none of its own.
STAMP_B="$(basename "$FAILED" 2>/dev/null | sed 's/^failed-audit-//; s/-rc10\.md$//')"
if [ -n "$STAMP_B" ] && ls "$INSTALL"/reports/.audit-"$STAMP_B"-* >/dev/null 2>&1; then
  no "the failed run left its own temp file behind"
else ok "the failed run left no temp file of its own"; fi
echo

echo "C. invalid gateway configuration (key fails ^[A-Za-z0-9._-]+$)"
BEFORE2="$(sha256sum "$INSTALL/reports/audit-$DATE.md" | cut -d' ' -f1)"
STUB_MODE=ok GATEWAY_MASTER_KEY='badkey!nope' write_unit 120
run_unit; wait_done
CODE="$(systemctl --user show orch-audit-test.service -p ExecMainStatus --value)"
[ "$CODE" = "2" ] && ok "exits 2 on a malformed key (got: $CODE)" || no "expected exit 2, got '$CODE'"
AFTER2="$(sha256sum "$INSTALL/reports/audit-$DATE.md" | cut -d' ' -f1)"
[ "$BEFORE2" = "$AFTER2" ] && ok "report untouched when configuration is rejected" || no "report changed on a config failure"
echo

echo "D. clean run replaces the report"
STUB_MODE=ok GATEWAY_MASTER_KEY= write_unit 120
run_unit; wait_done
grep -q 'fresh content' "$INSTALL/reports/audit-$DATE.md" && ok "a clean run does replace the dated report" || no "clean run did not write the report"
echo

echo "E. an aged orphan temp file is swept by the next run"
ORPHAN="$INSTALL/reports/.audit-19990101T000000Z-orphan"
: > "$ORPHAN"; touch -d '3 days ago' "$ORPHAN"
FRESH="$INSTALL/reports/.audit-29990101T000000Z-fresh"
: > "$FRESH"
STUB_MODE=ok GATEWAY_MASTER_KEY= write_unit 120
run_unit; wait_done
[ -e "$ORPHAN" ] && no "aged orphan survived the sweep" || ok "aged orphan removed"
[ -e "$FRESH" ] && ok "a temp from a possibly-live run is NOT swept" || no "the sweep removed a fresh temp file"
rm -f "$FRESH"
echo

systemctl --user stop orch-audit-test.service 2>/dev/null
rm -f "$UNIT_DIR/orch-audit-test.service"; systemctl --user daemon-reload
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
