import type { EnvironmentId, EnvironmentMachineKind } from "@t3tools/contracts";
import type { ConnectionStatusDotState } from "../connection/ConnectionStatusDot";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import * as DateTime from "effect/DateTime";

import type { AppSymbolName } from "../../components/ui/AppSymbol";
import { PullRequestGlyph } from "../pull-requests/pullRequestGlyphs";
import { resolveThreadListV2Status, threadHasUnseenCompletion } from "../threads/threadListV2";

export type OverviewState = "needs" | "working" | "failed" | "done" | "idle";

export interface OverviewThread {
  readonly thread: EnvironmentThreadShell;
  readonly key: string;
  readonly project: EnvironmentProject | null;
  readonly projectTitle: string;
  readonly state: OverviewState;
  readonly status: ReturnType<typeof resolveThreadListV2Status>;
  readonly unread: boolean;
  readonly settled: boolean;
  readonly snoozed: boolean;
  /** The one line that says why this thread matters right now. */
  readonly reason: string;
  /** A softer second line: the agent's step or latest message. */
  readonly detail: string | null;
  readonly at: string;
}

export interface StateTone {
  readonly label: string;
  readonly icon: AppSymbolName;
  readonly text: string;
  readonly tint: string;
  readonly fill: string;
  readonly wash: string;
}

export const STATE_TONES: Record<OverviewState | "approval" | "input", StateTone> = {
  approval: {
    label: "Needs approval",
    icon: "exclamationmark.shield",
    text: "text-warning-foreground",
    tint: "accent-warning-foreground",
    fill: "bg-adaptive-amber-700-400",
    wash: "bg-adaptive-amber-500-a12-a16",
  },
  input: {
    label: "Question",
    icon: "questionmark.bubble",
    text: "text-adaptive-indigo-600-300",
    tint: "accent-adaptive-indigo-600-300",
    fill: "bg-adaptive-indigo-600-300",
    wash: "bg-adaptive-indigo-500-a12-a16",
  },
  needs: {
    label: "Needs you",
    icon: "bell.badge",
    text: "text-warning-foreground",
    tint: "accent-warning-foreground",
    fill: "bg-adaptive-amber-700-400",
    wash: "bg-adaptive-amber-500-a12-a16",
  },
  working: {
    label: "Working",
    icon: "circle.dashed",
    text: "text-adaptive-sky-600-400",
    tint: "accent-adaptive-sky-600-400",
    fill: "bg-adaptive-sky-600-400",
    wash: "bg-adaptive-sky-500-a12-a16",
  },
  failed: {
    label: "Failed",
    icon: "exclamationmark.circle",
    text: "text-danger-foreground",
    tint: "accent-danger-foreground",
    fill: "bg-adaptive-rose-600-400",
    wash: "bg-adaptive-rose-500-a12-a16",
  },
  done: {
    label: "Done",
    icon: "checkmark.circle",
    text: "text-adaptive-emerald-700-300",
    tint: "accent-adaptive-emerald-700-300",
    fill: "bg-adaptive-emerald-600-400",
    wash: "bg-adaptive-emerald-500-a12-a16",
  },
  idle: {
    label: "Quiet",
    icon: "circle.dashed.inset.filled",
    text: "text-foreground-muted",
    tint: "accent-foreground-muted",
    fill: "bg-subtle-strong",
    wash: "bg-subtle",
  },
};

