import { createFileRoute } from "@tanstack/react-router";

import { PromptStashSettings } from "../components/settings/PromptStashSettings";

export const Route = createFileRoute("/_chat/settings/prompt-stash")({
  component: PromptStashSettings,
});
