import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/utils";

export function WorkspacePageHeader({
  electron = false,
  className,
  ...props
}: ComponentPropsWithoutRef<"header"> & {
  readonly electron?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex h-[var(--workspace-topbar-height)]! min-h-[var(--workspace-topbar-height)]! max-h-[var(--workspace-topbar-height)]! shrink-0 items-center gap-2 pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)",
        electron && "drag-region",
        className,
      )}
      {...props}
    />
  );
}
