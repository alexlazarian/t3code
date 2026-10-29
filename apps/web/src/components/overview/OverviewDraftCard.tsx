import { PlusIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, type MouseEvent } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { cn } from "~/lib/utils";
import { discardComposerDraft } from "../../lib/discardComposerDraft";
import { noteOverviewSplitClosed } from "../../threadView";
import { RelativeTimeLabel } from "../sidebar/RelativeTimeLabel";
import { UnsentDraftLabel } from "../sidebar/UnsentDraftLabel";
import { StatusLight } from "../StatusLight";
import { overviewDraftCards, type OverviewColumn, type OverviewDraft } from "./Overview.logic";
import { OverviewShelf } from "./OverviewShelf";

function OverviewDraftCard(props: { draft: OverviewDraft; selected: boolean; onOpen(): void }) {
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

function NewThreadInColumnButton(props: {
  readonly projectName: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`New thread in ${props.projectName}`}
      onClick={props.onClick}
      className="flex h-6 w-full shrink-0 cursor-pointer items-center justify-center gap-1 border border-dashed border-muted-foreground/20 text-2xs text-muted-foreground/50 hover:border-muted-foreground hover:text-foreground"
    >
      <PlusIcon aria-hidden className="size-3" />
      New thread
    </button>
  );
}

/** Subscribes to composer text here so typing in the pane re-renders only this shelf. */
export function OverviewDraftsShelf(props: {
  columns: ReadonlyArray<OverviewColumn>;
  projectKeyOf: Parameters<typeof overviewDraftCards>[0]["projectKeyOf"];
  openKey: string | null;
  row: number;
  expanded: boolean;
  onToggle(): void;
  onOpen(threadKey: string): void;
  onNewThread(project: NonNullable<OverviewColumn["project"]>): void;
}) {
  const sessions = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const composers = useComposerDraftStore((store) => store.draftsByThreadKey);
  const byColumn = overviewDraftCards({
    sessions,
    composers,
    projectKeyOf: props.projectKeyOf,
    openThreadKey: props.openKey,
  });
  const counts = props.columns.map((column) => byColumn.get(column.projectKey)?.length ?? 0);
  return (
    <OverviewShelf
      name="Drafts"
      total={counts.reduce((sum, count) => sum + count, 0)}
      expanded={props.expanded}
      onToggle={props.onToggle}
      urgency={null}
      row={props.row}
      columns={props.columns.map((column, index) => ({
        key: column.projectKey,
        count: counts[index] ?? 0,
        cell: (
          <>
            {(byColumn.get(column.projectKey) ?? []).map((draft) => (
              <OverviewDraftCard
                key={draft.draftId}
                draft={draft}
                selected={draft.threadKey === props.openKey}
                onOpen={() => props.onOpen(draft.threadKey)}
              />
            ))}
            {column.project === null ? null : (
              <NewThreadInColumnButton
                projectName={column.displayName}
                onClick={() => {
                  if (column.project !== null) props.onNewThread(column.project);
                }}
              />
            )}
          </>
        ),
      }))}
    />
  );
}
