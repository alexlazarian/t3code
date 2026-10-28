import { useAtomValue } from "@effect/atom-react";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import { useRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import {
  Fragment,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useProjectAccentColors } from "../../hooks/useProjectAccentColor";
import { useStableCallback } from "../../hooks/useStableCallback";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import { projectFillColor } from "../../projectAccentColor.logic";
import { resolveSidebarProjectScopeKeys } from "../../sidebarProjectGrouping";
import { useEnvironments } from "../../state/environments";
import {
  useDelegatedUnderParent,
  useQuietThreadShells,
  useServerConfigs,
} from "../../state/entities";
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
  ACTIVE_SECTION_EXPANDED_KEY,
  PINNED_SECTION_EXPANDED_KEY,
  SECTION_NOTES,
  SETTLED_SHELF_EXPANDED_KEY,
  SETTLED_TAIL_INITIAL_COUNT,
  SETTLED_TAIL_PAGE_COUNT,
  SIDEBAR_SHELF_EXPANDED_DEFAULT,
  SNOOZED_SHELF_EXPANDED_KEY,
  WORKING_SHELF_EXPANDED_KEY,
  useSidebarPartitionClockKey,
} from "../sidebar/sidebarShelves";
import { ClearFiltersButton } from "../sidebar/SidebarListMarkers";
import ChatView from "../ChatView";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  buildOverviewGrid,
  isOverviewThreadOffline,
  moveOverviewFocus,
  overviewColumnMachines,
  overviewProjectKeyOf,
  overviewSplitDragFraction,
  resolveOverviewSplitRelease,
  type OverviewColumn,
  type OverviewFocusDirection,
} from "./Overview.logic";
import { OverviewCard } from "./OverviewCard";
import { OverviewColumnHeader } from "./OverviewColumnHeader";

const SECTION_NAMES: Record<SidebarSection, string> = {
  pinned: "Pinned",
  working: "Working",
  active: "Active",
  snoozed: "Snoozed",
  settled: "Settled",
};

const SPLIT_FRACTION_KEY = "t3code:overview:split-fraction";
const SPLIT_FRACTION_STEP = 0.05;
// Overshoots past closed, which the zero height clamps into a quick snap.
const SNAP_SHUT_EASING = "cubic-bezier(0.3, 1.4, 0.6, 1)";
const SNAP_SHUT_MS = 220;
// Clicks on these act on their own; any other click in the grid closes the thread pane.
const GRID_CONTROL_SELECTOR = "[data-thread-key],button,a,input";

