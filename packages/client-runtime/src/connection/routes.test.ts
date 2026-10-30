import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import {
  BearerConnectionProfile,
  type ConnectionCatalogEntry,
  type ConnectionRoute,
} from "./catalog.ts";
import { pullRequestRoutingConnectionKey } from "./pullRequestRoutingPermissions.ts";
import { BearerConnectionTarget } from "./model.ts";
import {
  connectionRouteId,
  connectionRouteKind,
  connectionRouteLabel,
  credentialConnectionId,
  insertRoute,
  entryWithRoutes,
  isLearned,
  mergeLearnedRoutes,
  routesAfterRemoving,
  sendsTokenInClear,
  upsertRoute,
  usableRoutes,
} from "./routes.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");

function direct(id: string, httpBaseUrl: string): ConnectionRoute {
  return {
    target: new BearerConnectionTarget({
      environmentId: ENVIRONMENT_ID,
      label: "Desk",
      connectionId: id,
    }),
    profile: Option.some(
      new BearerConnectionProfile({
        connectionId: id,
        environmentId: ENVIRONMENT_ID,
        label: "Desk",
        httpBaseUrl,
        wsBaseUrl: httpBaseUrl.replace(/^http/, "ws"),
      }),
    ),
  };
}

const LAN = direct("lan", "http://192.168.1.10:3773/");
const TAILNET = direct("tailnet", "https://desk.tail1234.ts.net/");
const PUBLIC = direct("public", "https://desk.example.com/");

function learned(id: string, httpBaseUrl: string): ConnectionRoute {
  const route = direct(id, httpBaseUrl);
  const profile = Option.getOrThrow(route.profile) as BearerConnectionProfile;
  return {
    target: route.target,
    profile: Option.some(new BearerConnectionProfile({ ...profile, learned: true })),
  };
}

describe("connection routes", () => {
  it("classifies direct routes by address", () => {
    expect(connectionRouteKind(LAN)).toBe("lan");
    // Tailscale, Cloudflare WARP and Mesh, and other VPNs share 100.64.0.0/10.
    expect(connectionRouteKind(direct("ip", "http://100.101.102.103:3773/"))).toBe("vpn");
    expect(connectionRouteLabel(direct("mesh", "http://100.96.0.1:3773/"))).toBe("VPN");
    expect(connectionRouteKind(TAILNET)).toBe("tailnet");
    expect(connectionRouteKind(PUBLIC)).toBe("public");
    expect(connectionRouteKind(direct("lo", "http://127.0.0.1:3773/"))).toBe("loopback");
    expect(connectionRouteKind(direct("ts6", "http://[fd7a:115c:a1e0::1]:3773/"))).toBe("tailnet");
    expect(connectionRouteLabel(TAILNET)).toBe("Tailscale");
  });

  it("places a new route after faster kinds and ahead of slower ones", () => {
    expect(insertRoute([PUBLIC], LAN)).toEqual([LAN, PUBLIC]);
    expect(insertRoute([LAN, PUBLIC], TAILNET)).toEqual([LAN, TAILNET, PUBLIC]);
    expect(insertRoute([TAILNET], LAN)).toEqual([LAN, TAILNET]);
    expect(insertRoute([LAN, TAILNET], PUBLIC)).toEqual([LAN, TAILNET, PUBLIC]);
  });

  it("keeps a user's order when a saved route is replaced", () => {
    const repaired = direct("lan", "http://192.168.1.11:3773/");
    expect(upsertRoute([PUBLIC, LAN], repaired)).toEqual([PUBLIC, repaired]);
  });
});

