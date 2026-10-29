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
            ([id, entry]) => id === providerInstanceId && entry.driver === "claude",
          )) ?? instances.find(([, entry]) => entry.driver === "claude" && entry.enabled !== false);
    const config = Option.getOrUndefined(decodeClaudeSettings(instance?.[1].config ?? {}));
    const environment = yield* mergeProviderInstanceEnvironment(
      instance?.[1].environment,
      hostEnvironment,
    );
    return yield* resolveClaudeHomePath({ homePath: config?.homePath ?? "" }, environment);
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
    add({
      key: claudeFolderKey(input.projectRoot),
      kind: "main",
      label: path.basename(input.projectRoot),
      path: input.projectRoot,
    });
    for (const worktreePath of input.worktreePaths) {
      add({
        key: claudeFolderKey(worktreePath),
        kind: "worktree",
        label: path.basename(worktreePath),
        path: worktreePath,
      });
    }
    // Worktrees share a parent folder, so memory left by a deleted worktree still matches by prefix.
    const settings = yield* settingsService.getSettings.pipe(Effect.option);
    const managedParents = Option.isSome(settings)
      ? managedWorktreesDirectories(settings.value, serverConfig.worktreesDir, path, userHome).map(
          (directory) => path.join(directory, path.basename(input.projectRoot)),
        )
      : [];
    const siblingPrefixes = [
      ...new Set(
        [
          ...input.worktreePaths.map((worktreePath) => path.dirname(worktreePath)),
          ...managedParents,
        ].map((parent) => `${claudeFolderKey(parent)}-`),
      ),
    ];
    const projectsDirectory = path.join(home, "projects");
    const entries = yield* fileSystem
      .readDirectory(projectsDirectory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    for (const entry of [...entries].toSorted()) {
      const prefix = siblingPrefixes.find((candidate) => entry.startsWith(candidate));
      if (prefix === undefined || folders.has(entry) || !/^[A-Za-z0-9-]+$/.test(entry)) continue;
      if (!(yield* isDirectory(memoryDirectory(home, entry)))) continue;
      add({ key: entry, kind: "worktree", label: entry.slice(prefix.length) || entry, path: null });
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
    projectRoot: string,
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
    yield* visit("project", path.join(projectRoot, "CLAUDE.md"), {
      editable: false,
      showMissing: true,
      depth: 0,
    });
    yield* visit("project", path.join(projectRoot, ".claude", "CLAUDE.md"), {
      editable: false,
      showMissing: false,
      depth: 0,
    });
    yield* visit("local", path.join(projectRoot, "CLAUDE.local.md"), {
      editable: false,
      showMissing: true,
      depth: 0,
    });
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
    const instructions = yield* readInstructions(home, input.projectRoot);
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
