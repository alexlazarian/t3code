import type {
  EnvironmentConnectionPhase,
  EnvironmentServerConfig,
} from "@t3tools/client-runtime/connection";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ShellActivity,
  type OrchestrationV2ShellSubagent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import { makeThreadFixture, type ThreadFixtureOverrides } from "../../test-fixtures";
import type { Project } from "../../types";
import { partitionSidebarThreads } from "../Sidebar.logic";
import {
  buildOverviewGrid,
  overviewStrobeDelay,
  overviewSubagentState,
  isOverviewThreadOffline,
  moveOverviewFocus,
  NO_PROJECT_KEY,
  overviewColumnMachines,
  overviewMachineSpans,
  overviewProjectKeyOf,
  overviewLight,
  orderOverviewProjects,
  overviewStepLine,
  sidebarStepLine,
  overviewWaitStrip,
  overviewSplitDragFraction,
  resolveOverviewSplitRelease,
} from "./Overview.logic";

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
    delegatedUnderParent: new Set(),
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

  it.each([false, true])(
    "sorts Active by the user's latest send, ignoring manual order (working shelf %s)",
    (workingShelf) => {
      const result = partition(
        [
          makeThread("new-quiet", {
            createdAt: "2026-03-09T10:00:00.000Z",
            latestUserAuthoredMessageAt: "2026-03-09T10:00:00.000Z",
            activeOrderKey: "a",
          }),
          makeThread("old-sent", {
            createdAt: "2026-03-01T10:00:00.000Z",
            latestUserAuthoredMessageAt: "2026-03-09T12:00:00.000Z",
            activeOrderKey: "b",
          }),
          makeThread("returned", {
            createdAt: "2026-03-01T09:00:00.000Z",
            latestUserAuthoredMessageAt: "2026-03-09T11:00:00.000Z",
            unsettledAt: "2026-03-09T13:00:00.000Z",
            activeOrderKey: "c",
          }),
        ],
        workingShelf,
      );
      expect(result.activeThreads.map((thread) => thread.id)).toEqual([
        "old-sent",
        "returned",
        "new-quiet",
      ]);
    },
  );
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
    expect(
      grid.columns.map((column) => column.lights.filter((tone) => tone === "working")),
    ).toEqual([["working"], ["working"]]);
    for (const column of grid.columns) expect(column.lights).toHaveLength(column.counts.open);
  });

  it("marks a shelf needs-you, working or quiet by its most urgent thread", () => {
    const projects = snapshots([makeProject()]);
    const urgency = (threads: ReturnType<typeof makeThread>[]) =>
      buildOverviewGrid({
        partition: partition(threads, true),
        projects,
        projectKeyOf: overviewProjectKeyOf(projects),
        workingShelfEnabled: true,
      }).rows.map((row) => [row.section, row.urgency]);
    expect(
      urgency([
        makeThread("approval", { hasPendingApprovals: true }),
        makeThread("working", { runtime }),
      ]),
    ).toEqual([
      ["pinned", null],
      ["working", "working"],
      ["active", "needs-you"],
      ["snoozed", null],
      ["settled", null],
    ]);
    expect(urgency([makeThread("done", { settledOverride: "settled" })])[4]).toEqual([
      "settled",
      null,
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

describe("moveOverviewFocus", () => {
  // Two rows; column a has a1,a2 then a3; column b is empty in row 0; column c has c1 then nothing.
  const grid = [
    [["a1", "a2"], ["a3"]],
    [[], ["b1"]],
    [["c1"], []],
    [[], []],
  ];

  it("moves up and down through a column across rows", () => {
    expect(moveOverviewFocus(grid, "a2", "down")).toBe("a3");
    expect(moveOverviewFocus(grid, "a3", "up")).toBe("a2");
    expect(moveOverviewFocus(grid, "a1", "up")).toBeNull();
    expect(moveOverviewFocus(grid, "a3", "down")).toBeNull();
  });

  it("moves sideways within the same row, keeping the position when it can", () => {
    expect(moveOverviewFocus(grid, "a3", "right")).toBe("b1");
    expect(moveOverviewFocus(grid, "b1", "left")).toBe("a3");
  });

  it("falls back to the nearest row when the neighbouring cell is empty", () => {
    expect(moveOverviewFocus(grid, "a2", "right")).toBe("b1");
    expect(moveOverviewFocus(grid, "b1", "right")).toBe("c1");
  });

  it("skips empty columns and stops at the edges", () => {
    expect(moveOverviewFocus(grid, "c1", "right")).toBeNull();
    expect(moveOverviewFocus(grid, "a1", "left")).toBeNull();
    expect(moveOverviewFocus([[["x"]], [[]], [["y"]]], "x", "right")).toBe("y");
  });

  it("returns null for a key that is not on the grid", () => {
    expect(moveOverviewFocus(grid, "missing", "down")).toBeNull();
  });
});

describe("overview offline machines", () => {
  const phases = new Map<string, EnvironmentConnectionPhase>([
    [envA, "connected"],
    [envB, "reconnecting"],
    ["env-c", "offline"],
    ["env-d", "error"],
  ]);

  it("a thread whose environment is reconnecting counts as offline; connected does not", () => {
    expect(isOverviewThreadOffline(envB, phases)).toBe(true);
    expect(isOverviewThreadOffline("env-c", phases)).toBe(true);
    expect(isOverviewThreadOffline(envA, phases)).toBe(false);
    expect(isOverviewThreadOffline("env-unknown", phases)).toBe(false);
  });

  it("lists each machine once and marks the offline ones", () => {
    const labels = new Map([
      [envA, "Laptop"],
      [envB, "Studio"],
    ]);
    expect(overviewColumnMachines([envA, envB, envA, "env-x"], phases, labels)).toEqual([
      { id: envA, label: "Laptop", offline: false },
      { id: envB, label: "Studio", offline: true },
      { id: "env-x", label: "Machine", offline: false },
    ]);
  });
});

describe("overviewMachineSpans", () => {
  const mbp = { id: "mbp", label: "MBP", offline: false };
  const box = { id: "box", label: "Box", offline: false };

  it("groups adjacent columns that share the same machines", () => {
    expect(overviewMachineSpans([[mbp], [mbp], [mbp]])).toEqual([
      { start: 0, length: 3, machines: [mbp], offline: false },
    ]);
    expect(overviewMachineSpans([[mbp], [mbp, box], [box]]).map((span) => span.start)).toEqual([
      0, 1, 2,
    ]);
    expect(overviewMachineSpans([[mbp], [box], [mbp]]).map((span) => span.length)).toEqual([
      1, 1, 1,
    ]);
    expect(overviewMachineSpans([[], []])).toEqual([
      { start: 0, length: 2, machines: [], offline: false },
    ]);
    expect(overviewMachineSpans([[mbp, { ...box, offline: true }]])[0]?.offline).toBe(true);
  });
});

describe("overviewLight", () => {
  it("maps each status to its light, keeping Done apart from Woke and unlabeled", () => {
    const lights = (
      [
        "working",
        "approval",
        "input",
        "request",
        "plan",
        "failed",
        "waiting",
        "done",
        "woke",
        null,
      ] as const
    ).map(overviewLight);
    expect(lights).toEqual([
      "working",
      "needs-you",
      "needs-you",
      "needs-you",
      "needs-you",
      "failed",
      "waiting",
      "done",
      "idle",
      "idle",
    ]);
  });
});

describe("overviewSubagentState", () => {
  it("shows a stopped subagent apart from a finished one", () => {
    const states = (
      [
        "pending",
        "running",
        "waiting",
        "idle",
        "completed",
        "failed",
        "cancelled",
        "interrupted",
      ] as const
    ).map(overviewSubagentState);
    expect(states).toEqual([
      "running",
      "running",
      "running",
      "done",
      "done",
      "failed",
      "stopped",
      "stopped",
    ]);
  });
});

describe("overviewStepLine", () => {
  const subagent = (status: OrchestrationV2ShellSubagent["status"]) => ({
    threadId: null,
    title: "Check auth",
    status,
    step: null,
    startedAt: null,
    completedAt: null,
  });
  const activity = (
    step: OrchestrationV2ShellActivity["step"],
    subagents: OrchestrationV2ShellActivity["subagents"] = [],
  ): OrchestrationV2ShellActivity => ({
    step,
    stepCount: 1,
    subagents,
    subagentCount: subagents.length,
  });
  const line = (
    icon: Parameters<typeof overviewStepLine>[0]["icon"],
    value: OrchestrationV2ShellActivity | null,
    extra: { lastError?: string; blockedOnThreadWait?: boolean } = {},
  ) =>
    overviewStepLine({
      icon,
      activity: value,
      lastError: extra.lastError ?? null,
      blockedOnThreadWait: extra.blockedOnThreadWait ?? false,
    });

  it("describes the lead's step by kind and tense", () => {
    expect(
      line(
        "working",
        activity({ kind: "command", text: "cd /repo && vp test run src/auth", status: "running" }),
      ),
    ).toEqual({ tone: "normal", text: "Running ", code: "vp test run src/auth" });
    expect(
      line(
        "working",
        activity({ kind: "file_change", text: "/repo/src/auth/session.ts", status: "running" }),
      ),
    ).toEqual({ tone: "normal", text: "Editing ", code: "auth/session.ts" });
    expect(
      line("done", activity({ kind: "reply", text: "Added 6 shortcuts", status: "completed" })),
    ).toEqual({ tone: "dim", text: "Added 6 shortcuts" });
    expect(
      line("input", activity({ kind: "question", text: "Keep the toggle?", status: "waiting" })),
    ).toEqual({ tone: "needs-you", text: "Asks: Keep the toggle?" });
  });

  it("says the lead is waiting only when it has nothing of its own running", () => {
    const running = [subagent("running"), subagent("running"), subagent("completed")];
    expect(line("working", activity(null, running))).toEqual({
      tone: "dim",
      text: "Waiting on 2 subagents",
    });
    expect(
      line("working", activity({ kind: "subagent", text: "Check", status: "running" }, running)),
    ).toEqual({ tone: "dim", text: "Waiting on 2 subagents" });
    expect(
      line("working", activity({ kind: "command", text: "ls", status: "completed" }, running), {
        blockedOnThreadWait: true,
      })?.text,
    ).toBe("Waiting on 2 subagents");
    expect(
      line("working", activity({ kind: "command", text: "ls", status: "running" }, running))?.text,
    ).toBe("Running ");
  });

  it("shows the error when failed, the plan when one is ready, and a placeholder or nothing without a step", () => {
    expect(line("failed", null, { lastError: "\nxcodebuild exited 65\nmore" })).toEqual({
      tone: "failed",
      text: "xcodebuild exited 65",
    });
    expect(line("plan", activity(null))).toEqual({
      tone: "needs-you",
      text: "Plan ready to review",
    });
    // A turn that just started has no step yet; the card should not sit blank.
    expect(line("working", null)).toEqual({ tone: "dim", text: "Thinking" });
    expect(line("working", activity(null))).toEqual({ tone: "dim", text: "Thinking" });
    expect(line("done", null)).toBeNull();
  });

  it("falls back to the status word on a sidebar row that needs you or waits without a step", () => {
    const row = (icon: Parameters<typeof overviewStepLine>[0]["icon"], statusLabel: string) =>
      sidebarStepLine({
        icon,
        activity: null,
        lastError: null,
        blockedOnThreadWait: false,
        statusLabel,
      });
    expect(row("approval", "Approval")).toEqual({ tone: "needs-you", text: "Approval" });
    expect(row("waiting", "Waiting")).toEqual({ tone: "dim", text: "Waiting" });
    expect(row("woke", "Woke")).toBeNull();
    expect(row("working", "Working")).toEqual({ tone: "dim", text: "Thinking" });
  });
});

describe("overviewWaitStrip", () => {
  it("names the one task a waiting run holds for, by kind", () => {
    expect(
      overviewWaitStrip([
        { taskId: "a", kind: "command", description: "cd /repo && vp run check:changed" },
      ]),
    ).toEqual({ icon: "command", text: "vp run check:changed", code: true, meta: "running" });
    expect(
      overviewWaitStrip([
        { taskId: "b", kind: "monitor", description: "Watching pull request #25862" },
      ]),
    ).toEqual({ icon: "pull-request", text: "PR #25862 checks", code: false, meta: "watching" });
    expect(overviewWaitStrip([{ taskId: "c", kind: "monitor" }])).toEqual({
      icon: "monitor",
      text: "a monitor",
      code: false,
      meta: "watching",
    });
    expect(overviewWaitStrip([])).toBeNull();
  });

  it("lists two tasks and counts the rest", () => {
    expect(
      overviewWaitStrip([
        { taskId: "a", kind: "command", description: "vp test run" },
        { taskId: "b", kind: "monitor", description: "Watching pull request #812" },
        { taskId: "c", kind: "background_task" },
      ]),
    ).toEqual({
      icon: "many",
      text: "vp test run, PR #812 checks, 1 more",
      code: false,
      meta: null,
    });
  });
});

describe("orderOverviewProjects", () => {
  const project = (projectKey: string, createdAt: string, members = [projectKey]) => ({
    projectKey,
    createdAt,
    memberProjects: members.map((physicalProjectKey) => ({ physicalProjectKey })),
  });

  it("keeps the dragged order and puts unplaced projects after it, oldest first", () => {
    const projects = [
      project("new", "2026-10-03"),
      project("b", "2026-10-02"),
      project("old", "2026-10-01"),
      project("a", "2026-10-04", ["a-laptop", "a-studio"]),
    ];
    expect(
      orderOverviewProjects(projects, ["a-studio", "b", "gone"]).map((p) => p.projectKey),
    ).toEqual(["a", "b", "old", "new"]);
  });
});

describe("overview split", () => {
  const split = { top: 100, height: 600 };

  it("sizes the pane from the pointer and keeps room for the grid", () => {
    expect(overviewSplitDragFraction(400, split)).toBe(0.5);
    expect(overviewSplitDragFraction(800, split)).toBe(0);
    expect(overviewSplitDragFraction(0, split)).toBe(1 - 96 / 600);
  });

  it("snaps shut when released near the bottom and holds a minimum size otherwise", () => {
    expect(resolveOverviewSplitRelease(0, 600)).toBeNull();
    expect(resolveOverviewSplitRelease(100 / 600, 600)).toBeNull();
    expect(resolveOverviewSplitRelease(130 / 600, 600)).toBe(160 / 600);
    expect(resolveOverviewSplitRelease(0.5, 600)).toBe(0.5);
  });
});

describe("overviewStrobeDelay", () => {
  it("keeps a card's lights off each other's beat", () => {
    // The card light, the lead, and four subagents; a flash lasts 5% of the 1200ms cycle.
    const delays = [0, 1, 2, 3, 4, 5].map((slot) =>
      Number(overviewStrobeDelay("env-1:thread-1", slot).replace("ms", "")),
    );
    for (const [i, a] of delays.entries()) {
      for (const b of delays.slice(i + 1)) {
        const apart = Math.abs(a - b) % 1200;
        expect(Math.min(apart, 1200 - apart)).toBeGreaterThan(60);
      }
    }
  });
});
