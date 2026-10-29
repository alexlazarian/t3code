import type {
  ClaudeContextFolder,
  ClaudeContextSnapshot,
  ClaudeInstructionFile,
  ClaudeMemory,
  ClaudeMemoryType,
  EnvironmentId,
} from "@t3tools/contracts";

import type { LibrarySkillEntry } from "../library/Library.logic";

/** Claude keys a folder's memory by its path with every non-alphanumeric character as `-`. */
export function claudeFolderKey(directory: string): string {
  return directory.replace(/[^A-Za-z0-9]/g, "-");
}

/** The Claude provider's driver kind; the only provider this page supports. */
export const CLAUDE_DRIVER_KIND = "claudeAgent";

export const MEMORY_TYPES: ReadonlyArray<{
  readonly id: ClaudeMemoryType;
  readonly label: string;
  readonly hint: string;
}> = [
  { id: "user", label: "About you", hint: "Who you are and how you like to work." },
  {
    id: "feedback",
    label: "Feedback",
    hint: "A rule for how to work. Claude follows it without being asked.",
  },
  {
    id: "project",
    label: "Project",
    hint: "Ongoing work, goals or constraints the code does not show.",
  },
  {
    id: "reference",
    label: "Reference",
    hint: "Where something lives: a path, URL or doc to consult.",
  },
];

export function memoryTypeLabel(type: string | null): string {
  return MEMORY_TYPES.find((entry) => entry.id === type)?.label ?? "Memory";
}

export function isMemoryType(type: string | null): type is ClaudeMemoryType {
  return MEMORY_TYPES.some((entry) => entry.id === type);
}

/** Every folder Claude may have keyed memory by: the checkout and each worktree a thread uses. */
export function projectWorktreePaths(
  projectRoot: string,
  threads: ReadonlyArray<{ readonly worktreePath: string | null }>,
): ReadonlyArray<string> {
  const paths = new Set<string>();
  for (const thread of threads) {
    if (thread.worktreePath && thread.worktreePath !== projectRoot) paths.add(thread.worktreePath);
  }
  return [...paths].toSorted();
}

export type ContextSelection =
  | { readonly kind: "folder"; readonly environmentId: EnvironmentId; readonly folderKey: string }
  | {
      readonly kind: "memory";
      readonly environmentId: EnvironmentId;
      readonly folderKey: string;
      readonly fileName: string;
    }
  | { readonly kind: "instruction"; readonly environmentId: EnvironmentId; readonly path: string }
  | { readonly kind: "skill"; readonly environmentId: EnvironmentId; readonly name: string };

export function selectionKey(selection: ContextSelection): string {
  switch (selection.kind) {
    case "folder":
      return `folder:${selection.environmentId}:${selection.folderKey}`;
    case "memory":
      return `memory:${selection.environmentId}:${selection.folderKey}/${selection.fileName}`;
    case "instruction":
      return `instruction:${selection.environmentId}:${selection.path}`;
    case "skill":
      return `skill:${selection.environmentId}:${selection.name}`;
  }
}

function matches(query: string, ...fields: ReadonlyArray<string | null | undefined>): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle) === true);
}

/** One machine's Claude context, with the projects it was read for. */
export type ContextSource = {
  readonly environmentId: EnvironmentId;
  readonly machineLabel: string | null;
  readonly snapshot: ClaudeContextSnapshot;
  readonly projects: ReadonlyArray<{ readonly projectRoot: string; readonly title: string }>;
};

export type ContextFolderRow = ClaudeContextFolder & { readonly memoryCount: number };
export type ContextMemoryRow = ClaudeMemory & { readonly folderLabel: string };

export type ContextGroup = {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly machineLabel: string | null;
  /** Null for the folders that belong to no project. */
  readonly projectRoot: string | null;
  readonly title: string;
  readonly folders: ReadonlyArray<ContextFolderRow>;
  readonly memories: ReadonlyArray<ContextMemoryRow>;
  readonly instructions: ReadonlyArray<ClaudeInstructionFile>;
};

export function contextGroupKey(environmentId: EnvironmentId, projectRoot: string | null): string {
  return `${environmentId}|${projectRoot ?? ""}`;
}

export const ALL_PROJECTS = "all";

export type ContextView = {
  readonly groups: ReadonlyArray<ContextGroup>;
  readonly userInstructions: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly machineLabel: string | null;
    readonly file: ClaudeInstructionFile;
  }>;
  /** Groups left out of All projects because they hold nothing yet. */
  readonly emptyCount: number;
};

/**
 * Groups every machine's context by project, then the folders that belong to none.
 * All projects hides what holds nothing; picking one project shows its empty folders and missing files too.
 */
