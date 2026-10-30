import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { requestCustomSnooze } from "../components/CustomSnoozeDialog";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { canSnooze, effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import {
  AuthOrchestrationOperateScope,
  type ContextMenuItem,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";

import {
  pickSnoozePreset,
  resolveSnoozePresets,
  type SnoozePreset,
} from "../components/Sidebar.snooze";
import { closeAppContextMenu, showAppContextMenu } from "../components/AppContextMenu";
import {
  buildThreadActionMenuItems,
  THREAD_STRIP_ACTION_IDS,
  threadActionRequiresOperate,
  type ThreadActionMenuId,
} from "../components/threadActionMenu.logic";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { copyThreadReference } from "../lib/copyThreadReference";
import { threadChipCopyTarget } from "@t3tools/client-runtime/thread-reference";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { readEnvironmentScope } from "../state/session";
import {
  readEnvironmentServerConfigLoaded,
  readEnvironmentSupportsAutoSettleOptOut,
  readThreadShell,
  useProjects,
} from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";
import { readLocalApi } from "../localApi";
import {
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKey,
  selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { buildPhysicalToLogicalProjectKeyMap } from "../sidebarProjectGrouping";
import { threadRuntimeCanArchive } from "@t3tools/client-runtime/state/models";
import { useCopyToClipboard } from "./useCopyToClipboard";
import { useNewThreadHandler } from "./useHandleNewThread";
import { useClientSettings } from "./useSettings";
import { readThreadReadState, useThreadActions } from "./useThreadActions";

function failureToast(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

/** The thread a menu acts on. Without `onStartRename` the menu leaves Rename out. */
export interface ThreadMenuTarget {
  readonly threadRef: ScopedThreadRef | null;
  readonly projectCwd: string | null;
  readonly onStartRename?: () => void;
}

export interface ThreadMenuOptions {
  /** Leaves out what the action strip already shows as buttons. */
  readonly variant?: "overflow";
  /** Acts on this thread instead of the hook's, so one hook can serve a whole list. */
  readonly target?: ThreadMenuTarget;
  /** Caller-owned items above the thread actions. */
  readonly extra?: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly run: () => void;
  }>;
}

const EXTRA_PREFIX = "extra:";

export function useThreadActionMenu(input: ThreadMenuTarget) {
  const router = useRouter();
  const projects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const logicalProjectKeyByPhysicalKey = buildPhysicalToLogicalProjectKeyMap({
    projects,
    settings: projectGroupingSettings,
    primaryEnvironmentId,
  });
  const {
    settleThread,
    unsettleThread,
    snoozeThread,
    unsnoozeThread,
    pinThread,
    confirmAndUnpinThread,
    setThreadAutoSettle,
    archiveThread,
    deleteThread,
    markThreadUnread,
    markThreadsRead,
  } = useThreadActions();
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();
  const confirmThreadDelete = useClientSettings((s) => s.confirmThreadDelete);
  const confirmThreadArchive = useClientSettings((s) => s.confirmThreadArchive);
  const timestampFormat = useClientSettings((s) => s.timestampFormat);
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({ type: "success", title: "Path copied", description: path });
    },
    onError: (error) => failureToast("Failed to copy path", error),
  });
  const { copyToClipboard: copyBranchToClipboard } = useCopyToClipboard<{ branch: string }>({
    target: "branch name",
    onCopy: ({ branch }) => {
      toastManager.add({ type: "success", title: "Branch copied", description: branch });
    },
    onError: (error) => failureToast("Failed to copy branch", error),
  });
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{ threadId: ThreadId }>({
    onCopy: ({ threadId }) => {
      toastManager.add({ type: "success", title: "Thread ID copied", description: threadId });
    },
    onError: (error) => failureToast("Failed to copy thread ID", error),
  });

  const readSnoozePresets = (
    threadRef: ScopedThreadRef | null = input.threadRef,
  ): ReadonlyArray<SnoozePreset> =>
    threadRef === null
      ? []
      : resolveSnoozePresets(new Date(), timestampFormat, threadRef.environmentId);

  const runAction = async (
    action: ThreadActionMenuId,
    shownSnoozePresets?: ReadonlyArray<SnoozePreset>,
    target: ThreadMenuTarget = input,
  ): Promise<void> => {
    const { threadRef, projectCwd, onStartRename } = target;
    if (threadRef === null) return;
    if (
      threadActionRequiresOperate(action) &&
      !readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)
    ) {
      failureToast(
        "Thread action unavailable",
        new Error("This connection cannot change threads."),
      );
      return;
    }
    const thread = readThreadShell(threadRef);
    if (!thread) return;
    if (action.startsWith("snooze:")) {
      const preset =
        action === "snooze:custom"
          ? await requestCustomSnooze()
          : pickSnoozePreset(
              shownSnoozePresets ?? readSnoozePresets(threadRef),
              action.slice("snooze:".length),
              timestampFormat,
              threadRef.environmentId,
            );
      if (!preset) return;
      const result = await snoozeThread(threadRef, preset.snoozedUntil);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        failureToast("Failed to snooze thread", squashAtomCommandFailure(result));
      }
      return;
    }
    const reportFailure = async (
      title: string,
      run: () => Promise<AtomCommandResult<unknown, unknown>>,
    ) => {
      const result = await run();
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        failureToast(title, squashAtomCommandFailure(result));
      }
    };
    switch (action) {
      case "project-settings": {
        const project = projects.find(
          (candidate) =>
            candidate.environmentId === thread.environmentId && candidate.id === thread.projectId,
        );
        if (!project) return;
        const projectKey =
          logicalProjectKeyByPhysicalKey.get(derivePhysicalProjectKey(project)) ??
          deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings);
        void router.navigate({
          to: "/projects/$projectKey",
          params: { projectKey },
        });
        return;
      }
      case "new-thread-on-branch": {
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(threadRef.environmentId, thread.projectId), {
            branch: thread.branch,
            worktreePath: thread.worktreePath,
            envMode: thread.worktreePath ? "worktree" : "local",
            startFromOrigin: false,
          }),
        );
        if (result._tag === "Failure") {
          failureToast("Could not create thread", squashAtomCommandFailure(result));
        }
        return;
      }
      case "settle":
        await reportFailure("Failed to settle thread", () => settleThread(threadRef));
        return;
      case "unsettle":
        await reportFailure("Failed to un-settle thread", () => unsettleThread(threadRef));
        return;
      case "unsnooze":
        await reportFailure("Failed to wake thread", () => unsnoozeThread(threadRef));
        return;
      case "pin":
        await reportFailure("Failed to pin thread", () => pinThread(threadRef));
        return;
      case "unpin": {
        await reportFailure("Failed to unpin thread", () => confirmAndUnpinThread(threadRef));
        return;
      }
      case "auto-settle:enabled":
      case "auto-settle:disabled":
        await reportFailure("Failed to update auto-settle", () =>
          setThreadAutoSettle(threadRef, action === "auto-settle:enabled"),
        );
        return;
      case "rename":
        onStartRename?.();
        return;
      case "regenerate-title":
        if (thread.titleRegeneration != null) return;
        await reportFailure("Failed to regenerate thread title", () =>
          updateThreadMetadata({
            environmentId: threadRef.environmentId,
            input: { threadId: threadRef.threadId, regenerateTitle: true },
          }),
        );
        return;
      case "mark-read":
        await markThreadsRead([threadRef]);
        return;
      case "mark-unread":
        markThreadUnread(threadRef);
        return;
      case "copy-path": {
        const workspacePath =
          thread.worktreePath ??
          projectCwd ??
          projects.find(
            (project) =>
              project.environmentId === thread.environmentId && project.id === thread.projectId,
          )?.workspaceRoot;
        if (!workspacePath) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Path unavailable",
              description: "This thread does not have a workspace path to copy.",
            }),
          );
          return;
        }
        copyPathToClipboard(workspacePath, { path: workspacePath });
        return;
      }
      case "copy-branch":
        if (thread.branch) {
          copyBranchToClipboard(thread.branch, { branch: thread.branch });
        }
        return;
      case "copy-thread":
        void copyThreadReference(threadChipCopyTarget(threadRef, thread.title));
        return;
      case "copy-thread-id":
        copyThreadIdToClipboard(thread.id, { threadId: thread.id });
        return;
      case "archive": {
        if (confirmThreadArchive) {
          const api = readLocalApi();
          if (!api) return;
          const confirmed = await settlePromise(() =>
            api.dialogs.confirm(`Archive thread "${thread.title}"?`),
          );
          if (confirmed._tag === "Failure" || !confirmed.value) return;
        }
        let didArchive = false;
        const result = await archiveThread(threadRef, {
          onArchived: () => {
            didArchive = true;
          },
        });
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          failureToast(
            didArchive ? "Thread archived, but navigation failed" : "Failed to archive thread",
            squashAtomCommandFailure(result),
          );
        }
        return;
      }
      case "delete": {
        if (confirmThreadDelete) {
          const api = readLocalApi();
          if (!api) return;
          const confirmed = await settlePromise(() =>
            api.dialogs.confirm(
              [
                `Delete thread "${thread.title}"?`,
                "This permanently clears conversation history for this thread.",
              ].join("\n"),
              { variant: "destructive" },
            ),
          );
          if (confirmed._tag === "Failure" || !confirmed.value) return;
        }
        const deleted = await deleteThread(threadRef);
        if (
          deleted._tag === "Failure" &&
          !isAtomCommandInterrupted(deleted) &&
          // A missing thread means cleanup failed after deletion; deleteThread already toasted that failure.
          readThreadShell(threadRef) !== null
        ) {
          failureToast("Failed to delete thread", squashAtomCommandFailure(deleted));
        }
        return;
      }
      default:
        return;
    }
  };

  const openMenu = (position: { x: number; y: number }, options: ThreadMenuOptions = {}) => {
    const target = options.target ?? input;
    const { threadRef } = target;
    if (threadRef === null) return;
    void (async () => {
      const thread = readThreadShell(threadRef);
      if (!thread) return;
      const now = new Date();
      const configLoaded = readEnvironmentServerConfigLoaded(threadRef.environmentId);
      const supports = {
        settlement: configLoaded,
        autoSettleOptOut: readEnvironmentSupportsAutoSettleOptOut(threadRef.environmentId),
        snooze: configLoaded,
        pinning: configLoaded,
        titleRegeneration: configLoaded,
      };
      const snoozePresets = resolveSnoozePresets(now, timestampFormat, threadRef.environmentId);
      const omit = new Set<ThreadActionMenuId>(
        options.variant === "overflow" ? THREAD_STRIP_ACTION_IDS : [],
      );
      if (target.onStartRename === undefined) omit.add("rename");
      const threadItems = buildThreadActionMenuItems(
        {
          canOperate: readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope),
          branch: thread.branch ?? null,
          projectFilter: null,
          isPinned: thread.pinnedAt != null,
          isSettled: supports.settlement && thread.settledOverride === "settled",
          autoSettleEnabled: thread.autoSettleDisabledAt == null,
          isSnoozed: supports.snooze && effectiveSnoozed(thread, { now: now.toISOString() }),
          canSnoozeNow: canSnooze(thread, { now: now.toISOString() }),
          isRegeneratingTitle: thread.titleRegeneration != null,
          isRunning: !threadRuntimeCanArchive(thread.runtime),
          readState: readThreadReadState(threadRef),
          supports,
          snoozePresets,
        },
        omit,
      );
      const extra = options.extra ?? [];
      const items: ReadonlyArray<ContextMenuItem<string>> = [
        ...extra.map(({ id, label, icon }) => ({
          id: `${EXTRA_PREFIX}${id}`,
          label,
          ...(icon === undefined ? {} : { icon }),
        })),
        ...threadItems.map((item, index) =>
          index === 0 && extra.length > 0 ? { ...item, separatorBefore: true } : item,
        ),
      ];
      const clicked = await settlePromise(() => showAppContextMenu(items, position));
      if (clicked._tag === "Failure" || clicked.value === null) return;
      const choice = clicked.value;
      if (choice.startsWith(EXTRA_PREFIX)) {
        extra.find((entry) => `${EXTRA_PREFIX}${entry.id}` === choice)?.run();
        return;
      }
      await runAction(choice as ThreadActionMenuId, snoozePresets, target);
    })();
  };

  const closeMenu = closeAppContextMenu;

  return { openMenu, closeMenu, runAction, readSnoozePresets };
}
