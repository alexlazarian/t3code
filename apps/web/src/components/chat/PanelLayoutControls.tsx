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
import { memo, type ReactElement, type ReactNode } from "react";

import { cn } from "~/lib/utils";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ThreadHeaderToolState } from "./threadHeaderTools.logic";

export interface PanelLayoutControlsProps {
  showThreadPanelControl?: boolean;
  showTerminalControl?: boolean;
  showRightPanelControl?: boolean;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalShortcutLabel: string | null;
  threadPanelOpen: boolean;
  threadPanelPresentation: ThreadPanelPresentation;
  threadPanelPopoverHandle?: ReturnType<typeof PopoverCreateHandle>;
  threadPanelShortcutLabel: string | null;
  rightPanelAvailable: boolean;
  rightPanelOpen: boolean;
  rightPanelShortcutLabel: string | null;
  rightPanelUnavailableLabel?: string;
  onToggleTerminal: () => void;
  onToggleThreadPanel: () => void;
  onToggleRightPanel: () => void;
}

export const PanelLayoutControls = memo(function PanelLayoutControls({
  showThreadPanelControl = true,
  showTerminalControl = true,
  showRightPanelControl = true,
  terminalAvailable,
  terminalOpen,
  terminalShortcutLabel,
  threadPanelOpen,
  threadPanelPresentation,
  threadPanelPopoverHandle,
  threadPanelShortcutLabel,
  rightPanelAvailable,
  rightPanelOpen,
  rightPanelShortcutLabel,
  rightPanelUnavailableLabel = "Right panel is unavailable",
  onToggleTerminal,
  onToggleThreadPanel,
  onToggleRightPanel,
}: PanelLayoutControlsProps) {
  const threadPanelToggle = (
    <Toggle
      className="relative shrink-0 [-webkit-app-region:no-drag]"
      pressed={threadPanelOpen}
      aria-label="Toggle thread details panel"
      variant="ghost"
      size="sm"
    >
      <SquareMenuIcon className="size-4" />
    </Toggle>
  );
  const threadPanelLabel = `Toggle thread details${threadPanelShortcutLabel ? ` (${threadPanelShortcutLabel})` : ""}`;
  const terminalLabel = terminalAvailable
    ? `Toggle terminal drawer${terminalShortcutLabel ? ` (${terminalShortcutLabel})` : ""}`
    : "Terminal drawer is unavailable";
  const rightPanelLabel = rightPanelAvailable
    ? `Toggle right panel${rightPanelShortcutLabel ? ` (${rightPanelShortcutLabel})` : ""}`
    : rightPanelUnavailableLabel;
  const threadPanelTooltip = (trigger: ReactElement) => (
    <Tooltip>
      <TooltipTrigger
        info={threadPanelLabel}
        render={trigger}
        {...(threadPanelPresentation === "popover" ? {} : { onClick: onToggleThreadPanel })}
      />
      <TooltipPopup side="bottom">{threadPanelLabel}</TooltipPopup>
    </Tooltip>
  );

  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-panel-layout-controls
    >
      {showThreadPanelControl
        ? threadPanelPresentation === "popover"
          ? threadPanelTooltip(
              <PopoverTrigger handle={threadPanelPopoverHandle} render={threadPanelToggle} />,
            )
          : threadPanelTooltip(threadPanelToggle)
        : null}
      {showTerminalControl ? (
        <Tooltip>
          <TooltipTrigger info={terminalLabel} render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={terminalOpen}
              onPressedChange={onToggleTerminal}
              aria-label="Toggle terminal drawer"
              variant="ghost"
              size="sm"
              disabled={!terminalAvailable}
            >
              <PanelBottomIcon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">{terminalLabel}</TooltipPopup>
        </Tooltip>
      ) : null}
      {showRightPanelControl ? (
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
      ) : null}
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

/** The page header's top-right panel controls, with the maximize toggle while the panel is open. */
export function WorkspaceTitlebarControls(props: {
  readonly showMaximizeControl: boolean;
  readonly rightPanelOpen: boolean;
  readonly animationsActive: boolean;
  readonly maximized: boolean;
  readonly onToggleMaximized: () => void;
  readonly children: ReactNode;
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
      <div className="pointer-events-auto flex h-full items-center">{props.children}</div>
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
  readonly diff: ThreadHeaderToolState;
  readonly diffShortcutLabel: string | null;
  readonly onToggleDiff: () => void;
  readonly preview: ThreadHeaderToolState;
  readonly previewShortcutLabel: string | null;
  readonly onTogglePreview: () => void;
  readonly files: ThreadHeaderToolState;
  readonly onToggleFiles: () => void;
  readonly pullRequests: ThreadHeaderToolState;
  readonly onTogglePullRequests: () => void;
  readonly terminalAvailable: boolean;
  readonly terminalOpen: boolean;
  readonly terminalShortcutLabel: string | null;
  readonly onToggleTerminal: () => void;
}

/** The thread header's panel buttons: thread details, right panel surfaces, terminal drawer. */
export const ThreadHeaderTools = memo(function ThreadHeaderTools(props: ThreadHeaderToolsProps) {
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
          props.diff.disabled
            ? "Diff is available for Git repositories"
            : withShortcut("Toggle diff panel", props.diffShortcutLabel)
        }
        state={props.diff}
        onToggle={props.onToggleDiff}
      />
      <HeaderToolButton
        icon={Globe2}
        label="Preview"
        info={
          props.preview.disabled
            ? "Preview is unavailable"
            : withShortcut("Toggle preview panel", props.previewShortcutLabel)
        }
        state={props.preview}
        onToggle={props.onTogglePreview}
      />
      <HeaderToolButton
        icon={Files}
        label="Files"
        info={
          props.files.disabled ? "Files are available when a project is open" : "Workspace files"
        }
        state={props.files}
        onToggle={props.onToggleFiles}
      />
      <HeaderToolButton
        icon={PullRequestGlyph.link}
        label="Pull requests"
        info={
          props.pullRequests.disabled ? "No linked pull requests available" : "Linked pull requests"
        }
        state={props.pullRequests}
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
    </div>
  );
});
