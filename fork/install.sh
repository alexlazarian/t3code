#!/usr/bin/env bash
# Install a built dmg (default: the newest in release/) as /Applications/T3 Code (Fork).app. Quit the app first.
#   fork/install.sh [path/to.dmg]
set -euo pipefail
dmg="${1:+$(cd "$(dirname "$1")" && pwd)/$(basename "$1")}"
cd "$(git rev-parse --show-toplevel)"

if pgrep -f 'T3 Code \(Fork\)\.app/Contents/MacOS' >/dev/null; then
  echo "T3 Code (Fork) is running. Quit it, then run fork/install.sh again." >&2
  exit 1
fi

dmg="${dmg:-$(ls -t release/*-arm64.dmg | head -1)}"
[ -f "$dmg" ] || { echo "No dmg found at ${dmg:-release/}." >&2; exit 1; }
mount="$(hdiutil attach -nobrowse -readonly "$dmg" | tail -1 | cut -f3)"
rm -rf "/Applications/T3 Code (Fork).app"
cp -R "$mount/T3 Code (Fork).app" /Applications/
hdiutil detach "$mount" -quiet
xattr -dr com.apple.quarantine "/Applications/T3 Code (Fork).app" 2>/dev/null || true
echo "Installed $(basename "$dmg") as /Applications/T3 Code (Fork).app"
