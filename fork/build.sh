#!/usr/bin/env bash
# Build the fork as "T3 Code (Fork).app" (arm64), then install it (fork/install.sh).
# The fork ships no update feed, so it never replaces itself with an official build.
#   fork/build.sh               build and install
#   fork/build.sh --build-only  build the dmg into release/ and stop
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

install=1
case "${1:-}" in
  "") ;;
  --build-only) install=0 ;;
  *) echo "Usage: fork/build.sh [--build-only]" >&2; exit 1 ;;
esac

. "$HOME/.config/vite-plus/env"
. "$HOME/.cargo/env"
[ -f .env ] || cp .env.example .env
unset T3CODE_DESKTOP_UPDATE_REPOSITORY GITHUB_REPOSITORY

base="$(git describe --tags --abbrev=0 --match 'v*-nightly.*' HEAD | sed -E 's/^v//; s/-nightly.*//')"
export T3CODE_DESKTOP_VERSION="${base}-fork.$(date +%Y%m%d).$(git rev-parse --short=7 HEAD)"
echo "Building T3 Code (Fork) $T3CODE_DESKTOP_VERSION"

vp i
vp run dist:desktop:dmg:arm64

if [ "$install" = 0 ]; then
  echo "Built $(ls -t release/*-arm64.dmg | head -1). Install with fork/install.sh."
  exit 0
fi
exec "$(dirname "$0")/install.sh"
