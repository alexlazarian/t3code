import { FolderIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useProjectAccentColor } from "../../hooks/useProjectAccentColor";
import { ProjectFavicon } from "../ProjectFavicon";
import type { OverviewColumn } from "./Overview.logic";

export function OverviewColumnHeader(props: {
  readonly column: OverviewColumn;
  readonly note?: ReactNode;
}) {
  const { column } = props;
  const stripColor = useProjectAccentColor(column.project);
  const { open, working, needsYou } = column.counts;
  return (
    <div
      className="sticky top-0 z-10 min-w-0 border-r border-b border-border bg-card"
      style={stripColor ? { boxShadow: `inset 3px 0 0 ${stripColor}` } : undefined}
    >
      <div className="flex h-[22px] items-center gap-1.5 px-2 text-xs font-semibold text-foreground">
        {column.project ? (
          <span className="inline-flex shrink-0 items-center justify-center [&:has(img)]:bg-white [&:has(img)]:p-px">
            <ProjectFavicon project={column.project} className="size-3.5 shrink-0" />
          </span>
        ) : (
          <FolderIcon className="size-3.5 shrink-0" />
        )}
        <span className="truncate">{column.displayName}</span>
      </div>
      <div className="truncate px-2 pb-0.5 text-3xs text-muted-foreground">
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
        {props.note ? <> &middot; {props.note}</> : null}
      </div>
    </div>
  );
}
