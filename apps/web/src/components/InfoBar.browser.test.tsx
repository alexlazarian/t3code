import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import {
  __resetClientSettingsPersistenceForTests,
  __setClientSettingsForTests,
  persistClientSettingsPatch,
} from "../hooks/useSettings";
import { InfoBar } from "./InfoBar";

function useTestClientSettings(): Disposable {
  __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
  return { [Symbol.dispose]: __resetClientSettingsPersistenceForTests };
}

describe("InfoBar", () => {
  it("keeps the hovered control's text when a settings change re-renders the bar", async () => {
    using _settings = useTestClientSettings();
    await using screen = await render(
      <>
        <button type="button" data-info="Toggle sidebar (Mod+B)">
          Toggle
        </button>
        <InfoBar />
      </>,
      // No router: the bar reads only the DOM and stores.
      { router: false },
    );
    await userEvent.hover(screen.getByRole("button", { name: "Toggle" }));
    await expect.element(screen.getByText("Toggle sidebar (Mod+B)")).toBeInTheDocument();

    await persistClientSettingsPatch({ sidebarProjectGroupingMode: "separate" }, async () => {});

    await expect.element(screen.getByText("Toggle sidebar (Mod+B)")).toBeInTheDocument();
  });
});
