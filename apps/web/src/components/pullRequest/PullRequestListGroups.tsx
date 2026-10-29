import type { EnvironmentId, PullRequestAction } from "@t3tools/contracts";
import type { RefCallback } from "react";

import { cn } from "~/lib/utils";
import { SectionStrip } from "../SectionStrip";
import {
  pullRequestEntryKey,
  scorePullRequestMatch,
  type EnvironmentPullRequestEntry,
  type PullRequestGroup,
} from "./pullRequestList.logic";
import { PullRequestRow, type PullRequestRowTarget } from "./PullRequestRow";
import {
  PullRequestSpeedModeProvider,
  type PullRequestSpeedActionResult,
} from "./PullRequestSpeedActions";

const MATCHED_ELSEWHERE_SCORE = 10;

function PullRequestGroupHeader({
  group,
}: {
  group: { label: string; entries: ReadonlyArray<unknown> };
}) {
  return (
    <SectionStrip
      title={
        <span role="heading" aria-level={2}>
          {group.label}
        </span>
      }
      count={group.entries.length}
    />
  );
}

export function PullRequestListGroups({
  groups,
  environmentLabels,
  query,
  selected,
  showProvider,
  statsRef,
  onSelect,
  hostActionsOf,
  onActed,
  closingKeys,
  sweepingKeys,
  onCloseSweepStart,
}: {
  groups: ReadonlyArray<PullRequestGroup<EnvironmentPullRequestEntry>>;
  /** Only when rows come from more than one server, so each says which. */
  environmentLabels: ReadonlyMap<EnvironmentId, string> | null;
  query: string;
  selected: {
    readonly environmentId: string | undefined;
    readonly repository: string;
    readonly host: string | undefined;
    readonly number: number;
  } | null;
  showProvider: boolean;
  statsRef: RefCallback<HTMLDivElement>;
  onSelect: (entry: PullRequestRowTarget) => void;
  hostActionsOf: (entry: EnvironmentPullRequestEntry) => ReadonlySet<PullRequestAction>;
  onActed: (result: PullRequestSpeedActionResult) => void;
  closingKeys: ReadonlySet<string>;
  sweepingKeys: ReadonlySet<string>;
  onCloseSweepStart: (entry: EnvironmentPullRequestEntry, event: PointerEvent) => void;
}) {
  return (
    <PullRequestSpeedModeProvider>
      <div className={cn(sweepingKeys.size > 0 && "**:pointer-events-none")}>
        {groups.map((group) => (
          <div key={group.key}>
            {group.label ? <PullRequestGroupHeader group={group} /> : null}
            {group.entries.map((entry) => {
              const entryKey = pullRequestEntryKey(entry);
              const environmentLabel = environmentLabels?.get(entry.environmentId);
              return (
                <PullRequestRow
                  key={entryKey}
                  statsKey={entryKey}
                  statsRef={statsRef}
                  entry={entry}
                  showProjectTitle
                  showProvider={showProvider}
                  {...(environmentLabel !== undefined ? { environmentLabel } : {})}
                  matchedElsewhere={
                    query.length > 0 &&
                    scorePullRequestMatch(entry, query) <= MATCHED_ELSEWHERE_SCORE
                  }
                  selected={
                    selected?.environmentId === entry.environmentId &&
                    selected.repository === entry.repository &&
                    selected.host?.toLowerCase() === entry.host.toLowerCase() &&
                    selected.number === entry.number
                  }
                  onSelect={onSelect}
                  hostActions={hostActionsOf(entry)}
                  onActed={onActed}
                  closing={closingKeys.has(entryKey)}
                  sweeping={sweepingKeys.has(entryKey)}
                  onCloseSweepStart={onCloseSweepStart}
                />
              );
            })}
          </div>
        ))}
      </div>
    </PullRequestSpeedModeProvider>
  );
}
