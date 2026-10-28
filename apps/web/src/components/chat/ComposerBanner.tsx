import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronDownIcon, XIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

export type ComposerBannerVariant = "default" | "error" | "info" | "success" | "warning";

// A drawer above the composer box. "Needs you" variants carry a 3px left bar.
const variantBar: Record<ComposerBannerVariant, string> = {
  default: "",
  error: "before:border-l-3 before:border-l-error",
  info: "",
  success: "",
  warning: "before:border-l-3 before:border-l-warning",
};

function Surface({
  variant = "default",
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: ComposerBannerVariant;
}) {
  return (
    <div
      data-composer-banner-surface="attached"
      data-variant={variant}
      className={cn(
        "relative isolate border-0 bg-transparent shadow-none [--chat-composer-attachment-overlap:calc(1rem+1px)]",
        "before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:border before:border-border before:bg-card",
        variantBar[variant],
        className,
      )}
      {...props}
    />
  );
}

function Attachment({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-banner-attachment"
      className={cn(
        "mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2*var(--chat-composer-drawer-inset))]",
        "[&+[data-slot=composer-banner-attachment]_[data-composer-banner-surface=attached]]:before:border-t-0",
        "[&+*_[data-chat-composer-form]>[data-slot=composer-banner-attachment]:first-child_[data-composer-banner-surface=attached]]:before:border-t-0",
        className,
      )}
      {...props}
    />
  );
}

function Dock({ className, ...props }: ComponentProps<"div">) {
  return (
    <Attachment
      className={cn(
        "flex items-end gap-1 not-has-data-[composer-banner-surface=attached]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function Column({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col empty:hidden",
        "[&>[data-slot=composer-banner-attachment]]:w-full [&>[data-slot=composer-banner-attachment]:last-child]:mb-0",
        className,
      )}
      {...props}
    />
  );
}

function Root({
  className,
  density = "default",
  variant = "default",
  width = "fill",
  ...props
}: ComponentProps<"div"> & {
  density?: "default" | "comfortable" | "spacious";
  variant?: ComposerBannerVariant;
  width?: "fill" | "content";
}) {
  return (
    <Surface
      className={cn(
        "min-w-0 px-1 py-(--composer-banner-padding-block) after:block after:h-(--chat-composer-attachment-overlap) text-xs/4 [--composer-banner-icon-column:--spacing(7)] [--composer-banner-padding-block:--spacing(1)] sm:[--composer-banner-icon-column:--spacing(6)]",
        density === "comfortable" && "[--composer-banner-padding-block:--spacing(1.25)]",
        density === "spacious" && "px-2.5 [--composer-banner-padding-block:--spacing(2)]",
        width === "content" ? "w-fit max-w-full flex-none" : "@container",
        className,
      )}
      data-slot="composer-banner"
      data-composer-banner-width={width}
      variant={variant}
      {...props}
    />
  );
}

function Row({
  className,
  render,
  layout = "inline",
  ...props
}: useRender.ComponentProps<"div"> & {
  layout?: "inline" | "wrap-actions" | "approval";
}) {
  const rowProps = {
    className: cn(
      "group/banner-row grid min-h-(--composer-banner-icon-column) w-full min-w-0 grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)_auto] items-center gap-x-1 text-start",
      "not-has-[>[data-slot=composer-banner-actions]]:grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)]",
      "[&:is(button)]:cursor-pointer [&:is(button)]:hover:bg-foreground/5 [&:is(button)]:focus-visible:outline-2 [&:is(button)]:focus-visible:-outline-offset-2 [&:is(button)]:focus-visible:outline-ring",
      layout === "wrap-actions" &&
        "flex flex-wrap *:data-[slot=composer-banner-content]:max-w-[calc(100%-var(--composer-banner-icon-column)-var(--spacing))] *:data-[slot=composer-banner-content]:grow",
      layout === "approval" && "items-start gap-x-2 gap-y-3",
      className,
    ),
    "data-composer-banner-row": "true",
    "data-composer-banner-layout": layout,
  };
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(rowProps, props),
  });
}

function Icon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="composer-banner-icon"
      className={cn(
        "col-start-1 row-start-1 flex w-(--composer-banner-icon-column) min-w-0 flex-none items-center justify-center text-muted-foreground [&>svg]:size-3",
        "group-data-[composer-banner-layout=approval]/banner-row:pt-0.5 group-data-[composer-banner-layout=approval]/banner-row:text-warning group-data-[composer-banner-layout=approval]/banner-row:[&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function Content({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="composer-banner-content"
      className={cn(
        "col-start-2 row-start-1 flex min-w-0 items-center gap-1 *:data-[slot=composer-banner-separator]:mx-0",
        "@max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:col-end-4",
        "group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:col-[1/3] group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:ps-2 sm:group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:ps-1.5",
        "group-not-has-[>[data-slot=composer-banner-icon],>[data-slot=composer-banner-actions]]/banner-row:pe-2 sm:group-not-has-[>[data-slot=composer-banner-icon],>[data-slot=composer-banner-actions]]/banner-row:pe-1.5",
        className,
      )}
      {...props}
    />
  );
}

function Separator() {
  return (
    <span
      aria-hidden
      data-slot="composer-banner-separator"
      className="mx-1 inline-block flex-none text-muted-foreground/40"
    >
      ·
    </span>
  );
}

function Actions({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="composer-banner-actions"
      className={cn(
        "col-start-3 row-start-1 flex flex-wrap items-center justify-end gap-1",
        "group-data-[composer-banner-layout=approval]/banner-row:self-center group-data-[composer-banner-layout=approval]/banner-row:gap-1.5 @max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:col-start-2 @max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:col-end-4 @max-[560px]:group-data-[composer-banner-layout=approval]/banner-row:row-start-2",
        "group-data-[composer-banner-layout=wrap-actions]/banner-row:ms-auto",
        className,
      )}
      {...props}
    />
  );
}

function Children({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(
      { className: cn("grid gap-px [&_[data-composer-banner-row]]:min-h-5", className) },
      props,
    ),
  });
}

function Scroll({ className, children, ...props }: ComponentProps<typeof ScrollArea>) {
  return (
    <ScrollArea
      radius="none"
      scrollFade
      className={cn("h-auto max-h-[min(24rem,40dvh)]", className)}
      {...props}
    >
      {}
      <div className="[[data-has-overflow-y]>&]:pe-2">{children}</div>
    </ScrollArea>
  );
}

function Count({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex min-w-(--composer-banner-icon-column,1em) flex-none justify-center font-medium text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function Body({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 ps-8 sm:ps-7", className)} {...props} />;
}

function Dot({ className, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("size-1.5 flex-none rounded-full bg-current", className)} {...props} />
  );
}

function ToggleIcon({ expanded }: { expanded: boolean }) {
  return (
    <Button
      render={<span aria-hidden />}
      size="icon-xs"
      variant="ghost"
      tabIndex={-1}
      className="pointer-events-none"
    >
      <ChevronDownIcon className={cn("size-3.5", !expanded && "rotate-180")} />
    </Button>
  );
}

function Dismiss({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button size="icon-xs" variant="ghost" className={className} {...props}>
      {children ?? <XIcon className="size-3.5" />}
    </Button>
  );
}

export const ComposerBanner = {
  Surface,
  Attachment,
  Dock,
  Column,
  Root,
  Row,
  Icon,
  Content,
  Separator,
  Actions,
  Children,
  Scroll,
  Count,
  Body,
  Dot,
  ToggleIcon,
  Dismiss,
};
