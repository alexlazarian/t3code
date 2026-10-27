import { describe, expect, it } from "vite-plus/test";

import { dominantColorFromPixels } from "./projectAccentColor.logic";

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
});
