import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";

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

export type OverviewStatusBlock = {
  readonly glyph: "" | "play" | "!" | "?" | "P" | "x" | "~";
  readonly className: string;
};

const IDLE_BLOCK: OverviewStatusBlock = { glyph: "", className: "bg-black/20" };
const STATUS_BLOCKS: Partial<Record<SidebarStatusLabel["icon"], OverviewStatusBlock>> = {
  working: { glyph: "play", className: "bg-status-working" },
  approval: { glyph: "!", className: "bg-status-needs-you" },
  input: { glyph: "?", className: "bg-status-needs-you" },
  request: { glyph: "?", className: "bg-status-needs-you" },
  plan: { glyph: "P", className: "bg-status-needs-you" },
  failed: { glyph: "x", className: "bg-status-failed" },
  waiting: { glyph: "~", className: "bg-overview-idle" },
};

/** Glyphs match the prototype's STATUS table; Done, Woke and unlabeled threads show an empty block. */
export function overviewStatusBlock(icon: SidebarStatusLabel["icon"] | null): OverviewStatusBlock {
  return (icon === null ? undefined : STATUS_BLOCKS[icon]) ?? IDLE_BLOCK;
}
