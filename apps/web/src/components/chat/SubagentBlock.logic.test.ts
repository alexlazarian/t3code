import { describe, expect, it } from "vite-plus/test";

import { subagentBlockSummary, subagentDetailLine } from "./SubagentBlock.logic";

describe("subagentBlockSummary", () => {
  it("counts queued and waiting agents as running and leaves out empty states", () => {
    expect(subagentBlockSummary(["running", "pending", "waiting", "completed"])).toBe(
      "3 running, 1 done",
    );
    expect(subagentBlockSummary(["failed", "completed", "cancelled", "idle"])).toBe(
      "2 done, 1 failed, 1 stopped",
    );
  });
});

describe("subagentDetailLine", () => {
  it("shows the step while running and the result once settled", () => {
    const input = { result: "Found **2** issues", progress: "Running `vp test`" };
    expect(subagentDetailLine({ ...input, settled: false })).toBe("Running vp test");
    expect(subagentDetailLine({ ...input, settled: true })).toBe("Found **2** issues");
  });

  it("hides the generic end-of-task line", () => {
    expect(
      subagentDetailLine({
        settled: true,
        result: "Child task ended with status completed",
        progress: undefined,
      }),
    ).toBeNull();
  });
});
