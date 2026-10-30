import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { ThreadRouteView } from "../components/ThreadRouteView";
import { isSettingsPath } from "../components/sidebar/mainAppLocation";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { noteThreadRouteOpened } from "../threadView";
import { retainThreadFindForRoute } from "../components/chat/threadFindStore";
import { ThreadLinkPrompt } from "../components/promptLinks/ThreadLinkPrompt";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";

function ChatRouteLayout() {
  // Render both thread routes here so draft promotion keeps the same ChatView mounted.
  const threadTarget = useThreadRouteTarget();
  if (!threadTarget) return <Outlet />;
  return (
    <>
      {threadTarget.kind === "server" ? (
        <ThreadLinkPrompt threadRef={threadTarget.threadRef} />
      ) : null}
      <ThreadRouteView target={threadTarget} />
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context, location }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "local-environment-off"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
    return { appModalPage: isSettingsPath(location.pathname) };
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
