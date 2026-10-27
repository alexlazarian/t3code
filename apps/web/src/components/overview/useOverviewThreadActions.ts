import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type {
  PlanId,
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
  RunId,
  RuntimeRequestId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useRef, useState } from "react";

import { newMessageId } from "~/lib/utils";
import { buildPlanImplementationPrompt } from "../../proposedPlan";
import { useQuietThreadProjection, useQuietThreadShell } from "../../state/entities";
import { useEnvironment } from "../../state/environments";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { toastManager } from "../ui/toast";
import {
  canRespondToPeekRequest,
  hasHeldQueuedRuns,
  resolveOverviewPeekActions,
} from "./OverviewPeek.logic";

const CONTINUE_TEXT = "Continue where you left off.";

/** Mounts the thread's live projection, so only call it from an open peek. */
export function useOverviewThreadActions(ref: ScopedThreadRef) {
  const { environmentId, threadId } = ref;
  const shell = useQuietThreadShell(ref);
  const projection = useQuietThreadProjection(ref)?.projection ?? null;
  const connected = useEnvironment(environmentId)?.connection.phase === "connected";
  const actions =
    shell === null ? [] : resolveOverviewPeekActions({ shell, projection, connected });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const options = { reportFailure: false };
  const respondToApproval = useOrchestrationCommand(threadEnvironment.respondToApproval, options);
  const respondToUserInput = useOrchestrationCommand(threadEnvironment.respondToUserInput, options);
  const dismissUserInput = useOrchestrationCommand(threadEnvironment.dismissUserInput, options);
  const interruptTurn = useOrchestrationCommand(threadEnvironment.interruptTurn, options);
  const resumeThreadQueue = useOrchestrationCommand(threadEnvironment.resumeThreadQueue, options);
  const setInteractionMode = useOrchestrationCommand(threadEnvironment.setInteractionMode, options);
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, options);

  const run = async (
    fallbackMessage: string,
    execute: () => Promise<AtomCommandResult<unknown, unknown>>,
  ): Promise<boolean> => {
    const result = await execute();
    if (result._tag === "Success") return true;
    if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: fallbackMessage,
        description: error instanceof Error ? error.message : undefined,
      });
    }
    return false;
  };
  const exclusive = async (operation: () => Promise<boolean>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      return await operation();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const sendMessage = (
    text: string,
    extra: Partial<Parameters<typeof startTurn>[0]["input"]> = {},
  ) => {
    if (shell === null) return Promise.resolve(false);
    return run("Could not send the message.", () =>
      startTurn({
        environmentId,
        input: {
          threadId,
          message: { messageId: newMessageId(), role: "user", text, attachments: [] },
          modelSelection: shell.modelSelection,
          runtimeMode: shell.runtimeMode,
          interactionMode: shell.interactionMode,
          ...extra,
        },
      }),
    );
  };

  return {
    shell,
    projection,
    actions,
    busy,
    respondToApproval: (requestId: RuntimeRequestId, decision: ProviderApprovalDecision) =>
      exclusive(async () =>
        canRespondToPeekRequest(actions, requestId)
          ? run("Could not submit the approval decision.", () =>
              respondToApproval({ environmentId, input: { threadId, requestId, decision } }),
            )
          : false,
      ),
    answer: (requestId: RuntimeRequestId, answers: ProviderUserInputAnswers) =>
      exclusive(async () =>
        canRespondToPeekRequest(actions, requestId)
          ? run("Could not submit the answer.", () =>
              respondToUserInput({ environmentId, input: { threadId, requestId, answers } }),
            )
          : false,
      ),
    dismiss: (requestId: RuntimeRequestId) =>
      exclusive(() =>
        run("Could not dismiss the question.", () =>
          dismissUserInput({ environmentId, input: { threadId, requestId } }),
        ),
      ),
    stop: () =>
      exclusive(() =>
        run("Could not stop the thread.", () =>
          interruptTurn({ environmentId, input: { threadId } }),
        ),
      ),
    implement: (planId: PlanId) =>
      exclusive(async () => {
        const plan = projection?.plans.find((candidate) => candidate.id === planId);
        if (shell === null || plan?.kind !== "proposed_plan") return false;
        if (shell.interactionMode !== "default") {
          const switched = await run("Could not switch the thread out of plan mode.", () =>
            setInteractionMode({ environmentId, input: { threadId, interactionMode: "default" } }),
          );
          if (!switched) return false;
        }
        return sendMessage(buildPlanImplementationPrompt(plan.markdown), {
          interactionMode: "default",
          sourceProposedPlan: { threadId, planId },
        });
      }),
    resume: (mode: "queue" | "continue", runId: RunId | null) =>
      exclusive(async () => {
        if (mode === "queue" || runId === null) {
          return run("Could not resume the thread.", () =>
            resumeThreadQueue({ environmentId, input: { threadId } }),
          );
        }
        const continued = await sendMessage(CONTINUE_TEXT, {
          manualContinuationOfRunId: runId,
          dispatchMode: "start",
        });
        if (!continued || !hasHeldQueuedRuns(projection)) return continued;
        return run("Could not release the queued messages.", () =>
          resumeThreadQueue({ environmentId, input: { threadId } }),
        );
      }),
    reply: (text: string) => exclusive(() => sendMessage(text, { dispatchMode: "auto" })),
  };
}
