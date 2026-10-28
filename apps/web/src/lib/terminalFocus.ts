import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";

export function isTerminalFocused(): boolean {
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLElement &&
    activeElement.isConnected &&
    activeElement.closest("[data-terminal-owner]") !== null
  );
}

interface TerminalFocusTarget {
  readonly threadRef: ScopedThreadRef;
  readonly terminalId: string;
  /** Returns false when the target cannot take focus yet (hidden, or no operate grant). */
  readonly focus: () => boolean;
}

const focusTargets = new Set<TerminalFocusTarget>();
// One request at a time: the newest terminal the user asked for wins, so an
// older request never fires later and steals focus.
let pendingFocus: { readonly threadKey: string; readonly terminalId: string } | null = null;
// The thread ChatView currently shows, and the thread a navigating handler
// asked to focus a terminal in. The mark outlives `pendingFocus`: the new
// thread's viewports mount and consume the handler's request in the commit's
// layout phase, before ChatView's thread-enter effect runs.
let enteredThreadKey: string | null = null;
let navigationRequestThreadKey: string | null = null;

function isPending(threadKey: string, terminalId: string): boolean {
  return pendingFocus?.threadKey === threadKey && pendingFocus.terminalId === terminalId;
}

function focusMountedTarget(threadKey: string, terminalId: string): boolean {
  for (const target of focusTargets) {
    if (
      target.terminalId === terminalId &&
      scopedThreadKey(target.threadRef) === threadKey &&
      target.focus()
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Focuses a thread's terminal when its viewport can take focus, or once it can.
 * Opening, creating or switching to a terminal usually mounts or shows its
 * viewport after the handler returns, so the request waits for the viewport.
 */
export function focusTerminal(threadRef: ScopedThreadRef, terminalId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  pendingFocus = focusMountedTarget(threadKey, terminalId) ? null : { threadKey, terminalId };
}

/** Focuses the active terminal of the right panel when it shows a terminal surface. */
export function focusActivePanelTerminal(threadRef: ScopedThreadRef): void {
  const { isOpen, activeSurfaceId, surfaces } = selectThreadRightPanelState(
    useRightPanelStore.getState().byThreadKey,
    threadRef,
  );
  const surface = isOpen ? surfaces.find((candidate) => candidate.id === activeSurfaceId) : null;
  if (surface?.kind === "terminal") focusTerminal(threadRef, surface.activeTerminalId);
}

/**
 * After a right panel surface closes, focuses the terminal surface the panel
 * fell back to. A terminal surface that was already active keeps its focus as is.
 */
export function focusPanelTerminalAfterClose(
  threadRef: ScopedThreadRef,
  previousActiveSurfaceId: string | null,
): void {
  const { activeSurfaceId } = selectThreadRightPanelState(
    useRightPanelStore.getState().byThreadKey,
    threadRef,
  );
  if (activeSurfaceId !== previousActiveSurfaceId) focusActivePanelTerminal(threadRef);
}

/**
 * Focuses a terminal from a handler that may also navigate to its thread (a
 * sidebar terminal reveal). When it does, that thread's entry leaves focus to
 * this request instead of focusing the composer.
 */
export function focusTerminalOnNavigation(threadRef: ScopedThreadRef, terminalId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  navigationRequestThreadKey = threadKey === enteredThreadKey ? null : threadKey;
  focusTerminal(threadRef, terminalId);
}

/**
 * Marks the thread ChatView now shows. `terminalRequested` says a navigating
 * handler asked for a terminal there, so the composer must not take focus.
 */
export function enterThreadForTerminalFocus(threadRef: ScopedThreadRef): {
  readonly terminalRequested: boolean;
  readonly leave: () => void;
} {
  const threadKey = scopedThreadKey(threadRef);
  const terminalRequested = navigationRequestThreadKey === threadKey;
  navigationRequestThreadKey = null;
  enteredThreadKey = threadKey;
  return {
    terminalRequested,
    leave: () => {
      // A handler navigating elsewhere marks its target before this cleanup runs.
      if (enteredThreadKey === threadKey) enteredThreadKey = null;
    },
  };
}

/**
 * Retries a waiting request once a mounted viewport can take it: when it is
 * shown (a viewport kept mounted while hidden has `display: none`) or when the
 * operate grant arrives. Neither ever invents a request.
 */
export function consumePendingTerminalFocus(threadRef: ScopedThreadRef, terminalId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  if (isPending(threadKey, terminalId) && focusMountedTarget(threadKey, terminalId)) {
    pendingFocus = null;
  }
}

export function registerTerminalFocusTarget(target: TerminalFocusTarget): () => void {
  focusTargets.add(target);
  if (isPending(scopedThreadKey(target.threadRef), target.terminalId) && target.focus()) {
    pendingFocus = null;
  }
  return () => {
    focusTargets.delete(target);
  };
}

/**
 * A viewport's `focus` for its target. Focus lands on the mount until the
 * surface exists, and the surface takes it over from there.
 */
export function focusTerminalViewport(input: {
  readonly mount: HTMLElement;
  readonly surface: { focus(): void } | null;
  readonly canOperate: boolean;
  readonly visible: boolean;
}): boolean {
  // A hidden (closing) panel is clipped, not display:none: the mount would take
  // focus while the surface refuses it, and the request would be spent on a
  // wrapper that ignores typing.
  if (!input.canOperate || !input.visible) return false;
  input.mount.focus({ preventScroll: true });
  input.surface?.focus();
  return input.mount.contains(document.activeElement);
}
