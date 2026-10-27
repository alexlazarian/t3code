import { useSyncExternalStore } from "react";

export type SidebarBackgroundFit = "cover" | "tile";

export type SidebarBackgroundSettings = Readonly<{
  fit: SidebarBackgroundFit;
  tileSize: number;
  imageOpacity: number;
  overlayColor: string;
  overlayOpacity: number;
}>;

export type SidebarBackground = Readonly<{
  settings: SidebarBackgroundSettings;
  imageUrl: string;
}>;

export const MIN_SIDEBAR_BACKGROUND_TILE_SIZE = 16;
export const MAX_SIDEBAR_BACKGROUND_TILE_SIZE = 512;
export const SIDEBAR_BACKGROUND_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const MAX_RASTER_EDGE = 2560;

const DATABASE_NAME = "t3code:sidebar-backgrounds";
const DATABASE_VERSION = 1;
const IMAGE_STORE = "images";
const SETTINGS_STORE = "settings";

const HEX_COLOR_RE = /^#[\da-f]{6}$/i;

function defaultSidebarBackgroundSettings(isSvg: boolean): SidebarBackgroundSettings {
  const base = { tileSize: 96, overlayColor: "#000000", imageOpacity: 100 } as const;
  return isSvg
    ? { ...base, fit: "tile", overlayOpacity: 0 }
    : { ...base, fit: "cover", overlayOpacity: 60 };
}

function clampPercent(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : fallback;
}

export function parseSidebarBackgroundSettings(value: unknown): SidebarBackgroundSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const fit = record.fit === "cover" || record.fit === "tile" ? record.fit : null;
  if (fit === null) return null;
  const defaults = defaultSidebarBackgroundSettings(fit === "tile");
  const tileSize =
    typeof record.tileSize === "number" && Number.isFinite(record.tileSize)
      ? Math.min(
          MAX_SIDEBAR_BACKGROUND_TILE_SIZE,
          Math.max(MIN_SIDEBAR_BACKGROUND_TILE_SIZE, Math.round(record.tileSize)),
        )
      : defaults.tileSize;
  const overlayColor =
    typeof record.overlayColor === "string" && HEX_COLOR_RE.test(record.overlayColor)
      ? record.overlayColor.toLowerCase()
      : defaults.overlayColor;
  return {
    fit,
    tileSize,
    imageOpacity: clampPercent(record.imageOpacity, defaults.imageOpacity),
    overlayColor,
    overlayOpacity: clampPercent(record.overlayOpacity, defaults.overlayOpacity),
  };
}

/** Default themes look different in light and dark, so each appearance keeps its own background. */
export function sidebarBackgroundThemeKey(activeTheme: string, appearance: "light" | "dark") {
  return activeTheme === "system" || activeTheme === "light" || activeTheme === "dark"
    ? appearance
    : activeTheme;
}

let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      for (const name of [IMAGE_STORE, SETTINGS_STORE]) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name);
        }
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("blocked", () =>
      reject(new Error("Sidebar background storage is blocked.")),
    );
  }));
}

