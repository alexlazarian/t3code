import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { readLocalApi } from "~/localApi";
import { canShareWithGuestAtom } from "./guestShareAvailability";
import { useAtomValue } from "@effect/atom-react";
import { useEnvironmentScope } from "../../state/session";
import { ProjectFavicon } from "../ProjectFavicon";
import { StatusLight, type StatusLightTone } from "../StatusLight";
import { isElectron } from "~/env";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
  WorkspaceBreadcrumbText,
} from "../WorkspaceBreadcrumb";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { textDirection } from "~/textDirection";
import { useClientSettings } from "../../hooks/useSettings";
import { ThreadHeaderTools, type ThreadHeaderToolsProps } from "./PanelLayoutControls";
import { useThreadHeaderStatus } from "./useThreadHeaderStatus";
import type { ThreadTitleRename } from "./useThreadTitleRename";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  activeThreadTitle: string;
  activeThreadLinkOrigin?: string | null | undefined;
  isServerThread: boolean;
  threadShell: EnvironmentThreadShell | null;
  rename: ThreadTitleRename;
  activeProject: EnvironmentProject | null;
  parentThreadLink: { threadId: ThreadId; title: string } | null;
  onOpenThread: (threadId: ThreadId) => void;
  onNewThreadInProject: () => void;
  onOpenProjectSettings?: (() => void) | undefined;
}

const TINTED_TONES: ReadonlySet<StatusLightTone> = new Set([
  "working",
  "needs-you",
  "failed",
  "waiting",
]);

