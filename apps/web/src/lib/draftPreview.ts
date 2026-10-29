import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";

import type { ComposerThreadDraftState } from "../composerDraftStore";

export function draftPreviewLine(composer: ComposerThreadDraftState): string {
  const promptPreview =
    replaceComposerContextReferences(composer.prompt, (occurrence) => occurrence.label)
      .trim()
      .split("\n", 1)[0] ?? "";
  if (promptPreview.length > 0) return promptPreview;
  // images mirrors persistedAttachments once rehydration finishes; before
  // that only the persisted list is populated, hence max not sum.
  const attachmentCount =
    Math.max(composer.images.length, composer.persistedAttachments.length) +
    composer.files.length +
    composer.terminalContexts.length +
    composer.previewAnnotations.length +
    composer.reviewComments.length;
  return attachmentCount === 0
    ? ""
    : `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`;
}
