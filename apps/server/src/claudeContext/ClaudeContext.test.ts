import { ProviderInstanceId } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ClaudeContext from "./ClaudeContext.ts";

const setup = Effect.fn(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-claude-context-" });
  const home = path.join(root, "claude-home");
  const projectRoot = path.join(root, "code", "app");
  const worktree = path.join(root, "t3", "worktrees", "app", "feature-a");
  const key = (directory: string) => directory.replace(/[^A-Za-z0-9]/g, "-");
  const memoryDir = (directory: string) => path.join(home, "projects", key(directory), "memory");
  const write = Effect.fn(function* (filePath: string, contents: string) {
    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
    yield* fs.writeFileString(filePath, contents);
  });
  const service = yield* ClaudeContext.make.pipe(
    Effect.provide(
      Layer.merge(
        ServerSettings.layerTest({
          providerInstances: {
            [ProviderInstanceId.make("claudeAgent")]: {
              driver: "claudeAgent",
              config: { homePath: home },
            },
          },
        }),
        ServerConfig.layerTest(root, path.join(root, "t3")),
      ),
    ),
  );
  return { fs, path, home, projectRoot, worktree, key, memoryDir, write, service };
});

// A missed Claude instance falls back to <home>/.claude; point home nowhere so tests never touch a real one.
const testHome = Layer.succeed(HostProcess.HomeDirectory, "/nonexistent/t3-claude-context-home");

