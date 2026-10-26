#!/usr/bin/env bash
# Build the fork as "T3 Code (Fork).app" (arm64) and install it into /Applications.
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

dmg="$(ls -t release/*"${T3CODE_DESKTOP_VERSION}"*arm64.dmg | head -1)"
mount="$(hdiutil attach -nobrowse -readonly "$dmg" | tail -1 | cut -f3)"
rm -rf "/Applications/T3 Code (Fork).app"
cp -R "$mount/T3 Code (Fork).app" /Applications/
hdiutil detach "$mount" -quiet
xattr -dr com.apple.quarantine "/Applications/T3 Code (Fork).app" 2>/dev/null || true
echo "Installed /Applications/T3 Code (Fork).app"
