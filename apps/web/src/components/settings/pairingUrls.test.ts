import { describe, expect, it } from "vite-plus/test";

import { resolvePairingUrl } from "./pairingUrls";

describe("settings pairing URL helpers", () => {
  it("pairs on the endpoint's own address", () => {
    expect(resolvePairingUrl("http://192.168.1.44:3773", "PAIRCODE")).toBe(
      "http://192.168.1.44:3773/pair#token=PAIRCODE",
    );
    expect(resolvePairingUrl("https://host.tailnet.example.ts.net:3773", "PAIRCODE")).toBe(
      "https://host.tailnet.example.ts.net:3773/pair#token=PAIRCODE",
    );
  });
});
