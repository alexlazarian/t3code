#!/usr/bin/env bash
# Rebase the fork's commits onto the newest upstream nightly tag.
# Usage: fork/sync.sh [tag]   (defaults to the newest v*-nightly.* tag)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

git fetch upstream --tags --force --quiet
target="${1:-$(git tag -l 'v*-nightly.*' --sort=-creatordate | head -1)}"
current="$(git describe --tags --abbrev=0 --match 'v*-nightly.*' HEAD 2>/dev/null || echo none)"

if [ "$target" = "$current" ]; then
  echo "Already on $target."
  exit 0
fi

echo "Rebasing $(git branch --show-current) from $current onto $target"
if [ "$current" = none ]; then
  git rebase "$target"
else
  git rebase --onto "$target" "$current"
fi
echo "Done. Run 'vp i' if dependencies changed, then fork/build.sh."
echo "Push with: git push --force-with-lease origin $(git branch --show-current)"
