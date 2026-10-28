import {
  RunId,
  ThreadId,
  type OrchestrationV2ShellActivity,
  type OrchestrationV2ShellStep,
  type OrchestrationV2ShellSubagent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Turn item types a card can show as the lead's step. */
export const SHELL_STEP_ITEM_TYPES = [
  "command_execution",
  "file_change",
  "file_search",
  "web_search",
  "dynamic_tool",
  "approval_request",
  "user_input_request",
  "assistant_message",
  "subagent",
] as const;

/** The step types that count toward "N steps": the lead acting, not talking or asking. */
export const SHELL_COUNTED_STEP_ITEM_TYPES = [
  "command_execution",
  "file_change",
  "file_search",
  "web_search",
  "dynamic_tool",
  "subagent",
] as const;

const STEP_KINDS: Record<string, OrchestrationV2ShellStep["kind"]> = {
  command_execution: "command",
  file_change: "file_change",
  file_search: "file_search",
  web_search: "web_search",
  dynamic_tool: "tool",
  approval_request: "approval",
  user_input_request: "question",
  assistant_message: "reply",
  subagent: "subagent",
};

const MAX_SHELL_SUBAGENTS = 12;
const MAX_LINE_LENGTH = 240;

export type ShellActivityStepRow = {
  readonly run_id: string;
  readonly step_count: number;
  readonly type: string;
  readonly status: string;
  readonly text: string | null;
};

export type ShellActivitySubagentRow = {
  readonly run_id: string;
  readonly child_thread_id: string | null;
  readonly title: string | null;
  readonly status: string;
  readonly progress: string | null;
  readonly result: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
};

/** `source` is "checkpoint" for a captured diff and "items" for the provider's own file changes. */
export type ShellActivityFilesRow = {
  readonly run_id: string;
  readonly source: "checkpoint" | "items";
  readonly changed: number;
  readonly additions: number | null;
  readonly deletions: number | null;
};

/** The first non-blank line, cut to a length a single card row can hold. */
function shellActivityLine(text: string | null): string | null {
  if (text === null) return null;
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (line === undefined) return null;
  return line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH - 1)}…` : line;
}

/** A reply or result line without markdown markers, which a card shows as plain text. */
function shellActivityProse(text: string | null): string | null {
  const line = shellActivityLine(text);
  if (line === null) return null;
  const plain = line
    .replace(/^(?:#{1,6}|>|[-*+]|\d+[.)])\s+/u, "")
    .replace(/\*\*|__|`/gu, "")
    .trim();
  return plain.length > 0 ? plain : null;
}

const subagentStatuses = new Set<string>([
  "idle",
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const isSubagentStatus = (status: string): status is OrchestrationV2ShellSubagent["status"] =>
  subagentStatuses.has(status);
const isStepStatus = (status: string): status is OrchestrationV2ShellStep["status"] =>
  subagentStatuses.has(status);

const dateOrNull = (value: string | null) => (value === null ? null : DateTime.makeUnsafe(value));

function subagentFromRow(row: ShellActivitySubagentRow): OrchestrationV2ShellSubagent {
  const status = isSubagentStatus(row.status) ? row.status : "running";
  // Progress goes stale once a subagent ends, so an ended one shows only its result.
  const live = status === "pending" || status === "running" || status === "waiting";
  return {
    threadId: row.child_thread_id === null ? null : ThreadId.make(row.child_thread_id),
    title: shellActivityProse(row.title) ?? "Subagent",
    status,
    step: live ? shellActivityLine(row.progress) : shellActivityProse(row.result),
    startedAt: dateOrNull(row.started_at),
    completedAt: dateOrNull(row.completed_at),
  };
}

/**
 * Groups the activity rows of the presented runs by run. A run's checkpoint wins over the
 * provider's own file changes, because the checkpoint is the diff on disk.
 */
export function shellActivityByRunId(input: {
  readonly steps: ReadonlyArray<ShellActivityStepRow>;
  readonly subagents: ReadonlyArray<ShellActivitySubagentRow>;
  readonly files: ReadonlyArray<ShellActivityFilesRow>;
}): ReadonlyMap<RunId, OrchestrationV2ShellActivity> {
  const runIds = new Set([
    ...input.steps.map((row) => row.run_id),
    ...input.subagents.map((row) => row.run_id),
    ...input.files.map((row) => row.run_id),
  ]);
  const result = new Map<RunId, OrchestrationV2ShellActivity>();
  for (const runId of runIds) {
    const stepRow = input.steps.find((row) => row.run_id === runId);
    const subagentRows = input.subagents.filter((row) => row.run_id === runId);
    const filesRow =
      input.files.find((row) => row.run_id === runId && row.source === "checkpoint") ??
      input.files.find((row) => row.run_id === runId && row.source === "items");
    const stepText =
      stepRow === undefined
        ? null
        : stepRow.type === "assistant_message" || stepRow.type === "subagent"
          ? shellActivityProse(stepRow.text)
          : shellActivityLine(stepRow.text);
    const kind = stepRow === undefined ? undefined : STEP_KINDS[stepRow.type];
    result.set(RunId.make(runId), {
      step:
        stepRow !== undefined &&
        kind !== undefined &&
        isStepStatus(stepRow.status) &&
        (stepText !== null || kind === "subagent")
          ? { kind, text: stepText ?? "", status: stepRow.status }
          : null,
      stepCount: stepRow?.step_count ?? 0,
      ...(filesRow === undefined || (filesRow.source === "items" && filesRow.changed === 0)
        ? {}
        : {
            files: {
              changed: filesRow.changed,
              ...(filesRow.additions === null ? {} : { additions: filesRow.additions }),
              ...(filesRow.deletions === null ? {} : { deletions: filesRow.deletions }),
            },
          }),
      subagents: subagentRows.slice(-MAX_SHELL_SUBAGENTS).map(subagentFromRow),
      subagentCount: subagentRows.length,
    });
  }
  return result;
}
