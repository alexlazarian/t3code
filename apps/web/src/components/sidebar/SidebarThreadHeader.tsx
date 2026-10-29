import { XIcon } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";

import { cn } from "~/lib/utils";
import type { SidebarStatusFilter } from "../Sidebar.logic";
import { Button } from "../ui/button";
import { SidebarInput } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarThreadHeaderProps {
  projectScope: ReactNode;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
  statusFilter: SidebarStatusFilter;
  statusCounts: Record<"needs-you" | "working", number>;
  onStatusFilterChange: (filter: SidebarStatusFilter) => void;
  /** Unread threads among those the filter, scope and search show. */
  unreadCount: number;
  onMarkAllRead: () => void;
}

export function SidebarThreadHeader({
  projectScope,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
  statusFilter,
  statusCounts,
  onStatusFilterChange,
  unreadCount,
  onMarkAllRead,
}: SidebarThreadHeaderProps) {
  const resultsVisible = isSearching && searchResultCount > 0;
  // Shrinking results can remove the active option; never leave aria-activedescendant pointing at it.
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-6 min-w-0 items-center gap-1 border border-sidebar-border bg-background px-1.5 focus-within:border-primary">
        <SidebarInput
          ref={searchInputRef}
          nativeInput
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search threads and messages"
          aria-label="Search threads"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={resultsVisible}
          aria-controls={resultsVisible ? "sidebar-thread-search-results" : undefined}
          aria-activedescendant={
            activeResultExists
              ? `sidebar-thread-search-result-${activeSearchResultIndex}`
              : undefined
          }
          className="min-w-0 flex-1"
        />
        {isSearching ? (
          <Button
            type="button"
            size="icon-micro"
            variant="ghost-muted"
            className="shrink-0"
            aria-label="Clear thread search"
            onClick={() => {
              onClearSearch();
              searchInputRef.current?.focus();
            }}
          >
            <XIcon className="size-3" />
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1">
        {projectScope}
        <div role="group" aria-label="Filter threads by status" className="flex shrink-0 gap-0.5">
          {STATUS_CHIPS.map((chip) => {
            const count = chip.id === "all" ? null : statusCounts[chip.id];
            const on = statusFilter === chip.id;
            return (
              <Tooltip key={chip.id}>
                <TooltipTrigger
                  info={chip.tooltip}
                  render={
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onStatusFilterChange(chip.id)}
                      className={cn(
                        "h-6 cursor-pointer whitespace-nowrap border px-1.5 text-xs",
                        on
                          ? "border-sidebar-border bg-sidebar-row-hover text-sidebar-foreground"
                          : "border-sidebar-border bg-background text-muted-foreground hover:text-sidebar-foreground",
                      )}
                    />
                  }
                >
                  {chip.label}
                  {count === null ? null : <span className="ml-0.75 opacity-75">{count}</span>}
                </TooltipTrigger>
                <TooltipPopup side="bottom">{chip.tooltip}</TooltipPopup>
              </Tooltip>
            );
          })}
        </div>
      </div>
      {unreadCount > 0 ? (
        <div className="flex justify-end">
          <Button type="button" size="xs" variant="ghost" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const STATUS_CHIPS = [
  { id: "all", label: "All", tooltip: "Every thread" },
  { id: "needs-you", label: "Need you", tooltip: "Approval, Input, Request, or Plan ready" },
  { id: "working", label: "Working", tooltip: "A turn is in progress" },
] as const;
