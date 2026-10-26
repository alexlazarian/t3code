#!/usr/bin/env bash
# Install the newest built dmg as /Applications/T3 Code (Fork).app. Quit the app first.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if pgrep -f 'T3 Code \(Fork\)\.app/Contents/MacOS' >/dev/null; then
  echo "T3 Code (Fork) is running. Quit it, then run fork/install.sh again." >&2
  exit 1
fi

dmg="$(ls -t release/*-arm64.dmg | head -1)"
mount="$(hdiutil attach -nobrowse -readonly "$dmg" | tail -1 | cut -f3)"
rm -rf "/Applications/T3 Code (Fork).app"
cp -R "$mount/T3 Code (Fork).app" /Applications/
hdiutil detach "$mount" -quiet
xattr -dr com.apple.quarantine "/Applications/T3 Code (Fork).app" 2>/dev/null || true
echo "Installed $(basename "$dmg") as /Applications/T3 Code (Fork).app"
