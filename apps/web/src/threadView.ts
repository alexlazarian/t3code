import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ThreadView } from "@t3tools/contracts/settings";
import { type AnyRouter, useRouter } from "@tanstack/react-router";

import { updateClientSettings } from "./hooks/useSettings";
import { readThreadShells } from "./state/entities";
import { buildThreadRouteParams } from "./threadRoutes";

export function isOverviewPathname(pathname: string): boolean {
  return pathname === "/overview";
}

type ThreadRouteRef = Parameters<typeof buildThreadRouteParams>[0];

interface VisitedShell {
  readonly environmentId: ThreadRouteRef["environmentId"];
  readonly id: ThreadRouteRef["threadId"];
  readonly archivedAt: unknown;
  readonly lastVisitedAt?: string | null | undefined;
}

export function pickLastVisitedThread(shells: ReadonlyArray<VisitedShell>): ThreadRouteRef | null {
  let latest: { ref: ThreadRouteRef; at: number } | null = null;
  for (const shell of shells) {
    if (shell.archivedAt !== null || !shell.lastVisitedAt) continue;
    const at = Date.parse(shell.lastVisitedAt);
    if (Number.isNaN(at) || (latest !== null && latest.at >= at)) continue;
    latest = { ref: { environmentId: shell.environmentId, threadId: shell.id }, at };
  }
  return latest?.ref ?? null;
}

// The thread both views show, for this app session only. A reload starts both views as before.
let currentThread: ThreadRouteRef | null = null;
let overviewSplitClosed = false;

const threadKeyOf = (ref: ThreadRouteRef) =>
  scopedThreadKey(scopeThreadRef(ref.environmentId, ref.threadId));

/** A thread route showed this thread. Returning to a thread already current is not a new open. */
export function noteThreadRouteOpened(ref: ThreadRouteRef): void {
  if (currentThread !== null && threadKeyOf(currentThread) === threadKeyOf(ref)) return;
  currentThread = ref;
  overviewSplitClosed = false;
}

export function noteOverviewSplitOpened(ref: ThreadRouteRef): void {
  currentThread = ref;
  overviewSplitClosed = false;
}

/** Hides the split; the thread stays current for List. */
export function noteOverviewSplitClosed(): void {
  overviewSplitClosed = true;
}

export function currentThreadKey(): string | null {
  return currentThread === null ? null : threadKeyOf(currentThread);
}

export function overviewSplitThreadKey(): string | null {
  return overviewSplitClosed ? null : currentThreadKey();
}

export function __resetCurrentThreadForTests(): void {
  currentThread = null;
  overviewSplitClosed = false;
}

export function pickListThread(shells: ReadonlyArray<VisitedShell>): ThreadRouteRef | null {
  const current = currentThread;
  if (
    current !== null &&
    shells.some(
      (shell) =>
        shell.environmentId === current.environmentId &&
        shell.id === current.threadId &&
        shell.archivedAt === null,
    )
  ) {
    return current;
  }
  return pickLastVisitedThread(shells);
}

export function switchThreadView(router: Pick<AnyRouter, "navigate">, view: ThreadView): void {
  void updateClientSettings({ threadView: view });
  if (view === "overview") {
    void router.navigate({ to: "/overview" });
    return;
  }
  const last = pickListThread(readThreadShells());
  if (last === null) {
    void router.navigate({ to: "/" });
    return;
  }
  void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(last) });
}

export function useSwitchThreadView(): (view: ThreadView) => void {
  const router = useRouter();
  return (view) => switchThreadView(router, view);
}
