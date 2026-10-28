import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { resolveSettledThreadTimestamp } from "@t3tools/client-runtime/state/thread-sort";
import type { OrchestrationV2ShellSubagent } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
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
  overviewSubagentState,
  type OverviewLight,
  type OverviewStepLine,
  type OverviewSubagentState,
  type OverviewWaitStrip,
} from "./Overview.logic";

// Like a clip's name bar: tinted while there is something to see, plain once it is quiet.
const HEADER_CLASS: Record<OverviewLight, string> = {
  working: "bg-[color-mix(in_oklab,var(--status-working)_16%,var(--muted))]",
  "needs-you": "bg-[color-mix(in_oklab,var(--status-needs-you)_16%,var(--muted))]",
  failed: "bg-[color-mix(in_oklab,var(--status-failed)_16%,var(--muted))]",
  waiting: "bg-[color-mix(in_oklab,var(--status-waiting)_16%,var(--muted))]",
  done: "bg-secondary",
  idle: "bg-secondary",
};

const STEP_TONE_CLASS: Record<OverviewStepLine["tone"], string> = {
  normal: "text-foreground",
  "needs-you": "text-status-needs-you",
  failed: "text-status-failed",
  dim: "text-muted-foreground",
};

const SUBAGENT_LIGHT: Record<OverviewSubagentState, OverviewLight> = {
  running: "working",
  failed: "failed",
  stopped: "idle",
  done: "done",
};

const SUBAGENT_FALLBACK: Record<OrchestrationV2ShellSubagent["status"], string> = {
  idle: "Done",
  pending: "Starting",
  running: "Working",
  waiting: "Working",
  completed: "Done",
  failed: "Failed",
  cancelled: "Stopped",
  interrupted: "Stopped",
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

// A check is unreadable at 5px, so finished and stopped subagents both stay plain gray squares.
const SQUARE_CLASS: Record<OverviewSubagentState, string> = {
  running: "bg-status-working",
  failed: "bg-status-failed",
  stopped: "bg-muted-foreground/45",
  done: "bg-muted-foreground/45",
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
  // The count and the rows act on their own, so the card's own handlers must not see them.
  const isolate = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();
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
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} the lead and its ${subagentCount} subagent${subagentCount === 1 ? "" : "s"}`}
            onClick={(event) => {
              isolate(event);
              setExpanded(!expanded);
            }}
            onDoubleClick={isolate}
            onKeyDown={isolate}
            className="flex shrink-0 cursor-pointer items-center gap-0.75 border border-transparent px-0.5 text-3xs text-muted-foreground outline-0 outline-ring hover:border-accent focus-visible:outline-2"
          >
            <span aria-hidden className="flex items-center gap-0.5">
              {subagents.map((subagent, index) => (
                <span
                  // oxlint-disable-next-line react/no-array-index-key -- subagents carry no id; order is stable
                  key={index}
                  className={cn("size-1.25", SQUARE_CLASS[overviewSubagentState(subagent.status)])}
                />
              ))}
            </span>
            {subagentCount} {subagentCount === 1 ? "agent" : "agents"}
          </button>
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
        <div className="border-t border-border bg-card px-1.75 pt-0.5 pb-0.75 text-3xs leading-relaxed">
          <div
            className="mb-px flex min-w-0 items-center gap-1.25 border-b border-border pb-px"
            style={{ "--strobe-delay": overviewStrobeDelay(threadKey, 1) } as CSSProperties}
          >
            <StatusLight
              size="small"
              tone={leadWaiting ? "idle" : light}
              strobe={working && !leadWaiting}
            />
            <span className="shrink-0 font-semibold">Lead</span>
            {step ? (
              <StepText step={step} className="min-w-0 flex-1" />
            ) : (
              <span className="min-w-0 flex-1" />
            )}
          </div>
          {subagents.map((subagent, index) => {
            const state = overviewSubagentState(subagent.status);
            return (
              <button
                // oxlint-disable-next-line react/no-array-index-key -- subagents carry no id; order is stable
                key={index}
                type="button"
                disabled={subagent.threadId === null}
                onClick={(event) => {
                  isolate(event);
                  openSubagent(subagent);
                }}
                onDoubleClick={isolate}
                onKeyDown={isolate}
                data-info={subagent.threadId === null ? undefined : "Open this subagent's thread"}
                style={
                  {
                    "--strobe-delay": overviewStrobeDelay(threadKey, index + 2),
                  } as CSSProperties
                }
                className="flex w-full min-w-0 cursor-pointer items-center gap-1.25 text-left outline-0 outline-ring hover:bg-accent focus-visible:outline-2 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <StatusLight
                  size="small"
                  tone={SUBAGENT_LIGHT[state]}
                  strobe={state === "running"}
                />
                <span className="max-w-[48%] shrink-0 truncate text-foreground">
                  {subagent.title}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    state === "failed" ? "text-status-failed" : "text-muted-foreground",
                  )}
                >
                  {subagent.step ?? SUBAGENT_FALLBACK[subagent.status]}
                </span>
                <span className="shrink-0 text-muted-foreground/80 tabular-nums">
                  <AgentElapsed
                    agent={{
                      status: subagent.status,
                      startedAt: isoOrNull(subagent.startedAt),
                      completedAt: isoOrNull(subagent.completedAt),
                    }}
                  />
                </span>
              </button>
            );
          })}
          {subagentCount > subagents.length ? (
            <div className="text-muted-foreground/80">
              {subagentCount - subagents.length} earlier subagents
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

function isoOrNull(value: DateTime.Utc | null): string | null {
  return value === null ? null : DateTime.formatIso(value);
}

function StepText(props: { readonly step: OverviewStepLine; readonly className?: string }) {
  return (
    <span className={cn("truncate", STEP_TONE_CLASS[props.step.tone], props.className)}>
      {props.step.text}
      {props.step.code ? <code className="font-mono">{props.step.code}</code> : null}
    </span>
  );
}

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
