/**
 * Project actions reuse an idle thread terminal: the one the right panel shows first, then the
 * panel's other terminals, then sessions no panel surface holds, such as a worktree setup shell.
 */
export function findReusableProjectScriptTerminal(input: {
  readonly activeTerminalId: string | null;
  readonly panelTerminalIds: ReadonlyArray<string>;
  readonly sessionTerminalIds: ReadonlyArray<string>;
  readonly runningTerminalIds: ReadonlyArray<string>;
}): string | null {
  const candidates = [
    ...(input.activeTerminalId === null ? [] : [input.activeTerminalId]),
    ...input.panelTerminalIds,
    ...input.sessionTerminalIds,
  ];
  return candidates.find((terminalId) => !input.runningTerminalIds.includes(terminalId)) ?? null;
}