export function contextView(
  sources: ReadonlyArray<ContextSource>,
  options: {
    readonly groupKey: string;
    readonly folderKey: string | null;
    readonly query: string;
    readonly current: {
      readonly environmentId: EnvironmentId;
      readonly projectRoot: string;
    } | null;
    readonly currentFolderKey: string | null;
  },
): ContextView {
  const all = options.groupKey === ALL_PROJECTS;
  const groups: Array<ContextGroup> = [];
  const userInstructions: Array<ContextView["userInstructions"][number]> = [];
  let emptyCount = 0;
  for (const source of sources) {
    const { snapshot } = source;
    const counts = new Map<string, number>();
    for (const memory of snapshot.memories) {
      counts.set(memory.folderKey, (counts.get(memory.folderKey) ?? 0) + 1);
    }
    const labels = new Map(snapshot.folders.map((folder) => [folder.key, folder.label]));
    const folderProject = new Map(
      snapshot.folders.map((folder) => [folder.key, folder.projectRoot]),
    );
    for (const file of snapshot.instructions) {
      if (file.projectRoot !== undefined) continue;
      if (file.content === null && file.scope !== "user") continue;
      if (matches(options.query, file.path, file.content)) {
        userInstructions.push({
          environmentId: source.environmentId,
          machineLabel: source.machineLabel,
          file,
        });
      }
    }
    const entries: Array<{ readonly projectRoot: string | null; readonly title: string }> = [
      ...source.projects.toSorted((a, b) => {
        const aCurrent = options.current?.projectRoot === a.projectRoot;
        const bCurrent = options.current?.projectRoot === b.projectRoot;
        return aCurrent === bCurrent ? a.title.localeCompare(b.title) : aCurrent ? -1 : 1;
      }),
      { projectRoot: null, title: "Other folders" },
    ];
    for (const entry of entries) {
      const key = contextGroupKey(source.environmentId, entry.projectRoot);
      if (!all && key !== options.groupKey) continue;
      const isCurrent =
        options.current !== null &&
        options.current.environmentId === source.environmentId &&
        options.current.projectRoot === entry.projectRoot;
      const folders = snapshot.folders
        .filter((folder) => folder.projectRoot === entry.projectRoot)
        .map((folder) => ({ ...folder, memoryCount: counts.get(folder.key) ?? 0 }))
        .filter(
          (folder) =>
            folder.memoryCount > 0 ||
            folder.index !== null ||
            (!all && folder.kind === "main") ||
            (isCurrent && folder.key === options.currentFolderKey),
        )
        .filter((folder) => options.folderKey === null || folder.key === options.folderKey)
        .filter((folder) => matches(options.query, folder.label, folder.path));
      const memories = snapshot.memories
        .filter((memory) => folderProject.get(memory.folderKey) === entry.projectRoot)
        .filter((memory) => options.folderKey === null || memory.folderKey === options.folderKey)
        .filter((memory) =>
          matches(options.query, memory.title, memory.description, memory.body, memory.fileName),
        )
        .map((memory) => ({
          ...memory,
          folderLabel: labels.get(memory.folderKey) ?? memory.folderKey,
        }));
      const instructions =
        entry.projectRoot === null
          ? []
          : snapshot.instructions
              .filter((file) => file.projectRoot === entry.projectRoot)
              .filter((file) => !all || file.content !== null)
              .filter((file) => matches(options.query, file.path, file.content));
      if (all && folders.length === 0 && memories.length === 0 && instructions.length === 0) {
        if (entry.projectRoot !== null && options.query.length === 0) emptyCount += 1;
        continue;
      }
      groups.push({
        key,
        environmentId: source.environmentId,
        machineLabel: source.machineLabel,
        projectRoot: entry.projectRoot,
        title: entry.title,
        folders,
        memories,
        instructions,
      });
    }
  }
  return { groups, userInstructions, emptyCount };
}

export function instructionScopeLabel(scope: ClaudeInstructionFile["scope"]): string {
  switch (scope) {
    case "managed":
      return "Org";
    case "user":
      return "User";
    case "project":
      return "Project";
    case "local":
      return "Local";
  }
}

export function instructionNote(file: ClaudeInstructionFile): string {
  if (file.importedBy) return "imported";
  if (file.content === null) return "not created";
  return "";
}

export type ContextSkill = LibrarySkillEntry & {
  readonly environmentId: EnvironmentId;
  /** Set for a project's own skill, which only loads in that project. */
  readonly projectTitle: string | null;
};

export function skillSelectionName(skill: ContextSkill): string {
  return `${skill.projectTitle ?? ""}:${skill.name}`;
}

export function homeOf(claudeHome: string): string | null {
  return claudeHome.endsWith("/.claude") ? claudeHome.slice(0, -"/.claude".length) : null;
}

/** Shows a path under the user's home as `~/...`. */
export function displayPath(path: string, home: string | null): string {
  if (home && (path === home || path.startsWith(`${home}/`))) return `~${path.slice(home.length)}`;
  return path;
}
