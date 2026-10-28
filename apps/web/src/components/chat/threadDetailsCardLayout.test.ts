import { describe, expect, it } from "vite-plus/test";
import { resolveThreadDetailsCardDensity } from "./threadDetailsCardLayout";

describe("resolveThreadDetailsCardDensity", () => {
  const content = { full: 327, compact: 182 };

  it("drops to the densest level that still fits the available height", () => {
    expect(resolveThreadDetailsCardDensity(400, content)).toBe("full");
    expect(resolveThreadDetailsCardDensity(327, content)).toBe("full");
    expect(resolveThreadDetailsCardDensity(250, content)).toBe("compact");
    expect(resolveThreadDetailsCardDensity(120, content)).toBe("essential");
  });

  it("renders a density before it is measured so it can be measured", () => {
    expect(resolveThreadDetailsCardDensity(0, { full: 0, compact: 0 })).toBe("full");
    expect(resolveThreadDetailsCardDensity(120, { full: 327, compact: 0 })).toBe("compact");
  });
});
