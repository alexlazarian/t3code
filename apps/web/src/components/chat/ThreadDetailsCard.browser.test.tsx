import { StrictMode } from "react";
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import { PopoverCreateHandle } from "../ui/popover";
import { ChatCanvasContext } from "./ChatCanvasContext";
import { resolveChatCanvasLayout } from "./chatCanvasLayout";
import { ThreadDetailsCard } from "./ThreadDetailsCard";

const threadA: ScopedThreadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread-a"),
};
const threadB: ScopedThreadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread-b"),
};
// The card fits 400px: the canvas height less the header.
const container = { width: 1200, height: 452 };

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
  rows = 1,
}: {
  threadRef: ScopedThreadRef;
  fixture: ReturnType<typeof setup>;
  /** Rows of 100px shown at full density. Compact always takes 50px. */
  rows?: number;
}) {
  return (
    // The web root renders in StrictMode, which re-runs ref callbacks on every mount.
    <StrictMode>
      <ChatCanvasContext
        value={{
          container,
          layout: resolveChatCanvasLayout({ container, preview: null }),
          previewKey: null,
          registerTimeline: () => {},
          detailsCardTopInset: 0,
        }}
      >
        <ThreadDetailsCard
          threadRef={threadRef}
          anchor={fixture.anchor}
          handle={fixture.handle}
          contentKey={String(rows)}
        >
          {(density) => (
            <p data-density={density} style={{ height: density === "full" ? rows * 100 : 50 }}>
              Details for {threadRef.threadId}
            </p>
          )}
        </ThreadDetailsCard>
      </ChatCanvasContext>
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

it("returns to full density when hidden items make the content fit", async () => {
  using fixture = setup();
  await using screen = await render(<Card threadRef={threadB} fixture={fixture} rows={6} />);
  await setOpen(threadB, true);
  const content = page.getByText("Details for thread-b");
  await expect.element(content).toHaveAttribute("data-density", "compact");

  await screen.rerender(<Card threadRef={threadB} fixture={fixture} rows={2} />);
  await expect.element(content).toHaveAttribute("data-density", "full");
});
