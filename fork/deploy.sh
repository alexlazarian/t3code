#!/usr/bin/env bash
# Install a fork build and move the background service onto it, without prompts.
# Run from a normal Terminal, not inside T3: refreshing stops the service and every agent in it.
#   fork/deploy.sh            install the newest dmg in release/, then refresh the service
#   fork/deploy.sh --build    build this checkout first; it must be at fork-main
#   fork/deploy.sh <dmg>      install that dmg, then refresh the service
# The `t3-rebuild` shell function runs --build from the ../t3code-build worktree.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

APP="/Applications/T3 Code (Fork).app"
running() { pgrep -f 'T3 Code \(Fork\)\.app/Contents/MacOS' >/dev/null; }

build=0 dmg=""
for arg in "$@"; do
  case "$arg" in
    --build) build=1 ;;
    -*) echo "Usage: fork/deploy.sh [--build] [path/to.dmg]" >&2; exit 1 ;;
    *) dmg="$arg" ;;
  esac
done

if [ "$build" = 1 ]; then
  [ "$(git rev-parse HEAD)" = "$(git rev-parse fork-main)" ] ||
    { echo "--build builds this checkout, which is not at fork-main." >&2; exit 1; }
  fork/build.sh --build-only
  dmg="${dmg:-$(ls -t release/*-arm64.dmg | head -1)}"
fi

if running; then
  echo "Quitting T3 Code (Fork)"
  osascript -e "tell application \"$APP\" to quit"
  for _ in $(seq 1 30); do running || break; sleep 1; done
  running && { echo "T3 Code (Fork) is still running. Quit it and rerun." >&2; exit 1; }
fi
fork/install.sh ${dmg:+"$dmg"}
"$HOME/.t3/fork-service/refresh-runtime.sh" --yes
open "$APP"
