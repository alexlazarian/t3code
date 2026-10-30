import { Platform } from "react-native";

import { Toolbar } from "../../components/ui/Toolbar";
import { useSelectWorkspaceTab } from "../workspace/useSelectWorkspaceTab";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";

/** The phone's native dock only knows its built-in tabs, so Overview enters from the header. */
export function OverviewEntryButton() {
  const workspace = useWorkspaceTabs();
  const selectTab = useSelectWorkspaceTab();
  if (Platform.OS !== "ios" || !workspace || workspace.settingsOpen) return null;
  const tab = workspace.state.selectedTab;
  if (tab !== "threads" && tab !== "overview") return null;
  return (
    <Toolbar placement="left">
      {tab === "threads" ? (
        <Toolbar.Button
          accessibilityLabel="Overview"
          icon="square.grid.2x2"
          onPress={() => selectTab("overview")}
        />
      ) : (
        <Toolbar.Button
          accessibilityLabel="Back to Chats"
          icon="chevron.left"
          onPress={() => selectTab("threads")}
        />
      )}
    </Toolbar>
  );
}
