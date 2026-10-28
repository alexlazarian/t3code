import type { ScopedThreadRef } from "@t3tools/contracts";

import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import { focusTerminalOnNavigation } from "./terminalFocus";

/** Shows a thread terminal in its right panel: the surface that holds it, or a new surface. */
export function showTerminalInRightPanel(threadRef: ScopedThreadRef, terminalId: string) {
  const panels = useRightPanelStore.getState();
  const surface = selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces.find(
    (surface) => surface.kind === "terminal" && surface.terminalIds.includes(terminalId),
  );
  if (!surface) {
    panels.openTerminal(threadRef, terminalId);
    return;
  }
  panels.activateTerminal(threadRef, surface.id, terminalId);
  panels.activateSurface(threadRef, surface.id);
}

export function revealThreadTerminal(threadRef: ScopedThreadRef, terminalId: string) {
  showTerminalInRightPanel(threadRef, terminalId);
  focusTerminalOnNavigation(threadRef, terminalId);
}
