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
  const [, a, bb] = oklab(r, g, b);
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

type Oklab = readonly [number, number, number];

function hexChannels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function oklab(r: number, g: number, b: number): Oklab {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function relativeLuminance([L, a, b]: Oklab): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return (
    0.2126 * clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
    0.7152 * clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
    0.0722 * clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  );
}

function mixOklab(a: Oklab, b: Oklab, share: number): Oklab {
  const other = 1 - share;
  return [a[0] * share + b[0] * other, a[1] * share + b[1] * other, a[2] * share + b[2] * other];
}

const NEUTRAL_PROJECT_COLOR = "#8d867d";
const FILL_BASE = "#8a857e";
const FILL_SHARE = 0.74;
/** Dark ink on every overview fill, in both themes, as in the prototype. */
const OVERVIEW_INK = "#16130f";
const MIN_INK_CONTRAST = 4.5;
// The prototype lifts sampled favicon colors at least this far toward white.
const SAMPLE_LIFT = 0.32;
// Enough white that the darkest palette colors (gray, indigo) still carry dark ink.
const OVERRIDE_FILL_SHARE = 0.92;

/** WCAG contrast of the card ink on the fill made from `hex`, with `whiteShare` of white mixed in after. */
export function fillInkContrast(hex: string, whiteShare = 0): number {
  const fill = mixOklab(
    mixOklab(oklab(...hexChannels(hex)), oklab(...hexChannels(FILL_BASE)), FILL_SHARE),
    [1, 0, 0],
    1 - whiteShare,
  );
  return (
    (relativeLuminance(fill) + 0.05) /
    (relativeLuminance(oklab(...hexChannels(OVERVIEW_INK))) + 0.05)
  );
}

function liftSample(hex: string): string {
  const [r, g, b] = hexChannels(hex);
  let lifted = hex;
  for (let lift = SAMPLE_LIFT; lift < 1.01; lift += 0.02) {
    const toWhite = (c: number) => c + (255 - c) * Math.min(1, lift);
    lifted = toHex(toWhite(r), toWhite(g), toWhite(b));
    if (fillInkContrast(lifted) >= MIN_INK_CONTRAST) break;
  }
  return lifted;
}

/**
 * Pulled toward warm gray so a full grid of projects doesn't shout. Sampled hex colors are lifted
 * toward white until dark ink reads; CSS-var overrides get a fixed white mix instead.
 */
export function projectFillColor(color: string | null): string {
  if (color === null) return `color-mix(in oklab, ${NEUTRAL_PROJECT_COLOR} 74%, ${FILL_BASE})`;
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `color-mix(in oklab, ${liftSample(color)} 74%, ${FILL_BASE})`;
  }
  return `color-mix(in oklab, color-mix(in oklab, ${color} 74%, ${FILL_BASE}) ${OVERRIDE_FILL_SHARE * 100}%, white)`;
}
