#!/usr/bin/env bash
# Launch the dedicated automation Chrome (CDP :9239) with the dev build of the
# extension loaded. Follows the agent-browser conventions (per-project port and
# profile; see ~/Documents/git/agent-browser/ports.local.md) but lives in this
# repo because agent-browser's launcher does not support --load-extension.
#
# Usage: bash scripts/launch-test-chrome.sh
# Close:  CLAUDE_BROWSER_CDP_PORT=9239 \
#         CLAUDE_BROWSER_CHROME_DATA=$HOME/.claude/claude-browser/chrome-data-nobeef \
#         bash ~/Documents/git/agent-browser/scripts/close-cdp-chrome.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${CLAUDE_BROWSER_CDP_PORT:-9239}"
DATA_DIR="${CLAUDE_BROWSER_CHROME_DATA:-$HOME/.claude/claude-browser/chrome-data-nobeef}"
EXT_DIR="${NOBEEF_EXT_DIR:-$REPO_DIR/.output/chrome-mv3}"

# Branded stable Chrome (observed on 152.x) silently ignores --load-extension,
# so we need Chrome for Testing / Chromium. Prefer an explicit override, then
# Playwright's cached Chrome for Testing, then a system Chromium.
find_chrome_bin() {
  if [ -n "${NOBEEF_CHROME_BIN:-}" ]; then
    echo "$NOBEEF_CHROME_BIN"
    return
  fi
  local candidate
  candidate=$(ls -d "$HOME/Library/Caches/ms-playwright"/chromium-*/chrome-mac*/*.app/Contents/MacOS/* 2>/dev/null | sort | tail -1)
  if [ -n "$candidate" ]; then
    echo "$candidate"
    return
  fi
  if [ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
    echo "/Applications/Chromium.app/Contents/MacOS/Chromium"
    return
  fi
  echo ""
}

CHROME_BIN="$(find_chrome_bin)"
if [ -z "$CHROME_BIN" ] || [ ! -x "$CHROME_BIN" ]; then
  echo "ERROR: no Chrome for Testing / Chromium found (stable Chrome ignores --load-extension)." >&2
  echo "  Install one (e.g. 'npx playwright install chromium') or set NOBEEF_CHROME_BIN." >&2
  exit 1
fi

if [ ! -f "$EXT_DIR/manifest.json" ]; then
  echo "ERROR: no build found at ${EXT_DIR}. Run 'npm run build' first." >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

# Chrome caches the extension's service worker script and, because the manifest
# version never changes between dev builds, happily keeps running the OLD one
# after `npm run build` — so verification silently measures stale code. (This
# really happened: a run "passed" on verdicts produced by a previous build.)
#
# The whole Service Worker directory goes, not just ScriptCache: removing the
# script while leaving its registration behind leaves the extension unable to
# start its worker at all. The cost is re-downloading the ~136MB ONNX model into
# CacheStorage, which the verification script already budgets time for.
# Set NOBEEF_KEEP_SW_CACHE=1 to skip this when re-running without a rebuild.
if [ "${NOBEEF_KEEP_SW_CACHE:-0}" != "1" ]; then
  rm -rf "${DATA_DIR}/Default/Service Worker"
  # The verdict cache goes too, for the same reason: a run that answers from
  # IndexedDB never reaches a single stage, so it measures nothing while looking
  # like a pass. Doing it here, with the browser closed, is the only reliable
  # way — CDP's Storage.clearDataForOrigin silently does nothing for a
  # chrome-extension:// origin, and driving IndexedDB from inside the worker
  # stalls against the connection the extension already holds open.
  rm -rf "${DATA_DIR}"/Default/IndexedDB/chrome-extension_*
fi

# Same unthrottle flags as agent-browser's launcher: an occluded window stops
# rendering and Playwright click/type times out (see its launch-cdp-chrome.sh).
# Launched via the binary directly (not `open`): the Playwright-cached app is
# not registered with LaunchServices.
LOG="${DATA_DIR}/launch-${PORT}.log"
nohup "$CHROME_BIN" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$DATA_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --load-extension="$EXT_DIR" \
  >"$LOG" 2>&1 &
disown || true

n=0
until curl -s -m 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; do
  n=$((n + 1))
  [ "$n" -ge 40 ] && { echo "ERROR: CDP did not respond on :${PORT} within 20s." >&2; exit 1; }
  sleep 0.5
done
echo "OK: Chrome with extension is up. CDP: http://127.0.0.1:${PORT}"
