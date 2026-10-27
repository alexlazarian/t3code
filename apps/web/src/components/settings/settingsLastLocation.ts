// In memory on purpose: a fresh launch opens Settings on General again.
let lastSettingsPath: string | null = null;
const scrollTopByPath = new Map<string, number>();

/** The tab to reopen when Settings is opened without a specific destination. */
export function resolveSettingsEntryPath(): string {
  return lastSettingsPath ?? "/settings/general";
}

export function rememberSettingsPath(pathname: string): void {
  if (pathname.startsWith("/settings/")) lastSettingsPath = pathname;
}

export function rememberSettingsScroll(pathname: string, scrollTop: number): void {
  scrollTopByPath.set(pathname, scrollTop);
}

export function recallSettingsScroll(pathname: string): number {
  return scrollTopByPath.get(pathname) ?? 0;
}
