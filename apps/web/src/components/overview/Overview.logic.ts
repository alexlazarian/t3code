import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { commandDisplayText } from "@t3tools/client-runtime/work-log/command-label";
import {
  isOrchestrationV2WorkActive,
  type OrchestrationV2ShellActivity,
  type OrchestrationV2ShellStep,
  type OrchestrationV2ShellSubagent,
} from "@t3tools/contracts";

import type { SidebarThreadSummary } from "../../types";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarStatusLabel } from "../sidebar/threadStatusLabel";
import {
  matchesSidebarStatusFilter,
  resolveSidebarThreadStatus,
  type partitionSidebarThreads,
  type SidebarSection,
} from "../Sidebar.logic";

export const NO_PROJECT_KEY = "overview:no-project";

export type OverviewColumn = {
  projectKey: string;
  displayName: string;
  project: SidebarProjectSnapshot | null;
  counts: { open: number; working: number; needsYou: number };
};

export type OverviewRow = {
  section: SidebarSection;
  cells: ReadonlyMap<string, ReadonlyArray<SidebarThreadSummary>>;
  total: number;
};

export function overviewProjectKeyOf(projects: ReadonlyArray<SidebarProjectSnapshot>) {
  const byMemberRef = new Map<string, string>();
  for (const project of projects) {
    for (const ref of project.memberProjectRefs) {
      byMemberRef.set(`${ref.environmentId}:${ref.projectId}`, project.projectKey);
    }
  }
  return (thread: Pick<SidebarThreadSummary, "environmentId" | "projectId">): string =>
    byMemberRef.get(`${thread.environmentId}:${thread.projectId}`) ?? NO_PROJECT_KEY;
}

export function buildOverviewGrid(input: {
  partition: Pick<
    ReturnType<typeof partitionSidebarThreads>,
    "pinnedThreads" | "workingThreads" | "activeThreads" | "snoozedThreads" | "settledThreads"
  >;
  projects: ReadonlyArray<SidebarProjectSnapshot>;
  projectKeyOf: (thread: SidebarThreadSummary) => string;
  workingShelfEnabled: boolean;
}): { columns: OverviewColumn[]; rows: OverviewRow[] } {
  const { partition, projects, projectKeyOf } = input;
  const sections: ReadonlyArray<readonly [SidebarSection, ReadonlyArray<SidebarThreadSummary>]> = [
    ["pinned", partition.pinnedThreads],
    ...(input.workingShelfEnabled ? ([["working", partition.workingThreads]] as const) : []),
    ["active", partition.activeThreads],
    ["snoozed", partition.snoozedThreads],
    ["settled", partition.settledThreads],
  ];

  const known = new Set(projects.map((project) => project.projectKey));
  const stats = new Map<string, OverviewColumn["counts"]>();
  const rows: OverviewRow[] = sections.map(([section, threads]) => {
    const cells = new Map<string, SidebarThreadSummary[]>();
    for (const thread of threads) {
      const projectKey = projectKeyOf(thread);
      const key = known.has(projectKey) ? projectKey : NO_PROJECT_KEY;
      const cell = cells.get(key);
      if (cell) cell.push(thread);
      else cells.set(key, [thread]);
      if (section === "settled") continue;
      const counts = stats.get(key) ?? { open: 0, working: 0, needsYou: 0 };
      stats.set(key, counts);
      counts.open += 1;
      const status = resolveSidebarThreadStatus(thread);
      if (status === "working") counts.working += 1;
      else if (matchesSidebarStatusFilter(status, thread.hasActionableProposedPlan, "needs-you")) {
        counts.needsYou += 1;
      }
    }
    return { section, cells, total: threads.length };
  });

  const columns: OverviewColumn[] = projects.map((project) => ({
    projectKey: project.projectKey,
    displayName: project.displayName,
    project,
    counts: stats.get(project.projectKey) ?? { open: 0, working: 0, needsYou: 0 },
  }));
  const orphanTotal = rows.reduce(
    (sum, row) => sum + (row.cells.get(NO_PROJECT_KEY)?.length ?? 0),
    0,
  );
  if (orphanTotal > 0) {
    columns.push({
      projectKey: NO_PROJECT_KEY,
      displayName: "No project",
      project: null,
      counts: stats.get(NO_PROJECT_KEY) ?? { open: 0, working: 0, needsYou: 0 },
    });
  }
  return { columns, rows };
}

