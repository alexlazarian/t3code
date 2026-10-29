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
import {
  DraftId,
  type ComposerThreadDraftState,
  type DraftSessionState,
} from "../../composerDraftStore";
import { partitionSidebarThreads } from "../Sidebar.logic";
import {
  buildOverviewGrid,
  overviewStrobeDelay,
  overviewSubagentState,
  isOverviewThreadOffline,
  moveOverviewFocus,
  NO_PROJECT_KEY,
  overviewColumnMachines,
  overviewDraftCards,
  overviewMachineSpans,
  overviewProjectKeyOf,
  overviewLight,
  orderOverviewProjects,
  overviewStepLine,
  sidebarStepLine,
  overviewWaitStrip,
  overviewSplitDragFraction,
  overviewRowOf,
  resolveOverviewPaneNav,
  resolveOverviewPaneTarget,
  resolveOverviewThreadStatus,
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

function grid(
  projects: ReturnType<typeof snapshots>,
  threads: ReadonlyArray<ReturnType<typeof makeThread>>,
  options: { workingShelf?: boolean; settledDoneLimit?: number; wokeAt?: string } = {},
) {
  return buildOverviewGrid({
    partition: partition(threads, options.workingShelf),
    projects,
    projectKeyOf: overviewProjectKeyOf(projects),
    visitOf: (thread) => ({
      lastVisitedAt: thread.lastVisitedAt ?? undefined,
      wokeAt: options.wokeAt ?? null,
    }),
    settledDoneLimit: options.settledDoneLimit ?? Number.POSITIVE_INFINITY,
  });
}

const ids = (row: { cells: ReadonlyMap<string, ReadonlyArray<{ id: string }>> } | undefined) =>
  [...(row?.cells.values() ?? [])].flat().map((thread) => thread.id);

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
    const board = grid(projects, threads);
    expect(board.columns).toHaveLength(1);
    expect(board.columns[0]?.counts.open).toBe(2);
    expect(
      board.rows.find((row) => row.key === "done")?.cells.get(projects[0]!.projectKey),
    ).toHaveLength(2);
  });

  it("puts each thread in its status row, in status order, and keeps empty rows", () => {
    const projects = snapshots([makeProject()]);
    const { rows } = grid(projects, [
      makeThread("done"),
      makeThread("waiting", { runtime: { ...runtime, status: "idle" } }),
      makeThread("working", { runtime }),
      makeThread("plan", { hasActionableProposedPlan: true }),
      makeThread("approval", { hasPendingApprovals: true }),
      makeThread("limited", {
        runtime: { ...runtime, status: "failed" as const, lastErrorClass: "usage_limit" as const },
      }),
      makeThread("failed", { runtime: { ...runtime, status: "failed" } }),
    ]);
    expect(rows.map((row) => [row.key, ids(row).toSorted()])).toEqual([
      ["failed", ["failed", "limited"]],
      ["needs-you", ["approval", "plan"]],
      ["working", ["working"]],
      ["waiting", ["waiting"]],
      ["done", ["done"]],
    ]);
    expect(grid(projects, []).rows.map((row) => [row.key, row.total])).toEqual([
      ["failed", 0],
      ["needs-you", 0],
      ["working", 0],
      ["waiting", 0],
      ["done", 0],
    ]);
  });

  it("keeps pinned and snoozed threads in their status row, pinned first", () => {
    const projects = snapshots([makeProject()]);
    const { rows } = grid(
      projects,
      [
        makeThread("working", { runtime, latestUserAuthoredMessageAt: "2026-03-09T12:00:00.000Z" }),
        makeThread("snoozed", { runtime, snoozedUntil: FUTURE }),
        makeThread("pinned", { runtime, pinnedAt: "2026-03-09T10:00:00.000Z" }),
      ],
      { workingShelf: true },
    );
    expect(ids(rows.find((row) => row.key === "working"))).toEqual([
      "pinned",
      "working",
      "snoozed",
    ]);
  });

  it("puts a woke thread under Needs you, from the same visit the card reads", () => {
    const projects = snapshots([makeProject()]);
    const wokeAt = "2026-03-09T10:00:00.000Z";
    const thread = makeThread("woke", { lastVisitedAt: "2026-03-09T09:00:00.000Z" });
    const { label } = resolveOverviewThreadStatus(thread, {
      lastVisitedAt: thread.lastVisitedAt ?? undefined,
      wokeAt,
    });
    expect(label?.icon).toBe("woke");
    expect(overviewRowOf(label?.icon ?? null)).toBe("needs-you");
    expect(ids(grid(projects, [thread], { wokeAt }).rows[1])).toEqual(["woke"]);
  });

  it("caps settled threads only in the Done row", () => {
    const projects = snapshots([makeProject()]);
    const settled = { settledOverride: "settled" as const };
    const board = grid(
      projects,
      [
        makeThread("s1", settled),
        makeThread("s2", settled),
        makeThread("s-failed", { ...settled, runtime: { ...runtime, status: "failed" } }),
      ],
      { settledDoneLimit: 1 },
    );
    expect(board.hiddenSettledCount).toBe(1);
    expect(board.rows.map((row) => [row.key, ids(row).length, row.total])).toEqual([
      ["failed", 1, 1],
      ["needs-you", 0, 0],
      ["working", 0, 0],
      ["waiting", 0, 0],
      ["done", 1, 2],
    ]);
    expect(board.columns[0]?.counts.open).toBe(0);
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
      makeThread("settled-working", { runtime, settledOverride: "settled" }),
    ];
    const board = grid(projects, threads);
    expect(board.columns.map((column) => column.counts)).toEqual([
      { open: 4, working: 1, needsYou: 2 },
      { open: 1, working: 1, needsYou: 0 },
    ]);
    expect(board.columns[1]?.lights).toEqual(["working"]);
    expect(board.columns[0]?.lights.toSorted()).toEqual(["needs-you", "needs-you", "working"]);
  });

  it("marks the Failed, Needs you and Working rows when they hold a card", () => {
    const projects = snapshots([makeProject()]);
    const urgency = (threads: ReturnType<typeof makeThread>[]) =>
      grid(projects, threads).rows.map((row) => [row.key, row.urgency]);
    expect(
      urgency([
        makeThread("failed", { runtime: { ...runtime, status: "failed" } }),
        makeThread("approval", { hasPendingApprovals: true }),
        makeThread("working", { runtime }),
        makeThread("waiting", { runtime: { ...runtime, status: "idle" } }),
        makeThread("done"),
      ]),
    ).toEqual([
      ["failed", "failed"],
      ["needs-you", "needs-you"],
      ["working", "working"],
      ["waiting", null],
      ["done", null],
    ]);
    expect(urgency([makeThread("done")])[0]).toEqual(["failed", null]);
  });

  it("adds a No project column last only when a thread matches no project", () => {
    const projects = snapshots([makeProject()]);
    const build = (threads: ReturnType<typeof makeThread>[]) => grid(projects, threads);
    expect(build([makeThread("a")]).columns.map((column) => column.projectKey)).toEqual([
      projects[0]!.projectKey,
    ]);
    const board = build([
      makeThread("a"),
      makeThread("lost", { projectId: ProjectId.make("gone") }),
    ]);
    expect(board.columns.map((column) => column.projectKey)).toEqual([
      projects[0]!.projectKey,
      NO_PROJECT_KEY,
    ]);
    expect(board.columns[1]?.counts.open).toBe(1);
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

describe("overview drafts", () => {
  const emptyComposer: ComposerThreadDraftState = {
    prompt: "",
    images: [],
    files: [],
    nonPersistedImageIds: [],
    persistedAttachments: [],
    terminalContexts: [],
    previewAnnotations: [],
    reviewComments: [],
    threadContexts: [],
    environmentContexts: [],
    modelSelectionByProvider: {},
    activeProvider: null,
    runtimeMode: null,
    interactionMode: null,
  };
  const session = (
    threadId: string,
    createdAt: string,
    overrides: Partial<DraftSessionState> = {},
  ): DraftSessionState => ({
    threadId: ThreadId.make(threadId),
    environmentId: envA,
    projectId: ProjectId.make("project-1"),
    logicalProjectKey: "project-1",
    createdAt,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    envMode: "local",
    startFromOrigin: false,
    ...overrides,
  });
  const keyOf = (draftId: string) => `${envA}:${draftId}`;
  const projectKeyOf = (ref: { projectId: ProjectId }) =>
    ref.projectId === "project-1" ? "P" : NO_PROJECT_KEY;
  const build = (
    sessions: Record<string, DraftSessionState>,
    composers: Record<string, ComposerThreadDraftState>,
    openThreadKey: string | null = null,
  ) => overviewDraftCards({ sessions, composers, projectKeyOf, openThreadKey });

  it("lists unsent drafts per project, newest first", () => {
    const sessions = {
      older: session("older", "2026-03-01T00:00:00.000Z"),
      newer: session("newer", "2026-03-02T00:00:00.000Z"),
      promoted: session("promoted", "2026-03-03T00:00:00.000Z", {
        promotedTo: { environmentId: envA, threadId: ThreadId.make("promoted") },
      }),
      empty: session("empty", "2026-03-04T00:00:00.000Z"),
      lost: session("lost", "2026-03-05T00:00:00.000Z", { projectId: ProjectId.make("gone") }),
    };
    const composers = {
      older: { ...emptyComposer, prompt: "first\nsecond" },
      newer: { ...emptyComposer, prompt: "hello" },
      promoted: { ...emptyComposer, prompt: "sent" },
      empty: emptyComposer,
      lost: { ...emptyComposer, prompt: "orphan" },
    };
    expect(build(sessions, composers).get("P")).toEqual([
      {
        draftId: DraftId.make("newer"),
        threadKey: keyOf("newer"),
        preview: "hello",
        createdAt: "2026-03-02T00:00:00.000Z",
      },
      {
        draftId: DraftId.make("older"),
        threadKey: keyOf("older"),
        preview: "first",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
    ]);
    expect(build(sessions, composers).has(NO_PROJECT_KEY)).toBe(false);
  });

  it("resolves the pane through draft promotion", () => {
    const threadKey = keyOf("d");
    const draftId = DraftId.make("d");
    const none = {
      serverThreadKeys: new Set<string>(),
      draftIdByThreadKey: new Map<string, DraftId>(),
      promotedThreadKeys: new Set<string>(),
      seenServerThreadKeys: new Set<string>(),
    };
    expect(
      resolveOverviewPaneTarget(threadKey, {
        ...none,
        draftIdByThreadKey: new Map([[threadKey, draftId]]),
      }),
    ).toEqual({ kind: "draft", threadKey, draftId });
    expect(
      resolveOverviewPaneTarget(threadKey, { ...none, promotedThreadKeys: new Set([threadKey]) }),
    ).toEqual({ kind: "pending", threadKey });
    expect(
      resolveOverviewPaneTarget(threadKey, {
        serverThreadKeys: new Set([threadKey]),
        draftIdByThreadKey: new Map([[threadKey, draftId]]),
        promotedThreadKeys: new Set([threadKey]),
        seenServerThreadKeys: new Set<string>(),
      }),
    ).toEqual({ kind: "server", threadKey });
    expect(
      resolveOverviewPaneTarget(threadKey, {
        ...none,
        promotedThreadKeys: new Set([threadKey]),
        seenServerThreadKeys: new Set([threadKey]),
      }),
    ).toBeNull();
    expect(resolveOverviewPaneTarget(threadKey, none)).toBeNull();
    expect(resolveOverviewPaneTarget(null, none)).toBeNull();
  });

  it("shows an empty draft only while it is open in the pane", () => {
    const sessions = { empty: session("empty", "2026-03-04T00:00:00.000Z") };
    const composers = { empty: emptyComposer };
    expect(build(sessions, composers).size).toBe(0);
    expect(build(sessions, composers, keyOf("empty")).get("P")?.[0]?.preview).toBe("");
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

describe("overview pane nav", () => {
  const projects = snapshots([
    makeProject(),
    makeProject({ id: ProjectId.make("project-2"), title: "other", workspaceRoot: "/tmp/other" }),
  ]);
  const inProject2 = { projectId: ProjectId.make("project-2") };
  const key = (id: string) => `${envA}:${id}`;
  const board = (threads: ReadonlyArray<ReturnType<typeof makeThread>>) => {
    const { rows, columns } = grid(projects, threads);
    return (id: string, collapsed: ReadonlyArray<string> = []) =>
      resolveOverviewPaneNav({
        rows,
        columns,
        isExpanded: (row) => !collapsed.includes(row),
        key: key(id),
      });
  };
  const settled = { settledOverride: "settled" as const };
  const working = (id: string, overrides: ThreadFixtureOverrides = {}) =>
    makeThread(id, { runtime, ...overrides });

  it("walks a row column by column, then into the next row", () => {
    const nav = board([
      working("a1"),
      working("a2"),
      working("b1", inProject2),
      makeThread("s1", settled),
    ]);
    expect(nav("a2")).toMatchObject({
      row: "working",
      index: 2,
      count: 3,
      previousKey: key("a1"),
      nextKey: key("b1"),
    });
    expect(nav("b1")?.nextKey).toBe(key("s1"));
  });

  it("stops at the first and last card", () => {
    const nav = board([working("a1"), makeThread("s1", settled)]);
    expect(nav("a1")?.previousKey).toBeNull();
    expect(nav("s1")?.nextKey).toBeNull();
  });

  it("skips collapsed rows", () => {
    const nav = board([working("a1"), makeThread("s1", settled), working("a2")]);
    expect(nav("a1", ["done"])?.nextKey).toBe(key("a2"));
    expect(nav("a2", ["working"])?.previousKey).toBeNull();
  });

  it("keeps neighbors for a card in a collapsed row", () => {
    const nav = board([working("a1"), working("a2"), makeThread("s1", settled)]);
    expect(nav("s1", ["done"])).toMatchObject({
      row: "done",
      index: 1,
      count: 1,
      previousKey: key("a2"),
      nextKey: null,
    });
  });

  it("returns null for a key that is not on the board", () => {
    expect(board([makeThread("a1")])("missing")).toBeNull();
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
