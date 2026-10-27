import type { SidebarThreadSummary } from "../../types";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
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
  workingShelfEnabled?: boolean;
}): { columns: OverviewColumn[]; rows: OverviewRow[] } {
  const { partition, projects, projectKeyOf } = input;
  const sections: ReadonlyArray<readonly [SidebarSection, ReadonlyArray<SidebarThreadSummary>]> = [
    ["pinned", partition.pinnedThreads],
    ...((input.workingShelfEnabled ?? partition.workingThreads.length > 0)
      ? ([["working", partition.workingThreads]] as const)
      : []),
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
