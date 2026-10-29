import type { ScopedThreadRef } from "@t3tools/contracts";

let readUnreadInView: (() => ReadonlyArray<ScopedThreadRef>) | null = null;

/** The mounted sidebar lends its view, so the palette's Mark all read clears what it shows. */
export function provideSidebarUnreadInView(read: () => ReadonlyArray<ScopedThreadRef>): () => void {
  readUnreadInView = read;
  return () => {
    if (readUnreadInView === read) readUnreadInView = null;
  };
}

export function readSidebarUnreadInView(): ReadonlyArray<ScopedThreadRef> {
  return readUnreadInView?.() ?? [];
}