const LEGEND = [
  { label: "Working", className: "bg-status-working" },
  { label: "Needs you", className: "bg-status-needs-you" },
  { label: "Failed", className: "bg-status-failed" },
  { label: "Waiting", className: "bg-muted-foreground/45" },
  { label: "Done", className: "border border-muted-foreground/45" },
] as const;

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
  const pinned = useLocalStorage(PINNED_SECTION_EXPANDED_KEY, true, Schema.Boolean);
  const active = useLocalStorage(ACTIVE_SECTION_EXPANDED_KEY, true, Schema.Boolean);
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
  const persistedScopeKeys = useUiStateStore((store) => store.sidebarProjectScopeKeys);
  const setPersistedScopeKeys = useUiStateStore((store) => store.setSidebarProjectScopeKeys);
  const delegatedUnderParent = useDelegatedUnderParent();
  const lastVisitedById = useUiStateStore((store) => store.threadLastVisitedAtById);
  const clearSelection = useThreadSelectionStore((store) => store.clearSelection);
  const providerEntriesByEnvironment = useAtomValue(sidebarProviderEntriesAtom);
  const { environments } = useEnvironments();
  const clockKey = useSidebarPartitionClockKey(threads);
  const expansion = useOverviewRowExpansion();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [splitFraction, setSplitFraction] = useLocalStorage(SPLIT_FRACTION_KEY, 0.5, Schema.Number);
  const gridRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ readonly top: number; readonly height: number } | null>(null);

  const scopeKeys = resolveSidebarProjectScopeKeys({
    groups: projectGroups,
    keys: persistedScopeKeys,
    settings: projectGroupingSettings,
  });
  const scopedGroups = projectGroups.filter((group) => scopeKeys.includes(group.projectKey));
  const scopeKey = scopedGroups.length === 0 ? null : scopeKeys.join("\n");
  const projects = scopedGroups.length === 0 ? projectGroups : scopedGroups;
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
      scopedGroups.length === 0
        ? null
        : new Set(
            scopedGroups.flatMap((group) =>
              group.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
            ),
          ),
    delegatedUnderParent,
    serverConfigs,
    optimisticDrop: null,
    workingShelfEnabled,
    sortActiveBySend: false,
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
  const isNarrowed = statusFilter !== "all" || scopedGroups.length > 0;

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
  const accentColors = useProjectAccentColors(columns.map((column) => column.project));
  const fills = accentColors.map(projectFillColor);
  const phases = new Map(
    environments.map((environment) => [environment.environmentId, environment.connection.phase]),
  );
  const labelById = new Map(
    environments.map((environment) => [environment.environmentId, environment.label]),
  );
  const machinesByColumn = new Map(
    columns.map((column) => [
      column.projectKey,
      overviewColumnMachines(
        [
          ...(column.project?.memberProjects ?? []).map((member) => member.environmentId),
          ...rows.flatMap((row) =>
            (row.cells.get(column.projectKey) ?? []).map((thread) => thread.environmentId),
          ),
        ],
        phases,
        labelById,
      ),
    ]),
  );
  const focusGrid = columns.map((column) =>
    rows
      .filter((row) => expansion[row.section][0])
      .map((row) => (row.cells.get(column.projectKey) ?? []).map(threadShellKey)),
  );
  const allKeys = focusGrid.flat(2);
  const tabbableKey = focusKey !== null && allKeys.includes(focusKey) ? focusKey : allKeys[0];
  // A subagent row can open a child thread that has no card, and idle children have no shell.
  const openRef =
    openKey !== null &&
    threads.some(
      (thread) =>
        threadShellKey(thread) === openKey ||
        thread.source.activity?.subagents.some(
          (subagent) =>
            subagent.threadId !== null &&
            scopedThreadKey(scopeThreadRef(thread.environmentId, subagent.threadId)) === openKey,
        ),
    )
      ? parseScopedThreadKey(openKey)
      : null;
  if (openKey !== null && openRef === null) {
    setOpenKey(null);
  }
  const findCard = (threadKey: string) =>
    gridRef.current?.querySelector<HTMLElement>(`[data-thread-key="${CSS.escape(threadKey)}"]`) ??
    null;

  const openThread = useStableCallback((threadKey: string) => {
    const ref = parseScopedThreadKey(threadKey);
    if (ref === null) return;
    void updateClientSettings({ threadView: "list" });
    void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  });
  const showThread = useStableCallback((threadKey: string) => {
    setFocusKey(threadKey);
    setOpenKey(threadKey);
  });
  const startThreadIn = (project: NonNullable<OverviewColumn["project"]>) => {
    void updateClientSettings({ threadView: "list" });
    void handleNewThread(scopeProjectRef(project.environmentId, project.id));
  };
  const clearFilters = () => {
    setStatusFilter("all");
    clearSelection();
    setPersistedScopeKeys([]);
  };

  const handleGridFocus = (event: FocusEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).dataset.threadKey;
    if (key !== undefined) setFocusKey(key);
  };
  const handleGridClick = (event: MouseEvent<HTMLDivElement>) => {
    if (openKey === null) return;
    if (event.target instanceof Element && event.target.closest(GRID_CONTROL_SELECTOR)) return;
    setOpenKey(null);
  };
  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && openKey !== null) {
      event.preventDefault();
      setOpenKey(null);
      return;
    }
    const direction = ARROW_DIRECTIONS[event.key];
    const key = (event.target as HTMLElement).dataset.threadKey;
    if (direction === undefined || key === undefined) return;
    event.preventDefault();
    const next = moveOverviewFocus(focusGrid, key, direction);
    if (next === null) return;
    setFocusKey(next);
    findCard(next)?.focus();
  };

  const setPaneHeight = (fraction: number) => {
    if (paneRef.current) paneRef.current.style.height = `${fraction * 100}%`;
  };
  const snapPaneShut = () => {
    const pane = paneRef.current;
    if (!pane) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void pane
      .animate([{ height: `${pane.offsetHeight}px` }, { height: "0px" }], {
        duration: reduceMotion ? 0 : SNAP_SHUT_MS,
        easing: SNAP_SHUT_EASING,
        fill: "forwards",
      })
      .finished.then(
        () => setOpenKey(null),
        () => undefined,
      );
  };
  const handleDividerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const split = splitRef.current;
    if (event.button !== 0 || !split) return;
    event.preventDefault();
    const rect = split.getBoundingClientRect();
    dragRef.current = { top: rect.top, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleDividerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // Sized in the DOM so a drag never re-renders the grid.
    if (dragRef.current) setPaneHeight(overviewSplitDragFraction(event.clientY, dragRef.current));
  };
  const handleDividerPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const release = resolveOverviewSplitRelease(
      overviewSplitDragFraction(event.clientY, drag),
      drag.height,
    );
    if (release === null) {
      snapPaneShut();
      return;
    }
    setPaneHeight(release);
    setSplitFraction(release);
  };
  const handleDividerPointerCancel = () => {
    dragRef.current = null;
    setPaneHeight(splitFraction);
  };
  const handleDividerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: SPLIT_FRACTION_STEP, ArrowDown: -SPLIT_FRACTION_STEP }[event.key];
    const height = splitRef.current?.offsetHeight ?? 0;
    if (step === undefined || height === 0) return;
    event.preventDefault();
    const largest = overviewSplitDragFraction(0, { top: 0, height });
    const next = resolveOverviewSplitRelease(Math.min(splitFraction + step, largest), height);
    if (next === null) {
      snapPaneShut();
      return;
    }
    setPaneHeight(next);
    setSplitFraction(next);
  };

  return (
    <SidebarInset className="h-(--app-height) min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader
          data-focus-dims
          electron={isElectron}
          className="border-b border-border bg-muted text-xs whitespace-nowrap text-muted-foreground"
        >
          <span className="min-w-0 truncate">
            {columns.length} project{columns.length === 1 ? "" : "s"}, {cardCount} thread
            {cardCount === 1 ? "" : "s"}. Click a card to open it below. Double-click to open it
            full size.
            {columns.length === 1 && scopedGroups.length === 0
              ? " With one project, List view gives you more room."
              : null}
          </span>
          <span className="ml-auto flex shrink-0 gap-2.25">
            {LEGEND.map((item) => (
              <span key={item.label} className="flex items-center gap-1">
                <span aria-hidden className={cn("size-1.75", item.className)} />
                {item.label}
              </span>
            ))}
          </span>
        </WorkspacePageHeader>
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
          <div ref={splitRef} className="flex min-h-0 flex-1 flex-col">
            <div
              ref={gridRef}
              role="grid"
              aria-label="Overview"
              data-focus-dims
              className="min-h-0 flex-1 overflow-auto"
              onFocus={handleGridFocus}
              onClick={handleGridClick}
              onKeyDown={handleGridKeyDown}
            >
              <div
                className="grid min-w-full bg-card"
                style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))` }}
              >
                <div role="row" className="contents">
                  {columns.map((column, index) => (
                    <OverviewColumnHeader
                      key={column.projectKey}
                      column={column}
                      fill={fills[index]!}
                      machines={machinesByColumn.get(column.projectKey) ?? []}
                    />
                  ))}
                </div>
                {rows.map((row) => {
                  const [expanded, setExpanded] = expansion[row.section];

                  const showMore = expanded && row.section === "settled" && hiddenSettledCount > 0;
                  return (
                    <Fragment key={row.section}>
                      <div role="row" className="contents">
                        <div
                          role="rowheader"
                          className="col-span-full border-b border-border bg-background"
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
                              {SECTION_NAMES[row.section]}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {row.section === "settled" ? settledTotal : row.total}
                            </span>
                            <span className="text-muted-foreground/70">
                              {SECTION_NOTES[row.section]}
                            </span>
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
                                  const providerEntry = providerEntriesByEnvironment
                                    .get(thread.environmentId)
                                    ?.get(instanceId);
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
                                        providerEntry?.displayName ??
                                        thread.runtime?.providerName ??
                                        instanceId
                                      }
                                      providerEntry={providerEntry}
                                      lastVisitedAt={resolveThreadLastVisitedAt(
                                        thread.lastVisitedAt,
                                        lastVisitedById[key],
                                      )}
                                      wokeAt={threadWokeAt(thread, { now: partition.snoozeNow })}
                                      offline={isOverviewThreadOffline(
                                        thread.environmentId,
                                        phases,
                                      )}
                                      selected={key === openKey}
                                      tabbable={key === tabbableKey}
                                      onOpen={openThread}
                                      onSelect={showThread}
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
            {openRef === null ? null : (
              <>
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize thread pane"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(splitFraction * 100)}
                  tabIndex={0}
                  onPointerDown={handleDividerPointerDown}
                  onPointerMove={handleDividerPointerMove}
                  onPointerUp={handleDividerPointerUp}
                  onPointerCancel={handleDividerPointerCancel}
                  onKeyDown={handleDividerKeyDown}
                  data-info="Drag to resize. Drag all the way down to close."
                  className="h-1.5 shrink-0 cursor-row-resize touch-none border-y border-border bg-muted outline-0 outline-ring hover:bg-accent focus-visible:outline-2"
                />
                <div
                  ref={paneRef}
                  className="flex min-h-0 shrink-0 flex-col overflow-hidden"
                  style={{ height: `${splitFraction * 100}%` }}
                >
                  <ChatView
                    environmentId={openRef.environmentId}
                    threadId={openRef.threadId}
                    routeKind="server"
                  />
                </div>
              </>
            )}
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
      className="flex h-6 w-full cursor-pointer items-center justify-center gap-1 border border-dashed border-muted-foreground/40 text-2xs text-muted-foreground hover:border-muted-foreground hover:text-foreground"
    >
      <PlusIcon aria-hidden className="size-3" />
      New thread
    </button>
  );
}
