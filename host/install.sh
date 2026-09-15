#!/usr/bin/env bash
# Registers the reference host with Chrome so the extension can reach it.
#
# YOU run this, not the extension and not its build. It writes one small JSON
# file into Chrome's own configuration directory, which is outside this
# repository — the only step of this project that touches anything there.
#
# Usage:
#   bash host/install.sh <extension-id> [--channel stable|canary|chromium]
#
# Find the extension id at chrome://extensions with developer mode on.
# An unpacked extension's id differs per profile, which is exactly why this
# takes it as an argument instead of the manifest pinning one (ADR 0009).
#
# Uninstall: delete the file this prints.
set -euo pipefail

HOST_NAME="dev.junueno.nobeef"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_PATH="${REPO_DIR}/host/no-beef-host.mjs"

EXT_ID="${1:-}"
if [ -z "$EXT_ID" ]; then
  echo "usage: bash host/install.sh <extension-id> [--channel stable|canary|chromium]" >&2
  exit 1
fi
if ! printf '%s' "$EXT_ID" | grep -Eq '^[a-p]{32}$'; then
  echo "ERROR: '${EXT_ID}' is not a Chrome extension id (32 letters a-p)." >&2
  exit 1
fi

CHANNEL="stable"
if [ "${2:-}" = "--channel" ]; then CHANNEL="${3:-stable}"; fi

case "$(uname -s)" in
  Darwin)
    case "$CHANNEL" in
      stable)   DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
      canary)   DIR="$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts" ;;
      chromium) DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts" ;;
      *) echo "ERROR: unknown channel '${CHANNEL}'." >&2; exit 1 ;;
    esac
    ;;
  Linux)
    case "$CHANNEL" in
      stable)   DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
      canary)   DIR="$HOME/.config/google-chrome-unstable/NativeMessagingHosts" ;;
      chromium) DIR="$HOME/.config/chromium/NativeMessagingHosts" ;;
      *) echo "ERROR: unknown channel '${CHANNEL}'." >&2; exit 1 ;;
    esac
    ;;
  *) echo "ERROR: unsupported platform $(uname -s)." >&2; exit 1 ;;
esac

if [ ! -x "$HOST_PATH" ]; then
  echo "ERROR: ${HOST_PATH} is missing or not executable." >&2
  exit 1
fi

mkdir -p "$DIR"
MANIFEST="${DIR}/${HOST_NAME}.json"
cat > "$MANIFEST" <<JSON
{
  "name": "${HOST_NAME}",
  "description": "no-beef bring-your-own-agent bridge",
  "path": "${HOST_PATH}",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${EXT_ID}/"]
}
JSON

echo "registered: ${MANIFEST}"
echo "  host:      ${HOST_PATH}"
echo "  extension: ${EXT_ID}"
echo
echo "Next: restart Chrome, then tick '端末内のエージェントを使う' in the extension's options."
echo "Without host/agent.config.json the host answers 'no opinion' to everything, which is"
echo "the correct way for it to behave until you point it at something."
