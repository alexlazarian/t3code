import type {
  ClaudeContextFolder,
  ClaudeContextSnapshot,
  ClaudeInstructionFile,
  ClaudeMemory,
  ClaudeMemoryType,
} from "@t3tools/contracts";

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
  | { readonly kind: "folder"; readonly folderKey: string }
  | { readonly kind: "memory"; readonly folderKey: string; readonly fileName: string }
  | { readonly kind: "instruction"; readonly path: string }
  | { readonly kind: "skill"; readonly name: string };

export function selectionKey(selection: ContextSelection): string {
  switch (selection.kind) {
    case "folder":
      return `folder:${selection.folderKey}`;
    case "memory":
      return `memory:${selection.folderKey}/${selection.fileName}`;
    case "instruction":
      return `instruction:${selection.path}`;
    case "skill":
      return `skill:${selection.name}`;
  }
}

function matches(query: string, ...fields: ReadonlyArray<string | null | undefined>): boolean {
  if (query.length === 0) return true;
  const needle = query.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle) === true);
}

export type ContextView = {
  readonly folders: ReadonlyArray<ClaudeContextFolder & { readonly memoryCount: number }>;
  readonly memories: ReadonlyArray<ClaudeMemory & { readonly folderLabel: string }>;
  readonly instructions: ReadonlyArray<ClaudeInstructionFile>;
};

/** Folders that hold nothing and are not this thread's are noise; deleted worktrees only show while they hold memory. */
export function contextView(
  snapshot: ClaudeContextSnapshot,
  options: {
    readonly folderKey: string | null;
    readonly query: string;
    readonly currentFolderKey: string | null;
  },
): ContextView {
  const counts = new Map<string, number>();
  for (const memory of snapshot.memories) {
    counts.set(memory.folderKey, (counts.get(memory.folderKey) ?? 0) + 1);
  }
  const labels = new Map(snapshot.folders.map((folder) => [folder.key, folder.label]));
  const folders = snapshot.folders
    .map((folder) => ({ ...folder, memoryCount: counts.get(folder.key) ?? 0 }))
    .filter(
      (folder) =>
        folder.kind === "main" ||
        folder.memoryCount > 0 ||
        folder.index !== null ||
        folder.key === options.currentFolderKey,
    )
    .filter((folder) => options.folderKey === null || folder.key === options.folderKey)
    .filter((folder) => matches(options.query, folder.label, folder.path));
  const memories = snapshot.memories
    .filter((memory) => options.folderKey === null || memory.folderKey === options.folderKey)
    .filter((memory) =>
      matches(options.query, memory.title, memory.description, memory.body, memory.fileName),
    )
    .map((memory) => ({
      ...memory,
      folderLabel: labels.get(memory.folderKey) ?? memory.folderKey,
    }));
  const instructions = snapshot.instructions.filter((file) =>
    matches(options.query, file.path, file.content),
  );
  return { folders, memories, instructions };
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

/** Shows a path under the user's home as `~/...`. */
export function displayPath(path: string, home: string | null): string {
  if (home && (path === home || path.startsWith(`${home}/`))) return `~${path.slice(home.length)}`;
  return path;
}
