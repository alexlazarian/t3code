import { useAtomValue } from "@effect/atom-react";
import {
  CommandId,
  type EnvironmentId,
  type OrchestrationV2TurnItem,
  type ThreadId,
} from "@t3tools/contracts";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { useRef, useState } from "react";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useAtomCommand } from "../../state/use-atom-command";
import { randomUUID } from "../../lib/utils";
import { Button } from "../ui/button";

type Suggestion = Extract<OrchestrationV2TurnItem, { type: "thread_suggestion" }>;

export function ThreadSuggestionCard(props: {
  readonly environmentId: EnvironmentId;
  readonly item: Suggestion;
  readonly onOpenThread: (threadId: ThreadId) => void;
}) {
  const { item, environmentId } = props;
  const resolve = useAtomCommand(orchestrationEnvironment.v2.dispatchCommand, {
    label: "resolve thread suggestion",
  });
  const canResolve = useAtomValue(
    orchestrationEnvironment.v2.dispatchCommand.permissionAtom(environmentId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const send = async (action: "drafts" | "start" | "dismiss") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await resolve({
        environmentId,
        input: {
          type: "thread.suggestions.resolve",
          commandId: CommandId.make(randomUUID()),
          threadId: item.threadId,
          turnItemId: item.id,
          action,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        setError("Could not resolve this suggestion. Try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      data-v2-item-type={item.type}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-card p-4"
      aria-label="Suggested threads"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">Suggested threads</h3>
        <p className="text-sm text-muted-foreground">{item.reason}</p>
      </div>
      {item.threads.map((thread) => (
        <div key={thread.threadId} className="min-w-0 space-y-1">
          {item.suggestionStatus === "accepted" ? (
            <Button variant="link" onClick={() => props.onOpenThread(thread.threadId)}>
              {thread.title}
            </Button>
          ) : (
            <h4 className="text-sm font-medium text-foreground">{thread.title}</h4>
          )}
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {thread.prompt}
          </p>
          {thread.skill ? (
            <p className="text-xs text-muted-foreground">Skill: {thread.skill}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">Model: {thread.modelSelection.model}</p>
        </div>
      ))}
      {item.suggestionStatus === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !canResolve} onClick={() => void send("drafts")}>
            Create drafts
          </Button>
          <Button
            variant="outline"
            disabled={busy || !canResolve}
            onClick={() => void send("start")}
          >
            Create and start
          </Button>
          <Button
            variant="ghost-muted"
            disabled={busy || !canResolve}
            onClick={() => void send("dismiss")}
          >
            Dismiss
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {item.suggestionStatus === "dismissed"
            ? "Dismissed"
            : item.resolution === "drafts"
              ? "Drafts created. Open a thread to review and send its prompt."
              : "Threads started"}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
