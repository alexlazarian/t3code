import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

/** A flush, full-height tab for the strips above the sidebar and the main area, so both read alike. */
export function PanelTab({ on, className, ...props }: ComponentProps<"button"> & { on: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-full cursor-pointer items-center justify-center gap-1 whitespace-nowrap border-r border-sidebar-border px-3 text-control outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        on
          ? "bg-tab-active font-medium text-tab-active-foreground"
          : "bg-sidebar-control-surface text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        className,
      )}
      {...props}
    />
  );
}
