import { describe, expect, it } from "vite-plus/test";

import { isSidebarThreadWoke, resolveSidebarStatusLabel } from "./threadStatusLabel";

const quiet = { goalActive: false, isWoke: false, isUnread: false };

describe("resolveSidebarStatusLabel", () => {
  it("uses the sidebar's words for each live status", () => {
    expect(
      (["working", "waiting", "approval", "input", "request", "limited", "failed"] as const).map(
        (status) => resolveSidebarStatusLabel({ ...quiet, status })?.label,
      ),
    ).toEqual(["Working", "Waiting", "Approval", "Input", "Request", "Limited", "Failed"]);
  });

  it("calls a working thread with an active goal Goal", () => {
    expect(
      resolveSidebarStatusLabel({ ...quiet, status: "working", goalActive: true })?.label,
    ).toBe("Goal");
  });

  it("lets a live status outrank woke and unread", () => {
    expect(
      resolveSidebarStatusLabel({
        status: "approval",
        goalActive: false,
        isWoke: true,
        isUnread: true,
      })?.label,
    ).toBe("Approval");
  });

  it("shows Woke before Done for a ready thread, and nothing when neither applies", () => {
    expect(
      resolveSidebarStatusLabel({ ...quiet, status: "ready", isWoke: true, isUnread: true })?.label,
    ).toBe("Woke");
    expect(resolveSidebarStatusLabel({ ...quiet, status: "ready", isUnread: true })?.label).toBe(
      "Done",
    );
    expect(resolveSidebarStatusLabel({ ...quiet, status: "ready" })).toBeNull();
  });

  it("files limited under the failed icon", () => {
    expect(resolveSidebarStatusLabel({ ...quiet, status: "limited" })?.icon).toBe("failed");
  });
});

describe("isSidebarThreadWoke", () => {
  const wokeAt = "2026-10-27T10:00:00.000Z";

  it("is woke until the thread is visited after the wake", () => {
    expect(isSidebarThreadWoke({ wokeAt, lastVisitedAt: undefined, settledOverride: null })).toBe(
      true,
    );
    expect(
      isSidebarThreadWoke({
        wokeAt,
        lastVisitedAt: "2026-10-27T09:00:00.000Z",
        settledOverride: null,
      }),
    ).toBe(true);
    expect(
      isSidebarThreadWoke({
        wokeAt,
        lastVisitedAt: "2026-10-27T11:00:00.000Z",
        settledOverride: null,
      }),
    ).toBe(false);
  });

  it("is never woke without a wake time or once settled", () => {
    expect(
      isSidebarThreadWoke({ wokeAt: null, lastVisitedAt: undefined, settledOverride: null }),
    ).toBe(false);
    expect(
      isSidebarThreadWoke({ wokeAt, lastVisitedAt: undefined, settledOverride: "settled" }),
    ).toBe(false);
  });
});
