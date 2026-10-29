import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import {
  __resetCurrentThreadForTests,
  currentThreadKey,
  isOverviewPathname,
  noteOverviewSplitClosed,
  noteOverviewSplitOpened,
  noteThreadRouteOpened,
  overviewSplitThreadKey,
  pickLastVisitedThread,
  pickListThread,
  subscribeOverviewSplit,
} from "./threadView";

describe("threadView", () => {
  it("recognizes the overview route", () => {
    expect(isOverviewPathname("/overview")).toBe(true);
    expect(isOverviewPathname("/env-1/thread-1")).toBe(false);
  });

  describe("pickLastVisitedThread", () => {
    const shell = (id: string, lastVisitedAt: string | null, archivedAt: string | null = null) => ({
      environmentId: "env-1" as EnvironmentId,
      id: id as ThreadId,
      archivedAt,
      lastVisitedAt,
    });

    it("skips archived threads", () => {
      const picked = pickLastVisitedThread([
        shell("old", "2026-01-01T00:00:00Z"),
        shell("archived", "2026-02-01T00:00:00Z", "2026-02-02T00:00:00Z"),
      ]);
      expect(picked?.threadId).toBe("old");
    });

    it("ignores threads that were never visited", () => {
      expect(pickLastVisitedThread([shell("a", null)])).toBeNull();
    });

    it("picks the most recent visit", () => {
      const picked = pickLastVisitedThread([
        shell("a", "2026-01-01T00:00:00Z"),
        shell("b", "2026-03-01T00:00:00Z"),
        shell("c", "2026-02-01T00:00:00Z"),
      ]);
      expect(picked?.threadId).toBe("b");
    });
  });

  describe("the current thread both views share", () => {
    const env = "env-1" as EnvironmentId;
    const ref = (id: string) => ({ environmentId: env, threadId: id as ThreadId });
    const shell = (id: string, lastVisitedAt: string | null = null) => ({
      environmentId: env,
      id: id as ThreadId,
      archivedAt: null,
      lastVisitedAt,
    });
    const key = (id: string) => `${env}:${id}`;

    it("follows the last thread opened from either view", () => {
      __resetCurrentThreadForTests();
      noteThreadRouteOpened(ref("a"));
      expect(overviewSplitThreadKey()).toBe(key("a"));
      noteOverviewSplitOpened(ref("b"));
      expect(pickListThread([shell("a", "2026-03-01T00:00:00Z"), shell("b")])?.threadId).toBe("b");
    });

    it("keeps the split closed until a different thread opens", () => {
      __resetCurrentThreadForTests();
      noteOverviewSplitOpened(ref("a"));
      noteOverviewSplitClosed();
      expect(overviewSplitThreadKey()).toBeNull();
      expect(currentThreadKey()).toBe(key("a"));
      // Switching to List lands on the same thread; that is not a new open.
      noteThreadRouteOpened(ref("a"));
      expect(overviewSplitThreadKey()).toBeNull();
      expect(pickListThread([shell("a")])?.threadId).toBe("a");
      noteThreadRouteOpened(ref("b"));
      expect(overviewSplitThreadKey()).toBe(key("b"));
    });

    it("notifies split listeners on open and close", () => {
      __resetCurrentThreadForTests();
      let calls = 0;
      const unsubscribe = subscribeOverviewSplit(() => {
        calls += 1;
      });
      noteOverviewSplitOpened(ref("a"));
      expect(calls).toBe(1);
      noteOverviewSplitOpened(ref("a"));
      expect(calls).toBe(1);
      noteOverviewSplitClosed();
      expect(calls).toBe(2);
      unsubscribe();
      noteOverviewSplitOpened(ref("b"));
      expect(calls).toBe(2);
    });

    it("falls back to the last visit when the current thread is gone", () => {
      __resetCurrentThreadForTests();
      noteThreadRouteOpened(ref("gone"));
      expect(pickListThread([shell("a", "2026-01-01T00:00:00Z")])?.threadId).toBe("a");
    });
  });
});
