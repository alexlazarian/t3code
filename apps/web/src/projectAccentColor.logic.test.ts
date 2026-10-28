import { describe, expect, it } from "vite-plus/test";

import {
  dominantColorFromPixels,
  projectFillColor,
  projectIconOverrideColor,
} from "./projectAccentColor.logic";

function pixels(
  size: number,
  fill: (x: number, y: number) => readonly [number, number, number, number],
) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      data.set(fill(x, y), (y * size + x) * 4);
    }
  }
  return data;
}

function channels(hex: string | null) {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  const value = Number.parseInt(hex!.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

describe("dominantColorFromPixels", () => {
  it("solid orange icon yields orange", () => {
    const { r, g, b } = channels(dominantColorFromPixels(pixels(32, () => [249, 115, 22, 255])));
    expect(r).toBeGreaterThan(220);
    expect(g).toBeGreaterThan(90);
    expect(g).toBeLessThan(140);
    expect(b).toBeLessThan(60);
  });

  it("black icon yields null", () => {
    expect(dominantColorFromPixels(pixels(32, () => [0, 0, 0, 255]))).toBeNull();
  });

  it("fully transparent yields null", () => {
    expect(dominantColorFromPixels(pixels(32, () => [255, 0, 0, 0]))).toBeNull();
  });

  it("transparent border with a blue center yields blue", () => {
    const center = (x: number, y: number) => x >= 8 && x < 24 && y >= 8 && y < 24;
    const { r, b } = channels(
      dominantColorFromPixels(
        pixels(32, (x, y) => (center(x, y) ? [37, 99, 235, 255] : [0, 0, 0, 0])),
      ),
    );
    expect(b).toBeGreaterThan(200);
    expect(r).toBeLessThan(80);
  });

  it("returns null when chromatic pixels are under a quarter of the opaque ones", () => {
    const red = (x: number, y: number) => (y * 32 + x) % 5 === 0;
    expect(
      dominantColorFromPixels(
        pixels(32, (x, y) => (red(x, y) ? [220, 20, 20, 255] : [0, 0, 0, 255])),
      ),
    ).toBeNull();
  });

  it("returns a color once chromatic pixels pass a quarter of the opaque ones", () => {
    const red = (x: number, y: number) => (y * 32 + x) % 3 === 0;
    expect(
      dominantColorFromPixels(
        pixels(32, (x, y) => (red(x, y) ? [220, 20, 20, 255] : [0, 0, 0, 255])),
      ),
    ).not.toBeNull();
  });

  it("returns null when opaque pixels are under 5% of the image", () => {
    expect(
      dominantColorFromPixels(
        pixels(32, (x, y) => (x < 7 && y < 7 ? [220, 20, 20, 255] : [0, 0, 0, 0])),
      ),
    ).toBeNull();
  });

  it("returns a color when opaque pixels pass 5% of the image", () => {
    expect(
      dominantColorFromPixels(
        pixels(32, (x, y) => (x < 8 && y < 8 ? [220, 20, 20, 255] : [0, 0, 0, 0])),
      ),
    ).not.toBeNull();
  });

  it("ignores near-gray colors below the chroma floor", () => {
    expect(dominantColorFromPixels(pixels(32, () => [128, 124, 120, 255]))).toBeNull();
  });
});

describe("projectIconOverrideColor", () => {
  it("maps an icon color to its Tailwind theme variable", () => {
    expect(projectIconOverrideColor({ color: "red" })).toBe("var(--color-red-500)");
  });

  it("returns null without an icon color", () => {
    expect(projectIconOverrideColor(null)).toBeNull();
    expect(projectIconOverrideColor({})).toBeNull();
  });
});

describe("projectFillColor", () => {
  it("mixes the project color toward warm gray, keeping CSS vars intact", () => {
    expect(projectFillColor("#f97316")).toBe("color-mix(in oklab, #f97316 74%, #8a857e)");
    expect(projectFillColor("var(--color-blue-500)")).toBe(
      "color-mix(in oklab, var(--color-blue-500) 74%, #8a857e)",
    );
  });

  it("projects without a color get the neutral fill", () => {
    expect(projectFillColor(null)).toBe("color-mix(in oklab, #8d867d 74%, #8a857e)");
  });
});
