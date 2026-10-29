import { create } from "zustand";

// Session-only: the page covers the main area for the route it opened on, so navigating away closes it.
export const useContextPageStore = create<{
  readonly openOn: string | null;
  readonly open: (pathname: string) => void;
  readonly close: () => void;
}>()((set) => ({
  openOn: null,
  open: (pathname) => set({ openOn: pathname }),
  close: () => set({ openOn: null }),
}));
