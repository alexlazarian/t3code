import { useAtomValue } from "@effect/atom-react";
import { AuthProvidersManageScope } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { cn } from "~/lib/utils";
import { environmentPresentations } from "~/state/presentation";
import { environmentSession, sessionHasScope } from "~/state/session";
import { hasAvailableProviderUpdate } from "./ProviderUpdateLaunchNotification.logic";

// A boolean, so provider status pushes only re-render the dots when the answer flips.
const providerUpdateAvailableAtom = Atom.make((get) => {
  const providersByEnvironment = get(environmentPresentations.providersByEnvironmentAtom);
  for (const [environmentId, presentation] of get(environmentPresentations.presentationsAtom)) {
    if (
      presentation.connection.phase === "connected" &&
      sessionHasScope(
        get(environmentSession.sessionStateAtom(environmentId)),
        AuthProvidersManageScope,
      ) &&
      hasAvailableProviderUpdate(providersByEnvironment.get(environmentId) ?? [])
    ) {
      return true;
    }
  }
  return false;
}).pipe(Atom.withLabel("provider-update-available"));

function ProviderUpdateDot({ className }: { readonly className?: string }) {
  return (
    <span
      role="img"
      aria-label="Provider update available"
      className={cn("inline-block size-1.5 shrink-0 rounded-full bg-warning", className)}
    />
  );
}

export function ProviderUpdateIndicator({ className }: { readonly className?: string }) {
  const available = useAtomValue(providerUpdateAvailableAtom);
  return available ? <ProviderUpdateDot {...(className ? { className } : {})} /> : null;
}