describe("learned routes", () => {
  const publicOnly: ConnectionCatalogEntry = {
    target: PUBLIC.target,
    profile: PUBLIC.profile,
    enabled: true,
  };
  const lanOnly = entryWithRoutes(publicOnly, [LAN]);
  const ids = (routes: ReadonlyArray<ConnectionRoute> | null) =>
    routes?.map((route) => connectionRouteId(route.target)) ?? null;
  const profileOf = (route: ConnectionRoute) => Option.getOrThrow(route.profile);
  const httpsLan = "https://192.168.1.10:3773";

  it("learns a faster address ahead of the active route, borrowing its token", () => {
    const routes = mergeLearnedRoutes({
      entry: publicOnly,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: `${httpsLan}/` }],
      allowInsecure: true,
    });
    expect(ids(routes)).toEqual([`learned:${ENVIRONMENT_ID}:${httpsLan}@public`, "public"]);
    expect(credentialConnectionId(connectionRouteId(routes![0]!.target))).toBe("public");
    expect(profileOf(routes![0]!)).toMatchObject({
      learned: true,
      wsBaseUrl: "wss://192.168.1.10:3773/",
    });
  });

  it("replaces a learned LAN address when the server reports a new one", () => {
    const first = mergeLearnedRoutes({
      entry: publicOnly,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: `${httpsLan}/` }],
      allowInsecure: true,
    })!;
    const moved = mergeLearnedRoutes({
      entry: entryWithRoutes(publicOnly, first),
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: "https://10.0.0.42:3773/" }],
      allowInsecure: true,
    });
    expect(ids(moved)).toEqual([
      `learned:${ENVIRONMENT_ID}:https://10.0.0.42:3773@public`,
      "public",
    ]);
  });

  it("keeps a learned route where the user moved it while the server reports it", () => {
    const lan = { httpBaseUrl: `${httpsLan}/` };
    const first = mergeLearnedRoutes({
      entry: publicOnly,
      activeRoute: PUBLIC,
      reported: [lan],
      allowInsecure: true,
    })!;
    const reordered = entryWithRoutes(publicOnly, [first[1]!, first[0]!]);
    expect(
      mergeLearnedRoutes({
        entry: reordered,
        activeRoute: PUBLIC,
        reported: [lan],
        allowInsecure: true,
      }),
    ).toBeNull();
    const next = mergeLearnedRoutes({
      entry: reordered,
      activeRoute: PUBLIC,
      reported: [lan, { httpBaseUrl: "https://100.101.102.103:3773/" }],
      allowInsecure: true,
    });
    expect(ids(next)).toEqual([
      `learned:${ENVIRONMENT_ID}:https://100.101.102.103:3773@public`,
      "public",
      `learned:${ENVIRONMENT_ID}:${httpsLan}@public`,
    ]);
  });

  it("labels a learned address Tailscale only while the server reports it as tailnet", () => {
    const tailscale = { kind: "tailnet", httpBaseUrl: "http://100.101.102.103:3773/" };
    const mesh = { kind: "lan", httpBaseUrl: "http://100.96.0.1:3773/" };
    const first = mergeLearnedRoutes({
      entry: lanOnly,
      activeRoute: LAN,
      reported: [tailscale, mesh],
      allowInsecure: true,
    })!;
    expect(first.map(connectionRouteLabel)).toEqual(["LAN", "Tailscale", "VPN"]);

    const corrected = mergeLearnedRoutes({
      entry: entryWithRoutes(lanOnly, first),
      activeRoute: LAN,
      reported: [{ ...tailscale, kind: "lan" }, mesh],
      allowInsecure: true,
    })!;
    expect(ids(corrected)).toEqual(ids(first));
    expect(corrected.map(connectionRouteLabel)).toEqual(["LAN", "VPN", "VPN"]);
    expect(
      mergeLearnedRoutes({
        entry: entryWithRoutes(lanOnly, corrected),
        activeRoute: LAN,
        reported: [{ ...tailscale, kind: "lan" }, mesh],
        allowInsecure: true,
      }),
    ).toBeNull();
  });

  it("leaves user routes alone and does not learn an address already saved", () => {
    const entry = entryWithRoutes(publicOnly, [LAN, PUBLIC]);
    expect(
      mergeLearnedRoutes({
        entry,
        activeRoute: PUBLIC,
        reported: [{ httpBaseUrl: "http://192.168.1.10:3773" }],
        allowInsecure: true,
      }),
    ).toBeNull();
    expect(
      mergeLearnedRoutes({ entry, activeRoute: PUBLIC, reported: [], allowInsecure: true }),
    ).toBeNull();
  });

  it("keeps a token paired over HTTPS off plain HTTP addresses outside the tailnet", () => {
    const routes = mergeLearnedRoutes({
      entry: publicOnly,
      activeRoute: PUBLIC,
      reported: [
        { kind: "lan", httpBaseUrl: "http://192.168.1.10:3773/" },
        { kind: "tailnet", httpBaseUrl: "http://100.101.102.103:3773/" },
        { kind: "tailnet", httpBaseUrl: "https://desk.tail1234.ts.net/" },
      ],
      allowInsecure: true,
    });
    expect(ids(routes)).toEqual([
      `learned:${ENVIRONMENT_ID}:http://100.101.102.103:3773@public`,
      `learned:${ENVIRONMENT_ID}:https://desk.tail1234.ts.net@public`,
      "public",
    ]);
  });

  it("drops a stale plain HTTP route borrowing an HTTPS-paired token while another route is active", () => {
    const lanOrigin = "http://10.0.0.42:3773";
    const stale = learned(`learned:${ENVIRONMENT_ID}:${lanOrigin}@public`, `${lanOrigin}/`);
    const entry = entryWithRoutes(publicOnly, [stale, LAN, PUBLIC]);
    expect(sendsTokenInClear([stale, LAN, PUBLIC], stale)).toBe(true);
    expect(ids(usableRoutes(entry))).toEqual(["lan", "public"]);
    const routes = mergeLearnedRoutes({
      entry,
      activeRoute: LAN,
      reported: [{ kind: "lan", httpBaseUrl: `${lanOrigin}/` }],
      allowInsecure: true,
    });
    // The stale route is gone; the address is learned again with the LAN-paired token.
    expect(ids(routes)).toEqual(["lan", `learned:${ENVIRONMENT_ID}:${lanOrigin}@lan`, "public"]);
  });

  it("keeps plain HTTP routes that don't borrow the active HTTPS-paired token", () => {
    const lanOrigin = "http://10.0.0.42:3773";
    const overLan = learned(`learned:${ENVIRONMENT_ID}:${lanOrigin}@lan`, `${lanOrigin}/`);
    const routes = mergeLearnedRoutes({
      entry: entryWithRoutes(publicOnly, [overLan, LAN, PUBLIC]),
      activeRoute: PUBLIC,
      reported: [{ kind: "lan", httpBaseUrl: `${lanOrigin}/` }],
      allowInsecure: true,
    });
    expect(routes).toBeNull();
  });

  it("learns plain HTTP LAN addresses over a token paired over plain HTTP", () => {
    const entry = entryWithRoutes(publicOnly, [LAN, PUBLIC]);
    const routes = mergeLearnedRoutes({
      entry,
      activeRoute: LAN,
      reported: [{ kind: "lan", httpBaseUrl: "http://10.0.0.42:3773/" }],
      allowInsecure: true,
    });
    expect(ids(routes)).toEqual([
      "lan",
      `learned:${ENVIRONMENT_ID}:http://10.0.0.42:3773@lan`,
      "public",
    ]);
  });

  it("skips plain HTTP from an HTTPS page and never learns loopback", () => {
    expect(
      mergeLearnedRoutes({
        entry: lanOnly,
        activeRoute: LAN,
        reported: [
          { httpBaseUrl: "http://10.0.0.42:3773/" },
          { httpBaseUrl: "http://127.0.0.1:3773/" },
        ],
        allowInsecure: false,
      }),
    ).toBeNull();
  });

  it("removes learned routes along with the route whose credential they borrow", () => {
    const overPublic = mergeLearnedRoutes({
      entry: publicOnly,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: `${httpsLan}/` }],
      allowInsecure: true,
    })!;
    expect(routesAfterRemoving(overPublic, "public")).toEqual([]);

    const overLan = mergeLearnedRoutes({
      entry: entryWithRoutes(publicOnly, [LAN, PUBLIC]),
      activeRoute: LAN,
      reported: [{ httpBaseUrl: "https://desk.tail1234.ts.net/" }],
      allowInsecure: true,
    })!;
    expect(ids(routesAfterRemoving(overLan, "lan"))).toEqual(["public"]);
    expect(ids(routesAfterRemoving(overLan, "public"))).toHaveLength(2);
  });

  it("keeps pull request routing trust when a route is learned", () => {
    const learned = mergeLearnedRoutes({
      entry: publicOnly,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: `${httpsLan}/` }],
      allowInsecure: true,
    })!;
    expect(pullRequestRoutingConnectionKey(entryWithRoutes(publicOnly, learned))).toBe(
      pullRequestRoutingConnectionKey(publicOnly),
    );
  });

  it("keeps the paired credential when learning over a learned route", () => {
    const first = mergeLearnedRoutes({
      entry: publicOnly,
      activeRoute: PUBLIC,
      reported: [{ httpBaseUrl: `${httpsLan}/` }],
      allowInsecure: true,
    })!;
    const learnedLan = first[0]!;
    const next = mergeLearnedRoutes({
      entry: entryWithRoutes(publicOnly, first),
      activeRoute: learnedLan,
      reported: [{ httpBaseUrl: `${httpsLan}/` }, { httpBaseUrl: "https://desk.tail1234.ts.net/" }],
      allowInsecure: true,
    })!;
    const learnedRoutes = next.filter(isLearned);
    expect(learnedRoutes).toHaveLength(2);
    for (const route of learnedRoutes) {
      expect(credentialConnectionId(connectionRouteId(route.target))).toBe("public");
    }
  });

  it("saves a scheme change on the same host as a new address", () => {
    const first = mergeLearnedRoutes({
      entry: lanOnly,
      activeRoute: LAN,
      reported: [{ httpBaseUrl: "http://desk.local:3773/" }],
      allowInsecure: true,
    })!;
    const moved = mergeLearnedRoutes({
      entry: entryWithRoutes(lanOnly, first),
      activeRoute: LAN,
      reported: [{ httpBaseUrl: "https://desk.local:3773/" }],
      allowInsecure: true,
    });
    expect(moved?.filter(isLearned).map((route) => profileOf(route))).toEqual([
      expect.objectContaining({ httpBaseUrl: "https://desk.local:3773/" }),
    ]);
  });
});
