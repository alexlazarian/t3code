import { useNavigate, type AnyRouter } from "@tanstack/react-router";

import { GUEST_PAGE_PATH } from "../../guestPage";

/** Settings opens over the last main-app view, or as a page of its own. */
export function isAppModalPage(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function isSidebarUtilityPage(pathname: string) {
  return pathname.startsWith("/projects/") || pathname === "/pull-requests";
}

// Pages the root route always renders without the app shell, so they are never
// a page to return to. Other paths seen before auth or on a prompt-link landing
// are still recorded; they are real app URLs, so returning to one is harmless.
const SHELL_LESS_PATHS = new Set(["/pair", "/connect", "/connect-agent", GUEST_PAGE_PATH]);

let mainAppHref: string | null = null;
let appModalReturnHref: string | null = null;

/** Remembers where Settings and the utility pages lead back to. */
export function startMainAppLocationTracking(router: AnyRouter): () => void {
  const record = () => {
    const { pathname, href } = router.state.location;
    if (isAppModalPage(pathname) || SHELL_LESS_PATHS.has(pathname)) return;
    appModalReturnHref = href;
    if (!isSidebarUtilityPage(pathname)) mainAppHref = href;
  };
  record();
  return router.subscribe("onResolved", record);
}

export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return () => navigate({ href: mainAppHref ?? "/" });
}

/** Where leaving Settings goes: the page that opened it. */
export function appModalReturnLocation() {
  return appModalReturnHref ?? mainAppHref ?? "/";
}

export function appModalReturnPathname() {
  return new URL(appModalReturnLocation(), "http://t3.invalid").pathname;
}

/** Leaves Settings for the page that opened it. */
export function useCloseAppModal() {
  const navigate = useNavigate();
  return () => navigate({ href: appModalReturnLocation() });
}
