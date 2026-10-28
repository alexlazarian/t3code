import { FolderIcon } from "lucide-react";
import { Fragment } from "react";

import { ProjectFavicon } from "../ProjectFavicon";
import type { OverviewColumn, OverviewMachine } from "./Overview.logic";

export function OverviewColumnHeader(props: {
  readonly column: OverviewColumn;
  readonly fill: string;
  readonly machines: ReadonlyArray<OverviewMachine>;
}) {
  const { column } = props;
  const { open, working, needsYou } = column.counts;
  return (
    <div className="sticky top-0 z-10 min-w-0 border-r border-border bg-muted">
      <div
        className="flex h-[22px] items-center gap-1.5 px-2 text-xs font-semibold text-overview-ink"
        style={{ backgroundColor: props.fill }}
      >
        {column.project ? (
          <span className="inline-flex shrink-0 items-center justify-center bg-black/15 [&:has(img)]:bg-white [&:has(img)]:p-px">
            <ProjectFavicon project={column.project} className="size-3.5 shrink-0" />
          </span>
        ) : (
          <FolderIcon className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{column.displayName}</span>
      </div>
      <div className="truncate border-b border-border px-2 pt-0.5 pb-0.75 text-3xs text-muted-foreground">
        {props.machines.map((machine, index) => (
          <Fragment key={machine.id}>
            {index > 0 ? " + " : null}
            {machine.label}
            {machine.offline ? <span className="text-status-failed"> offline</span> : null}
          </Fragment>
        ))}
        {props.machines.length > 0 ? <> &middot; </> : null}
        {open} open
        {working > 0 ? (
          <>
            , <span className="text-status-working">{working} working</span>
          </>
        ) : null}
        {needsYou > 0 ? (
          <>
            , <span className="text-status-needs-you">{needsYou} need you</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
