import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { Outlet, createFileRoute, redirect, useMatches } from "@tanstack/react-router";
import { useState } from "react";

import { ThreadRouteView } from "../components/ThreadRouteView";
import { OverviewView } from "../components/overview/OverviewView";
import { SettingsInLibraryBar } from "../components/settings/SettingsInLibraryBar";
import { isSettingsPath, useSettingsInLibrary } from "../components/settings/settingsPlacement";
import { appModalReturnPathname, isAppModalPage } from "../components/sidebar/mainAppLocation";
import { isOverviewPathname } from "../threadView";
import { SidebarInset } from "../components/ui/sidebar";
import { resolveThreadRouteTarget, type ThreadRouteTarget } from "../threadRoutes";
import { noteThreadRouteOpened } from "../threadView";
import { retainThreadFindForRoute } from "../components/chat/threadFindStore";
import { ThreadLinkPrompt } from "../components/promptLinks/ThreadLinkPrompt";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";

function threadRouteTargetKey(target: ThreadRouteTarget | null) {
  if (!target) return null;
  return target.kind === "server" ? scopedThreadKey(target.threadRef) : target.draftId;
}

function ChatRouteLayout() {
  // Render both routes here so draft promotion keeps the same ChatView mounted.
  const threadTarget = useThreadRouteTarget();
  // Read matches, not location, so this agrees with the params useThreadRouteTarget reads.
  const modalOpen = useMatches({
    select: (matches) => matches.some((match) => isAppModalPage(match.pathname)),
  });
  const settingsOpen = useMatches({
    select: (matches) => matches.some((match) => isSettingsPath(match.pathname)),
  });
  const settingsInLibrary = useSettingsInLibrary();
  // Settings is a page unless it sits in Library; then it leaves the view under it.
  const settingsPage = settingsOpen && !settingsInLibrary;
  // Settings keeps the view that opened it, so ChatView never remounts.
  const [backgroundTarget, setBackgroundTarget] = useState(threadTarget);
  if (!modalOpen && threadRouteTargetKey(backgroundTarget) !== threadRouteTargetKey(threadTarget)) {
    setBackgroundTarget(threadTarget);
  }
  const shownTarget = modalOpen ? backgroundTarget : threadTarget;
  const overviewUnderSettings =
    settingsInLibrary && !shownTarget && isOverviewPathname(appModalReturnPathname());
  if (settingsPage) return <Outlet />;
  return (
    <>
      {shownTarget?.kind === "server" && !modalOpen ? (
        <ThreadLinkPrompt threadRef={shownTarget.threadRef} />
      ) : null}
      {shownTarget ? (
        <ThreadRouteView target={shownTarget} background={modalOpen} />
      ) : overviewUnderSettings ? (
        // A wrapper would break the inset's layout; `contents` keeps it while making it inert.
        <div inert className="contents">
          <OverviewView />
        </div>
      ) : modalOpen ? (
        <SidebarInset className="h-(--app-height)" />
      ) : (
        <Outlet />
      )}
      {modalOpen ? <Outlet /> : null}
      {settingsOpen && settingsInLibrary ? <SettingsInLibraryBar /> : null}
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
    return { appModalPage: isAppModalPage(location.pathname) };
  },
  component: ChatRouteLayout,
  // Every match carries the whole location's params, so this layout sees the thread route's too.
  onEnter: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onStay: ({ context, params }) => retainThreadFindForRouteMatch(context.appModalPage, params),
  onLeave: () => retainThreadFindForRoute({ modalPage: false, threadRef: null }),
});

function retainThreadFindForRouteMatch(
  modalPage: boolean,
  params: Partial<Record<"environmentId" | "threadId", string>>,
) {
  const target = resolveThreadRouteTarget(params);
  if (target?.kind === "server") noteThreadRouteOpened(target.threadRef);
  retainThreadFindForRoute({
    modalPage,
    threadRef: target?.kind === "server" ? target.threadRef : null,
  });
}
