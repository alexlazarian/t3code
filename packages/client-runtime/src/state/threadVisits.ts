// @effect-diagnostics globalTimers:off globalDate:off - The tracker runs in atom subscriptions, outside an Effect runtime.
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { parseThreadKey, threadKey } from "./entities.ts";
import { threadRuntimeIsActive, type ThreadRuntimeSummary } from "./models.ts";
import { type AtomCommand, runAtomCommand } from "./runtime.ts";
import { claimThreadOpen } from "./threadSearch.ts";
import type { VisitThreadInput } from "../operations/commands.ts";

// During an active turn the thread's updatedAt advances several times per
// second, and every server-side visit is a full command dispatch plus a
// broadcast to all shell subscribers.
export const VISIT_DISPATCH_THROTTLE_MS = 10_000;

export interface ThreadReadStateInput {
  readonly updatedAt: string;
  readonly lastVisitedAt?: string | null | undefined;
  readonly latestRun: { readonly completedAt: string | null } | null;
  readonly runtime?: Pick<ThreadRuntimeSummary, "status"> | null | undefined;
  readonly hasPendingApprovals?: boolean | undefined;
  readonly hasPendingUserInput?: boolean | undefined;
  readonly pendingSubagentRequest?: string | null | undefined;
}

/**
 * When the agent last left something for the user: a pending request, or the
 * finished, failed or plan-ready run. Null while it works with nothing pending.
 * Requests carry no time of their own, so they use updatedAt; runs use
 * completedAt so a later rename does not make a read thread unread.
 */
export function threadOutcomeAt(thread: ThreadReadStateInput): string | null {
  // A subagent's request leaves the parent streaming, so updatedAt keeps moving and
  // would re-flag a read thread on every tick; only count it once the parent is idle or blocked.
  if (
    thread.hasPendingApprovals === true ||
    thread.hasPendingUserInput === true ||
    ((thread.pendingSubagentRequest ?? null) !== null && !threadIsStreaming(thread))
  ) {
    return thread.updatedAt;
  }
  if (threadRuntimeIsActive(thread.runtime)) return null;
  return thread.latestRun?.completedAt ?? null;
}

function threadIsStreaming(thread: ThreadReadStateInput): boolean {
  return thread.runtime?.status !== "waiting" && threadRuntimeIsActive(thread.runtime);
}

/** Never-opened threads (null watermark) with an outcome are unread too. */
export function isThreadUnread(thread: ThreadReadStateInput): boolean {
  const outcomeAt = threadOutcomeAt(thread);
  const outcomeAtMs = outcomeAt === null ? NaN : Date.parse(outcomeAt);
  if (Number.isNaN(outcomeAtMs)) return false;
  const lastVisitedAtMs = thread.lastVisitedAt ? Date.parse(thread.lastVisitedAt) : NaN;
  return Number.isNaN(lastVisitedAtMs) || outcomeAtMs > lastVisitedAtMs;
}

/** The watermark that makes `isThreadUnread` true again, or null when there is no outcome. */
export function threadUnreadWatermark(thread: ThreadReadStateInput): string | null {
  const outcomeAt = threadOutcomeAt(thread);
  const outcomeAtMs = outcomeAt === null ? NaN : Date.parse(outcomeAt);
  return Number.isNaN(outcomeAtMs) ? null : new Date(outcomeAtMs - 1).toISOString();
}

const IDLE_TRACKER: Atom.Atom<void> = Atom.make(undefined).pipe(
  Atom.withLabel("thread-visit-tracker:idle"),
);

interface VisitedShell extends ThreadReadStateInput {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  /**
   * When a scheduled wake the user is looking at took effect. A wake later
   * than `updatedAt` is an update the server never sent, so the watermark
   * advances to it, and at once: leaving within the throttle would cancel
   * the dispatch and keep the thread marked Woke.
   */
  readonly wokeAt?: string | null | undefined;
}

