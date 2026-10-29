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
import { ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { isElectron } from "../../env";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useProjectAccentColors } from "../../hooks/useProjectAccentColor";
import { useStableCallback } from "../../hooks/useStableCallback";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import { resolveSidebarProjectScopeKeys } from "../../sidebarProjectGrouping";
import { useEnvironments } from "../../state/environments";
import {
  useDelegatedUnderParent,
  useQuietThreadShells,
  useServerConfigs,
} from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import {
  currentThreadKey,
  noteOverviewSplitClosed,
  noteOverviewSplitOpened,
  overviewSplitThreadKey,
  subscribeOverviewSplit,
} from "../../threadView";
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
  DRAFTS_SHELF_EXPANDED_KEY,
  PINNED_SECTION_EXPANDED_KEY,
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
  orderOverviewProjects,
  overviewProjectOrderKeys,
  overviewColumnMachines,
  overviewMachineSpans,
  overviewProjectKeyOf,
  overviewSplitDragFraction,
  resolveOverviewPaneTarget,
  resolveOverviewSplitRelease,
  type OverviewColumn,
  type OverviewFocusDirection,
  type OverviewRow,
} from "./Overview.logic";
import { OverviewCard } from "./OverviewCard";
import { OverviewColumnHeader } from "./OverviewColumnHeader";
import { OverviewDraftsShelf } from "./OverviewDraftCard";
import { OverviewMachineRow } from "./OverviewMachineRow";
import { OverviewShelf } from "./OverviewShelf";

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
  { label: "Waiting", className: "bg-status-waiting" },
  { label: "Done", className: "border border-muted-foreground/45" },
] as const;

const ARROW_DIRECTIONS: Partial<Record<string, OverviewFocusDirection>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// Working, Snoozed and Settled share the sidebar shelves' keys, so collapsing one collapses both.
function useOverviewRowExpansion(): {
  drafts: readonly [boolean, (v: boolean) => void];
  sections: Record<SidebarSection, readonly [boolean, (v: boolean) => void]>;
} {
  const drafts = useLocalStorage(DRAFTS_SHELF_EXPANDED_KEY, true, Schema.Boolean);
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
  return { drafts, sections: { pinned, active, working, snoozed, settled } };
}

