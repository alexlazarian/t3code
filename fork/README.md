# Fork maintenance

- `main` mirrors `upstream/main` and only ever fast-forwards. Never commit to it.
- `fork-main` is the fork's single long-lived line. Build and run from it.
- Upstream nightlies come in as merges, never rebases. Nothing is force-pushed.

## Sync with the newest nightly

```sh
fork/sync.sh          # start or resume; stops when it needs you
fork/sync.sh land     # after the checks pass
```

`fork/sync.sh` fast-forwards `main`, picks the newest `v*-nightly.*` tag on `upstream/main`, and exits if `fork-main` already contains it. Otherwise it tags `fork-main` as `backup/fork-main-before-<tag>` (pushed), creates `sync/<tag>` in the worktree `../t3code-sync-<tag>`, merges the tag there, and runs `vp i`, format, lint, knip, the full typecheck and test suites, and `fork/build.sh --build-only`. Logs go to `.t3/sync/` in that worktree. Rerunning resumes the same branch, even after a newer nightly appears; land it, then run again for the newer one. `fork/sync.sh --new` starts a fresh `sync/<tag>-2` and leaves the old attempt alone.

On conflicts it stops with a list and a `MERGE_MSG` template. Resolve each one by keeping upstream's version and re-applying the fork's behavior on top. Ask the owner when the fork's behavior can't be re-applied cleanly. List every conflicted file and its resolution in the merge commit, commit, and rerun `fork/sync.sh`.

A failed check blocks only if it passes on both the upstream tag and the previous `fork-main`. To compare, add a throwaway worktree next to the checkout, `git worktree add ../t3code-baseline <tag or backup tag>`, run `vp i` and the failing command there, then remove it. Fix failures the fork caused on the sync branch. Report pre-existing ones and leave upstream code alone. When only pre-existing failures remain, run `fork/sync.sh land --accept-failures`.

`land` fast-forwards `fork-main` (also when it is checked out), pushes it, copies the dmg to `release/`, removes the worktree, and deletes the sync branch. It refuses if `fork-main` moved since the sync started. In that case, merge `fork-main` into the sync branch and rerun `fork/sync.sh`.

## Things that recur

- Migrations: the fork owns ids 73 (`DropWebhookRelayDeliveries`) and 74 (`DropRelayScopes`). The migrator skips every id up to the highest recorded, so upstream migrations numbered 73 and up move behind the fork's: upstream `N` becomes `N + 2` (upstream 73 is the fork's 75). Update `reconcileV2PreviewMigration.test.ts` to match.
- The fork removed T3 Connect (relay, guest links, Clerk) and product analytics. Upstream edits to those files stay deleted, and new upstream references to them get dropped.
- Dialog footers have no `variant`. Replace upstream's `<DialogFooter variant="bare">` with `<DialogFooter>`.

## Build, install, refresh the service

```sh
fork/build.sh --build-only        # dmg into release/
fork/install.sh [path/to.dmg]     # quit T3 Code (Fork) first; default is the newest dmg in release/
fork/build.sh                     # build, then install
```

Then refresh the background service from a normal Terminal, outside T3: `~/.t3/fork-service/refresh-runtime.sh --check`, then without `--check`.