export function toneFor(item: Pick<OverviewThread, "state" | "status">): StateTone {
  if (item.status === "approval") return STATE_TONES.approval;
  if (item.status === "input") return STATE_TONES.input;
  return STATE_TONES[item.state];
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function oneLine(text: string | null | undefined, max = 140): string | null {
  if (!text) return null;
  const line = text
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (line.length === 0) return null;
  return line.length > max ? `${line.slice(0, max - 1)}...` : line;
}

function isoOf(value: DateTime.Utc | null | undefined): string | null {
  return value ? DateTime.formatIso(value) : null;
}

export function threadKey(thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) {
  return `${thread.environmentId}:${thread.id}`;
}

function describe(
  thread: EnvironmentThreadShell,
  status: OverviewThread["status"],
  unread: boolean,
): { reason: string; detail: string | null } {
  const activity = thread.source.activity ?? null;
  const step = activity?.step ?? null;
  const files = activity?.files?.changed ?? 0;
  const message = thread.source.latestVisibleMessage;
  const lastMessage = message && message.role !== "user" ? oneLine(message.text) : null;
  switch (status) {
    case "approval": {
      const kind = thread.source.pendingRuntimeRequest?.kind;
      const reason =
        kind === "command"
          ? "Wants to run a command"
          : kind === "file-change"
            ? files > 0
              ? `Wants to edit ${plural(files, "file")}`
              : "Wants to edit files"
            : kind === "file-read"
              ? "Wants to read files"
              : thread.pendingSubagentRequest === "approval"
                ? "A subagent wants approval"
                : "Wants your approval";
      return { reason, detail: oneLine(step?.text) ?? lastMessage };
    }
    case "input":
      return {
        reason:
          thread.pendingSubagentRequest === "user_input"
            ? "A subagent asked a question"
            : "Asked a question",
        detail: step?.kind === "question" ? oneLine(step.text) : lastMessage,
      };
    case "failed":
      return {
        reason: `Failed${thread.runtime?.lastError ? `: ${oneLine(thread.runtime.lastError, 60)}` : ""}`,
        detail: lastMessage,
      };
    case "limited":
      return { reason: "Hit a usage limit", detail: oneLine(thread.runtime?.lastError) };
    case "working":
    case "waiting": {
      const stepText = oneLine(step?.text, 80);
      const subagents = activity?.subagents.filter((agent) => agent.status === "running").length;
      return {
        reason:
          status === "waiting"
            ? "Waiting on background work"
            : stepText
              ? stepText
              : subagents
                ? `Running ${plural(subagents, "subagent")}`
                : "Working",
        detail: files > 0 ? `${plural(files, "file")} changed so far` : null,
      };
    }
    case "ready":
      return {
        reason: unread
          ? files > 0
            ? `Finished, ${plural(files, "file")} changed`
            : "Finished, ready for review"
          : files > 0
            ? `Done, ${plural(files, "file")} changed`
            : "Done",
        detail: lastMessage,
      };
  }
}

export function buildOverviewThreads(input: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly now: string;
}): OverviewThread[] {
  const projectByKey = new Map(
    input.projects.map((project) => [`${project.environmentId}:${project.id}`, project] as const),
  );
  return input.threads
    .filter(
      (thread) =>
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        thread.lineage.relationshipToParent !== "subagent",
    )
    .map((thread): OverviewThread => {
      const status = resolveThreadListV2Status(thread);
      const state: OverviewState =
        status === "approval" || status === "input"
          ? "needs"
          : status === "working" || status === "waiting"
            ? "working"
            : status === "failed" || status === "limited"
              ? "failed"
              : thread.latestRun
                ? "done"
                : "idle";
      const unread = threadHasUnseenCompletion(thread);
      const project = projectByKey.get(`${thread.environmentId}:${thread.projectId}`) ?? null;
      const { reason, detail } = describe(thread, status, unread);
      const at =
        state === "needs"
          ? (isoOf(thread.source.pendingRuntimeRequest?.createdAt) ?? thread.updatedAt)
          : state === "working"
            ? (thread.latestRun?.startedAt ?? thread.latestRun?.requestedAt ?? thread.updatedAt)
            : (thread.latestRun?.completedAt ?? thread.updatedAt);
      return {
        thread,
        key: threadKey(thread),
        project,
        projectTitle: project?.title ?? "Unknown project",
        state,
        status,
        unread,
        settled: thread.settledOverride === "settled",
        snoozed: effectiveSnoozed(thread, { now: input.now }),
        reason,
        detail,
        at,
      };
    });
}

const byRecent = (a: { readonly at: string }, b: { readonly at: string }) =>
  Date.parse(b.at) - Date.parse(a.at);

export function buildInbox(items: ReadonlyArray<OverviewThread>) {
  const open = items.filter((item) => !item.snoozed);
  const needs = open.filter((item) => item.state === "needs" && !item.settled).sort(byRecent);
  const failed = open.filter((item) => item.state === "failed" && !item.settled).sort(byRecent);
  const review = open
    .filter((item) => item.state === "done" && item.unread && !item.settled)
    .sort(byRecent);
  return {
    sections: [
      { key: "needs", title: "Needs you", items: needs },
      { key: "failed", title: "Failed", items: failed },
      { key: "review", title: "Ready for review", items: review },
    ].filter((section) => section.items.length > 0),
    total: needs.length + failed.length + review.length,
    working: items.filter((item) => item.state === "working").length,
    snoozed: items.filter((item) => item.snoozed).length,
  };
}

