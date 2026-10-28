import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { undoSafeSend, useSafeSendStore, waitForSafeSend } from "./safeSend";

describe("safe send", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends after the delay unless undone, and keeps each message's wait separate", async () => {
    vi.useFakeTimers({ now: 10_000 });
    const first = waitForSafeSend("first", 3_000);
    const second = waitForSafeSend("second", 3_000);
    expect(useSafeSendStore.getState().sendAtByMessageId).toEqual({
      first: 13_000,
      second: 13_000,
    });

    expect(undoSafeSend("first")).toBe(true);
    await expect(first).resolves.toBe("undo");
    expect(undoSafeSend("first")).toBe(false);

    vi.advanceTimersByTime(3_000);
    await expect(second).resolves.toBe("send");
    expect(undoSafeSend("second")).toBe(false);
    expect(useSafeSendStore.getState().sendAtByMessageId).toEqual({});
  });
});
