import { describe, expect, it } from "vite-plus/test";

import type { SidebarStatusLabel } from "../sidebar/threadStatusLabel";
import { resolveThreadHeaderStatus } from "./threadHeaderStatus.logic";

const now = new Date("2026-10-29T09:00:00Z");
const working: SidebarStatusLabel = {
  label: "Working",
  icon: "working",
  className: "text-status-working",
};
const woke: SidebarStatusLabel = {
  label: "Woke",
  icon: "woke",
  className: "text-warning-foreground",
};
const done: SidebarStatusLabel = { label: "Done", icon: "done", className: "text-foreground" };

describe("resolveThreadHeaderStatus", () => {
  it("keeps live work ahead of snoozed and settled", () => {
    expect(
      resolveThreadHeaderStatus({
        live: working,
        snoozedUntil: "2026-10-30T09:00:00Z",
        isSettled: true,
        now,
      }),
    ).toMatchObject({ label: "Working", tone: "working" });
  });

  it("names the time left for a snoozed thread", () => {
    expect(
      resolveThreadHeaderStatus({
        live: done,
        snoozedUntil: "2026-10-29T23:00:00Z",
        isSettled: false,
        now,
      }),
    ).toEqual({ label: "Snoozed, 14h left", tone: "idle", className: "text-muted-foreground" });
  });

  it("calls a settled thread Settled", () => {
    expect(
      resolveThreadHeaderStatus({ live: done, snoozedUntil: null, isSettled: true, now }),
    ).toMatchObject({ label: "Settled", tone: "idle" });
  });

  it("lets the live label replace snoozed once the thread wakes", () => {
    expect(
      resolveThreadHeaderStatus({ live: woke, snoozedUntil: null, isSettled: false, now }),
    ).toMatchObject({ label: "Woke", tone: "idle" });
  });

  it("maps Done to the done light and returns null with nothing to show", () => {
    expect(
      resolveThreadHeaderStatus({ live: done, snoozedUntil: null, isSettled: false, now }),
    ).toMatchObject({ label: "Done", tone: "done" });
    expect(
      resolveThreadHeaderStatus({ live: null, snoozedUntil: null, isSettled: false, now }),
    ).toBeNull();
  });
});
