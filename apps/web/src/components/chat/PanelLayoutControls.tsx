import {
  FileDiff,
  Files,
  Globe2,
  PanelBottomIcon,
  PanelRightIcon,
  SquareMenuIcon,
  type LucideIcon,
} from "lucide-react";
import { Maximize2, Minimize2 } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { memo } from "react";

import { cn } from "~/lib/utils";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { RightPanelKind } from "../../rightPanelStore";
import { resolveThreadHeaderTools, type ThreadHeaderToolState } from "./threadHeaderTools.logic";

export interface PanelLayoutControlsProps {
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  rightPanelUnavailableLabel?: string;
  onToggleRightPanel: () => void;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel = "Right panel is unavailable",
  onToggleRightPanel,
}: PanelLayoutControlsProps) {
  const rightPanelLabel = rightPanelAvailable
    ? `Toggle right panel${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}`
    : rightPanelUnavailableLabel;

  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      <Tooltip>
        <TooltipTrigger info={rightPanelLabel} render={<span className="flex shrink-0" />}>
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={rightPanelOpen}
            onPressedChange={onToggleRightPanel}
            aria-label="Toggle right panel"
            data-right-panel-toggle
            variant="ghost"
            size="sm"
            disabled={!rightPanelAvailable}
          >
            <PanelRightIcon className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipPopup side="bottom">{rightPanelLabel}</TooltipPopup>
      </Tooltip>
    </div>
  );
});

export const RightPanelMaximizeControl = memo(function RightPanelMaximizeControl({
  maximized,
  onToggle,
}: {
  maximized: boolean;
  onToggle: () => void;
}) {
  const label = maximized ? "Restore panel size" : "Maximize panel";
  return (
    <Tooltip>
      <TooltipTrigger
        info={label}
        render={
          <Toggle
            className="shrink-0 [-webkit-app-region:no-drag]"
            pressed={maximized}
            onPressedChange={onToggle}
            aria-label={label}
            variant="ghost"
            size="sm"
          >
            <MorphIcon className="size-4" icon={maximized ? Minimize2 : Maximize2} />
          </Toggle>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
});

/** The maximize toggle floating at the open inline right panel's top-right. */
export function FloatingRightPanelMaximizeControl(props: {
  readonly showMaximizeControl: boolean;
  readonly rightPanelOpen: boolean;
  readonly animationsActive: boolean;
  readonly maximized: boolean;
  readonly onToggleMaximized: () => void;
}) {
  return (
    <div
      className="pointer-events-none fixed top-(--app-top-bar-bottom) right-[var(--workspace-controls-right)] z-50 mr-px flex h-[var(--workspace-topbar-height)] items-center gap-1 [-webkit-app-region:no-drag]"
      data-workspace-titlebar-controls
    >
      {props.showMaximizeControl ? (
        <span
          aria-hidden={!props.rightPanelOpen}
          className={cn(
            "flex shrink-0",
            props.animationsActive &&
              "motion-safe:transition-opacity motion-safe:duration-(--panel-animation-duration) motion-safe:ease-out",
            props.rightPanelOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none absolute right-full mr-1 opacity-0",
          )}
          inert={!props.rightPanelOpen}
        >
          <RightPanelMaximizeControl
            maximized={props.maximized}
            onToggle={props.onToggleMaximized}
          />
        </span>
      ) : null}
    </div>
  );
}

function withShortcut(label: string, shortcut: string | null) {
  return shortcut ? `${label} (${shortcut})` : label;
}

/** Label below the header's container breakpoint, icon above it; the tooltip carries both. */
function HeaderToolContent({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon aria-hidden className="@3xl/thread-header:hidden" />
      <span className="hidden @3xl/thread-header:inline">{label}</span>
    </>
  );
}

function HeaderToolButton(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly info: string;
  readonly state: ThreadHeaderToolState;
  readonly onToggle: () => void;
  readonly rightPanelToggle?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger info={props.info} render={<span className="flex shrink-0" />}>
        <Button
          variant="ghost-muted"
          size="xs"
          aria-label={props.label}
          aria-pressed={props.state.on}
          data-pressed={props.state.on ? "" : undefined}
          disabled={props.state.disabled}
          onClick={props.onToggle}
          data-right-panel-toggle={props.rightPanelToggle ? "" : undefined}
        >
          <HeaderToolContent icon={props.icon} label={props.label} />
        </Button>
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.info}</TooltipPopup>
    </Tooltip>
  );
}

