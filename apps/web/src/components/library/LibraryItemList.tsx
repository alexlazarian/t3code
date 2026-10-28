import { useState, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export type LibraryItemAction = {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
};

export type LibraryItem = {
  readonly key: string;
  readonly name: string;
  readonly meta?: string | undefined;
  readonly bad?: boolean;
  readonly swatch?: ReactNode;
  readonly detail?: string | null | undefined;
  readonly actions: ReadonlyArray<LibraryItemAction>;
};

export function LibraryItemList(props: {
  readonly items: ReadonlyArray<LibraryItem>;
  readonly empty: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (props.items.length === 0) {
    return <p className="px-2 py-1 text-xs text-sidebar-muted-foreground">{props.empty}</p>;
  }
  return (
    <ul className="flex flex-col">
      {props.items.map((item) => {
        const open = item.key === openKey;
        return (
          <li
            key={item.key}
            className={cn("border-b border-sidebar-border", open && "bg-nav-selected")}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenKey(open ? null : item.key)}
              className="flex h-6 w-full cursor-pointer items-center gap-1.5 px-2 text-left text-xs text-sidebar-foreground outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {item.swatch ?? <span className="size-1.5 shrink-0 bg-sidebar-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.meta ? (
                <span
                  className={cn(
                    "max-w-[58%] truncate text-2xs",
                    item.bad ? "text-destructive" : "text-sidebar-muted-foreground",
                  )}
                >
                  {item.meta}
                </span>
              ) : null}
            </button>
            {open ? (
              <div className="flex flex-col gap-1 pr-2 pb-1.5 pl-5 text-xs text-sidebar-muted-foreground">
                {item.detail ? <p>{item.detail}</p> : null}
                {item.actions.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {item.actions.map((action) => (
                      <Button
                        key={action.label}
                        size="xs"
                        variant="outline"
                        disabled={action.disabled}
                        onClick={action.onSelect}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
