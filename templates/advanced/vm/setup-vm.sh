#!/usr/bin/env bash
# setup-vm.sh: idempotent setup for a fresh Ubuntu box.
# Installs system deps and the npm-installable agent CLIs.
# PRINTS the vendor shell installers for the rest; never pipes a remote script into bash for you.
# Never writes a secret. Sign-ins are the vendors' own device-code flows.
set -euo pipefail

say() { printf '\n[setup-vm] %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Run this phase explicitly after the dependency setup, sign-ins and secret injection.
# The package installer only writes this script; it never invokes either phase.
if [ "${1:-}" = "--start-services" ]; then
  LOCAL_MODEL={{VM_LOCAL_MODEL_SH}}
  KEY="${GATEWAY_MASTER_KEY:-}"
  if [[ ! "$KEY" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo 'setup-vm: GATEWAY_MASTER_KEY must match ^[A-Za-z0-9._-]+$' >&2
    exit 2
  fi
  for cmd in docker curl jq; do
    have "$cmd" || { echo "setup-vm: install $cmd before --start-services" >&2; exit 1; }
  done
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  docker compose up -d
  if [ -n "$LOCAL_MODEL" ]; then
    ready=0
    for attempt in {1..12}; do
      if docker compose exec -T ollama ollama list >/dev/null 2>&1; then ready=1; break; fi
      sleep 5
    done
    [ "$ready" -eq 1 ] || { echo 'setup-vm: Ollama service did not become ready' >&2; exit 1; }
    docker compose exec -T ollama ollama pull "$LOCAL_MODEL"
    ready=0
    for attempt in {1..12}; do
      # The key goes to curl on stdin, never argv, a file or printed output.
      # A model list alone proves only that an alias is configured, not that it can answer.
      if printf 'header = "Authorization: Bearer %s"\n' "$KEY" | \
        curl --silent --fail --connect-timeout 5 --max-time 60 --config - \
          --header 'Content-Type: application/json' \
          --data '{"model":"local-small","messages":[{"role":"user","content":"Say ready."}],"max_tokens":16,"stream":false}' \
          http://127.0.0.1:4000/v1/chat/completions | \
        jq -e '.choices[0].message.content | type == "string" and length > 0' >/dev/null 2>&1; then
        ready=1; break
      fi
      sleep 5
    done
    [ "$ready" -eq 1 ] || { echo 'setup-vm: local-small inference did not become ready; inspect docker compose logs' >&2; exit 1; }
    say 'local-small inference verified'
  fi
  say 'services started; see jobs/README.md for the scheduled job'
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo 'usage: bash setup-vm.sh [--start-services]' >&2
  exit 2
fi

say "system packages"
sudo apt-get update -y
sudo apt-get install -y curl git tmux jq ca-certificates gnupg build-essential \
  dbus-x11 libsecret-1-0 gnome-keyring   # a keyring, or headless CLIs re-prompt for auth on every launch

if ! have node; then
  say "node 22: download the NodeSource setup script, read it, then run it yourself:"
  say "  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh && less /tmp/nodesource.sh"
  say "  sudo -E bash /tmp/nodesource.sh && sudo apt-get install -y nodejs"
  exit 1
fi
say "node present: $(node -v)"

if ! have docker; then
  say "docker: follow https://docs.docker.com/engine/install/ubuntu/ (read the script before running it), then re-run this script"
else
  say "docker present: $(docker --version)"
fi

say "npm-installable CLIs (installed only if missing)"
# Versions are pinned to what this installer was released with. Check for newer before trusting a pin forever.
for pkg in {{NPM_PACKAGES}}; do
  [ -z "$pkg" ] && continue   # nothing npm-installable was selected
  case "$pkg" in
    @anthropic-ai/claude-code*) bin=claude ;;
    @openai/codex*) bin=codex ;;
    @qwen-code/qwen-code*) bin=qwen ;;
    *) bin="${pkg##*/}"; bin="${bin%%@*}" ;;
  esac
  if have "$bin"; then say "$bin present"; else say "npm install -g $pkg"; npm install -g "$pkg"; fi
done

say "vendor shell installers (read, then run yourself):"
{{VM_SCRIPT_INSTALLERS}}

say "next: sign in to each CLI inside tmux (device-code flows), inject the names in ENVIRONMENT.md, then: bash setup-vm.sh --start-services"
