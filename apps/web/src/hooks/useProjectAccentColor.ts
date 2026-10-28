import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { isProjectFaviconFallbackUrl } from "@t3tools/shared/projectFavicon";
import { useSyncExternalStore } from "react";

import type { ProjectFaviconProject } from "../components/ProjectFavicon";
import { dominantColorFromPixels, projectIconOverrideColor } from "../projectAccentColor.logic";
import { projectFaviconUrlAtom } from "../state/assets";

const SAMPLE_SIZE = 32;
const NO_FAVICON_URL = Atom.make<string | null>(null);
const resolved = new Map<string, string | null>();
const inFlight = new Set<string>();
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 30_000;
const DECODE_FAILED = Symbol("decode-failed");
const listeners = new Set<() => void>();

async function sampleFavicon(url: string): Promise<string | null | typeof DECODE_FAILED> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  try {
    await image.decode();
  } catch {
    return DECODE_FAILED;
  }
  try {
    const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return dominantColorFromPixels(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
  } catch {
    return null;
  }
}

function ensureSampled(url: string) {
  if (resolved.has(url) || inFlight.has(url)) return;
  const failed = failedAt.get(url);
  if (failed !== undefined && Date.now() - failed < RETRY_AFTER_MS) return;
  inFlight.add(url);
  void sampleFavicon(url).then((color) => {
    inFlight.delete(url);
    if (color === DECODE_FAILED) {
      failedAt.set(url, Date.now());
      return;
    }
    failedAt.delete(url);
    resolved.set(url, color);
    for (const listener of listeners) listener();
  });
}

const subscribers = new Map<string, (listener: () => void) => () => void>();

function subscriberFor(url: string) {
  let subscribe = subscribers.get(url);
  if (!subscribe) {
    subscribe = (listener) => {
      ensureSampled(url);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    subscribers.set(url, subscribe);
  }
  return subscribe;
}

const subscribeNothing = () => () => {};

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
  const override = projectIconOverrideColor(project?.projectIcon);
  const url = override || !src || isProjectFaviconFallbackUrl(src) ? null : src;
  const sampled = useSyncExternalStore(
    url ? subscriberFor(url) : subscribeNothing,
    () => (url ? (resolved.get(url) ?? null) : null),
    () => null,
  );
  return override ?? sampled;
}
