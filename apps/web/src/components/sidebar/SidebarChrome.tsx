import { ArrowLeftIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { memo } from "react";
import { Link, useLocation } from "@tanstack/react-router";

import { cn } from "../../lib/utils";
import { T3Wordmark } from "../T3Wordmark";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { ProviderUpdateIndicator } from "../ProviderUpdateIndicator";
import { useUiStateStore, type SidebarPanel } from "../../uiStateStore";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  showPanelTabs = false,
}: {
  isElectron: boolean;
  showPanelTabs?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
          isElectron && "drag-region",
          // On desktop the tabs lead; the row stays only for the sheet's close trigger.
          showPanelTabs && "md:hidden",
        )}
      >
        <div className="relative top-[calc(-1*env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
          <SidebarTrigger
            variant="ghost"
            className="relative top-auto translate-y-0"
            aria-label="Toggle main sidebar"
          />
        </div>
        <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
          {showPanelTabs ? null : <SidebarBrand />}
        </div>
      </div>
      {showPanelTabs ? <SidebarPanelTabs /> : null}
    </>
  );
});

const PANEL_TABS: ReadonlyArray<{ id: SidebarPanel; label: string; info: string }> = [
  { id: "threads", label: "Threads", info: "Threads, grouped by section" },
  {
    id: "library",
    label: "Library",
    info: "Library: skills, models, providers, access modes, stash, scheduled tasks, projects, and machines",
  },
];

export const sidebarPanelTabId = (panel: SidebarPanel) => `sidebar-tab-${panel}`;
export const sidebarPanelId = (panel: SidebarPanel) => `sidebar-panel-${panel}`;

function SidebarPanelTabs() {
  const panel = useUiStateStore((store) => store.sidebarPanel);
  const setPanel = useUiStateStore((store) => store.setSidebarPanel);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = PANEL_TABS.findIndex((tab) => tab.id === panel);
    const next = PANEL_TABS[(index + step + PANEL_TABS.length) % PANEL_TABS.length];
    if (!next) return;
    setPanel(next.id);
    document.getElementById(sidebarPanelTabId(next.id))?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Left panel"
      className="relative z-10 flex shrink-0 border-b border-sidebar-border [&>button]:flex-1"
      onKeyDown={onKeyDown}
    >
      {PANEL_TABS.map((tab) => {
        const on = panel === tab.id;
        return (
          <button
            key={tab.id}
            id={sidebarPanelTabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={sidebarPanelId(tab.id)}
            data-info={tab.info}
            tabIndex={on ? 0 : -1}
            onClick={() => setPanel(tab.id)}
            className={cn(
              "h-7.5 cursor-pointer whitespace-nowrap border-r border-sidebar-border px-1.5 text-control outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              // The open tab is the panel itself; the closed one sits on the raised strip.
              on
                ? "text-sidebar-foreground"
                : "bg-sidebar-control-surface text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
            )}
          >
            {tab.label}
            {tab.id === "library" ? (
              <ProviderUpdateIndicator className="ms-1 align-middle" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SidebarBrand() {
  return (
    <Link
      aria-label="Go to threads"
      className="relative z-10 ml-3 hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md text-foreground outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex"
      to="/"
    >
      <SidebarBrandMark />
    </Link>
  );
}

function SidebarBrandMark() {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <T3Wordmark aria-label="T3" className="h-[1cap] w-auto shrink-0" />
      <span className="truncate text-muted-foreground [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1">
        Code
      </span>
    </span>
  );
}

const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handleBackClick = () => {
    closeMobileSidebar();
    void navigateToMainApp();
  };

  return (
    <SidebarMenu className="flex-row items-center">
      {isOnUtilityPage ? (
        <SidebarMenuItem className="min-w-0 flex-1">
          <SidebarMenuButton onClick={handleBackClick}>
            <ArrowLeftIcon />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
