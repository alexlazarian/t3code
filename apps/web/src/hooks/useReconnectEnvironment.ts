import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { environmentCatalog } from "../connection/catalog";
import { useAtomCommand } from "../state/use-atom-command";

export function useReconnectEnvironment() {
  const retryEnvironment = useAtomCommand(environmentCatalog.retryNow, { reportFailure: false });
  const [reconnectingId, setReconnectingId] = useState<EnvironmentId | null>(null);
  const reconnect = async (environmentId: EnvironmentId) => {
    setReconnectingId(environmentId);
    const result = await retryEnvironment(environmentId);
    setReconnectingId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not reconnect environment",
          description: error instanceof Error ? error.message : "Failed to reconnect.",
        }),
      );
    }
  };
  return { reconnect, reconnectingId };
}
