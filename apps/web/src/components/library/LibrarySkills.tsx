import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  resolveProviderSkillsForCwd,
  resolveProviderSlashCommandsForCwd,
} from "@t3tools/client-runtime/providerSkills";

import { useProject } from "../../state/entities";
import { librarySkillEntries, libraryInsertTarget, type LibraryContext } from "./Library.logic";
import { LibraryItemList } from "./LibraryItemList";
import { useInsertInComposer, useLibraryProvider } from "./useLibrary";

export function LibrarySkills(props: { readonly ctx: LibraryContext }) {
  const { ctx } = props;
  const { entry, threadShell } = useLibraryProvider(ctx);
  const project = useProject(
    ctx.environmentId !== null && ctx.projectId !== null
      ? scopeProjectRef(ctx.environmentId, ctx.projectId)
      : null,
  );
  const insert = useInsertInComposer(libraryInsertTarget(ctx));
  const cwd = threadShell?.worktreePath ?? project?.workspaceRoot ?? null;
  const entries = entry
    ? librarySkillEntries(
        resolveProviderSkillsForCwd(entry.snapshot, cwd),
        resolveProviderSlashCommandsForCwd(entry.snapshot, cwd),
      )
    : [];
  return (
    <LibraryItemList
      empty={
        entry ? `${entry.displayName} reports no skills or commands.` : "No provider is ready."
      }
      items={entries.map((skill) => ({
        key: skill.name,
        name: skill.name,
        meta: skill.kind,
        detail: skill.description,
        actions: insert
          ? [{ label: "Insert in composer", onSelect: () => insert(`${skill.name} `) }]
          : [],
      }))}
    />
  );
}
