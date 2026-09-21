#!/usr/bin/env bash
# Re-records docs/demo.gif from the PUBLISHED package, so the frames are the
# program's own output and anyone can reproduce them.
#
#   bash scripts/record-demo.sh            # records the current published version
#   bash scripts/record-demo.sh 0.1.27     # pins a version
#
# Needs asciinema (the recorder) and agg (cast to GIF), both from the asciinema
# project: brew install asciinema agg
set -euo pipefail

VERSION="${1:-latest}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/docs/demo.gif"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for tool in asciinema agg npm; do
  command -v "$tool" >/dev/null || { echo "missing: $tool (brew install asciinema agg)" >&2; exit 1; }
done

# Installed locally first, so the recorded npx call resolves from node_modules
# and never stops on npx's own "Ok to proceed?" prompt mid-take.
cd "$WORK"
npm install --silent "model-orchestrator@$VERSION" >/dev/null

cat > "$WORK/take.sh" <<'TAKE'
#!/bin/bash
cd "$(dirname "$0")"
printf '~/my-app $ '
sleep 0.8
cmd='npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code --dry'
for (( i=0; i<${#cmd}; i++ )); do printf '%s' "${cmd:$i:1}"; sleep 0.022; done
sleep 0.6; printf '\n'
npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code --dry
printf '~/my-app $ '
sleep 2.5
TAKE
chmod +x "$WORK/take.sh"

asciinema rec --cols 108 --rows 34 --overwrite --command "$WORK/take.sh" "$WORK/demo.cast"
agg --theme monokai --font-size 16 --speed 1.3 --idle-time-limit 1.2 --last-frame-duration 3 \
  "$WORK/demo.cast" "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
