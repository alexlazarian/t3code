import { CLAUDE_DRIVER_KIND } from "./contextPage.logic";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  resolveProviderSkillsForCwd,
  resolveProviderSlashCommandsForCwd,
} from "@t3tools/client-runtime/providerSkills";
import type { ClaudeContextSnapshot } from "@t3tools/contracts";
import { useLocation } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { useProject, useThreadShellsForProjectRefs } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import {
  librarySkillEntries,
  libraryInsertTarget,
  type LibrarySkillEntry,
} from "../library/Library.logic";
import { useInsertInComposer, useLibraryContext, useLibraryProvider } from "../library/useLibrary";
import { PanelTab } from "../PanelTab";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ContextDetail, type ContextEditor } from "./ContextDetail";
import {
  contextView,
  displayPath,
  instructionNote,
  instructionScopeLabel,
  memoryTypeLabel,
  projectWorktreePaths,
  selectionKey,
  type ContextSelection,
} from "./contextPage.logic";
import { useContextPageStore } from "./contextPageStore";

/** Covers the main area for the route it was opened on; Close or Esc goes back to it. */
export function ContextPageOverlay() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const openOn = useContextPageStore((store) => store.openOn);
  if (openOn !== pathname) return null;
  return <ContextPage />;
}

const NO_THREADS: ReadonlyArray<never> = [];

function ContextPage() {
  const close = useContextPageStore((store) => store.close);
  const ctx = useLibraryContext();
  const { environmentId, entries, entry, threadShell } = useLibraryProvider(ctx);
  const projectRef =
    ctx.environmentId !== null && ctx.projectId !== null
      ? scopeProjectRef(ctx.environmentId, ctx.projectId)
      : null;
  const project = useProject(projectRef);
  const threads = useThreadShellsForProjectRefs(projectRef ? [projectRef] : NO_THREADS);
  const claudeEntry =
    (entry?.driverKind === CLAUDE_DRIVER_KIND ? entry : null) ??
    entries.find((candidate) => candidate.driverKind === CLAUDE_DRIVER_KIND) ??
    null;
  const tabs = [
    ...new Map(entries.map((candidate) => [candidate.driverKind, candidate])).values(),
  ].toSorted((a, b) =>
    a.driverKind === CLAUDE_DRIVER_KIND ? -1 : b.driverKind === CLAUDE_DRIVER_KIND ? 1 : 0,
  );
  const [tab, setTab] = useState<string>(CLAUDE_DRIVER_KIND);
  const projectRoot = project?.workspaceRoot ?? null;
  const worktreePaths = projectRoot ? projectWorktreePaths(projectRoot, threads) : [];
  const queryAtom =
    environmentId !== null && projectRoot !== null && claudeEntry !== null
      ? serverEnvironment.claudeContext({
          environmentId,
          input: {
            providerInstanceId: claudeEntry.instanceId,
            projectRoot,
            worktreePaths: [...worktreePaths],
          },
        })
      : null;
  const query = useEnvironmentQuery(queryAtom);
  const [editor, setEditor] = useState<ContextEditor | null>(null);
  const insert = useInsertInComposer(libraryInsertTarget(ctx));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    if (editor) setEditor(null);
    else close();
  };

  return (
    <div
      role="region"
      aria-label="Context"
      onKeyDown={onKeyDown}
      className="absolute inset-x-0 top-(--main-header-height) bottom-0 z-40 flex min-h-0 flex-col bg-background text-foreground"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
        <span className="text-muted-foreground">Library</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="font-semibold">Context</span>
        {project ? <span className="truncate text-muted-foreground">{project.title}</span> : null}
        <span className="flex-1" />
        <Button size="xs" variant="ghost" onClick={close}>
          Close
        </Button>
      </div>
      <div
        role="tablist"
        aria-label="Providers"
        className="flex h-7 shrink-0 border-b border-border bg-sidebar"
      >
        {tabs.length === 0 ? (
          <PanelTab on aria-selected role="tab">
            Claude
          </PanelTab>
        ) : (
          tabs.map((candidate) => (
            <PanelTab
              key={candidate.driverKind}
              role="tab"
              on={tab === candidate.driverKind}
              aria-selected={tab === candidate.driverKind}
              onClick={() => {
                setTab(candidate.driverKind);
                setEditor(null);
              }}
            >
              {candidate.driverKind === CLAUDE_DRIVER_KIND ? "Claude" : candidate.displayName}
              {candidate.driverKind === CLAUDE_DRIVER_KIND && query.data ? (
                <span className="text-2xs opacity-70">{query.data.memories.length}</span>
              ) : null}
            </PanelTab>
          ))
        )}
      </div>
      {tab !== CLAUDE_DRIVER_KIND ? (
        <ContextEmpty>
          Not supported yet. Only Claude's memories and instruction files show here for now.
        </ContextEmpty>
      ) : projectRoot === null || environmentId === null ? (
        <ContextEmpty>Open a thread in a project to see what Claude loads for it.</ContextEmpty>
      ) : claudeEntry === null ? (
        <ContextEmpty>Claude is not set up on this machine.</ContextEmpty>
      ) : query.data === null ? (
        <ContextEmpty>{query.error ?? "Loading context..."}</ContextEmpty>
      ) : (
        <ClaudeContextBody
          environmentId={environmentId}
          providerInstanceId={claudeEntry.instanceId}
          snapshot={query.data}
          refresh={query.refresh}
          currentFolder={threadShell?.worktreePath ?? projectRoot}
          skills={librarySkillEntries(
            resolveProviderSkillsForCwd(
              claudeEntry.snapshot,
              threadShell?.worktreePath ?? projectRoot,
            ),
            resolveProviderSlashCommandsForCwd(
              claudeEntry.snapshot,
              threadShell?.worktreePath ?? projectRoot,
            ),
          )}
          insert={insert}
          onInserted={close}
          editor={editor}
          setEditor={setEditor}
        />
      )}
    </div>
  );
}

