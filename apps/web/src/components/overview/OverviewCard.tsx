import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { resolveSettledThreadTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import type { OrchestrationV2ShellSubagent } from "@t3tools/contracts";
import { BotIcon, EyeIcon, ListIcon, RowsIcon, SquareTerminalIcon } from "lucide-react";
import { memo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

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
import type { SidebarProviderEntry } from "../sidebar/SidebarThreadRow";
import { UnsentDraftLabel } from "../sidebar/UnsentDraftLabel";
import { useThreadHasUnsentDraft } from "../../composerDraftStore";
import { AgentElapsed } from "../chat/AgentElapsed";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { StatusLight } from "../StatusLight";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  overviewLight,
  overviewRunningSubagents,
  overviewStepLine,
  overviewWaitStrip,
  overviewStrobeDelay,
  type OverviewLight,
  type OverviewWaitStrip,
} from "./Overview.logic";
import { StepText, SubagentRows, SubagentToggle } from "./OverviewSubagents";

// Like a clip's name bar: tinted while there is something to see, plain once it is quiet.
const HEADER_CLASS: Record<OverviewLight, string> = {
  working: "bg-[color-mix(in_oklab,var(--status-working)_16%,var(--muted))]",
  "needs-you": "bg-[color-mix(in_oklab,var(--status-needs-you)_16%,var(--muted))]",
  failed: "bg-[color-mix(in_oklab,var(--status-failed)_16%,var(--muted))]",
  waiting: "bg-[color-mix(in_oklab,var(--status-waiting)_16%,var(--muted))]",
  done: "bg-secondary",
  idle: "bg-secondary",
};

const WAIT_ICON: Record<
  OverviewWaitStrip["icon"],
  typeof ListIcon | typeof PullRequestGlyph.pullRequest
> = {
  command: SquareTerminalIcon,
  "pull-request": PullRequestGlyph.pullRequest,
  monitor: EyeIcon,
  subagent: BotIcon,
  task: ListIcon,
  many: RowsIcon,
};

export const OverviewCard = memo(function OverviewCard(props: {
  readonly thread: SidebarThreadSummary;
  readonly section: SidebarSection;
  readonly projectName: string;
  readonly machineLabel: string | null;
  readonly providerName: string;
  readonly providerEntry: SidebarProviderEntry | undefined;
  readonly lastVisitedAt: string | undefined;
  readonly wokeAt: string | null;
  readonly offline: boolean;
  readonly selected: boolean;
  readonly tabbable: boolean;
  readonly onOpen: (threadKey: string) => void;
  readonly onSelect: (threadKey: string) => void;
}) {
  const { thread, lastVisitedAt } = props;
  const [expanded, setExpanded] = useState(false);
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
  const icon = status?.icon ?? null;
  const light = overviewLight(icon);
  const working = light === "working";
  const activity = thread.source.activity ?? null;
  const subagents = activity?.subagents ?? [];
  const subagentCount = activity?.subagentCount ?? 0;
  const runningSubagents = overviewRunningSubagents(activity);
  const step = overviewStepLine({
    icon,
    activity,
    lastError: thread.runtime?.lastError ?? null,
    blockedOnThreadWait: thread.blockedOnThreadWait ?? false,
  });
  const leadWaiting = step?.tone === "dim" && working && runningSubagents > 0;
  const workingSince = working
    ? deriveActiveWorkStartedAt(thread.latestRun, thread.runtime, null)
    : null;
  const files = activity?.files;
  const queuedCount = thread.source.queuedRunCount ?? 0;
  // The selected card's composer is open in the pane below, like the sidebar's route thread.
  const hasUnsentDraft =
    useThreadHasUnsentDraft(scopeThreadRef(thread.environmentId, thread.id)) && !props.selected;
  const wait = light === "waiting" ? overviewWaitStrip(thread.pendingBackgroundTasks) : null;

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
  const openSubagent = (subagent: OrchestrationV2ShellSubagent) => {
    if (subagent.threadId === null) return;
    props.onSelect(scopedThreadKey(scopeThreadRef(thread.environmentId, subagent.threadId)));
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
      style={{ "--strobe-delay": overviewStrobeDelay(threadKey) } as CSSProperties}
      className={cn(
        "min-w-0 cursor-pointer border border-border bg-muted text-foreground outline-0 -outline-offset-1 outline-ring select-none focus-visible:outline-2",
        props.selected && "outline-2 outline-primary",
        props.offline
          ? "opacity-50"
          : (props.section === "snoozed" || props.section === "settled") &&
              "opacity-55 saturate-50",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5 border-b border-border px-1.75 py-0.75",
          HEADER_CLASS[light],
        )}
      >
        <StatusLight tone={light} strobe={working || runningSubagents > 0} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            light === "done" || light === "idle" ? "text-muted-foreground" : "font-semibold",
          )}
        >
          {thread.title}
        </span>
        {subagentCount > 0 ? (
          <SubagentToggle
            subagents={subagents}
            subagentCount={subagentCount}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
            showCount
          />
        ) : null}
        <Tooltip>
          <TooltipTrigger info={props.providerName} render={<span className="flex shrink-0" />}>
            {props.providerEntry ? (
              <ProviderInstanceIcon
                driverKind={props.providerEntry.driverKind}
                displayName={props.providerName}
                accentColor={props.providerEntry.accentColor}
                acpRegistryAgentId={props.providerEntry.acpRegistryAgentId}
                acpRegistryIconUrl={props.providerEntry.acpRegistryIconUrl}
                iconClassName="size-3"
              />
            ) : (
              <span className="text-3xs text-muted-foreground">{props.providerName}</span>
            )}
          </TooltipTrigger>
          <TooltipPopup>{props.providerName}</TooltipPopup>
        </Tooltip>
      </div>
      {wait ? <WaitStrip wait={wait} /> : null}
      <div className="min-w-0 px-1.75 pt-0.75 pb-1 text-3xs leading-normal">
        {step ? <StepText step={step} className="block" /> : null}
        <span className="flex gap-1.75 overflow-hidden whitespace-nowrap text-muted-foreground/80">
          {activity && activity.stepCount > 0 ? (
            <span>
              {activity.stepCount} step{activity.stepCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {files ? (
            files.changed === 0 ? (
              <span>no changes</span>
            ) : (
              <>
                <span>
                  {files.changed} file{files.changed === 1 ? "" : "s"}
                </span>
                {files.additions !== undefined ? (
                  <span className="text-status-working">+{files.additions}</span>
                ) : null}
                {files.deletions !== undefined ? (
                  <span className="text-status-failed">-{files.deletions}</span>
                ) : null}
              </>
            )
          ) : null}
          {queuedCount > 0 ? <span>{queuedCount} queued</span> : null}
          {hasUnsentDraft ? <UnsentDraftLabel /> : null}
          {props.machineLabel ? <span className="truncate">{props.machineLabel}</span> : null}
          <span
            className={cn(
              "ml-auto shrink-0 tabular-nums",
              working && "text-status-working",
              light === "waiting" && "text-status-waiting",
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
      </div>
      {expanded && subagentCount > 0 ? (
        <SubagentRows
          threadKey={threadKey}
          light={light}
          step={step}
          leadWaiting={leadWaiting}
          subagents={subagents}
          subagentCount={subagentCount}
          onOpen={openSubagent}
          className="border-t border-border bg-card px-1.75 pt-0.5 pb-0.75 text-3xs"
        />
      ) : null}
    </div>
  );
});

function WaitStrip(props: { readonly wait: OverviewWaitStrip }) {
  const Icon = WAIT_ICON[props.wait.icon];
  return (
    <div className="flex min-w-0 items-center gap-1.25 border-b border-border bg-status-waiting/8 px-1.75 py-0.5 text-3xs">
      <Icon aria-hidden className="size-2.5 shrink-0 text-status-waiting" />
      <span
        className={cn("min-w-0 flex-1 truncate text-foreground", props.wait.code && "font-mono")}
      >
        {props.wait.text}
      </span>
      {props.wait.meta ? (
        <span className="shrink-0 text-muted-foreground/80">{props.wait.meta}</span>
      ) : null}
    </div>
  );
}
