import { useSyncExternalStore } from "react";

import { useUiStateStore, type SidebarPanel } from "../../uiStateStore";
import type { LibraryCategory } from "../library/Library.logic";
import { useSidebar } from "../ui/sidebar";

export function isSettingsPath(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

/**
 * Settings renders in the sidebar while it is open on Library > Settings, and as a
 * main-area page otherwise. The sidebar state is the only switch, so the two never show at once.
 */
export function useSettingsInLibrary(): boolean {
  const { isMobile, open } = useSidebar();
  const inLibrary = useUiStateStore(
    (store) => store.sidebarPanel === "library" && store.libraryCategory === "settings",
  );
  return inLibrary && open && !isMobile;
}

// Where the sidebar was before Settings moved into it, so leaving puts it back.
let returnPanel: SidebarPanel = "threads";
let returnCategory: Exclude<LibraryCategory, "settings"> = "skills";

export function moveSettingsIntoLibrary() {
  const store = useUiStateStore.getState();
  if (store.sidebarPanel !== "library" || store.libraryCategory !== "settings") {
    returnPanel = store.sidebarPanel;
    if (store.libraryCategory !== "settings") returnCategory = store.libraryCategory;
  }
  store.setSidebarPanel("library");
  store.setLibraryCategory("settings");
}

/** Puts the sidebar back where it was. On a Settings route this turns Library Settings into the page. */
export function moveSettingsOutOfLibrary() {
  const store = useUiStateStore.getState();
  if (store.libraryCategory !== "settings") return;
  store.setLibraryCategory(returnCategory);
  store.setSidebarPanel(returnPanel);
}

/** Leaves Settings for the Library list it sits in, whichever panel Settings was opened from. */
export function moveSettingsToLibraryList() {
  const store = useUiStateStore.getState();
  if (store.libraryCategory !== "settings") return;
  store.setLibraryCategory(returnCategory);
  store.setSidebarPanel("library");
}

// The Library panel provides the element Settings content portals into.
let libraryHost: HTMLElement | null = null;
const hostListeners = new Set<() => void>();

export function setLibrarySettingsHost(element: HTMLElement | null) {
  if (libraryHost === element) return;
  libraryHost = element;
  for (const listener of hostListeners) listener();
}

const subscribeHost = (listener: () => void) => {
  hostListeners.add(listener);
  return () => hostListeners.delete(listener);
};

export function useLibrarySettingsHost(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeHost,
    () => libraryHost,
    () => null,
  );
}
