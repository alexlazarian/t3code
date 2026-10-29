import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

/** Claude names a session's memory folder after its working directory: every non-alphanumeric character becomes `-`. */
export const ClaudeMemoryFolderKey = TrimmedNonEmptyString.check(
  Schema.isPattern(/^[A-Za-z0-9-]+$/),
);
export type ClaudeMemoryFolderKey = typeof ClaudeMemoryFolderKey.Type;

/** One memory file; `MEMORY.md` is the folder's index, never a memory. */
export const ClaudeMemoryFileName = TrimmedNonEmptyString.check(
  Schema.isPattern(/^(?!MEMORY\.md$)[A-Za-z0-9][A-Za-z0-9._-]*\.md$/),
);
export type ClaudeMemoryFileName = typeof ClaudeMemoryFileName.Type;

export const ClaudeMemoryType = Schema.Literals(["user", "feedback", "project", "reference"]);
export type ClaudeMemoryType = typeof ClaudeMemoryType.Type;

export const ClaudeContextReadInput = Schema.Struct({
  /** Picks the Claude home when instances use different config directories. */
  providerInstanceId: Schema.optional(ProviderInstanceId),
  projectRoot: TrimmedNonEmptyString,
  worktreePaths: Schema.Array(TrimmedNonEmptyString),
});
export type ClaudeContextReadInput = typeof ClaudeContextReadInput.Type;

export const ClaudeContextFolder = Schema.Struct({
  key: ClaudeMemoryFolderKey,
  kind: Schema.Literals(["main", "worktree"]),
  label: TrimmedNonEmptyString,
  /** Null for a folder known only by its memory, such as a deleted worktree. */
  path: Schema.NullOr(TrimmedNonEmptyString),
  memoryDirectory: TrimmedNonEmptyString,
  index: Schema.NullOr(Schema.String),
});
export type ClaudeContextFolder = typeof ClaudeContextFolder.Type;

export const ClaudeMemory = Schema.Struct({
  folderKey: ClaudeMemoryFolderKey,
  fileName: ClaudeMemoryFileName,
  path: TrimmedNonEmptyString,
  /** The index line's link text, or the frontmatter name when the index has no line for it. */
  title: TrimmedNonEmptyString,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  type: Schema.NullOr(Schema.String),
  body: Schema.String,
  raw: Schema.String,
  modifiedAt: Schema.NullOr(Schema.Number),
});
export type ClaudeMemory = typeof ClaudeMemory.Type;

export const ClaudeInstructionFile = Schema.Struct({
  scope: Schema.Literals(["managed", "user", "project", "local"]),
  path: TrimmedNonEmptyString,
  /** Set for a file pulled in by an `@path` import in another instruction file. */
  importedBy: Schema.optional(TrimmedNonEmptyString),
  content: Schema.NullOr(Schema.String),
  editable: Schema.Boolean,
});
export type ClaudeInstructionFile = typeof ClaudeInstructionFile.Type;

export const ClaudeContextSnapshot = Schema.Struct({
  claudeHome: TrimmedNonEmptyString,
  folders: Schema.Array(ClaudeContextFolder),
  memories: Schema.Array(ClaudeMemory),
  instructions: Schema.Array(ClaudeInstructionFile),
});
export type ClaudeContextSnapshot = typeof ClaudeContextSnapshot.Type;

export const ClaudeMemoryWriteInput = Schema.Struct({
  providerInstanceId: Schema.optional(ProviderInstanceId),
  folderKey: ClaudeMemoryFolderKey,
  /** Omit to create a new file named after the title. */
  fileName: Schema.optional(ClaudeMemoryFileName),
  title: TrimmedNonEmptyString,
  description: Schema.String,
  type: ClaudeMemoryType,
  body: Schema.String,
  /** The file as the editor loaded it; a different file on disk fails with a conflict instead of overwriting. */
  expectedRaw: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ClaudeMemoryWriteInput = typeof ClaudeMemoryWriteInput.Type;

export const ClaudeMemoryDeleteInput = Schema.Struct({
  providerInstanceId: Schema.optional(ProviderInstanceId),
  folderKey: ClaudeMemoryFolderKey,
  fileName: ClaudeMemoryFileName,
});
export type ClaudeMemoryDeleteInput = typeof ClaudeMemoryDeleteInput.Type;

/** Restores a deleted memory exactly as it was, index line included. */
export const ClaudeMemoryRestoreInput = Schema.Struct({
  providerInstanceId: Schema.optional(ProviderInstanceId),
  folderKey: ClaudeMemoryFolderKey,
  fileName: ClaudeMemoryFileName,
  raw: Schema.String,
  indexLine: Schema.NullOr(Schema.String),
});
export type ClaudeMemoryRestoreInput = typeof ClaudeMemoryRestoreInput.Type;

export const ClaudeMemoryDeleteResult = Schema.Struct({
  raw: Schema.String,
  indexLine: Schema.NullOr(Schema.String),
});
export type ClaudeMemoryDeleteResult = typeof ClaudeMemoryDeleteResult.Type;

export const ClaudeUserInstructionsWriteInput = Schema.Struct({
  providerInstanceId: Schema.optional(ProviderInstanceId),
  content: Schema.String,
  /** Null when the editor saw no file yet. */
  expectedContent: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ClaudeUserInstructionsWriteInput = typeof ClaudeUserInstructionsWriteInput.Type;

export class ClaudeContextConflictError extends Schema.TaggedError<ClaudeContextConflictError>()(
  "ClaudeContextConflictError",
  {
    path: TrimmedNonEmptyString,
    current: Schema.NullOr(Schema.String),
  },
) {
  override get message(): string {
    return `${this.path} changed since you opened it.`;
  }
}

export class ClaudeContextError extends Schema.TaggedError<ClaudeContextError>()(
  "ClaudeContextError",
  {
    operation: Schema.Literals(["read", "write", "delete"]),
    path: Schema.optional(TrimmedNonEmptyString),
    detail: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return this.path ? `${this.detail} (${this.path})` : this.detail;
  }
}
