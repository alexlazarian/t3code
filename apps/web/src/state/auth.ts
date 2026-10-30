import {
  createAuthAccessCommands,
  createAuthEnvironmentAtoms,
} from "@t3tools/client-runtime/state/auth";
import { type AtomCommand, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  AuthCreatePairingCredentialInput,
  AuthPairingCredentialResult,
  AuthSessionId,
  EnvironmentId,
} from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";
import {
  createServerPairingCredential,
  revokeOtherServerClientSessions,
  revokeServerClientSession,
  revokeServerPairingLink,
} from "../environments/primary";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readPrimaryEnvironmentId } from "./environments";

export const authEnvironment = createAuthEnvironmentAtoms(connectionAtomRuntime);

const authAccess = createAuthAccessCommands(connectionAtomRuntime);

async function runAuthAccess<Input, A, E>(
  command: AtomCommand<{ readonly environmentId: EnvironmentId; readonly input: Input }, A, E>,
  environmentId: EnvironmentId,
  input: Input,
): Promise<A> {
  const result = await command.run(appAtomRegistry, { environmentId, input });
  if (result._tag === "Success") return result.value;
  throw squashAtomCommandFailure(result);
}

// The primary environment keeps its own HTTP client, which handles the dev proxy and desktop auth.
const isPrimary = (environmentId: EnvironmentId) => environmentId === readPrimaryEnvironmentId();

export function createPairingCredentialOn(
  environmentId: EnvironmentId,
  input: AuthCreatePairingCredentialInput,
): Promise<AuthPairingCredentialResult> {
  return isPrimary(environmentId)
    ? createServerPairingCredential(input)
    : runAuthAccess(authAccess.createPairingCredential, environmentId, input);
}

export function revokePairingLinkOn(environmentId: EnvironmentId, id: string): Promise<unknown> {
  return isPrimary(environmentId)
    ? revokeServerPairingLink(id)
    : runAuthAccess(authAccess.revokePairingLink, environmentId, id);
}

export function revokeClientOn(
  environmentId: EnvironmentId,
  sessionId: AuthSessionId,
): Promise<unknown> {
  return isPrimary(environmentId)
    ? revokeServerClientSession(sessionId)
    : runAuthAccess(authAccess.revokeClient, environmentId, sessionId);
}

export function revokeOtherClientsOn(environmentId: EnvironmentId): Promise<number> {
  return isPrimary(environmentId)
    ? revokeOtherServerClientSessions()
    : runAuthAccess(authAccess.revokeOtherClients, environmentId, null);
}
