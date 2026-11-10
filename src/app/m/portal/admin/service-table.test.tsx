// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";

// Die Insel importiert `deleteServiceAction` direkt (Falle 9, DRK-398); die
// Action besitzt `actions.test.ts`, hier genuegt eine Attrappe des Moduls.
vi.mock("@/app/m/portal/actions", () => ({
  deleteServiceAction: vi.fn(),
  setzeSichtbarkeitAction: vi.fn(),
  createServiceAction: vi.fn(),
  bearbeiteServiceAction: vi.fn(),
}));

import { deleteServiceAction } from "@/app/m/portal/actions";
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

const KACHEL = { description: "", category: null, iconUrl: null, openInNewTab: true };

const DIENSTE: ServiceRow[] = [
  { ...KACHEL, id: "a", name: "Wiki", url: "https://wiki.example.org", isPublic: false, requiredGroups: ["iuk", "unbekannt"] },
  { ...KACHEL, id: "b", name: "Ampel", url: "https://ampel.example.org", isPublic: true, requiredGroups: [] },
  { ...KACHEL, id: "c", name: "Mail", url: "https://mail.example.org", isPublic: true, requiredGroups: [] },
];

const GRUPPEN = [{ wert: "iuk", anzeige: "IuK-Gruppe" }];

async function zeige(dienste: ServiceRow[] = DIENSTE): Promise<void> {
  await mount(<ServiceTable services={dienste} gruppen={GRUPPEN} />);
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
 * „Sichtbar für" haengt an einem WAHRHEITSWERT: die Filterliste hat genau zwei
 * Eintraege, und „alle" heiszt woertlich wie die Zelle. Zwei Woerter fuer
 * denselben Zustand waeren zwei Aussagen.
 */
it("filtert über den Spaltenkopf auf öffentliche Dienste", async () => {
  await zeige();
  const ausloeser = kopf("Sichtbar für").querySelector(".ant-table-filter-trigger");
  expect(ausloeser, "kein Filter-Ausloeser an der Spalte „Sichtbar für“").not.toBeNull();
  await zeigerfolge(ausloeser as HTMLElement);

  const eintraege = Array.from(
    queryPortal(".ant-table-filter-dropdown").querySelectorAll(".ant-dropdown-menu-item"),
  );
  expect(eintraege.map((li) => (li.textContent ?? "").trim())).toEqual(["alle", "nur Gruppen"]);

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

/**
 * DIE ZELLE NENNT DIE GRUPPEN (IDA-227) — mit dem Anzeigenamen aus Pocket ID,
 * und eine Gruppe, die dort (noch) nicht steht, mit ihrem rohen Namen statt gar
 * nicht: sonst verschwiege die Tabelle einen Teil der Freigabe.
 */
it("zeigt, wer eine Kachel sieht", async () => {
  await zeige();
  const zellen = queryAll("tbody.ant-table-tbody tr.ant-table-row").map((tr) =>
    (tr.querySelectorAll("td")[3]?.textContent ?? "").trim(),
  );
  expect(zellen).toEqual(["IuK-Gruppe, unbekannt", "alle", "alle"]);
});

/**
 * KEIN DIENST VERSCHWINDET DURCH EINEN EINZELNEN KLICK (IDA-391). Vorher stand „Löschen" als roter
 * Knopf je Zeile und löschte sofort. Jetzt: Zeilenmenü → „Löschen" → Rückfrage mit dem Namen →
 * erst deren Knopf ruft die Action.
 */
async function oeffneMenue(name: string): Promise<HTMLElement[]> {
  const knopf = queryAll<HTMLButtonElement>("[data-testid=dienst-aktionen]").find(
    (b) => b.getAttribute("aria-label") === `Aktionen für ${name}`,
  );
  expect(knopf, `kein Zeilenmenü für ${name}`).toBeDefined();
  await zeigerfolge(knopf!);
  return Array.from(document.body.querySelectorAll<HTMLElement>(".ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item"));
}

it("trägt je Zeile ein Menü mit Bearbeiten, Sichtbarkeit und Löschen statt eines Löschknopfs", async () => {
  await zeige();
  expect(queryAll("tbody button").filter((b) => (b.textContent ?? "").includes("Löschen"))).toHaveLength(0);
  const eintraege = await oeffneMenue("Ampel");
  expect(eintraege.map((li) => (li.textContent ?? "").trim())).toEqual(["Bearbeiten", "Sichtbarkeit", "Löschen"]);
});

it("löscht erst nach der Rückfrage, die den Dienst nennt", async () => {
  vi.mocked(deleteServiceAction).mockReset().mockResolvedValue(undefined);
  await zeige();
  const loeschen = (await oeffneMenue("Ampel")).find((li) => (li.textContent ?? "").includes("Löschen"))!;
  await zeigerfolge(loeschen);

  expect(deleteServiceAction).not.toHaveBeenCalled();
  const dialog = queryPortal(".ant-modal");
  expect(dialog.textContent).toContain("„Ampel“ löschen?");

  const bestaetigen = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => (b.textContent ?? "").trim() === "Löschen",
  )!;
  await zeigerfolge(bestaetigen);

  expect(deleteServiceAction).toHaveBeenCalledTimes(1);
  expect(vi.mocked(deleteServiceAction).mock.calls[0][0].get("id")).toBe("b");
});

it("öffnet „Bearbeiten“ in einer Schublade mit dem Stand des Dienstes", async () => {
  await zeige();
  const bearbeiten = (await oeffneMenue("Wiki")).find((li) => (li.textContent ?? "").includes("Bearbeiten"))!;
  await zeigerfolge(bearbeiten);
  const formular = queryPortal<HTMLFormElement>(".ant-drawer [data-testid=dienst-formular]");
  expect(formular.querySelector<HTMLInputElement>("input[name=name]")!.value).toBe("Wiki");
  expect(formular.querySelector<HTMLInputElement>("input[name=id]")!.value).toBe("a");
});
