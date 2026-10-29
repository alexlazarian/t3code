import { describe, expect, it } from "vite-plus/test";

import type { SidebarStatusLabel } from "../sidebar/threadStatusLabel";
import { resolveThreadHeaderStatus } from "./threadHeaderStatus.logic";

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
      }),
    ).toEqual({ tone: "working" });
  });

  it("shows an idle light for a snoozed or settled thread", () => {
    expect(
      resolveThreadHeaderStatus({
        live: done,
        snoozedUntil: "2026-10-29T23:00:00Z",
        isSettled: false,
      }),
    ).toEqual({ tone: "idle" });
    expect(resolveThreadHeaderStatus({ live: done, snoozedUntil: null, isSettled: true })).toEqual({
      tone: "idle",
    });
  });

  it("lets the live status replace snoozed once the thread wakes", () => {
    expect(resolveThreadHeaderStatus({ live: woke, snoozedUntil: null, isSettled: false })).toEqual(
      { tone: "idle" },
    );
  });

  it("maps Done to the done light and returns null with nothing to show", () => {
    expect(resolveThreadHeaderStatus({ live: done, snoozedUntil: null, isSettled: false })).toEqual(
      { tone: "done" },
    );
    expect(
      resolveThreadHeaderStatus({ live: null, snoozedUntil: null, isSettled: false }),
    ).toBeNull();
  });
});
