#!/usr/bin/env bash
# Merge the newest upstream nightly into fork-main through a sync/<tag> worktree. See fork/README.md.
#   fork/sync.sh [--new] [tag]   start or resume a sync: merge, then check and build (no install)
#   fork/sync.sh land [--accept-failures]
#                                fast-forward fork-main to the checked sync branch and clean up
# Never rebases, never force-pushes, never touches the shared checkout's branch.
set -euo pipefail

BRANCH=fork-main
root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
cd "$root"
. "$HOME/.config/vite-plus/env"

die() { echo "ERROR: $*" >&2; exit 1; }
has_branch() { git show-ref -q --verify "refs/heads/$1"; }
has_tag() { git show-ref -q --verify "refs/tags/$1"; }
checked_out_at() {
  git worktree list --porcelain | awk -v ref="branch refs/heads/$1" '/^worktree /{wt=substr($0,10)} $0==ref{print wt}'
}

mode=start new=0 accept=0 tag=""
for arg in "$@"; do
  case "$arg" in
    land) mode=land ;;
    --new) new=1 ;;
    --accept-failures) accept=1 ;;
    -*) die "unknown option $arg" ;;
    *) tag="$arg" ;;
  esac
done

has_branch "$BRANCH" || die "branch $BRANCH does not exist."

if [ "$mode" = start ]; then
  git fetch upstream --tags --quiet
  git fetch origin --quiet
  # main is a pure mirror of upstream/main: fast-forward only, never commit to it.
  git merge-base --is-ancestor main upstream/main || die "main has commits that upstream/main lacks. Fix that by hand."
  [ -z "$(checked_out_at main)" ] || die "main is checked out somewhere. It must stay a mirror; check out another branch there."
  git fetch --quiet . upstream/main:main
  git push --quiet origin main
fi

tag="${tag:-$(git tag -l 'v*-nightly.*' --merged upstream/main --sort=-creatordate | head -1)}"
has_tag "$tag" || die "tag $tag not found."

# Newest existing attempt for this tag: sync/<tag>, then sync/<tag>-2, -3, ...
latest="" next="sync/$tag" n=1
while has_branch "$next"; do latest="$next"; n=$((n + 1)); next="sync/$tag-$n"; done

if git merge-base --is-ancestor "$tag" "$BRANCH"; then
  echo "$BRANCH already contains $tag. Nothing to do."
  exit 0
fi

if [ "$mode" = land ]; then
  [ -n "$latest" ] || die "no sync branch for $tag. Run fork/sync.sh first."
  sync="$latest"
elif [ -n "$latest" ] && [ "$new" = 0 ]; then
  sync="$latest"
  echo "Resuming $sync"
else
  sync="$next"
fi
wt="$(checked_out_at "$sync")"
[ -n "$wt" ] || wt="$(dirname "$root")/t3code-${sync//\//-}"
logs="$wt/.t3/sync"

if [ "$mode" = land ]; then
  [ -d "$wt" ] || die "worktree $wt is missing."
  [ -z "$(git -C "$wt" status --porcelain --untracked-files=no)" ] || die "$wt has uncommitted changes."
  head="$(git rev-parse "$sync")"
  if [ "$(cat "$logs/passed" 2>/dev/null)" != "$head" ]; then
    [ "$(cat "$logs/checked" 2>/dev/null)" = "$head" ] || die "$sync was not checked at its current commit. Run fork/sync.sh."
    [ "$accept" = 1 ] || die "checks failed on $sync (logs in $logs). Land anyway only after confirming each failure also fails on $tag or on the previous $BRANCH: fork/sync.sh land --accept-failures"
  fi
  git merge-base --is-ancestor "$BRANCH" "$sync" ||
    die "$BRANCH has new commits. In $wt run 'git merge $BRANCH', then fork/sync.sh to re-check."
  git merge-base --is-ancestor "$tag" "$sync" || die "$sync does not contain $tag."

  live="$(checked_out_at "$BRANCH")"
  if [ -n "$live" ]; then
    git -C "$live" merge --ff-only "$sync"
  else
    git update-ref "refs/heads/$BRANCH" "$sync" "$(git rev-parse "$BRANCH")"
  fi
  git push origin "$BRANCH"

  dmg="$(ls -t "$wt"/release/*-arm64.dmg 2>/dev/null | head -1 || true)"
  if [ -n "$dmg" ]; then
    mkdir -p "$root/release"
    cp "$dmg" "$root/release/"
    dmg="$root/release/$(basename "$dmg")"
  fi
  # Only untracked build output and node_modules remain; tracked files were checked clean above.
  git worktree remove --force "$wt"
  git branch -d "$sync"
  echo "Landed $tag on $BRANCH."
  [ -n "$dmg" ] && echo "Install:  fork/install.sh '$dmg'   (quit T3 Code (Fork) first)"
  echo "Then refresh the service from a normal Terminal: ~/.t3/fork-service/refresh-runtime.sh --check"
  exit 0
