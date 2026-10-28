import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useLayoutEffect } from "react";
import { cn } from "~/lib/utils";
import {
  animateSidebarLayoutChanges,
  sidebarMarkerId,
  type SidebarListMarker,
} from "../Sidebar.logic";
import { SIDEBAR_SORTABLE_DRAG_DISABLED } from "./SidebarThreadRow";

function SortableSidebarMarker(props: {
  marker: SidebarListMarker;
  className?: string;
  children?: ReactNode;
  revealOverflow?: boolean;
  "data-testid"?: string;
}) {
  const { node, setNodeRef, transform, transition } = useSortable({
    id: sidebarMarkerId(props.marker),
    disabled: SIDEBAR_SORTABLE_DRAG_DISABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the projected drop box inside the scroll viewport as drag transforms move it
  useLayoutEffect(() => {
    if (props.revealOverflow && transform?.y !== undefined) {
      node.current?.firstElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [node, props.revealOverflow, transform?.y]);
  return (
    <li
      ref={setNodeRef}
      data-thread-selection-safe
      data-testid={props["data-testid"]}
      className={cn("list-none", props.className)}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: props.marker.endsWith("-placeholder") ? "none" : transition,
        visibility: transform?.scaleY === 0 ? "hidden" : undefined,
      }}
    >
      {props.children}
    </li>
  );
}

/** Zero height unless its expanded section is empty, where it reads "None" as in the prototype. */
export function SidebarSectionPlaceholder(props: {
  marker: "pinned-placeholder" | "active-placeholder" | "settled-placeholder";
  label: string;
  showNone: boolean;
  showHint: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className={cn("relative", !props.showNone && "mx-0.5 -mb-px h-0")}
      revealOverflow={props.marker === "settled-placeholder" && props.showHint}
    >
      {props.showNone ? (
        <div className="border-b border-sidebar-border px-3 py-1 text-xs text-placeholder">
          None
        </div>
      ) : null}
      {props.showHint ? (
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/25 text-xs text-sidebar-foreground/80",
            props.isDropTarget && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          {props.label}
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

const SECTION_TESTID = {
  "pinned-header": "sidebar-pinned-section-toggle",
  "pinned-divider": "sidebar-active-section-toggle",
  "working-header": "sidebar-working-shelf-toggle",
  "snoozed-header": "sidebar-snoozed-shelf-toggle",
  "settled-header": "sidebar-settled-shelf-toggle",
} as const;

/** The shelf id rows name as their keyboard-navigation parent. */
const SECTION_SHELF = {
  "pinned-header": "pinned",
  "pinned-divider": "active",
  "working-header": "working",
  "snoozed-header": "snoozed",
  "settled-header": "settled",
} as const;

export function SidebarSectionHeader(props: {
  marker: keyof typeof SECTION_TESTID;
  label: string;
  count: number;
  dragging?: boolean;
  isDropTarget?: boolean;
  /** A narrowed list shows every match, so it hides empty sections and ignores collapse. */
  narrowed: boolean;
  toggle: { expanded: boolean; onToggle: () => void };
}) {
  if (props.narrowed && props.count === 0) {
    return (
      <SortableSidebarMarker
        marker={props.marker}
        data-testid={`sidebar-${props.marker}`}
        className="-mb-px h-0"
      />
    );
  }
  return (
    <SortableSidebarMarker marker={props.marker} data-testid={`sidebar-${props.marker}`}>
      <button
        type="button"
        role="treeitem"
        tabIndex={-1}
        data-sidebar-row={`shelf:${SECTION_SHELF[props.marker]}`}
        aria-expanded={props.toggle.expanded}
        disabled={props.narrowed}
        onClick={props.toggle.onToggle}
        data-testid={SECTION_TESTID[props.marker]}
        className="flex h-6 w-full cursor-pointer items-center disabled:cursor-default gap-1.5 border-b border-sidebar-border bg-background px-2 text-left text-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        <span aria-hidden className="w-2 shrink-0 text-muted-foreground">
          {props.toggle.expanded ? "\u25BE" : "\u25B8"}
        </span>
        <span
          className={cn(
            "uppercase tracking-wider",
            props.isDropTarget
              ? "text-primary"
              : props.dragging
                ? "text-sidebar-foreground"
                : "text-muted-foreground",
          )}
        >
          {props.label}
        </span>
        <span className="tabular-nums text-placeholder">{props.count}</span>
      </button>
    </SortableSidebarMarker>
  );
}

export function ClearFiltersButton(props: { readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="mx-auto mt-2 flex cursor-pointer items-center rounded-md border border-sidebar-border px-2.5 py-1 text-2xs font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
    >
      Clear filters
    </button>
  );
}