export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  activeThreadTitle,
  activeThreadLinkOrigin,
  isServerThread,
  threadShell,
  rename,
  activeProject,
  parentThreadLink,
  onOpenThread,
  onNewThreadInProject,
  onOpenProjectSettings,
  ...tools
}: ChatHeaderProps & Omit<ThreadHeaderToolsProps, "isServerThread">) {
  const status = useThreadHeaderStatus(threadShell);
  const activeProjectName = activeProject?.isScratch ? "No project" : activeProject?.title;
  const activeProjectCwd = activeProject?.workspaceRoot ?? null;
  const interfaceFont = useClientSettings((settings) => settings.fontFamilySans);
  const breadcrumbContainerRef = useRef<HTMLDivElement>(null);
  const [collapseParentTitle, setCollapseParentTitle] = useState(false);
  const activeThreadRef = scopeThreadRef(activeThreadEnvironmentId, activeThreadId);
  const canOperateThread = useEnvironmentScope(
    activeThreadEnvironmentId,
    AuthOrchestrationOperateScope,
  );
  const canShareWithGuest = useAtomValue(canShareWithGuestAtom(activeThreadEnvironmentId));
  const { renamingTitle, setRenamingTitle, startRename, commitRename, cancelRename } = rename;
  const isRenamingTitle = renamingTitle !== null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the breadcrumb list DOM via ResizeObserver, a frame and font loads to collapse the parent title
  useEffect(() => {
    const list = breadcrumbContainerRef.current?.querySelector("ol");
    if (!list || !parentThreadLink) return;
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
      const width = Array.from(list.children).reduce(
        (total, item) => {
          const label = item.querySelector('[data-slot="workspace-breadcrumb-text"]');
          const ellipsis = item.querySelector("[data-parent-breadcrumb-ellipsis]");
          return (
            total +
            (item.firstElementChild?.getBoundingClientRect().width ?? 0) +
            (label && getComputedStyle(label).maxWidth === "none"
              ? label.scrollWidth - label.clientWidth
              : 0) -
            (ellipsis?.getBoundingClientRect().width ?? 0)
          );
        },
        gap * (list.children.length - 1),
      );
      setCollapseParentTitle(width > list.clientWidth);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    document.fonts.addEventListener("loadingdone", measure);
    const stopObserving = observeResize(list, measure);
    return () => {
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", measure);
      stopObserving();
    };
  }, [
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Title, font and rename changes resize the breadcrumb text without resizing the list, so it re-measures.
    activeProjectName,
    activeThreadTitle,
    parentThreadLink,
    interfaceFont,
    isRenamingTitle,
  ]);
  const { openMenu } = useThreadActionMenu({
    threadRef: isServerThread ? activeThreadRef : null,
    projectCwd: activeProjectCwd,
    onStartRename: startRename,
    canShareWithGuest,
  });
  // A drag region swallows double-clicks (macOS zooms the window), so the title opts out.
  const canRenameTitle = isServerThread && canOperateThread;
  const handleTitleDoubleClick = (event: ReactMouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    startRename();
  };
  const handleHeaderContextMenu = (event: ReactMouseEvent) => {
    if (renamingTitle !== null) return;
    if (!isServerThread && onOpenProjectSettings === undefined) return;
    event.preventDefault();
    if (!isServerThread) {
      const api = readLocalApi();
      if (!api) return;
      void api.contextMenu
        .show([{ id: "project-settings", label: "Project settings", icon: "settings" }], {
          x: event.clientX,
          y: event.clientY,
        })
        .then((action) => {
          if (action === "project-settings") onOpenProjectSettings?.();
        });
      return;
    }
    openMenu({ x: event.clientX, y: event.clientY });
  };
  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") commitRename();
    else if (event.key === "Escape") cancelRename();
  };
  return (
    <header
      data-chat-header
      data-status-tone={status && TINTED_TONES.has(status.tone) ? status.tone : undefined}
      className={cn(
        "relative bg-background",
        isElectron
          ? "drag-region flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center px-3 sm:px-5"
          : "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)",
      )}
    >
      <div
        ref={breadcrumbContainerRef}
        className="@container/thread-header flex min-w-0 flex-1 items-center gap-2"
        onContextMenu={handleHeaderContextMenu}
      >
        {isServerThread ? <StatusLight tone={status?.tone ?? "idle"} /> : null}
        <WorkspaceBreadcrumb
          ariaLabel="Thread breadcrumb"
          className="flex-1 overflow-clip [overflow-clip-margin:2px]"
        >
          {activeProject ? (
            <>
              <WorkspaceBreadcrumbItem className="shrink">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`New thread in ${activeProjectName}`}
                        onClick={onNewThreadInProject}
                        className="inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      />
                    }
                  >
                    <ProjectFavicon project={activeProject} className="size-3.5" />
                    <WorkspaceBreadcrumbText className="max-w-40">
                      {activeProjectName}
                    </WorkspaceBreadcrumbText>
                  </TooltipTrigger>
                  <TooltipPopup side="top">New thread in {activeProjectName}</TooltipPopup>
                </Tooltip>
              </WorkspaceBreadcrumbItem>
              <WorkspaceBreadcrumbSeparator>
                <WorkspaceBreadcrumbText>/</WorkspaceBreadcrumbText>
              </WorkspaceBreadcrumbSeparator>
            </>
          ) : null}
          {parentThreadLink ? (
            <>
              <WorkspaceBreadcrumbItem>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Open parent thread: ${parentThreadLink.title}`}
                        onClick={() => onOpenThread(parentThreadLink.threadId)}
                        className="inline-flex min-w-0 max-w-full cursor-pointer items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      />
                    }
                  >
                    <WorkspaceBreadcrumbText
                      aria-hidden
                      className={collapseParentTitle ? "w-0" : undefined}
                    >
                      {parentThreadLink.title}
                    </WorkspaceBreadcrumbText>
                    {collapseParentTitle ? (
                      <span aria-hidden data-parent-breadcrumb-ellipsis>
                        ...
                      </span>
                    ) : null}
                  </TooltipTrigger>
                  <TooltipPopup side="top">{parentThreadLink.title}</TooltipPopup>
                </Tooltip>
              </WorkspaceBreadcrumbItem>
              <WorkspaceBreadcrumbSeparator>
                <WorkspaceBreadcrumbText>/</WorkspaceBreadcrumbText>
              </WorkspaceBreadcrumbSeparator>
            </>
          ) : null}
          <WorkspaceBreadcrumbItem current className="min-w-10 flex-1 gap-2">
            {renamingTitle !== null ? (
              <input
                autoFocus
                dir="auto"
                aria-label="Thread title"
                className="min-w-0 flex-1 rounded-sm bg-transparent text-sm font-medium text-foreground outline-none ring-1 ring-inset ring-ring/50 focus:ring-ring"
                value={renamingTitle}
                onChange={(event) => setRenamingTitle(event.currentTarget.value)}
                onBlur={(event) => {
                  if (
                    event.relatedTarget instanceof HTMLElement &&
                    event.relatedTarget.closest("button")
                  ) {
                    cancelRename();
                    return;
                  }
                  commitRename();
                }}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={handleRenameKeyDown}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <h2
                      aria-label={activeThreadTitle}
                      className={cn(
                        "min-w-0 flex-1",
                        canRenameTitle && "[-webkit-app-region:no-drag]",
                      )}
                      dir={textDirection(activeThreadTitle)}
                      onDoubleClick={canRenameTitle ? handleTitleDoubleClick : undefined}
                    />
                  }
                >
                  <WorkspaceBreadcrumbText>{activeThreadTitle}</WorkspaceBreadcrumbText>
                </TooltipTrigger>
                <TooltipPopup side="top">{activeThreadTitle}</TooltipPopup>
              </Tooltip>
            )}
            {renamingTitle === null && activeThreadLinkOrigin ? (
              <Tooltip>
                <TooltipTrigger render={<Badge variant="info" size="sm" />}>
                  From {activeThreadLinkOrigin}
                </TooltipTrigger>
                <TooltipPopup side="top">
                  Started by an agent on {activeThreadLinkOrigin} through a linked environment.
                </TooltipPopup>
              </Tooltip>
            ) : null}
          </WorkspaceBreadcrumbItem>
        </WorkspaceBreadcrumb>
        {status ? (
          <span className={cn("shrink-0 text-xs font-semibold", status.className)}>
            {status.label}
          </span>
        ) : null}
        <ThreadHeaderTools {...tools} isServerThread={isServerThread} />
      </div>
    </header>
  );
});
