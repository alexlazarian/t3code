import { useAtomValue } from "@effect/atom-react";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import { useRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { ChevronDownIcon } from "lucide-react";
import { Fragment, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { isElectron } from "../../env";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import { selectProjectGroupingSettings } from "../../logicalProject";
import { resolveSidebarProjectScopeKey } from "../../sidebarProjectGrouping";
import { useQuietThreadShells, useServerConfigs } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import type { SidebarThreadSummary } from "../../types";
import { useUiStateStore } from "../../uiStateStore";
import { cn } from "~/lib/utils";
import {
  hasUnseenCompletion,
  partitionSidebarThreads,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
  threadShellKey,
  type SidebarSection,
} from "../Sidebar.logic";
import { sidebarProviderEntriesAtom } from "../sidebar/sidebarProviderEntries";
import {
  SETTLED_SHELF_EXPANDED_KEY,
  SIDEBAR_SHELF_EXPANDED_DEFAULT,
  SNOOZED_SHELF_EXPANDED_KEY,
  WORKING_SHELF_EXPANDED_KEY,
  useSidebarPartitionClockKey,
} from "../sidebar/sidebarShelves";
import { isSidebarThreadWoke, resolveSidebarStatusLabel } from "../sidebar/threadStatusLabel";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  buildOverviewGrid,
  moveOverviewFocus,
  overviewProjectKeyOf,
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
  const threads = useQuietThreadShells();
  const serverConfigs = useServerConfigs();
  const projectGroups = useSidebarProjectGroups();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const workingShelfEnabled = useClientSettings((s) => s.sidebarWorkingShelfEnabled);
  const statusFilter = useUiStateStore((store) => store.sidebarStatusFilter);
  const persistedScopeKey = useUiStateStore((store) => store.sidebarProjectScopeKey);
  const lastVisitedById = useUiStateStore((store) => store.threadLastVisitedAtById);
  const providerEntriesByEnvironment = useAtomValue(sidebarProviderEntriesAtom);
  const clockKey = useSidebarPartitionClockKey(threads);
  const expansion = useOverviewRowExpansion();
  const [activeKey, setActiveKey] = useState<string | null>(null);
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
  const { columns, rows } = buildOverviewGrid({
    partition,
    projects,
    projectKeyOf: overviewProjectKeyOf(projects),
    workingShelfEnabled,
  });

  const focusGrid = columns.map((column) =>
    rows
      .filter((row) => expansion[row.section][0])
      .map((row) => (row.cells.get(column.projectKey) ?? []).map(threadShellKey)),
  );
  const allKeys = focusGrid.flat(2);
  const tabbableKey = activeKey !== null && allKeys.includes(activeKey) ? activeKey : allKeys[0];

  const describeStatus = (thread: SidebarThreadSummary) => {
    const lastVisitedAt = resolveThreadLastVisitedAt(
      thread.lastVisitedAt,
      lastVisitedById[threadShellKey(thread)],
    );
    return resolveSidebarStatusLabel({
      status: resolveSidebarThreadStatus(thread),
      goalActive: thread.goal?.status === "active",
      isUnread: hasUnseenCompletion({ ...thread, lastVisitedAt }),
      isWoke: isSidebarThreadWoke({
        wokeAt: threadWokeAt(thread, { now: partition.snoozeNow }),
        lastVisitedAt,
        settledOverride: thread.settledOverride,
      }),
    });
  };
  const providerNameOf = (thread: SidebarThreadSummary) => {
    const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
    return (
      providerEntriesByEnvironment.get(thread.environmentId)?.get(instanceId)?.displayName ??
      thread.runtime?.providerName ??
      instanceId
    );
  };

  const openThread = (thread: SidebarThreadSummary) => {
    void updateClientSettings({ threadView: "list" });
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams({ environmentId: thread.environmentId, threadId: thread.id }),
    });
  };
  const peekThread = (thread: SidebarThreadSummary) => setActiveKey(threadShellKey(thread));

  const handleGridFocus = (event: FocusEvent<HTMLDivElement>) => {
    const key = (event.target as HTMLElement).dataset.threadKey;
    if (key !== undefined) setActiveKey(key);
  };
  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = ARROW_DIRECTIONS[event.key];
    const key = (event.target as HTMLElement).dataset.threadKey;
    if (direction === undefined || key === undefined) return;
    event.preventDefault();
    const next = moveOverviewFocus(focusGrid, key, direction);
    if (next === null) return;
    setActiveKey(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-thread-key="${CSS.escape(next)}"]`)?.focus();
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <span className="text-xs text-muted-foreground">Overview</span>
        </WorkspacePageHeader>
        {columns.length === 1 ? (
          <p className="border-b border-border px-2 py-1 text-2xs text-muted-foreground">
            With one project, List has more room.
          </p>
        ) : null}
        {columns.length === 0 ? null : (
          <div
            ref={gridRef}
            className="min-h-0 flex-1 overflow-auto"
            onFocus={handleGridFocus}
            onKeyDown={handleGridKeyDown}
          >
            <div
              className="grid min-w-full"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))` }}
            >
              {columns.map((column) => (
                <OverviewColumnHeader key={column.projectKey} column={column} />
              ))}
              {rows.map((row) => {
                const [expanded, setExpanded] = expansion[row.section];
                const label = SECTION_LABELS[row.section];
                return (
                  <Fragment key={row.section}>
                    <div className="col-span-full border-b border-border bg-muted">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpanded(!expanded)}
                        className="sticky left-0 flex h-5 cursor-pointer items-center gap-1.5 px-2 text-3xs whitespace-nowrap"
                      >
                        <ChevronDownIcon
                          aria-hidden
                          className={cn("size-3 text-muted-foreground", !expanded && "-rotate-90")}
                        />
                        <span className="font-semibold tracking-wide text-foreground uppercase">
                          {label.name}
                        </span>
                        <span className="text-muted-foreground tabular-nums">{row.total}</span>
                        <span className="text-muted-foreground/70">{label.why}</span>
                      </button>
                    </div>
                    {expanded
                      ? columns.map((column) => (
                          <div
                            key={column.projectKey}
                            className="flex min-h-2.5 min-w-0 flex-col gap-0.75 border-r border-b border-border p-0.75"
                          >
                            {(row.cells.get(column.projectKey) ?? []).map((thread) => {
                              const key = threadShellKey(thread);
                              return (
                                <OverviewCard
                                  key={key}
                                  thread={thread}
                                  column={column}
                                  selected={key === activeKey}
                                  tabbable={key === tabbableKey}
                                  parked={row.section === "snoozed" || row.section === "settled"}
                                  status={describeStatus(thread)}
                                  providerName={providerNameOf(thread)}
                                  onOpen={openThread}
                                  onPeek={peekThread}
                                />
                              );
                            })}
                          </div>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </SidebarInset>
  );
}
