import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { isProjectFaviconFallbackUrl } from "@t3tools/shared/projectFavicon";
import { useSyncExternalStore } from "react";

import type { ProjectFaviconProject } from "../components/ProjectFavicon";
import {
  dominantColorFromPixels,
  mixAccentFill,
  projectIconOverrideFill,
} from "../projectAccentColor.logic";
import { projectFaviconUrlAtom } from "../state/assets";

const SAMPLE_SIZE = 32;
const NO_FAVICON_URL = Atom.make<string | null>(null);
const resolved = new Map<string, string | null>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

async function sampleFavicon(url: string): Promise<string | null> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const dominant = dominantColorFromPixels(
      context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
    );
    return dominant ? mixAccentFill(dominant) : null;
  } catch {
    return null;
  }
}

function ensureSampled(url: string) {
  if (resolved.has(url) || inFlight.has(url)) return;
  inFlight.add(url);
  void sampleFavicon(url).then((color) => {
    inFlight.delete(url);
    resolved.set(url, color);
    for (const listener of listeners) listener();
  });
}

export function useProjectAccentColor(project: ProjectFaviconProject | null): string | null {
  const src = useAtomValue(
    project
      ? projectFaviconUrlAtom({
          environmentId: project.environmentId,
          cwd: project.workspaceRoot,
          faviconPath: project.faviconPath,
        })
      : NO_FAVICON_URL,
  );
  const override = projectIconOverrideFill(project?.projectIcon);
  const url = override || !src || isProjectFaviconFallbackUrl(src) ? null : src;
  const subscribe = (listener: () => void) => {
    if (url) ensureSampled(url);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const sampled = useSyncExternalStore(
    subscribe,
    () => (url ? (resolved.get(url) ?? null) : null),
    () => null,
  );
  return override ?? sampled;
}
