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

function faviconTarget(project: ProjectFaviconProject) {
  return {
    environmentId: project.environmentId,
    cwd: project.workspaceRoot,
    faviconPath: project.faviconPath,
  };
}

function sampleableUrl(project: ProjectFaviconProject | null, src: string | null) {
  return projectIconOverrideColor(project?.projectIcon) || !src || isProjectFaviconFallbackUrl(src)
    ? null
    : src;
}

export function useProjectAccentColor(project: ProjectFaviconProject | null): string | null {
  const src = useAtomValue(
    project ? projectFaviconUrlAtom(faviconTarget(project)) : NO_FAVICON_URL,
  );
  const url = sampleableUrl(project, src);
  const sampled = useSyncExternalStore(
    url ? subscriberFor(url) : subscribeNothing,
    () => (url ? (resolved.get(url) ?? null) : null),
    () => null,
  );
  return projectIconOverrideColor(project?.projectIcon) ?? sampled;
}

const faviconUrlsAtom = Atom.family((key: string) =>
  Atom.make((get) =>
    (JSON.parse(key) as Array<ReturnType<typeof faviconTarget> | null>).map((target) =>
      target ? get(projectFaviconUrlAtom(target)) : null,
    ),
  ),
);

const listSubscribers = new Map<string, (listener: () => void) => () => void>();

function subscriberForUrls(urls: ReadonlyArray<string>) {
  const key = urls.join("\n");
  let subscribe = listSubscribers.get(key);
  if (!subscribe) {
    subscribe = (listener) => {
      for (const url of urls) ensureSampled(url);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    listSubscribers.set(key, subscribe);
  }
  return subscribe;
}

/** One lookup for a list of projects, for views that cannot call a hook per project. */
export function useProjectAccentColors(
  projects: ReadonlyArray<ProjectFaviconProject | null>,
): ReadonlyArray<string | null> {
  const srcs = useAtomValue(
    faviconUrlsAtom(JSON.stringify(projects.map((p) => (p ? faviconTarget(p) : null)))),
  );
  const urls = projects.map((project, index) => sampleableUrl(project, srcs[index] ?? null));
  // A joined string keeps the snapshot stable between unrelated sample resolutions.
  const sampled = useSyncExternalStore(
    subscriberForUrls(urls.filter((url) => url !== null)),
    () => urls.map((url) => (url ? (resolved.get(url) ?? "") : "")).join("\n"),
    () => "",
  ).split("\n");
  return projects.map(
    (project, index) => projectIconOverrideColor(project?.projectIcon) ?? (sampled[index] || null),
  );
}