export type OverviewFocusDirection = "up" | "down" | "left" | "right";

/** `grid[column][row]` lists the card keys of each visible cell. */
export type OverviewFocusGrid = ReadonlyArray<ReadonlyArray<ReadonlyArray<string>>>;

export function moveOverviewFocus(
  grid: OverviewFocusGrid,
  key: string,
  direction: OverviewFocusDirection,
): string | null {
  for (const [column, cells] of grid.entries()) {
    for (const [row, cell] of cells.entries()) {
      const index = cell.indexOf(key);
      if (index === -1) continue;
      if (direction === "up" || direction === "down") {
        const stack = cells.flat();
        return stack[stack.indexOf(key) + (direction === "down" ? 1 : -1)] ?? null;
      }
      const step = direction === "right" ? 1 : -1;
      for (let next = column + step; next >= 0 && next < grid.length; next += step) {
        const target = nearestCard(grid[next]!, row, index);
        if (target !== null) return target;
      }
      return null;
    }
  }
  return null;
}

function nearestCard(
  cells: ReadonlyArray<ReadonlyArray<string>>,
  row: number,
  index: number,
): string | null {
  const same = cells[row] ?? [];
  if (same.length > 0) return same[Math.min(index, same.length - 1)]!;
  for (let distance = 1; distance < cells.length; distance += 1) {
    const above = cells[row - distance];
    if (above !== undefined && above.length > 0) return above.at(-1)!;
    const below = cells[row + distance];
    if (below !== undefined && below.length > 0) return below[0]!;
  }
  return null;
}

/** Matches ChatView: any phase but "connected" is unavailable. An unknown environment is not flagged. */
export function isOverviewThreadOffline(
  environmentId: string,
  phases: ReadonlyMap<string, EnvironmentConnectionPhase>,
): boolean {
  const phase = phases.get(environmentId);
  return phase !== undefined && phase !== "connected";
}

export type OverviewMachine = {
  readonly id: string;
  readonly label: string;
  readonly offline: boolean;
};

export function overviewColumnMachines(
  environmentIds: Iterable<string>,
  phases: ReadonlyMap<string, EnvironmentConnectionPhase>,
  labelById: ReadonlyMap<string, string>,
): OverviewMachine[] {
  return [...new Set(environmentIds)].map((id) => ({
    id,
    label: labelById.get(id) ?? "Machine",
    offline: isOverviewThreadOffline(id, phases),
  }));
}

export type OverviewLight = "working" | "needs-you" | "failed" | "waiting" | "done";

const LIGHTS: Partial<Record<SidebarStatusLabel["icon"], OverviewLight>> = {
  working: "working",
  approval: "needs-you",
  input: "needs-you",
  request: "needs-you",
  plan: "needs-you",
  failed: "failed",
  waiting: "waiting",
};

/** The card's status light; Done, Woke and unlabeled threads show a hollow one. */
export function overviewLight(icon: SidebarStatusLabel["icon"] | null): OverviewLight {
  return (icon === null ? undefined : LIGHTS[icon]) ?? "done";
}

const STROBE_PERIOD_MS = 1200;

/** A negative delay from the key, so each light strobes on its own beat and keeps it. */
export function overviewStrobeDelay(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return `-${Math.abs(hash) % STROBE_PERIOD_MS}ms`;
}

export type OverviewSubagentState = "running" | "failed" | "done";

export function overviewSubagentState(
  status: OrchestrationV2ShellSubagent["status"],
): OverviewSubagentState {
  if (isOrchestrationV2WorkActive(status)) return "running";
  return status === "failed" ? "failed" : "done";
}

