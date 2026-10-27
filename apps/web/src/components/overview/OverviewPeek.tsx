import type { ScopedThreadRef } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import {
  buildPendingUserInputAnswers,
  findFirstUnansweredPendingUserInputQuestionIndex,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { ComposerPendingApprovalActions } from "../chat/ComposerPendingApprovalActions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverClose, PopoverPopup } from "../ui/popover";
import { toastManager } from "../ui/toast";
import type { OverviewPeekAction } from "./OverviewPeek.logic";
import { useOverviewThreadActions } from "./useOverviewThreadActions";

type InputAction = Extract<OverviewPeekAction, { kind: "input" }>;

const MESSAGE_PREVIEW_CHARS = 600;

export function OverviewPeek(props: {
  readonly threadRef: ScopedThreadRef;
  readonly projectName: string;
  readonly getCard: () => HTMLElement | null;
  readonly onOpenThread: () => void;
  readonly onClose: () => void;
}) {
  const thread = useOverviewThreadActions(props.threadRef);
  const [reply, setReply] = useState("");
  const [inputDrafts, setInputDrafts] = useState<{
    readonly requestId: string | null;
    readonly drafts: Record<string, PendingUserInputDraftAnswer>;
  }>({ requestId: null, drafts: {} });
  const primary = thread.actions.find((action) => action.kind !== "reply");
  const inputAction = primary?.kind === "input" ? primary : null;
  const drafts =
    inputAction !== null && inputDrafts.requestId === inputAction.requestId
      ? inputDrafts.drafts
      : {};
  const canReply = thread.actions.some((action) => action.kind === "reply");
  const lastAssistantText = thread.projection?.messages
    .findLast((message) => message.role === "assistant" && message.text.trim() !== "")
    ?.text.slice(0, MESSAGE_PREVIEW_CHARS);

  const submitAnswer = async (action: InputAction, text: string) => {
    let next = drafts;
    if (text !== "") {
      const question =
        action.questions[
          findFirstUnansweredPendingUserInputQuestionIndex(action.questions, drafts)
        ];
      if (question !== undefined && question.allowCustomAnswer !== false) {
        next = {
          ...drafts,
          [question.id]: setPendingUserInputCustomAnswer(drafts[question.id], text, question),
        };
      }
    }
    const answers = buildPendingUserInputAnswers(action.questions, next);
    if (answers === null) {
      toastManager.add({ type: "info", title: "Pick an option or type an answer." });
      return false;
    }
    return thread.answer(action.requestId, answers);
  };

  const submitReply = async () => {
    const text = reply.trim();
    if (inputAction?.canRespond === false) return;
    const sent =
      inputAction !== null
        ? await submitAnswer(inputAction, text)
        : text !== "" && (await thread.reply(text));
    if (sent) setReply("");
  };

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submitReply();
  };

  return (
    <Popover
      open
      onOpenChange={(open, details) => {
        if (open) return;
        // The card's own click toggles the peek; closing here too would close and reopen it.
        const target = details.reason === "outside-press" ? details.event.target : null;
        if (target instanceof Node && props.getCard()?.contains(target)) return;
        props.onClose();
      }}
    >
      <PopoverPopup
        anchor={props.getCard}
        finalFocus={props.getCard}
        side="bottom"
        align="start"
        width="md"
        padding="none"
        aria-label={thread.shell?.title ?? "Thread"}
      >
        <div className="flex items-center gap-1.5 border-b border-border ps-2 pe-0.5">
          <span className="min-w-0 flex-1 truncate py-1 text-xs font-semibold">
            {thread.shell?.title}
          </span>
          <PopoverClose render={<Button size="icon-xs" variant="ghost" aria-label="Close peek" />}>
            <XIcon />
          </PopoverClose>
        </div>
        <div className="flex flex-col gap-1.5 px-2 py-1.5 text-xs">
          {thread.projection === null ? null : (
            <p className="line-clamp-4 wrap-anywhere text-muted-foreground">
              {lastAssistantText ?? "No replies yet."}
            </p>
          )}
          {primary === undefined ? null : (
            <OverviewPeekPrimaryAction
              action={primary}
              drafts={drafts}
              busy={thread.busy}
              onToggleOption={(questionId, value) => {
                if (inputAction === null) return;
                const question = inputAction.questions.find((entry) => entry.id === questionId);
                if (question === undefined) return;
                setInputDrafts({
                  requestId: inputAction.requestId,
                  drafts: {
                    ...drafts,
                    [questionId]: togglePendingUserInputOptionSelection(
                      question,
                      drafts[questionId],
                      value,
                    ),
                  },
                });
              }}
              onSubmitAnswer={() => void submitReply()}
              thread={thread}
            />
          )}
          {canReply ? (
            <Input
              size="compact"
              value={reply}
              disabled={thread.busy || inputAction?.canRespond === false}
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={handleReplyKeyDown}
              aria-label={inputAction !== null ? "Answer" : "Reply"}
              placeholder={
                inputAction !== null
                  ? "Or type an answer, Enter to submit"
                  : primary?.kind === "stop"
                    ? "Follow-up, Enter to send"
                    : "Reply, Enter to send"
              }
            />
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 border-t border-border px-2 py-1">
          <Button size="xs" variant="outline" onClick={props.onOpenThread}>
            Open in List view
          </Button>
          <span className="ms-auto truncate text-2xs text-muted-foreground">
            {props.projectName}
          </span>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function OverviewPeekPrimaryAction(props: {
  readonly action: Exclude<OverviewPeekAction, { kind: "reply" }>;
  readonly drafts: Record<string, PendingUserInputDraftAnswer>;
  readonly busy: boolean;
  readonly onToggleOption: (questionId: string, value: string) => void;
  readonly onSubmitAnswer: () => void;
  readonly thread: ReturnType<typeof useOverviewThreadActions>;
}) {
  const { action, thread, busy } = props;
  switch (action.kind) {
    case "approval":
      return (
        <div className="flex flex-wrap gap-1">
          <ComposerPendingApprovalActions
            requestId={action.requestId}
            isResponding={busy}
            canRespond={action.canRespond}
            onRespondToApproval={thread.respondToApproval}
          />
        </div>
      );
    case "input":
      return (
        <div className="flex flex-col gap-1.5">
          {action.questions.map((question) => {
            const selected = props.drafts[question.id]?.selectedOptionValues ?? [];
            return (
              <div key={question.id} className="flex flex-col gap-1">
                <p className="wrap-anywhere">{question.question}</p>
                <div className="flex flex-wrap gap-1">
                  {question.options.map((option) => {
                    const value = option.value ?? option.label;
                    const isSelected = selected.includes(value);
                    return (
                      <Button
                        key={value}
                        size="xs"
                        variant={isSelected ? "secondary" : "outline"}
                        aria-pressed={isSelected}
                        disabled={busy || !action.canRespond}
                        onClick={() => props.onToggleOption(question.id, value)}
                      >
                        <span className="max-w-60 truncate">{option.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex gap-1">
            <Button size="xs" disabled={busy || !action.canRespond} onClick={props.onSubmitAnswer}>
              Submit
            </Button>
            {action.dismissible ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => void thread.dismiss(action.requestId)}
              >
                Dismiss
              </Button>
            ) : null}
          </div>
        </div>
      );
    case "implement":
      return (
        <div className="flex flex-col gap-1">
          <p>Plan ready.</p>
          <div className="flex gap-1">
            <Button size="xs" disabled={busy} onClick={() => void thread.implement(action.planId)}>
              Implement
            </Button>
          </div>
        </div>
      );
    case "stop":
      return (
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="destructive-outline"
            disabled={busy}
            onClick={() => void thread.stop()}
          >
            Stop
          </Button>
        </div>
      );
    case "resume":
      return (
        <div className="flex gap-1">
          <Button
            size="xs"
            disabled={busy}
            onClick={() => void thread.resume(action.mode, action.runId)}
          >
            Resume thread
          </Button>
        </div>
      );
  }
}
