import type { ReactNode } from "react";

/** The uppercase hairline band that heads a group of rows in the sidebar, settings, and pull requests. */
export function SectionStrip(props: { title: ReactNode; count?: number; trailing?: ReactNode }) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-border px-3 text-3xs font-medium uppercase tracking-wider text-muted-foreground">
      <span className="truncate">{props.title}</span>
      {props.count === undefined ? null : <span className="tabular-nums">{props.count}</span>}
      <span className="flex-1" />
      {props.trailing ? (
        <span className="normal-case tracking-normal">{props.trailing}</span>
      ) : null}
    </div>
  );
}
