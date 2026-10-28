import type { OrchestrationV2ShellSubagent } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

import { cn } from "~/lib/utils";
import { AgentElapsed } from "../chat/AgentElapsed";
import { StatusLight } from "../StatusLight";
import {
  overviewStrobeDelay,
  overviewSubagentState,
  type OverviewLight,
  type OverviewStepLine,
  type OverviewSubagentState,
} from "./Overview.logic";

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

// A check is unreadable at 5px, so finished and stopped subagents both stay plain gray squares.
const SQUARE_CLASS: Record<OverviewSubagentState, string> = {
  running: "bg-status-working",
  failed: "bg-status-failed",
  stopped: "bg-muted-foreground/45",
  done: "bg-muted-foreground/45",
};

// The rows and the toggle act on their own, so the thread's own handlers must not see them.
const isolate = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

export function StepText(props: { readonly step: OverviewStepLine; readonly className?: string }) {
  return (
    <span className={cn("truncate", STEP_TONE_CLASS[props.step.tone], props.className)}>
      {props.step.text}
      {props.step.code ? <code className="font-mono">{props.step.code}</code> : null}
    </span>
  );
}

/** One square per subagent, as a button that shows or hides the subagent rows. */
export function SubagentToggle(props: {
  readonly subagents: ReadonlyArray<OrchestrationV2ShellSubagent>;
  readonly subagentCount: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly showCount?: boolean;
}) {
  const { subagentCount } = props;
  return (
    <button
      type="button"
      aria-expanded={props.expanded}
      aria-label={`${props.expanded ? "Hide" : "Show"} the lead and its ${subagentCount} subagent${subagentCount === 1 ? "" : "s"}`}
      onClick={(event) => {
        isolate(event);
        props.onToggle();
      }}
      onDoubleClick={isolate}
      onKeyDown={isolate}
      className="flex shrink-0 cursor-pointer items-center gap-0.75 border border-transparent px-0.5 text-3xs text-muted-foreground outline-0 outline-ring hover:border-accent focus-visible:outline-2"
    >
      <span aria-hidden className="flex items-center gap-0.5">
        {props.subagents.map((subagent, index) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key -- subagents carry no id; order is stable
            key={index}
            className={cn("size-1.25", SQUARE_CLASS[overviewSubagentState(subagent.status)])}
          />
        ))}
      </span>
      {props.showCount ? `${subagentCount} ${subagentCount === 1 ? "agent" : "agents"}` : null}
    </button>
  );
}

/** The lead's row and one row per subagent, as an expanded Overview card shows them. */
export function SubagentRows(props: {
  readonly threadKey: string;
  readonly light: OverviewLight;
  readonly step: OverviewStepLine | null;
  readonly leadWaiting: boolean;
  readonly subagents: ReadonlyArray<OrchestrationV2ShellSubagent>;
  readonly subagentCount: number;
  readonly onOpen: (subagent: OrchestrationV2ShellSubagent) => void;
  readonly className?: string;
}) {
  const { threadKey, light, step, leadWaiting, subagents, subagentCount } = props;
  return (
    <div className={cn("leading-relaxed", props.className)}>
      <div
        className="mb-px flex min-w-0 items-center gap-1.25 border-b border-border pb-px"
        style={{ "--strobe-delay": overviewStrobeDelay(threadKey, 1) } as CSSProperties}
      >
        <StatusLight
          size="small"
          tone={leadWaiting ? "idle" : light}
          strobe={light === "working" && !leadWaiting}
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
              props.onOpen(subagent);
            }}
            onDoubleClick={isolate}
            onKeyDown={isolate}
            data-info={subagent.threadId === null ? undefined : "Open this subagent's thread"}
            style={{ "--strobe-delay": overviewStrobeDelay(threadKey, index + 2) } as CSSProperties}
            className="flex w-full min-w-0 cursor-pointer items-center gap-1.25 text-left outline-0 outline-ring hover:bg-accent focus-visible:outline-2 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <StatusLight size="small" tone={SUBAGENT_LIGHT[state]} strobe={state === "running"} />
            <span className="max-w-[48%] shrink-0 truncate text-foreground">{subagent.title}</span>
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
  );
}

function isoOrNull(value: DateTime.Utc | null): string | null {
  return value === null ? null : DateTime.formatIso(value);
}
