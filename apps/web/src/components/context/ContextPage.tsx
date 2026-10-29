import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  resolveProviderSkillsForCwd,
  resolveProviderSlashCommandsForCwd,
} from "@t3tools/client-runtime/providerSkills";
import type { ClaudeInstructionFile, EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { useLocation } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { PlusIcon } from "lucide-react";
import { useContext, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { deriveProviderInstanceEntries, type ProviderInstanceEntry } from "../../providerInstances";
import { claudeContextsAtom, type ClaudeContextTarget } from "../../state/claudeContext";
import { useProjects, useQuietThreadShell, useThreadShells } from "../../state/entities";
import { useEnvironmentProviders, useEnvironments } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { librarySkillEntries, libraryInsertTarget } from "../library/Library.logic";
import { useInsertInComposer, useLibraryContext } from "../library/useLibrary";
import { PanelTab } from "../PanelTab";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ContextDetail, type ContextEditor } from "./ContextDetail";
import {
  ALL_PROJECTS,
  CLAUDE_DRIVER_KIND,
  claudeFolderKey,
  contextGroupKey,
  contextView,
  displayPath,
  homeOf,
  instructionNote,
  instructionScopeLabel,
  memoryTypeLabel,
  projectWorktreePaths,
  selectionKey,
  skillSelectionName,
  type ContextSelection,
  type ContextSkill,
  type ContextSource,
} from "./contextPage.logic";
import { useContextPageStore } from "./contextPageStore";

/** Covers the main area for the route it was opened on; Close or Esc goes back to it. */
export function ContextPageOverlay() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const openOn = useContextPageStore((store) => store.openOn);
  if (openOn !== pathname) return null;
  return <ContextPage />;
}

export type ContextMachine = {
  readonly environmentId: EnvironmentId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly claude: ProviderInstanceEntry;
};

