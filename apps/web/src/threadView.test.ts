import { describe, expect, it } from "vite-plus/test";

import { isOverviewPathname, nextThreadView } from "./threadView";

describe("threadView", () => {
  it("toggles between list and overview", () => {
    expect(nextThreadView("list")).toBe("overview");
    expect(nextThreadView("overview")).toBe("list");
  });

  it("recognizes the overview route", () => {
    expect(isOverviewPathname("/overview")).toBe(true);
    expect(isOverviewPathname("/env-1/thread-1")).toBe(false);
  });
});
