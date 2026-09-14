// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";

/* Ohne diesen Mock zoege die Insel die echte Server Action samt
   `better-sqlite3`, `next/cache` und `_lib/av` (mit `node:net`) in eine
   jsdom-Umgebung. */
vi.mock("../(verwaltung)/actions", () => ({ avWiederholenAction: vi.fn() }));

import { ShareDateienTabelle, type ShareDateiZeile } from "./ShareDateienTabelle";
import { exists, mount, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DIE DATEILISTE DER SHARE-DETAILSEITE, seit der Umstellung auf
 * `@/core/tabelle` eine Client-Insel mit Sortierung und Filter im Spaltenkopf.
 *
 * WAS DIESE DATEI BESITZT: die WIRKUNG dieser beiden Bedienelemente. Alles
 * andere — Zustandstexte, Symbole, der Wiederholen-Knopf am richtigen Status,
 * die Projektion aus der Datenbank — besitzt weiterhin
 * `(verwaltung)/shares/[id]/page.test.tsx` gegen eine echte, migrierte
 * Datenbank; hier stuende es ein zweites Mal und driftete.
 *
 * Harness: `qr/_lib/test-dom.tsx` — kein zweites erfunden.
 */

afterEach(unmount);

/**
 * ⚠️ DIE DREI GROESZEN GEHEN ABSICHTLICH AUSEINANDER. Nach BYTES geordnet steht
 * `klein.txt` (2048) vorn; nach dem ANZEIGETEXT stuende „1,0 MiB" vor „2,0 KiB"
 * vor „3,0 MiB", also `mittel`, `klein`, `gross`. Ohne diesen Gegensatz waere
 * der Test auch mit einer Textsortierung gruen — und genau das ist der Defekt,
 * gegen den er geschrieben ist.
 */
const ZEILEN: ShareDateiZeile[] = [
  {
    id: "fi-mittel",
    dateiname: "mittel.pdf",
    groesseText: "1,0 MiB",
    groesseBytes: 1_048_576,
    zustandText: "geprüft — freigegeben",
    zustandSymbol: "haken",
    pruefungWiederholbar: false,
  },
  {
    id: "fi-klein",
    dateiname: "klein.txt",
    groesseText: "2,0 KiB",
    groesseBytes: 2048,
    zustandText: "wird geprüft",
    zustandSymbol: "uhr",
    pruefungWiederholbar: false,
  },
  {
    id: "fi-gross",
    dateiname: "gross.zip",
    groesseText: "3,0 MiB",
    groesseBytes: 3_145_728,
    zustandText: "geprüft — freigegeben",
    zustandSymbol: "haken",
    pruefungWiederholbar: false,
  },
];

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

function dateinamen(): string[] {
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

it("ordnet die Größe nach BYTES, nicht nach dem Anzeigetext", async () => {
  await mount(<ShareDateienTabelle zeilen={ZEILEN} />);
  expect(dateinamen()).toEqual(["mittel.pdf", "klein.txt", "gross.zip"]);

  await zeigerfolge(kopf("Größe"));
  expect(dateinamen()).toEqual(["klein.txt", "mittel.pdf", "gross.zip"]);
});

/**
 * Die Filterliste entsteht AUS DEN ZEILEN: „geprüft — freigegeben" kommt zweimal
 * vor und steht trotzdem nur einmal im Menue — und es gibt keinen Eintrag fuer
 * einen Zustand, den keine Zeile traegt.
 */
it("filtert den Zustand über den Spaltenkopf, mit den vorkommenden Werten", async () => {
  await mount(<ShareDateienTabelle zeilen={ZEILEN} />);
  const ausloeser = kopf("Zustand").querySelector(".ant-table-filter-trigger");
  expect(ausloeser, "kein Filter-Ausloeser an der Zustandsspalte").not.toBeNull();
  await zeigerfolge(ausloeser as HTMLElement);

  const eintraege = Array.from(
    queryPortal(".ant-table-filter-dropdown").querySelectorAll(".ant-dropdown-menu-item"),
  );
  expect(eintraege.map((li) => (li.textContent ?? "").trim())).toEqual([
    "geprüft — freigegeben",
    "wird geprüft",
  ]);

  await zeigerfolge(eintraege[1] as HTMLElement);
  await zeigerfolge(queryPortal(".ant-table-filter-dropdown-btns .ant-btn-primary"));

  expect(dateinamen()).toEqual(["klein.txt"]);
});

/** „Nicht blaettern" ist Vorgabe der `Datentabelle` und steht deshalb nicht mehr
 *  im Quelltext der Insel — gemessen wird die Wirkung. */
it("blättert nicht", async () => {
  await mount(<ShareDateienTabelle zeilen={ZEILEN} />);
  expect(exists(".ant-pagination")).toBe(false);
});
