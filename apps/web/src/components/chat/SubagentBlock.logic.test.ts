import { describe, expect, it } from "vite-plus/test";

import {
  selectSubagentsById,
  subagentBlockSummary,
  subagentDetailLine,
  subagentRowState,
} from "./SubagentBlock.logic";

describe("subagentBlockSummary", () => {
  it("counts queued and waiting agents as running and leaves out empty states", () => {
    expect(subagentBlockSummary(["running", "pending", "waiting", "completed"])).toBe(
      "3 running, 1 done",
    );
    expect(subagentBlockSummary(["failed", "completed", "cancelled", "interrupted"])).toBe(
      "1 done, 1 failed, 2 stopped",
    );
  });

  it("counts idle agents as idle, not done", () => {
    expect(subagentRowState("idle")).toBe("idle");
    expect(subagentBlockSummary(["idle", "completed", "idle"])).toBe("2 idle, 1 done");
  });
});

describe("selectSubagentsById", () => {
  it("keeps the previous picks until one of this block's subagents changes", () => {
    const first = { id: "a", progress: "one" };
    const second = { id: "b", progress: "one" };
    const other = { id: "c", progress: "one" };
    const pick = selectSubagentsById<{ id: string; progress: string }>(["a", "b", "missing"]);

    const initial = pick([first, second, other]);
    expect(initial).toEqual([first, second, null]);
    expect(pick([first, second, { ...other, progress: "two" }])).toBe(initial);

    const changed = { ...second, progress: "two" };
    expect(pick([first, changed, other])).toEqual([first, changed, null]);
    expect(pick(undefined)).toEqual([null, null, null]);
  });
});

describe("subagentDetailLine", () => {
  it("shows the step while running or idle and the result once settled", () => {
    const input = { result: "Found **2** issues", progress: "Running `vp test`" };
    expect(subagentDetailLine({ ...input, state: "running" })).toBe("Running vp test");
    expect(subagentDetailLine({ ...input, state: "idle" })).toBe("Running vp test");
    expect(subagentDetailLine({ ...input, state: "done" })).toBe("Found **2** issues");
  });

  it("hides the generic end-of-task line", () => {
    expect(
      subagentDetailLine({
        state: "done",
        result: "Child task ended with status completed",
        progress: undefined,
      }),
    ).toBeNull();
  });
});
