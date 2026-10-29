import { create } from "zustand";

import { currentThreadRef } from "../../threadView";

type ContextThread = NonNullable<ReturnType<typeof currentThreadRef>>;

// Session-only: the page covers the main area for the route it opened on, so navigating away closes it.
// It remembers the current thread when opened, since Overview's URL names no thread.
export const useContextPageStore = create<{
  readonly openOn: string | null;
  readonly thread: ContextThread | null;
  readonly open: (pathname: string) => void;
  readonly close: () => void;
}>()((set) => ({
  openOn: null,
  thread: null,
  open: (pathname) => set({ openOn: pathname, thread: currentThreadRef() }),
  close: () => set({ openOn: null }),
}));
