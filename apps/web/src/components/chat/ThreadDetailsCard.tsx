import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { ScrollArea } from "../ui/scroll-area";
import { Popover, PopoverPopup, PopoverCreateHandle } from "../ui/popover";
import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import { useChatCanvas } from "./ChatCanvasContext";
import { resolveThreadDetailsCardDensity } from "./threadDetailsCardLayout";
import { observeResize } from "../../lib/observeResize";

export function ThreadDetailsCard({
  threadRef,
  anchor,
  handle,
  children,
}: {
  threadRef: ScopedThreadRef;
  anchor: RefObject<Element | null>;
  handle: ReturnType<typeof PopoverCreateHandle>;
  children: (density: "full" | "compact" | "essential") => ReactNode;
}) {
  const canvas = useChatCanvas();
  const topInset = canvas?.detailsCardTopInset ?? 0;
  const open = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelOpenByThreadKey, threadRef),
  );
  const measurementKey = `${threadRef.environmentId}:${threadRef.threadId}`;
  const [measurements, setMeasurements] = useState({
    key: measurementKey,
    heights: { full: 0, compact: 0 },
  });
  const contentHeights =
    measurements.key === measurementKey ? measurements.heights : { full: 0, compact: 0 };
  const height = Math.max(0, (canvas?.container.height ?? 0) - 52);
  const density = resolveThreadDetailsCardDensity(height, contentHeights);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  // Re-measures when the density or measurement key changes, so each density's
  // height is measured once it renders.
  useLayoutEffect(() => {
    const element = contentElement;
    if (!element || density === "essential") return;
    const measure = () => {
      const frame = element.closest<HTMLElement>("[data-thread-details-card]");
      const next = element.offsetHeight + (frame ? frame.offsetHeight - frame.clientHeight : 0);
      // PR lists and lineage scroll as they expand. Counting them toward density would hide
      // the section and workspace controls when the user asks to see more rows.
      const lists = element.querySelectorAll<HTMLElement>(
        "[data-thread-relationships-panel], [data-thread-details-pr-list]",
      );
      const fittingHeight =
        next - Array.from(lists).reduce((sum, list) => sum + list.offsetHeight, 0);
      setMeasurements((current) => {
        const heights = current.key === measurementKey ? current.heights : { full: 0, compact: 0 };
        return current.key === measurementKey && heights[density] === fittingHeight
          ? current
          : { key: measurementKey, heights: { ...heights, [density]: fittingHeight } };
      });
    };
    measure();
    return observeResize(element, measure);
  }, [contentElement, density, measurementKey]);
  return (
    <Popover
      handle={handle}
      open={open}
      onOpenChange={(nextOpen, details) => {
        const target =
          details.reason === "focus-out"
            ? (details.event as FocusEvent).relatedTarget
            : details.reason === "outside-press"
              ? details.event.target
              : null;
        if (!nextOpen && target instanceof Element && target.closest("[data-thread-find-bar]")) {
          details.cancel();
          return;
        }
        useRightPanelStore.getState().setThreadPanelOpen(threadRef, nextOpen);
      }}
    >
      <PopoverPopup
        anchor={anchor}
        align="end"
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        side="bottom"
        // Clears the find bar, which sits below the header at the canvas's top right.
        sideOffset={topInset}
        variant="panel"
        padding="none"
        aria-label="Thread details"
      >
        <div
          className="dropdown-glass isolate contain-paint grid max-h-[min(calc(100dvh-6.5rem),calc(var(--available-height,100dvh)-1rem))] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl"
          data-thread-details-card
        >
          <ScrollArea scrollFade className="min-h-0">
            <div ref={setContentElement}>{children(density)}</div>
          </ScrollArea>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
