import type { RuntimeMode } from "@t3tools/contracts";

import { useComposerDraftStore } from "../../composerDraftStore";
import { runtimeModeConfig, runtimeModeOptions } from "../chat/runtimeModeConfig";
import { libraryInsertTarget, type LibraryContext } from "./Library.logic";
import { LibraryItemList } from "./LibraryItemList";
import { useLibraryProvider } from "./useLibrary";

export function LibraryAccess(props: { readonly ctx: LibraryContext }) {
  const { ctx } = props;
  const { entry, threadShell } = useLibraryProvider(ctx);
  const target = libraryInsertTarget(ctx);
  const current = useComposerDraftStore((store) => {
    if (target === null) return null;
    return (
      store.getComposerDraft(target)?.runtimeMode ??
      (ctx.draftId === null ? null : store.getDraftSession(ctx.draftId)?.runtimeMode) ??
      null
    );
  });
  const currentMode = current ?? threadShell?.runtimeMode ?? null;
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
            : [{ label: "Use in this thread", onSelect: () => applyMode(mode) }],
      }))}
    />
  );
}
