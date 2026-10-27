import type { ProjectIconColor } from "@t3tools/contracts";

const MIN_CHROMA = 0.04;
const MIN_OPAQUE_SHARE = 0.05;
const MIN_CHROMATIC_SHARE = 0.25;
const NEUTRAL_MIX = { r: 0x8a, g: 0x85, b: 0x7e };
const ACCENT_WEIGHT = 0.74;

// Tailwind 500 values, matching the swatches in projectIconColors.ts.
const ICON_COLOR_HEX: Record<ProjectIconColor, string> = {
  gray: "#6b7280",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

function toHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}

function parseHex(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
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

export function mixAccentFill(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const mix = (a: number, n: number) => a * ACCENT_WEIGHT + n * (1 - ACCENT_WEIGHT);
  return toHex(mix(r, NEUTRAL_MIX.r), mix(g, NEUTRAL_MIX.g), mix(b, NEUTRAL_MIX.b));
}

export function projectIconOverrideFill(
  projectIcon: { readonly kind: string; readonly color?: ProjectIconColor } | null | undefined,
): string | null {
  return projectIcon?.color ? mixAccentFill(ICON_COLOR_HEX[projectIcon.color]) : null;
}
