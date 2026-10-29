import {
  ClaudeContextConflictError,
  ClaudeContextError,
  ClaudeMemoryFileName,
  ClaudeSettings,
  type ClaudeContextFolder,
  type ClaudeContextReadInput,
  type ClaudeContextSnapshot,
  type ClaudeInstructionFile,
  type ClaudeMemory,
  type ClaudeMemoryDeleteInput,
  type ClaudeMemoryDeleteResult,
  type ClaudeMemoryRestoreInput,
  type ClaudeMemoryWriteInput,
  type ClaudeUserInstructionsWriteInput,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { resolveClaudeHomePath } from "../provider/Drivers/ClaudeHome.ts";
import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import { managedWorktreesDirectories } from "../worktreesDirectory.ts";
import {
  MEMORY_INDEX_FILE_NAME,
  claudeFolderKey,
  findIndexEntry,
  formatIndexLine,
  instructionImports,
  parseMemoryFile,
  removeIndexLine,
  renderMemoryFile,
  slugifyMemoryName,
  upsertIndexLine,
} from "./claudeMemoryFiles.ts";

export class ClaudeContext extends Context.Service<
  ClaudeContext,
  {
    readonly read: (
      input: ClaudeContextReadInput,
    ) => Effect.Effect<ClaudeContextSnapshot, ClaudeContextError>;
    readonly writeMemory: (
      input: ClaudeMemoryWriteInput,
    ) => Effect.Effect<ClaudeMemory, ClaudeContextError | ClaudeContextConflictError>;
    readonly deleteMemory: (
      input: ClaudeMemoryDeleteInput,
    ) => Effect.Effect<ClaudeMemoryDeleteResult, ClaudeContextError>;
    readonly restoreMemory: (
      input: ClaudeMemoryRestoreInput,
    ) => Effect.Effect<ClaudeMemory, ClaudeContextError>;
    readonly writeUserInstructions: (
      input: ClaudeUserInstructionsWriteInput,
    ) => Effect.Effect<void, ClaudeContextError | ClaudeContextConflictError>;
  }
>()("t3/claudeContext/ClaudeContext") {}

const decodeClaudeSettings = Schema.decodeUnknownOption(ClaudeSettings);
const isMemoryFileName = Schema.is(ClaudeMemoryFileName);
const MAX_IMPORT_DEPTH = 4;
const CLAUDE_DRIVER = "claudeAgent";

function managedInstructionsPath(platform: NodeJS.Platform): string {
  if (platform === "darwin") return "/Library/Application Support/ClaudeCode/CLAUDE.md";
  if (platform === "win32") return "C:\\Program Files\\ClaudeCode\\CLAUDE.md";
  return "/etc/claude-code/CLAUDE.md";
}

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const serverConfig = yield* ServerConfig.ServerConfig;
  const hostEnvironment = yield* HostProcess.Environment;
  const platform = yield* HostProcess.Platform;
  const userHome = yield* HostProcess.HomeDirectory;
  // One writer at a time, so two saves never race on a folder's MEMORY.md.
  const writeLock = yield* Semaphore.make(1);

  const fail = (operation: ClaudeContextError["operation"], filePath: string, detail: string) =>
    Effect.mapError(
      (cause: unknown) => new ClaudeContextError({ operation, path: filePath, detail, cause }),
    );

  const readOptional = (filePath: string) =>
    fileSystem.readFileString(filePath).pipe(
      Effect.map((content): string | null => content),
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(null)
            : Effect.fail(
                new ClaudeContextError({
                  operation: "read",
                  path: filePath,
                  detail: "Could not read the file.",
                  cause: error,
                }),
              ),
      }),
    );

  const isDirectory = (directory: string) =>
    fileSystem.stat(directory).pipe(
      Effect.map((info) => info.type === "Directory"),
      Effect.orElseSucceed(() => false),
    );

  const resolveHome = Effect.fn("ClaudeContext.resolveHome")(function* (
    providerInstanceId: ProviderInstanceId | undefined,
  ) {
    const settings = yield* settingsService.getSettings.pipe(
      Effect.mapError(
        (cause) =>
          new ClaudeContextError({
            operation: "read",
            detail: "Server settings could not be read.",
            cause,
          }),
      ),
    );
    const instances = Object.entries(settings.providerInstances);
    const instance =
      (providerInstanceId === undefined
        ? undefined
        : instances.find(
            ([id, entry]) => id === providerInstanceId && entry.driver === CLAUDE_DRIVER,
          )) ??
      instances.find(([, entry]) => entry.driver === CLAUDE_DRIVER && entry.enabled !== false);
    const config = Option.getOrUndefined(decodeClaudeSettings(instance?.[1].config ?? {}));
    const environment = yield* mergeProviderInstanceEnvironment(
      instance?.[1].environment,
      hostEnvironment,
    );
    return yield* resolveClaudeHomePath({ homePath: config?.homePath ?? "" }, environment);
  });

  // Claude's key replaced every non-alphanumeric character with `-`; walk the disk to find the folder it came from.
  const resolveFolderKey = Effect.fn("ClaudeContext.resolveFolderKey")(function* (
    key: string,
    listings: Map<string, ReadonlyArray<string>>,
  ) {
    if (!key.startsWith("-")) return null;
    const list = Effect.fnUntraced(function* (directory: string) {
      const cached = listings.get(directory);
      if (cached) return cached;
      const names = yield* fileSystem
        .readDirectory(directory)
        .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
      listings.set(directory, names);
      return names;
    });
    // Each state is a real directory plus the start of a child's name; keep only prefixes some child has.
    let states: Array<{ readonly directory: string; readonly segment: string }> = [
      { directory: "/", segment: "" },
    ];
    for (const token of key.slice(1).split("-")) {
      const next: Array<{ readonly directory: string; readonly segment: string }> = [];
      for (const state of states) {
        const children = yield* list(state.directory);
        const candidates =
          state.segment.length === 0
            ? [{ directory: state.directory, segment: token.length === 0 ? "." : token }]
            : [
                ...(children.includes(state.segment) &&
                (yield* isDirectory(path.join(state.directory, state.segment)))
                  ? [
                      {
                        directory: path.join(state.directory, state.segment),
                        segment: token.length === 0 ? "." : token,
                      },
                    ]
                  : []),
                ...(token.length === 0
                  ? []
                  : ["-", ".", "_", " "].map((joiner) => ({
                      directory: state.directory,
                      segment: `${state.segment}${joiner}${token}`,
                    }))),
              ];
        for (const candidate of candidates) {
          const names = yield* list(candidate.directory);
          if (names.some((name) => name.startsWith(candidate.segment))) next.push(candidate);
        }
      }
      states = next;
      if (states.length === 0) return null;
    }
    for (const state of states) {
      const candidate = path.join(state.directory, state.segment);
      if (claudeFolderKey(candidate) === key && (yield* isDirectory(candidate))) return candidate;
    }
    return null;
  });

  const memoryDirectory = (home: string, folderKey: string) =>
    path.join(home, "projects", folderKey, "memory");

  const readFolders = Effect.fn("ClaudeContext.readFolders")(function* (
    home: string,
    input: ClaudeContextReadInput,
  ) {
    const folders = new Map<string, ClaudeContextFolder>();
    const add = (folder: Omit<ClaudeContextFolder, "memoryDirectory" | "index">) => {
      if (folders.has(folder.key)) return;
      folders.set(folder.key, {
        ...folder,
        memoryDirectory: memoryDirectory(home, folder.key),
        index: null,
      });
    };
    for (const project of input.projects) {
      add({
        key: claudeFolderKey(project.projectRoot),
        kind: "main",
        projectRoot: project.projectRoot,
        label: path.basename(project.projectRoot),
        path: project.projectRoot,
      });
    }
    for (const project of input.projects) {
      for (const worktreePath of project.worktreePaths) {
        add({
          key: claudeFolderKey(worktreePath),
          kind: "worktree",
          projectRoot: project.projectRoot,
          label: path.basename(worktreePath),
          path: worktreePath,
        });
      }
    }
    // Worktrees share a parent folder, so memory left by a deleted worktree still matches by prefix.
    const settings = yield* settingsService.getSettings.pipe(Effect.option);
    const managedDirectories = Option.isSome(settings)
      ? managedWorktreesDirectories(settings.value, serverConfig.worktreesDir, path, userHome)
      : [];
    const siblingPrefixes = input.projects
      .flatMap((project) =>
        [
          ...project.worktreePaths.map((worktreePath) => path.dirname(worktreePath)),
          ...managedDirectories.map((directory) =>
            path.join(directory, path.basename(project.projectRoot)),
          ),
        ].map((parent) => ({
          prefix: `${claudeFolderKey(parent)}-`,
          projectRoot: project.projectRoot,
        })),
      )
      .toSorted((a, b) => b.prefix.length - a.prefix.length);
    const homePrefix = `${claudeFolderKey(userHome)}-`;
    const listings = new Map<string, ReadonlyArray<string>>();
    // A folder that no longer exists keeps its key, minus the home prefix.
    const otherFolderLabel = (entry: string) =>
      entry === claudeFolderKey(userHome)
        ? "~"
        : entry.startsWith(homePrefix)
          ? `~-${entry.slice(homePrefix.length)}`
          : entry;
    const entries = yield* fileSystem
      .readDirectory(path.join(home, "projects"))
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    for (const entry of [...entries].toSorted()) {
      if (folders.has(entry) || !/^[A-Za-z0-9-]+$/.test(entry)) continue;
      if (!(yield* isDirectory(memoryDirectory(home, entry)))) continue;
      const sibling = siblingPrefixes.find((candidate) => entry.startsWith(candidate.prefix));
      if (sibling) {
        add({
          key: entry,
          kind: "worktree",
          projectRoot: sibling.projectRoot,
          label: entry.slice(sibling.prefix.length) || entry,
          path: null,
        });
        continue;
      }
      const resolved = yield* resolveFolderKey(entry, listings);
      add({
        key: entry,
        kind: "other",
        projectRoot: null,
        label: resolved ? path.basename(resolved) || resolved : otherFolderLabel(entry),
        path: resolved,
      });
    }
    return yield* Effect.forEach([...folders.values()], (folder) =>
      readOptional(path.join(folder.memoryDirectory, MEMORY_INDEX_FILE_NAME)).pipe(
        Effect.map((index) => ({ ...folder, index })),
      ),
    );
  });

  const toMemory = (
    folder: Pick<ClaudeContextFolder, "key" | "memoryDirectory" | "index">,
    fileName: ClaudeMemoryFileName,
    raw: string,
    modifiedAt: number | null,
  ): ClaudeMemory => {
    const parsed = parseMemoryFile(raw);
    const title = findIndexEntry(folder.index, fileName)?.title ?? parsed.name?.trim() ?? fileName;
    return {
      folderKey: folder.key,
      fileName,
      path: path.join(folder.memoryDirectory, fileName),
      title: title.length > 0 ? title : fileName,
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      body: parsed.body,
      raw,
      modifiedAt,
    };
  };

  const readMemoryFile = Effect.fn("ClaudeContext.readMemoryFile")(function* (
    folder: Pick<ClaudeContextFolder, "key" | "memoryDirectory" | "index">,
    fileName: ClaudeMemoryFileName,
  ) {
    const filePath = path.join(folder.memoryDirectory, fileName);
    const raw = yield* readOptional(filePath);
    if (raw === null) return null;
    const modifiedAt = yield* fileSystem.stat(filePath).pipe(
      Effect.map((info) => Option.getOrNull(info.mtime)?.getTime() ?? null),
      Effect.orElseSucceed(() => null),
    );
    return toMemory(folder, fileName, raw, modifiedAt);
  });

  const readMemories = Effect.fn("ClaudeContext.readMemories")(function* (
    folder: ClaudeContextFolder,
  ) {
    const entries = yield* fileSystem
      .readDirectory(folder.memoryDirectory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    const memories = yield* Effect.forEach(
      entries.filter(isMemoryFileName).toSorted(),
      (fileName) => readMemoryFile(folder, fileName),
      { concurrency: 8 },
    );
    return memories.filter((memory) => memory !== null);
  });

  const readInstructions = Effect.fn("ClaudeContext.readInstructions")(function* (
    home: string,
    projectRoots: ReadonlyArray<string>,
  ) {
    const files: Array<ClaudeInstructionFile> = [];
    const seen = new Set<string>();
    const visit = Effect.fnUntraced(function* (
      scope: ClaudeInstructionFile["scope"],
      filePath: string,
      options: {
        readonly editable: boolean;
        readonly showMissing: boolean;
        readonly importedBy?: string;
        readonly projectRoot?: string;
        readonly depth: number;
      },
    ): Effect.fn.Return<void, ClaudeContextError> {
      if (seen.has(filePath)) return;
      seen.add(filePath);
      const content = yield* readOptional(filePath);
      if (content === null && !options.showMissing) return;
      files.push({
        scope,
        path: filePath,
        ...(options.importedBy ? { importedBy: options.importedBy } : {}),
        ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
        content,
        editable: options.editable,
      });
      if (content === null || options.depth >= MAX_IMPORT_DEPTH) return;
      for (const target of instructionImports(content)) {
        const resolved = target.startsWith("~/")
          ? path.join(userHome, target.slice(2))
          : path.resolve(path.dirname(filePath), target);
        yield* visit(scope, resolved, {
          editable: false,
          showMissing: false,
          importedBy: filePath,
          ...(options.projectRoot ? { projectRoot: options.projectRoot } : {}),
          depth: options.depth + 1,
        });
      }
    });
    yield* visit("managed", managedInstructionsPath(platform), {
      editable: false,
      showMissing: false,
      depth: 0,
    });
    yield* visit("user", path.join(home, "CLAUDE.md"), {
      editable: true,
      showMissing: true,
      depth: 0,
    });
    for (const projectRoot of projectRoots) {
      yield* visit("project", path.join(projectRoot, "CLAUDE.md"), {
        editable: false,
        showMissing: true,
        projectRoot,
        depth: 0,
      });
      yield* visit("project", path.join(projectRoot, ".claude", "CLAUDE.md"), {
        editable: false,
        showMissing: false,
        projectRoot,
        depth: 0,
      });
      yield* visit("local", path.join(projectRoot, "CLAUDE.local.md"), {
        editable: false,
        showMissing: true,
        projectRoot,
        depth: 0,
      });
    }
    return files;
  });

  const provide = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(Path.Path, path),
    );

  const locked = <A, E, R>(effect: Effect.Effect<A, E, R>) => writeLock.withPermit(effect);

  const read = Effect.fn("ClaudeContext.read")(function* (input: ClaudeContextReadInput) {
    const home = yield* resolveHome(input.providerInstanceId);
    const folders = yield* readFolders(home, input);
    const memories = yield* Effect.forEach(folders, readMemories, { concurrency: 4 });
    const instructions = yield* readInstructions(
      home,
      input.projects.map((project) => project.projectRoot),
    );
    return { claudeHome: home, folders, memories: memories.flat(), instructions };
  }, provide);

  const writeText = Effect.fn("ClaudeContext.writeText")(function* (
    filePath: string,
    contents: string,
    operation: "write" | "delete" = "write",
  ) {
    yield* Effect.gen(function* () {
      yield* fileSystem.makeDirectory(path.dirname(filePath), { recursive: true });
      yield* writeFileStringAtomically({ filePath, contents });
    }).pipe(fail(operation, filePath, "Could not write the file."));
  });

  const memoryFolder = Effect.fn("ClaudeContext.memoryFolder")(function* (
    providerInstanceId: ProviderInstanceId | undefined,
    folderKey: string,
  ) {
    const home = yield* resolveHome(providerInstanceId);
    const directory = memoryDirectory(home, folderKey);
    const indexPath = path.join(directory, MEMORY_INDEX_FILE_NAME);
    const index = yield* readOptional(indexPath);
    return { key: folderKey, memoryDirectory: directory, indexPath, index };
  });

  const uniqueFileName = Effect.fn("ClaudeContext.uniqueFileName")(function* (
    directory: string,
    title: string,
  ) {
    const slug = slugifyMemoryName(title);
    for (let attempt = 1; ; attempt += 1) {
      const candidate = attempt === 1 ? `${slug}.md` : `${slug}-${attempt}.md`;
      const taken = yield* fileSystem
        .exists(path.join(directory, candidate))
        .pipe(Effect.orElseSucceed(() => false));
      if (!taken && isMemoryFileName(candidate)) return candidate;
    }
  });

  const writeMemory = Effect.fn("ClaudeContext.writeMemory")(
    function* (input: ClaudeMemoryWriteInput) {
      const folder = yield* memoryFolder(input.providerInstanceId, input.folderKey);
      const fileName =
        input.fileName ?? (yield* uniqueFileName(folder.memoryDirectory, input.title));
      const filePath = path.join(folder.memoryDirectory, fileName);
      const current = yield* readOptional(filePath);
      if (input.expectedRaw !== undefined && current !== input.expectedRaw) {
        return yield* new ClaudeContextConflictError({ path: filePath, current });
      }
      const name =
        (current === null ? null : parseMemoryFile(current).name) ?? slugifyMemoryName(input.title);
      const now = DateTime.formatIso(yield* DateTime.now);
      const raw = renderMemoryFile({
        existingRaw: current,
        name,
        description: input.description,
        type: input.type,
        body: input.body,
        modifiedAt: now,
      });
      yield* writeText(filePath, raw);
      const index = upsertIndexLine(
        folder.index,
        fileName,
        formatIndexLine({ fileName, title: input.title, description: input.description }),
      );
      yield* writeText(folder.indexPath, index);
      return (
        (yield* readMemoryFile({ ...folder, index }, fileName)) ??
        toMemory({ ...folder, index }, fileName, raw, null)
      );
    },
    locked,
    provide,
  );

  const deleteMemory = Effect.fn("ClaudeContext.deleteMemory")(
    function* (input: ClaudeMemoryDeleteInput) {
      const folder = yield* memoryFolder(input.providerInstanceId, input.folderKey);
      const filePath = path.join(folder.memoryDirectory, input.fileName);
      const raw = yield* readOptional(filePath);
      if (raw === null) {
        return yield* new ClaudeContextError({
          operation: "delete",
          path: filePath,
          detail: "The memory is already gone.",
        });
      }
      yield* fileSystem
        .remove(filePath)
        .pipe(fail("delete", filePath, "Could not delete the memory."));
      const { index, removed } = removeIndexLine(folder.index, input.fileName);
      if (removed !== null && index !== null) yield* writeText(folder.indexPath, index, "delete");
      return { raw, indexLine: removed };
    },
    locked,
    provide,
  );

  const restoreMemory = Effect.fn("ClaudeContext.restoreMemory")(
    function* (input: ClaudeMemoryRestoreInput) {
      const folder = yield* memoryFolder(input.providerInstanceId, input.folderKey);
      const filePath = path.join(folder.memoryDirectory, input.fileName);
      yield* writeText(filePath, input.raw);
      const index =
        input.indexLine === null
          ? folder.index
          : upsertIndexLine(folder.index, input.fileName, input.indexLine);
      if (index !== null && index !== folder.index) yield* writeText(folder.indexPath, index);
      return toMemory({ ...folder, index }, input.fileName, input.raw, null);
    },
    locked,
    provide,
  );

  const writeUserInstructions = Effect.fn("ClaudeContext.writeUserInstructions")(
    function* (input: ClaudeUserInstructionsWriteInput) {
      const home = yield* resolveHome(input.providerInstanceId);
      const filePath = path.join(home, "CLAUDE.md");
      if (input.expectedContent !== undefined) {
        const current = yield* readOptional(filePath);
        if (current !== input.expectedContent) {
          return yield* new ClaudeContextConflictError({ path: filePath, current });
        }
      }
      yield* writeText(filePath, input.content);
    },
    locked,
    provide,
  );

  return ClaudeContext.of({
    read,
    writeMemory,
    deleteMemory,
    restoreMemory,
    writeUserInstructions,
  });
});

export const layer = Layer.effect(ClaudeContext, make);
