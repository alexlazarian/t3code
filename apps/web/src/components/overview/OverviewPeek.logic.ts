import type { EnvironmentThreadShell, ThreadStructure } from "@t3tools/client-runtime/state/shell";
import {
  deriveLatestThreadRun,
  deriveThreadStructureRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import {
  derivePendingThreadRequests,
  type ThreadPendingUserInput,
} from "@t3tools/client-runtime/state/thread-requests";
import type { PlanId, RunId, RuntimeRequestId } from "@t3tools/contracts";
import {
  latestExecutedRun,
  latestRootProviderFailure,
} from "@t3tools/shared/orchestrationV2ThreadError";

import {
  deriveCanInterruptRunningThread,
  derivePendingApprovals,
  derivePendingUserInputs,
  findLatestProposedPlan,
  hasActionableProposedPlan,
} from "../../session-logic";

export type OverviewPeekAction =
  | {
      readonly kind: "approval";
      readonly requestId: RuntimeRequestId;
      readonly canRespond: boolean;
    }
  | {
      readonly kind: "input";
      readonly requestId: RuntimeRequestId;
      readonly questions: ThreadPendingUserInput["questions"];
      readonly canRespond: boolean;
      readonly dismissible: boolean;
    }
  | { readonly kind: "implement"; readonly planId: PlanId }
  | { readonly kind: "stop" }
  | { readonly kind: "resume"; readonly mode: "queue" | "continue"; readonly runId: RunId | null }
  | { readonly kind: "reply" };

export function hasHeldQueuedRuns(projection: ThreadStructure | null): boolean {
  return projection?.runs.some((run) => run.status === "queued" && run.queueHeld === true) === true;
}

// Mirrors ChatView's resumableRunId: an interrupted run, or one that hit a usage limit.
function resolveResumableRunId(projection: ThreadStructure): RunId | null {
  const run = latestExecutedRun(projection.runs);
  if (run?.status === "interrupted") return run.id;
  return run?.status === "failed" &&
    deriveThreadStructureRuntime(projection)?.lastErrorClass === "usage_limit" &&
    latestRootProviderFailure(run, projection.turnItems)?.class === "usage_limit"
    ? run.id
    : null;
}

function resolvePrimaryAction(
  shell: EnvironmentThreadShell,
  projection: ThreadStructure | null,
): OverviewPeekAction | null {
  if (projection !== null) {
    const pending = derivePendingThreadRequests(projection);
    const approval = derivePendingApprovals(pending.approvals)[0];
    if (approval !== undefined) {
      return {
        kind: "approval",
        requestId: approval.requestId,
        canRespond: approval.responseCapability === "live",
      };
    }
    const input = derivePendingUserInputs(pending.userInputs)[0];
    if (input !== undefined) {
      return {
        kind: "input",
        requestId: input.requestId,
        questions: input.questions,
        canRespond: input.responseCapability !== "not_resumable",
        dismissible: input.dismissible,
      };
    }
    if (shell.hasActionableProposedPlan) {
      const plan = findLatestProposedPlan(
        projection,
        deriveLatestThreadRun(projection)?.runId ?? null,
      );
      if (plan !== null && hasActionableProposedPlan(plan)) {
        return { kind: "implement", planId: plan.id };
      }
    }
    const resumableRunId = resolveResumableRunId(projection);
    if (resumableRunId !== null) return { kind: "resume", mode: "continue", runId: resumableRunId };
    if (hasHeldQueuedRuns(projection)) return { kind: "resume", mode: "queue", runId: null };
  }
  const runtime = projection === null ? shell.runtime : deriveThreadStructureRuntime(projection);
  return deriveCanInterruptRunningThread(true, runtime) ? { kind: "stop" } : null;
}

export function resolveOverviewPeekActions(input: {
  readonly shell: EnvironmentThreadShell;
  readonly projection: ThreadStructure | null;
  readonly connected: boolean;
}): OverviewPeekAction[] {
  if (!input.connected) return [];
  const primary = resolvePrimaryAction(input.shell, input.projection);
  return primary === null ? [{ kind: "reply" }] : [primary, { kind: "reply" }];
}
