import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { isOverviewPathname, pickLastVisitedThread } from "./threadView";

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
});
