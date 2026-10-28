import type { OrchestrationV2TurnItem } from "@t3tools/contracts";

type SubagentStatus = OrchestrationV2TurnItem["status"];

export type SubagentRowState = "running" | "idle" | "done" | "failed" | "stopped";

const ROW_STATES: Record<SubagentStatus, SubagentRowState> = {
  pending: "running",
  running: "running",
  waiting: "running",
  idle: "idle",
  completed: "done",
  failed: "failed",
  cancelled: "stopped",
  interrupted: "stopped",
};

export const SUBAGENT_STATUS_WORDS: Record<SubagentStatus, string> = {
  pending: "Queued",
  running: "Running",
  waiting: "Waiting",
  idle: "Idle",
  completed: "Done",
  failed: "Failed",
  cancelled: "Stopped",
  interrupted: "Stopped",
};

export function subagentRowState(status: SubagentStatus): SubagentRowState {
  return ROW_STATES[status];
}

const GENERIC_CHILD_END = /^Child task ended with status\b/i;

function plainDetail(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/^[ \t]*[-*][ \t]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One line for a subagent: its latest step while running or idle, its result once settled. */
export function subagentDetailLine(input: {
  readonly state: SubagentRowState;
  readonly result: string | null | undefined;
  readonly progress: string | null | undefined;
}): string | null {
  const result = input.result?.trim();
  const progress = input.progress?.trim();
  const settled = input.state !== "running" && input.state !== "idle";
  const raw = settled ? result || progress : progress || result;
  return raw && !GENERIC_CHILD_END.test(raw) ? plainDetail(raw) || null : null;
}

/** "2 running, 1 done" for a block header; states with no members are left out. */
export function subagentBlockSummary(statuses: ReadonlyArray<SubagentStatus>): string {
  const counts: Record<SubagentRowState, number> = {
    running: 0,
    idle: 0,
    done: 0,
    failed: 0,
    stopped: 0,
  };
  for (const status of statuses) counts[subagentRowState(status)] += 1;
  return (Object.keys(counts) as Array<SubagentRowState>)
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${state}`)
    .join(", ");
}

/**
 * Picks one block's subagents from the thread's list and returns the previous array while
 * every pick is the same object, so progress on other subagents does not re-render the block.
 */
export function selectSubagentsById<Agent extends { readonly id: string }>(
  ids: ReadonlyArray<string>,
): (agents: ReadonlyArray<Agent> | undefined) => ReadonlyArray<Agent | null> {
  let last: ReadonlyArray<Agent | null> | null = null;
  return (agents) => {
    const next = ids.map((id) => agents?.find((agent) => agent.id === id) ?? null);
    const previous = last;
    if (previous !== null && next.every((agent, index) => agent === previous[index])) {
      return previous;
    }
    last = next;
    return next;
  };
}
