import { usePromptStashStore } from "../../promptStashStore";
import { stashEntrySnippet } from "../chat/ComposerStashMenu";
import { libraryInsertTarget, stashEntryInsertText, type LibraryContext } from "./Library.logic";
import { LibraryItemList } from "./LibraryItemList";
import { useInsertInComposer } from "./useLibrary";

export function LibraryStash(props: { readonly ctx: LibraryContext }) {
  const entries = usePromptStashStore((store) => store.entries);
  const insert = useInsertInComposer(libraryInsertTarget(props.ctx));
  return (
    <LibraryItemList
      empty="Nothing stashed yet."
      items={entries.map((entry) => {
        const text = stashEntryInsertText(entry);
        return {
          key: entry.id,
          name: stashEntrySnippet(entry),
          detail:
            text === null
              ? "Has attachments or context. Restore it from the composer's stash menu."
              : "Saved on this device.",
          actions:
            insert === null || text === null
              ? []
              : [{ label: "Insert in composer", onSelect: () => insert(text) }],
        };
      })}
    />
  );
}