export function isToday(iso: string, now: string) {
  const date = new Date(iso);
  const today = new Date(now);
  return date.toDateString() === today.toDateString();
}

export type PulseFilter = "needs" | "working" | "doneToday" | "failed";

export function matchesPulseFilter(item: OverviewThread, filter: PulseFilter, now: string) {
  switch (filter) {
    case "needs":
      return item.state === "needs";
    case "working":
      return item.state === "working";
    case "failed":
      return item.state === "failed" && !item.settled;
    case "doneToday":
      return item.state === "done" && isToday(item.at, now);
  }
}

const STATE_PRIORITY: Record<OverviewState, number> = {
  needs: 0,
  failed: 1,
  working: 2,
  done: 3,
  idle: 4,
};

export function sortByImportance(items: ReadonlyArray<OverviewThread>) {
  return [...items].sort(
    (a, b) =>
      STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state] ||
      Number(b.unread) - Number(a.unread) ||
      byRecent(a, b),
  );
}

export type FeedEventKind =
  | "approval"
  | "question"
  | "failed"
  | "finished"
  | "stopped"
  | "started"
  | "prOpened"
  | "prMerged";

export interface FeedEvent {
  readonly key: string;
  readonly kind: FeedEventKind;
  readonly item: OverviewThread;
  readonly at: string;
  readonly phrase: string;
  readonly unread: boolean;
}

export const FEED_TONES: Record<FeedEventKind, StateTone> = {
  approval: STATE_TONES.approval,
  question: STATE_TONES.input,
  failed: STATE_TONES.failed,
  finished: STATE_TONES.done,
  stopped: STATE_TONES.idle,
  started: STATE_TONES.working,
  prOpened: { ...STATE_TONES.done, icon: PullRequestGlyph.pullRequest },
  prMerged: {
    ...STATE_TONES.done,
    icon: PullRequestGlyph.merged,
    text: "text-adaptive-violet-600-400",
    tint: "accent-adaptive-violet-600-400",
    fill: "bg-adaptive-violet-600-400",
    wash: "bg-adaptive-violet-500-a12-a16",
  },
};

