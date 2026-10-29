import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "../../composerDraftStore";
import type { PromptStashEntry } from "../../promptStashStore";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  LIBRARY_GROUPS,
  appendComposerText,
  libraryContextFromRoute,
  libraryInsertTarget,
  libraryModelAction,
  librarySkillEntries,
  resolveLibraryProviderEntry,
  stashEntryInsertText,
  type LibraryContext,
} from "./Library.logic";

const threadRef = { environmentId: EnvironmentId.make("env-1"), threadId: ThreadId.make("t-1") };
const draftId = DraftId.make("draft-1");
const none: LibraryContext = {
  threadRef: null,
  draftId: null,
  projectId: null,
  environmentId: null,
};

describe("libraryInsertTarget", () => {
  it("insert target is the open thread, else the open draft, else null", () => {
    expect(libraryInsertTarget({ ...none, threadRef, draftId })).toBe(threadRef);
    expect(libraryInsertTarget({ ...none, draftId })).toBe(draftId);
    expect(libraryInsertTarget(none)).toBeNull();
  });
});

describe("LIBRARY_GROUPS", () => {
  it("categories keep the prototype order", () => {
    expect(LIBRARY_GROUPS.map((g) => [g.group, g.categories.map((c) => c.id)])).toEqual([
      ["Library", ["context", "models", "providers", "access", "stash", "scheduled"]],
      ["Places", ["projects", "machines"]],
    ]);
  });
});

describe("libraryContextFromRoute", () => {
  it("reads project and environment from the thread shell", () => {
    expect(
      libraryContextFromRoute({ kind: "server", threadRef }, null, {
        projectId: ProjectId.make("p-1"),
      }),
    ).toEqual({ threadRef, draftId: null, projectId: "p-1", environmentId: "env-1" });
  });

  it("reads project and environment from the draft session", () => {
    expect(
      libraryContextFromRoute(
        { kind: "draft", draftId },
        { projectId: ProjectId.make("p-2"), environmentId: EnvironmentId.make("env-2") },
        null,
      ),
    ).toEqual({ threadRef: null, draftId, projectId: "p-2", environmentId: "env-2" });
  });

  it("is empty off the thread and draft routes", () => {
    expect(libraryContextFromRoute(null, null, null)).toEqual(none);
  });
});

function provider(instanceId: string, overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

describe("appendComposerText", () => {
  it("separates a new word from the prompt with exactly one space", () => {
    expect(appendComposerText("", "/goal ")).toBe("/goal ");
    expect(appendComposerText("fix it", "/goal ")).toBe("fix it /goal ");
    expect(appendComposerText("fix it ", "/goal ")).toBe("fix it /goal ");
    expect(appendComposerText("fix it\n", "/goal ")).toBe("fix it\n/goal ");
  });
});

describe("librarySkillEntries", () => {
  it("lists commands then invocable skills, dropping commands a skill already covers", () => {
    const skill = (name: string, extra: object = {}) => ({
      name,
      path: `/skills/${name}`,
      enabled: true,
      ...extra,
    });
    expect(
      librarySkillEntries(
        [
          skill("code-review", { shortDescription: "Review the diff.", scope: "user" }),
          skill("test-app", { scope: "project" }),
          skill("figma:use", { scope: "user" }),
          skill("agent-only", { userInvocable: false }),
          skill("off", { enabled: false }),
        ],
        [{ name: "goal", description: "Keep working." }, { name: "code-review" }],
      ),
    ).toEqual([
      { name: "/goal", kind: "command", source: "built in", description: "Keep working." },
      { name: "$code-review", kind: "skill", source: "yours", description: "Review the diff." },
      { name: "$test-app", kind: "skill", source: "project", description: null },
      { name: "$figma:use", kind: "skill", source: "plugin", description: null },
    ]);
  });
});

describe("resolveLibraryProviderEntry", () => {
  const entries = deriveProviderInstanceEntries([
    provider("down", { status: "error" }),
    provider("codex"),
    provider("claude"),
  ]);

  it("uses the open thread's provider, even when it is not ready", () => {
    expect(resolveLibraryProviderEntry(entries, ProviderInstanceId.make("down"))?.instanceId).toBe(
      "down",
    );
  });

  it("falls back to the first ready provider", () => {
    expect(resolveLibraryProviderEntry(entries, null)?.instanceId).toBe("codex");
    expect(resolveLibraryProviderEntry([], null)).toBeNull();
  });
});

describe("libraryModelAction", () => {
  const [ready, notReady] = deriveProviderInstanceEntries([
    provider("codex"),
    provider("claude", { installed: false, status: "error" }),
  ]);

  it("same provider as the open thread switches it, any other starts a new thread", () => {
    expect(libraryModelAction(ready!, ProviderInstanceId.make("codex"))).toBe("use");
    expect(libraryModelAction(ready!, ProviderInstanceId.make("claude"))).toBe("new");
    expect(libraryModelAction(ready!, null)).toBe("new");
  });

  it("a provider that is not set up only offers setup", () => {
    expect(libraryModelAction(notReady!, ProviderInstanceId.make("claude"))).toBe("setup");
  });
});

describe("stashEntryInsertText", () => {
  const entry = (extra: Partial<PromptStashEntry> = {}): PromptStashEntry => ({
    id: "s-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    prompt: "Refactor idea for later",
    attachments: [],
    droppedImageNames: [],
    ...extra,
  });

  it("inserts plain-text entries", () => {
    expect(stashEntryInsertText(entry())).toBe("Refactor idea for later");
  });

  it("leaves entries with attachments or context to the composer's restore", () => {
    expect(stashEntryInsertText(entry({ droppedImageNames: ["a.png"] }))).toBeNull();
    expect(stashEntryInsertText(entry({ records: [], pendingImageCount: 1 }))).toBeNull();
    expect(stashEntryInsertText(entry({ prompt: "  " }))).toBeNull();
  });
});
