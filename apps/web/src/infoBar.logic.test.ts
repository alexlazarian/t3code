import { describe, expect, it } from "vite-plus/test";

import { resolveInfoBarText, type InfoBarThread } from "./infoBar.logic";

const thread: InfoBarThread = {
  title: "Fix login",
  status: "Working",
  project: "api",
  machine: "Studio",
  offline: false,
  branch: "fix/login",
  provider: "Claude",
  model: "Opus",
  access: "Full access",
  pullRequest: { number: 42 },
};

describe("resolveInfoBarText", () => {
  it("prefers data-info over aria-label", () => {
    expect(resolveInfoBarText({ info: "Toggle (Mod+B)", ariaLabel: "Toggle" }, () => null)).toBe(
      "Toggle (Mod+B)",
    );
    expect(resolveInfoBarText({ ariaLabel: "Toggle" }, () => null)).toBe("Toggle");
  });

  it("formats a thread line and omits a missing PR", () => {
    expect(resolveInfoBarText({ threadKey: "k" }, () => thread)).toBe(
      "Fix login: Working. api on Studio, fix/login. Claude Opus, Full access. PR #42.",
    );
    expect(
      resolveInfoBarText({ threadKey: "k" }, () => ({
        ...thread,
        status: null,
        offline: true,
        branch: null,
        access: null,
        pullRequest: null,
      })),
    ).toBe("Fix login. api on Studio (offline). Claude Opus.");
    expect(
      resolveInfoBarText({ threadKey: "k" }, () => ({
        ...thread,
        project: null,
        pullRequest: { number: 7 },
      })),
    ).toBe("Fix login: Working. Studio, fix/login. Claude Opus, Full access. PR #7.");
  });

  it("ignores aria-labels on landmark and container elements", () => {
    for (const role of [
      "nav",
      "navigation",
      "region",
      "main",
      "aside",
      "grid",
      "rowgroup",
      "list",
      "group",
      "tablist",
      "toolbar",
      "section",
    ]) {
      expect(resolveInfoBarText({ ariaLabel: "Threads", role }, () => null)).toBeNull();
    }
    expect(resolveInfoBarText({ ariaLabel: "Archive", role: "button" }, () => null)).toBe(
      "Archive",
    );
  });

  it("prefers data-info over a thread line, and a thread line over aria-label", () => {
    expect(resolveInfoBarText({ info: "Open", threadKey: "k" }, () => thread)).toBe("Open");
    expect(
      resolveInfoBarText(
        { ariaLabel: "Fix login, api", threadKey: "k", role: "button" },
        () => thread,
      ),
    ).toBe("Fix login: Working. api on Studio, fix/login. Claude Opus, Full access. PR #42.");
  });

  it("returns null for an unknown target", () => {
    expect(resolveInfoBarText({}, () => thread)).toBeNull();
    expect(resolveInfoBarText({ threadKey: "gone" }, () => null)).toBeNull();
  });
});
