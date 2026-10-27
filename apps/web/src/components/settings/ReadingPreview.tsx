import { lazy, Suspense, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { cn } from "~/lib/utils";

const ChatMarkdown = lazy(() => import("../ChatMarkdown"));

const SAMPLE_REPLY = `Group related settings so each section answers one question, and keep the wording short enough to scan.

Previews work best right next to the control they explain, so a change shows the moment you make it.

- Line height sets the space between lines
- Paragraph spacing sets the space between blocks`;

const POPOVER_WIDTH = 340;
const GAP = 16;
const HIDE_DELAY_MS = 1000;

type Placement = Readonly<{ label: string; style: CSSProperties }>;

function placeBeside(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const left = rect.left - POPOVER_WIDTH - GAP;
  // Beside the control when there is room; above it on narrow windows.
  return left >= 8
    ? { left, top: rect.top + rect.height / 2, transform: "translateY(-50%)" }
    : {
        left: Math.max(8, rect.right - POPOVER_WIDTH),
        top: rect.top - GAP,
        transform: "translateY(-100%)",
      };
}

/**
 * A live preview that floats beside a reading control while it is being adjusted.
 * Stays mounted while hidden so the message renderer is already loaded on first use.
 */
export function useReadingPreview() {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (label: string, anchor: HTMLElement) => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setPlacement({ label, style: placeBeside(anchor) });
    setVisible(true);
  };

  const release = () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  };

  const popover = createPortal(
    <div
      aria-hidden="true"
      inert
      data-reading-preview
      style={{ width: POPOVER_WIDTH, ...placement?.style }}
      className={cn(
        "pointer-events-none fixed z-[60] select-none rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-lg/10 transition-opacity duration-200 motion-reduce:transition-none",
        visible ? "opacity-100" : "invisible opacity-0",
      )}
    >
      <p className="mb-3 text-xs font-medium text-muted-foreground">
        Preview
        {placement ? <span className="text-muted-foreground/70"> · {placement.label}</span> : null}
      </p>
      <Suspense fallback={<div className="h-32" />}>
        <ChatMarkdown text={SAMPLE_REPLY} cwd={undefined} />
      </Suspense>
    </div>,
    document.body,
  );

  return { popover, show, release };
}