function ContextEmpty(props: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
      {props.children}
    </div>
  );
}

function claudeFolderKey(directory: string): string {
  return directory.replace(/[^A-Za-z0-9]/g, "-");
}

function ClaudeContextBody(props: {
  readonly environmentId: Parameters<typeof serverEnvironment.claudeContext>[0]["environmentId"];
  readonly providerInstanceId: NonNullable<
    Parameters<typeof serverEnvironment.claudeContext>[0]["input"]["providerInstanceId"]
  >;
  readonly snapshot: ClaudeContextSnapshot;
  readonly refresh: () => void;
  readonly currentFolder: string;
  readonly skills: ReadonlyArray<LibrarySkillEntry>;
  readonly insert: ((text: string) => void) | null;
  readonly onInserted: () => void;
  readonly editor: ContextEditor | null;
  readonly setEditor: (editor: ContextEditor | null) => void;
}) {
  const { snapshot } = props;
  const [query, setQuery] = useState("");
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<ContextSelection | null>(null);
  const currentFolderKey = claudeFolderKey(props.currentFolder);
  const view = contextView(snapshot, { folderKey, query: query.trim(), currentFolderKey });
  const home = snapshot.claudeHome.endsWith("/.claude") ? snapshot.claudeHome.slice(0, -8) : null;
  const skills = props.skills.filter(
    (skill) =>
      query.trim().length === 0 ||
      `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const allFolders = snapshot.folders.filter(
    (folder) =>
      folder.kind === "main" ||
      folder.index !== null ||
      snapshot.memories.some((memory) => memory.folderKey === folder.key) ||
      folder.key === currentFolderKey,
  );
  const selectedKey = selection ? selectionKey(selection) : null;
  const pick = (next: ContextSelection) => {
    setSelection(next);
    props.setEditor(null);
  };
  const defaultFolderKey =
    allFolders.find((folder) => folder.key === currentFolderKey)?.key ??
    allFolders.find((folder) => folder.kind === "main")?.key ??
    allFolders[0]?.key ??
    currentFolderKey;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        {allFolders.length > 1 ? (
          <select
            aria-label="Folder"
            value={folderKey ?? ""}
            onChange={(event) =>
              setFolderKey(event.target.value === "" ? null : event.target.value)
            }
            className="h-6 border border-input bg-popover px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <option value="">All folders ({allFolders.length})</option>
            {allFolders.map((folder) => (
              <option key={folder.key} value={folder.key}>
                {folder.label}
                {folder.key === currentFolderKey ? " (this thread)" : ""}
              </option>
            ))}
          </select>
        ) : null}
        <Input
          size="sm"
          aria-label="Search context"
          placeholder="Search context"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-64"
        />
        <span className="flex-1" />
        <Button
          size="xs"
          onClick={() => {
            setSelection(null);
            props.setEditor({ kind: "new-memory", folderKey: folderKey ?? defaultFolderKey });
          }}
        >
          <PlusIcon />
          New memory
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[min(26rem,45%)] shrink-0 flex-col overflow-y-auto border-r border-border">
          <ContextSection
            title="Memories"
            count={view.memories.length}
            trailing={`${view.folders.length} ${view.folders.length === 1 ? "folder" : "folders"}`}
          >
            {view.folders.map((folder) => (
              <ContextRow
                key={folder.key}
                badge="#"
                selected={selectedKey === selectionKey({ kind: "folder", folderKey: folder.key })}
                onClick={() => pick({ kind: "folder", folderKey: folder.key })}
                title={
                  <>
                    <span className="font-mono">{folder.label}</span>
                    {folder.key === currentFolderKey ? (
                      <span className="text-muted-foreground"> this thread</span>
                    ) : null}
                  </>
                }
                detail={`${folder.path ? displayPath(folder.path, home) : "worktree removed"} · MEMORY.md, ${folder.memoryCount} ${folder.memoryCount === 1 ? "memory" : "memories"}`}
                tag={folder.kind === "main" ? "main checkout" : "worktree"}
              />
            ))}
            {view.memories.map((memory) => (
              <ContextRow
                key={`${memory.folderKey}/${memory.fileName}`}
                badge={memoryTypeLabel(memory.type).slice(0, 1)}
                selected={
                  selectedKey ===
                  selectionKey({
                    kind: "memory",
                    folderKey: memory.folderKey,
                    fileName: memory.fileName,
                  })
                }
                onClick={() =>
                  pick({ kind: "memory", folderKey: memory.folderKey, fileName: memory.fileName })
                }
                title={memory.title}
                detail={memory.description ?? memory.body.split("\n")[0] ?? ""}
                tag={memory.folderLabel}
                monoTag
              />
            ))}
            {view.memories.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {query.trim().length > 0
                  ? "No memories match."
                  : "No memories yet. Claude saves them as it works, or add one."}
              </p>
            ) : null}
          </ContextSection>
          <ContextSection
            title="Instruction files"
            count={view.instructions.length}
            trailing="loaded every session"
          >
            {view.instructions.map((file) => (
              <ContextRow
                key={file.path}
                badge="md"
                indent={file.importedBy !== undefined}
                selected={selectedKey === selectionKey({ kind: "instruction", path: file.path })}
                onClick={() => pick({ kind: "instruction", path: file.path })}
                title={
                  <>
                    {file.path.split("/").at(-1)}
                    {instructionNote(file) ? (
                      <span className="text-muted-foreground"> {instructionNote(file)}</span>
                    ) : null}
                  </>
                }
                detail={displayPath(file.path, home)}
                monoDetail
                tag={instructionScopeLabel(file.scope)}
              />
            ))}
          </ContextSection>
          <ContextSection
            title="Skills & commands"
            count={skills.length}
            trailing="yours, project, plugin, built in"
          >
            {skills.map((skill) => (
              <ContextRow
                key={skill.name}
                badge={skill.kind === "command" ? "/" : "$"}
                selected={selectedKey === selectionKey({ kind: "skill", name: skill.name })}
                onClick={() => pick({ kind: "skill", name: skill.name })}
                title={skill.name}
                detail={skill.description ?? ""}
                tag={skill.source}
              />
            ))}
            {skills.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No skills or commands.</p>
            ) : null}
          </ContextSection>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <ContextDetail
            environmentId={props.environmentId}
            providerInstanceId={props.providerInstanceId}
            snapshot={snapshot}
            home={home}
            folders={allFolders}
            currentFolderKey={currentFolderKey}
            selection={selection}
            setSelection={setSelection}
            editor={props.editor}
            setEditor={props.setEditor}
            refresh={props.refresh}
            skills={props.skills}
            insert={
              props.insert
                ? (text) => {
                    props.insert?.(text);
                    props.onInserted();
                  }
                : null
            }
          />
        </div>
      </div>
    </div>
  );
}

function ContextSection(props: {
  readonly title: string;
  readonly count: number;
  readonly trailing: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-label={props.title}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="sticky top-0 z-10 flex h-6 w-full cursor-pointer items-center gap-1.5 border-b border-border bg-sidebar px-3 text-3xs font-medium uppercase tracking-wider text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        {props.title}
        <span className="tabular-nums">{props.count}</span>
        <span className="flex-1" />
        <span className="normal-case tracking-normal">{props.trailing}</span>
      </button>
      {open ? <div className="flex flex-col">{props.children}</div> : null}
    </section>
  );
}

function ContextRow(props: {
  readonly badge: string;
  readonly title: ReactNode;
  readonly detail: string;
  readonly tag: string;
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly indent?: boolean;
  readonly monoTag?: boolean;
  readonly monoDetail?: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={props.selected ? "true" : undefined}
      onClick={props.onClick}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 border-b border-border/60 px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        props.selected ? "bg-nav-selected" : "hover:bg-accent/50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center border border-border text-3xs text-muted-foreground",
          props.indent && "ml-3",
        )}
      >
        {props.badge}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-xs">{props.title}</span>
          <span
            className={cn(
              "max-w-[45%] shrink-0 truncate text-2xs text-muted-foreground",
              props.monoTag && "font-mono",
            )}
          >
            {props.tag}
          </span>
        </span>
        {props.detail ? (
          <span
            className={cn(
              "truncate text-2xs text-muted-foreground",
              props.monoDetail && "font-mono",
            )}
          >
            {props.detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}
