import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { commandDisplayText } from "@t3tools/client-runtime/work-log/command-label";
import {
  isOrchestrationV2WorkActive,
  type EnvironmentId,
  type ProjectId,
  type OrchestrationV2PendingBackgroundTask,
  type OrchestrationV2ShellActivity,
  type OrchestrationV2ShellStep,
  type OrchestrationV2ShellSubagent,
} from "@t3tools/contracts";

import {
  composerDraftHasUserContent,
  DraftId,
  type ComposerThreadDraftState,
  type DraftSessionState,
} from "../../composerDraftStore";
import { draftPreviewLine } from "../../lib/draftPreview";
import type { SidebarThreadSummary } from "../../types";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import {
  isSidebarThreadCompleted,
  resolveSidebarStatusLabel,
  type SidebarStatusLabel,
} from "../sidebar/threadStatusLabel";
import type { StatusLightTone } from "../StatusLight";
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
  lights: ReadonlyArray<StatusLightTone>;
};

export type OverviewRow = {
  section: SidebarSection;
  cells: ReadonlyMap<string, ReadonlyArray<SidebarThreadSummary>>;
  total: number;
  urgency: "needs-you" | "working" | null;
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

type OrderableProject = Pick<SidebarProjectSnapshot, "projectKey" | "createdAt"> & {
  readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
};

/**
 * Columns keep the order the user dragged them into, never activity order, so a project stays
 * where they last saw it. Projects never placed follow, oldest first, so a new one cannot shift
 * the others.
 */
export function orderOverviewProjects<Project extends OrderableProject>(
  projects: ReadonlyArray<Project>,
  projectOrder: ReadonlyArray<string>,
): Project[] {
  const rankByKey = new Map(projectOrder.map((key, index) => [key, index]));
  const rank = (project: Project) =>
    Math.min(
      ...project.memberProjects.map(
        (member) => rankByKey.get(member.physicalProjectKey) ?? Number.POSITIVE_INFINITY,
      ),
    );
  return projects.toSorted(
    (left, right) =>
      rank(left) - rank(right) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.projectKey.localeCompare(right.projectKey),
  );
}

/** The physical project keys behind columns, in column order, for `reorderProjects`. */
export function overviewProjectOrderKeys(
  projects: ReadonlyArray<Pick<OrderableProject, "memberProjects">>,
): string[] {
  return projects.flatMap((project) =>
    project.memberProjects.map((member) => member.physicalProjectKey),
  );
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
  const lightsByColumn = new Map<string, StatusLightTone[]>();
  const rows: OverviewRow[] = sections.map(([section, threads]) => {
    const cells = new Map<string, SidebarThreadSummary[]>();
    let urgency: OverviewRow["urgency"] = null;
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
      const label = resolveSidebarStatusLabel({
        status,
        goalActive: thread.goal?.status === "active",
        hasActionableProposedPlan: thread.hasActionableProposedPlan,
        isUnread: false,
        isCompleted: isSidebarThreadCompleted(thread),
        isWoke: false,
      });
      const lights = lightsByColumn.get(key);
      if (lights) lights.push(overviewLight(label?.icon ?? null));
      else lightsByColumn.set(key, [overviewLight(label?.icon ?? null)]);
      if (status === "working") {
        counts.working += 1;
        urgency ??= "working";
      } else if (
        matchesSidebarStatusFilter(status, thread.hasActionableProposedPlan, "needs-you")
      ) {
        counts.needsYou += 1;
        urgency = "needs-you";
      }
    }
    return { section, cells, total: threads.length, urgency };
  });

  const columns: OverviewColumn[] = projects.map((project) => ({
    projectKey: project.projectKey,
    displayName: project.displayName,
    project,
    counts: stats.get(project.projectKey) ?? { open: 0, working: 0, needsYou: 0 },
    lights: lightsByColumn.get(project.projectKey) ?? [],
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
      lights: lightsByColumn.get(NO_PROJECT_KEY) ?? [],
    });
  }
  return { columns, rows };
}

