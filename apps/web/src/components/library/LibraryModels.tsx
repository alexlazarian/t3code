import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import {
  getAppModelOptionsForInstance,
  resolveAppModelSelectionForInstance,
} from "../../modelSelection";
import { isProviderInstancePickerVisible } from "../../providerInstances";
import { getStartedThreadModelChangeBlockReason } from "../ChatView.logic";
import { getProviderSummary } from "../settings/providerStatus";
import { toastManager } from "../ui/toast";
import { libraryModelAction, type LibraryContext } from "./Library.logic";
import { type LibraryItem, LibraryItemList } from "./LibraryItemList";
import { useLibraryProvider } from "./useLibrary";

export function LibraryModels(props: { readonly ctx: LibraryContext }) {
  const provider = useLibraryProvider(props.ctx);
  return provider.environmentId === null ? (
    <LibraryItemList items={[]} empty="No machine is connected." />
  ) : (
    <LibraryModelList ctx={props.ctx} environmentId={provider.environmentId} provider={provider} />
  );
}

function LibraryModelList(props: {
  readonly ctx: LibraryContext;
  readonly environmentId: EnvironmentId;
  readonly provider: ReturnType<typeof useLibraryProvider>;
}) {
  const { ctx, environmentId } = props;
  const { providers, entries, entry, threadShell } = props.provider;
  const settings = useEnvironmentSettings(environmentId);
  const navigate = useNavigate();
  const { handleNewThread, defaultProjectRef } = useHandleNewThread();
  const projectRef =
    ctx.environmentId !== null && ctx.projectId !== null
      ? scopeProjectRef(ctx.environmentId, ctx.projectId)
      : defaultProjectRef?.environmentId === environmentId
        ? defaultProjectRef
        : null;
  const threadInstanceId = ctx.threadRef === null ? null : (entry?.instanceId ?? null);

  const switchThreadModel = (instanceId: ProviderInstanceId, slug: string) => {
    if (ctx.threadRef === null || threadShell === null) return;
    const model = resolveAppModelSelectionForInstance(instanceId, settings, providers, slug);
    if (model === null) return;
    const store = useComposerDraftStore.getState();
    const remembered = store.stickyOptionsByModelByProvider[instanceId]?.[model];
    const next: ModelSelection =
      remembered !== undefined && remembered.length > 0
        ? { instanceId, model, options: [...remembered] }
        : { instanceId, model };
    const blocked = getStartedThreadModelChangeBlockReason({
      providers,
      hasStartedSession: threadShell.runtime !== null,
      currentModelSelection: threadShell.modelSelection,
      currentProviderInstanceId: threadShell.runtime?.providerInstanceId ?? null,
      nextModelSelection: next,
    });
    if (blocked) {
      toastManager.add({ type: "warning", ...blocked });
      return;
    }
    store.setModelSelection(ctx.threadRef, next, { explicit: true, replaceOptions: true });
    store.setStickyModelSelection(next);
  };

  const newThreadWith = async (instanceId: ProviderInstanceId, model: string) => {
    if (projectRef === null) return;
    const opened = await handleNewThread(projectRef).catch(() => null);
    if (opened === null) return;
    useComposerDraftStore
      .getState()
      .setModelSelection(
        opened.draftId,
        { instanceId, model },
        { explicit: true, replaceOptions: true },
      );
  };

  const items: LibraryItem[] = entries
    .filter(isProviderInstancePickerVisible)
    .flatMap((candidate) =>
      getAppModelOptionsForInstance(settings, candidate).map((option) => {
        const action = libraryModelAction(candidate, threadInstanceId);
        const base = { key: `${candidate.instanceId}:${option.slug}`, name: option.name };
        if (action === "setup") {
          return {
            ...base,
            meta: `${candidate.displayName} · ${getProviderSummary(candidate.snapshot).headline}`,
            bad: true,
            detail: `${candidate.displayName} isn't set up yet.`,
            actions: [
              {
                label: "Open provider setup",
                onSelect: () =>
                  void navigate({
                    to: "/settings/providers",
                    search: { environmentId, instanceId: candidate.instanceId },
                  }),
              },
            ],
          };
        }
        if (action === "use") {
          return {
            ...base,
            meta: candidate.displayName,
            detail: "Same agent as the open thread.",
            actions: [
              {
                label: "Use in this thread",
                onSelect: () => switchThreadModel(candidate.instanceId, option.slug),
              },
            ],
          };
        }
        return {
          ...base,
          meta: candidate.displayName,
          detail:
            threadInstanceId === null
              ? "Starts a new thread on this model."
              : "Different agent. To move this thread instead, pick it in the composer's model picker; it hands off when the session supports it.",
          actions:
            projectRef === null
              ? []
              : [
                  {
                    label: `New thread with ${option.name}`,
                    onSelect: () => void newThreadWith(candidate.instanceId, option.slug),
                  },
                ],
        };
      }),
    );
  return <LibraryItemList items={items} empty="No models are available." />;
}
