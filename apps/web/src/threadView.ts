import type { ThreadView } from "@t3tools/contracts/settings";
import { type AnyRouter, useRouter } from "@tanstack/react-router";

import { updateClientSettings } from "./hooks/useSettings";
import { readThreadShells } from "./state/entities";
import { buildThreadRouteParams } from "./threadRoutes";

export function nextThreadView(current: ThreadView): ThreadView {
  return current === "list" ? "overview" : "list";
}

export function isOverviewPathname(pathname: string): boolean {
  return pathname === "/overview";
}

function readLastVisitedThread() {
  let latest: { ref: Parameters<typeof buildThreadRouteParams>[0]; at: number } | null = null;
  for (const shell of readThreadShells()) {
    if (shell.archivedAt !== null || !shell.lastVisitedAt) continue;
    const at = Date.parse(String(shell.lastVisitedAt));
    if (Number.isNaN(at) || (latest !== null && latest.at >= at)) continue;
    latest = { ref: { environmentId: shell.environmentId, threadId: shell.id }, at };
  }
  return latest?.ref ?? null;
}

export function switchThreadView(router: Pick<AnyRouter, "navigate">, view: ThreadView): void {
  void updateClientSettings({ threadView: view });
  if (view === "overview") {
    void router.navigate({ to: "/overview" });
    return;
  }
  const last = readLastVisitedThread();
  if (last === null) {
    void router.navigate({ to: "/" });
    return;
  }
  void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(last) });
}

/** @public Consumed by the view switch control in Task 5. */
export function useSwitchThreadView(): (view: ThreadView) => void {
  const router = useRouter();
  return (view) => switchThreadView(router, view);
}
