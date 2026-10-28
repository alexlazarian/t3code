import { use } from "react";
import ChatMarkdown from "../ChatMarkdown";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { V2ItemInspector } from "./V2ItemInspector";
import { isV2LifecycleItem, V2LifecycleRow } from "./V2LifecycleRow";
import { SubagentBlock } from "./SubagentBlock";
import { SecretRequestCard } from "./SecretRequestCard";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";
import { v2EventPresentation } from "./TimelineV2EventRow.logic";

export function V2EventTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "event" }> }) {
  const ctx = use(TimelineRowCtx);
  const { item, visibility, sourceThreadId } = row.projectedItem;
  if (item.type === "subagent") {
    return <SubagentBlock key={row.id} row={row} />;
  }
  if (item.type === "secret_request") {
    return (
      <SecretRequestCard
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        visibility={visibility}
      />
    );
  }
  if (isV2LifecycleItem(item)) {
    return (
      <V2LifecycleRow
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        resourceSummary={row.resourceSummary}
        createdAt={row.createdAt}
        timestampFormat={ctx.timestampFormat}
        runs={ctx.runs}
        onOpenThread={ctx.onOpenThread}
      />
    );
  }
  const presentation = v2EventPresentation(item);
  const Icon = presentation.icon;
  if (item.type === "error") {
    return (
      <details
        className={cn(
          "group rounded-md border",
          presentation.tone === "warning" && "border-warning/25 bg-warning/5",
          presentation.tone === "danger" && "border-destructive/25 bg-destructive/5",
          presentation.tone === "success" && "border-success/20 bg-success/5",
        )}
        data-v2-item-type={item.type}
        data-v2-item-visibility={visibility}
        data-v2-event-disclosure="true"
      >
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              presentation.tone === "warning" && "text-warning",
              presentation.tone === "danger" && "text-destructive",
              presentation.tone === "success" && "text-success",
            )}
          />
          <span className="shrink-0 font-medium text-foreground/90">{presentation.label}</span>
          {item.status !== "completed" ? (
            <span
              className={cn(
                "shrink-0 rounded-none border px-1.5 py-0.5 font-mono text-3xs",
                item.status === "failed"
                  ? "border-destructive/40 text-destructive"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              {item.status}
            </span>
          ) : null}
          {presentation.detail ? (
            <span className="min-w-0 flex-1 truncate text-muted-foreground/65">
              {presentation.detail}
            </span>
          ) : null}
          {visibility !== "local" ? (
            <span className="shrink-0 rounded-none bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
              {visibility === "inherited" ? "Inherited" : "Synthetic"}
            </span>
          ) : null}
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground/60 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/45 px-3 py-2 ps-8">
          {presentation.detail ? (
            <div className="text-xs leading-relaxed text-muted-foreground">
              <ChatMarkdown
                text={presentation.detail}
                cwd={ctx.markdownCwd}
                threadRef={ctx.threadRef ?? undefined}
                skills={ctx.skills}
                lineBreaks
              />
            </div>
          ) : null}
          {visibility === "inherited" ? (
            <p className="mt-1 font-mono text-3xs text-muted-foreground/65">
              From {sourceThreadId}
            </p>
          ) : null}
          <div className={presentation.detail ? "mt-2" : undefined}>
            <V2ItemInspector
              projectedItem={row.projectedItem}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.markdownCwd}
              workspaceRoot={ctx.workspaceRoot}
              onOpenThread={ctx.onOpenThread}
              onOpenTurnDiff={ctx.onOpenTurnDiff}
              onRollbackCheckpoint={ctx.onRollbackCheckpoint}
              onImageExpand={ctx.onImageExpand}
              source={ctx.turnItemSource}
            />
          </div>
        </div>
      </details>
    );
  }
  return (
    <section
      className={cn(
        "rounded-lg border px-3 py-2",
        presentation.tone === "warning" && "border-warning/25 bg-warning/5",
        presentation.tone === "danger" && "border-destructive/25 bg-destructive/5",
        presentation.tone === "success" && "border-success/20 bg-success/5",
        presentation.tone === "muted" && "border-border/60 bg-card/30",
      )}
      data-v2-item-type={item.type}
      data-v2-item-visibility={visibility}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            presentation.tone === "warning" && "text-warning",
            presentation.tone === "danger" && "text-destructive",
            presentation.tone === "success" && "text-success",
            presentation.tone === "muted" && "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-foreground/90">{presentation.label}</span>
            {item.status !== "completed" ? (
              <span
                className={cn(
                  "rounded-none border px-1.5 py-0.5 font-mono text-3xs",
                  item.status === "failed"
                    ? "border-destructive/40 text-destructive"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                {item.status}
              </span>
            ) : null}
            {visibility !== "local" ? (
              <span className="rounded-none bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                {visibility === "inherited" ? "Inherited" : "Synthetic"}
              </span>
            ) : null}
          </div>
          {presentation.detail ? (
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <ChatMarkdown
                text={presentation.detail}
                cwd={ctx.markdownCwd}
                threadRef={ctx.threadRef ?? undefined}
                skills={ctx.skills}
                lineBreaks
              />
            </div>
          ) : null}
          {visibility === "inherited" ? (
            <p className="mt-1 font-mono text-3xs text-muted-foreground/65">
              From {sourceThreadId}
            </p>
          ) : null}
          <div className="mt-2">
            <V2ItemInspector
              projectedItem={row.projectedItem}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.markdownCwd}
              workspaceRoot={ctx.workspaceRoot}
              onOpenThread={ctx.onOpenThread}
              onOpenTurnDiff={ctx.onOpenTurnDiff}
              onRollbackCheckpoint={ctx.onRollbackCheckpoint}
              onImageExpand={ctx.onImageExpand}
              source={ctx.turnItemSource}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
