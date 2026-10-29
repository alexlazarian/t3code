import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import DiffPanel from "./DiffPanel";

vi.mock(import("~/state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  useQuietThreadShell: ((ref: unknown) =>
    ref
      ? { environmentId: "environment", projectId: "project", worktreePath: null }
      : null) as never,
}));

it("shows the given thread outside a thread route", async () => {
  const threadRef = scopeThreadRef(EnvironmentId.make("environment"), ThreadId.make("thread"));
  await using screen = await render(
    <DiffPanel
      threadRef={threadRef}
      composerDraftTarget={threadRef}
      workspaceMutationId={null}
      visible
    />,
    { router: "/overview" },
  );

  await expect.element(screen.getByText("This environment is not connected.")).toBeVisible();
  await expect
    .element(screen.getByText("Select a thread to inspect turn diffs."))
    .not.toBeInTheDocument();
});
