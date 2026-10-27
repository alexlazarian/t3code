const OPEN_SIDEBAR_EVENT = "t3code:open-sidebar";

/** The command palette sits outside the sidebar provider, so it asks the shell to open the sidebar. */
export function requestOpenSidebar(): void {
  window.dispatchEvent(new Event(OPEN_SIDEBAR_EVENT));
}

export function onOpenSidebarRequest(listener: () => void): () => void {
  window.addEventListener(OPEN_SIDEBAR_EVENT, listener);
  return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, listener);
}
