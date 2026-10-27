import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import type { KeyboardEvent, MouseEvent } from "react";

import { readLocalApi } from "../../localApi";
import { cn } from "~/lib/utils";
import type { SidebarThreadSummary } from "../../types";
import type { SidebarStatusLabel } from "../sidebar/threadStatusLabel";
import { threadShellKey } from "../Sidebar.logic";
import type { OverviewColumn } from "./Overview.logic";

const STRIP_BY_ICON: Partial<Record<SidebarStatusLabel["icon"], string>> = {
  working: "bg-status-working",
  approval: "bg-status-needs-you",
  input: "bg-status-needs-you",
  request: "bg-status-needs-you",
  failed: "bg-status-failed",
};

export function OverviewCard(props: {
  readonly thread: SidebarThreadSummary;
  readonly column: OverviewColumn;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly parked: boolean;
  readonly status: SidebarStatusLabel | null;
  readonly providerName: string;
  readonly onOpen: (thread: SidebarThreadSummary) => void;
  readonly onPeek: (thread: SidebarThreadSummary) => void;
}) {
  const { thread, column, status } = props;
  const members = column.project?.memberProjects ?? [];
  const spansEnvironments = new Set(members.map((member) => member.environmentId)).size > 1;
  const machineLabel = spansEnvironments
    ? (members.find((member) => member.environmentId === thread.environmentId)?.environmentLabel ??
      null)
    : null;
  const prNumber = (
    resolveThreadCurrentPullRequestLink(thread.pullRequests) ??
    thread.linkedPullRequest ??
    thread.branchPullRequest
  )?.number;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onOpen(thread);
    } else if (event.key === " ") {
      event.preventDefault();
      props.onPeek(thread);
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
        if (action === "open-in-list") props.onOpen(thread);
      });
  };

  return (
    <div
      role="button"
      tabIndex={props.tabbable ? 0 : -1}
      data-thread-key={threadShellKey(thread)}
      aria-current={props.selected ? "true" : undefined}
      onClick={() => props.onPeek(thread)}
      onDoubleClick={() => props.onOpen(thread)}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      className={cn(
        "grid min-h-9 cursor-pointer grid-cols-[20px_minmax(0,1fr)] border border-border bg-card text-card-foreground outline-0 -outline-offset-1 outline-primary select-none focus-visible:outline-2",
        props.selected && "outline-2",
        props.parked && "opacity-55 saturate-50",
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
          {status ? <span className="font-semibold text-foreground">{status.label}</span> : null}
          <span className="truncate">{props.providerName}</span>
          {machineLabel ? <span className="truncate">{machineLabel}</span> : null}
          {prNumber === undefined ? null : <span>#{prNumber}</span>}
        </span>
      </span>
    </div>
  );
}
