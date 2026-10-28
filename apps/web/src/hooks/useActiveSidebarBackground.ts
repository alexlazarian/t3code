import { sidebarBackgroundThemeKey, useSidebarBackground } from "../sidebarBackground";
import { resolveThemeHalf } from "../themePalette";
import { useTheme } from "./useTheme";

export function useActiveSidebarBackgroundThemeKey(): string {
  const { resolvedTheme, theme, themeHalves } = useTheme();
  const activeTheme = resolveThemeHalf(theme, themeHalves, resolvedTheme);
  return sidebarBackgroundThemeKey(activeTheme, resolvedTheme);
}

export function useActiveSidebarBackground() {
  return useSidebarBackground(useActiveSidebarBackgroundThemeKey());
}
