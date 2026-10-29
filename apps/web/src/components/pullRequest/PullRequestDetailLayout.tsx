import { ArrowLeftIcon, FileDiffIcon } from "lucide-react";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";

import { cn } from "~/lib/utils";

import { PanelTab } from "../PanelTab";
import { PullRequestMetaLine } from "./pullRequestPresentation";

export function PullRequestDetailHeaderBody({
  title,
  author,
  updated,
  checkout,
  base,
  head,
  files,
  diffStat,
}: {
  title: ReactNode;
  author: ReactNode;
  updated: ReactNode;
  checkout?: ReactNode;
  base: ReactNode;
  head: ReactNode;
  files: ReactNode;
  diffStat: ReactNode;
}) {
  return (
    <div className="col-span-2 mt-1 min-w-0 px-3 pb-2">
      {title}
      <div className="mt-1 flex min-h-5 min-w-0 items-center gap-2 text-2xs text-muted-foreground">
        <PullRequestMetaLine className="min-w-0 whitespace-nowrap">
          {author}
          {updated}
        </PullRequestMetaLine>
        {checkout}
      </div>
      <div className="mt-1 flex min-h-5 min-w-0 items-center gap-2 text-2xs text-muted-foreground">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-muted-foreground/70">
          {base}
          <ArrowLeftIcon
            aria-label="receives changes from"
            className="size-3.5 shrink-0 opacity-60"
          />
          {head}
        </span>
        <span className="ml-auto inline-flex shrink-0 items-baseline justify-end gap-2">
          <span className="inline-flex min-w-16 items-baseline justify-end gap-1.5 tabular-nums">
            <FileDiffIcon aria-hidden className="size-3.5 self-center" />
            {files}
          </span>
          {diffStat}
        </span>
      </div>
    </div>
  );
}

export function PullRequestDetailTitleRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex min-h-7 min-w-0 items-center sm:min-h-6", className)} {...props} />
  );
}

export function PullRequestDetailTabBar<Tab extends string>({
  tabs,
  value,
  onValueChange,
  onTabIntent,
  inert,
  children,
}: {
  tabs: ReadonlyArray<{ readonly value: Tab; readonly label: string }>;
  value: Tab;
  onValueChange?: (tab: Tab) => void;
  onTabIntent?: (tab: Tab) => void;
  inert?: boolean;
  children?: ReactNode;
}) {
  const select = (tab: Tab) => {
    if (tab !== value) onValueChange?.(tab);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((item) => item.value === value);
    const nextIndex =
      event.key === "ArrowRight"
        ? (current + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (current - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    select(next.value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[nextIndex]?.focus();
  };
  return (
    <nav
      className="col-span-2 flex h-8 min-w-0 items-stretch border-t border-border"
      aria-label="Pull request tabs"
      inert={inert}
    >
      <div role="tablist" className="flex shrink-0" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <PanelTab
            key={tab.value}
            role="tab"
            on={tab.value === value}
            aria-selected={tab.value === value}
            tabIndex={tab.value === value ? 0 : -1}
            onClick={() => select(tab.value)}
            onPointerEnter={onTabIntent ? () => onTabIntent(tab.value) : undefined}
            onFocus={onTabIntent ? () => onTabIntent(tab.value) : undefined}
          >
            {tab.label}
          </PanelTab>
        ))}
      </div>
      {children ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">{children}</div>
      ) : null}
    </nav>
  );
}

export function PullRequestChecksStatusLine({
  icon,
  label,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { icon: ReactNode; label: ReactNode }) {
  return (
    <span
      className={cn(
        "ml-auto flex h-4 min-w-0 flex-1 flex-wrap content-start items-center justify-end gap-x-1.5 overflow-hidden text-xs",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