export type OverviewDraft = {
  draftId: DraftId;
  threadKey: string;
  preview: string;
  createdAt: string;
};

export function overviewDraftCards(input: {
  sessions: Record<string, DraftSessionState>;
  composers: Record<string, ComposerThreadDraftState>;
  projectKeyOf: (ref: { environmentId: EnvironmentId; projectId: ProjectId }) => string;
  openThreadKey: string | null;
}): ReadonlyMap<string, ReadonlyArray<OverviewDraft>> {
  const byProject = new Map<string, OverviewDraft[]>();
  for (const [draftKey, session] of Object.entries(input.sessions)) {
    if (session.promotedTo != null) continue;
    const projectKey = input.projectKeyOf(session);
    if (projectKey === NO_PROJECT_KEY) continue;
    const threadKey = scopedThreadKey(scopeThreadRef(session.environmentId, session.threadId));
    const composer = input.composers[draftKey];
    if (!composerDraftHasUserContent(composer) && threadKey !== input.openThreadKey) continue;
    const draft: OverviewDraft = {
      draftId: DraftId.make(draftKey),
      threadKey,
      preview: composer ? draftPreviewLine(composer) : "",
      createdAt: session.createdAt,
    };
    const list = byProject.get(projectKey);
    if (list) list.push(draft);
    else byProject.set(projectKey, [draft]);
  }
  for (const list of byProject.values()) {
    list.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  return byProject;
}

export type OverviewPaneTarget =
  | { kind: "server"; threadKey: string }
  | { kind: "draft"; threadKey: string; draftId: DraftId }
  | { kind: "pending"; threadKey: string };

/** A promoted draft is pending only until its server shell first arrives. */
export function resolveOverviewPaneTarget(
  openKey: string | null,
  input: {
    serverThreadKeys: ReadonlySet<string>;
    draftIdByThreadKey: ReadonlyMap<string, DraftId>;
    promotedThreadKeys: ReadonlySet<string>;
    seenServerThreadKeys: ReadonlySet<string>;
  },
): OverviewPaneTarget | null {
  if (openKey === null) return null;
  if (input.serverThreadKeys.has(openKey)) return { kind: "server", threadKey: openKey };
  const draftId = input.draftIdByThreadKey.get(openKey);
  if (draftId !== undefined) return { kind: "draft", threadKey: openKey, draftId };
  if (input.promotedThreadKeys.has(openKey) && !input.seenServerThreadKeys.has(openKey)) {
    return { kind: "pending", threadKey: openKey };
  }
  return null;
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

export type OverviewMachineSpan = {
  start: number;
  length: number;
  machines: ReadonlyArray<OverviewMachine>;
  offline: boolean;
};

export function overviewMachineSpans(
  machinesByColumn: ReadonlyArray<ReadonlyArray<OverviewMachine>>,
): OverviewMachineSpan[] {
  const idsKey = (machines: ReadonlyArray<OverviewMachine>) =>
    machines
      .map((machine) => machine.id)
      .toSorted()
      .join("\n");
  const spans: OverviewMachineSpan[] = [];
  let previousKey: string | null = null;
  for (const [index, machines] of machinesByColumn.entries()) {
    const key = idsKey(machines);
    const last = spans.at(-1);
    if (last && key === previousKey) last.length += 1;
    else {
      spans.push({
        start: index,
        length: 1,
        machines,
        offline: machines.some((machine) => machine.offline),
      });
    }
    previousKey = key;
  }
  return spans;
}

export type OverviewLight = StatusLightTone;

const LIGHTS: Partial<Record<SidebarStatusLabel["icon"], OverviewLight>> = {
  working: "working",
  approval: "needs-you",
  input: "needs-you",
  request: "needs-you",
  plan: "needs-you",
  failed: "failed",
  waiting: "waiting",
  done: "done",
};

/** The card's status light; a Done thread shows a check, Woke and unlabeled ones a hollow light. */
export function overviewLight(icon: SidebarStatusLabel["icon"] | null): OverviewLight {
  return (icon === null ? undefined : LIGHTS[icon]) ?? "idle";
}

const STROBE_PERIOD_MS = 1200;

/**
 * A negative delay from the card's key, so each card strobes on its own beat and keeps it.
 * Slots within a card step by the golden ratio, which keeps nearby lights well apart.
 */
export function overviewStrobeDelay(key: string, slot = 0): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  const offset = Math.round(slot * 0.618034 * STROBE_PERIOD_MS);
  return `-${(Math.abs(hash) + offset) % STROBE_PERIOD_MS}ms`;
}

export type OverviewSubagentState = "running" | "failed" | "stopped" | "done";

export function overviewSubagentState(
  status: OrchestrationV2ShellSubagent["status"],
): OverviewSubagentState {
  if (isOrchestrationV2WorkActive(status)) return "running";
  if (status === "failed") return "failed";
  return status === "cancelled" || status === "interrupted" ? "stopped" : "done";
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
  if (step === null) return light === "working" ? { tone: "dim", text: "Thinking" } : null;
  const tone =
    light === "needs-you" ? "needs-you" : light === "done" || light === "idle" ? "dim" : "normal";
  return { tone, ...describeStep(step) };
}

/**
 * A sidebar row's second line: the card's step line, or the status word for a thread that needs
 * you or waits with no step to show, since the row has no other place for it.
 */
export function sidebarStepLine(
  input: Parameters<typeof overviewStepLine>[0] & { readonly statusLabel: string | null },
): OverviewStepLine | null {
  const step = overviewStepLine(input);
  if (step !== null || input.statusLabel === null) return step;
  const light = overviewLight(input.icon);
  if (light === "needs-you") return { tone: "needs-you", text: input.statusLabel };
  return light === "waiting" ? { tone: "dim", text: input.statusLabel } : null;
}

export type OverviewWaitStrip = {
  readonly icon: "command" | "pull-request" | "monitor" | "subagent" | "task" | "many";
  readonly text: string;
  /** Shown in monospace: the waited-on command. */
  readonly code: boolean;
  readonly meta: "running" | "watching" | null;
};

const PULL_REQUEST_WATCH = /^Watching pull request #(\d+)$/u;

function waitTaskLabel(task: OrchestrationV2PendingBackgroundTask): string {
  const description = task.description?.trim();
  const pullRequest = description?.match(PULL_REQUEST_WATCH);
  if (pullRequest) return `PR #${pullRequest[1]} checks`;
  if (description) {
    return task.kind === "command" ? overviewCommandText(description) : description;
  }
  return task.kind === "subagent" ? "a subagent" : task.kind === "monitor" ? "a monitor" : "a task";
}

/** What a waiting card waits on, from the background work its run holds for. */
export function overviewWaitStrip(
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>,
): OverviewWaitStrip | null {
  const [first, second] = tasks;
  if (first === undefined) return null;
  if (second !== undefined) {
    const named = tasks.slice(0, 2).map(waitTaskLabel).join(", ");
    return {
      icon: "many",
      text: tasks.length > 2 ? `${named}, ${tasks.length - 2} more` : named,
      code: false,
      meta: null,
    };
  }
  const text = waitTaskLabel(first);
  if (PULL_REQUEST_WATCH.test(first.description?.trim() ?? "")) {
    return { icon: "pull-request", text, code: false, meta: "watching" };
  }
  switch (first.kind) {
    case "command":
      return { icon: "command", text, code: first.description !== undefined, meta: "running" };
    case "monitor":
      return { icon: "monitor", text, code: false, meta: "watching" };
    case "subagent":
      return { icon: "subagent", text, code: false, meta: "running" };
    default:
      return { icon: "task", text, code: false, meta: "running" };
  }
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