async function transact(
  mode: IDBTransactionMode,
  use: (images: IDBObjectStore, settings: IDBObjectStore) => void,
) {
  const transaction = (await openDatabase()).transaction([IMAGE_STORE, SETTINGS_STORE], mode);
  use(transaction.objectStore(IMAGE_STORE), transaction.objectStore(SETTINGS_STORE));
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

async function readAll(): Promise<Map<string, SidebarBackground>> {
  const entries = new Map<string, SidebarBackground>();
  let imageKeys: IDBValidKey[] = [];
  let images: unknown[] = [];
  let settingsKeys: IDBValidKey[] = [];
  let settings: unknown[] = [];
  await transact("readonly", (imageStore, settingsStore) => {
    const imageKeysRequest = imageStore.getAllKeys();
    const imagesRequest = imageStore.getAll();
    const settingsKeysRequest = settingsStore.getAllKeys();
    const settingsRequest = settingsStore.getAll();
    imageKeysRequest.onsuccess = () => (imageKeys = imageKeysRequest.result);
    imagesRequest.onsuccess = () => (images = imagesRequest.result);
    settingsKeysRequest.onsuccess = () => (settingsKeys = settingsKeysRequest.result);
    settingsRequest.onsuccess = () => (settings = settingsRequest.result);
  });
  const imagesByKey = new Map(imageKeys.map((key, index) => [key, images[index]]));
  settingsKeys.forEach((key, index) => {
    const parsed = parseSidebarBackgroundSettings(settings[index]);
    if (typeof key !== "string" || !parsed) return;
    const image = imagesByKey.get(key);
    if (image instanceof Blob) {
      entries.set(key, { settings: parsed, imageUrl: URL.createObjectURL(image) });
    }
  });
  return entries;
}

type Snapshot = ReadonlyMap<string, SidebarBackground>;

let snapshot: Snapshot = new Map();
let loadStarted = false;
const listeners = new Set<() => void>();

function publish(next: Map<string, SidebarBackground>) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function replaceEntry(themeKey: string, entry: SidebarBackground | null) {
  const next = new Map(snapshot);
  const previous = next.get(themeKey);
  if (previous && previous.imageUrl !== entry?.imageUrl) {
    URL.revokeObjectURL(previous.imageUrl);
  }
  if (entry) next.set(themeKey, entry);
  else next.delete(themeKey);
  publish(next);
}

function ensureLoaded() {
  if (loadStarted || typeof indexedDB === "undefined") return;
  loadStarted = true;
  void readAll()
    .then((stored) => {
      const next = new Map(snapshot);
      for (const [themeKey, entry] of stored) {
        if (next.has(themeKey)) {
          URL.revokeObjectURL(entry.imageUrl);
        } else {
          next.set(themeKey, entry);
        }
      }
      publish(next);
    })
    .catch((error: unknown) => {
      console.error("[sidebar-background] load failed", error);
    });
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarBackground(themeKey: string): SidebarBackground | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.get(themeKey) ?? null,
    () => null,
  );
}

async function downscaleRaster(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_RASTER_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
        "image/webp",
        0.9,
      ),
    );
  } finally {
    bitmap.close();
  }
}

/** Keeps the current look settings when swapping the picture of an existing background. */
export async function setSidebarBackgroundImage(themeKey: string, file: File): Promise<void> {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  let image: Blob;
  if (isSvg) {
    if (file.size > MAX_SVG_BYTES) throw new Error("SVG backgrounds must be 2 MB or smaller.");
    image = new Blob([await file.arrayBuffer()], { type: "image/svg+xml" });
  } else if (SIDEBAR_BACKGROUND_ACCEPT.split(",").includes(file.type)) {
    image = await downscaleRaster(file);
  } else {
    throw new Error("Choose a PNG, JPEG, WebP, or SVG file.");
  }
  const settings = snapshot.get(themeKey)?.settings ?? defaultSidebarBackgroundSettings(isSvg);
  await transact("readwrite", (images, settingsStore) => {
    images.put(image, themeKey);
    settingsStore.put(settings, themeKey);
  });
  replaceEntry(themeKey, { settings, imageUrl: URL.createObjectURL(image) });
}

export function updateSidebarBackgroundSettings(
  themeKey: string,
  patch: Partial<SidebarBackgroundSettings>,
): void {
  const current = snapshot.get(themeKey);
  if (!current) return;
  const settings = parseSidebarBackgroundSettings({ ...current.settings, ...patch });
  if (!settings) return;
  replaceEntry(themeKey, { ...current, settings });
  void transact("readwrite", (_images, settingsStore) => {
    settingsStore.put(settings, themeKey);
  }).catch((error: unknown) => {
    console.error("[sidebar-background] save failed", error);
  });
}

export async function removeSidebarBackgrounds(themeKeys: ReadonlyArray<string>): Promise<void> {
  if (themeKeys.length === 0 || typeof indexedDB === "undefined") return;
  await transact("readwrite", (images, settingsStore) => {
    for (const themeKey of themeKeys) {
      images.delete(themeKey);
      settingsStore.delete(themeKey);
    }
  });
  for (const themeKey of themeKeys) replaceEntry(themeKey, null);
}
