import { cn } from "../../lib/utils";
import { useUiStateStore } from "../../uiStateStore";
import { LIBRARY_CATEGORIES, LIBRARY_GROUPS } from "./Library.logic";

export function LibraryPanel() {
  const category = useUiStateStore((store) => store.libraryCategory);
  const setCategory = useUiStateStore((store) => store.setLibraryCategory);
  const active = LIBRARY_CATEGORIES.find((entry) => entry.id === category) ?? LIBRARY_CATEGORIES[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-2">
      <nav aria-label="Library categories" className="flex flex-col gap-px">
        {LIBRARY_GROUPS.map((group) => (
          <div key={group.group} className="flex flex-col gap-px">
            <div className="px-2 pt-1 pb-0.5 text-2xs font-medium uppercase tracking-wide text-sidebar-muted-foreground">
              {group.group}
            </div>
            {group.categories.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={entry.id === active?.id ? "true" : undefined}
                onClick={() => setCategory(entry.id)}
                className={cn(
                  "h-6 cursor-pointer px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  entry.id === active?.id
                    ? "bg-sidebar-row-hover text-sidebar-foreground"
                    : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                )}
              >
                {entry.name}
              </button>
            ))}
          </div>
        ))}
      </nav>
      {active ? (
        <section aria-label={active.name} className="border-t border-sidebar-border px-2 pt-2">
          <div className="pb-1 text-2xs font-medium uppercase tracking-wide text-sidebar-muted-foreground">
            {active.name}
          </div>
          <p className="text-xs text-sidebar-muted-foreground">{active.tip}</p>
        </section>
      ) : null}
    </div>
  );
}
