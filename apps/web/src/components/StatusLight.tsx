import { CheckIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "~/lib/utils";
import { observeVisibleAnimation } from "~/lib/visibleAnimation";

export type StatusLightTone = "working" | "needs-you" | "failed" | "waiting" | "done" | "idle";

const TONE_CLASS: Record<Exclude<StatusLightTone, "done">, string> = {
  working: "bg-status-working",
  "needs-you": "bg-status-needs-you",
  failed: "bg-status-failed",
  waiting: "bg-status-waiting",
  idle: "border border-muted-foreground/45",
};

const SIZE_CLASS = {
  small: "size-1.25",
  medium: "size-1.75",
} as const;

// A stroke reads lighter than a fill, so the check overflows its square's box by a little.
const CHECK_CLASS: Record<keyof typeof SIZE_CLASS, string> = {
  small: "-m-[1.5px] size-2",
  medium: "-m-[1.5px] size-2.5",
};

/**
 * A square status light; `done` is a check. `strobe` flashes it in steps while it is on screen,
 * and `strobeDelay` (or an inherited `--strobe-delay`) keeps sibling lights off each other's beat.
 */
export function StatusLight(props: {
  readonly tone: StatusLightTone;
  readonly strobe?: boolean;
  readonly strobeDelay?: string;
  readonly size?: keyof typeof SIZE_CLASS;
}) {
  const size = props.size ?? "medium";
  if (props.tone === "done") {
    return (
      <CheckIcon
        aria-hidden
        strokeWidth={3.5}
        className={cn("shrink-0 text-muted-foreground", CHECK_CLASS[size])}
      />
    );
  }
  const strobe = props.strobe ?? false;
  return (
    <span
      aria-hidden
      ref={strobe ? observeVisibleAnimation : undefined}
      style={
        props.strobeDelay === undefined
          ? undefined
          : ({ "--strobe-delay": props.strobeDelay } as CSSProperties)
      }
      className={cn(
        "relative shrink-0",
        SIZE_CLASS[size],
        TONE_CLASS[props.tone],
        props.tone !== "idle" && "ring-1 ring-black/50",
        strobe && "overview-strobe",
      )}
    />
  );
}
