import { Fragment } from "react";

import { cn } from "~/lib/utils";

import type { OverviewMachineSpan } from "./Overview.logic";

function MachineDot(props: { readonly offline: boolean }) {
  return (
    <i
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        props.offline ? "bg-status-failed" : "bg-status-working",
      )}
    />
  );
}

export function OverviewMachineRow(props: { readonly spans: ReadonlyArray<OverviewMachineSpan> }) {
  return props.spans.map((span) => {
    const single = span.machines.length === 1;
    const tinted = single && span.offline;
    return (
      <div
        key={span.start}
        role="presentation"
        style={{ gridColumn: `${span.start + 2} / span ${span.length}`, gridRow: 1 }}
        className={cn(
          "sticky top-0 z-12 flex h-4.5 min-w-0 items-center gap-1.5 overflow-hidden border-r border-b-2 border-border px-2 text-3xs whitespace-nowrap",
          tinted
            ? "border-b-status-failed bg-status-failed/15 text-status-failed"
            : "border-b-status-working/45 bg-background text-muted-foreground",
        )}
      >
        {span.machines.length > 1 ? (
          <b className="font-semibold text-foreground">{span.machines.length} machines</b>
        ) : null}
        {span.machines.map((machine, index) => (
          <Fragment key={machine.id}>
            {index > 0 ? <span className="opacity-60">&middot;</span> : null}
            <span className="inline-flex items-center gap-1">
              <MachineDot offline={machine.offline} />
              {single ? (
                <b className={cn("font-semibold", !tinted && "text-foreground")}>{machine.label}</b>
              ) : (
                machine.label
              )}
              {single && machine.offline ? <span>&middot; offline</span> : null}
            </span>
          </Fragment>
        ))}
      </div>
    );
  });
}
