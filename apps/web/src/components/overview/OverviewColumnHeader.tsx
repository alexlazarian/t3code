import { FolderIcon } from "lucide-react";
import type { DragEvent } from "react";

import { cn } from "~/lib/utils";

import { ProjectFavicon } from "../ProjectFavicon";
import { StatusLight } from "../StatusLight";
import type { OverviewColumn, OverviewMachine } from "./Overview.logic";

export function OverviewColumnHeader(props: {
  readonly column: OverviewColumn;
  readonly columnIndex: number;
  readonly machines: ReadonlyArray<OverviewMachine>;
  /** Where a dragged column would land relative to this one, while one hovers it. */
  readonly dropSide: "before" | "after" | null;
  readonly onDragStart: (projectKey: string) => void;
  readonly onDragOver: (projectKey: string) => boolean;
  readonly onDrop: (projectKey: string) => void;
  readonly onDragEnd: () => void;
}) {
  const { column } = props;
  const { open, needsYou } = column.counts;
  const allOffline =
    props.machines.length > 0 && props.machines.every((machine) => machine.offline);
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
      style={{ gridColumn: props.columnIndex + 2, gridRow: 2 }}
      className={cn(
        "sticky top-4.5 z-11 min-w-0 border-r border-border bg-muted",
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
        className={cn(
          "flex h-6 items-center gap-1.5 border-b border-border px-2",
          allOffline && "[&>:not(:last-child)]:opacity-50",
        )}
      >
        {column.project ? (
          <ProjectFavicon project={column.project} className="size-4 shrink-0" />
        ) : (
          <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate text-xs font-semibold">{column.displayName}</span>
        <span
          className="ml-auto flex shrink-0 items-center gap-1.5 text-3xs text-muted-foreground"
          data-info={`${open} open`}
        >
          {needsYou > 0 ? <span className="text-status-needs-you">{needsYou} need you</span> : null}
          {column.lights.length > 0 ? (
            <span className="flex items-center gap-0.75">
              {column.lights.map((tone, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- lights are an ordered list without identity
                <StatusLight key={index} tone={tone} size="small" />
              ))}
            </span>
          ) : null}
          <span className="min-w-2 text-right text-2xs text-foreground tabular-nums">{open}</span>
        </span>
      </div>
    </div>
  );
}
