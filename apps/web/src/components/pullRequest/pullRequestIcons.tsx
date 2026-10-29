import {
  GitMergeIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  LayersIcon,
  Link2Icon,
  Unlink2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { PullRequestState } from "@t3tools/contracts";

// GitHub's git-merge-queue Octicon (MIT); lucide has no merge queue glyph.
function GitMergeQueueIcon(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      width={16}
      height={16}
      {...(props as React.SVGProps<SVGSVGElement>)}
    >
      <path d="M3.75 4.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM3 7.75a.75.75 0 0 1 1.5 0v2.878a2.251 2.251 0 1 1-1.5 0Zm.75 5.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm5-7.75a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm5.75 2.5a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-1.5 0a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
    </svg>
  );
}

export const PullRequestGlyph = {
  pullRequest: GitPullRequestArrowIcon,
  reopen: GitPullRequestArrowIcon,
  draft: GitPullRequestDraftIcon,
  closed: GitPullRequestClosedIcon,
  merged: GitMergeIcon,
  conflicting: TriangleAlertIcon,
  stack: LayersIcon,
  queued: GitMergeQueueIcon,
  link: Link2Icon,
  unlink: Unlink2Icon,
} as const;

export type PullRequestGlyphIcon = (typeof PullRequestGlyph)[keyof typeof PullRequestGlyph];

export interface PullRequestStatePresentation {
  readonly label: string;
  readonly toneClassName: string;
  readonly Icon: PullRequestGlyphIcon;
}

export const PULL_REQUEST_STATE_PRESENTATION = {
  open: {
    label: "Open",
    toneClassName: "text-emerald-600 dark:text-emerald-300/90",
    Icon: PullRequestGlyph.pullRequest,
  },
  draft: {
    label: "Draft",
    toneClassName: "text-zinc-500 dark:text-zinc-400/80",
    Icon: PullRequestGlyph.draft,
  },
  closed: {
    label: "Closed",
    toneClassName: "text-red-600 dark:text-red-300/90",
    Icon: PullRequestGlyph.closed,
  },
  merged: {
    label: "Merged",
    toneClassName: "text-violet-600 dark:text-violet-300/90",
    Icon: PullRequestGlyph.merged,
  },
} as const satisfies Record<PullRequestState | "draft", PullRequestStatePresentation>;