it.layer(Layer.mergeAll(NodeServices.layer, testHome))("ClaudeContext", (it) => {
  it.effect(
    "lists a project's folders, including a deleted worktree's memory, and its imports",
    () =>
      Effect.gen(function* () {
        const { path, home, projectRoot, worktree, key, memoryDir, write, service } =
          yield* setup();
        const deleted = path.join(path.dirname(worktree), "old-branch");
        yield* write(
          path.join(memoryDir(projectRoot), "MEMORY.md"),
          "# Memory Index\n\n- [Use vp](use-vp.md) — not npm\n",
        );
        yield* write(
          path.join(memoryDir(projectRoot), "use-vp.md"),
          "---\nname: use-vp\ndescription: not npm\nmetadata:\n  type: feedback\n---\n\nRun vp.\n",
        );
        yield* write(
          path.join(memoryDir(deleted), "stale.md"),
          "---\nname: stale-fact\ndescription: from a gone worktree\ntype: project\n---\nBody\n",
        );
        yield* write(path.join(home, "projects", "-unrelated", "memory", "x.md"), "nope");
        yield* write(
          path.join(projectRoot, "CLAUDE.md"),
          "Read @AGENTS.md first.\n`@ignored.md`\n",
        );
        yield* write(path.join(projectRoot, "AGENTS.md"), "# Agents\n");

        const snapshot = yield* service.read({ projectRoot, worktreePaths: [worktree] });

        assert.deepEqual(
          snapshot.folders.map((folder) => [folder.key, folder.kind, folder.label, folder.path]),
          [
            [key(projectRoot), "main", "app", projectRoot],
            [key(worktree), "worktree", "feature-a", worktree],
            [key(deleted), "worktree", "old-branch", null],
          ],
        );
        // No open worktrees: the managed worktrees folder still finds the deleted one.
        const withoutWorktrees = yield* service.read({ projectRoot, worktreePaths: [] });
        assert.deepEqual(
          withoutWorktrees.folders.map((folder) => folder.label),
          ["app", "old-branch"],
        );
        assert.deepEqual(
          snapshot.memories.map((memory) => [
            memory.folderKey,
            memory.title,
            memory.type,
            memory.body,
          ]),
          [
            [key(projectRoot), "Use vp", "feedback", "Run vp.\n"],
            [key(deleted), "stale-fact", "project", "Body\n"],
          ],
        );
        assert.deepEqual(
          snapshot.instructions.map((file) => [
            file.scope,
            path.basename(file.path),
            file.editable,
            file.importedBy === undefined ? null : path.basename(file.importedBy),
            file.content !== null,
          ]),
          [
            ["user", "CLAUDE.md", true, null, false],
            ["project", "CLAUDE.md", false, null, true],
            ["project", "AGENTS.md", false, "CLAUDE.md", true],
            ["local", "CLAUDE.local.md", false, null, false],
          ],
        );
      }),
  );

  it.effect("writes memories and keeps the index and Claude's own lines in sync", () =>
    Effect.gen(function* () {
      const { fs, path, projectRoot, key, memoryDir, write, service } = yield* setup();
      const directory = memoryDir(projectRoot);
      const folderKey = key(projectRoot);
      yield* write(
        path.join(directory, "MEMORY.md"),
        "# Memory Index\n\n- [Keep](keep.md) — untouched\n- [Old title](edit-me.md) — old\n",
      );
      const original =
        "---\nname: edit-me\ndescription: old\nmetadata:\n  node_type: memory\n  type: user\n  originSessionId: abc\n---\n\nOld body\n";
      yield* write(path.join(directory, "edit-me.md"), original);

      const created = yield* service.writeMemory({
        folderKey,
        title: "Fork branch is custom",
        description: "Never push upstream",
        type: "project",
        body: "Work lands on custom.",
      });
      assert.strictEqual(created.fileName, "fork-branch-is-custom.md");
      assert.strictEqual(created.title, "Fork branch is custom");

      const conflict = yield* service
        .writeMemory({
          folderKey,
          fileName: "edit-me.md",
          title: "New title",
          description: "new",
          type: "feedback",
          body: "New body",
          expectedRaw: "something else",
        })
        .pipe(Effect.flip);
      assert.strictEqual(conflict._tag, "ClaudeContextConflictError");

      const edited = yield* service.writeMemory({
        folderKey,
        fileName: "edit-me.md",
        title: "New title",
        description: "new",
        type: "feedback",
        body: "New body",
        expectedRaw: original,
      });
      assert.match(
        edited.raw,
        /^---\nname: edit-me\ndescription: new\nmetadata:\n  node_type: memory\n  type: feedback\n  originSessionId: abc\n  modified: .+\n---\n\nNew body\n$/,
      );

      assert.strictEqual(
        yield* fs.readFileString(path.join(directory, "MEMORY.md")),
        "# Memory Index\n\n- [Keep](keep.md) — untouched\n- [New title](edit-me.md) — new\n- [Fork branch is custom](fork-branch-is-custom.md) — Never push upstream\n",
      );

      const removed = yield* service.deleteMemory({ folderKey, fileName: "edit-me.md" });
      assert.strictEqual(removed.indexLine, "- [New title](edit-me.md) — new");
      assert.isFalse(yield* fs.exists(path.join(directory, "edit-me.md")));
      assert.notInclude(yield* fs.readFileString(path.join(directory, "MEMORY.md")), "edit-me.md");

      const restored = yield* service.restoreMemory({
        folderKey,
        fileName: "edit-me.md",
        raw: removed.raw,
        indexLine: removed.indexLine,
      });
      assert.strictEqual(restored.title, "New title");
      assert.strictEqual(yield* fs.readFileString(path.join(directory, "edit-me.md")), removed.raw);
      assert.include(
        yield* fs.readFileString(path.join(directory, "MEMORY.md")),
        "- [New title](edit-me.md) — new",
      );
    }),
  );

  it.effect("saves the user CLAUDE.md unless it changed since it was opened", () =>
    Effect.gen(function* () {
      const { fs, path, home, service } = yield* setup();
      yield* service.writeUserInstructions({ content: "# Mine\n", expectedContent: null });
      assert.strictEqual(yield* fs.readFileString(path.join(home, "CLAUDE.md")), "# Mine\n");

      const conflict = yield* service
        .writeUserInstructions({ content: "# Other\n", expectedContent: null })
        .pipe(Effect.flip);
      assert.deepInclude(conflict, { _tag: "ClaudeContextConflictError", current: "# Mine\n" });
    }),
  );
});
