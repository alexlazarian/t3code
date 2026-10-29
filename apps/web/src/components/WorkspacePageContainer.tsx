import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/utils";

export type WorkspacePageWidth = "readable" | "wide" | "expanded" | "full";

const CENTERED_COLUMN_CLASS = "mx-auto gap-6 px-5 pt-6 pb-12 sm:px-6";

// `full` is edge to edge with no padding, for pages built from full-bleed hairline rows.
const WIDTH_CLASS: Record<WorkspacePageWidth, string> = {
  readable: cn(CENTERED_COLUMN_CLASS, "max-w-4xl"),
  wide: cn(CENTERED_COLUMN_CLASS, "max-w-5xl"),
  expanded: cn(CENTERED_COLUMN_CLASS, "max-w-6xl"),
  full: "pb-12",
};

export function WorkspacePageContainer({
  width = "readable",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { readonly width?: WorkspacePageWidth }) {
  return <div className={cn("flex w-full flex-col", WIDTH_CLASS[width], className)} {...props} />;
}
