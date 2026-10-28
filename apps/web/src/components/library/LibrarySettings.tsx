import { useLocation } from "@tanstack/react-router";
import { SquareArrowOutUpRightIcon, XIcon } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { useCloseAppModal } from "../sidebar/mainAppLocation";
import { SettingsSidebarNav } from "../settings/SettingsSidebarNav";
import { SETTINGS_SECTION_LABELS, type SettingsPath } from "../settings/settingsSearch";
import {
  isSettingsPath,
  moveSettingsOutOfLibrary,
  moveSettingsToLibraryList,
  setLibrarySettingsHost,
} from "../settings/settingsPlacement";
import { Button } from "../ui/button";

// Esc belongs to text fields and open popups before it steps out of Settings.
function ownsEscape(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [role="dialog"], [data-slot$="popup"]') !== null)
  );
}

/**
 * Leaves Library Settings: off the Settings route first, then the sidebar goes back,
 * or, for the breadcrumb, to the Library list.
 */
export function useCloseLibrarySettings(to: "previous" | "library" = "previous") {
  const pathname = useLocation({ select: (location) => location.pathname });
  const closeAppModal = useCloseAppModal();
  const leave = to === "library" ? moveSettingsToLibraryList : moveSettingsOutOfLibrary;
  return () => {
    if (!isSettingsPath(pathname)) return leave();
    // In this order the sidebar change cannot turn Settings into the page on the way out.
    void closeAppModal().then(leave);
  };
}

/**
 * Library > Settings: the section list, or one section's content, which the Settings
 * route portals in. The main area keeps showing what was open, read-only.
 */
export function LibrarySettings() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const onSettings = isSettingsPath(pathname);
  const close = useCloseLibrarySettings();
  const showLibrary = useCloseLibrarySettings("library");
  const [listRequested, setListRequested] = useState(false);
  const showList = !onSettings || listRequested;
  const sectionLabel = onSettings
    ? (SETTINGS_SECTION_LABELS[pathname as SettingsPath] ?? "Settings")
    : null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || ownsEscape(event.target)) return;
    event.preventDefault();
    if (!showList) setListRequested(true);
    else close();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-sidebar-border ps-3 pe-1 text-xs">
        <nav aria-label="Settings location" className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            onClick={showLibrary}
            className="cursor-pointer text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            Library
          </button>
          <span aria-hidden className="text-sidebar-muted-foreground/60">
            /
          </span>
          {sectionLabel && !showList ? (
            <>
              <button
                type="button"
                onClick={() => setListRequested(true)}
                className="cursor-pointer text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                Settings
              </button>
              <span aria-hidden className="text-sidebar-muted-foreground/60">
                /
              </span>
              <span aria-current="page" className="truncate font-semibold text-sidebar-foreground">
                {sectionLabel}
              </span>
            </>
          ) : (
            <span aria-current="page" className="font-semibold text-sidebar-foreground">
              Settings
            </span>
          )}
        </nav>
        {onSettings ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={moveSettingsOutOfLibrary}
            data-info="Open Settings as a page in the main area, at the same section"
          >
            <SquareArrowOutUpRightIcon />
            Open as page
          </Button>
        ) : null}
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close Settings"
          onClick={close}
          data-info="Close Settings and put the sidebar back (Esc)"
        >
          <XIcon />
        </Button>
      </div>
      {showList ? (
        <SettingsSidebarNav
          pathname={pathname}
          inLibrary
          onNavigate={() => setListRequested(false)}
        />
      ) : (
        <div ref={setLibrarySettingsHost} className="flex min-h-0 flex-1 flex-col" />
      )}
    </div>
  );
}
