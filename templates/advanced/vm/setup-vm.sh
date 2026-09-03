#!/usr/bin/env bash
# setup-vm.sh: idempotent setup for a fresh Ubuntu box.
# Installs system deps and the npm-installable agent CLIs.
# PRINTS the vendor shell installers for the rest; never pipes a remote script into bash for you.
# Never writes a secret. Sign-ins are the vendors' own device-code flows.
set -euo pipefail

say() { printf '\n[setup-vm] %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

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
for pkg in {{NPM_PACKAGES}}; do
  [ -z "$pkg" ] && continue   # nothing npm-installable was selected
  case "$pkg" in
    @anthropic-ai/claude-code) bin=claude ;;
    @openai/codex) bin=codex ;;
    @qwen-code/qwen-code) bin=qwen ;;
    *) bin="${pkg##*/}" ;;
  esac
  if have "$bin"; then say "$bin present"; else say "npm install -g $pkg"; npm install -g "$pkg"; fi
done

say "vendor shell installers (read, then run yourself):"
{{SCRIPT_INSTALLERS}}

say "next: sign in to each CLI inside tmux (device-code flows), export the names in ENVIRONMENT.md, then: docker compose up -d"
