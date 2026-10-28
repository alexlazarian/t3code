import { useNavigate } from "@tanstack/react-router";

import { isProviderInstancePickerReady } from "../../providerInstances";
import { getProviderSummary } from "../settings/providerStatus";
import type { LibraryContext } from "./Library.logic";
import { LibraryItemList } from "./LibraryItemList";
import { useLibraryProvider } from "./useLibrary";
import { moveSettingsIntoLibrary } from "../settings/settingsPlacement";

export function LibraryProviders(props: { readonly ctx: LibraryContext }) {
  const { environmentId, entries } = useLibraryProvider(props.ctx);
  const navigate = useNavigate();
  return (
    <LibraryItemList
      empty="No providers reported yet."
      items={entries.map((entry) => {
        const summary = getProviderSummary(entry.snapshot);
        return {
          key: entry.instanceId,
          name: entry.displayName,
          meta: summary.headline,
          bad: !isProviderInstancePickerReady(entry),
          detail: summary.detail,
          actions: [
            {
              label: "Open in Settings",
              onSelect: () => {
                moveSettingsIntoLibrary();
                void navigate({
                  to: "/settings/providers",
                  search: {
                    ...(environmentId === null ? {} : { environmentId }),
                    instanceId: entry.instanceId,
                  },
                });
              },
            },
          ],
        };
      })}
    />
  );
}
