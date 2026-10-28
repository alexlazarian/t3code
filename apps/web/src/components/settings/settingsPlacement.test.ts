import { describe, expect, it } from "vite-plus/test";

import { useUiStateStore } from "../../uiStateStore";
import {
  moveSettingsIntoLibrary,
  moveSettingsOutOfLibrary,
  moveSettingsToLibraryList,
} from "./settingsPlacement";

const sidebar = () => {
  const { sidebarPanel, libraryCategory } = useUiStateStore.getState();
  return [sidebarPanel, libraryCategory];
};

describe("Settings placement", () => {
  it("puts the sidebar back where it was when Settings leaves Library", () => {
    useUiStateStore.setState({ sidebarPanel: "threads", libraryCategory: "providers" });
    moveSettingsIntoLibrary();
    expect(sidebar()).toEqual(["library", "settings"]);
    // Opening it again while it is already there must not forget the way back.
    moveSettingsIntoLibrary();
    moveSettingsOutOfLibrary();
    expect(sidebar()).toEqual(["threads", "providers"]);

    useUiStateStore.setState({ sidebarPanel: "library", libraryCategory: "machines" });
    moveSettingsIntoLibrary();
    moveSettingsOutOfLibrary();
    expect(sidebar()).toEqual(["library", "machines"]);
  });

  it("stays in Library when the breadcrumb's Library is chosen, even if Settings came from Threads", () => {
    useUiStateStore.setState({ sidebarPanel: "threads", libraryCategory: "providers" });
    moveSettingsIntoLibrary();
    moveSettingsToLibraryList();
    expect(sidebar()).toEqual(["library", "providers"]);
  });

  it("leaves the sidebar alone when Settings is not in Library", () => {
    useUiStateStore.setState({ sidebarPanel: "library", libraryCategory: "skills" });
    moveSettingsOutOfLibrary();
    expect(sidebar()).toEqual(["library", "skills"]);
  });
});
