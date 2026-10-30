import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import type { VisitThreadInput } from "../operations/commands.ts";
import { claimThreadOpen } from "./threadSearch.ts";
import {
  createThreadVisitTracker,
  isThreadUnread,
  type ThreadReadStateInput,
  threadUnreadWatermark,
  VISIT_DISPATCH_THROTTLE_MS,
} from "./threadVisits.ts";

const environmentId = EnvironmentId.make("env-visits");

interface Shell {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly updatedAt: string;
  readonly lastVisitedAt?: string | null;
  readonly latestRun: { readonly completedAt: string | null } | null;
  readonly wokeAt?: string | null;
  readonly hasPendingApprovals?: boolean;
  readonly pendingSubagentRequest?: string | null;
  readonly runtime?: { readonly status: "running" | "waiting" | "completed" } | null;
}

function at(seconds: number) {
  return `2026-01-01T00:00:${String(seconds).padStart(2, "0")}.000Z`;
}

// claimThreadOpen dedupes per thread in module state, so each test opens its own thread.
function setup(threadName: string, initial: Omit<Shell, "environmentId" | "id"> | null) {
  vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
  const threadId = ThreadId.make(threadName);
  const ref = { environmentId, threadId };
  const shellAtom = Atom.make<Shell | null>(
    initial === null ? null : { environmentId, id: threadId, ...initial },
  );
  const visits: Array<VisitThreadInput> = [];
  const localVisits: Array<string> = [];
  const tracker = createThreadVisitTracker({
    threadShellAtom: () => shellAtom,
    visit: {
      label: "test-visit",
      run: async (_registry, value) => {
        visits.push(value.input);
        return AsyncResult.success(undefined);
      },
    },
    markLocalVisit: (_ref, visitedAt) => localVisits.push(visitedAt),
  });
  const registry = AtomRegistry.make();
  return {
    ref,
    visits,
    localVisits,
    mount: () => registry.mount(tracker(ref)),
    update: (patch: Partial<Shell>) => {
      const current = registry.get(shellAtom);
      registry.set(shellAtom, {
        environmentId,
        id: threadId,
        updatedAt: at(0),
        latestRun: null,
        ...current,
        ...patch,
      });
    },
    [Symbol.dispose]: () => vi.useRealTimers(),
  };
}

it("records the open once, then throttles streaming visits", () => {
  using t = setup("thread-throttle", {
    updatedAt: at(10),
    lastVisitedAt: at(0),
    latestRun: null,
  });
  t.mount();
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(10), opened: true }]);

  vi.advanceTimersByTime(1_000);
  t.update({ updatedAt: at(11) });
  t.update({ updatedAt: at(12) });
  expect(t.visits).toHaveLength(1);

  vi.advanceTimersByTime(VISIT_DISPATCH_THROTTLE_MS - 1_000);
  expect(t.visits.slice(1)).toEqual([{ threadId: t.ref.threadId, visitedAt: at(12) }]);
});

it.each([
  ["completion", { latestRun: { completedAt: at(20) } }],
  ["approval request", { hasPendingApprovals: true }],
] as const)("sends an unseen %s without waiting for the throttle", (name, outcome) => {
  using t = setup(`thread-outcome-${name}`, {
    updatedAt: at(10),
    lastVisitedAt: at(0),
    latestRun: null,
  });
  t.mount();
  t.update({ updatedAt: at(20), ...outcome });
  expect(t.visits.slice(1)).toEqual([{ threadId: t.ref.threadId, visitedAt: at(20) }]);
});

it("throttles a subagent request while the parent keeps running", () => {
  using t = setup("thread-subagent-running", {
    updatedAt: at(10),
    lastVisitedAt: at(0),
    latestRun: null,
    runtime: { status: "running" },
  });
  t.mount();
  t.update({ updatedAt: at(11), pendingSubagentRequest: "approval" });
  t.update({ updatedAt: at(12) });
  expect(t.visits).toHaveLength(1);

  vi.advanceTimersByTime(VISIT_DISPATCH_THROTTLE_MS);
  expect(t.visits.slice(1)).toEqual([{ threadId: t.ref.threadId, visitedAt: at(12) }]);
});

it("does not resend the open a palette pick already sent", () => {
  using t = setup("thread-palette", { updatedAt: at(10), lastVisitedAt: at(0), latestRun: null });
  claimThreadOpen(environmentId, t.ref.threadId, Date.UTC(2026, 0, 1));
  t.mount();
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(10) }]);
});

it("keeps a mark-unread on the open thread until new activity lands", () => {
  using t = setup("thread-unread", { updatedAt: at(10), lastVisitedAt: at(0), latestRun: null });
  t.mount();
  t.update({ lastVisitedAt: at(10) });
  t.update({ lastVisitedAt: at(5) });
  vi.advanceTimersByTime(VISIT_DISPATCH_THROTTLE_MS);
  expect(t.visits).toHaveLength(1);

  t.update({ updatedAt: at(30) });
  expect(t.visits.slice(1)).toEqual([{ threadId: t.ref.threadId, visitedAt: at(30) }]);
});

