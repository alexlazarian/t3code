import { isOrchestrationV2WorkActive, type OrchestrationV2ExecutionNode } from "@t3tools/contracts";

import { overviewLight } from "../overview/Overview.logic";
import type { SidebarStatusLabel } from "../sidebar/threadStatusLabel";
import type { StatusLightTone } from "../StatusLight";

export interface ThreadHeaderStatus {
  readonly tone: StatusLightTone;
}

const LIVE_TONES: ReadonlySet<StatusLightTone> = new Set(["working", "needs-you", "failed"]);

export function resolveThreadHeaderStatus(input: {
  readonly live: SidebarStatusLabel | null;
  /** The effective snooze only; null once the thread has woken. */
  readonly snoozedUntil: string | null;
  readonly isSettled: boolean;
  /** A provider-native subagent works in a runless turn, so its runtime reads idle. */
  readonly providerSubagentStatus?: OrchestrationV2ExecutionNode["status"] | null;
}): ThreadHeaderStatus | null {
  const live = input.live === null ? null : { tone: overviewLight(input.live.icon) };
  if (live !== null && LIVE_TONES.has(live.tone)) return live;
  if (input.providerSubagentStatus && isOrchestrationV2WorkActive(input.providerSubagentStatus)) {
    return { tone: "working" };
  }
  if (input.snoozedUntil !== null || input.isSettled) return { tone: "idle" };
  return live;
}
