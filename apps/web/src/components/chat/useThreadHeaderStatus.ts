import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { effectiveSnoozed, threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";

import { useNowAfter } from "../../hooks/useDeadline";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useUiStateStore } from "../../uiStateStore";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
} from "../Sidebar.logic";
import {
  isSidebarThreadCompleted,
  isSidebarThreadWoke,
  resolveSidebarStatusLabel,
} from "../sidebar/threadStatusLabel";
import { resolveThreadHeaderStatus, type ThreadHeaderStatus } from "./threadHeaderStatus.logic";

export function useThreadHeaderStatus(
  thread: EnvironmentThreadShell | null,
): ThreadHeaderStatus | null {
  const localLastVisitedAt = useUiStateStore((state) =>
    thread === null
      ? undefined
      : state.threadLastVisitedAtById[
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
        ],
  );
  // The wake deadline flips the snooze exactly; the minute keeps "left" from going stale.
  const wakeAtMs = Date.parse(thread?.snoozedUntil ?? "") || null;
  const nowMinute = useNowMinute();
  const nowMs = Math.max(useNowAfter(wakeAtMs), Date.parse(`${nowMinute}:00.000Z`));
  if (thread === null) return null;
  const now = new Date(nowMs);
  const nowIso = now.toISOString();
  const lastVisitedAt = resolveThreadLastVisitedAt(thread.lastVisitedAt, localLastVisitedAt);
  const live = resolveSidebarStatusLabel({
    status: resolveSidebarThreadStatus(thread),
    goalActive: thread.goal?.status === "active",
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    isUnread: hasUnseenCompletion({ ...thread, lastVisitedAt }),
    isCompleted: isSidebarThreadCompleted(thread),
    isWoke: isSidebarThreadWoke({
      wokeAt: threadWokeAt(thread, { now: nowIso }),
      lastVisitedAt,
      settledOverride: thread.settledOverride,
    }),
  });
  return resolveThreadHeaderStatus({
    live,
    snoozedUntil: effectiveSnoozed(thread, { now: nowIso }) ? (thread.snoozedUntil ?? null) : null,
    isSettled: thread.settledOverride === "settled",
    now,
  });
}