fi

if ! has_branch "$sync"; then
  backup="backup/$BRANCH-before-$tag" i=2
  while has_tag "$backup" && [ "$(git rev-parse "$backup^{commit}")" != "$(git rev-parse "$BRANCH")" ]; do
    backup="backup/$BRANCH-before-$tag-$i"; i=$((i + 1))
  done
  has_tag "$backup" || git tag "$backup" "$BRANCH"
  git push --quiet origin "refs/tags/$backup"
  echo "Backed up $BRANCH as tag $backup"
  git worktree add -b "$sync" "$wt" "$BRANCH"
elif [ ! -d "$wt" ]; then
  git worktree add "$wt" "$sync"
fi
cd "$wt"
[ -f .env ] || [ ! -f "$root/.env" ] || cp "$root/.env" .env

if [ -f "$(git rev-parse --git-path MERGE_HEAD)" ]; then
  if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
    echo "Merge of $tag in $wt still has conflicts:"
    git diff --name-only --diff-filter=U | sed 's/^/  /'
  else
    echo "Conflicts in $wt are resolved but not committed."
  fi
  echo "Resolve by keeping upstream's version and re-applying the fork's behavior on top."
  echo "Commit with every conflicted file and its resolution in the message, then rerun fork/sync.sh."
  exit 2
fi

if ! git merge-base --is-ancestor "$tag" HEAD; then
  echo "Merging $tag into $sync in $wt"
  if ! git merge --no-ff --no-edit -m "Merge upstream $tag into $BRANCH" "$tag"; then
    {
      echo "Merge upstream $tag into $BRANCH"
      echo
      echo "Conflicts (kept upstream, re-applied fork behavior on top):"
      git diff --name-only --diff-filter=U | sed 's/^/- /; s/$/: TODO how it was resolved/'
    } >"$(git rev-parse --git-path MERGE_MSG)"
    echo
    echo "Conflicts to resolve in $wt (a message template is in MERGE_MSG):"
    git diff --name-only --diff-filter=U | sed 's/^/  /'
    echo "Resolve, commit, then rerun fork/sync.sh."
    exit 2
  fi
fi

head="$(git rev-parse HEAD)"
if [ "$(cat "$logs/passed" 2>/dev/null)" = "$head" ]; then
  echo "$sync already passed its checks at $head. Land with: fork/sync.sh land"
  exit 0
fi

mkdir -p "$logs"
rm -f "$logs/passed" "$logs/checked"
failed=()
step() {
  local name="$1"; shift
  printf '%-10s ' "$name"
  if "$@" >"$logs/$name.log" 2>&1; then echo ok; else echo "FAILED  $logs/$name.log"; failed+=("$name"); fi
}
echo "Checking $sync at $(git rev-parse --short HEAD)"
step install vp i
step fmt vp run fmt:check
step lint vp run lint
step knip vp run knip:check
step typecheck vp run typecheck
step test vp run -r --log grouped test
step build fork/build.sh --build-only
echo "$head" >"$logs/checked"

if [ "${#failed[@]}" = 0 ]; then
  echo "$head" >"$logs/passed"
  echo "All checks passed. Land with: fork/sync.sh land"
else
  echo
  echo "Failed: ${failed[*]}"
  echo "A failure blocks only if it passes on both $tag and the previous $BRANCH ($(git rev-parse --short "$BRANCH"))."
  echo "Compare them (see fork/README.md), fix the fork-caused ones here, commit, and rerun fork/sync.sh."
  echo "If every remaining failure is pre-existing: fork/sync.sh land --accept-failures"
  exit 1
fi
