import { useAtomValue } from "@effect/atom-react";
import { SearchIcon, SettingsIcon } from "lucide-react";
import * as Schema from "effect/Schema";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useRouter, type AnyRouter } from "@tanstack/react-router";

import { moveWorkspaceFocus, workspaceAreaProps } from "../lib/workspaceFocus";
import { isCommandPaletteOpen, openCommandPalette } from "../commandPaletteBus";
import { onOpenSidebarRequest } from "../sidebarOpenRequest";
import { isElectron } from "../env";
import {
  releaseThreadUndoShortcut,
  threadUndoClaimsShortcut,
  undoLatestThreadAction,
} from "../hooks/showThreadUndoNotice";
import { getLocalStorageItem, removeLocalStorageItem } from "../hooks/useLocalStorage";
import {
  formatShortcutLabel,
  isRichTextBoldShortcut,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../keybindings";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import {
  selectActiveRightPanel,
  selectRightPanelTerminalOpen,
  useRightPanelStore,
} from "../rightPanelStore";
import { cn, isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import { useClientSettings } from "../hooks/useSettings";
import { useProjects } from "../state/entities";
import { usePullRequestsSupported } from "../state/environments";
import { readPullRequestListPreferences } from "./pullRequest/pullRequestListPreferences";
import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "../panelAnimations";
import { InfoBar } from "./InfoBar";
import { SidebarUpdatePill } from "./sidebar/SidebarUpdatePill";
import { PanelTab } from "./PanelTab";
import { BackgroundThreadAnnouncer } from "./BackgroundThreadAnnouncer";
import ThreadSidebar from "./Sidebar";
import {
  appModalReturnLocation,
  appModalReturnPathname,
  isSettingsPath,
  openSettings,
} from "./sidebar/mainAppLocation";
import type { SidebarRouteReveal } from "./sidebar/routeReveal";
import { SidebarBackgroundLayer } from "./sidebar/SidebarBackgroundLayer";
import {
  clampThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./ui/sidebar";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { createStartNewThread } from "../shortcuts/chatRouteCommands";
import { registerCommands, registerMenuAction } from "../shortcuts/dispatcher";
import { resolveThreadRouteRef } from "../threadRoutes";
import { isOverviewPathname, switchThreadView, useSwitchThreadView } from "../threadView";

const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "var(--desktop-window-controls-inset, 90px)";

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

// Cache the synchronous fullscreen IPC read until subscription.
let windowFullscreenSnapshot: boolean | null = null;

function macosDesktopBridge() {
  if (!isElectron || !isMacPlatform(navigator.platform)) return null;
  return window.desktopBridge ?? null;
}

function subscribeToWindowFullscreen(onChange: () => void): () => void {
  const bridge = macosDesktopBridge();
  if (
    typeof bridge?.getWindowFullscreenState !== "function" ||
    typeof bridge.onWindowFullscreenStateChange !== "function"
  ) {
    return () => {};
  }
  const unsubscribe = bridge.onWindowFullscreenStateChange((fullscreen) => {
    windowFullscreenSnapshot = fullscreen;
    onChange();
  });
  // The window may have changed state between the first render and this subscription.
  windowFullscreenSnapshot = bridge.getWindowFullscreenState();
  return () => {
    unsubscribe();
    windowFullscreenSnapshot = null;
  };
}

function readWindowFullscreen(): boolean {
  if (windowFullscreenSnapshot === null) {
    const getWindowFullscreenState = macosDesktopBridge()?.getWindowFullscreenState;
    windowFullscreenSnapshot =
      typeof getWindowFullscreenState === "function" ? getWindowFullscreenState() : false;
  }
  return windowFullscreenSnapshot;
}

function readInitialThreadSidebarWidth(): number {
  try {
    return resolveInitialThreadSidebarWidth(
      getLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY, Schema.Finite),
      window.innerWidth,
    );
  } catch (error) {
    console.error("Could not read persisted thread sidebar width.", error);
    return resolveInitialThreadSidebarWidth(null, window.innerWidth);
  }
}

function readUsagePageOpen(router: AnyRouter) {
  return router.state.location.pathname === "/settings/usage";
}

type TopBarView = "overview" | "pull-requests";

function topBarViewForPathname(pathname: string): TopBarView | null {
  if (isOverviewPathname(pathname)) return "overview";
  return pathname === "/pull-requests" ? "pull-requests" : null;
}

function isKeybindingCaptureTarget(event: KeyboardEvent) {
  return event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]");
}