it("keeps mark unread sticky after an expired wake is retired", () => {
  using t = setup("thread-unread-retired-wake", {
    updatedAt: at(10),
    lastVisitedAt: at(0),
    latestRun: { completedAt: at(9) },
    wokeAt: at(15),
  });
  t.mount();
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(15), opened: true }]);
  t.update({ lastVisitedAt: at(15) });
  t.update({ lastVisitedAt: at(8), wokeAt: null });
  vi.advanceTimersByTime(VISIT_DISPATCH_THROTTLE_MS);
  expect(t.visits).toHaveLength(1);

  t.update({ updatedAt: at(30) });
  expect(t.visits.slice(1)).toEqual([{ threadId: t.ref.threadId, visitedAt: at(30) }]);
});

it("waits for the shell and records local visits for servers without tracking", () => {
  using t = setup("thread-local", null);
  t.mount();
  expect(t.visits).toEqual([]);
  t.update({ updatedAt: at(10), latestRun: null });
  t.update({ updatedAt: at(11) });
  expect(t.visits).toEqual([]);
  expect(t.localVisits).toEqual([at(10), at(11)]);
});

it("drops a pending visit when the thread is no longer viewed", () => {
  using t = setup("thread-unmount", { updatedAt: at(10), lastVisitedAt: at(0), latestRun: null });
  const unmount = t.mount();
  t.update({ updatedAt: at(11) });
  unmount();
  vi.advanceTimersByTime(VISIT_DISPATCH_THROTTLE_MS);
  expect(t.visits).toHaveLength(1);
});

it("sends the open with the first visit when the shell arrives after the thread is shown", () => {
  using t = setup("thread-shell-missing", null);
  t.mount();
  expect(claimThreadOpen(environmentId, t.ref.threadId, Date.UTC(2026, 0, 1))).toBe(false);
  expect(t.visits).toEqual([]);

  t.update({ updatedAt: at(10), lastVisitedAt: at(0), latestRun: null });
  expect(t.visits).toEqual([{ threadId: t.ref.threadId, visitedAt: at(10), opened: true }]);

  t.update({ updatedAt: at(10), lastVisitedAt: at(10) });
  vi.advanceTimersByTime(VISIT_DISPATCH_THROTTLE_MS);
  expect(t.visits).toHaveLength(1);
});

it("advances the watermark to a wake without waiting for the throttle", () => {
  using t = setup("thread-wake", { updatedAt: at(10), lastVisitedAt: at(0), latestRun: null });
  t.mount();
  t.update({ wokeAt: at(15) });
  expect(t.visits.slice(1)).toEqual([{ threadId: t.ref.threadId, visitedAt: at(15) }]);

  vi.advanceTimersByTime(1_000);
  t.update({ updatedAt: at(16) });
  expect(t.visits).toHaveLength(2);
});

const settled: ThreadReadStateInput = {
  updatedAt: at(30),
  lastVisitedAt: at(10),
  latestRun: { completedAt: at(20) },
  runtime: { status: "completed" },
};

it.each([
  ["a never-opened thread with an outcome", { lastVisitedAt: null }, true],
  ["a never-opened thread without one", { lastVisitedAt: null, latestRun: null }, false],
  ["a finished run after the visit", {}, true],
  ["a failed run after the visit", { runtime: { status: "failed" } }, true],
  ["a run visited after it finished", { lastVisitedAt: at(25) }, false],
  ["a rename after the visited finish", { lastVisitedAt: at(20), updatedAt: at(40) }, false],
  ["running with nothing pending", { latestRun: null, runtime: { status: "running" } }, false],
  [
    "a pending approval",
    { latestRun: null, runtime: { status: "running" }, hasPendingApprovals: true },
    true,
  ],
  [
    "pending user input",
    { latestRun: null, runtime: { status: "running" }, hasPendingUserInput: true },
    true,
  ],
  ["a subagent's request", { lastVisitedAt: at(25), pendingSubagentRequest: "approval" }, true],
  [
    "a subagent's request while the parent runs",
    { latestRun: null, runtime: { status: "running" }, pendingSubagentRequest: "approval" },
    false,
  ],
  [
    "a subagent's request while the parent is blocked",
    { latestRun: null, runtime: { status: "waiting" }, pendingSubagentRequest: "approval" },
    true,
  ],
  ["a request already seen", { lastVisitedAt: at(30), hasPendingUserInput: true }, false],
] as const)("%s is unread: %s", (_name, patch, unread) => {
  const thread = { ...settled, ...patch };
  expect(isThreadUnread(thread)).toBe(unread);
  const watermark = threadUnreadWatermark(thread);
  if (watermark !== null) {
    expect(isThreadUnread({ ...thread, lastVisitedAt: watermark })).toBe(true);
  }
});
