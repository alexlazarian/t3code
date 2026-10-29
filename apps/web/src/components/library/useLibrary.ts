import { useLocation, useRouter, type AnyRouter } from "@tanstack/react-router";

import { type ComposerThreadTarget, useComposerDraftStore } from "../../composerDraftStore";
import { COMPOSER_BUSY_TOAST, useComposerHandleContext } from "../../composerHandleContext";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { useQuietThreadShell } from "../../state/entities";
import { resolveThreadRouteTarget } from "../../threadRoutes";
import { appModalReturnPathname, isSettingsPath } from "../sidebar/mainAppLocation";
import { toastManager } from "../ui/toast";
import { appendComposerText, libraryContextFromRoute, type LibraryContext } from "./Library.logic";

function returnThreadRouteTarget(router: AnyRouter) {
  const params = Object.assign(
    {},
    ...router.matchRoutes(appModalReturnPathname()).map((match) => match.params),
  ) as Partial<Record<"environmentId" | "threadId" | "draftId", string>>;
  return resolveThreadRouteTarget(params);
}

/** The open thread or draft; on a Library page, the one the page was opened from. */
export function useLibraryContext(): LibraryContext {
  const router = useRouter();
  const onLibraryPage = useLocation({ select: (location) => isSettingsPath(location.pathname) });
  const openTarget = useThreadRouteTarget();
  const routeTarget = onLibraryPage ? returnThreadRouteTarget(router) : openTarget;
  const threadShell = useQuietThreadShell(
    routeTarget?.kind === "server" ? routeTarget.threadRef : null,
  );
  const draftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  return libraryContextFromRoute(routeTarget, draftSession, threadShell);
}

/** A mounted composer applies its own guards; only with none mounted is the draft appended to. */
export function useInsertInComposer(target: ComposerThreadTarget | null) {
  const composerRef = useComposerHandleContext();
  if (target === null) return null;
  return (text: string) => {
    const composer = composerRef?.current;
    if (composer) {
      if (!composer.insertTextAtEnd(text, { ensureLeadingBoundary: true })) {
        toastManager.add(COMPOSER_BUSY_TOAST);
      }
      return;
    }
    const store = useComposerDraftStore.getState();
    store.setPrompt(target, appendComposerText(store.getComposerDraft(target)?.prompt ?? "", text));
  };
}
