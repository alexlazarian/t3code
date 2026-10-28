import { Button } from "../ui/button";
import { useCloseLibrarySettings } from "../library/LibrarySettings";
import { moveSettingsOutOfLibrary } from "./settingsPlacement";

/**
 * Says why the main area ignores input while Settings is open in Library, and offers the ways out.
 * It sits below the thread header, which is a desktop drag region that would swallow its clicks.
 */
export function SettingsInLibraryBar() {
  const close = useCloseLibrarySettings();
  return (
    <div
      role="status"
      className="fixed top-[calc(var(--app-top-bar-bottom)+var(--workspace-topbar-height)+0.5rem)] left-[calc((100vw+var(--sidebar-width))/2)] z-30 flex max-w-[calc(100vw-var(--sidebar-width)-2rem)] -translate-x-1/2 items-center gap-2 border bg-popover py-1 ps-3 pe-1 text-xs text-popover-foreground shadow-lg [-webkit-app-region:no-drag]"
    >
      <span className="truncate">
        <span className="font-semibold">Read-only while Settings is open in Library.</span> It keeps
        updating; close Settings to work in it.
      </span>
      <Button size="xs" variant="outline" onClick={moveSettingsOutOfLibrary}>
        Open as page
      </Button>
      <Button size="xs" onClick={close}>
        Close Settings
      </Button>
    </div>
  );
}
