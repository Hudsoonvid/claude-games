#!/usr/bin/env bash
# Open Claude Arcade full-screen in a Chromium-family browser (Linux / macOS).
# Usage: arcade.sh [URL]   — with no URL it serves this checkout locally.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${1:-}"

if [ -z "$URL" ]; then
  PORT="${ARCADE_PORT:-8377}"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
  SERVER=$!
  trap 'kill "$SERVER" 2>/dev/null || true' EXIT
  sleep 0.6
  URL="http://127.0.0.1:$PORT/"
fi

FLAGS=(--kiosk --no-first-run --disable-pinch --overscroll-history-navigation=0 "--app=$URL")

for bin in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser; do
  if command -v "$bin" >/dev/null 2>&1; then "$bin" "${FLAGS[@]}"; exit 0; fi
done
for app in com.google.Chrome org.chromium.Chromium com.microsoft.Edge com.brave.Browser; do
  if command -v flatpak >/dev/null 2>&1 && flatpak info "$app" >/dev/null 2>&1; then
    flatpak run "$app" "${FLAGS[@]}"; exit 0
  fi
done
if [ "$(uname)" = "Darwin" ] && [ -d "/Applications/Google Chrome.app" ]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "${FLAGS[@]}"; exit 0
fi
echo "No Chromium-family browser found. Install Chrome or Chromium, or just open: $URL" >&2
exit 1
