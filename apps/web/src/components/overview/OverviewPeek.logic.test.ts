import {
  MessageId,
  NodeId,
  PlanId,
  RunId,
  RuntimeRequestId,
  TurnItemId,
  type OrchestrationV2RunStatus,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadFixture, makeThreadProjectionFixture } from "../../test-fixtures";
import { canRespondToPeekRequest, resolveOverviewPeekActions } from "./OverviewPeek.logic";

const now = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");
const base = makeThreadProjectionFixture();
const runId = RunId.make("run-1");

function run(id: string, ordinal: number, status: OrchestrationV2RunStatus) {
  return {
    id: RunId.make(id),
    threadId: base.thread.id,
    ordinal,
    providerInstanceId: base.thread.providerInstanceId,
    modelSelection: base.thread.modelSelection,
    providerThreadId: null,
    userMessageId: MessageId.make(`message-${id}`),
    rootNodeId: null,
    activeAttemptId: null,
    status,
    requestedAt: now,
    startedAt: status === "queued" ? null : now,
    completedAt: status === "queued" ? null : now,
    checkpointId: null,
    contextHandoffId: null,
  };
}

function projection(
  overrides: Partial<OrchestrationV2ThreadProjection>,
): OrchestrationV2ThreadProjection {
  return { ...base, ...overrides };
}

describe("resolveOverviewPeekActions", () => {
  it("approval that is not live cannot be answered from peek", () => {
    const requestId = RuntimeRequestId.make("approval-1");
    const actions = resolveOverviewPeekActions({
      shell: makeThreadFixture({ hasPendingApprovals: true }),
      projection: projection({
        runs: [run("run-1", 1, "waiting")],
        runtimeRequests: [
          {
            id: requestId,
            nodeId: NodeId.make("node-1"),
            providerTurnId: null,
            nativeRequestRef: null,
            kind: "command",
            status: "pending",
            responseCapability: { type: "not_resumable", reason: "provider exited" },
            createdAt: now,
            resolvedAt: null,
          },
        ],
      }),
      connected: true,
    });
    expect(actions).toEqual([
      { kind: "approval", requestId, canRespond: false },
      { kind: "reply" },
    ]);
  });

  it("plan ready offers implement, then reply", () => {
    const planId = PlanId.make("plan-1");
    const actions = resolveOverviewPeekActions({
      shell: makeThreadFixture({ hasActionableProposedPlan: true, interactionMode: "plan" }),
      projection: projection({
        runs: [run("run-1", 1, "completed")],
        plans: [
          {
            id: planId,
            threadId: base.thread.id,
            runId,
            nodeId: NodeId.make("node-1"),
            kind: "proposed_plan",
            markdown: "# Plan\n\n- Do it",
            status: "active",
          },
        ],
      }),
      connected: true,
    });
    expect(actions).toEqual([{ kind: "implement", planId }, { kind: "reply" }]);
  });

  it("working thread offers stop, then reply", () => {
    const actions = resolveOverviewPeekActions({
      shell: makeThreadFixture({
        runtime: {
          status: "running",
          activeRunId: runId,
          providerInstanceId: base.thread.providerInstanceId,
          providerName: null,
          lastError: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      projection: null,
      connected: true,
    });
    expect(actions).toEqual([{ kind: "stop" }, { kind: "reply" }]);
  });

  it("held queue offers resume in queue mode", () => {
    const actions = resolveOverviewPeekActions({
      shell: makeThreadFixture(),
      projection: projection({
        runs: [run("run-1", 1, "completed"), { ...run("run-2", 2, "queued"), queueHeld: true }],
      }),
      connected: true,
    });
    expect(actions).toEqual([{ kind: "resume", mode: "queue", runId: null }, { kind: "reply" }]);
  });

  it("working with a held queue offers stop", () => {
    const actions = resolveOverviewPeekActions({
      shell: makeThreadFixture(),
      projection: projection({
        runs: [run("run-1", 1, "running"), { ...run("run-2", 2, "queued"), queueHeld: true }],
      }),
      connected: true,
    });
    expect(actions).toEqual([{ kind: "stop" }, { kind: "reply" }]);
  });

  it("a question that is not resumable cannot be answered from peek", () => {
    const requestId = RuntimeRequestId.make("question-1");
    const nodeId = NodeId.make("node-1");
    const actions = resolveOverviewPeekActions({
      shell: makeThreadFixture({ hasPendingUserInput: true }),
      projection: projection({
        runs: [run("run-1", 1, "waiting")],
        runtimeRequests: [
          {
            id: requestId,
            nodeId,
            providerTurnId: null,
            nativeRequestRef: null,
            kind: "user_input",
            status: "pending",
            responseCapability: { type: "not_resumable", reason: "provider exited" },
            createdAt: now,
            resolvedAt: null,
          },
        ],
        turnItems: [
          {
            id: TurnItemId.make("question-item"),
            threadId: base.thread.id,
            runId,
            nodeId,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 0,
            status: "completed",
            title: null,
            startedAt: now,
            completedAt: now,
            updatedAt: now,
            type: "user_input_request",
            requestId,
            questions: [
              {
                id: "next",
                header: "Next",
                question: "What next?",
                required: true,
                options: [{ label: "Continue", description: "Keep going" }],
              },
            ],
          },
        ],
      }),
      connected: true,
    });
    expect(actions[0]).toMatchObject({ kind: "input", requestId, canRespond: false });
    expect(canRespondToPeekRequest(actions, requestId)).toBe(false);
  });

  it("disconnected environment offers no actions", () => {
    const actions = resolveOverviewPeekActions({
      shell: makeThreadFixture({ hasActionableProposedPlan: true }),
      projection: projection({ runs: [run("run-1", 1, "interrupted")] }),
      connected: false,
    });
    expect(actions).toEqual([]);
  });
});
