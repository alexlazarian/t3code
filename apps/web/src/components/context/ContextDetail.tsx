import {
  ClaudeContextConflictError,
  type ClaudeMemory,
  type ClaudeMemoryType,
  type EnvironmentId,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import type { ContextMachine } from "./ContextPage";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import {
  MEMORY_TYPES,
  displayPath,
  homeOf,
  skillSelectionName,
  instructionScopeLabel,
  isMemoryType,
  memoryTypeLabel,
  type ContextSelection,
  type ContextSkill,
  type ContextSource,
} from "./contextPage.logic";

export type ContextEditor =
  | {
      readonly kind: "new-memory";
      readonly environmentId: EnvironmentId;
      readonly folderKey: string;
    }
  | {
      readonly kind: "edit-memory";
      readonly environmentId: EnvironmentId;
      readonly folderKey: string;
      readonly fileName: string;
    }
  | { readonly kind: "edit-user-instructions"; readonly environmentId: EnvironmentId };

const isConflict = Schema.is(ClaudeContextConflictError);

const NEXT_SESSION_NOTE = "Claude reads it at the start of its next session.";

type Target = {
  readonly environmentId: EnvironmentId;
  readonly providerInstanceId: ProviderInstanceId;
};

function failureOf(result: { readonly _tag: string; readonly cause?: Cause.Cause<unknown> }) {
  return result._tag === "Failure" && result.cause
    ? Option.getOrNull(Cause.findErrorOption(result.cause))
    : null;
}

export type FolderChoice = {
  readonly value: string;
  readonly target: Target;
  readonly folderKey: string;
  readonly label: string;
  readonly group: string;
  readonly memoryDirectory: string;
  readonly home: string | null;
};

function folderChoiceValue(environmentId: EnvironmentId, folderKey: string): string {
  return `${environmentId}|${folderKey}`;
}

/** Every folder a memory can go in, grouped by project; deleted worktrees and outside folders included. */
function folderChoices(
  machines: ReadonlyArray<ContextMachine>,
  sources: ReadonlyArray<ContextSource>,
  currentFolderKey: string | null,
): ReadonlyArray<FolderChoice> {
  return sources.flatMap((source) => {
    const machine = machines.find((entry) => entry.environmentId === source.environmentId);
    if (!machine) return [];
    const titleOf = (projectRoot: string | null) =>
      projectRoot === null
        ? "Other folders"
        : (source.projects.find((project) => project.projectRoot === projectRoot)?.title ??
          projectRoot);
    return source.snapshot.folders
      .map((folder) => ({
        value: folderChoiceValue(source.environmentId, folder.key),
        target: {
          environmentId: machine.environmentId,
          providerInstanceId: machine.providerInstanceId,
        },
        folderKey: folder.key,
        label: `${folder.label} (${folder.kind === "main" ? "main checkout" : folder.kind === "worktree" ? "worktree" : "folder"}${folder.key === currentFolderKey ? ", this thread" : ""})`,
        group: `${titleOf(folder.projectRoot)}${source.machineLabel ? ` (${source.machineLabel})` : ""}`,
        memoryDirectory: folder.memoryDirectory,
        home: homeOf(source.snapshot.claudeHome),
      }))
      .toSorted((a, b) => a.group.localeCompare(b.group));
  });
}

export function ContextDetail(props: {
  readonly machines: ReadonlyArray<ContextMachine>;
  readonly sources: ReadonlyArray<ContextSource>;
  readonly current: { readonly environmentId: EnvironmentId; readonly projectRoot: string } | null;
  readonly currentFolderKey: string | null;
  readonly selection: ContextSelection | null;
  readonly setSelection: (selection: ContextSelection | null) => void;
  readonly editor: ContextEditor | null;
  readonly setEditor: (editor: ContextEditor | null) => void;
  readonly refresh: () => void;
  readonly skills: ReadonlyArray<ContextSkill>;
  readonly insert: ((text: string) => void) | null;
}) {
  const { selection, editor } = props;
  const environmentId = editor?.environmentId ?? selection?.environmentId ?? null;
  const source = props.sources.find((entry) => entry.environmentId === environmentId) ?? null;
  const machine = props.machines.find((entry) => entry.environmentId === environmentId) ?? null;
  if (editor && (source === null || machine === null)) return null;
  const snapshot = source?.snapshot ?? null;
  const home = snapshot ? homeOf(snapshot.claudeHome) : null;
  const target: Target | null = machine
    ? { environmentId: machine.environmentId, providerInstanceId: machine.providerInstanceId }
    : null;
  const isCurrentMachine = props.current?.environmentId === environmentId;
  const folderLabel = (key: string) =>
    snapshot?.folders.find((folder) => folder.key === key)?.label ?? key;

  if (editor?.kind === "new-memory" || editor?.kind === "edit-memory") {
    const memory =
      editor.kind === "edit-memory"
        ? (snapshot?.memories.find(
            (entry) => entry.folderKey === editor.folderKey && entry.fileName === editor.fileName,
          ) ?? null)
        : null;
    const choices = folderChoices(props.machines, props.sources, props.currentFolderKey);
    return (
      <MemoryEditor
        key={editor.kind === "edit-memory" ? `${editor.folderKey}/${editor.fileName}` : "new"}
        memory={memory}
        choices={choices}
        initialChoice={folderChoiceValue(editor.environmentId, editor.folderKey)}
        onDone={(saved, savedEnvironmentId) => {
          props.setEditor(null);
          props.refresh();
          if (saved) {
            props.setSelection({
              kind: "memory",
              environmentId: savedEnvironmentId,
              folderKey: saved.folderKey,
              fileName: saved.fileName,
            });
          }
        }}
        onCancel={() => props.setEditor(null)}
      />
    );
  }
  const userInstructions = snapshot?.instructions.find(
    (file) => file.scope === "user" && !file.importedBy,
  );
  if (editor?.kind === "edit-user-instructions" && userInstructions && target) {
    return (
      <UserInstructionsEditor
        target={target}
        path={userInstructions.path}
        home={home}
        initial={userInstructions.content}
        onDone={() => {
          props.setEditor(null);
          props.refresh();
        }}
        onCancel={() => props.setEditor(null)}
      />
    );
  }

  if (selection === null || snapshot === null || target === null) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Pick a memory, instruction file or skill</p>
        <p className="text-xs">
          Memories are what Claude saved per folder. Instruction files load every session.
        </p>
      </div>
    );
  }

  if (selection.kind === "folder") {
    const folder = snapshot.folders.find((entry) => entry.key === selection.folderKey);
    if (!folder) return null;
    return (
      <DetailFrame
        title="MEMORY.md"
        subtitle={`${folder.label} (${folder.kind === "main" ? "main checkout" : folder.kind === "worktree" ? "worktree" : "folder outside your projects"})`}
      >
        <Facts
          rows={[
            [
              "Folder",
              folder.path
                ? displayPath(folder.path, home)
                : folder.kind === "worktree"
                  ? "Worktree removed; its memory stays here."
                  : "A folder Claude ran in that is not one of your projects.",
            ],
            ["File", displayPath(`${folder.memoryDirectory}/MEMORY.md`, home)],
            [
              "Loaded",
              "At the start of every session that runs in this folder. Claude opens a memory file when its line looks relevant.",
            ],
          ]}
        />
        <Label>Contents</Label>
        <Pre>{folder.index ?? "No MEMORY.md yet. Adding a memory here creates it."}</Pre>
        <p className="text-2xs text-muted-foreground">
          One line per memory, written from its title and description. Saving or deleting a memory
          here rewrites its line.
        </p>
      </DetailFrame>
    );
  }

  if (selection.kind === "memory") {
    const memory = snapshot.memories.find(
      (entry) => entry.folderKey === selection.folderKey && entry.fileName === selection.fileName,
    );
    if (!memory) {
      return <p className="p-6 text-sm text-muted-foreground">This memory is gone.</p>;
    }
    return (
      <MemoryView
        target={target}
        memory={memory}
        home={home}
        folderLabel={folderLabel(memory.folderKey)}
        isCurrentFolder={isCurrentMachine && memory.folderKey === props.currentFolderKey}
        onEdit={() =>
          props.setEditor({
            kind: "edit-memory",
            environmentId: target.environmentId,
            folderKey: memory.folderKey,
            fileName: memory.fileName,
          })
        }
        onDeleted={() => {
          props.setSelection(null);
          props.refresh();
        }}
        onRestored={() => {
          props.refresh();
          props.setSelection(selection);
        }}
      />
    );
  }

  if (selection.kind === "instruction") {
    const file = snapshot.instructions.find((entry) => entry.path === selection.path);
    if (!file) return null;
    return (
      <DetailFrame
        title={file.path.split("/").at(-1) ?? file.path}
        subtitle={displayPath(file.path, home)}
        actions={
          file.editable ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                props.setEditor({
                  kind: "edit-user-instructions",
                  environmentId: target.environmentId,
                })
              }
            >
              {file.content === null ? "Create" : "Edit"}
            </Button>
          ) : null
        }
      >
        <Facts
          rows={[
            ["Scope", instructionScopeLabel(file.scope)],
            ...(file.importedBy
              ? [["Imported by", displayPath(file.importedBy, home)] as const]
              : []),
            [
              "Loaded",
              file.scope === "user"
                ? "At the start of every session in every project."
                : file.scope === "managed"
                  ? "Set by your organization for every session."
                  : "At the start of every session in this project.",
            ],
            ...(file.editable
              ? []
              : [
                  [
                    "Editing",
                    "Read-only here. Edit the file in the repo or ask the agent.",
                  ] as const,
                ]),
          ]}
        />
        <Label>Contents</Label>
        <Pre>{file.content ?? "Not created."}</Pre>
      </DetailFrame>
    );
  }

  const skill = props.skills.find(
    (entry) =>
      entry.environmentId === selection.environmentId &&
      skillSelectionName(entry) === selection.name,
  );
  if (!skill) return null;
  return (
    <DetailFrame
      title={skill.name}
      subtitle={skill.kind === "command" ? "Command" : "Skill"}
      actions={
        props.insert ? (
          <Button size="xs" variant="outline" onClick={() => props.insert?.(`${skill.name} `)}>
            Insert in composer
          </Button>
        ) : null
      }
    >
      <Facts
        rows={[
          ["Source", skill.projectTitle ? `project · ${skill.projectTitle}` : skill.source],
          [
            "Use",
            skill.projectTitle
              ? `Type ${skill.name} in a thread in ${skill.projectTitle}.`
              : `Type ${skill.name} in the composer.`,
          ],
        ]}
      />
      {skill.description ? <p className="text-sm">{skill.description}</p> : null}
    </DetailFrame>
  );
}