const FEED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Approximate events from the shell: one per run edge, pending request and PR link. */
export function buildFeed(items: ReadonlyArray<OverviewThread>, now: string): FeedEvent[] {
  const nowMs = Date.parse(now);
  const events: FeedEvent[] = [];
  for (const item of items) {
    const { thread } = item;
    const visitedMs =
      thread.lastVisitedAt == null ? Number.POSITIVE_INFINITY : Date.parse(thread.lastVisitedAt);
    const push = (kind: FeedEventKind, at: string | null | undefined, phrase: string) => {
      if (!at) return;
      const atMs = Date.parse(at);
      if (Number.isNaN(atMs) || nowMs - atMs > FEED_WINDOW_MS) return;
      events.push({
        key: `${item.key}:${kind}:${at}`,
        kind,
        item,
        at,
        phrase,
        unread: kind !== "started" && atMs > visitedMs,
      });
    };
    const run = thread.latestRun;
    if (run) {
      // A finished run already says it ran; only a live run gets its own start entry.
      if (!run.completedAt) push("started", run.startedAt ?? run.requestedAt, "started working");
      const files = thread.source.activity?.files?.changed ?? 0;
      if (run.status === "completed")
        push(
          "finished",
          run.completedAt,
          files > 0 ? `finished, ${plural(files, "file")} changed` : "finished",
        );
      else if (run.status === "failed") push("failed", run.completedAt, "failed");
      else if (run.status === "interrupted" || run.status === "cancelled")
        push("stopped", run.completedAt, "was stopped");
    }
    if (item.status === "approval") {
      push(
        "approval",
        isoOf(thread.source.pendingRuntimeRequest?.createdAt) ?? item.at,
        "asked for approval",
      );
    } else if (item.status === "input") {
      push(
        "question",
        isoOf(thread.source.pendingRuntimeRequest?.createdAt) ?? item.at,
        "asked a question",
      );
    }
    for (const pr of thread.pullRequests) {
      if (pr.source === "stack-dismissed") continue;
      push(
        "prOpened",
        pr.linkedAt,
        `${pr.source === "created" || pr.source === "agent" ? "opened" : "linked"} PR #${pr.number}`,
      );
      if (pr.snapshot?.mergedAt) push("prMerged", pr.snapshot.mergedAt, `merged PR #${pr.number}`);
    }
  }
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function dayLabel(iso: string, now: string) {
  const date = new Date(iso);
  const today = new Date(now);
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clockLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export interface PulseProject {
  readonly key: string;
  readonly item: OverviewThread;
  readonly items: ReadonlyArray<OverviewThread>;
  readonly counts: Record<OverviewState, number>;
  readonly headline: { readonly label: string; readonly title: string; readonly tone: StateTone };
  readonly lastAt: string;
}

export interface PulseMachine {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly connectionState: ConnectionStatusDotState;
  readonly machineKind: EnvironmentMachineKind | null;
  readonly projects: ReadonlyArray<PulseProject>;
  readonly quietProjects: ReadonlyArray<PulseProject>;
}

const PULSE_RECENT_MS = 3 * 24 * 60 * 60 * 1000;

function headlineFor(top: OverviewThread): PulseProject["headline"] {
  const tone = toneFor(top);
  const label =
    top.state === "needs"
      ? "Needs you"
      : top.state === "failed"
        ? "Failed"
        : top.state === "working"
          ? "Working"
          : top.unread
            ? "Ready"
            : top.state === "done"
              ? `Done ${relativeAgo(top.at)}`
              : "Quiet";
  return { label, title: top.thread.title, tone };
}

function relativeAgo(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function buildPulse(input: {
  readonly items: ReadonlyArray<OverviewThread>;
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
    readonly connectionState: ConnectionStatusDotState;
  }>;
  readonly machineByEnvironmentId: ReadonlyMap<EnvironmentId, EnvironmentMachineKind>;
  readonly now: string;
}): PulseMachine[] {
  const nowMs = Date.parse(input.now);
  const byEnvironment = new Map<EnvironmentId, Map<string, OverviewThread[]>>();
  for (const item of input.items) {
    const projects = byEnvironment.get(item.thread.environmentId) ?? new Map();
    byEnvironment.set(item.thread.environmentId, projects);
    const key = `${item.thread.environmentId}:${item.thread.projectId}`;
    const list = projects.get(key) ?? [];
    list.push(item);
    projects.set(key, list);
  }
  const known = new Set(input.environments.map((environment) => environment.environmentId));
  const environments = [
    ...input.environments,
    ...[...byEnvironment.keys()]
      .filter((id) => !known.has(id))
      .map((environmentId) => ({
        environmentId,
        label: "Unknown machine",
        connectionState: "offline" as const,
      })),
  ];
  return environments
    .map((environment): PulseMachine => {
      const projects = [...(byEnvironment.get(environment.environmentId) ?? new Map()).entries()]
        .map(([key, list]): PulseProject => {
          const items = sortByImportance(list);
          const counts: Record<OverviewState, number> = {
            needs: 0,
            working: 0,
            failed: 0,
            done: 0,
            idle: 0,
          };
          for (const item of items) counts[item.state] += 1;
          const top = items[0]!;
          const lastAt = [...items].sort(byRecent)[0]!.at;
          return { key, item: top, items, counts, headline: headlineFor(top), lastAt };
        })
        .sort(
          (a, b) =>
            STATE_PRIORITY[a.item.state] - STATE_PRIORITY[b.item.state] ||
            Date.parse(b.lastAt) - Date.parse(a.lastAt),
        );
      const isLive = (project: PulseProject) =>
        project.counts.needs + project.counts.working + project.counts.failed > 0 ||
        project.items.some((item) => item.unread) ||
        nowMs - Date.parse(project.lastAt) < PULSE_RECENT_MS;
      return {
        environmentId: environment.environmentId,
        label: environment.label,
        connectionState: environment.connectionState,
        machineKind: input.machineByEnvironmentId.get(environment.environmentId) ?? null,
        projects: projects.filter(isLive),
        quietProjects: projects.filter((project) => !isLive(project)),
      };
    })
    .sort(
      (a, b) =>
        Number(b.connectionState === "connected") - Number(a.connectionState === "connected") ||
        b.projects.length - a.projects.length,
    );
}
