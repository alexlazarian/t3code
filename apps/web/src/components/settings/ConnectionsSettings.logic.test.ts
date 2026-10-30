import { type DesktopWslState, EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  accessEnvironmentOptions,
  applyWslEnableSelection,
  environmentPairingEndpoints,
  isQrShareableEndpoint,
  resolveAccessPermissions,
  selectAccessEnvironmentId,
  selectPairingEndpoint,
  selectQrEndpointOption,
  togglePairingScopeSelection,
} from "./ConnectionsSettings.logic";
import { resolvePairingUrl } from "./pairingUrls";

describe("togglePairingScopeSelection", () => {
  it.each([
    {
      label: "adds terminal:read when terminal:operate is selected",
      current: ["orchestration:read"],
      scope: "terminal:operate",
      checked: true,
      expected: ["orchestration:read", "terminal:operate", "terminal:read"],
    },
    {
      label: "drops terminal:operate when terminal:read is cleared",
      current: ["terminal:read", "terminal:operate", "filesystem:read"],
      scope: "terminal:read",
      checked: false,
      expected: ["filesystem:read"],
    },
    {
      label: "keeps terminal:read when terminal:operate is cleared",
      current: ["terminal:read", "terminal:operate"],
      scope: "terminal:operate",
      checked: false,
      expected: ["terminal:read"],
    },
    {
      label: "toggles unrelated scopes on their own",
      current: ["terminal:read"],
      scope: "filesystem:read",
      checked: true,
      expected: ["terminal:read", "filesystem:read"],
    },
  ] as const)("$label", ({ current, scope, checked, expected }) => {
    expect(togglePairingScopeSelection(current, scope, checked)).toEqual(expected);
  });
});

const baseWslState: DesktopWslState = {
  enabled: false,
  distro: null,
  available: true,
  wslOnly: true,
  distros: [],
  preflightError: null,
};

describe("applyWslEnableSelection", () => {
  it("clears WSL-only and updates the distro before enabling both backends", async () => {
    const calls: Array<string> = [];
    let persistedWslOnly = true;
    let persistedDistro: string | null = "Ubuntu";
    const setWslDistro = vi.fn(async (distro: string | null) => {
      calls.push(`setWslDistro:${distro ?? "default"}`);
      persistedDistro = distro;
      return { ...baseWslState, distro, wslOnly: persistedWslOnly };
    });
    const setWslBackendEnabled = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslBackendEnabled:${enabled}`);
      return {
        ...baseWslState,
        enabled,
        distro: persistedDistro,
        wslOnly: persistedWslOnly,
      };
    });
    const setWslOnly = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslOnly:${enabled}`);
      persistedWslOnly = enabled;
      return { ...baseWslState, distro: persistedDistro, wslOnly: enabled };
    });

    const state = await applyWslEnableSelection({
      bridge: { setWslDistro, setWslBackendEnabled, setWslOnly },
      mode: "both",
      nextDistro: "Debian",
      persistedDistro: "Ubuntu",
    });

    expect(calls).toEqual(["setWslOnly:false", "setWslDistro:Debian", "setWslBackendEnabled:true"]);
    expect(state).toMatchObject({ enabled: true, distro: "Debian", wslOnly: false });
  });
});

describe("selectQrEndpointOption", () => {
  const options = [
    {
      id: "desktop-loopback:4780",
      preferenceKey: "desktop-core:loopback:http",
      qrShareable: false,
    },
    {
      id: "tailscale-ip:http://100.84.12.7:4780",
      preferenceKey: "tailscale:ip:http",
      qrShareable: true,
    },
    {
      id: "tailscale-ip:http://100.84.12.8:4780",
      preferenceKey: "tailscale:ip:http",
      qrShareable: true,
    },
    {
      id: "desktop-lan:http://192.168.1.42:4780",
      preferenceKey: "desktop-core:lan:http",
      qrShareable: true,
    },
  ];

  it("resolves an explicit selection by unique endpoint id, not the shared preference key", () => {
    expect(selectQrEndpointOption(options, "tailscale-ip:http://100.84.12.8:4780", null)?.id).toBe(
      "tailscale-ip:http://100.84.12.8:4780",
    );
  });

  it("skips non-QR-shareable options in the fallback so the panel never opens on loopback", () => {
    expect(selectQrEndpointOption(options, "tailscale-ip:gone", "nope")?.id).toBe(
      "tailscale-ip:http://100.84.12.7:4780",
    );
  });
});