function MemoryView(props: {
  readonly target: Target;
  readonly memory: ClaudeMemory;
  readonly home: string | null;
  readonly folderLabel: string;
  readonly isCurrentFolder: boolean;
  readonly onEdit: () => void;
  readonly onDeleted: () => void;
  readonly onRestored: () => void;
}) {
  const { memory } = props;
  const deleteMemory = useAtomCommand(serverEnvironment.deleteClaudeMemory);
  const restoreMemory = useAtomCommand(serverEnvironment.restoreClaudeMemory);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    const result = await deleteMemory({
      environmentId: props.target.environmentId,
      input: {
        providerInstanceId: props.target.providerInstanceId,
        folderKey: memory.folderKey,
        fileName: memory.fileName,
      },
    });
    setBusy(false);
    if (result._tag !== "Success") return;
    props.onDeleted();
    const deleted = result.value;
    toastManager.add({
      type: "success",
      title: `Deleted "${memory.title}"`,
      description: "The file and its MEMORY.md line are gone.",
      actionProps: {
        children: "Undo",
        onClick: () => {
          void restoreMemory({
            environmentId: props.target.environmentId,
            input: {
              providerInstanceId: props.target.providerInstanceId,
              folderKey: memory.folderKey,
              fileName: memory.fileName,
              raw: deleted.raw,
              indexLine: deleted.indexLine,
            },
          }).then((restored) => {
            if (restored._tag === "Success") props.onRestored();
          });
        },
      },
    });
  };
  return (
    <DetailFrame
      title={memory.title}
      badge={memoryTypeLabel(memory.type).slice(0, 1)}
      actions={
        <>
          <Button size="xs" variant="outline" onClick={props.onEdit}>
            Edit
          </Button>
          <Button
            size="xs"
            variant="ghost-destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete
          </Button>
        </>
      }
    >
      <Facts
        rows={[
          [
            "Type",
            <>
              {memoryTypeLabel(memory.type)}
              <span className="text-muted-foreground">
                {" "}
                {MEMORY_TYPES.find((entry) => entry.id === memory.type)?.hint ?? ""}
              </span>
            </>,
          ],
          [
            "Folder",
            <>
              <span className="font-mono">{props.folderLabel}</span>
              {props.isCurrentFolder ? (
                <span className="text-muted-foreground"> this thread</span>
              ) : null}
              <div className="text-2xs text-muted-foreground">
                Only sessions in this folder load it.
              </div>
            </>,
          ],
          [
            "File",
            <span key="file" className="font-mono">
              {displayPath(memory.path, props.home)}
            </span>,
          ],
        ]}
      />
      {memory.description ? (
        <>
          <Label>Description</Label>
          <p className="text-sm">{memory.description}</p>
        </>
      ) : null}
      <Label>Body</Label>
      <p className="whitespace-pre-wrap text-sm">{memory.body.trim() || "Empty."}</p>
      <Label>File as Claude reads it</Label>
      <Pre>{memory.raw}</Pre>
    </DetailFrame>
  );
}

