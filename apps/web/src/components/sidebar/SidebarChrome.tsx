import { ArrowLeftIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { memo } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { usePullRequestsSupported } from "../../state/environments";
import { T3Wordmark } from "../T3Wordmark";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { isSidebarUtilityPage, useNavigateToMainApp } from "./mainAppLocation";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { observeResize } from "~/lib/observeResize";
import { useUiStateStore, type SidebarPanel } from "../../uiStateStore";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  showPanelTabs = false,
}: {
  isElectron: boolean;
  showPanelTabs?: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  // On desktop the tabs lead; the row stays only for the sheet's close trigger, brand, artwork or pill.
  const desktopRow = !showPanelTabs || backdropVariant !== null || pillLabel !== null;

  return (
    <>
      <div
        className={cn(
          "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
          isElectron && "drag-region",
          !desktopRow && "md:hidden",
        )}
      >
        {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
        <div className="relative top-[calc(-1*env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
          <SidebarTrigger
            variant={backdropVariant ? "media-navigation" : "ghost"}
            className="relative top-auto translate-y-0"
            aria-label="Toggle main sidebar"
          />
        </div>
        <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
          {showPanelTabs ? null : <SidebarBrand onBackdrop={backdropVariant !== null} />}
          {pillLabel ? (
            <div className="ml-1 flex h-7 items-center">
              <Badge data-environment-identification="pill" size="sm" variant="secondary">
                {pillLabel}
              </Badge>
            </div>
          ) : null}
        </div>
      </div>
      {showPanelTabs ? <SidebarPanelTabs /> : null}
    </>
  );
});

const PANEL_TABS: ReadonlyArray<{ id: SidebarPanel; label: string; info: string }> = [
  { id: "threads", label: "Threads", info: "Threads: your threads by section" },
  {
    id: "library",
    label: "Library",
    info: "Library: skills, models, providers, access modes, stash, scheduled tasks, projects and machines",
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
              "h-7 cursor-pointer whitespace-nowrap border-r border-sidebar-border px-1.5 text-2xs outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              on
                ? "bg-sidebar-row-hover text-sidebar-foreground"
                : "text-sidebar-muted-foreground hover:text-sidebar-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function SidebarBrandWidthProbe({
  onWidthChange,
}: {
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-3 flex">
        <SidebarBrandMark onBackdrop={false} />
      </div>
    </div>
  );
}

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "relative z-10 ml-3 hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <SidebarBrandMark onBackdrop={onBackdrop} />
    </Link>
  );
}

function SidebarBrandMark({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <T3Wordmark aria-label="T3" className="h-[1cap] w-auto shrink-0" />
      <span
        className={cn(
          "truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </span>
    </span>
  );
}

function SidebarUtilityItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <SidebarMenuItem className="shrink-0">
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuButton aria-label={label} onClick={onClick} size="icon">
              {icon}
            </SidebarMenuButton>
          }
        />
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const { isMobile, setOpenMobile } = useSidebar();
  const isOnUtilityPage = useLocation({
    select: (location) => isSidebarUtilityPage(location.pathname),
  });
  const pullRequestsSupported = usePullRequestsSupported();
  const closeMobileSidebar = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const handlePullRequestsClick = () => {
    closeMobileSidebar();
    void navigate({
      to: "/pull-requests",
      search: readPullRequestListPreferences(),
    });
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
      ) : (
        pullRequestsSupported && (
          <SidebarUtilityItem
            icon={<PullRequestGlyph.pullRequest />}
            label="Pull requests"
            onClick={handlePullRequestsClick}
          />
        )
      )}
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
