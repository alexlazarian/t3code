import { create } from "zustand";

interface InfoBarStore {
  readonly text: string | null;
  readonly set: (text: string | null) => void;
}

export const useInfoBarStore = create<InfoBarStore>((set, get) => ({
  text: null,
  set: (text) => {
    if (get().text !== text) set({ text });
  },
}));
