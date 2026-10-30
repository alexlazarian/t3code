import type {
  AuthAccessSnapshot,
  AuthAccessStreamEvent,
  AuthAccessStreamSnapshotEvent,
  AuthCreatePairingCredentialInput,
  AuthSessionId,
} from "@t3tools/contracts";
import { WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom } from "effect/reactivity";

import type { PreparedConnection } from "../connection/model.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import { EnvironmentRpcUnavailableError, subscribe } from "../rpc/client.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";
import { createEnvironmentCommand, createEnvironmentSubscriptionAtomFamily } from "./runtime.ts";

export const EMPTY_AUTH_ACCESS_SNAPSHOT: AuthAccessSnapshot = {
  pairingLinks: [],
  clientSessions: [],
};

function upsertByKey<A>(
  values: ReadonlyArray<A>,
  next: A,
  key: (value: A) => string,
): ReadonlyArray<A> {
  const nextKey = key(next);
  return [...values.filter((value) => key(value) !== nextKey), next];
}

export function applyAuthAccessStreamEvent(
  current: AuthAccessSnapshot,
  event: AuthAccessStreamEvent,
): AuthAccessSnapshot {
  switch (event.type) {
    case "snapshot":
      return event.payload;
    case "pairingLinkUpserted":
      return {
        ...current,
        pairingLinks: upsertByKey(current.pairingLinks, event.payload, (value) => value.id),
      };
    case "pairingLinkRemoved":
      return {
        ...current,
        pairingLinks: current.pairingLinks.filter((value) => value.id !== event.payload.id),
      };
    case "clientUpserted":
      return {
        ...current,
        clientSessions: upsertByKey(
          current.clientSessions,
          event.payload,
          (value) => value.sessionId,
        ),
      };
    case "clientRemoved":
      return {
        ...current,
        clientSessions: current.clientSessions.filter(
          (value) => value.sessionId !== event.payload.sessionId,
        ),
      };
  }
}

function projectAuthAccessSnapshot(
  current: AuthAccessSnapshot,
  event: AuthAccessStreamEvent,
): readonly [AuthAccessSnapshot, ReadonlyArray<AuthAccessStreamEvent>] {
  const snapshot = applyAuthAccessStreamEvent(current, event);
  const projected: AuthAccessStreamSnapshotEvent = {
    version: 1,
    revision: event.revision,
    type: "snapshot",
    payload: snapshot,
  };
  return [snapshot, [projected]];
}

export function createAuthEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    accessChanges: createEnvironmentSubscriptionAtomFamily(runtime, {
      label: "environment-data:server:auth-access-changes",
      subscribe: (_input: null) =>
        subscribe(WS_METHODS.subscribeAuthAccess, {}).pipe(
          Stream.mapAccum(() => EMPTY_AUTH_ACCESS_SNAPSHOT, projectAuthAccessSnapshot),
        ),
    }),
  };
}

const AUTH_ACCESS_TIMEOUT_MS = 10_000;

const withPreparedConnection = Effect.fn("clientRuntime.state.auth.withPreparedConnection")(
  function* <A, E, R>(use: (prepared: PreparedConnection) => Effect.Effect<A, E, R>) {
    const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
    const prepared = yield* SubscriptionRef.get(supervisor.prepared);
    if (Option.isNone(prepared)) {
      return yield* new EnvironmentRpcUnavailableError({
        environmentId: supervisor.target.environmentId,
        message: "The environment is not connected.",
      });
    }
    return yield* use(prepared.value);
  },
);

/**
 * Pairing links and client revocation on the target environment, authenticated with
 * this client's own session there. The server checks `access:write` on each call.
 */
export function createAuthAccessCommands<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | HttpClient.HttpClient | R, E>,
) {
  return {
    createPairingCredential: createEnvironmentCommand(runtime, {
      label: "environment-data:auth:create-pairing-credential",
      execute: Effect.fn("clientRuntime.state.auth.createPairingCredential")(function* (
        payload: AuthCreatePairingCredentialInput,
      ) {
        return yield* withPreparedConnection((prepared) =>
          executeAuthenticatedEnvironmentHttpRequest({
            prepared,
            group: "auth",
            method: "POST",
            url: (urls) => urls.pairingCredential(),
            timeoutMs: AUTH_ACCESS_TIMEOUT_MS,
            request: ({ client, headers }) => client.pairingCredential({ headers, payload }),
          }),
        );
      }),
    }),
    revokePairingLink: createEnvironmentCommand(runtime, {
      label: "environment-data:auth:revoke-pairing-link",
      execute: Effect.fn("clientRuntime.state.auth.revokePairingLink")(function* (id: string) {
        return yield* withPreparedConnection((prepared) =>
          executeAuthenticatedEnvironmentHttpRequest({
            prepared,
            group: "auth",
            method: "POST",
            url: (urls) => urls.revokePairingLink(),
            timeoutMs: AUTH_ACCESS_TIMEOUT_MS,
            request: ({ client, headers }) =>
              client.revokePairingLink({ headers, payload: { id } }),
          }),
        );
      }),
    }),
    revokeClient: createEnvironmentCommand(runtime, {
      label: "environment-data:auth:revoke-client",
      execute: Effect.fn("clientRuntime.state.auth.revokeClient")(function* (
        sessionId: AuthSessionId,
      ) {
        return yield* withPreparedConnection((prepared) =>
          executeAuthenticatedEnvironmentHttpRequest({
            prepared,
            group: "auth",
            method: "POST",
            url: (urls) => urls.revokeClient(),
            timeoutMs: AUTH_ACCESS_TIMEOUT_MS,
            request: ({ client, headers }) =>
              client.revokeClient({ headers, payload: { sessionId } }),
          }),
        );
      }),
    }),
    revokeOtherClients: createEnvironmentCommand(runtime, {
      label: "environment-data:auth:revoke-other-clients",
      execute: Effect.fn("clientRuntime.state.auth.revokeOtherClients")(function* (_input: null) {
        const result = yield* withPreparedConnection((prepared) =>
          executeAuthenticatedEnvironmentHttpRequest({
            prepared,
            group: "auth",
            method: "POST",
            url: (urls) => urls.revokeOtherClients(),
            timeoutMs: AUTH_ACCESS_TIMEOUT_MS,
            request: ({ client, headers }) => client.revokeOtherClients({ headers }),
          }),
        );
        return result.revokedCount;
      }),
    }),
  };
}
