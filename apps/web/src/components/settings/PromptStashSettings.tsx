import { usePromptStashStore } from "../../promptStashStore";
import { stashEntrySnippet } from "../chat/ComposerStashMenu";
import { libraryInsertTarget, stashEntryInsertText } from "../library/Library.logic";
import { useInsertInComposer, useLibraryContext } from "../library/useLibrary";
import { RelativeTime } from "../RelativeTime";
import { useCloseAppModal } from "../sidebar/mainAppLocation";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function PromptStashSettings() {
  const entries = usePromptStashStore((store) => store.entries);
  const takeEntry = usePromptStashStore((store) => store.takeEntry);
  const insert = useInsertInComposer(libraryInsertTarget(useLibraryContext()));
  const close = useCloseAppModal();
  const section = searchableSetting("prompt-stash");
  return (
    <SettingsPageContainer>
      <SettingsSection id={section.id} title={section.title}>
        {entries.length === 0 ? (
          <SettingsRow
            title="Nothing stashed yet"
            description="Press Cmd/Ctrl+S with a prompt in the composer to stash it. Up to 20 are kept on this device."
          />
        ) : (
          entries.map((entry) => {
            const text = stashEntryInsertText(entry);
            return (
              <SettingsRow
                key={entry.id}
                title={stashEntrySnippet(entry)}
                description={
                  <>
                    <RelativeTime timestamp={entry.createdAt} />
                    {text === null
                      ? ". Has attachments or context; restore it from the composer's stash menu."
                      : null}
                  </>
                }
                control={
                  <div className="flex gap-1">
                    {insert !== null && text !== null ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          insert(text);
                          void close();
                        }}
                      >
                        Insert in composer
                      </Button>
                    ) : null}
                    <Button size="xs" variant="ghost" onClick={() => takeEntry(entry.id)}>
                      Delete
                    </Button>
                  </div>
                }
              />
            );
          })
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
