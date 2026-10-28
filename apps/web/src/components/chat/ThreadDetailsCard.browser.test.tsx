import { StrictMode } from "react";
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import { PopoverCreateHandle } from "../ui/popover";
import { ThreadDetailsCard } from "./ThreadDetailsCard";

const threadA: ScopedThreadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread-a"),
};
const threadB: ScopedThreadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread-b"),
};

function setup() {
  useRightPanelStore.setState({ threadPanelOpenByThreadKey: {} });
  const anchor = document.createElement("div");
  document.body.append(anchor);
  return {
    anchor: { current: anchor },
    handle: PopoverCreateHandle(),
    [Symbol.dispose]: () => anchor.remove(),
  };
}

const popoverOpen = (threadRef: ScopedThreadRef) =>
  selectThreadPanelOpen(useRightPanelStore.getState().threadPanelOpenByThreadKey, threadRef);

const setOpen = (threadRef: ScopedThreadRef, open: boolean) =>
  act(() => useRightPanelStore.getState().setThreadPanelOpen(threadRef, open));

function Card({
  threadRef,
  fixture,
}: {
  threadRef: ScopedThreadRef;
  fixture: ReturnType<typeof setup>;
}) {
  return (
    // The web root renders in StrictMode, which re-runs ref callbacks on every mount.
    <StrictMode>
      <ThreadDetailsCard threadRef={threadRef} anchor={fixture.anchor} handle={fixture.handle}>
        {() => <p>Details for {threadRef.threadId}</p>}
      </ThreadDetailsCard>
    </StrictMode>
  );
}

it("stays open once opened", async () => {
  using fixture = setup();
  await using _screen = await render(<Card threadRef={threadB} fixture={fixture} />);
  await setOpen(threadB, true);
  await expect.element(page.getByText("Details for thread-b")).toBeVisible();
  expect(popoverOpen(threadB)).toBe(true);
});

it("closes on Escape and clears the open flag", async () => {
  using fixture = setup();
  await using _screen = await render(<Card threadRef={threadB} fixture={fixture} />);
  await setOpen(threadB, true);
  await expect.element(page.getByText("Details for thread-b")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByText("Details for thread-b")).not.toBeInTheDocument();
  expect(popoverOpen(threadB)).toBe(false);
});

it("removes the leaving thread's popup on a thread switch", async () => {
  using fixture = setup();
  await using screen = await render(<Card threadRef={threadB} fixture={fixture} />);
  await setOpen(threadB, true);
  await expect.element(page.getByText("Details for thread-b")).toBeVisible();

  await screen.rerender(<Card threadRef={threadA} fixture={fixture} />);
  await expect.element(page.getByText("Details for thread-b")).not.toBeInTheDocument();
  await expect.element(page.getByText("Details for thread-a")).not.toBeInTheDocument();
});

it("reopens after a normal close", async () => {
  using fixture = setup();
  await using _screen = await render(<Card threadRef={threadB} fixture={fixture} />);
  await setOpen(threadB, true);
  await expect.element(page.getByText("Details for thread-b")).toBeVisible();
  await setOpen(threadB, false);
  await expect.element(page.getByText("Details for thread-b")).not.toBeInTheDocument();
  await setOpen(threadB, true);
  await expect.element(page.getByText("Details for thread-b")).toBeVisible();
});
