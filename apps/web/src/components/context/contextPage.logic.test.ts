import { EnvironmentId, type ClaudeContextSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  ALL_PROJECTS,
  contextGroupKey,
  contextView,
  type ContextSource,
} from "./contextPage.logic";

const environmentId = EnvironmentId.make("local");

const folder = (
  key: string,
  projectRoot: string | null,
  kind: "main" | "worktree" | "other" = "main",
) => ({
  key,
  kind,
  projectRoot,
  label: key,
  path: projectRoot,
  memoryDirectory: `/h/.claude/projects/${key}/memory`,
  index: null,
});

const memory = (folderKey: string, title: string) => ({
  folderKey,
  fileName: `${title}.md`,
  path: `/h/.claude/projects/${folderKey}/memory/${title}.md`,
  title,
  name: title,
  description: null,
  type: "feedback",
  body: "",
  raw: "",
  modifiedAt: null,
});

const snapshot: ClaudeContextSnapshot = {
  claudeHome: "/h/.claude",
  folders: [
    folder("app", "/code/app"),
    folder("site", "/code/site"),
    folder("scratch", null, "other"),
  ],
  memories: [memory("app", "use-vp"), memory("scratch", "loose")],
  instructions: [
    { scope: "user", path: "/h/.claude/CLAUDE.md", content: "# Mine", editable: true },
    {
      scope: "project",
      projectRoot: "/code/app",
      path: "/code/app/CLAUDE.md",
      content: "x",
      editable: false,
    },
    {
      scope: "local",
      projectRoot: "/code/app",
      path: "/code/app/CLAUDE.local.md",
      content: null,
      editable: false,
    },
    {
      scope: "project",
      projectRoot: "/code/site",
      path: "/code/site/CLAUDE.md",
      content: null,
      editable: false,
    },
  ],
};

const sources: ReadonlyArray<ContextSource> = [
  {
    environmentId,
    machineLabel: null,
    snapshot,
    projects: [
      { projectRoot: "/code/app", title: "app" },
      { projectRoot: "/code/site", title: "site" },
    ],
  },
];

const options = { folderKey: null, query: "", current: null, currentFolderKey: null };

describe("contextView", () => {
  it("lists every project with context, then folders outside them, and counts the empty ones", () => {
    const view = contextView(sources, { ...options, groupKey: ALL_PROJECTS });
    expect(
      view.groups.map((group) => [
        group.title,
        group.memories.map((entry) => entry.title),
        group.instructions.map((file) => file.path),
      ]),
    ).toEqual([
      ["app", ["use-vp"], ["/code/app/CLAUDE.md"]],
      ["Other folders", ["loose"], []],
    ]);
    expect(view.emptyCount).toBe(1);
    expect(view.userInstructions.map(({ file }) => file.path)).toEqual(["/h/.claude/CLAUDE.md"]);
  });

  it("shows a picked project's empty checkout and missing files so a memory can be added", () => {
    const view = contextView(sources, {
      ...options,
      groupKey: contextGroupKey(environmentId, "/code/site"),
    });
    expect(
      view.groups.map((group) => [
        group.title,
        group.folders.map((entry) => entry.key),
        group.instructions.map((file) => file.path),
      ]),
    ).toEqual([["site", ["site"], ["/code/site/CLAUDE.md"]]]);
  });

  it("puts the open thread's project first", () => {
    const view = contextView(sources, {
      ...options,
      groupKey: ALL_PROJECTS,
      current: { environmentId, projectRoot: "/code/site" },
      currentFolderKey: "site",
    });
    expect(view.groups.map((group) => group.title)).toEqual(["site", "app", "Other folders"]);
  });
});
