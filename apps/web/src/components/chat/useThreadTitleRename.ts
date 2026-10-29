import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { useStableCallback } from "../../hooks/useStableCallback";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { toastManager } from "../ui/toast";

function resolveRenameCommit(input: {
  readonly title: string;
  readonly originalTitle: string;
}): { action: "commit"; title: string } | { action: "reject-empty" } | { action: "noop" } {
  const trimmed = input.title.trim();
  if (trimmed.length === 0) return { action: "reject-empty" };
  if (trimmed === input.originalTitle) return { action: "noop" };
  return { action: "commit", title: trimmed };
}

export interface ThreadTitleRename {
  readonly renamingTitle: string | null;
  readonly setRenamingTitle: (value: string) => void;
  readonly startRename: () => void;
  readonly commitRename: () => void;
  readonly cancelRename: () => void;
}

export function useThreadTitleRename(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly title: string;
  readonly isServerThread: boolean;
}): ThreadTitleRename {
  const { threadRef, title, isServerThread } = input;
  const canOperateThread = useEnvironmentScope(
    threadRef?.environmentId ?? null,
    AuthOrchestrationOperateScope,
  );
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const [renaming, setRenaming] = useState<{
    readonly threadRef: ScopedThreadRef;
    readonly title: string;
  } | null>(null);
  const isCurrent =
    renaming !== null &&
    threadRef !== null &&
    renaming.threadRef.threadId === threadRef.threadId &&
    renaming.threadRef.environmentId === threadRef.environmentId;
  if (renaming !== null && (!isCurrent || !canOperateThread)) setRenaming(null);
  const renamingTitle = isCurrent && canOperateThread ? renaming.title : null;
  // Enter and Escape end the edit before the input's blur, which must not commit again.
  const finishedRef = useRef(false);

  const startRename = useStableCallback(() => {
    if (
      threadRef === null ||
      !isServerThread ||
      !readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)
    )
      return;
    finishedRef.current = false;
    setRenaming({ threadRef, title });
  });
  const setRenamingTitle = useStableCallback((value: string) => {
    setRenaming((current) => (current === null ? null : { ...current, title: value }));
  });
  const cancelRename = useStableCallback(() => {
    finishedRef.current = true;
    setRenaming(null);
  });
  const commitRename = useStableCallback(() => {
    if (finishedRef.current || renamingTitle === null || threadRef === null) return;
    finishedRef.current = true;
    setRenaming(null);
    if (!readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)) return;
    const resolution = resolveRenameCommit({ title: renamingTitle, originalTitle: title });
    if (resolution.action === "reject-empty") {
      toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
      return;
    }
    if (resolution.action === "noop") return;
    void updateThreadMetadata({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, title: resolution.title },
    }).then((result) => {
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Failed to rename thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    });
  });

  return { renamingTitle, setRenamingTitle, startRename, commitRename, cancelRename };
}
