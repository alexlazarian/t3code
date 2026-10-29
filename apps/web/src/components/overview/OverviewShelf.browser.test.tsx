import { expect, it } from "vite-plus/test";

import "~/index.css";
import { render } from "../../../test/render";
import { OverviewShelf } from "./OverviewShelf";

function Board(props: { readonly shelves: ReadonlyArray<{ name: string; filled: boolean }> }) {
  return (
    <div
      className="grid w-175 bg-card"
      style={{ gridTemplateColumns: "22px repeat(2, minmax(180px, 1fr))" }}
    >
      {props.shelves.map((shelf, index) => (
        <OverviewShelf
          key={shelf.name}
          name={shelf.name}
          total={shelf.filled ? 1 : 0}
          expanded
          onToggle={() => {}}
          urgency={null}
          row={index * 2 + 1}
          columns={["a", "b"].map((key) => ({
            key,
            count: shelf.filled && key === "b" ? 1 : 0,
            cell: shelf.filled && key === "b" ? <div className="h-32 bg-muted" /> : null,
          }))}
        />
      ))}
    </div>
  );
}

const rect = (element: Element) => element.getBoundingClientRect();

it("keeps the count strip and cells flush so column lines stay unbroken", async () => {
  await using screen = await render(<Board shelves={[{ name: "Failed", filled: false }]} />, {
    router: false,
  });
  const strip = Array.from(screen.container.querySelectorAll<HTMLElement>("[role=presentation]"))
    .filter((element) => element.style.gridColumn === "2")
    .find((element) => element.style.gridRow === "1")!;
  const cell = screen.container.querySelector("[role=gridcell]")!;
  await expect.poll(() => rect(strip).bottom).toBe(rect(cell).top);
  expect(rect(strip).height).toBeLessThan(20);
});

it("leaves room between the rail label and the shelf's bottom border", async () => {
  await using screen = await render(
    <Board
      shelves={[
        { name: "Failed", filled: false },
        { name: "Working", filled: true },
      ]}
    />,
    { router: false },
  );
  const rails = Array.from(screen.container.querySelectorAll("[role=rowheader]"));
  expect(rails).toHaveLength(2);
  for (const rail of rails) {
    const label = rail.querySelector(".rotate-180")!;
    expect(rect(rail).bottom - rect(label).bottom).toBeGreaterThanOrEqual(4);
    expect(rail.scrollHeight).toBeLessThanOrEqual(rail.clientHeight);
  }
});