export interface ThreadVisitTrackerOptions {
  readonly threadShellAtom: (ref: ScopedThreadRef) => Atom.Atom<VisitedShell | null>;
  readonly visit: AtomCommand<
    { readonly environmentId: EnvironmentId; readonly input: VisitThreadInput },
    unknown,
    unknown
  >;
  /**
   * Servers without visit tracking leave `lastVisitedAt` undefined; a client
   * that keeps its own watermark for them records the visit here instead.
   */
  readonly markLocalVisit?: (ref: ScopedThreadRef, visitedAt: string) => void;
}

/**
 * While mounted, a tracker counts as the user viewing the thread: mounting it
 * records one open (which also feeds search ranking), and every shell update
 * after that advances the visit watermark, throttled while a run streams.
 */
export function createThreadVisitTracker(options: ThreadVisitTrackerOptions) {
  const family = Atom.family((key: string) => {
    const ref = parseThreadKey(key);
    return Atom.make((get) => {
      const registry = get.registry;
      // Showing the thread is the open, whether or not its shell has arrived;
      // the shell only decides when the server hears about it.
      // Recorded even when the server cannot take opens, so recents follow
      // it. A palette pick already sent the open with its query.
      let openPending = claimThreadOpen(ref.environmentId, ref.threadId, Date.now());
      // Dedupe per watermark: the shell updates again before the command's echo
      // lands. It also keeps a mark-unread on the open thread sticky, since the
      // rewind leaves updatedAt untouched.
      let lastDispatchedUpdatedAt: string | null = null;
      let lastDispatchAt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const clearTimer = () => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
      };
      get.addFinalizer(clearTimer);

      const dispatch = (shell: VisitedShell, visitedAt: string, opened: boolean) => {
        clearTimer();
        lastDispatchedUpdatedAt = visitedAt;
        lastDispatchAt = Date.now();
        void runAtomCommand(
          registry,
          options.visit,
          {
            environmentId: shell.environmentId,
            input: {
              threadId: shell.id,
              visitedAt,
              ...(opened ? { opened: true } : {}),
            },
          },
          { reportFailure: false },
        );
      };

      const onShell = (shell: VisitedShell | null) => {
        clearTimer();
        if (shell === null) return;

        const shellUpdatedAtMs = Date.parse(shell.updatedAt);
        if (Number.isNaN(shellUpdatedAtMs)) return;
        const wokeAtMs = shell.wokeAt ? Date.parse(shell.wokeAt) : NaN;
        const wakeIsLatest = wokeAtMs > shellUpdatedAtMs;
        const visitedAt = wakeIsLatest && shell.wokeAt ? shell.wokeAt : shell.updatedAt;
        const updatedAtMs = wakeIsLatest ? wokeAtMs : shellUpdatedAtMs;
        if (shell.lastVisitedAt === undefined) {
          options.markLocalVisit?.(ref, visitedAt);
          return;
        }
        // The open rides on the first visit the server hears, however late
        // the shell arrives, so it still counts toward search ranking.
        if (openPending) {
          openPending = false;
          dispatch(shell, visitedAt, true);
          return;
        }
        const lastVisitedAtMs = shell.lastVisitedAt ? Date.parse(shell.lastVisitedAt) : NaN;
        if (!Number.isNaN(lastVisitedAtMs) && lastVisitedAtMs >= updatedAtMs) return;
        if (lastDispatchedUpdatedAt !== null && Date.parse(lastDispatchedUpdatedAt) >= updatedAtMs)
          return;

        const elapsed = Date.now() - lastDispatchAt;
        if (
          (isThreadUnread(shell) && !threadIsStreaming(shell)) ||
          wakeIsLatest ||
          elapsed >= VISIT_DISPATCH_THROTTLE_MS
        ) {
          dispatch(shell, visitedAt, false);
          return;
        }
        timer = setTimeout(
          () => dispatch(shell, visitedAt, false),
          VISIT_DISPATCH_THROTTLE_MS - elapsed,
        );
      };

      // `subscribe`, not `get`: a rebuild would reset the open and throttle
      // state on every streaming tick.
      get.subscribe(options.threadShellAtom(ref), onShell, { immediate: true });
    }).pipe(Atom.withLabel(`thread-visit-tracker:${key}`));
  });
  return (ref: ScopedThreadRef | null) => (ref === null ? IDLE_TRACKER : family(threadKey(ref)));
}