export type OverviewStepLine = {
  readonly tone: "normal" | "needs-you" | "failed" | "dim";
  readonly text: string;
  /** Shown after `text` in monospace: a command, file or search pattern. */
  readonly code?: string;
};

/** Drops a leading `cd <dir> &&` so the line starts with the command that matters. */
function overviewCommandText(command: string): string {
  return commandDisplayText(command)
    .replace(/^(?:cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*)+/u, "")
    .trim();
}

function shortPath(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).slice(-2).join("/") || path;
}

function describeStep(step: OrchestrationV2ShellStep): { text: string; code?: string } {
  const live = isOrchestrationV2WorkActive(step.status);
  switch (step.kind) {
    case "command":
      return { text: live ? "Running " : "Ran ", code: overviewCommandText(step.text) };
    case "file_change":
      return { text: live ? "Editing " : "Edited ", code: shortPath(step.text) };
    case "file_search":
      return { text: live ? "Searching for " : "Searched for ", code: step.text };
    case "web_search":
      return { text: `${live ? "Searching" : "Searched"} the web for ${step.text}` };
    case "question":
      return { text: `Asks: ${step.text}` };
    case "approval":
      return { text: `Wants approval: ${step.text}` };
    case "subagent":
      return { text: `Subagent: ${step.text}` };
    case "tool":
    case "reply":
      return { text: step.text };
  }
}

/**
 * The card's step line: the error when failed, the lead's newest step otherwise, or "Waiting on N
 * subagents" while the lead only waits on them. Null when there is nothing to say.
 */
export function overviewStepLine(input: {
  readonly icon: SidebarStatusLabel["icon"] | null;
  readonly activity: OrchestrationV2ShellActivity | null;
  readonly lastError: string | null;
  readonly blockedOnThreadWait: boolean;
}): OverviewStepLine | null {
  const light = overviewLight(input.icon);
  if (light === "failed") {
    return { tone: "failed", text: firstLine(input.lastError) ?? "Failed" };
  }
  const running = overviewRunningSubagents(input.activity);
  const step = input.activity?.step ?? null;
  if (
    light === "working" &&
    running > 0 &&
    (step === null || step.kind === "subagent" || input.blockedOnThreadWait)
  ) {
    return { tone: "dim", text: `Waiting on ${running} subagent${running === 1 ? "" : "s"}` };
  }
  if (input.icon === "plan") return { tone: "needs-you", text: "Plan ready to review" };
  if (step === null) return null;
  const tone = light === "needs-you" ? "needs-you" : light === "done" ? "dim" : "normal";
  return { tone, ...describeStep(step) };
}

export function overviewRunningSubagents(activity: OrchestrationV2ShellActivity | null): number {
  return (
    activity?.subagents.filter((subagent) => overviewSubagentState(subagent.status) === "running")
      .length ?? 0
  );
}

function firstLine(text: string | null): string | null {
  return (
    text
      ?.split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null
  );
}

const MIN_OVERVIEW_GRID_PX = 96;
const MIN_OVERVIEW_PANE_PX = 160;
const OVERVIEW_PANE_SNAP_CLOSED_PX = 120;

/** The thread pane's share of the split for a pointer at `clientY`, leaving the grid room. */
export function overviewSplitDragFraction(
  clientY: number,
  split: { readonly top: number; readonly height: number },
): number {
  if (split.height <= 0) return 0;
  const max = Math.max(0, 1 - MIN_OVERVIEW_GRID_PX / split.height);
  return Math.min(max, Math.max(0, (split.top + split.height - clientY) / split.height));
}

/** Where a released drag settles: `null` snaps the pane shut, otherwise the fraction to keep. */
export function resolveOverviewSplitRelease(fraction: number, height: number): number | null {
  if (fraction * height < OVERVIEW_PANE_SNAP_CLOSED_PX) return null;
  return Math.max(fraction, Math.min(MIN_OVERVIEW_PANE_PX / height, 1));
}
