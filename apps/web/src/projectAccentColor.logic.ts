import type { ProjectIconColor } from "@t3tools/contracts";

const MIN_CHROMA = 0.04;
const MIN_OPAQUE_SHARE = 0.05;
const MIN_CHROMATIC_SHARE = 0.25;

function toHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function oklchChroma(r: number, g: number, b: number): number {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(a, bb);
}

export function dominantColorFromPixels(rgba: Uint8ClampedArray): string | null {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const total = rgba.length / 4;
  let opaque = 0;
  let chromatic = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! <= 128) continue;
    opaque += 1;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    if (oklchChroma(r, g, b) < MIN_CHROMA) continue;
    chromatic += 1;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  if (opaque < total * MIN_OPAQUE_SHARE || chromatic < opaque * MIN_CHROMATIC_SHARE) return null;
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  return best ? toHex(best.r / best.count, best.g / best.count, best.b / best.count) : null;
}

export function projectIconOverrideColor(
  projectIcon: { readonly kind?: string; readonly color?: ProjectIconColor } | null | undefined,
): string | null {
  return projectIcon?.color ? `var(--color-${projectIcon.color}-500)` : null;
}

const NEUTRAL_PROJECT_COLOR = "#8d867d";

/** Pulled toward warm gray so a full grid of projects doesn't shout. A CSS string because the color may be a var. */
export function projectFillColor(color: string | null): string {
  return `color-mix(in oklab, ${color ?? NEUTRAL_PROJECT_COLOR} 74%, #8a857e)`;
}
