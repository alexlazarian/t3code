import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { canSnooze, effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { AuthOrchestrationOperateScope, type ScopedThreadRef } from "@t3tools/contracts";
import {
  AlarmClockOffIcon,
  CircleCheckIcon,
  ClockIcon,
  EllipsisIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  type LucideIcon,
} from "lucide-react";
import { memo, useState, type MouseEvent as ReactMouseEvent } from "react";

import { isElectron } from "~/env";
import { useNowAfter } from "~/hooks/useDeadline";
import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { environmentServerConfigsAtom } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { cn } from "~/lib/utils";
import type { SnoozePreset } from "../Sidebar.snooze";
import {
  buildThreadActionStrip,
  type ThreadStripAction,
  type ThreadStripActionId,
} from "../threadActionMenu.logic";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const ICONS: Record<ThreadStripActionId, LucideIcon> = {
  settle: CircleCheckIcon,
  unsettle: CircleCheckIcon,
  snooze: ClockIcon,
  unsnooze: AlarmClockOffIcon,
  pin: PinIcon,
  unpin: PinOffIcon,
  rename: PencilIcon,
};

function StripDivider() {
  return <span aria-hidden className="mx-1 h-3 w-px shrink-0 bg-border" />;
}

export const ThreadActionStrip = memo(function ThreadActionStrip(props: {
  readonly threadRef: ScopedThreadRef;
  readonly threadShell: EnvironmentThreadShell;
  readonly projectCwd: string | null;
  readonly onStartRename: () => void;
  readonly onFind?: ((threadRef: ScopedThreadRef) => void) | undefined;
}) {
  const { threadRef, threadShell } = props;
  const canOperate = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  const serverConfig = useAtomValue(environmentServerConfigsAtom).get(threadRef.environmentId);
  const now = new Date(
    useNowAfter(Date.parse(threadShell.snoozedUntil ?? "") || null),
  ).toISOString();
  const { openMenu, runAction, readSnoozePresets } = useThreadActionMenu({
    threadRef,
    projectCwd: props.projectCwd,
    onStartRename: props.onStartRename,
    onFind: props.onFind,
  });
  const [snoozePresets, setSnoozePresets] = useState<ReadonlyArray<SnoozePreset> | null>(null);
  const configLoaded = serverConfig !== undefined;
  const actions = buildThreadActionStrip({
    canOperate,
    branch: null,
    projectFilter: null,
    isPinned: threadShell.pinnedAt != null,
    isSettled: configLoaded && threadShell.settledOverride === "settled",
    autoSettleEnabled: threadShell.autoSettleDisabledAt == null,
    isSnoozed: configLoaded && effectiveSnoozed(threadShell, { now }),
    canSnoozeNow: canSnooze(threadShell, { now }),
    isRegeneratingTitle: false,
    isRunning: false,
    supports: {
      settlement: configLoaded,
      autoSettleOptOut: false,
      snooze: configLoaded,
      pinning: configLoaded,
      titleRegeneration: false,
    },
    snoozePresets: [],
  });
  const openMoreMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu({ x: rect.left, y: rect.bottom + 4 }, { variant: "overflow" });
  };

  const renderAction = (action: ThreadStripAction) => {
    const Icon = ICONS[action.id];
    const iconOnlyWhenNarrow = action.group === "edit";
    const button = (
      <Button
        key={action.id}
        variant="ghost-muted"
        size="xs"
        aria-label={action.label}
        aria-pressed={action.group === "lifecycle" ? action.pressed : undefined}
        data-pressed={action.pressed ? "" : undefined}
        disabled={action.disabled}
        {...(action.id === "snooze" ? {} : { onClick: () => void runAction(action.id) })}
      >
        <Icon aria-hidden />
        <span className={iconOnlyWhenNarrow ? "@max-[40rem]/thread-strip:hidden" : undefined}>
          {action.label}
        </span>
      </Button>
    );
    if (action.id === "snooze") {
      return (
        <Menu
          key={action.id}
          open={snoozePresets !== null}
          onOpenChange={(open) => setSnoozePresets(open ? readSnoozePresets() : null)}
        >
          <MenuTrigger render={button} />
          <MenuPopup side="bottom" align="start">
            {(snoozePresets ?? []).map((preset) => (
              <MenuItem
                key={preset.id}
                onClick={() => void runAction(`snooze:${preset.id}`, snoozePresets ?? [])}
              >
                {preset.label}
                <MenuShortcut>{preset.whenLabel}</MenuShortcut>
              </MenuItem>
            ))}
            {(snoozePresets ?? []).length > 0 ? <MenuSeparator /> : null}
            <MenuItem onClick={() => void runAction("snooze:custom")}>Custom…</MenuItem>
          </MenuPopup>
        </Menu>
      );
    }
    if (!iconOnlyWhenNarrow) return button;
    return (
      <Tooltip key={action.id}>
        <TooltipTrigger render={button} />
        <TooltipPopup side="bottom">{action.label}</TooltipPopup>
      </Tooltip>
    );
  };

  const lifecycle = actions.filter((action) => action.group === "lifecycle");
  const edit = actions.filter((action) => action.group === "edit");
  return (
    <div
      data-thread-action-strip
      className={cn(
        "@container/thread-strip flex h-6 min-h-6 shrink-0 items-center gap-0.5 border-b bg-background",
        isElectron ? "px-3 sm:px-5" : "pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)",
      )}
    >
      {lifecycle.map(renderAction)}
      {lifecycle.length > 0 ? <StripDivider /> : null}
      {edit.map(renderAction)}
      <StripDivider />
      <Button variant="ghost-muted" size="xs" aria-label="More" onClick={openMoreMenu}>
        <EllipsisIcon aria-hidden />
        More
      </Button>
    </div>
  );
});
