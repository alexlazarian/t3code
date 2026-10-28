import { SAFE_SEND_DELAY_MS } from "@t3tools/contracts/settings";
import { create } from "zustand";

export type SafeSendOutcome = "send" | "undo";

interface SafeSendState {
  /** Epoch ms each waiting message goes out at, keyed by message id. */
  readonly sendAtByMessageId: Readonly<Record<string, number>>;
}

export const useSafeSendStore = create<SafeSendState>(() => ({ sendAtByMessageId: {} }));

// Module-level so a wait survives the composer unmounting when the user navigates away.
const waits = new Map<
  string,
  {
    readonly timer: ReturnType<typeof setTimeout>;
    readonly settle: (outcome: SafeSendOutcome) => void;
  }
>();

function settle(messageId: string, outcome: SafeSendOutcome): boolean {
  const wait = waits.get(messageId);
  if (wait === undefined) return false;
  waits.delete(messageId);
  clearTimeout(wait.timer);
  useSafeSendStore.setState((state) => {
    const { [messageId]: _settled, ...rest } = state.sendAtByMessageId;
    return { sendAtByMessageId: rest };
  });
  wait.settle(outcome);
  return true;
}

/** Holds one message for `delayMs`; resolves "undo" if `undoSafeSend` runs first. */
export function waitForSafeSend(messageId: string, delayMs: number): Promise<SafeSendOutcome> {
  settle(messageId, "undo");
  return new Promise((resolve) => {
    const timer = setTimeout(() => settle(messageId, "send"), delayMs);
    waits.set(messageId, { timer, settle: resolve });
    useSafeSendStore.setState((state) => ({
      sendAtByMessageId: { ...state.sendAtByMessageId, [messageId]: Date.now() + delayMs },
    }));
  });
}

/** False once the message already went out. */
export function undoSafeSend(messageId: string): boolean {
  return settle(messageId, "undo");
}

export function useSafeSendDeadline(messageId: string): number | null {
  return useSafeSendStore((state) => state.sendAtByMessageId[messageId] ?? null);
}

/** Whole seconds left, clamped to the delay so a client clock ahead of the server's never shows more. */
export function safeSendSecondsLeft(sendAtMs: number, nowMs: number): number {
  return Math.min(
    Math.ceil(SAFE_SEND_DELAY_MS / 1000),
    Math.max(0, Math.ceil((sendAtMs - nowMs) / 1000)),
  );
}
