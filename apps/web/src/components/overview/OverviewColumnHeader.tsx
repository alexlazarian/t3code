import { FolderIcon } from "lucide-react";
import { Fragment, type DragEvent } from "react";

import { cn } from "~/lib/utils";

import { OVERVIEW_INK } from "../../projectAccentColor.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import type { OverviewColumn, OverviewMachine } from "./Overview.logic";

export function OverviewColumnHeader(props: {
  readonly column: OverviewColumn;
  readonly fill: string;
  readonly machines: ReadonlyArray<OverviewMachine>;
  /** Where a dragged column would land relative to this one, while one hovers it. */
  readonly dropSide: "before" | "after" | null;
  readonly onDragStart: (projectKey: string) => void;
  readonly onDragOver: (projectKey: string) => boolean;
  readonly onDrop: (projectKey: string) => void;
  readonly onDragEnd: () => void;
}) {
  const { column } = props;
  const { open, working, needsYou } = column.counts;
  const movable = column.project !== null;
  const handleDragOver = (event: DragEvent) => {
    if (!props.onDragOver(column.projectKey)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  return (
    <div
      draggable={movable}
      data-info={movable ? "Drag to move this column" : undefined}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", column.displayName);
        props.onDragStart(column.projectKey);
      }}
      onDragOver={handleDragOver}
      onDrop={(event) => {
        event.preventDefault();
        props.onDrop(column.projectKey);
      }}
      onDragEnd={props.onDragEnd}
      className={cn(
        "sticky top-0 z-10 min-w-0 border-r border-border bg-muted",
        movable && "cursor-grab active:cursor-grabbing",
      )}
    >
      {props.dropSide ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 z-20 w-0.5 bg-primary",
            props.dropSide === "before" ? "left-0" : "right-0",
          )}
        />
      ) : null}
      <div
        className="flex h-[22px] items-center gap-1.5 px-2 text-xs font-semibold"
        style={{ backgroundColor: props.fill, color: OVERVIEW_INK }}
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
