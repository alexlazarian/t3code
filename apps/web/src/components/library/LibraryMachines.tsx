import { connectionStatusTitle } from "@t3tools/client-runtime/connection";
import { useNavigate } from "@tanstack/react-router";

import { useReconnectEnvironment } from "../../hooks/useReconnectEnvironment";
import { useEnvironments } from "../../state/environments";
import { LibraryItemList } from "./LibraryItemList";
import { moveSettingsIntoLibrary } from "../settings/settingsPlacement";

export function LibraryMachines() {
  const { environments } = useEnvironments();
  const { reconnect, reconnectingId } = useReconnectEnvironment();
  const navigate = useNavigate();
  const openSettings = {
    label: "Open in Settings",
    onSelect: () => {
      moveSettingsIntoLibrary();
      void navigate({ to: "/settings/connections" });
    },
  };
  return (
    <LibraryItemList
      empty="No machines yet."
      items={environments.map((environment) => {
        const online = environment.connection.phase === "connected";
        return {
          key: environment.environmentId,
          name: environment.label,
          meta: connectionStatusTitle(environment.connection),
          bad: !online,
          detail: online
            ? environment.displayUrl
            : "Not reachable. Its threads stay listed; their history loads once it reconnects.",
          actions: online
            ? [openSettings]
            : [
                {
                  label: "Reconnect",
                  disabled: reconnectingId !== null,
                  onSelect: () => void reconnect(environment.environmentId),
                },
                openSettings,
              ],
        };
      })}
    />
  );
}
