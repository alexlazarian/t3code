import { createContext, use } from "react";
import type { ChatComposerHandle } from "./components/chat/ChatComposer";

export type ComposerHandleRef = React.RefObject<ChatComposerHandle | null>;

export const ComposerHandleContext = createContext<ComposerHandleRef | null>(null);

export function useComposerHandleContext(): ComposerHandleRef | null {
  return use(ComposerHandleContext);
}

export const COMPOSER_BUSY_TOAST = {
  type: "error",
  title: "Unable to add to chat",
  description: "The composer is busy; try again once it is ready.",
} as const;
