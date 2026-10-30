import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadActionMenuItems,
  buildThreadActionStrip,
  THREAD_STRIP_ACTION_IDS,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  readState: "read",
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it.each([
    [null, ["regenerate-title", "mark-unread", "auto-settle", "|copy", "project-settings"]],
    [
      "main",
      [
        "new-thread-on-branch",
        "|regenerate-title",
        "mark-unread",
        "auto-settle",
        "|copy",
        "project-settings",
      ],
    ],
  ] as const)(
    "overflow menu omits strip actions without dangling separators (branch: %s)",
    (branch, expected) => {
      for (const reversed of [false, true]) {
        const items = buildThreadActionMenuItems(
          {
            ...baseState,
            branch,
            isPinned: reversed,
            isSettled: reversed,
            isSnoozed: reversed,
          },
          THREAD_STRIP_ACTION_IDS,
        );
        expect(items.map((item) => `${item.separatorBefore ? "|" : ""}${item.id}`)).toEqual([
          ...expected,
          "|archive",
          "delete",
        ]);
      }
    },
  );

  it.each([
    ["unread", ["mark-read"]],
    ["read", ["mark-unread"]],
    ["none", []],
  ] as const)("offers the way out of a %s thread", (readState, expected) => {
    const ids = buildThreadActionMenuItems({ ...baseState, readState }).map((item) => item.id);
    expect(ids.filter((id) => id === "mark-read" || id === "mark-unread")).toEqual(expected);
  });

  it("disables archive while the thread is running", () => {
    const archiveItem = buildThreadActionMenuItems({ ...baseState, isRunning: true }).find(
      (item) => item.id === "archive",
    );
    expect(archiveItem?.disabled).toBe(true);
  });
});

describe("buildThreadActionStrip", () => {
  it.each([
    [{ isSettled: true }, "Un-settle"],
    [{ isSnoozed: true }, "Wake"],
    [{ isPinned: true }, "Unpin"],
  ] as const)("shows %o pressed as the way back", (flags, label) => {
    const action = buildThreadActionStrip({ ...baseState, ...flags }).find(
      (item) => item.label === label,
    );
    expect(action).toMatchObject({ label, pressed: true, disabled: false });
  });

  it("disables lifecycle and rename without permission", () => {
    const strip = buildThreadActionStrip({
      ...baseState,
      canOperate: false,
    });
    expect(strip.map((item) => [item.id, item.disabled])).toEqual([
      ["settle", true],
      ["snooze", true],
      ["pin", true],
      ["rename", true],
    ]);
  });

  it("drops actions the environment does not support and disables Snooze when it cannot snooze now", () => {
    expect(
      buildThreadActionStrip({
        ...baseState,
        supports: { ...baseState.supports, settlement: false, pinning: false },
      }).map((item) => item.id),
    ).toEqual(["snooze", "rename"]);
    expect(
      buildThreadActionStrip({ ...baseState, canSnoozeNow: false }).find(
        (item) => item.id === "snooze",
      )?.disabled,
    ).toBe(true);
  });
});
