import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DraftId } from "../../composerDraftStore";
import {
  LIBRARY_GROUPS,
  libraryContextFromRoute,
  libraryInsertTarget,
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
      ["Library", ["skills", "models", "providers", "access", "actions", "stash", "scheduled"]],
      ["Places", ["projects", "machines"]],
    ]);
  });
});

describe("libraryContextFromRoute", () => {
  it("reads project and environment from the thread shell", () => {
    expect(
      libraryContextFromRoute({ kind: "server", threadRef }, null, { projectId: "p-1" }),
    ).toEqual({ threadRef, draftId: null, projectId: "p-1", environmentId: "env-1" });
  });

  it("reads project and environment from the draft session", () => {
    expect(
      libraryContextFromRoute(
        { kind: "draft", draftId },
        { projectId: "p-2", environmentId: "env-2" },
        null,
      ),
    ).toEqual({ threadRef: null, draftId, projectId: "p-2", environmentId: "env-2" });
  });

  it("is empty off the thread and draft routes", () => {
    expect(libraryContextFromRoute(null, null, null)).toEqual(none);
  });
});
