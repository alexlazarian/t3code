import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import { threadWokeAt } from "@t3tools/client-runtime/state/thread-settled";
import { useEffect } from "react";

import { resolveInfoBarText, type InfoBarTarget, type InfoBarThread } from "../infoBar.logic";
import { useInfoBarStore } from "../infoBarStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { selectProjectGroupingSettings } from "../logicalProject";
import { buildSidebarProjectSnapshots } from "../sidebarProjectGrouping";
import { useEnvironmentIdentities, usePrimaryEnvironmentId } from "../state/environments";
import { readThreadShell, useProjects } from "../state/entities";
import { useClientSettings } from "../hooks/useSettings";
import { useStableCallback } from "../hooks/useStableCallback";
import { environmentPresentations } from "../state/presentation";
import { useUiStateStore } from "../uiStateStore";
import {
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
  resolveThreadLastVisitedAt,
} from "./Sidebar.logic";
import { runtimeModeConfig } from "./chat/runtimeModeConfig";
import { sidebarProviderEntriesAtom } from "./sidebar/sidebarProviderEntries";
import { isSidebarThreadWoke, resolveSidebarStatusLabel } from "./sidebar/threadStatusLabel";

const TARGET_SELECTOR = "[data-info],[aria-label],[data-info-thread]";
const TRIGGER_SELECTOR = '[data-slot="tooltip-trigger"][data-info]';

function lookupThread(
  threadKey: string,
  projectNameByKey: ReadonlyMap<string, string>,
): InfoBarThread | null {
  const ref = parseScopedThreadKey(threadKey);
  const thread = ref ? readThreadShell(ref) : null;
  if (!thread) return null;
  const { environmentId } = thread;
  const presentation = appAtomRegistry.get(
    environmentPresentations.presentationAtom(environmentId),
  );
  const instanceId = thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
  const providerName =
    appAtomRegistry.get(sidebarProviderEntriesAtom).get(environmentId)?.get(instanceId)
      ?.displayName ??
    thread.runtime?.providerName ??
    instanceId;
  const lastVisitedAt = resolveThreadLastVisitedAt(
    thread.lastVisitedAt,
    useUiStateStore.getState().threadLastVisitedAtById[threadKey],
  );
  const status = resolveSidebarStatusLabel({
    status: resolveSidebarThreadStatus(thread),
    goalActive: thread.goal?.status === "active",
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
    isUnread: hasUnseenCompletion({ ...thread, lastVisitedAt }),
    isWoke: isSidebarThreadWoke({
      wokeAt: threadWokeAt(thread, { now: new Date().toISOString() }),
      lastVisitedAt,
      settledOverride: thread.settledOverride,
    }),
  });
  const pullRequest =
    resolveThreadCurrentPullRequestLink(thread.pullRequests) ??
    thread.linkedPullRequest ??
    thread.branchPullRequest;
  return {
    title: thread.title,
    status: status?.label ?? null,
    project: projectNameByKey.get(`${environmentId}:${thread.projectId}`) ?? null,
    machine: presentation?.entry.target.label ?? null,
    offline: presentation !== null && presentation.connection.phase !== "connected",
    branch: thread.branch ?? null,
    provider: providerName,
    model: thread.modelSelection.model,
    access: runtimeModeConfig[thread.runtimeMode]?.label ?? null,
    pullRequest: pullRequest ? { number: pullRequest.number } : null,
  };
}

function targetOf(element: Element): InfoBarTarget {
  const trigger = element.closest(TRIGGER_SELECTOR);
  const source = element.hasAttribute("data-info") ? element : (trigger ?? element);
  return {
    info: source.getAttribute("data-info") ?? undefined,
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    threadKey: element.getAttribute("data-info-thread") ?? undefined,
    role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
  };
}

function useProjectNameByKey(): ReadonlyMap<string, string> {
  const projects = useProjects();
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  const environments = useEnvironmentIdentities();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const labels = new Map(
    environments.map((environment) => [environment.environmentId, environment.label] as const),
  );
  const groups = buildSidebarProjectSnapshots({
    projects,
    groupScratchProjects: true,
    settings: groupingSettings,
    primaryEnvironmentId,
    resolveEnvironmentLabel: (environmentId) => labels.get(environmentId) ?? null,
  });
  return new Map(
    groups.flatMap((group) =>
      group.memberProjects.map(
        (project) => [`${project.environmentId}:${project.id}`, group.displayName] as const,
      ),
    ),
  );
}

export function InfoBar() {
  const text = useInfoBarStore((store) => store.text);
  const projectNameByKey = useProjectNameByKey();
  const lookup = useStableCallback((threadKey: string) =>
    lookupThread(threadKey, projectNameByKey),
  );

  // oxlint-disable-next-line t3code/react-effect-budget -- document-level pointer listener
  useEffect(() => {
    const { set } = useInfoBarStore.getState();
    let lastElement: Element | null = null;
    const onPointerOver = (event: PointerEvent) => {
      const element =
        event.target instanceof Element ? event.target.closest(TARGET_SELECTOR) : null;
      if (element === lastElement) return;
      lastElement = element;
      set(element ? resolveInfoBarText(targetOf(element), lookup) : null);
    };
    const onLeave = () => {
      lastElement = null;
      set(null);
    };
    document.addEventListener("pointerover", onPointerOver);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      set(null);
    };
  }, [lookup]);

  return (
    <div
      aria-hidden="true"
      className="h-(--info-bar-height) truncate border-t border-border bg-background px-2 text-3xs leading-5 text-muted-foreground select-none"
    >
      {text}
    </div>
  );
}
