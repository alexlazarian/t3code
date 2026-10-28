import { describe, expect, it } from "vite-plus/test";

import { resolveThreadHeaderTools } from "./threadHeaderTools.logic";

const everythingAvailable = {
  activeSurfaceKind: null,
  isServerThread: true,
  isGitRepo: true,
  hasProject: true,
  browserAvailable: true,
  canOperatePreview: true,
  pullRequestsAvailable: true,
} as const;

describe("resolveThreadHeaderTools", () => {
  it("lights only the button for the active surface", () => {
    const tools = resolveThreadHeaderTools({ ...everythingAvailable, activeSurfaceKind: "files" });
    expect(tools.files.on).toBe(true);
    expect(tools.diff.on || tools.preview.on || tools.pullRequests.on).toBe(false);
  });

  it("keeps a single file or pull request surface from lighting the list buttons", () => {
    expect(
      resolveThreadHeaderTools({ ...everythingAvailable, activeSurfaceKind: "file" }).files.on,
    ).toBe(false);
    expect(
      resolveThreadHeaderTools({ ...everythingAvailable, activeSurfaceKind: "pull-request" })
        .pullRequests.on,
    ).toBe(false);
  });

  it("hides surfaces that cannot open", () => {
    const tools = resolveThreadHeaderTools({
      ...everythingAvailable,
      isGitRepo: false,
      hasProject: false,
      canOperatePreview: false,
      pullRequestsAvailable: false,
    });
    expect(tools.diff.visible).toBe(false);
    expect(tools.preview.visible).toBe(false);
    expect(tools.files.visible).toBe(false);
    expect(tools.pullRequests.visible).toBe(false);
  });

  it("keeps an open surface shown so it can close", () => {
    const unavailable = {
      ...everythingAvailable,
      isGitRepo: false,
      canOperatePreview: false,
      pullRequestsAvailable: false,
    };
    expect(
      resolveThreadHeaderTools({ ...unavailable, activeSurfaceKind: "diff" }).diff.visible,
    ).toBe(true);
    expect(
      resolveThreadHeaderTools({ ...unavailable, activeSurfaceKind: "preview" }).preview.visible,
    ).toBe(true);
    expect(
      resolveThreadHeaderTools({ ...unavailable, activeSurfaceKind: "pull-requests" }).pullRequests
        .visible,
    ).toBe(true);
  });

  it("follows the toggles that do nothing without a server thread or browser", () => {
    expect(
      resolveThreadHeaderTools({
        ...everythingAvailable,
        isServerThread: false,
        activeSurfaceKind: "diff",
      }).diff.visible,
    ).toBe(false);
    const noBrowser = resolveThreadHeaderTools({
      ...everythingAvailable,
      browserAvailable: false,
      activeSurfaceKind: "preview",
    });
    expect(noBrowser.preview).toEqual({ on: false, visible: false });
  });
});