function MemoryEditor(props: {
  readonly memory: ClaudeMemory | null;
  readonly choices: ReadonlyArray<FolderChoice>;
  readonly initialChoice: string;
  readonly onDone: (saved: ClaudeMemory | null, environmentId: EnvironmentId) => void;
  readonly onCancel: () => void;
}) {
  const { memory } = props;
  const writeMemory = useAtomCommand(serverEnvironment.writeClaudeMemory, { reportFailure: false });
  const [title, setTitle] = useState(memory?.title ?? "");
  const [type, setType] = useState<ClaudeMemoryType>(
    memory && isMemoryType(memory.type) ? memory.type : "feedback",
  );
  const [choiceValue, setChoiceValue] = useState(props.initialChoice);
  const choice =
    props.choices.find((entry) => entry.value === choiceValue) ?? props.choices[0] ?? null;
  const [description, setDescription] = useState(memory?.description ?? "");
  const [body, setBody] = useState(memory?.body.trim() ?? "");
  const [conflict, setConflict] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0;

  const save = async (overwrite: boolean) => {
    if (!valid || saving || choice === null) return;
    setSaving(true);
    setError(null);
    const result = await writeMemory({
      environmentId: choice.target.environmentId,
      input: {
        providerInstanceId: choice.target.providerInstanceId,
        folderKey: choice.folderKey,
        ...(memory ? { fileName: memory.fileName } : {}),
        title: title.trim(),
        description: description.trim(),
        type,
        body,
        ...(overwrite ? {} : { expectedRaw: memory ? memory.raw : null }),
      },
    });
    setSaving(false);
    if (result._tag === "Success") {
      toastManager.add({
        type: "success",
        title: memory ? "Memory saved" : "Memory added",
        description: NEXT_SESSION_NOTE,
      });
      props.onDone(result.value, choice.target.environmentId);
      return;
    }
    const failure = failureOf(result);
    if (isConflict(failure)) {
      setConflict(failure.current);
      return;
    }
    setError(failure instanceof Error ? failure.message : "The memory could not be saved.");
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save(false);
    }
  };
  const typeHint = MEMORY_TYPES.find((entry) => entry.id === type)?.hint;

  return (
    <DetailFrame
      title={memory ? "Edit memory" : "New memory"}
      subtitle={displayPath(
        memory ? memory.path : `${choice?.memoryDirectory ?? ""}/<title>.md`,
        choice?.home ?? null,
      )}
    >
      <div onKeyDown={onKeyDown} className="flex flex-col gap-3">
        {conflict !== undefined ? (
          <div className="flex flex-wrap items-center gap-2 border border-warning/40 bg-warning-surface px-3 py-2 text-xs text-warning-foreground">
            <span className="flex-1">Claude changed this memory since you opened it.</span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => choice && props.onDone(null, choice.target.environmentId)}
            >
              Use Claude's version
            </Button>
            <Button size="xs" variant="warning-outline" onClick={() => void save(true)}>
              Keep mine
            </Button>
          </div>
        ) : null}
        <Field label="Title">
          <Input
            size="sm"
            autoFocus
            value={title}
            placeholder="One fact, e.g. Uses pnpm, not npm"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Type" hint={typeHint}>
          <div role="radiogroup" aria-label="Type" className="flex">
            {MEMORY_TYPES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={type === entry.id}
                onClick={() => setType(entry.id)}
                className={cn(
                  "h-6 cursor-pointer border border-input px-2 text-xs outline-none not-first:-ml-px focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  type === entry.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-popover hover:bg-accent",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Folder"
          hint={
            memory
              ? "Only sessions in this folder load it."
              : "Claude saves memory per folder. Only sessions in this folder load it. For every project, put it in your CLAUDE.md instead."
          }
        >
          {memory ? (
            <span className="font-mono text-xs">{choice?.label ?? memory.folderKey}</span>
          ) : (
            <select
              aria-label="Folder"
              value={choice?.value ?? ""}
              onChange={(event) => setChoiceValue(event.target.value)}
              className="h-6 border border-input bg-popover px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {[...new Set(props.choices.map((entry) => entry.group))].map((group) => (
                <optgroup key={group} label={group}>
                  {props.choices
                    .filter((entry) => entry.group === group)
                    .map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <Field label="Description" hint="Goes into MEMORY.md, which is all Claude sees up front.">
          <Input
            size="sm"
            value={description}
            placeholder="One line. Claude uses it to decide when this memory is relevant."
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label="Body">
          <Textarea
            value={body}
            placeholder="The details. Why it matters and how to apply it."
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button size="xs" disabled={!valid || saving} onClick={() => void save(false)}>
            {memory ? "Save" : "Add memory"}
          </Button>
          <Button size="xs" variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <span className="text-2xs text-muted-foreground">
            ⌘S saves, Esc cancels. Writes the file on the thread's machine.
          </span>
        </div>
      </div>
    </DetailFrame>
  );
}

function UserInstructionsEditor(props: {
  readonly target: Target;
  readonly path: string;
  readonly home: string | null;
  readonly initial: string | null;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}) {
  const write = useAtomCommand(serverEnvironment.writeClaudeUserInstructions, {
    reportFailure: false,
  });
  const [content, setContent] = useState(props.initial ?? "");
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (overwrite: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await write({
      environmentId: props.target.environmentId,
      input: {
        providerInstanceId: props.target.providerInstanceId,
        content,
        ...(overwrite ? {} : { expectedContent: props.initial }),
      },
    });
    setSaving(false);
    if (result._tag === "Success") {
      toastManager.add({
        type: "success",
        title: "CLAUDE.md saved",
        description: NEXT_SESSION_NOTE,
      });
      props.onDone();
      return;
    }
    const failure = failureOf(result);
    if (isConflict(failure)) {
      setConflict(true);
      return;
    }
    setError(failure instanceof Error ? failure.message : "CLAUDE.md could not be saved.");
  };
  return (
    <DetailFrame title="Edit CLAUDE.md" subtitle={displayPath(props.path, props.home)}>
      <div
        className="flex flex-col gap-3"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            void save(false);
          }
        }}
      >
        {conflict ? (
          <div className="flex flex-wrap items-center gap-2 border border-warning/40 bg-warning-surface px-3 py-2 text-xs text-warning-foreground">
            <span className="flex-1">CLAUDE.md changed on disk since you opened it.</span>
            <Button size="xs" variant="outline" onClick={props.onDone}>
              Use the file's version
            </Button>
            <Button size="xs" variant="warning-outline" onClick={() => void save(true)}>
              Keep mine
            </Button>
          </div>
        ) : null}
        <Textarea
          autoFocus
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="[&_textarea]:max-h-none [&_textarea]:min-h-80"
        />
        <p className="text-2xs text-muted-foreground">
          Loads at the start of every session in every project, so every line costs tokens in every
          thread. Keep it to rules you always want.
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button size="xs" disabled={saving} onClick={() => void save(false)}>
            Save
          </Button>
          <Button size="xs" variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <span className="text-2xs text-muted-foreground">⌘S saves, Esc cancels.</span>
        </div>
      </div>
    </DetailFrame>
  );
}

function DetailFrame(props: {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly badge?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-9 items-center gap-2 border-b border-border px-4 py-1.5">
        {props.badge ? (
          <span
            aria-hidden
            className="flex size-4 items-center justify-center border border-border text-3xs text-muted-foreground"
          >
            {props.badge}
          </span>
        ) : null}
        <h2 className="min-w-0 truncate text-sm font-semibold">{props.title}</h2>
        {props.subtitle ? (
          <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
            {props.subtitle}
          </span>
        ) : null}
        <span className="flex-1" />
        {props.actions}
      </div>
      <div className="flex flex-col gap-3 p-4">{props.children}</div>
    </div>
  );
}

function Facts(props: { readonly rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      {props.rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Field(props: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <label className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-3 text-xs">
      <span className="pt-1 text-muted-foreground">{props.label}</span>
      <span className="flex min-w-0 flex-col gap-1">
        {props.children}
        {props.hint ? <span className="text-2xs text-muted-foreground">{props.hint}</span> : null}
      </span>
    </label>
  );
}

function Label(props: { readonly children: ReactNode }) {
  return (
    <div className="text-3xs font-medium uppercase tracking-wider text-muted-foreground">
      {props.children}
    </div>
  );
}

function Pre(props: { readonly children: ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap border border-border bg-code p-3 font-mono text-xs text-foreground">
      {props.children}
    </pre>
  );
}
