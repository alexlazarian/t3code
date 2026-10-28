import type { ServerProvider } from "@t3tools/contracts";

import { type ComposerThreadTarget, useComposerDraftStore } from "../../composerDraftStore";
import { useComposerHandleContext } from "../../composerHandleContext";
import { useThreadRouteTarget } from "../../hooks/useThreadRouteTarget";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { useQuietThreadShell } from "../../state/entities";
import { useEnvironmentProviders, usePrimaryEnvironmentId } from "../../state/environments";
import { toastManager } from "../ui/toast";
import {
  appendComposerText,
  libraryContextFromRoute,
  libraryInsertTarget,
  resolveLibraryProviderEntry,
  type LibraryContext,
} from "./Library.logic";

const NO_PROVIDERS: ReadonlyArray<ServerProvider> = [];

export function useLibraryContext(): LibraryContext {
  const routeTarget = useThreadRouteTarget();
  const threadShell = useQuietThreadShell(
    routeTarget?.kind === "server" ? routeTarget.threadRef : null,
  );
  const draftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  return libraryContextFromRoute(routeTarget, draftSession, threadShell);
}

/** The provider the open thread or draft uses, on its machine; the primary machine otherwise. */
export function useLibraryProvider(ctx: LibraryContext) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = ctx.environmentId ?? primaryEnvironmentId;
  const providersByEnvironment = useEnvironmentProviders();
  const providers =
    (environmentId === null ? undefined : providersByEnvironment.get(environmentId)) ??
    NO_PROVIDERS;
  const threadShell = useQuietThreadShell(ctx.threadRef);
  const target = libraryInsertTarget(ctx);
  const draftInstanceId = useComposerDraftStore((store) =>
    target === null ? null : (store.getComposerDraft(target)?.activeProvider ?? null),
  );
  const entries = deriveProviderInstanceEntries(providers);
  const entry = resolveLibraryProviderEntry(
    entries,
    draftInstanceId ?? threadShell?.modelSelection.instanceId ?? null,
  );
  return { environmentId, providers, entries, entry, threadShell };
}

/** A mounted composer applies its own guards; only with none mounted is the draft appended to. */
export function useInsertInComposer(target: ComposerThreadTarget | null) {
  const composerRef = useComposerHandleContext();
  if (target === null) return null;
  return (text: string) => {
    const composer = composerRef?.current;
    if (composer) {
      if (!composer.insertTextAtEnd(text, { ensureLeadingBoundary: true })) {
        toastManager.add({
          type: "error",
          title: "Unable to add to chat",
          description: "The composer is busy; try again once it is ready.",
        });
      }
      return;
    }
    const store = useComposerDraftStore.getState();
    store.setPrompt(target, appendComposerText(store.getComposerDraft(target)?.prompt ?? "", text));
  };
}
