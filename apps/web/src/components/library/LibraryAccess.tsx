import type { EnvironmentId, RuntimeMode } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { runtimeModeConfig, runtimeModeOptions } from "../chat/runtimeModeConfig";
import { libraryInsertTarget, type LibraryContext } from "./Library.logic";
import { LibraryItemList } from "./LibraryItemList";
import { useLibraryProvider } from "./useLibrary";

export function LibraryAccess(props: { readonly ctx: LibraryContext }) {
  const provider = useLibraryProvider(props.ctx);
  return provider.environmentId === null ? (
    <LibraryItemList items={[]} empty="No machine is connected." />
  ) : (
    <LibraryAccessList ctx={props.ctx} environmentId={provider.environmentId} provider={provider} />
  );
}

function LibraryAccessList(props: {
  readonly ctx: LibraryContext;
  readonly environmentId: EnvironmentId;
  readonly provider: ReturnType<typeof useLibraryProvider>;
}) {
  const { ctx } = props;
  const { entry, threadShell } = props.provider;
  const target = libraryInsertTarget(ctx);
  const composerMode = useComposerDraftStore((store) =>
    target === null ? null : (store.getComposerDraft(target)?.runtimeMode ?? null),
  );
  const defaultRuntimeMode = useEnvironmentSettings(
    props.environmentId,
    (settings) => resolveProjectSettings(settings, ctx.projectId).settings.defaultRuntimeMode,
  );
  const currentMode =
    target === null ? null : (composerMode ?? threadShell?.runtimeMode ?? defaultRuntimeMode);
  const supported = entry?.snapshot.supportedRuntimeModes;
  const modes =
    supported && supported.length > 0
      ? runtimeModeOptions.filter((mode) => supported.includes(mode))
      : runtimeModeOptions;

  const applyMode = (mode: RuntimeMode) => {
    if (target === null) return;
    const store = useComposerDraftStore.getState();
    store.setRuntimeMode(target, mode);
    if (ctx.draftId !== null) store.setDraftThreadContext(ctx.draftId, { runtimeMode: mode });
  };

  return (
    <LibraryItemList
      empty="No access modes."
      items={modes.map((mode) => ({
        key: mode,
        name: runtimeModeConfig[mode].label,
        meta: mode === currentMode ? "current" : undefined,
        detail: runtimeModeConfig[mode].description,
        actions:
          target === null || mode === currentMode
            ? []
            : [
                {
                  label: ctx.draftId === null ? "Use in this thread" : "Use for this draft",
                  onSelect: () => applyMode(mode),
                },
              ],
      }))}
    />
  );
}
