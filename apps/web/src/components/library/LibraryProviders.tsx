import { useNavigate } from "@tanstack/react-router";
import { AuthProvidersManageScope, type EnvironmentId } from "@t3tools/contracts";

import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";
import { useEnvironment } from "../../state/environments";
import { useEnvironmentScope } from "../../state/session";
import { getProviderUpdateStatus } from "../ProviderUpdateLaunchNotification.logic";
import { ProviderUpdateDot } from "../ProviderUpdateIndicator";
import { useRunProviderUpdate } from "../ProviderUpdatesAction";
import { getProviderSummary } from "../settings/providerStatus";
import type { LibraryContext } from "./Library.logic";
import { LibraryItemList, type LibraryItemAction } from "./LibraryItemList";
import { useLibraryProvider } from "./useLibrary";
import { moveSettingsIntoLibrary } from "../settings/settingsPlacement";

const EMPTY = "No providers reported yet.";

export function LibraryProviders(props: { readonly ctx: LibraryContext }) {
  const { environmentId, entries } = useLibraryProvider(props.ctx);
  if (environmentId === null) return <LibraryItemList empty={EMPTY} items={[]} />;
  return <LibraryProviderList environmentId={environmentId} entries={entries} />;
}

function LibraryProviderList(props: {
  readonly environmentId: EnvironmentId;
  readonly entries: ReadonlyArray<ProviderInstanceEntry>;
}) {
  const { environmentId } = props;
  const navigate = useNavigate();
  const canUpdate = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const environmentLabel = useEnvironment(environmentId)?.label ?? "This machine";
  const { dispatchingInstanceIds, runProviderUpdate } = useRunProviderUpdate(
    environmentId,
    environmentLabel,
  );
  return (
    <LibraryItemList
      empty={EMPTY}
      items={props.entries.map((entry) => {
        const summary = getProviderSummary(entry.snapshot);
        const status = getProviderUpdateStatus(entry.snapshot);
        const update = status && !canUpdate ? { ...status, canUpdate: false } : status;
        const updating = update?.updating === true || dispatchingInstanceIds.has(entry.instanceId);
        const updateAction: ReadonlyArray<LibraryItemAction> =
          update?.canUpdate || updating
            ? [
                {
                  label: updating ? "Updating…" : "Update now",
                  disabled: updating,
                  onSelect: () => void runProviderUpdate(entry.snapshot),
                },
              ]
            : [];
        return {
          key: entry.instanceId,
          name: entry.displayName,
          meta: updating ? "Updating…" : (update?.label ?? summary.headline),
          bad: !isProviderInstancePickerReady(entry),
          ...(update?.canUpdate && !updating ? { swatch: <ProviderUpdateDot /> } : {}),
          detail: update?.detail ?? summary.detail,
          actions: [
            ...updateAction,
            {
              label: "Open in Settings",
              onSelect: () => {
                moveSettingsIntoLibrary();
                void navigate({
                  to: "/settings/providers",
                  search: { environmentId, instanceId: entry.instanceId },
                });
              },
            },
          ],
        };
      })}
    />
  );
}
