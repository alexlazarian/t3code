import { cn } from "../../lib/utils";
import { useUiStateStore } from "../../uiStateStore";
import { LIBRARY_CATEGORIES, LIBRARY_GROUPS, type LibraryCategory } from "./Library.logic";
import { LibraryAccess } from "./LibraryAccess";
import { LibraryMachines } from "./LibraryMachines";
import { LibraryModels } from "./LibraryModels";
import { LibraryProjects } from "./LibraryProjects";
import { LibraryProviders } from "./LibraryProviders";
import { LibraryScheduled } from "./LibraryScheduled";
import { LibrarySettings } from "./LibrarySettings";
import { LibrarySkills } from "./LibrarySkills";
import { LibraryStash } from "./LibraryStash";
import { useLibraryContext } from "./useLibrary";
import { moveSettingsIntoLibrary } from "../settings/settingsPlacement";

export function LibraryPanel() {
  const category = useUiStateStore((store) => store.libraryCategory);
  const setCategory = useUiStateStore((store) => store.setLibraryCategory);
  const active = LIBRARY_CATEGORIES.find((entry) => entry.id === category) ?? LIBRARY_CATEGORIES[0];

  if (active?.id === "settings") return <LibrarySettings />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-2">
      <nav aria-label="Library categories" className="flex flex-col gap-px">
        {LIBRARY_GROUPS.map((group) => (
          <div key={group.group} className="flex flex-col gap-px not-first:pt-2">
            <div className="px-2 pt-1.5 pb-1 text-3xs font-medium uppercase tracking-wider text-sidebar-muted-foreground/70">
              {group.group}
            </div>
            {group.categories.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={entry.id === active?.id ? "true" : undefined}
                onClick={() =>
                  entry.id === "settings" ? moveSettingsIntoLibrary() : setCategory(entry.id)
                }
                className={cn(
                  "h-6 cursor-pointer px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  entry.id === active?.id
                    ? "bg-nav-selected text-sidebar-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-row-hover/60",
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
          <div className="pb-1 text-3xs font-medium uppercase tracking-wider text-sidebar-muted-foreground/70">
            {active.name}
          </div>
          <p className="text-xs text-sidebar-muted-foreground">{active.tip}</p>
          <div className="-mx-2 pt-2">
            <LibraryCategoryItems category={active.id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LibraryCategoryItems(props: { readonly category: LibraryCategory }) {
  const ctx = useLibraryContext();
  switch (props.category) {
    case "skills":
      return <LibrarySkills ctx={ctx} />;
    case "models":
      return <LibraryModels ctx={ctx} />;
    case "providers":
      return <LibraryProviders ctx={ctx} />;
    case "access":
      return <LibraryAccess ctx={ctx} />;
    case "stash":
      return <LibraryStash ctx={ctx} />;
    case "scheduled":
      return <LibraryScheduled ctx={ctx} />;
    case "projects":
      return <LibraryProjects />;
    case "machines":
      return <LibraryMachines />;
    case "settings":
      return null;
  }
}
