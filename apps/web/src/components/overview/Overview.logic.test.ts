import type { EnvironmentServerConfig } from "@t3tools/client-runtime/connection";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { makeThreadFixture, type ThreadFixtureOverrides } from "../../test-fixtures";
import type { Project } from "../../types";
import { partitionSidebarThreads } from "../Sidebar.logic";
import { buildOverviewGrid, NO_PROJECT_KEY, overviewProjectKeyOf } from "./Overview.logic";

const envA = EnvironmentId.make("env-a");
const envB = EnvironmentId.make("env-b");
const repositoryIdentity = {
  canonicalKey: "github.com/example/shared-repo",
  locator: {
    source: "git-remote" as const,
    remoteName: "origin",
    remoteUrl: "https://github.com/example/shared-repo.git",
  },
};
const settings = {
  sidebarProjectGroupingMode: "repository" as const,
  sidebarProjectGroupingOverrides: {},
};
const capableConfig = {
  environment: { capabilities: { threadSnooze: true, threadSettlement: true } },
} as unknown as EnvironmentServerConfig;
const runtime = {
  status: "running" as const,
  activeRunId: null,
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerName: "Codex",
  lastError: null,
  updatedAt: "2026-03-09T10:00:00.000Z",
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: ProjectId.make("project-1"),
    environmentId: envA,
    title: "shared-repo",
    workspaceRoot: "/tmp/shared-repo",
    repositoryIdentity: null,
    defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
    ...overrides,
  };
}

function snapshots(projects: Project[]) {
  return buildSidebarProjectSnapshots({
    projects,
    settings,
    primaryEnvironmentId: envA,
    resolveEnvironmentLabel: () => null,
  });
}

function makeThread(id: string, overrides: ThreadFixtureOverrides = {}) {
  return makeThreadFixture({
    id: ThreadId.make(id),
    environmentId: envA,
    projectId: ProjectId.make("project-1"),
    ...overrides,
  });
}

function partition(threads: ReadonlyArray<ReturnType<typeof makeThread>>, workingShelf = false) {
  return partitionSidebarThreads({
    threads,
    scopedProjectKeys: null,
    serverConfigs: new Map([
      [envA, capableConfig],
      [envB, capableConfig],
    ]),
    optimisticDrop: null,
    workingShelfEnabled: workingShelf,
    statusFilter: "all",
    routeRowThreadKey: null,
    clockKey: "test",
  });
}

const FUTURE = "2099-01-01T00:00:00.000Z";

describe("partitionSidebarThreads", () => {
  it("keeps snoozed > settled > pinned precedence", () => {
    const pinned = "2026-03-09T10:00:00.000Z";
    const result = partition([
      makeThread("pinned-only", { pinnedAt: pinned }),
      makeThread("pinned-settled", { pinnedAt: pinned, settledOverride: "settled" }),
      makeThread("pinned-snoozed", {
        pinnedAt: pinned,
        settledOverride: "settled",
        snoozedUntil: FUTURE,
      }),
      makeThread("plain"),
    ]);
    expect(result.pinnedThreads.map((thread) => thread.id)).toEqual(["pinned-only"]);
    expect(result.settledThreads.map((thread) => thread.id)).toEqual(["pinned-settled"]);
    expect(result.snoozedThreads.map((thread) => thread.id)).toEqual(["pinned-snoozed"]);
    expect(result.activeThreads.map((thread) => thread.id)).toEqual(["plain"]);
  });
});

describe("buildOverviewGrid", () => {
  it("makes one column per project group, including a project grouped across two environments", () => {
    const projects = snapshots([
      makeProject({ repositoryIdentity }),
      makeProject({
        id: ProjectId.make("project-remote"),
        environmentId: envB,
        repositoryIdentity,
      }),
    ]);
    const threads = [
      makeThread("local"),
      makeThread("remote", {
        environmentId: envB,
        projectId: ProjectId.make("project-remote"),
      }),
    ];
    const grid = buildOverviewGrid({
      partition: partition(threads),
      projects,
      projectKeyOf: overviewProjectKeyOf(projects),
      workingShelfEnabled: false,
    });
    expect(grid.columns).toHaveLength(1);
    expect(grid.columns[0]?.counts.open).toBe(2);
    expect(
      grid.rows.find((row) => row.section === "active")?.cells.get(projects[0]!.projectKey),
    ).toHaveLength(2);
  });

  it("follows sidebar section order and keeps empty rows", () => {
    const projects = snapshots([makeProject()]);
    const build = (workingShelfEnabled: boolean) =>
      buildOverviewGrid({
        partition: partition([makeThread("only")], workingShelfEnabled),
        projects,
        projectKeyOf: overviewProjectKeyOf(projects),
        workingShelfEnabled,
      }).rows;
    expect(build(true).map((row) => row.section)).toEqual([
      "pinned",
      "working",
      "active",
      "snoozed",
      "settled",
    ]);
    expect(build(true).find((row) => row.section === "working")?.total).toBe(0);
    const rows = build(false);
    expect(rows.map((row) => row.section)).toEqual(["pinned", "active", "snoozed", "settled"]);
    expect(rows.map((row) => row.total)).toEqual([0, 1, 0, 0]);
  });

  it("counts working and needs-you per column", () => {
    const projects = snapshots([
      makeProject(),
      makeProject({ id: ProjectId.make("project-2"), workspaceRoot: "/tmp/other" }),
    ]);
    const threads = [
      makeThread("approval", { hasPendingApprovals: true }),
      makeThread("plan", { hasActionableProposedPlan: true }),
      makeThread("working", { runtime }),
      makeThread("done"),
      makeThread("elsewhere", { projectId: ProjectId.make("project-2"), runtime }),
    ];
    const grid = buildOverviewGrid({
      partition: partition(threads),
      projects,
      projectKeyOf: overviewProjectKeyOf(projects),
      workingShelfEnabled: false,
    });
    expect(grid.columns.map((column) => column.counts)).toEqual([
      { open: 4, working: 1, needsYou: 2 },
      { open: 1, working: 1, needsYou: 0 },
    ]);
  });

  it("adds a No project column last only when a thread matches no project", () => {
    const projects = snapshots([makeProject()]);
    const build = (threads: ReturnType<typeof makeThread>[]) =>
      buildOverviewGrid({
        partition: partition(threads),
        projects,
        projectKeyOf: overviewProjectKeyOf(projects),
        workingShelfEnabled: false,
      });
    expect(build([makeThread("a")]).columns.map((column) => column.projectKey)).toEqual([
      projects[0]!.projectKey,
    ]);
    const grid = build([
      makeThread("a"),
      makeThread("lost", { projectId: ProjectId.make("gone") }),
    ]);
    expect(grid.columns.map((column) => column.projectKey)).toEqual([
      projects[0]!.projectKey,
      NO_PROJECT_KEY,
    ]);
    expect(grid.columns[1]?.counts.open).toBe(1);
  });
});