function readRoutePanelsOpen(router: AnyRouter) {
  const routeThreadRef = resolveThreadRouteRef(router.state.matches.at(-1)?.params ?? {});
  if (!routeThreadRef) return { terminalOpen: false, previewOpen: false };
  return {
    terminalOpen: selectRightPanelTerminalOpen(
      useRightPanelStore.getState().byThreadKey,
      routeThreadRef,
    ),
    previewOpen:
      selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, routeThreadRef) ===
      "preview",
  };
}

export function registerNavigationHistoryCommands(router: AnyRouter): () => void {
  return registerCommands(
    {
      "navigation.back": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.back();
      },
      "navigation.forward": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.forward();
      },
    },
    {
      when: (event) => !isKeybindingCaptureTarget(event),
      context: () => ({
        ...readRoutePanelsOpen(router),
        usagePageOpen: readUsagePageOpen(router),
      }),
    },
  );
}

// Capture phase, so F6 also leaves widgets that swallow keys, such as the terminal.
function registerWorkspaceFocusCommands(router: AnyRouter): () => void {
  const move = (direction: 1 | -1) => (event: KeyboardEvent) => {
    if (event.isComposing) return false;
    // Inside a dialog the move is refused, but the key is still consumed.
    event.preventDefault();
    event.stopPropagation();
    moveWorkspaceFocus(direction);
  };
  const disposers = [
    registerCommands(
      { "workspace.focusNext": move(1), "workspace.focusPrevious": move(-1) },
      {
        capture: true,
        when: (event) => !isKeybindingCaptureTarget(event),
        context: () => readRoutePanelsOpen(router),
      },
    ),
    // A focused desktop browser forwards the keys; its renderer focus is stale.
    registerMenuAction("workspace.focusNext", () => moveWorkspaceFocus(1, "panel")),
    registerMenuAction("workspace.focusPrevious", () => moveWorkspaceFocus(-1, "panel")),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

function registerThreadViewCommand(router: AnyRouter): () => void {
  return registerCommands(
    {
      "view.toggleOverview": (event) => {
        event.preventDefault();
        event.stopPropagation();
        switchThreadView(
          router,
          isOverviewPathname(router.state.location.pathname) ? "list" : "overview",
        );
      },
    },
    { when: (event) => !isKeybindingCaptureTarget(event) },
  );
}

// Escape leaves the pull requests page when no scope (a selection, a dialog,
// a drag) claimed it, so it observes after every other scope.
function registerPullRequestsEscapeCommand(router: AnyRouter): () => void {
  return registerCommands(
    {},
    {
      observe: (event, consumed) => {
        if (consumed || event.repeat || event.isComposing || event.key !== "Escape") return;
        if (router.state.location.pathname !== "/pull-requests") return;
        event.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) activeElement.blur();
        if (router.state.location.state.__TSR_index !== 0) {
          window.history.back();
          return;
        }
        void router.navigate({ to: "/" });
      },
    },
  );
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

// A held key undoes once. Module state: undoing an archive navigates, and the
// hold must survive whatever that re-renders.
let heldUndoKey: string | null = null;

// Undoes the thread actions in the sidebar's notice. Settings owns
// mod+z while open. Captured so mod+z reaches it before the composer's own
// undo handler consumes the key.
function registerThreadUndoCommands(
  router: AnyRouter,
  readSidebarVisible: () => boolean,
): () => void {
  const threadSidebarShown = () => !isSettingsPath(router.state.location.pathname);
  const unregister = registerCommands(
    {},
    {
      capture: true,
      when: threadSidebarShown,
      onKeyDown: (event) => {
        // Cancel a held key's repeats so they cannot fall through to the
        // editor's own undo, even after the last notice is gone.
        if (event.repeat) {
          if (event.code !== heldUndoKey) return false;
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        // A modifier tapped mid-hold leaves the held key repeating.
        if (!MODIFIER_KEYS.has(event.key)) heldUndoKey = null;
        const command = resolveShortcutCommand(
          event,
          appAtomRegistry.get(primaryServerKeybindingsAtom),
          {
            context: {
              terminalFocus: isTerminalFocused(),
              previewFocus: isPreviewFocused(),
              ...readRoutePanelsOpen(router),
              // A collapsed sidebar hides the notice, so text fields keep their own undo.
              editableFocus:
                isEditableFocused(event.target) &&
                !(readSidebarVisible() && threadUndoClaimsShortcut()),
              modelPickerOpen: isModelPickerOpen(),
            },
          },
        );
        if (command !== "thread.undo") {
          if (!MODIFIER_KEYS.has(event.key)) releaseThreadUndoShortcut();
          return false;
        }
        if (isCommandPaletteOpen() || isModelPickerOpen()) return false;
        if (!undoLatestThreadAction()) return false;
        heldUndoKey = event.code;
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    },
  );
  // Pastes from a menu, dictation and drops edit text without a keypress.
  const onInput = () => {
    if (threadSidebarShown()) releaseThreadUndoShortcut();
  };
  window.addEventListener("input", onInput, true);
  return () => {
    unregister();
    window.removeEventListener("input", onInput, true);
  };
}

/** Keyboard and menu commands that live as long as the app shell. */
function registerAppShellCommands(router: AnyRouter, shellElement: Element): () => void {
  // The provider mirrors the visibility it renders onto its wrapper, so the
  // committed state is readable when a key arrives.
  const readSidebarVisible = () =>
    shellElement.closest('[data-slot="sidebar-wrapper"]')?.getAttribute("data-sidebar-state") ===
    "expanded";
  const disposers = [
    registerThreadUndoCommands(router, readSidebarVisible),
    registerNavigationHistoryCommands(router),
    registerWorkspaceFocusCommands(router),
    registerPullRequestsEscapeCommand(router),
    registerThreadViewCommand(router),
    registerMenuAction("open-settings", () => openSettings(router)),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

// The desktop app menu's accelerator; Settings has no keybinding command.
const DESKTOP_SETTINGS_SHORTCUT = {
  key: ",",
  modKey: true,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

/** The full-width bar above the sidebar and main area. On desktop it is the window's drag region. */
function AppTopBar({ windowControlsInsetStyle }: { windowControlsInsetStyle: CSSProperties }) {
  const router = useRouter();
  const usagePageOpen = useLocation({
    select: (location) => location.pathname === "/settings/usage",
  });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const infoBarEnabled = useClientSettings((s) => s.infoBarEnabled);
  const { toggleSidebar, setOpen, setOpenMobile, isMobile } = useSidebar();
  const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle", {
    context: { usagePageOpen },
  });
  const sidebarToggleLabel = `Toggle main sidebar${shortcutLabel ? ` (${shortcutLabel})` : ""}`;
  const newThreadShortcutLabel = shortcutLabelForCommand(keybindings, "chat.new", {
    context: { terminalFocus: false },
  });
  const paletteShortcutLabel = shortcutLabelForCommand(keybindings, "commandPalette.toggle", {
    context: { terminalFocus: false },
  });
  const settingsLabel = isElectron
    ? `Settings (${formatShortcutLabel(DESKTOP_SETTINGS_SHORTCUT)})`
    : "Settings";
  const [startNewThread] = useState(() => createStartNewThread(router));
  const hasProjects = useProjects().length > 0;
  const newThreadLabel = hasProjects
    ? `New thread${newThreadShortcutLabel ? ` (${newThreadShortcutLabel})` : ""}`
    : "Add a project first";

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener that toggles the sidebar on its shortcut
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      if (
        isRichTextBoldShortcut(event, window.getSelection()) &&
        event.target instanceof HTMLElement &&
        event.target.closest('[data-composer-rich-text="true"]')
      ) {
        // The rich-text composer claims Mod+B only to bold selected text;
        // the toggle stays available everywhere else.
        return;
      }
      if (
        resolveShortcutCommand(event, keybindings, { context: { usagePageOpen } }) !==
        "sidebar.toggle"
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    window.addEventListener("keydown", onKeyDown, true);
    const unsubscribe = window.desktopBridge?.onMenuAction((action) => {
      if (action === "sidebar.toggle") toggleSidebar();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      unsubscribe?.();
    };
  }, [keybindings, toggleSidebar, usagePageOpen]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the palette's open-sidebar request
  useEffect(
    () => onOpenSidebarRequest(() => (isMobile ? setOpenMobile(true) : setOpen(true))),
    [isMobile, setOpen, setOpenMobile],
  );

  // The bar lives as long as the shell, so it carries the shell's commands. Created
  // once so re-renders never re-register them.
  const [appShellCommandsRef] = useState(
    () => (node: HTMLElement | null) =>
      node === null ? undefined : registerAppShellCommands(router, node),
  );

  return (
    <header
      ref={appShellCommandsRef}
      className={cn(
        "fixed inset-x-0 top-0 z-20 flex h-(--app-top-bar-bottom) items-center border-b border-border bg-surface-raised pt-safe pl-(--workspace-controls-left) pr-(--workspace-controls-right) text-xs wco:pr-(--workspace-native-controls-inset) [&>*]:flex [&>*]:h-full [&>*]:items-center [&>*]:gap-1 [&>*]:border-border [&>*]:px-2",
        isElectron && "drag-region",
      )}
      style={windowControlsInsetStyle}
      data-app-top-bar=""
    >
      <div className="border-r pl-0!">
        <Tooltip>
          <TooltipTrigger
            info={sidebarToggleLabel}
            render={<SidebarTrigger aria-label="Toggle main sidebar" />}
          />
          <TooltipPopup side="bottom">{sidebarToggleLabel}</TooltipPopup>
        </Tooltip>
      </div>
      {infoBarEnabled ? <InfoBar /> : <div className="min-w-0 flex-1 px-0!" />}
      <div className="border-l">
        <Tooltip>
          <TooltipTrigger
            info={newThreadLabel}
            render={<span className="inline-flex [-webkit-app-region:no-drag]" />}
          >
            <Button variant="ghost" disabled={!hasProjects} onClick={startNewThread}>
              + New thread
              {newThreadShortcutLabel ? <TopBarShortcut label={newThreadShortcutLabel} /> : null}
            </Button>
          </TooltipTrigger>
          <TooltipPopup side="bottom">{newThreadLabel}</TooltipPopup>
        </Tooltip>
      </div>
      <div className="border-x">
        <Button
          variant="ghost"
          aria-label="Search and commands"
          onClick={() => openCommandPalette()}
          data-info={`Search and run commands${paletteShortcutLabel ? ` (${paletteShortcutLabel})` : ""}`}
        >
          <SearchIcon className="md:hidden" />
          <span className="max-md:hidden">Search and commands</span>
          {paletteShortcutLabel ? <TopBarShortcut label={paletteShortcutLabel} /> : null}
        </Button>
      </div>
      <div className="pr-0! [-webkit-app-region:no-drag]">
        <Button
          variant="ghost"
          aria-label="Settings"
          onClick={() => openSettings(router)}
          data-info={settingsLabel}
        >
          <SettingsIcon />
        </Button>
        <SidebarUpdatePill />
      </div>
    </header>
  );
}

/** The main area's own header: the view switch spans only the panel it controls. */
function MainViewHeader() {
  const router = useRouter();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const routeView = useLocation({ select: (location) => topBarViewForPathname(location.pathname) });
  const setThreadView = useSwitchThreadView();
  const settingsRouteOpen = useLocation({
    select: (location) => isSettingsPath(location.pathname),
  });
  const pullRequestsSupported = usePullRequestsSupported();
  // A Library page covers the main area, so no view tab is the one showing.
  const shownView = settingsRouteOpen ? null : routeView;
  const pickView = (view: TopBarView) => {
    if (view === routeView && !settingsRouteOpen) return;
    // Leaving Settings for the view that opened it goes back to the exact place.
    if (settingsRouteOpen && topBarViewForPathname(appModalReturnPathname()) === view) {
      void router.navigate({ href: appModalReturnLocation() });
      return;
    }
    if (view === "pull-requests") {
      void router.navigate({ to: "/pull-requests", search: readPullRequestListPreferences() });
      return;
    }
    setThreadView(view);
  };
  const viewShortcutLabel = shortcutLabelForCommand(keybindings, "view.toggleOverview");
  const viewSwitchLabel = `${shownView === "overview" ? "Back to threads" : "Switch to Overview"}${viewShortcutLabel ? ` (${viewShortcutLabel})` : ""}`;

  return (
    <div className="flex h-(--main-header-height) shrink-0 items-stretch overflow-x-auto border-b border-sidebar-border bg-sidebar">
      <div className="flex h-full">
        <Tooltip>
          <TooltipTrigger
            info={viewSwitchLabel}
            render={<div className="h-full [-webkit-app-region:no-drag]" />}
          >
            <div role="group" aria-label="Thread view" className="flex h-full">
              <PanelTab
                on={shownView === "overview"}
                aria-pressed={shownView === "overview"}
                onClick={() => {
                  if (shownView !== "overview") pickView("overview");
                }}
              >
                Overview
              </PanelTab>
              {pullRequestsSupported || shownView === "pull-requests" ? (
                <PanelTab
                  on={shownView === "pull-requests"}
                  aria-pressed={shownView === "pull-requests"}
                  onClick={() => {
                    if (shownView !== "pull-requests") pickView("pull-requests");
                  }}
                >
                  Pull requests
                </PanelTab>
              ) : null}
            </div>
          </TooltipTrigger>
          <TooltipPopup side="bottom">{viewSwitchLabel}</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
}

function TopBarShortcut({ label }: { label: string }) {
  return (
    <span className="max-md:hidden">
      <Kbd>{label}</Kbd>
    </span>
  );
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const sidebarArea = workspaceAreaProps("sidebar", 0, "Threads");
  const appHeightStyle = {
    "--app-height": "calc(100dvh - var(--app-top-bar-bottom))",
  } as CSSProperties;
  // Pages size themselves to --app-height, so the main area's header comes off it there.
  const mainHeightStyle = {
    "--app-height": "calc(100dvh - var(--app-top-bar-bottom) - var(--main-header-height))",
  } as CSSProperties;
  const [sidebarRouteReveal] = useState<SidebarRouteReveal>(() => ({
    observedKey: null,
    pendingKey: null,
  }));
  const { active: panelAnimationsActive, durationMs: panelAnimationDurationMs } =
    usePanelAnimationSettings();
  const pathname = useLocation({ select: (location) => location.pathname });
  const panelAnimationsSuppressed = usePanelNavigationSuppression(pathname);
  const routePanelAnimationsActive = panelAnimationsActive && !panelAnimationsSuppressed;
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialThreadSidebarWidth);
  // A clamped drag may not change width, so viewport changes need a separate subscription.
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  // The brand sits in the top bar, so the sidebar header has no brand to fit.
  const sidebarMinimumWidth = resolveThreadSidebarMinimumWidth(0);
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth, sidebarMinimumWidth);
  const resetSidebarWidth = () => {
    try {
      removeLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
    } catch (error) {
      console.error("Could not clear persisted thread sidebar width.", error);
    }
    setSidebarWidth(resolveInitialThreadSidebarWidth(null, viewportWidth));
  };
  const isWindowFullscreen = useSyncExternalStore(
    subscribeToWindowFullscreen,
    readWindowFullscreen,
  );
  const windowControlsInsetStyle = (
    isMacosDesktop && !isWindowFullscreen
      ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET }
      : {}
  ) as CSSProperties;
  const sidebarProviderStyle = {
    "--sidebar-width": `${clampThreadSidebarWidth(sidebarWidth, sidebarMinimumWidth, sidebarMaximumWidth)}px`,
    "--panel-animation-duration": `${panelAnimationDurationMs}ms`,
    "--sidebar-top": "var(--app-top-bar-bottom)",
  } as CSSProperties;

  return (
    <PanelAnimationSuppressionProvider value={panelAnimationsSuppressed}>
      <div style={appHeightStyle}>
        <SidebarProvider
          className="mt-(--workspace-topbar-height) h-(--app-height)! min-h-0!"
          data-panel-animations={routePanelAnimationsActive ? "true" : "false"}
          defaultOpen
          style={sidebarProviderStyle}
        >
          <Sidebar
            side="left"
            collapsible="offcanvas"
            data-app-sidebar=""
            {...sidebarArea}
            role="navigation"
            aria-label="Threads"
            style={windowControlsInsetStyle}
            resizable={{
              maxWidth: sidebarMaximumWidth,
              minWidth: sidebarMinimumWidth,
              shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
                nextWidth <= currentWidth ||
                wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
              storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
              onResize: setSidebarWidth,
            }}
          >
            <SidebarBackgroundLayer />
            <div className="relative flex min-h-0 flex-1 flex-col">
              <ThreadSidebar routeReveal={sidebarRouteReveal} />
            </div>
            <SidebarRail onDoubleClick={resetSidebarWidth} />
          </Sidebar>
          <div
            className="relative flex min-h-0 min-w-0 flex-1 flex-col [--main-header-height:1.875rem]"
            style={mainHeightStyle}
          >
            <MainViewHeader />
            {children}
          </div>
          <BackgroundThreadAnnouncer />
          <AppTopBar windowControlsInsetStyle={windowControlsInsetStyle} />
        </SidebarProvider>
      </div>
    </PanelAnimationSuppressionProvider>
  );
}
