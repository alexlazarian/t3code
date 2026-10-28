import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { projectedSubagentsToRuntime } from "@t3tools/client-runtime/state/subagentRuntime";
import type { OrchestrationV2Subagent, OrchestrationV2TurnItem } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { memo, use, useState } from "react";

import { buildThreadRouteParams } from "../../threadRoutes";
import { useEnvironment } from "../../state/environments";
import { environmentThreadDetails } from "../../state/threads";
import { ThreadHoverCardPopup } from "../ThreadHoverCard";
import { Tooltip, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { AgentElapsed } from "./AgentElapsed";
import {
  SUBAGENT_STATUS_WORDS,
  subagentBlockSummary,
  subagentDetailLine,
  subagentRowState,
  selectSubagentsById,
  type SubagentRowState,
} from "./SubagentBlock.logic";
import { subagentGroupTiming } from "./TimelineV2EventRow.logic";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";
import { isoOrNull, SubagentElapsed, SubagentTimelineTooltip } from "./V2LifecycleRow";
import { WorkLogBlock } from "./WorkLog";

type SubagentItem = Extract<OrchestrationV2TurnItem, { type: "subagent" }>;

const STATE_TEXT: Record<SubagentRowState, string> = {
  running: "text-status-working",
  idle: "text-muted-foreground",
  done: "text-muted-foreground",
  failed: "text-status-failed",
  stopped: "text-muted-foreground",
};

/** A run of subagents from one turn: a header and one dense row per subagent. */
export const SubagentBlock = memo(function SubagentBlock({
  row,
}: {
  row: Extract<TimelineRow, { kind: "event" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const members = (row.subagents ?? [row.projectedItem]).flatMap(({ item }) =>
    item.type === "subagent" ? [item] : [],
  );
  const memberIdsKey = members.map((item) => item.subagentId).join("\n");
  // Keyed on the id string so the compiler keeps one selector, and its cache, per member set.
  const pickLiveAgents = selectSubagentsById<OrchestrationV2Subagent>(memberIdsKey.split("\n"));
  // One subscription per block, not per row.
  const liveAgents = useAtomValue(
    environmentThreadDetails.threadAtom(
      scopeThreadRef(ctx.activeThreadEnvironmentId, row.projectedItem.item.threadId),
    ),
    (thread) => pickLiveAgents(thread?.projection.subagents),
  );
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        members
          .map((item) => item.id)
          .filter((id) => ctx.workGroupViewState.expandedEntries.has(`subagent:${id}`)),
      ),
  );
  const agents = members.map((item, index) => {
    const live = liveAgents[index] ?? null;
    return {
      item,
      live,
      status: live?.status ?? item.status,
      startedAt: live?.startedAt ?? item.startedAt,
      completedAt: live?.completedAt ?? item.completedAt,
      result: live?.result ?? item.result,
      progress: live?.progress ?? item.progress,
    };
  });
  const toggle = (id: string) => {
    const key = `subagent:${id}`;
    const next = new Set(openIds);
    ctx.onToggleWorkEntry(row.id);
    if (next.delete(id)) ctx.workGroupViewState.expandedEntries.delete(key);
    else {
      next.add(id);
      ctx.workGroupViewState.expandedEntries.add(key);
    }
    setOpenIds(next);
  };
  const several = agents.length > 1;
  const groupTiming = subagentGroupTiming(agents);
  const anyRunning = groupTiming.status === "running" && groupTiming.startedAt !== null;

  return (
    <WorkLogBlock continues={row.continuesWorkLog}>
      <section
        data-subagent-group
        aria-label={several ? `${agents.length} subagents` : "Subagent"}
        className="my-1 min-w-0 border border-border bg-card text-xs"
      >
        <div className="flex h-6.25 min-w-0 items-center gap-2 border-b border-border bg-secondary px-2 whitespace-nowrap">
          <span className="text-2xs font-semibold tracking-wider text-foreground uppercase">
            {several ? "Subagents" : "Subagent"}
          </span>
          {several ? (
            <>
              <span className="text-2xs text-muted-foreground tabular-nums">{agents.length}</span>
              <span className="min-w-0 truncate text-2xs text-muted-foreground">
                in parallel &middot; {subagentBlockSummary(agents.map(({ status }) => status))}
              </span>
            </>
          ) : null}
          {anyRunning ? (
            <span className="ms-auto shrink-0 text-2xs text-muted-foreground tabular-nums">
              running <SubagentElapsed agent={groupTiming} />
            </span>
          ) : null}
        </div>
        {agents.map((agent) => (
          <SubagentBlockRow
            key={agent.item.id}
            {...agent}
            open={openIds.has(agent.item.id)}
            onToggle={() => toggle(agent.item.id)}
          />
        ))}
      </section>
    </WorkLogBlock>
  );
});

function SubagentBlockRow(props: {
  readonly item: SubagentItem;
  readonly live: OrchestrationV2Subagent | null;
  readonly status: OrchestrationV2TurnItem["status"];
  readonly startedAt: SubagentItem["startedAt"];
  readonly completedAt: SubagentItem["completedAt"];
  readonly result: string | null;
  readonly progress: string | undefined;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const ctx = use(TimelineRowCtx);
  const { item, status } = props;
  const state = subagentRowState(status);
  const word = SUBAGENT_STATUS_WORDS[status];
  const title = formatSubagentDisplayTitle(item.title ?? "Subagent");
  const detail = subagentDetailLine({
    state,
    result: props.result,
    progress: props.progress,
  });
  const result = props.result?.trim() || null;
  const progress = props.progress?.trim() || null;
  const expandable = result !== null || progress !== null;
  const threadId = item.childThreadId;
  const parentRef = scopeThreadRef(ctx.activeThreadEnvironmentId, item.threadId);
  const remote = props.live?.remoteChild ?? item.remoteChild;
  const remoteEnvironment = useEnvironment(remote?.environmentId ?? null);
  const navigate = useNavigate();
  // A task in a linked environment opens there, if this client is connected to it.
  const open =
    threadId !== null
      ? () => ctx.onOpenThread(threadId)
      : remote !== undefined && remoteEnvironment !== null
        ? () =>
            void navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(scopeThreadRef(remote.environmentId, remote.threadId)),
            })
        : null;
  const timing = {
    status,
    startedAt: isoOrNull(props.startedAt),
    completedAt: isoOrNull(props.completedAt),
  };

  const titleClassName = "min-w-0 truncate text-left font-semibold text-foreground";
  return (
    <div data-v2-item-type="subagent" className="border-b border-border/60 last:border-b-0">
      <div
        className={cn(
          "grid h-6.75 min-w-0 grid-cols-[1.075rem_1.075rem_minmax(7rem,14.5rem)_minmax(0,1fr)_auto_4rem] items-center gap-x-2 px-2",
          state === "running" && "bg-status-working/7",
        )}
      >
        {expandable ? (
          <button
            type="button"
            aria-expanded={props.open}
            aria-label={`${props.open ? "Hide" : "Show"} details for ${title}`}
            data-scroll-anchor-ignore
            onClick={props.onToggle}
            className="flex size-4.25 cursor-pointer items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
          >
            <ChevronRightIcon aria-hidden className={cn("size-3", props.open && "rotate-90")} />
          </button>
        ) : (
          <span aria-hidden />
        )}
        <SubagentStateGlyph state={state} />
        <Tooltip>
          <TooltipTrigger
            delay={200}
            render={
              open === null ? (
                <span aria-description={word} className={titleClassName}>
                  {title}
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`Open ${title}`}
                  aria-description={word}
                  onClick={open}
                  className={cn(
                    titleClassName,
                    "cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                  )}
                >
                  {title}
                </button>
              )
            }
          />
          <ThreadHoverCardPopup>
            <SubagentTimelineTooltip
              parentRef={parentRef}
              providerInstanceId={item.providerInstanceId}
              origin={item.origin}
              driver={item.driver}
              title={title}
              threadId={threadId}
              elapsed={props.live ? <LiveSubagentElapsed agent={props.live} /> : null}
              model={props.live?.model ?? null}
              modelSelection={props.live?.modelSelection}
              status={status}
              result={props.result}
              progress={props.progress}
            />
          </ThreadHoverCardPopup>
        </Tooltip>
        <span
          className={cn(
            "min-w-0 truncate",
            state === "running"
              ? "text-foreground"
              : state === "failed"
                ? "text-status-failed"
                : "text-muted-foreground",
          )}
        >
          {remote !== undefined ? (
            <>
              on {remote.label}
              {detail ? <> &middot; </> : null}
            </>
          ) : null}
          {detail}
        </span>
        <span className={cn("shrink-0", STATE_TEXT[state])}>{word}</span>
        <span className="text-right text-muted-foreground tabular-nums">
          <SubagentElapsed agent={timing} />
        </span>
      </div>
      {props.open && expandable ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-border/60 bg-background py-1 ps-12 pe-2 text-muted-foreground">
          {progress !== null &&
          (state === "running" || state === "idle" || result === null || state === "failed") ? (
            <>
              <dt className={state === "running" ? "text-status-working" : "text-foreground"}>
                {state === "running" ? "Now" : "Last step"}
              </dt>
              <dd className="break-words whitespace-pre-wrap">{progress}</dd>
            </>
          ) : null}
          {result !== null ? (
            <>
              <dt className={state === "failed" ? "text-status-failed" : "text-foreground"}>
                {state === "failed" ? "Error" : "Result"}
              </dt>
              <dd
                className={cn(
                  "break-words whitespace-pre-wrap",
                  state === "failed" ? "text-status-failed" : "text-foreground",
                )}
              >
                {result}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

/** Rendered only inside the open hover card, so closed rows skip the runtime conversion. */
function LiveSubagentElapsed({ agent }: { agent: OrchestrationV2Subagent }) {
  return <AgentElapsed agent={projectedSubagentsToRuntime([agent])[0]!} />;
}

/** Static shape plus color; never animated. */
function SubagentStateGlyph({ state }: { state: SubagentRowState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4.25 items-center justify-center text-2xs leading-none font-bold",
        state === "running" && "bg-status-working text-background",
        state === "failed" && "bg-status-failed text-background",
        (state === "done" || state === "stopped") &&
          "border border-muted-foreground/50 text-muted-foreground",
        state === "idle" && "border border-muted-foreground/30",
      )}
    >
      {state === "running" ? (
        <span className="ms-px size-0 border-y-4 border-l-6 border-y-transparent border-l-current" />
      ) : state === "done" ? (
        "✓"
      ) : state === "failed" ? (
        "×"
      ) : state === "idle" ? null : (
        <span className="size-1.75 bg-current" />
      )}
    </span>
  );
}
