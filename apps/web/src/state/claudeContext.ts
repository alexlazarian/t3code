import type { ClaudeContextReadInput, EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { serverEnvironment } from "./server";

export type ClaudeContextTarget = {
  readonly environmentId: EnvironmentId;
  readonly input: ClaudeContextReadInput;
};

/** One read per machine; keyed by the targets' JSON so an equal list reuses the atom. */
export const claudeContextsAtom = Atom.family((key: string) =>
  Atom.make((get) =>
    (JSON.parse(key) as ReadonlyArray<ClaudeContextTarget>).map((target) => ({
      target,
      result: get(serverEnvironment.claudeContext(target)),
    })),
  ).pipe(Atom.withLabel(`web-claude-context:${key}`)),
);
