import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

import type { OverviewRow } from "./Overview.logic";

const URGENCY_EDGE: Record<NonNullable<OverviewRow["urgency"]>, string> = {
  "needs-you": "border-l-2 border-l-status-needs-you",
  working: "border-l-2 border-l-status-working",
};

/** One shelf of the board: a rail in column 1 plus a count strip and cells, or a 20px row. */
export function OverviewShelf(props: {
  readonly name: string;
  readonly total: number;
  readonly columns: ReadonlyArray<{
    readonly key: string;
    readonly count: number;
    readonly cell: ReactNode;
  }>;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly urgency: OverviewRow["urgency"];
  /** First grid row this shelf occupies. */
  readonly row: number;
}) {
  const { name, total, expanded, row } = props;
  const label = name.toUpperCase();
  const edge = props.urgency === null ? undefined : URGENCY_EDGE[props.urgency];
  const rail = (
    <button
      type="button"
      role="rowheader"
      aria-expanded={expanded}
      aria-label={`${name}, ${total} threads`}
      onClick={props.onToggle}
      style={{ gridColumn: 1, gridRow: expanded ? `${row} / span 2` : row }}
      className={cn(
        "sticky left-0 z-10 flex cursor-pointer flex-col items-center overflow-hidden border-r border-b border-border bg-background text-2xs hover:bg-muted",
        expanded ? "gap-1 pt-0.75" : "h-5 justify-center",
        edge,
      )}
    >
      <ChevronDownIcon
        aria-hidden
        className={cn("size-3 shrink-0 text-muted-foreground", !expanded && "-rotate-90")}
      />
      {expanded ? (
        <span className="rotate-180 font-semibold tracking-wide whitespace-nowrap [writing-mode:vertical-rl]">
          {label}{" "}
          <span className="font-normal text-muted-foreground tabular-nums">&middot; {total}</span>
        </span>
      ) : null}
    </button>
  );
  if (!expanded) {
    return (
      <div role="row" className="contents">
        {rail}
        {props.columns.map(({ key, count }, index) => (
          <button
            type="button"
            key={key}
            aria-expanded={false}
            aria-label={`Expand ${name}`}
            onClick={props.onToggle}
            style={{ gridColumn: index + 2, gridRow: row }}
            className="flex h-5 min-w-0 cursor-pointer items-center gap-1.5 border-r border-b border-border bg-background px-2 text-3xs whitespace-nowrap hover:bg-muted"
          >
            {index === 0 ? (
              <>
                <span className="font-semibold tracking-wide uppercase">{label}</span>
                <span className="text-muted-foreground tabular-nums">{total}</span>
              </>
            ) : null}
            {count > 0 ? (
              <span className="ml-auto text-muted-foreground tabular-nums">{count}</span>
            ) : null}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div role="row" className="contents">
      {rail}
      {props.columns.map(({ key, count }, index) => (
        <div
          key={key}
          role="presentation"
          style={{ gridColumn: index + 2, gridRow: row }}
          className="flex h-3.5 items-center justify-end border-r border-border bg-background px-2 text-3xs text-muted-foreground tabular-nums"
        >
          {count > 0 ? count : null}
        </div>
      ))}
      {props.columns.map(({ key, cell }, index) => (
        <div
          key={key}
          role="gridcell"
          style={{ gridColumn: index + 2, gridRow: row + 1 }}
          className="flex min-h-2.5 min-w-0 flex-col gap-0.75 border-r border-b border-border p-0.75"
        >
          {cell}
        </div>
      ))}
    </div>
  );
}