function ContextPage() {
  const close = useContextPageStore((store) => store.close);
  const openedThread = useContextPageStore((store) => store.thread);
  const routeCtx = useLibraryContext();
  const threadRef =
    routeCtx.threadRef ??
    (openedThread ? scopeThreadRef(openedThread.environmentId, openedThread.threadId) : null);
  const threadShell = useQuietThreadShell(threadRef);
  const projects = useProjects();
  const threads = useThreadShells();
  const providersByEnvironment = useEnvironmentProviders();
  const { environments } = useEnvironments();
  const [tab, setTab] = useState<string>(CLAUDE_DRIVER_KIND);
  const [editor, setEditor] = useState<ContextEditor | null>(null);
  const insert = useInsertInComposer(libraryInsertTarget({ ...routeCtx, threadRef }));

  const machineIds = [
    ...new Set([
      ...projects.map((project) => project.environmentId),
      ...providersByEnvironment.keys(),
    ]),
  ];
  const entriesByMachine = new Map(
    machineIds.map((environmentId) => [
      environmentId,
      deriveProviderInstanceEntries(providersByEnvironment.get(environmentId) ?? []),
    ]),
  );
  const tabs = [
    ...new Map(
      [...entriesByMachine.values()].flat().map((candidate) => [candidate.driverKind, candidate]),
    ).values(),
  ].toSorted((a, b) =>
    a.driverKind === CLAUDE_DRIVER_KIND ? -1 : b.driverKind === CLAUDE_DRIVER_KIND ? 1 : 0,
  );

  const machines: Array<ContextMachine> = [];
  for (const [environmentId, entries] of entriesByMachine) {
    const claude =
      entries.find(
        (entry) =>
          entry.driverKind === CLAUDE_DRIVER_KIND &&
          threadShell?.environmentId === environmentId &&
          entry.instanceId === threadShell.modelSelection.instanceId,
      ) ?? entries.find((entry) => entry.driverKind === CLAUDE_DRIVER_KIND && entry.enabled);
    if (claude) machines.push({ environmentId, providerInstanceId: claude.instanceId, claude });
  }
  const targets: Array<ClaudeContextTarget> = machines.map((machine) => ({
    environmentId: machine.environmentId,
    input: {
      providerInstanceId: machine.providerInstanceId,
      projects: projects
        .filter((project) => project.environmentId === machine.environmentId)
        .toSorted((a, b) => a.workspaceRoot.localeCompare(b.workspaceRoot))
        .map((project) => ({
          projectRoot: project.workspaceRoot,
          worktreePaths: [
            ...projectWorktreePaths(
              project.workspaceRoot,
              threads.filter(
                (thread) =>
                  thread.environmentId === project.environmentId && thread.projectId === project.id,
              ),
            ),
          ],
        })),
    },
  }));
  const results = useAtomValue(claudeContextsAtom(JSON.stringify(targets)));
  const registry = useContext(RegistryContext);
  const refresh = () => {
    for (const target of targets) registry.refresh(serverEnvironment.claudeContext(target));
  };
  const machineLabel = (environmentId: EnvironmentId) =>
    machines.length > 1
      ? (environments.find((environment) => environment.environmentId === environmentId)?.label ??
        null)
      : null;
  const sources: Array<ContextSource> = results.flatMap(({ target, result }) => {
    const snapshot = AsyncResult.getOrElse(result, () => null);
    if (snapshot === null) return [];
    return [
      {
        environmentId: target.environmentId,
        machineLabel: machineLabel(target.environmentId),
        snapshot,
        projects: projects
          .filter((project) => project.environmentId === target.environmentId)
          .map((project) => ({ projectRoot: project.workspaceRoot, title: project.title })),
      },
    ];
  });
  const errors = results.flatMap(({ result }) =>
    result._tag === "Failure" ? [String(Cause.squash(result.cause))] : [],
  );

  const currentProject = threadShell
    ? projects.find(
        (project) =>
          project.environmentId === threadShell.environmentId &&
          project.id === threadShell.projectId,
      )
    : undefined;
  const current = currentProject
    ? { environmentId: currentProject.environmentId, projectRoot: currentProject.workspaceRoot }
    : null;
  const currentFolder = currentProject
    ? (threadShell?.worktreePath ?? currentProject.workspaceRoot)
    : null;

  const skills: Array<ContextSkill> = machines.flatMap((machine) => {
    const threadCwd = current?.environmentId === machine.environmentId ? currentFolder : null;
    const base = librarySkillEntries(
      resolveProviderSkillsForCwd(machine.claude.snapshot, threadCwd),
      resolveProviderSlashCommandsForCwd(machine.claude.snapshot, threadCwd),
    )
      .filter((skill) => skill.source !== "project")
      .map((skill) => ({ ...skill, environmentId: machine.environmentId, projectTitle: null }));
    const perProject = projects
      .filter((project) => project.environmentId === machine.environmentId)
      .flatMap((project) =>
        librarySkillEntries(
          resolveProviderSkillsForCwd(machine.claude.snapshot, project.workspaceRoot),
          [],
        )
          .filter((skill) => skill.source === "project")
          .map((skill) => ({
            ...skill,
            environmentId: machine.environmentId,
            projectTitle: project.title,
          })),
      );
    return [...base, ...perProject];
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    if (editor) setEditor(null);
    else close();
  };
  const memoryCount = sources.reduce((total, source) => total + source.snapshot.memories.length, 0);

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
        {(tabs.length === 0 ? [null] : tabs).map((candidate) => {
          const kind = candidate?.driverKind ?? CLAUDE_DRIVER_KIND;
          const isClaude = kind === CLAUDE_DRIVER_KIND;
          return (
            <PanelTab
              key={kind}
              role="tab"
              on={tab === kind}
              aria-selected={tab === kind}
              onClick={() => {
                setTab(kind);
                setEditor(null);
              }}
            >
              {isClaude ? "Claude" : candidate?.displayName}
              {isClaude && sources.length > 0 ? (
                <span className="text-2xs opacity-70">{memoryCount}</span>
              ) : null}
            </PanelTab>
          );
        })}
      </div>
      {tab !== CLAUDE_DRIVER_KIND ? (
        <ContextEmpty>
          Not supported yet. Only Claude's memories and instruction files show here for now.
        </ContextEmpty>
      ) : machines.length === 0 ? (
        <ContextEmpty>Claude is not set up on any connected machine.</ContextEmpty>
      ) : sources.length === 0 ? (
        <ContextEmpty>{errors[0] ?? "Loading context..."}</ContextEmpty>
      ) : (
        <ClaudeContextBody
          machines={machines}
          sources={sources}
          refresh={refresh}
          current={current}
          currentFolderKey={currentFolder === null ? null : claudeFolderKey(currentFolder)}
          skills={skills}
          insert={
            insert
              ? (text) => {
                  insert(text);
                  close();
                }
              : null
          }
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

function ClaudeContextBody(props: {
  readonly machines: ReadonlyArray<ContextMachine>;
  readonly sources: ReadonlyArray<ContextSource>;
  readonly refresh: () => void;
  readonly current: { readonly environmentId: EnvironmentId; readonly projectRoot: string } | null;
  readonly currentFolderKey: string | null;
  readonly skills: ReadonlyArray<ContextSkill>;
  readonly insert: ((text: string) => void) | null;
  readonly editor: ContextEditor | null;
  readonly setEditor: (editor: ContextEditor | null) => void;
}) {
  const { sources, current } = props;
  const [query, setQuery] = useState("");
  const [groupKey, setGroupKey] = useState(ALL_PROJECTS);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<ContextSelection | null>(null);
  const trimmed = query.trim();
  const view = contextView(sources, {
    groupKey,
    folderKey,
    query: trimmed,
    current,
    currentFolderKey: props.currentFolderKey,
  });
  const groupOptions = sources.flatMap((source) => [
    ...source.projects
      .toSorted((a, b) => a.title.localeCompare(b.title))
      .map((project) => ({
        key: contextGroupKey(source.environmentId, project.projectRoot),
        label: `${project.title}${source.machineLabel ? ` (${source.machineLabel})` : ""}`,
      })),
    {
      key: contextGroupKey(source.environmentId, null),
      label: `Other folders${source.machineLabel ? ` (${source.machineLabel})` : ""}`,
    },
  ]);
  const pickedGroup = groupKey === ALL_PROJECTS ? null : (view.groups[0] ?? null);
  const pickedFolders = pickedGroup
    ? (sources
        .find((source) => source.environmentId === pickedGroup.environmentId)
        ?.snapshot.folders.filter((folder) => folder.projectRoot === pickedGroup.projectRoot) ?? [])
    : [];
  const needle = trimmed.toLowerCase();
  const skills = props.skills.filter(
    (skill) =>
      (needle.length === 0 ||
        `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(needle)) &&
      (pickedGroup === null ||
        (skill.environmentId === pickedGroup.environmentId &&
          (skill.projectTitle === null || skill.projectTitle === pickedGroup.title))),
  );
  const selectedKey = selection ? selectionKey(selection) : null;
  const pick = (next: ContextSelection) => {
    setSelection(next);
    props.setEditor(null);
  };
  const homeFor = (environmentId: EnvironmentId) => {
    const source = sources.find((candidate) => candidate.environmentId === environmentId);
    return source ? homeOf(source.snapshot.claudeHome) : null;
  };
  // New memories go to the picked folder, else the picked project's checkout, else this thread's folder.
  const newMemoryTarget = () => {
    if (pickedGroup && folderKey) return { environmentId: pickedGroup.environmentId, folderKey };
    const pickedMain = pickedFolders.find((folder) => folder.kind === "main") ?? pickedFolders[0];
    if (pickedGroup && pickedMain) {
      return { environmentId: pickedGroup.environmentId, folderKey: pickedMain.key };
    }
    if (current && props.currentFolderKey) {
      return { environmentId: current.environmentId, folderKey: props.currentFolderKey };
    }
    const first = sources[0];
    const firstFolder = first?.snapshot.folders[0];
    return first && firstFolder
      ? { environmentId: first.environmentId, folderKey: firstFolder.key }
      : null;
  };
  const memoryTotal = view.groups.reduce((total, group) => total + group.memories.length, 0);
  const instructionTotal =
    view.userInstructions.length +
    view.groups.reduce((total, group) => total + group.instructions.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <select
          aria-label="Project"
          value={groupKey}
          onChange={(event) => {
            setGroupKey(event.target.value);
            setFolderKey(null);
          }}
          className="h-6 max-w-56 border border-input bg-popover px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <option value={ALL_PROJECTS}>All projects</option>
          {groupOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        {pickedFolders.length > 1 ? (
          <select
            aria-label="Folder"
            value={folderKey ?? ""}
            onChange={(event) =>
              setFolderKey(event.target.value === "" ? null : event.target.value)
            }
            className="h-6 max-w-48 border border-input bg-popover px-1.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <option value="">All folders ({pickedFolders.length})</option>
            {pickedFolders.map((folder) => (
              <option key={folder.key} value={folder.key}>
                {folder.label}
                {folder.key === props.currentFolderKey ? " (this thread)" : ""}
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
            const target = newMemoryTarget();
            if (!target) return;
            setSelection(null);
            props.setEditor({ kind: "new-memory", ...target });
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
            count={memoryTotal}
            trailing={`${view.groups.length} ${view.groups.length === 1 ? "group" : "groups"}`}
          >
            {view.groups.map((group) => {
              if (group.folders.length === 0 && group.memories.length === 0) return null;
              const home = homeFor(group.environmentId);
              const isCurrent =
                current !== null &&
                group.environmentId === current.environmentId &&
                group.projectRoot === current.projectRoot;
              return (
                <div key={group.key}>
                  <GroupHeader
                    title={group.title}
                    note={[
                      isCurrent ? "this thread" : null,
                      group.machineLabel,
                      `${group.memories.length} ${group.memories.length === 1 ? "memory" : "memories"}`,
                    ]}
                  />
                  {group.folders.map((folder) => {
                    const folderSelection: ContextSelection = {
                      kind: "folder",
                      environmentId: group.environmentId,
                      folderKey: folder.key,
                    };
                    return (
                      <ContextRow
                        key={folder.key}
                        badge="#"
                        selected={selectedKey === selectionKey(folderSelection)}
                        onClick={() => pick(folderSelection)}
                        title={
                          <>
                            <span className="font-mono">{folder.label}</span>
                            {isCurrent && folder.key === props.currentFolderKey ? (
                              <span className="text-muted-foreground"> this thread</span>
                            ) : null}
                          </>
                        }
                        detail={`${
                          folder.path
                            ? displayPath(folder.path, home)
                            : folder.kind === "other"
                              ? "outside your projects"
                              : "worktree removed"
                        } · ${folder.memoryCount} ${folder.memoryCount === 1 ? "memory" : "memories"}`}
                        tag={
                          folder.kind === "main"
                            ? "main checkout"
                            : folder.kind === "worktree"
                              ? "worktree"
                              : "folder"
                        }
                      />
                    );
                  })}
                  {group.memories.map((memory) => {
                    const memorySelection: ContextSelection = {
                      kind: "memory",
                      environmentId: group.environmentId,
                      folderKey: memory.folderKey,
                      fileName: memory.fileName,
                    };
                    return (
                      <ContextRow
                        key={`${memory.folderKey}/${memory.fileName}`}
                        badge={memoryTypeLabel(memory.type).slice(0, 1)}
                        selected={selectedKey === selectionKey(memorySelection)}
                        onClick={() => pick(memorySelection)}
                        title={memory.title}
                        detail={memory.description ?? memory.body.split("\n")[0] ?? ""}
                        tag={memory.folderLabel}
                        monoTag
                      />
                    );
                  })}
                </div>
              );
            })}
            {memoryTotal === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {trimmed.length > 0
                  ? "No memories match."
                  : "No memories yet. Claude saves them as it works, or add one."}
              </p>
            ) : null}
          </ContextSection>
          <ContextSection
            title="Instruction files"
            count={instructionTotal}
            trailing="loaded every session"
          >
            {view.userInstructions.map(({ environmentId, machineLabel, file }) => (
              <InstructionRow
                key={`${environmentId}:${file.path}`}
                environmentId={environmentId}
                file={file}
                home={homeFor(environmentId)}
                tag={`${instructionScopeLabel(file.scope)}${machineLabel ? ` · ${machineLabel}` : ""}`}
                selectedKey={selectedKey}
                onPick={pick}
              />
            ))}
            {view.groups.map((group) =>
              group.instructions.length === 0 ? null : (
                <div key={group.key}>
                  <GroupHeader title={group.title} note={[group.machineLabel]} />
                  {group.instructions.map((file) => (
                    <InstructionRow
                      key={`${group.environmentId}:${file.path}`}
                      environmentId={group.environmentId}
                      file={file}
                      home={homeFor(group.environmentId)}
                      tag={instructionScopeLabel(file.scope)}
                      selectedKey={selectedKey}
                      onPick={pick}
                    />
                  ))}
                </div>
              ),
            )}
          </ContextSection>
          <ContextSection
            title="Skills & commands"
            count={skills.length}
            trailing="yours, project, plugin, built in"
          >
            {skills.map((skill) => {
              const skillSelection: ContextSelection = {
                kind: "skill",
                environmentId: skill.environmentId,
                name: skillSelectionName(skill),
              };
              return (
                <ContextRow
                  key={`${skill.environmentId}:${skillSelectionName(skill)}`}
                  badge={skill.kind === "command" ? "/" : "$"}
                  selected={selectedKey === selectionKey(skillSelection)}
                  onClick={() => pick(skillSelection)}
                  title={skill.name}
                  detail={skill.description ?? ""}
                  tag={skill.projectTitle ? `project · ${skill.projectTitle}` : skill.source}
                />
              );
            })}
            {skills.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No skills or commands.</p>
            ) : null}
          </ContextSection>
          {view.emptyCount > 0 ? (
            <p className="px-3 py-2 text-2xs text-muted-foreground">
              {view.emptyCount} {view.emptyCount === 1 ? "project has" : "projects have"} no
              memories or instruction files yet. Pick one above to see it or add a memory.
            </p>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <ContextDetail
            machines={props.machines}
            sources={sources}
            current={current}
            currentFolderKey={props.currentFolderKey}
            selection={selection}
            setSelection={setSelection}
            editor={props.editor}
            setEditor={props.setEditor}
            refresh={props.refresh}
            skills={props.skills}
            insert={props.insert}
          />
        </div>
      </div>
    </div>
  );
}

function InstructionRow(props: {
  readonly environmentId: EnvironmentId;
  readonly file: ClaudeInstructionFile;
  readonly home: string | null;
  readonly tag: string;
  readonly selectedKey: string | null;
  readonly onPick: (selection: ContextSelection) => void;
}) {
  const { file } = props;
  const selection: ContextSelection = {
    kind: "instruction",
    environmentId: props.environmentId,
    path: file.path,
  };
  return (
    <ContextRow
      badge="md"
      indent={file.importedBy !== undefined}
      selected={props.selectedKey === selectionKey(selection)}
      onClick={() => props.onPick(selection)}
      title={
        <>
          {file.path.split("/").at(-1)}
          {instructionNote(file) ? (
            <span className="text-muted-foreground"> {instructionNote(file)}</span>
          ) : null}
        </>
      }
      detail={displayPath(file.path, props.home)}
      monoDetail
      tag={props.tag}
    />
  );
}

function GroupHeader(props: {
  readonly title: string;
  readonly note: ReadonlyArray<string | null>;
}) {
  const note = props.note.filter((part): part is string => part !== null).join(" · ");
  return (
    <div className="flex h-6 items-center gap-2 border-b border-border/60 bg-sidebar/60 px-3 text-xs">
      <span className="min-w-0 truncate font-medium">{props.title}</span>
      <span className="flex-1" />
      {note ? <span className="shrink-0 text-2xs text-muted-foreground">{note}</span> : null}
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
