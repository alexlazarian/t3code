import {
  dedupeProviderSkillsByName,
  getProviderSlashCommandsForSlashMenu,
  isProviderSkillUserInvocable,
} from "@t3tools/client-runtime/providerSkills";
import type { EnvironmentId, ProjectId, ScopedThreadRef, ServerProvider } from "@t3tools/contracts";

import type { DraftId } from "../../composerDraftStore";
import type { PromptStashEntry } from "../../promptStashStore";
import type { ThreadRouteTarget } from "../../threadRoutes";

export type LibraryContext = {
  threadRef: ScopedThreadRef | null;
  draftId: DraftId | null;
  projectId: ProjectId | null;
  environmentId: EnvironmentId | null;
};

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

export type LibrarySkillSource = "yours" | "project" | "plugin" | "built in";

export type LibrarySkillEntry = {
  readonly name: string;
  readonly kind: "command" | "skill";
  readonly source: LibrarySkillSource;
  readonly description: string | null;
};

/** Plugin skills are namespaced `plugin:skill`; the rest are the user's or the project's. */
function skillSource(skill: ServerProvider["skills"][number]): LibrarySkillSource {
  if (skill.name.includes(":")) return "plugin";
  return skill.scope === "project" || skill.scope === "local" ? "project" : "yours";
}

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
      source: "built in" as const,
      description: command.description ?? null,
    })),
    ...visibleSkills.map((skill) => ({
      name: `$${skill.name}`,
      kind: "skill" as const,
      source: skillSource(skill),
      description: skill.shortDescription ?? skill.description ?? null,
    })),
  ];
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