export function OverviewView() {
  const router = useRouter();
  const handleNewThread = useNewThreadHandler();
  const threads = useQuietThreadShells();
  const serverConfigs = useServerConfigs();
  const projectGroups = useSidebarProjectGroups();
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const reorderProjects = useUiStateStore((store) => store.reorderProjects);
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
  // Both start from the thread List showed last, so switching views does not lose it.
  const [focusKey, setFocusKey] = useState(currentThreadKey);
  const openKey = useSyncExternalStore(subscribeOverviewSplit, overviewSplitThreadKey);
  const draftSessions = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const draftRedirects = useComposerDraftStore((store) => store.promotedDraftRedirects);
  const [columnDrag, setColumnDrag] = useState<{
    readonly from: string;
    readonly over: string | null;
  } | null>(null);
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
  const orderedGroups = orderOverviewProjects(projectGroups, projectOrder);
  const scopedGroups = orderedGroups.filter((group) => scopeKeys.includes(group.projectKey));
  const scopeKey = scopedGroups.length === 0 ? null : scopeKeys.join("\n");
  const projects = scopedGroups.length === 0 ? orderedGroups : scopedGroups;
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
    statusFilter,
    routeRowThreadKey: null,
    clockKey,
  });
  const settledTotal = partition.settledThreads.length;
  const hiddenSettledCount = Math.max(0, settledTotal - settledTail.count);
  const projectKeyOf = overviewProjectKeyOf(projects);
  const { columns, rows } = buildOverviewGrid({
    partition: {
      ...partition,
      settledThreads: partition.settledThreads.slice(0, settledTail.count),
    },
    projects,
    projectKeyOf,
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
  const accentColors = useProjectAccentColors(columns.map((column) => column.project));
  const machineSpans = overviewMachineSpans(
    columns.map((column) => machinesByColumn.get(column.projectKey) ?? []),
  );
  const focusGrid = columns.map((column) =>
    rows
      .filter((row) => expansion.sections[row.section][0])
      .map((row) => (row.cells.get(column.projectKey) ?? []).map(threadShellKey)),
  );
  const allKeys = focusGrid.flat(2);
  const tabbableKey = focusKey !== null && allKeys.includes(focusKey) ? focusKey : allKeys[0];
  // A subagent row can open a child thread that has no card, and idle children have no shell.
  const serverThreadKeys = new Set(
    threads.flatMap((thread) => [
      threadShellKey(thread),
      ...(thread.source.activity?.subagents ?? []).flatMap((subagent) =>
        subagent.threadId === null
          ? []
          : [scopedThreadKey(scopeThreadRef(thread.environmentId, subagent.threadId))],
      ),
    ]),
  );
  const [seenServerThreadKeys, setSeenServerThreadKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  if (openKey !== null && serverThreadKeys.has(openKey) && !seenServerThreadKeys.has(openKey)) {
    setSeenServerThreadKeys(new Set([...seenServerThreadKeys, openKey]));
  }
  const paneTarget = resolveOverviewPaneTarget(openKey, {
    serverThreadKeys,
    draftIdByThreadKey: new Map(
      Object.entries(draftSessions).map(([draftKey, session]) => [
        scopedThreadKey(scopeThreadRef(session.environmentId, session.threadId)),
        DraftId.make(draftKey),
      ]),
    ),
    promotedThreadKeys: new Set(Object.values(draftRedirects).map(scopedThreadKey)),
    seenServerThreadKeys,
  });
  const openRef = paneTarget === null ? null : parseScopedThreadKey(paneTarget.threadKey);
  const paneMissing = openKey !== null && paneTarget === null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- closes the shared split store once its thread or draft is gone
  useEffect(() => {
    if (paneMissing) noteOverviewSplitClosed();
  }, [paneMissing]);
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
    const ref = parseScopedThreadKey(threadKey);
    if (ref !== null) noteOverviewSplitOpened(ref);
    setFocusKey(threadKey);
  });
  const closeSplit = () => {
    noteOverviewSplitClosed();
  };
  const startThreadIn = (project: NonNullable<OverviewColumn["project"]>) => {
    void handleNewThread(scopeProjectRef(project.environmentId, project.id));
  };
  const settledMoreShown = (row: OverviewRow) =>
    row.section === "settled" && hiddenSettledCount > 0 && expansion.sections.settled[0];
  const shelfSizes = rows.map(
    (row) => (expansion.sections[row.section][0] ? 2 : 1) + (settledMoreShown(row) ? 1 : 0),
  );
  const shelfRows = shelfSizes.map(
    (_, index) =>
      3 +
      (expansion.drafts[0] ? 2 : 1) +
      shelfSizes.slice(0, index).reduce((sum, size) => sum + size, 0),
  );
  const allExpanded = expansion.drafts[0] || rows.some((row) => expansion.sections[row.section][0]);
  const toggleAll = () => {
    expansion.drafts[1](!allExpanded);
    for (const row of rows) expansion.sections[row.section][1](!allExpanded);
  };
  const clearFilters = () => {
    setStatusFilter("all");
    clearSelection();
    setPersistedScopeKeys([]);
  };

  const columnIndex = (projectKey: string) =>
    columns.findIndex((column) => column.projectKey === projectKey);
  const handleColumnDragOver = (projectKey: string) => {
    if (columnDrag === null) return false;
    const target = columns[columnIndex(projectKey)];
    if (target?.project == null || projectKey === columnDrag.from) return false;
    if (columnDrag.over !== projectKey) setColumnDrag({ ...columnDrag, over: projectKey });
    return true;
  };
  const handleColumnDrop = (projectKey: string) => {
    const dragged = orderedGroups.find((group) => group.projectKey === columnDrag?.from);
    const target = orderedGroups.find((group) => group.projectKey === projectKey);
    setColumnDrag(null);
    if (dragged === undefined || target === undefined || dragged === target) return;
    // Columns can hide scoped-out projects, so the order spans every project.
    reorderProjects(
      overviewProjectOrderKeys(orderedGroups),
      overviewProjectOrderKeys([dragged]),
      overviewProjectOrderKeys([target]),
    );
  };

  const handleGridFocus = (event: FocusEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).dataset.threadKey;
    if (key !== undefined) setFocusKey(key);
  };
  const handleGridClick = (event: MouseEvent<HTMLDivElement>) => {
    if (openKey === null) return;
    if (event.target instanceof Element && event.target.closest(GRID_CONTROL_SELECTOR)) return;
    closeSplit();
  };
  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && openKey !== null) {
      event.preventDefault();
      closeSplit();
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
        () => closeSplit(),
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
            {cardCount} thread{cardCount === 1 ? "" : "s"} &middot; click to open below,
            double-click for full size
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
                style={{
                  gridTemplateColumns: `22px repeat(${columns.length}, minmax(180px, 1fr))`,
                }}
              >
                <div
                  role="presentation"
                  style={{ gridColumn: 1, gridRow: "1 / span 2" }}
                  className="sticky top-0 z-13 flex items-center justify-center border-r border-b border-border bg-background"
                >
                  <Button
                    variant="ghost-muted"
                    size="icon-tiny"
                    aria-label={allExpanded ? "Collapse all shelves" : "Expand all shelves"}
                    data-info={allExpanded ? "Collapse all shelves" : "Expand all shelves"}
                    onClick={toggleAll}
                  >
                    {allExpanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
                  </Button>
                </div>
                <div role="row" className="contents">
                  <OverviewMachineRow spans={machineSpans} />
                  {columns.map((column, index) => (
                    <OverviewColumnHeader
                      key={column.projectKey}
                      column={column}
                      columnIndex={index}
                      accentColor={accentColors[index] ?? null}
                      machines={machinesByColumn.get(column.projectKey) ?? []}
                      dropSide={
                        columnDrag?.over === column.projectKey
                          ? columnIndex(columnDrag.from) > index
                            ? "before"
                            : "after"
                          : null
                      }
                      onDragStart={(projectKey) => setColumnDrag({ from: projectKey, over: null })}
                      onDragOver={handleColumnDragOver}
                      onDrop={handleColumnDrop}
                      onDragEnd={() => setColumnDrag(null)}
                    />
                  ))}
                </div>
                <OverviewDraftsShelf
                  columns={columns}
                  projectKeyOf={projectKeyOf}
                  openKey={openKey}
                  row={3}
                  expanded={expansion.drafts[0]}
                  onToggle={() => expansion.drafts[1](!expansion.drafts[0])}
                  onOpen={showThread}
                  onNewThread={startThreadIn}
                />
                {rows.map((row, rowIndex) => {
                  const [expanded, setExpanded] = expansion.sections[row.section];
                  const shelfRow = shelfRows[rowIndex]!;
                  const showMore = expanded && row.section === "settled" && hiddenSettledCount > 0;
                  return (
                    <Fragment key={row.section}>
                      <OverviewShelf
                        name={SECTION_NAMES[row.section]}
                        total={row.section === "settled" ? settledTotal : row.total}
                        expanded={expanded}
                        onToggle={() => setExpanded(!expanded)}
                        urgency={row.urgency}
                        row={shelfRow}
                        columns={columns.map((column) => ({
                          key: column.projectKey,
                          count: row.cells.get(column.projectKey)?.length ?? 0,
                          cell: (row.cells.get(column.projectKey) ?? []).map((thread) => {
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
                                offline={isOverviewThreadOffline(thread.environmentId, phases)}
                                selected={key === openKey}
                                tabbable={key === tabbableKey}
                                onOpen={openThread}
                                onSelect={showThread}
                              />
                            );
                          }),
                        }))}
                      />
                      {showMore ? (
                        <div role="row" className="contents">
                          <div
                            role="gridcell"
                            style={{ gridColumn: "1 / -1", gridRow: shelfRow + 2 }}
                            className="border-b border-border"
                          >
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
              </div>
            </div>
            {paneTarget === null || openRef === null ? null : (
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
                  {paneTarget.kind === "draft" ? (
                    <ChatView
                      key={paneTarget.threadKey}
                      draftId={paneTarget.draftId}
                      environmentId={openRef.environmentId}
                      threadId={openRef.threadId}
                      routeKind="draft"
                    />
                  ) : (
                    <ChatView
                      key={paneTarget.threadKey}
                      environmentId={openRef.environmentId}
                      threadId={openRef.threadId}
                      routeKind="server"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </SidebarInset>
  );
}
