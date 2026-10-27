import { useSyncExternalStore } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { inboxReturns, useSnoozeWakeClock } from "../Sidebar.logic";

export const SETTLED_SHELF_EXPANDED_KEY = "t3code:sidebar:settled-expanded";
export const SNOOZED_SHELF_EXPANDED_KEY = "t3code:sidebar:snoozed-expanded";
export const WORKING_SHELF_EXPANDED_KEY = "t3code:sidebar:working-expanded";
export const SIDEBAR_SHELF_EXPANDED_DEFAULT = false;
export const SETTLED_TAIL_INITIAL_COUNT = 10;
export const SETTLED_TAIL_PAGE_COUNT = 25;

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
