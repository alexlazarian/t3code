import { describe, expect, it } from "vite-plus/test";

import { findReusableProjectScriptTerminal } from "./projectScriptTerminal";

describe("findReusableProjectScriptTerminal", () => {
  it.each([
    {
      name: "reuses the terminal the right panel shows when it is idle",
      activeTerminalId: "term-2",
      panelTerminalIds: ["term-1", "term-2"],
      sessionTerminalIds: ["term-1", "term-2"],
      runningTerminalIds: [],
      expected: "term-2",
    },
    {
      name: "falls back to another idle panel terminal when the shown one is busy",
      activeTerminalId: "term-1",
      panelTerminalIds: ["term-1", "term-2"],
      sessionTerminalIds: [],
      runningTerminalIds: ["term-1"],
      expected: "term-2",
    },
    {
      name: "reuses an idle session no panel surface holds",
      activeTerminalId: null,
      panelTerminalIds: ["term-1"],
      sessionTerminalIds: ["term-1", "setup-1"],
      runningTerminalIds: ["term-1"],
      expected: "setup-1",
    },
    {
      name: "finds nothing when every terminal is busy",
      activeTerminalId: "term-1",
      panelTerminalIds: ["term-1"],
      sessionTerminalIds: ["term-1"],
      runningTerminalIds: ["term-1"],
      expected: null,
    },
  ])("$name", ({ expected, ...input }) => {
    expect(findReusableProjectScriptTerminal(input)).toBe(expected);
  });
});
