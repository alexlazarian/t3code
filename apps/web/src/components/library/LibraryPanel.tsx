import { useLocation } from "@tanstack/react-router";

import { SettingsSidebarNav } from "../settings/SettingsSidebarNav";

/** Library is the Settings list; each entry opens its page in the main area. */
export function LibraryPanel() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return <SettingsSidebarNav pathname={pathname} placement="library" />;
}
