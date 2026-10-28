import { memo, type MouseEventHandler, type PointerEventHandler } from "react";
import { ChevronDownIcon, ChevronLeftIcon, Minimize2Icon } from "lucide-react";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import { cn } from "~/lib/utils";
import { useShortcutModifierState } from "../../shortcutModifierState";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { composerFloatingLayerProps } from "./composerEventScope";
import {
  alternateComposerDispatchAction,
  resolveComposerDispatchMode,
} from "@t3tools/client-runtime/state/composer-dispatch";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  canOperateThread: boolean;
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  canInterrupt: boolean;
  followUpBehavior?: "queue" | "steer";
  canSteer?: boolean;
  alternateShortcutLabel?: string | null;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  canResume?: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  isEditingQueuedMessage?: boolean;
  onSubmitMessage?: MouseEventHandler<HTMLButtonElement>;
  onResume?: () => void;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  compactBeforeSendTokens?: number | null;
  keepFullHistory?: boolean;
  onToggleKeepFullHistory?: () => void;
}

const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
  questionIndex: number;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  if (!input.isLastQuestion) {
    return "Next question";
  }
  return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
};

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  canOperateThread,
  pendingAction,
  isRunning,
  canInterrupt,
  followUpBehavior = "steer",
  canSteer = true,
  alternateShortcutLabel = null,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  sendDisabledReason,
  isConnecting,
  isEnvironmentUnavailable,
  isPreparingWorktree,
  hasSendableContent,
  canResume = false,
  preserveComposerFocusOnPointerDown = false,
  isEditingQueuedMessage = false,
  onSubmitMessage,
  onResume,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
  compactBeforeSendTokens = null,
  keepFullHistory = false,
  onToggleKeepFullHistory,
}: ComposerPrimaryActionsProps) {
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const shortcutModifiers = useShortcutModifierState();
  const isQueuing =
    !isEditingQueuedMessage &&
    resolveComposerDispatchMode({
      running: isRunning,
      activeTurnDefault: followUpBehavior,
      canSteer,
      alternateModifier: shortcutModifiers.metaKey || shortcutModifiers.ctrlKey,
    }) === "queue";
  const alternateAction = alternateComposerDispatchAction(followUpBehavior);
  const isSendDisabled = !canOperateThread || sendDisabledReason !== null;

  const renderStopGenerationButton = () => (
    <Tooltip key="interrupt">
      <TooltipTrigger
        info="Interrupt"
        render={
          <Button
            variant="destructive"
            {...pointerFocusProps}
            disabled={!canOperateThread}
            onClick={() => {
              if (canOperateThread) onInterrupt();
            }}
            aria-label="Stop generation"
          />
        }
      >
        Stop
      </TooltipTrigger>
      <TooltipPopup>Interrupt</TooltipPopup>
    </Tooltip>
  );

  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {canInterrupt ? renderStopGenerationButton() : null}
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon"
              variant="outline"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="outline"
              {...pointerFocusProps}
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <Button
          type="submit"
          {...pointerFocusProps}
          disabled={
            !canOperateThread ||
            isEnvironmentUnavailable ||
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
            questionIndex: pendingAction.questionIndex,
          })}
        </Button>
      </div>
    );
  }

  if (showPlanFollowUpPrompt && (promptHasText || !canResume)) {
    if (promptHasText) {
      return (
        <Button
          type="submit"
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </Button>
      );
    }

    return (
      <div
        data-chat-composer-implement-actions="true"
        className="flex items-center justify-end gap-px"
      >
        <Button
          type="submit"
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon"
                aria-label="Implementation actions"
                onMouseDown={
                  preserveComposerFocusOnPointerDown ? (event) => event.preventDefault() : undefined
                }
                disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top" {...composerFloatingLayerProps}>
            <MenuItem
              disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              onClick={() => {
                if (canOperateThread) onImplementPlanInNewThread();
              }}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  if (canInterrupt && !hasSendableContent && !isEditingQueuedMessage) {
    return renderStopGenerationButton();
  }

  const showResume = canResume && !hasSendableContent && !isEditingQueuedMessage;

  const compactTokens =
    compactBeforeSendTokens !== null && !showResume && !isEditingQueuedMessage
      ? formatContextWindowTokens(compactBeforeSendTokens)
      : null;
  const compactsBeforeSend = compactTokens !== null && !keepFullHistory;

  const submitLabel = showResume
    ? "Resume thread"
    : isEditingQueuedMessage
      ? "Update queued message"
      : compactsBeforeSend
        ? "Compact and send"
        : isQueuing
          ? "Queue message"
          : isRunning
            ? "Steer message"
            : "Submit message";
  const submitStatus = isEnvironmentUnavailable
    ? "Environment disconnected"
    : (sendDisabledReason ??
      (isConnecting
        ? "Connecting"
        : isPreparingWorktree
          ? "Preparing worktree"
          : isSendBusy
            ? isEditingQueuedMessage
              ? "Updating queued message"
              : "Submitting message"
            : null));
  const submitTooltip =
    submitStatus ??
    (compactsBeforeSend
      ? `Summarize ${compactTokens} tokens of history, then send`
      : isRunning && !isEditingQueuedMessage && canSteer
        ? `Click to ${followUpBehavior}, Ctrl/⌘-click${alternateShortcutLabel ? ` or ${alternateShortcutLabel}` : ""} to ${alternateAction}`
        : submitLabel);

  const sendText = showResume
    ? "Resume thread"
    : isEditingQueuedMessage
      ? "Update"
      : isQueuing
        ? "Queue"
        : isRunning
          ? "Steer"
          : "Send";

  const sendButton = (
    <Button
      type={showResume ? "button" : "submit"}
      {...pointerFocusProps}
      onClick={showResume ? onResume : onSubmitMessage}
      disabled={
        isSendBusy ||
        isSendDisabled ||
        isConnecting ||
        isEnvironmentUnavailable ||
        (!hasSendableContent && !showResume)
      }
      aria-label={submitStatus ?? submitLabel}
    >
      {isConnecting || isSendBusy ? <Spinner size="sm" aria-hidden="true" /> : null}
      {sendText}
    </Button>
  );

  const submit = (
    <Tooltip key="submit">
      <TooltipTrigger info={submitTooltip} render={<span className="inline-flex" />}>
        {sendButton}
      </TooltipTrigger>
      <TooltipPopup>{submitTooltip}</TooltipPopup>
    </Tooltip>
  );
  if (compactTokens === null) return submit;

  return (
    <div data-chat-composer-compact-send="true" className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          info={`${
            keepFullHistory
              ? `Next send keeps all ${compactTokens} tokens.`
              : `Next send compacts ${compactTokens} tokens first.`
          } ${keepFullHistory ? "Click to compact first" : "Click to keep full history"}`}
          render={
            <button
              type="button"
              className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-(--control-radius) px-2 font-medium text-base text-foreground/80 tabular-nums outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 sm:text-sm aria-pressed:bg-accent/60 aria-pressed:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:text-muted-foreground"
              {...pointerFocusProps}
              aria-pressed={!keepFullHistory}
              aria-label={`Compact ${compactTokens} tokens of history before sending`}
              disabled={!canOperateThread}
              onClick={onToggleKeepFullHistory}
            />
          }
        >
          <Minimize2Icon aria-hidden="true" />
          {keepFullHistory ? "Keep" : "Compact"}
          <span className="text-muted-foreground">{compactTokens}</span>
        </TooltipTrigger>
        <TooltipPopup>
          <div>
            {keepFullHistory
              ? `Next send keeps all ${compactTokens} tokens.`
              : `Next send compacts ${compactTokens} tokens first.`}
          </div>
          <div>{keepFullHistory ? "Click to compact first" : "Click to keep full history"}</div>
        </TooltipPopup>
      </Tooltip>
      {submit}
    </div>
  );
});
