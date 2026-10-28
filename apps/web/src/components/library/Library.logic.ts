import {
  dedupeProviderSkillsByName,
  getProviderSlashCommandsForSlashMenu,
  isProviderSkillUserInvocable,
} from "@t3tools/client-runtime/providerSkills";
import type {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ScopedThreadRef,
  ServerProvider,
} from "@t3tools/contracts";

import type { DraftId } from "../../composerDraftStore";
import type { PromptStashEntry } from "../../promptStashStore";
import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";
import type { ThreadRouteTarget } from "../../threadRoutes";

export type LibraryCategory =
  | "skills"
  | "models"
  | "providers"
  | "access"
  | "stash"
  | "scheduled"
  | "projects"
  | "machines";

export type LibraryContext = {
  threadRef: ScopedThreadRef | null;
  draftId: DraftId | null;
  projectId: ProjectId | null;
  environmentId: EnvironmentId | null;
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
  draftSession: { projectId: ProjectId; environmentId: EnvironmentId } | null,
  threadShell: { projectId: ProjectId } | null,
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

/** Appends text the way the composer's own insert does: one space between words, none doubled. */
export function appendComposerText(current: string, text: string): string {
  return current.length === 0 || /\s$/.test(current) ? current + text : `${current} ${text}`;
}

export type LibrarySkillEntry = {
  readonly name: string;
  readonly kind: "command" | "skill";
  readonly description: string | null;
};

/** The composer's / and $ lists: user-invocable skills, and commands not shadowed by one. */
export function librarySkillEntries(
  skills: ServerProvider["skills"],
  commands: ServerProvider["slashCommands"],
): ReadonlyArray<LibrarySkillEntry> {
  const visibleSkills = dedupeProviderSkillsByName(skills.filter(isProviderSkillUserInvocable));
  return [
    ...getProviderSlashCommandsForSlashMenu(commands, visibleSkills).map((command) => ({
      name: `/${command.name}`,
      kind: "command" as const,
      description: command.description ?? null,
    })),
    ...visibleSkills.map((skill) => ({
      name: `$${skill.name}`,
      kind: "skill" as const,
      description: skill.shortDescription ?? skill.description ?? null,
    })),
  ];
}

/** The open thread's provider, else the first one the picker would offer. */
export function resolveLibraryProviderEntry(
  entries: ReadonlyArray<ProviderInstanceEntry>,
  instanceId: ProviderInstanceId | null,
): ProviderInstanceEntry | null {
  return (
    entries.find((entry) => entry.instanceId === instanceId) ??
    entries.find(isProviderInstancePickerReady) ??
    null
  );
}

export type LibraryModelAction = "use" | "new" | "setup";

/** Only an open thread on the same provider switches in place; drafts and others start fresh. */
export function libraryModelAction(
  entry: ProviderInstanceEntry,
  threadInstanceId: ProviderInstanceId | null,
): LibraryModelAction {
  if (!isProviderInstancePickerReady(entry)) return "setup";
  return entry.instanceId === threadInstanceId ? "use" : "new";
}

/** Attachments and context chips only survive the composer's own restore, so only plain text inserts. */
export function stashEntryInsertText(entry: PromptStashEntry): string | null {
  const hasExtras =
    entry.attachments.length > 0 ||
    (entry.files?.length ?? 0) > 0 ||
    (entry.records?.length ?? 0) > 0 ||
    entry.droppedImageNames.length > 0 ||
    (entry.unreadableImageNames?.length ?? 0) > 0 ||
    (entry.pendingImageCount ?? 0) > 0;
  return hasExtras || entry.prompt.trim().length === 0 ? null : entry.prompt;
}
