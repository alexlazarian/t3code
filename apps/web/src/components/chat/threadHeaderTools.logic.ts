import type { RightPanelKind } from "../../rightPanelStore";

export interface ThreadHeaderToolState {
  readonly on: boolean;
  readonly disabled: boolean;
}

/** Which right panel surface buttons read as on, and which can be pressed. An on button can always close. */
export function resolveThreadHeaderTools(input: {
  /** The open panel's active surface kind; null while the panel is closed. */
  readonly activeSurfaceKind: RightPanelKind | null;
  readonly isServerThread: boolean;
  readonly isGitRepo: boolean;
  readonly hasProject: boolean;
  readonly browserAvailable: boolean;
  readonly canOperatePreview: boolean;
  readonly pullRequestsAvailable: boolean;
}): {
  readonly diff: ThreadHeaderToolState;
  readonly preview: ThreadHeaderToolState;
  readonly files: ThreadHeaderToolState;
  readonly pullRequests: ThreadHeaderToolState;
} {
  const kind = input.activeSurfaceKind;
  const diffOn = kind === "diff";
  const previewOn = kind === "preview" && input.browserAvailable;
  const filesOn = kind === "files";
  const pullRequestsOn = kind === "pull-requests";
  return {
    diff: { on: diffOn, disabled: !input.isServerThread || (!diffOn && !input.isGitRepo) },
    preview: {
      on: previewOn,
      disabled: !input.browserAvailable || (!previewOn && !input.canOperatePreview),
    },
    files: { on: filesOn, disabled: !filesOn && !input.hasProject },
    pullRequests: { on: pullRequestsOn, disabled: !pullRequestsOn && !input.pullRequestsAvailable },
  };
}
