import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  consumePendingTerminalFocus,
  focusTerminal,
  focusTerminalViewport,
  registerTerminalFocusTarget,
} from "./terminalFocus";

// A closing panel clips the viewport rather than hiding it; the mount
// stays focusable around a surface whose input refuses focus while hidden.
function mountClippedViewport() {
  const clipper = document.createElement("div");
  clipper.style.cssText = "display:grid;grid-template-rows:0fr;overflow:clip";
  const clip = document.createElement("div");
  clip.style.cssText = "min-height:0;overflow:clip";
  const mount = document.createElement("div");
  mount.tabIndex = -1;
  const input = document.createElement("textarea");
  mount.append(input);
  clip.append(mount);
  clipper.append(clip);
  document.body.append(clipper);
  const state = { visible: false };
  const surface = {
    focus() {
      if (state.visible) input.focus({ preventScroll: true });
    },
  };
  const focus = () =>
    focusTerminalViewport({ mount, surface, canOperate: true, visible: state.visible });
  return {
    input,
    state,
    focus,
    [Symbol.dispose]: () => clipper.remove(),
  };
}

describe("focusTerminalViewport", () => {
  it("keeps a request made while the terminal is hidden until it shows", () => {
    const ref = scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("hidden-terminal"));
    using viewport = mountClippedViewport();
    const unregister = registerTerminalFocusTarget({
      threadRef: ref,
      terminalId: "a",
      focus: viewport.focus,
    });
    using _unregister = { [Symbol.dispose]: unregister };

    focusTerminal(ref, "a");
    viewport.state.visible = true;
    consumePendingTerminalFocus(ref, "a");

    expect(document.activeElement).toBe(viewport.input);
  });
});