export interface ThreadHeaderToolsProps {
  readonly threadPanelOpen: boolean;
  readonly threadPanelPresentation: ThreadPanelPresentation;
  readonly threadPanelPopoverHandle: ReturnType<typeof PopoverCreateHandle>;
  readonly threadPanelShortcutLabel: string | null;
  readonly onToggleThreadPanel: () => void;
  readonly activeSurfaceKind: RightPanelKind | null;
  readonly isServerThread: boolean;
  readonly isGitRepo: boolean;
  readonly hasProject: boolean;
  readonly browserAvailable: boolean;
  readonly canOperatePreview: boolean;
  readonly pullRequestsAvailable: boolean;
  readonly diffShortcutLabel: string | null;
  readonly onToggleDiff: () => void;
  readonly previewShortcutLabel: string | null;
  readonly onTogglePreview: () => void;
  readonly onToggleFiles: () => void;
  readonly onTogglePullRequests: () => void;
  readonly terminalAvailable: boolean;
  readonly terminalOpen: boolean;
  readonly terminalShortcutLabel: string | null;
  readonly onToggleTerminal: () => void;
  readonly rightPanelAvailable: boolean;
  readonly rightPanelOpen: boolean;
  readonly rightPanelShortcutLabel: string | null;
  readonly onToggleRightPanel: () => void;
}

/** The thread header's panel buttons: thread details, right panel surfaces, terminal drawer, whole right panel. */
export const ThreadHeaderTools = memo(function ThreadHeaderTools(props: ThreadHeaderToolsProps) {
  const { diff, preview, files, pullRequests } = resolveThreadHeaderTools(props);
  const detailsLabel = withShortcut("Toggle thread details", props.threadPanelShortcutLabel);
  const detailsButton = (
    <Button
      variant="ghost-muted"
      size="xs"
      aria-label="Details"
      aria-pressed={props.threadPanelOpen}
      data-pressed={props.threadPanelOpen ? "" : undefined}
    >
      <HeaderToolContent icon={SquareMenuIcon} label="Details" />
    </Button>
  );
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 [-webkit-app-region:no-drag]"
      data-thread-header-tools
    >
      <Tooltip>
        <TooltipTrigger
          info={detailsLabel}
          render={
            props.threadPanelPresentation === "popover" ? (
              <PopoverTrigger handle={props.threadPanelPopoverHandle} render={detailsButton} />
            ) : (
              detailsButton
            )
          }
          {...(props.threadPanelPresentation === "popover"
            ? {}
            : { onClick: props.onToggleThreadPanel })}
        />
        <TooltipPopup side="bottom">{detailsLabel}</TooltipPopup>
      </Tooltip>
      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
      <HeaderToolButton
        icon={FileDiff}
        label="Diff"
        info={
          diff.disabled
            ? "Diff is available for Git repositories"
            : withShortcut("Toggle diff panel", props.diffShortcutLabel)
        }
        state={diff}
        onToggle={props.onToggleDiff}
      />
      <HeaderToolButton
        icon={Globe2}
        label="Preview"
        info={
          preview.disabled
            ? "Preview is unavailable"
            : withShortcut("Toggle preview panel", props.previewShortcutLabel)
        }
        state={preview}
        onToggle={props.onTogglePreview}
      />
      <HeaderToolButton
        icon={Files}
        label="Files"
        info={files.disabled ? "Files are available when a project is open" : "Workspace files"}
        state={files}
        onToggle={props.onToggleFiles}
      />
      <HeaderToolButton
        icon={PullRequestGlyph.link}
        label="Pull requests"
        info={pullRequests.disabled ? "No linked pull requests available" : "Linked pull requests"}
        state={pullRequests}
        onToggle={props.onTogglePullRequests}
      />
      <HeaderToolButton
        icon={PanelBottomIcon}
        label="Terminal"
        info={
          props.terminalAvailable
            ? withShortcut("Toggle terminal drawer", props.terminalShortcutLabel)
            : "Terminal drawer is unavailable"
        }
        state={{ on: props.terminalOpen, disabled: !props.terminalAvailable }}
        onToggle={props.onToggleTerminal}
      />
      <HeaderToolButton
        icon={PanelRightIcon}
        label="Panel"
        info={
          props.rightPanelAvailable || props.rightPanelOpen
            ? withShortcut("Toggle right panel", props.rightPanelShortcutLabel)
            : "Right panel is unavailable"
        }
        state={{
          on: props.rightPanelOpen,
          disabled: !props.rightPanelAvailable && !props.rightPanelOpen,
        }}
        onToggle={props.onToggleRightPanel}
        rightPanelToggle
      />
    </div>
  );
});
