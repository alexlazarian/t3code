import { useAtomValue } from "@effect/atom-react";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import { useRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { parseScopedThreadKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { Fragment, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useStableCallback } from "../../hooks/useStableCallback";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import { selectProjectGroupingSettings } from "../../logicalProject";
import { resolveSidebarProjectScopeKey } from "../../sidebarProjectGrouping";
import { useQuietThreadShells, useServerConfigs } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { useUiStateStore } from "../../uiStateStore";
import { cn } from "~/lib/utils";
import {
  partitionSidebarThreads,
  resolveThreadLastVisitedAt,
  threadShellKey,
  type SidebarSection,
} from "../Sidebar.logic";
import { sidebarProviderEntriesAtom } from "../sidebar/sidebarProviderEntries";
import {
  SETTLED_SHELF_EXPANDED_KEY,
  SETTLED_TAIL_INITIAL_COUNT,
  SETTLED_TAIL_PAGE_COUNT,
  SIDEBAR_SHELF_EXPANDED_DEFAULT,
  SNOOZED_SHELF_EXPANDED_KEY,
  WORKING_SHELF_EXPANDED_KEY,
  useSidebarPartitionClockKey,
} from "../sidebar/sidebarShelves";
import { ClearFiltersButton } from "../sidebar/SidebarListMarkers";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  buildOverviewGrid,
  moveOverviewFocus,
  overviewProjectKeyOf,
  type OverviewColumn,
  type OverviewFocusDirection,
} from "./Overview.logic";
import { OverviewCard } from "./OverviewCard";
import { OverviewColumnHeader } from "./OverviewColumnHeader";

const SECTION_LABELS: Record<SidebarSection, { readonly name: string; readonly why: string }> = {
  pinned: { name: "Pinned", why: "kept above everything else" },
  working: { name: "Working", why: "running on their own: subagents, PR watches, monitors" },
  active: { name: "Active", why: "your current work" },
  snoozed: { name: "Snoozed", why: "hidden until their wake time" },
  settled: { name: "Settled", why: "finished, kept for reference" },
};

const ARROW_DIRECTIONS: Partial<Record<string, OverviewFocusDirection>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// Working, Snoozed and Settled share the sidebar shelves' keys, so collapsing one collapses both.
function useOverviewRowExpansion(): Record<
  SidebarSection,
  readonly [boolean, (v: boolean) => void]
> {
  const pinned = useLocalStorage("t3code:overview:pinned-expanded", true, Schema.Boolean);
  const active = useLocalStorage("t3code:overview:active-expanded", true, Schema.Boolean);
  const working = useLocalStorage(
    WORKING_SHELF_EXPANDED_KEY,
    SIDEBAR_SHELF_EXPANDED_DEFAULT,
    Schema.Boolean,
  );
  const snoozed = useLocalStorage(
    SNOOZED_SHELF_EXPANDED_KEY,
    SIDEBAR_SHELF_EXPANDED_DEFAULT,
    Schema.Boolean,
  );
  const settled = useLocalStorage(
    SETTLED_SHELF_EXPANDED_KEY,
    SIDEBAR_SHELF_EXPANDED_DEFAULT,
    Schema.Boolean,
  );
  return { pinned, active, working, snoozed, settled };
}

export function OverviewView() {
  const router = useRouter();
  const handleNewThread = useNewThreadHandler();
  const threads = useQuietThreadShells();
  const serverConfigs = useServerConfigs();
  const projectGroups = useSidebarProjectGroups();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const workingShelfEnabled = useClientSettings((s) => s.sidebarWorkingShelfEnabled);
  const statusFilter = useUiStateStore((store) => store.sidebarStatusFilter);
  const setStatusFilter = useUiStateStore((store) => store.setSidebarStatusFilter);
  const persistedScopeKey = useUiStateStore((store) => store.sidebarProjectScopeKey);
  const setPersistedScopeKey = useUiStateStore((store) => store.setSidebarProjectScopeKey);
  const lastVisitedById = useUiStateStore((store) => store.threadLastVisitedAtById);
  const clearSelection = useThreadSelectionStore((store) => store.clearSelection);
  const providerEntriesByEnvironment = useAtomValue(sidebarProviderEntriesAtom);
  const clockKey = useSidebarPartitionClockKey(threads);
  const expansion = useOverviewRowExpansion();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const scopeKey = resolveSidebarProjectScopeKey({
    groups: projectGroups,
    key: persistedScopeKey,
    settings: projectGroupingSettings,
  });
  const scopedGroup =
    scopeKey === null
      ? null
      : (projectGroups.find((group) => group.projectKey === scopeKey) ?? null);
  const projects = scopedGroup === null ? projectGroups : [scopedGroup];
  const [settledTail, setSettledTail] = useState({
    scopeKey,
    count: SETTLED_TAIL_INITIAL_COUNT,
  });
  if (settledTail.scopeKey !== scopeKey) {
    setSettledTail({ scopeKey, count: SETTLED_TAIL_INITIAL_COUNT });
  }
  const partition = partitionSidebarThreads({
    threads,
    scopedProjectKeys:
      scopedGroup === null
        ? null
        : new Set(
            scopedGroup.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
          ),
    serverConfigs,
    optimisticDrop: null,
    workingShelfEnabled,
    statusFilter,
    routeRowThreadKey: null,
    clockKey,
  });
  const settledTotal = partition.settledThreads.length;
  const hiddenSettledCount = Math.max(0, settledTotal - settledTail.count);
  const { columns, rows } = buildOverviewGrid({
    partition: {
      ...partition,
      settledThreads: partition.settledThreads.slice(0, settledTail.count),
    },
    projects,
    projectKeyOf: overviewProjectKeyOf(projects),
    workingShelfEnabled,
  });
  const cardCount = rows.reduce((sum, row) => sum + row.total, 0) + hiddenSettledCount;
  const isNarrowed = statusFilter !== "all" || scopedGroup !== null;

  const machineLabelsByColumn = new Map(
    columns.map((column) => {
      const members = column.project?.memberProjects ?? [];
      const spans = new Set(members.map((member) => member.environmentId)).size > 1;
      return [
        column.projectKey,
        spans
          ? new Map(members.map((member) => [member.environmentId, member.environmentLabel]))
          : null,
      ] as const;
    }),
  );
  const focusGrid = columns.map((column) =>
    rows
      .filter((row) => expansion[row.section][0])
      .map((row) => (row.cells.get(column.projectKey) ?? []).map(threadShellKey)),
  );
  const allKeys = focusGrid.flat(2);
  const tabbableKey = focusKey !== null && allKeys.includes(focusKey) ? focusKey : allKeys[0];

  const openThread = useStableCallback((threadKey: string) => {
    const ref = parseScopedThreadKey(threadKey);
    if (ref === null) return;
    void updateClientSettings({ threadView: "list" });
    void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  });
  const peekThread = useStableCallback((threadKey: string) => {
    setFocusKey(threadKey);
    setSelectedKey(threadKey);
  });
  const startThreadIn = (project: NonNullable<OverviewColumn["project"]>) => {
    void updateClientSettings({ threadView: "list" });
    void handleNewThread(scopeProjectRef(project.environmentId, project.id));
  };
  const clearFilters = () => {
    setStatusFilter("all");
    clearSelection();
    setPersistedScopeKey(null);
  };

  const handleGridFocus = (event: FocusEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).dataset.threadKey;
    if (key !== undefined) setFocusKey(key);
  };
  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = ARROW_DIRECTIONS[event.key];
    const key = (event.target as HTMLElement).dataset.threadKey;
    if (direction === undefined || key === undefined) return;
    event.preventDefault();
    const next = moveOverviewFocus(focusGrid, key, direction);
    if (next === null) return;
    setFocusKey(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-thread-key="${CSS.escape(next)}"]`)?.focus();
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <span className="text-xs text-muted-foreground">Overview</span>
        </WorkspacePageHeader>
        {columns.length === 1 && scopedGroup === null ? (
          <p className="border-b border-border px-2 py-1 text-2xs text-muted-foreground">
            With one project, List has more room.
          </p>
        ) : null}
        {cardCount === 0 && isNarrowed ? (
          <div
            role="status"
            className="flex flex-col items-center gap-2 border-b border-border px-2 py-6 text-center text-xs text-muted-foreground"
          >
            <span>No threads match</span>
            <ClearFiltersButton onClick={clearFilters} />
          </div>
        ) : null}
        {columns.length === 0 ? (
          <Empty role="status" className="flex-1">
            <EmptyHeader className="max-w-none">
              <EmptyTitle>What should we work on?</EmptyTitle>
              <EmptyDescription>Add a project to start your first thread.</EmptyDescription>
              <div className="mt-6 flex justify-center">
                <Button size="sm" onClick={() => openCommandPalette({ open: "add-project" })}>
                  <PlusIcon className="size-4" />
                  Add project
                </Button>
              </div>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            ref={gridRef}
            role="grid"
            aria-label="Overview"
            className="min-h-0 flex-1 overflow-auto"
            onFocus={handleGridFocus}
            onKeyDown={handleGridKeyDown}
          >
            <div
              className="grid min-w-full"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))` }}
            >
              <div role="row" className="contents">
                {columns.map((column) => (
                  <OverviewColumnHeader key={column.projectKey} column={column} />
                ))}
              </div>
              {rows.map((row) => {
                const [expanded, setExpanded] = expansion[row.section];
                const label = SECTION_LABELS[row.section];
                const showMore = expanded && row.section === "settled" && hiddenSettledCount > 0;
                return (
                  <Fragment key={row.section}>
                    <div role="row" className="contents">
                      <div
                        role="rowheader"
                        className="col-span-full border-b border-border bg-muted"
                      >
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => setExpanded(!expanded)}
                          className="sticky left-0 flex h-5 cursor-pointer items-center gap-1.5 px-2 text-3xs whitespace-nowrap"
                        >
                          <ChevronDownIcon
                            aria-hidden
                            className={cn(
                              "size-3 text-muted-foreground",
                              !expanded && "-rotate-90",
                            )}
                          />
                          <span className="font-semibold tracking-wide text-foreground uppercase">
                            {label.name}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {row.section === "settled" ? settledTotal : row.total}
                          </span>
                          <span className="text-muted-foreground/70">{label.why}</span>
                        </button>
                      </div>
                      {expanded
                        ? columns.map((column) => (
                            <div
                              key={column.projectKey}
                              role="gridcell"
                              className="flex min-h-2.5 min-w-0 flex-col gap-0.75 border-r border-b border-border p-0.75"
                            >
                              {(row.cells.get(column.projectKey) ?? []).map((thread) => {
                                const key = threadShellKey(thread);
                                const instanceId =
                                  thread.runtime?.providerInstanceId ??
                                  thread.modelSelection.instanceId;
                                return (
                                  <OverviewCard
                                    key={key}
                                    thread={thread}
                                    section={row.section}
                                    projectName={column.displayName}
                                    machineLabel={
                                      machineLabelsByColumn
                                        .get(column.projectKey)
                                        ?.get(thread.environmentId) ?? null
                                    }
                                    providerName={
                                      providerEntriesByEnvironment
                                        .get(thread.environmentId)
                                        ?.get(instanceId)?.displayName ??
                                      thread.runtime?.providerName ??
                                      instanceId
                                    }
                                    lastVisitedAt={resolveThreadLastVisitedAt(
                                      thread.lastVisitedAt,
                                      lastVisitedById[key],
                                    )}
                                    wokeAt={threadWokeAt(thread, { now: partition.snoozeNow })}
                                    selected={key === selectedKey}
                                    tabbable={key === tabbableKey}
                                    onOpen={openThread}
                                    onPeek={peekThread}
                                  />
                                );
                              })}
                            </div>
                          ))
                        : null}
                    </div>
                    {showMore ? (
                      <div role="row" className="contents">
                        <div role="gridcell" className="col-span-full border-b border-border">
                          <button
                            type="button"
                            onClick={() =>
                              setSettledTail((current) => ({
                                scopeKey: current.scopeKey,
                                count: current.count + SETTLED_TAIL_PAGE_COUNT,
                              }))
                            }
                            className="sticky left-0 flex h-6 cursor-pointer items-center gap-1.5 px-2 text-2xs text-muted-foreground hover:text-foreground"
                          >
                            <ChevronDownIcon aria-hidden className="size-3" />
                            Show {Math.min(hiddenSettledCount, SETTLED_TAIL_PAGE_COUNT)} more
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })}
              <div role="row" className="contents">
                {columns.map(({ projectKey, project, displayName }) => (
                  <div key={projectKey} role="gridcell" className="border-r border-border p-0.75">
                    {project === null ? null : (
                      <NewThreadInColumnButton
                        projectName={displayName}
                        onClick={() => startThreadIn(project)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarInset>
  );
}

function NewThreadInColumnButton(props: {
  readonly projectName: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`New thread in ${props.projectName}`}
      onClick={props.onClick}
      className="flex h-6 w-full cursor-pointer items-center justify-center gap-1 border border-dashed border-border text-2xs text-muted-foreground hover:border-muted-foreground hover:text-foreground"
    >
      <PlusIcon aria-hidden className="size-3" />
      New thread
    </button>
  );
}