describe("access environment", () => {
  const primary = EnvironmentId.make("primary");
  const service = EnvironmentId.make("service");
  const laptop = EnvironmentId.make("laptop");
  const env = (environmentId: EnvironmentId, phase = "connected", enabled = true) => ({
    environmentId,
    entry: { enabled },
    connection: { phase },
  });

  it.each([
    {
      label: "targets the app's own server when present, even if others are connected",
      environments: [env(service), env(primary)],
      primaryId: primary,
      selected: null,
      expected: primary,
    },
    {
      label: "targets the connected environment when the local one is off",
      environments: [env(service)],
      primaryId: null,
      selected: null,
      expected: service,
    },
    {
      label: "honors a picked environment among several",
      environments: [env(service), env(laptop)],
      primaryId: null,
      selected: laptop,
      expected: laptop,
    },
    {
      label: "skips switched-off and disconnected environments",
      environments: [env(laptop, "connected", false), env(service, "reconnecting")],
      primaryId: null,
      selected: laptop,
      expected: null,
    },
  ])("$label", ({ environments, primaryId, selected, expected }) => {
    const options = accessEnvironmentOptions(environments, primaryId);
    expect(selectAccessEnvironmentId(options, selected)).toBe(expected);
  });

  it("puts the primary environment first so the picker leads with it", () => {
    expect(
      accessEnvironmentOptions([env(service), env(primary)], primary).map(
        (option) => option.environmentId,
      ),
    ).toEqual([primary, service]);
  });
});

describe("resolveAccessPermissions", () => {
  it.each([
    { label: "waits for the session", session: null, expected: ["pending", false, false] },
    {
      label: "denies a standard remote session",
      session: { authenticated: true, permissions: ["orchestration:read"] as const },
      expected: ["denied", false, false],
    },
    {
      label: "grants a full-access remote session",
      session: {
        authenticated: true,
        permissions: ["access:read", "access:write", "orchestration:read"] as const,
      },
      expected: ["granted", true, true],
    },
    {
      label: "denies an unauthenticated session",
      session: { authenticated: false, permissions: ["access:write"] as const },
      expected: ["denied", false, false],
    },
  ])("$label", ({ session, expected }) => {
    const permissions = resolveAccessPermissions(session);
    expect([permissions.status, permissions.canRead, permissions.canWrite]).toEqual(expected);
  });

  it("delegates only the scopes the session holds there", () => {
    expect(
      resolveAccessPermissions({
        authenticated: true,
        permissions: ["access:write", "orchestration:read"],
      }).delegatableScopes,
    ).toEqual(["access:write", "orchestration:read"]);
  });
});

describe("environmentPairingEndpoints", () => {
  it("pairs through the server's reported LAN address, not the loopback route this app uses", () => {
    const endpoints = environmentPairingEndpoints({
      directEndpoints: [
        { kind: "lan", httpBaseUrl: "http://192.168.1.20:3773/" },
        { kind: "tailnet", httpBaseUrl: "http://100.101.102.103:3773/" },
      ],
      routeUrls: ["http://127.0.0.1:3773"],
    });
    expect(endpoints.map((endpoint) => [endpoint.httpBaseUrl, endpoint.reachability])).toEqual([
      ["http://192.168.1.20:3773/", "lan"],
      ["http://100.101.102.103:3773/", "private-network"],
      ["http://127.0.0.1:3773/", "loopback"],
    ]);
    expect(endpoints.map(isQrShareableEndpoint)).toEqual([true, true, false]);
    const endpoint = selectPairingEndpoint(endpoints);
    expect(endpoint && resolvePairingUrl(endpoint.httpBaseUrl, "abc")).toBe(
      "http://192.168.1.20:3773/pair#token=abc",
    );
  });

  it("keeps a reachable route and drops duplicates of reported addresses", () => {
    const endpoints = environmentPairingEndpoints({
      directEndpoints: [{ kind: "tailnet", httpBaseUrl: "https://box.tail1.ts.net/" }],
      routeUrls: ["https://box.tail1.ts.net", "http://192.168.1.20:3773"],
    });
    expect(endpoints.map((endpoint) => endpoint.httpBaseUrl)).toEqual([
      "https://box.tail1.ts.net/",
      "http://192.168.1.20:3773/",
    ]);
  });

  it("offers no pairing address when the server reports none and the route is loopback", () => {
    const endpoints = environmentPairingEndpoints({
      directEndpoints: undefined,
      routeUrls: ["http://127.0.0.1:3773"],
    });
    expect(selectPairingEndpoint(endpoints)).toBeNull();
  });
});
