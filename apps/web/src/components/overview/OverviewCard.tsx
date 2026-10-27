import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import { resolveSettledThreadTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import { memo, type KeyboardEvent, type MouseEvent } from "react";

import { readLocalApi } from "../../localApi";
import { cn } from "~/lib/utils";
import type { SidebarThreadSummary } from "../../types";
import { RelativeTimeLabel, threadTimeTimestamp } from "../sidebar/RelativeTimeLabel";
import {
  isSidebarThreadWoke,
  resolveSidebarStatusLabel,
  type SidebarStatusLabel,
} from "../sidebar/threadStatusLabel";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  threadShellKey,
  type SidebarSection,
} from "../Sidebar.logic";

const STRIP_BY_ICON: Partial<Record<SidebarStatusLabel["icon"], string>> = {
  working: "bg-status-working",
  approval: "bg-status-needs-you",
  input: "bg-status-needs-you",
  request: "bg-status-needs-you",
  plan: "bg-status-needs-you",
  failed: "bg-status-failed",
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
  readonly onPeek: (threadKey: string) => void;
}) {
  const { thread, lastVisitedAt } = props;
  const threadKey = threadShellKey(thread);
  const status = resolveSidebarStatusLabel({
    status: resolveSidebarThreadStatus(thread),
    goalActive: thread.goal?.status === "active",
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    isUnread: hasUnseenCompletion({ ...thread, lastVisitedAt }),
    isWoke: isSidebarThreadWoke({
      wokeAt: props.wokeAt,
      lastVisitedAt,
      settledOverride: thread.settledOverride,
    }),
  });
  const prNumber = (
    resolveThreadCurrentPullRequestLink(thread.pullRequests) ??
    thread.linkedPullRequest ??
    thread.branchPullRequest
  )?.number;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onOpen(threadKey);
    } else if (event.key === " ") {
      event.preventDefault();
      props.onPeek(threadKey);
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
      aria-label={[thread.title, props.projectName, status?.label].filter(Boolean).join(", ")}
      aria-pressed={props.selected}
      onClick={() => props.onPeek(threadKey)}
      onDoubleClick={() => props.onOpen(threadKey)}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      className={cn(
        "grid min-h-9 cursor-pointer grid-cols-[20px_minmax(0,1fr)] border border-border bg-card text-card-foreground outline-0 -outline-offset-1 outline-ring select-none focus-visible:outline-2",
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
          "bg-muted-foreground/25",
          status === null ? undefined : STRIP_BY_ICON[status.icon],
        )}
      />
      <span className="min-w-0 px-1.5 py-0.75">
        <span className="block truncate text-xs font-semibold">{thread.title}</span>
        <span className="flex gap-1.5 overflow-hidden text-3xs whitespace-nowrap text-muted-foreground">
          <span className="font-semibold text-foreground">
            {status ? (
              status.label
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
          <span className="truncate">{props.providerName}</span>
          {props.machineLabel ? <span className="truncate">{props.machineLabel}</span> : null}
          {prNumber === undefined ? null : <span>#{prNumber}</span>}
        </span>
      </span>
    </div>
  );
});
