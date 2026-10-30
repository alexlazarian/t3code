import type { OrchestrationV2ShellSubagent } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";

import "~/index.css";
import { render } from "../../../test/render";
import { overviewSubagentTree } from "./Overview.logic";
import { SubagentRows } from "./OverviewSubagents";

const subagent = (
  title: string,
  threadId: string | null,
  parentThreadId?: string,
): OrchestrationV2ShellSubagent => ({
  threadId: threadId === null ? null : ThreadId.make(threadId),
  ...(parentThreadId === undefined ? {} : { parentThreadId: ThreadId.make(parentThreadId) }),
  title,
  status: "running",
  step: null,
  startedAt: null,
  completedAt: null,
});

it("orders subagents under their parent, whatever order they arrive in", () => {
  const rows = overviewSubagentTree([
    subagent("Deep", "grandchild", "child"),
    subagent("Other", "other"),
    subagent("Child", "child"),
    subagent("Orphan", "orphan", "missing"),
  ]);
  expect(rows.map(({ subagent: { title }, depth }) => [title, depth])).toEqual([
    ["Other", 0],
    ["Child", 0],
    ["Deep", 1],
    ["Orphan", 1],
  ]);
});

it("indents a nested subagent under its parent", async () => {
  const subagents = [subagent("Child", "child"), subagent("Deep", "grandchild", "child")];
  await using screen = await render(
    <SubagentRows
      threadKey="env:thread"
      subagents={subagents}
      subagentCount={2}
      onOpen={() => {}}
    />,
    { router: false },
  );

  const buttons = Array.from(screen.container.querySelectorAll("button"));
  expect(buttons.map((button) => button.textContent?.startsWith("Deep"))).toEqual([false, true]);
  const left = (button: HTMLElement) => button.getBoundingClientRect().left;
  const title = (button: HTMLElement) => button.querySelector("span")!.getBoundingClientRect().left;
  expect(title(buttons[1]!)).toBeGreaterThan(title(buttons[0]!) + 8);
  expect(left(buttons[1]!)).toBe(left(buttons[0]!));
});
