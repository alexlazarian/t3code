import { describe, expect, it } from "@effect/vitest";

import { presentConnectionDiagnosis } from "./diagnosis.ts";
import { mapRemoteEnvironmentError } from "./errors.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  ConnectionBlockedError,
  type ConnectionAttemptError,
  type SupervisorConnectionState,
} from "./model.ts";
import { RemoteEnvironmentAuthFetchError } from "../rpc/http.ts";

const backoff = (lastFailure: ConnectionAttemptError): SupervisorConnectionState => ({
  ...AVAILABLE_CONNECTION_STATE,
  desired: true,
  network: "online",
  phase: "backoff",
  attempt: 3,
  lastFailure,
  retryAt: Date.UTC(2026, 9, 19, 12, 0, 30),
});

const unreachable = mapRemoteEnvironmentError(
  new RemoteEnvironmentAuthFetchError({ message: "Failed to fetch", cause: new TypeError() }),
);

const diagnose = (state: SupervisorConnectionState) =>
  presentConnectionDiagnosis({ hostLabel: "Mac mini", state });

const results = (state: SupervisorConnectionState) =>
  diagnose(state)?.hops.map((hop) => `${hop.hop}:${hop.result}`);

describe("presentConnectionDiagnosis", () => {
  it("has nothing to report before any attempt fails", () => {
    expect(diagnose(AVAILABLE_CONNECTION_STATE)).toBeNull();
  });

  it("blames T3 Code on the host when it does not answer", () => {
    const state = backoff(unreachable);
    expect(diagnose(state)?.headline).toBe("T3 Code on Mac mini did not answer");
    expect(results(state)).toEqual(["device:ok", "server:failed"]);
    expect(diagnose(state)?.facts.map(([label]) => label)).not.toContain("HTTP status");
  });

  it("names a host that rejected this device", () => {
    const state = backoff(
      new ConnectionBlockedError({ reason: "authentication", detail: "denied", hop: "server" }),
    );
    expect(diagnose(state)?.headline).toBe("T3 Code on Mac mini did not accept this device");
  });

  it("asks for an update when the host runs an older T3 Code", () => {
    const state = backoff(
      new ConnectionBlockedError({
        reason: "unsupported",
        detail: "outdated",
        serverUpdateRequired: true,
      }),
    );
    expect(diagnose(state)?.headline).toBe("Mac mini runs an older T3 Code");
    expect(diagnose(state)?.steps).toEqual(["Update T3 Code on Mac mini."]);
  });

  it("reports this device as offline before any other hop", () => {
    const state = { ...backoff(unreachable), network: "offline" as const };
    expect(diagnose(state)?.headline).toBe("This device is offline");
    expect(results(state)?.[0]).toBe("device:failed");
  });
});
