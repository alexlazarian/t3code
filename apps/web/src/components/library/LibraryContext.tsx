import { useLocation } from "@tanstack/react-router";

import { useContextPageStore } from "../context/contextPageStore";
import type { LibraryContext as LibraryContextValue } from "./Library.logic";
import { LibraryItemList } from "./LibraryItemList";
import { useLibraryProvider } from "./useLibrary";

export function LibraryContext(props: { readonly ctx: LibraryContextValue }) {
  const { entries } = useLibraryProvider(props.ctx);
  const pathname = useLocation({ select: (location) => location.pathname });
  const open = useContextPageStore((store) => store.open);
  const providers = [...new Map(entries.map((entry) => [entry.driverKind, entry])).values()];
  return (
    <LibraryItemList
      empty="No provider is set up on this machine."
      items={providers.map((entry) => {
        const supported = entry.driverKind === "claude";
        return {
          key: entry.driverKind,
          name: supported ? "Claude" : entry.displayName,
          meta: supported ? "memories, instructions, skills" : "not supported yet",
          detail: supported
            ? "Claude's memories for this project's folders, its instruction files, skills and commands."
            : "Only Claude's context shows here for now.",
          actions: supported ? [{ label: "Open Context", onSelect: () => open(pathname) }] : [],
        };
      })}
    />
  );
}
