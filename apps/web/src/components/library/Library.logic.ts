import type { ScopedThreadRef } from "@t3tools/contracts";

import type { DraftId } from "../../composerDraftStore";
import type { ThreadRouteTarget } from "../../threadRoutes";

export type LibraryCategory =
  | "skills"
  | "models"
  | "providers"
  | "access"
  | "actions"
  | "stash"
  | "scheduled"
  | "projects"
  | "machines";

export type LibraryContext = {
  threadRef: ScopedThreadRef | null;
  draftId: DraftId | null;
  projectId: string | null;
  environmentId: string | null;
};

export const LIBRARY_GROUPS: ReadonlyArray<{
  group: "Library" | "Places";
  categories: ReadonlyArray<{ id: LibraryCategory; name: string; tip: string }>;
}> = [
  {
    group: "Library",
    categories: [
      {
        id: "skills",
        name: "Skills & commands",
        tip: "From the open thread's provider and machine. Same list as typing / or $ in the composer.",
      },
      {
        id: "models",
        name: "Models",
        tip: "Same-provider models switch the open thread from its next message. Other providers start a new thread, or hand off from the composer's model picker when the session supports it.",
      },
      {
        id: "providers",
        name: "Providers",
        tip: "The agents T3 runs, with their setup status from Settings > Providers.",
      },
      {
        id: "access",
        name: "Access modes",
        tip: "How often the open thread asks before acting.",
      },
      {
        id: "actions",
        name: "Project actions",
        tip: "Scripts for the open thread's project. Output goes to the terminal drawer.",
      },
      {
        id: "stash",
        name: "Prompt stash",
        tip: "Prompts saved with Cmd/Ctrl+S on this device. Up to 20.",
      },
      {
        id: "scheduled",
        name: "Scheduled tasks",
        tip: "Prompts that run on a schedule or webhook. Managed in Settings > Scheduled tasks.",
      },
    ],
  },
  {
    group: "Places",
    categories: [
      {
        id: "projects",
        name: "Projects",
        tip: "Start a thread in any project, or open its settings.",
      },
      {
        id: "machines",
        name: "Machines",
        tip: "Connected machines and their status. Managed in Settings > Environments.",
      },
    ],
  },
];

export const LIBRARY_CATEGORIES = LIBRARY_GROUPS.flatMap((group) => group.categories);

export function isLibraryCategory(value: unknown): value is LibraryCategory {
  return LIBRARY_CATEGORIES.some((category) => category.id === value);
}

export function libraryInsertTarget(ctx: LibraryContext): ScopedThreadRef | DraftId | null {
  return ctx.threadRef ?? ctx.draftId;
}

export function libraryContextFromRoute(
  routeTarget: ThreadRouteTarget | null,
  draftSession: { projectId: string; environmentId: string } | null,
  threadShell: { projectId: string } | null,
): LibraryContext {
  if (routeTarget?.kind === "server") {
    return {
      threadRef: routeTarget.threadRef,
      draftId: null,
      projectId: threadShell?.projectId ?? null,
      environmentId: routeTarget.threadRef.environmentId,
    };
  }
  if (routeTarget?.kind === "draft") {
    return {
      threadRef: null,
      draftId: routeTarget.draftId,
      projectId: draftSession?.projectId ?? null,
      environmentId: draftSession?.environmentId ?? null,
    };
  }
  return { threadRef: null, draftId: null, projectId: null, environmentId: null };
}
