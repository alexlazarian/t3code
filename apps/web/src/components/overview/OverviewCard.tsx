import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import { resolveSettledThreadTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import { Fragment, memo, type KeyboardEvent, type MouseEvent } from "react";

import { readLocalApi } from "../../localApi";
import { deriveActiveWorkStartedAt } from "../../session-logic";
import { cn } from "~/lib/utils";
import type { SidebarThreadSummary } from "../../types";
import { RelativeTimeLabel, threadTimeTimestamp } from "../sidebar/RelativeTimeLabel";
import {
  isSidebarThreadCompleted,
  isSidebarThreadWoke,
  resolveSidebarStatusLabel,
} from "../sidebar/threadStatusLabel";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  threadShellKey,
  type SidebarSection,
} from "../Sidebar.logic";
import { AgentElapsed } from "../chat/AgentElapsed";
import { overviewLaunchCell, type OverviewLaunchCell } from "./Overview.logic";

const LIT_CELL: Record<NonNullable<OverviewLaunchCell["lit"]>, string> = {
  working: "bg-status-working text-background",
  "needs-you": "bg-status-needs-you text-background",
  failed: "bg-status-failed text-background",
};

export const OverviewCard = memo(function OverviewCard(props: {
  readonly thread: SidebarThreadSummary;
  readonly section: SidebarSection;
  readonly projectName: string;
  readonly machineLabel: string | null;
  readonly providerName: string;
  readonly lastVisitedAt: string | undefined;
  readonly wokeAt: string | null;
  readonly offline: boolean;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly onOpen: (threadKey: string) => void;
  readonly onSelect: (threadKey: string) => void;
}) {
  const { thread, lastVisitedAt } = props;
  const threadKey = threadShellKey(thread);
  const isUnread = hasUnseenCompletion({ ...thread, lastVisitedAt });
  const status = resolveSidebarStatusLabel({
    status: resolveSidebarThreadStatus(thread),
    goalActive: thread.goal?.status === "active",
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    isUnread,
    isCompleted: isSidebarThreadCompleted(thread),
    isWoke: isSidebarThreadWoke({
      wokeAt: props.wokeAt,
      lastVisitedAt,
      settledOverride: thread.settledOverride,
    }),
  });
  const cell = overviewLaunchCell(status?.icon ?? null);
  const working = status?.icon === "working";
  const workingSince = working
    ? deriveActiveWorkStartedAt(thread.latestRun, thread.runtime, null)
    : null;
  const quiet = status === null || (status.icon === "done" && !isUnread);
  const prNumber = (
    resolveThreadCurrentPullRequestLink(thread.pullRequests) ??
    thread.linkedPullRequest ??
    thread.branchPullRequest
  )?.number;
  const meta = [
    status ? (
      <span key="status" className={cn("font-semibold", status.className)}>
        {status.label}
      </span>
    ) : null,
    <span key="provider" className="truncate">
      {props.providerName}
    </span>,
    props.machineLabel ? (
      <span key="machine" className="truncate">
        {props.machineLabel}
      </span>
    ) : null,
    prNumber === undefined ? null : <span key="pr">#{prNumber}</span>,
  ].filter((part) => part !== null);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onOpen(threadKey);
    } else if (event.key === " ") {
      event.preventDefault();
      props.onSelect(threadKey);
    }
  };
  const handleContextMenu = (event: MouseEvent) => {
    const api = readLocalApi();
    if (!api) return;
    event.preventDefault();
    void api.contextMenu
      .show([{ id: "open-in-list", label: "Open in List view" }], {
        x: event.clientX,
        y: event.clientY,
      })
      .then((action) => {
        if (action === "open-in-list") props.onOpen(threadKey);
      });
  };

  return (
    <div
      role="button"
      tabIndex={props.tabbable ? 0 : -1}
      data-thread-key={threadKey}
      data-info-thread={threadKey}
      aria-label={[thread.title, props.projectName, status?.label].filter(Boolean).join(", ")}
      aria-pressed={props.selected}
      onClick={() => props.onSelect(threadKey)}
      onDoubleClick={() => props.onOpen(threadKey)}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      className={cn(
        "grid min-h-9 cursor-pointer grid-cols-[20px_minmax(0,1fr)] border border-border bg-muted text-foreground outline-0 -outline-offset-1 outline-ring select-none focus-visible:outline-2",
        props.selected && "outline-2 outline-primary",
        props.offline
          ? "opacity-50"
          : (props.section === "snoozed" || props.section === "settled") &&
              "opacity-55 saturate-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center border-r border-border text-2xs font-bold",
          cell.lit === null ? "bg-background text-muted-foreground" : LIT_CELL[cell.lit],
        )}
      >
        {cell.glyph === "play" || cell.glyph === "hollow" ? (
          <span
            className={cn(
              "ms-px size-0 border-y-4 border-l-6 border-y-transparent border-l-current",
              cell.glyph === "hollow" && "opacity-80",
            )}
          />
        ) : cell.glyph === "stop" ? (
          <span className="size-2.25 bg-muted-foreground/45" />
        ) : (
          cell.glyph
        )}
      </span>
      <span className="min-w-0 px-1.5 py-0.75">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              quiet ? "text-muted-foreground" : "font-semibold",
            )}
          >
            {thread.title}
          </span>
          <span
            className={cn(
              "shrink-0 text-3xs tabular-nums",
              working ? "text-status-working" : "text-muted-foreground",
            )}
          >
            {workingSince !== null ? (
              <AgentElapsed
                agent={{ status: "running", startedAt: workingSince, completedAt: null }}
              />
            ) : (
              <RelativeTimeLabel
                timestamp={
                  props.section === "settled"
                    ? resolveSettledThreadTimestamp(thread)
                    : threadTimeTimestamp(thread)
                }
              />
            )}
          </span>
        </span>
        <span className="flex gap-1.5 overflow-hidden text-3xs whitespace-nowrap text-muted-foreground">
          {meta.map((part, index) => (
            <Fragment key={part.key}>
              {index > 0 ? <span aria-hidden>&middot;</span> : null}
              {part}
            </Fragment>
          ))}
        </span>
      </span>
    </div>
  );
});
