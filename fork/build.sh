#!/usr/bin/env bash
# Build the fork as "T3 Code (Fork).app" (arm64), then install it (fork/install.sh).
# The fork ships no update feed, so it never replaces itself with an official build.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

. "$HOME/.config/vite-plus/env"
. "$HOME/.cargo/env"
[ -f .env ] || cp .env.example .env
unset T3CODE_DESKTOP_UPDATE_REPOSITORY GITHUB_REPOSITORY

base="$(git describe --tags --abbrev=0 --match 'v*-nightly.*' HEAD | sed -E 's/^v//; s/-nightly.*//')"
export T3CODE_DESKTOP_VERSION="${base}-fork.$(date +%Y%m%d).$(git rev-parse --short=7 HEAD)"
echo "Building T3 Code (Fork) $T3CODE_DESKTOP_VERSION"

vp i
vp run dist:desktop:dmg:arm64

exec "$(dirname "$0")/install.sh"
