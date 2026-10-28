import { useSyncExternalStore } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { inboxReturns, useSnoozeWakeClock } from "../Sidebar.logic";

// Keys predate the sidebar headers; the sidebar and Overview collapse these sections together.
export const PINNED_SECTION_EXPANDED_KEY = "t3code:overview:pinned-expanded";
export const ACTIVE_SECTION_EXPANDED_KEY = "t3code:overview:active-expanded";
export const SETTLED_SHELF_EXPANDED_KEY = "t3code:sidebar:settled-expanded";
export const SNOOZED_SHELF_EXPANDED_KEY = "t3code:sidebar:snoozed-expanded";
export const WORKING_SHELF_EXPANDED_KEY = "t3code:sidebar:working-expanded";
export const SIDEBAR_SHELF_EXPANDED_DEFAULT = false;
export const SETTLED_TAIL_INITIAL_COUNT = 10;
export const SETTLED_TAIL_PAGE_COUNT = 25;

export const SECTION_NOTES = {
  pinned: "Always at the top",
  working: "Running on their own, like subagents, PR watches and monitors",
  active: "What you're working on now",
  snoozed: "Hidden until they wake up",
  settled: "Done, kept for reference",
} as const;

export function useSidebarPartitionClockKey(
  threads: ReadonlyArray<{ readonly snoozedUntil?: string | null | undefined }>,
): string {
  const inboxReturnsVersion = useSyncExternalStore(
    inboxReturns.subscribe,
    inboxReturns.getSnapshot,
  );
  const nowMinute = useNowMinute();
  // Minute-quantized clocks would delay second-precise snooze wakes by up to a minute.
  const snoozeWakeClock = useSnoozeWakeClock(threads);
  return `${nowMinute}:${snoozeWakeClock}:${inboxReturnsVersion}`;
}
