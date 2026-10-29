import { snoozeWakeLabel } from "@t3tools/client-runtime/state/thread-settled";

import { overviewLight } from "../overview/Overview.logic";
import type { SidebarStatusLabel } from "../sidebar/threadStatusLabel";
import type { StatusLightTone } from "../StatusLight";

export interface ThreadHeaderStatus {
  readonly label: string;
  readonly tone: StatusLightTone;
  readonly className: string;
}

const LIVE_TONES: ReadonlySet<StatusLightTone> = new Set(["working", "needs-you", "failed"]);

export function resolveThreadHeaderStatus(input: {
  readonly live: SidebarStatusLabel | null;
  /** The effective snooze only; null once the thread has woken. */
  readonly snoozedUntil: string | null;
  readonly isSettled: boolean;
  readonly now: Date;
}): ThreadHeaderStatus | null {
  const live =
    input.live === null
      ? null
      : {
          label: input.live.label,
          tone: overviewLight(input.live.icon),
          className: input.live.className,
        };
  if (live !== null && LIVE_TONES.has(live.tone)) return live;
  if (input.snoozedUntil !== null) {
    const wake = snoozeWakeLabel(input.snoozedUntil, { now: input.now.toISOString() });
    return {
      label: wake === "now" ? "Snoozed" : `Snoozed, ${wake} left`,
      tone: "idle",
      className: "text-muted-foreground",
    };
  }
  if (input.isSettled) {
    return { label: "Settled", tone: "idle", className: "text-muted-foreground" };
  }
  return live;
}
