import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { AppContextMenuHost, showAppContextMenu } from "./AppContextMenu";

const items = [
  { id: "pin", label: "Pin thread" },
  { id: "snooze", label: "Snooze", children: [{ id: "hour", label: "1 hour" }] },
  { id: "archive", label: "Archive thread", separatorBefore: true },
];

it("keeps the menu open when the pointer reaches a submenu trigger", async () => {
  await using _screen = await render(<AppContextMenuHost />, { router: false });
  const choice = showAppContextMenu(items, { x: 20, y: 40 });
  await expect.element(page.getByRole("menuitem", { name: "Pin thread" })).toBeVisible();

  await userEvent.hover(page.getByRole("menuitem", { name: "Snooze" }));

  // The root used to close itself the moment its submenu opened, taking the submenu with it.
  await expect.element(page.getByRole("menuitem", { name: "1 hour" })).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Pin thread" })).toBeVisible();

  await userEvent.click(page.getByRole("menuitem", { name: "1 hour" }));
  await expect(choice).resolves.toBe("hour");
});
