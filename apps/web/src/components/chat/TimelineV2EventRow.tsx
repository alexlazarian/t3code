import { use } from "react";
import { V2LifecycleRow } from "./V2LifecycleRow";
import { LinkRequestCard } from "./LinkRequestCard";
import { ThreadSuggestionCard } from "./ThreadSuggestionCard";
import { SecretRequestCard } from "./SecretRequestCard";
import { SubagentBlock } from "./SubagentBlock";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";

export function V2EventTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "event" }> }) {
  const ctx = use(TimelineRowCtx);
  const { item, visibility } = row.projectedItem;
  if (item.type === "subagent") {
    return <SubagentBlock key={row.id} row={row} />;
  }
  if (item.type === "thread_suggestion") {
    return (
      <ThreadSuggestionCard
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        onOpenThread={ctx.onOpenThread}
      />
    );
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
  if (item.type === "link_request") {
    return (
      <LinkRequestCard
        environmentId={ctx.activeThreadEnvironmentId}
        item={item}
        visibility={visibility}
      />
    );
  }
  return (
    <V2LifecycleRow
      environmentId={ctx.activeThreadEnvironmentId}
      item={item}
      resourceSummary={row.resourceSummary}
      runs={ctx.runs}
      onOpenThread={ctx.onOpenThread}
    />
  );
}
