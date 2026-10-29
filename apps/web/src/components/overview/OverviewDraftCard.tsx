import { XIcon } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { cn } from "~/lib/utils";
import { discardComposerDraft } from "../../lib/discardComposerDraft";
import { noteOverviewSplitClosed } from "../../threadView";
import { RelativeTimeLabel } from "../sidebar/RelativeTimeLabel";
import { UnsentDraftLabel } from "../sidebar/UnsentDraftLabel";
import { StatusLight } from "../StatusLight";
import { overviewDraftCards, type OverviewDraft } from "./Overview.logic";

export function OverviewDraftCard(props: {
  draft: OverviewDraft;
  selected: boolean;
  onOpen(): void;
}) {
  const { draft } = props;
  const title = draft.preview || "New thread";
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onOpen();
  };
  const discard = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    discardComposerDraft(draft.draftId);
    if (props.selected) noteOverviewSplitClosed();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-thread-key={draft.threadKey}
      aria-label={`${title}, unsent draft`}
      aria-pressed={props.selected}
      onClick={props.onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        "group min-w-0 cursor-pointer border border-dashed border-border bg-muted text-foreground outline-0 -outline-offset-1 outline-ring select-none focus-visible:outline-2",
        props.selected && "outline-2 outline-primary",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-b border-dashed border-border px-1.75 py-0.75">
        <StatusLight tone="idle" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{title}</span>
        <button
          type="button"
          aria-label="Discard draft"
          onClick={discard}
          className="flex shrink-0 cursor-pointer text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
        >
          <XIcon aria-hidden className="size-3" />
        </button>
      </div>
      <div className="flex min-w-0 gap-1.75 px-1.75 pt-0.75 pb-1 text-3xs leading-normal whitespace-nowrap text-muted-foreground/80">
        <UnsentDraftLabel />
        <span className="ml-auto shrink-0 tabular-nums">
          <RelativeTimeLabel timestamp={draft.createdAt} />
        </span>
      </div>
    </div>
  );
}

/** Subscribes to composer text here so typing in the pane re-renders only these cards. */
export function OverviewColumnDrafts(props: {
  projectKey: string;
  projectKeyOf: Parameters<typeof overviewDraftCards>[0]["projectKeyOf"];
  openKey: string | null;
  onOpen(threadKey: string): void;
}) {
  const sessions = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const composers = useComposerDraftStore((store) => store.draftsByThreadKey);
  const drafts =
    overviewDraftCards({
      sessions,
      composers,
      projectKeyOf: props.projectKeyOf,
      openThreadKey: props.openKey,
    }).get(props.projectKey) ?? [];
  return drafts.map((draft) => (
    <OverviewDraftCard
      key={draft.draftId}
      draft={draft}
      selected={draft.threadKey === props.openKey}
      onOpen={() => props.onOpen(draft.threadKey)}
    />
  ));
}
