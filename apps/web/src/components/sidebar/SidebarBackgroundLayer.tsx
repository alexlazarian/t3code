import type { CSSProperties } from "react";

import type { SidebarBackground } from "../../sidebarBackground";
import { useActiveSidebarBackground } from "../../hooks/useActiveSidebarBackground";

function sidebarBackgroundImageStyle(imageUrl: string, background: SidebarBackground) {
  const { fit, imageOpacity, tileSize } = background.settings;
  return {
    backgroundImage: `url("${imageUrl}")`,
    backgroundPosition: fit === "cover" ? "center" : "0 0",
    backgroundRepeat: fit === "cover" ? "no-repeat" : "repeat",
    backgroundSize: fit === "cover" ? "cover" : `${tileSize}px auto`,
    opacity: imageOpacity / 100,
  } satisfies CSSProperties;
}

export function SidebarBackgroundArt({ background }: { background: SidebarBackground }) {
  const { overlayColor, overlayOpacity } = background.settings;
  if (!background.imageUrl) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={sidebarBackgroundImageStyle(background.imageUrl, background)}
      />
      {overlayOpacity > 0 ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: overlayColor, opacity: overlayOpacity / 100 }}
        />
      ) : null}
    </div>
  );
}

export function SidebarBackgroundLayer() {
  const background = useActiveSidebarBackground();
  return background ? <SidebarBackgroundArt background={background} /> : null;
}
