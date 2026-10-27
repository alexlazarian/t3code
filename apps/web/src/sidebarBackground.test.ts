import { describe, expect, it } from "vite-plus/test";

import { parseSidebarBackgroundSettings, sidebarBackgroundThemeKey } from "./sidebarBackground";

describe("parseSidebarBackgroundSettings", () => {
  it("clamps stored values and falls back for invalid fields", () => {
    expect(
      parseSidebarBackgroundSettings({
        fit: "tile",
        tileSize: 9000,
        imageOpacity: -20,
        overlayColor: "red",
        overlayOpacity: 42.4,
      }),
    ).toEqual({
      fit: "tile",
      tileSize: 512,
      imageOpacity: 0,
      overlayColor: "#000000",
      overlayOpacity: 42,
    });
  });

  it("rejects records without a known fit", () => {
    expect(parseSidebarBackgroundSettings({ fit: "stretch" })).toBeNull();
    expect(parseSidebarBackgroundSettings(null)).toBeNull();
  });
});

describe("sidebarBackgroundThemeKey", () => {
  it("keys default themes by appearance and other themes by id", () => {
    expect(sidebarBackgroundThemeKey("system", "dark")).toBe("dark");
    expect(sidebarBackgroundThemeKey("light", "dark")).toBe("dark");
    expect(sidebarBackgroundThemeKey("grove", "light")).toBe("grove");
  });
});
