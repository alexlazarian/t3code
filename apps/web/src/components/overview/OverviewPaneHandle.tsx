import { ChevronLeftIcon, ChevronRightIcon, Maximize2Icon, XIcon } from "lucide-react";
import type { ComponentProps, PointerEvent } from "react";

import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import type { OverviewPaneNav } from "./Overview.logic";

const stopDrag = (event: PointerEvent) => event.stopPropagation();

export function OverviewPaneHandle(props: {
  nav: OverviewPaneNav | null;
  sectionName: string | null;
  onStep: (key: string) => void;
  onOpenFull: (() => void) | null;
  onClose: () => void;
  separator: ComponentProps<"div">;
}) {
  const { nav, sectionName, onStep, onOpenFull, onClose } = props;
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...separator } =
    props.separator;
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="relative flex h-6 shrink-0 cursor-row-resize touch-none items-center justify-between border-y border-border bg-muted px-2 text-2xs text-muted-foreground hover:bg-accent"
    >
      <div onPointerDown={stopDrag} className="relative z-10 flex items-center gap-0.5">
        {nav === null || sectionName === null ? null : (
          <>
            <span className="mr-1 whitespace-nowrap">
              <b className="font-semibold text-foreground">{sectionName}</b> · {nav.index} of{" "}
              {nav.count}
            </span>
            <Button
              variant="ghost-muted"
              size="icon-tiny"
              aria-label="Previous card"
              disabled={nav.previousKey === null}
              onClick={() => nav.previousKey !== null && onStep(nav.previousKey)}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            <Button
              variant="ghost-muted"
              size="icon-tiny"
              aria-label="Next card"
              disabled={nav.nextKey === null}
              onClick={() => nav.nextKey !== null && onStep(nav.nextKey)}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </>
        )}
      </div>
      <div
        {...separator}
        data-info="Drag to resize. Drag all the way down to close."
        className="absolute top-1/2 left-1/2 grid -translate-x-1/2 -translate-y-1/2 grid-cols-[repeat(6,2px)] gap-0.75 p-1 outline-0 outline-ring focus-visible:outline-2"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <i key={index} className="block size-0.5 bg-icon-muted" />
        ))}
      </div>
      <div onPointerDown={stopDrag} className="relative z-10 flex items-center gap-0.5">
        {onOpenFull === null ? null : (
          <Button variant="ghost-muted" size="xs" onClick={onOpenFull}>
            <Maximize2Icon aria-hidden />
            Open full size
          </Button>
        )}
        <Button variant="ghost-muted" size="xs" onClick={onClose}>
          <XIcon aria-hidden />
          Close <Kbd>Esc</Kbd>
        </Button>
      </div>
    </div>
  );
}
