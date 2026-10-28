import {
  FileDiff,
  Files,
  Globe2,
  PanelRightIcon,
  SquareMenuIcon,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { Maximize2, Minimize2 } from "lucide";
import { MorphIcon } from "~/components/MorphIcon";
import { memo, type RefObject } from "react";

import { cn } from "~/lib/utils";

import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { RightPanelKind } from "../../rightPanelStore";
import { resolveThreadHeaderTools } from "./threadHeaderTools.logic";

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

function HeaderToolButton(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly info: string;
  readonly on: boolean;
  readonly onToggle: () => void;
  readonly rightPanelToggle?: boolean;
}) {
  const Icon = props.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        info={props.info}
        render={
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label={props.label}
            aria-pressed={props.on}
            data-pressed={props.on ? "" : undefined}
            onClick={props.onToggle}
            data-right-panel-toggle={props.rightPanelToggle ? "" : undefined}
          >
            <Icon aria-hidden />
          </Button>
        }
      />
      <TooltipPopup side="bottom">{props.info}</TooltipPopup>
    </Tooltip>
  );
}

export interface ThreadHeaderToolsProps {
  readonly threadPanelOpen: boolean;
  readonly threadPanelPopoverHandle: ReturnType<typeof PopoverCreateHandle>;
  readonly threadPanelAnchorRef: RefObject<HTMLButtonElement | null>;
  readonly threadPanelShortcutLabel: string | null;
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

/** The thread header's icon buttons: thread details, right panel surfaces, terminal drawer, whole right panel. Unavailable ones are not shown. */
export const ThreadHeaderTools = memo(function ThreadHeaderTools({
  threadPanelAnchorRef,
  ...props
}: ThreadHeaderToolsProps) {
  const { diff, preview, files, pullRequests } = resolveThreadHeaderTools(props);
  const detailsLabel = withShortcut("Toggle thread details", props.threadPanelShortcutLabel);
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 [-webkit-app-region:no-drag]"
      data-thread-header-tools
    >
      <Tooltip>
        <TooltipTrigger
          info={detailsLabel}
          render={
            <PopoverTrigger
              handle={props.threadPanelPopoverHandle}
              render={
                <Button
                  ref={threadPanelAnchorRef}
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label="Details"
                  aria-pressed={props.threadPanelOpen}
                  data-pressed={props.threadPanelOpen ? "" : undefined}
                >
                  <SquareMenuIcon aria-hidden />
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="bottom">{detailsLabel}</TooltipPopup>
      </Tooltip>
      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
      {diff.visible ? (
        <HeaderToolButton
          icon={FileDiff}
          label="Diff"
          info={withShortcut("Toggle diff panel", props.diffShortcutLabel)}
          on={diff.on}
          onToggle={props.onToggleDiff}
        />
      ) : null}
      {preview.visible ? (
        <HeaderToolButton
          icon={Globe2}
          label="Preview"
          info={withShortcut("Toggle preview panel", props.previewShortcutLabel)}
          on={preview.on}
          onToggle={props.onTogglePreview}
        />
      ) : null}
      {files.visible ? (
        <HeaderToolButton
          icon={Files}
          label="Files"
          info="Workspace files"
          on={files.on}
          onToggle={props.onToggleFiles}
        />
      ) : null}
      {pullRequests.visible ? (
        <HeaderToolButton
          icon={PullRequestGlyph.link}
          label="Pull requests"
          info="Linked pull requests"
          on={pullRequests.on}
          onToggle={props.onTogglePullRequests}
        />
      ) : null}
      {props.terminalAvailable ? (
        <HeaderToolButton
          icon={TerminalSquare}
          label="Terminal"
          info={withShortcut("Toggle terminal drawer", props.terminalShortcutLabel)}
          on={props.terminalOpen}
          onToggle={props.onToggleTerminal}
        />
      ) : null}
      {props.rightPanelAvailable || props.rightPanelOpen ? (
        <HeaderToolButton
          icon={PanelRightIcon}
          label="Panel"
          info={withShortcut("Toggle right panel", props.rightPanelShortcutLabel)}
          on={props.rightPanelOpen}
          onToggle={props.onToggleRightPanel}
          rightPanelToggle
        />
      ) : null}
    </div>
  );
});
