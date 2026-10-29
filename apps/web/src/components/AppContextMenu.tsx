import type { ContextMenuItem } from "@t3tools/contracts";
import {
  ArchiveIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  FolderIcon,
  FolderTreeIcon,
  GitBranchIcon,
  HashIcon,
  ListIcon,
  MailOpenIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RefreshCwIcon,
  SettingsIcon,
  TimerIcon,
  Trash2Icon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect } from "react";
import { create } from "zustand";

import { readLocalApi } from "../localApi";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "./ui/menu";

const ICONS: Record<string, LucideIcon> = {
  archive: ArchiveIcon,
  "circle-check": CircleCheckIcon,
  clock: ClockIcon,
  copy: CopyIcon,
  folder: FolderIcon,
  "folder-tree": FolderTreeIcon,
  "git-branch": GitBranchIcon,
  hash: HashIcon,
  list: ListIcon,
  "mail-open": MailOpenIcon,
  "message-square": MessageSquareIcon,
  "message-square-plus": MessageSquarePlusIcon,
  pencil: PencilIcon,
  pin: PinIcon,
  "pin-off": PinOffIcon,
  "refresh-cw": RefreshCwIcon,
  settings: SettingsIcon,
  timer: TimerIcon,
  trash: Trash2Icon,
  "user-plus": UserPlusIcon,
};

type Request = {
  readonly id: number;
  readonly items: ReadonlyArray<ContextMenuItem<string>>;
  readonly position: { readonly x: number; readonly y: number };
  readonly returnFocus: HTMLElement | null;
  readonly resolve: (id: string | null) => void;
  choice: string | null;
};

const useMenuStore = create<{ request: Request | null; open: boolean; mounted: boolean }>(() => ({
  request: null,
  open: false,
  mounted: false,
}));
let nextRequestId = 0;

function settle(request: Request) {
  if (useMenuStore.getState().request === request) {
    useMenuStore.setState({ request: null, open: false });
  }
  request.resolve(request.choice);
}

function choose(id: string | null) {
  const { request } = useMenuStore.getState();
  if (request === null) return;
  if (id !== null && request.choice === null) request.choice = id;
  useMenuStore.setState({ open: false });
}

/**
 * `contextMenu.show` drawn with the app's own menu. The choice resolves only once the menu has
 * closed and handed focus back, so an action that moves focus (rename, a dialog) keeps it.
 */
export function showAppContextMenu<T extends string>(
  items: ReadonlyArray<ContextMenuItem<T>>,
  position: { x: number; y: number },
): Promise<T | null> {
  const state = useMenuStore.getState();
  if (!state.mounted) {
    return readLocalApi()?.contextMenu.show(items, position) ?? Promise.resolve(null);
  }
  if (state.request !== null) settle(state.request);
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise<T | null>((resolve) => {
    let resolved = false;
    useMenuStore.setState({
      open: true,
      request: {
        id: ++nextRequestId,
        items,
        position,
        returnFocus,
        choice: null,
        resolve: (id) => {
          if (resolved) return;
          resolved = true;
          resolve(id as T | null);
        },
      },
    });
  });
}

export function closeAppContextMenu(): void {
  if (useMenuStore.getState().mounted) choose(null);
  else void readLocalApi()?.contextMenu.close();
}

function ItemIcon(props: { readonly name: string | undefined }) {
  const Icon = props.name === undefined ? undefined : ICONS[props.name];
  return Icon ? <Icon aria-hidden /> : null;
}

function MenuEntries(props: { readonly items: ReadonlyArray<ContextMenuItem<string>> }) {
  return props.items.map((item, index) => {
    const separator = item.separatorBefore === true && index > 0 ? <MenuSeparator /> : null;
    let entry;
    if (item.header === true) {
      entry = (
        <MenuGroup>
          <MenuGroupLabel>{item.label}</MenuGroupLabel>
        </MenuGroup>
      );
    } else if (item.children !== undefined && item.children.length > 0) {
      entry = (
        <MenuSub>
          <MenuSubTrigger disabled={item.disabled === true}>
            <ItemIcon name={item.icon} />
            {item.label}
          </MenuSubTrigger>
          <MenuSubPopup>
            <MenuEntries items={item.children} />
          </MenuSubPopup>
        </MenuSub>
      );
    } else if (item.checked !== undefined) {
      entry = (
        <MenuCheckboxItem
          checked={item.checked}
          disabled={item.disabled === true}
          closeOnClick
          onClick={() => choose(item.id)}
        >
          {item.label}
        </MenuCheckboxItem>
      );
    } else {
      entry = (
        <MenuItem
          disabled={item.disabled === true}
          variant={item.destructive === true || item.id === "delete" ? "destructive" : "default"}
          onClick={() => choose(item.id)}
        >
          <ItemIcon name={item.icon} />
          {item.label}
        </MenuItem>
      );
    }
    return (
      <Fragment key={item.id}>
        {separator}
        {entry}
      </Fragment>
    );
  });
}

/** Renders `showAppContextMenu` requests; mount once so opening a menu re-renders only this. */
export function AppContextMenuHost() {
  const request = useMenuStore((state) => state.request);
  const open = useMenuStore((state) => state.open);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- routes requests to native menus while no host is mounted, and resolves an open request on unmount
  useEffect(() => {
    useMenuStore.setState({ mounted: true });
    return () => {
      const { request: pending } = useMenuStore.getState();
      useMenuStore.setState({ mounted: false });
      if (pending !== null) settle(pending);
    };
  }, []);
  if (request === null) return null;
  const { x, y } = request.position;
  const anchor = { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
  return (
    <Menu
      key={request.id}
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) choose(null);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) settle(request);
      }}
    >
      <MenuPopup
        anchor={anchor}
        side="bottom"
        align="start"
        sideOffset={0}
        finalFocus={() => (request.returnFocus?.isConnected ? request.returnFocus : false)}
      >
        <MenuEntries items={request.items} />
      </MenuPopup>
    </Menu>
  );
}
