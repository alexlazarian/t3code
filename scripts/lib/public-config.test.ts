// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env"),
      "T3CODE_MOBILE_VERSION=root\nT3CODE_IOS_PERSONAL_TEAM=root\n",
    );
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env.local"), "T3CODE_MOBILE_VERSION=local\n");

    expect(loadRepoEnv({ baseEnv: {}, repoRoot })).toMatchObject({
      T3CODE_MOBILE_VERSION: "local",
      T3CODE_IOS_PERSONAL_TEAM: "root",
    });
    expect(
      loadRepoEnv({ baseEnv: { T3CODE_MOBILE_VERSION: "ci" }, repoRoot }).T3CODE_MOBILE_VERSION,
    ).toBe("ci");
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
