// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";

// Die Insel importiert `deleteServiceAction` direkt (Falle 9, DRK-398); die
// Action besitzt `actions.test.ts`, hier genuegt eine Attrappe des Moduls.
vi.mock("@/app/m/portal/actions", () => ({ deleteServiceAction: vi.fn() }));

import { ServiceTable, type ServiceRow } from "./service-table";
import { exists, mount, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DIE DIENSTE-TABELLE DER PORTAL-VERWALTUNG, seit der Umstellung auf
 * `@/core/tabelle` mit Sortierung und Filter im Spaltenkopf.
 *
 * WAS DIESE DATEI BESITZT: die WIRKUNG dieser beiden Bedienelemente und die
 * Vorgabe „nicht blaettern". Das Durchreichen der Dienste aus der Seite besitzt
 * `admin/page.test.tsx`, die Loesch-Action `actions.test.ts`.
 *
 * Harness: `qr/_lib/test-dom.tsx` — kein zweites erfunden.
 */

afterEach(unmount);

const DIENSTE: ServiceRow[] = [
  { id: "a", name: "Wiki", slug: "wiki", url: "https://wiki.example.org", isPublic: false },
  { id: "b", name: "Ampel", slug: "ampel", url: "https://ampel.example.org", isPublic: true },
  { id: "c", name: "Mail", slug: "mail", url: "https://mail.example.org", isPublic: true },
];

async function zeige(dienste: ServiceRow[] = DIENSTE): Promise<void> {
  await mount(<ServiceTable services={dienste} />);
}

/**
 * DIE ZEIGERFOLGE, ausgeschrieben statt versteckt. rc-trigger oeffnet das
 * Filter-Dropdown erst, wenn es `mousedown`/`mouseup`/`click` gesehen hat — mit
 * einem einzelnen `click` bleibt das Portal LEER, und der Test misst dann, dass
 * nichts passiert ist, statt dass der Filter nicht greift.
 */
async function zeigerfolge(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function namen(): string[] {
  return queryAll("tbody.ant-table-tbody tr.ant-table-row td:first-child").map((td) =>
    (td.textContent ?? "").trim(),
  );
}

function kopf(ueberschrift: string): HTMLElement {
  const treffer = queryAll("thead.ant-table-thead th").find((th) =>
    (th.textContent ?? "").includes(ueberschrift),
  );
  expect(treffer, `keine Spalte „${ueberschrift}“`).not.toBeUndefined();
  return treffer as HTMLElement;
}

it("sortiert die Namen deutsch, statt die Eingabereihenfolge zu behalten", async () => {
  await zeige();
  expect(namen()).toEqual(["Wiki", "Ampel", "Mail"]);
  await zeigerfolge(kopf("Name"));
  expect(namen()).toEqual(["Ampel", "Mail", "Wiki"]);
});

/**
 * „Öffentlich" ist ein WAHRHEITSWERT: die Filterliste hat genau zwei Eintraege,
 * und sie heiszen woertlich wie die Zelle („ja"/„nein"). Zwei Woerter fuer
 * denselben Zustand waeren zwei Aussagen.
 */
it("filtert über den Spaltenkopf auf öffentliche Dienste", async () => {
  await zeige();
  const ausloeser = kopf("Öffentlich").querySelector(".ant-table-filter-trigger");
  expect(ausloeser, "kein Filter-Ausloeser an der Spalte „Öffentlich“").not.toBeNull();
  await zeigerfolge(ausloeser as HTMLElement);

  const eintraege = Array.from(
    queryPortal(".ant-table-filter-dropdown").querySelectorAll(".ant-dropdown-menu-item"),
  );
  expect(eintraege.map((li) => (li.textContent ?? "").trim())).toEqual(["ja", "nein"]);

  await zeigerfolge(eintraege[0] as HTMLElement);
  await zeigerfolge(queryPortal(".ant-table-filter-dropdown-btns .ant-btn-primary"));

  expect(namen()).toEqual(["Ampel", "Mail"]);
});

/** „Nicht blaettern" ist Vorgabe der `Datentabelle` und steht deshalb nicht mehr
 *  im Quelltext dieser Datei — gemessen wird die Wirkung. */
it("blättert nicht", async () => {
  await zeige();
  expect(exists(".ant-pagination")).toBe(false);
});
