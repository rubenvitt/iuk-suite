// @vitest-environment jsdom

/**
 * DRK-421 — DIE ZWEI DARSTELLUNGEN DER INVENTUR.
 *
 * ⚠️ WAS DIESE DATEI BESITZT UND WAS NICHT. Sie besitzt die STRUKTUR: beide
 * Darstellungen stehen im HTML, jede Zeile steht in beiden, und beide schreiben
 * in denselben Zaehlstand. Sie besitzt AUSDRUECKLICH NICHT „auf 390px sieht man
 * die Karten" — jsdom wertet Media Queries nicht aus, und eine solche
 * Zusicherung waere immer gruen (`docs/design/README.md`, „Tests fuer
 * Responsives"). Die Media Query haelt `core/tabelle/schmalkarten.test.ts`, die
 * Wirkung `e2e/lagerbuch-inventur-mobil.spec.ts`.
 *
 * ⚠️ UND SIE SCHLIESST EINE LUECKE, DIE MIT DER KARTENANSICHT ENTSTANDEN IST.
 * Die Karten stehen VOR der Tabelle im Baum; `query()` liefert die erste
 * Fundstelle, also seither die KARTE. Alle bestehenden Faelle in
 * `InventurForm.test.tsx` liefen damit still auf die Karte um — sie sind
 * weiter gruen und pruefen weiter dieselbe Sache (beide Darstellungen benutzen
 * dieselben Bauteile aus `InventurZellen.tsx`), aber der TABELLENPFAD war
 * danach von keinem Fall mehr beruehrt. Die Faelle hier fassen ihn ausdruecklich
 * an.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { zaehlOrtWert, type ZaehlOrt } from "../../../_lib/inventurOrt";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { InventurForm } from "./InventurForm";

vi.mock("../../../_actions/inventur", () => ({ inventurKorrektur: vi.fn() }));
vi.mock("../../../_ui/useUrlFilter", () => ({ useUrlFilter: () => vi.fn() }));

const ORTE: ZaehlOrt[] = [
  { id: null, label: "Ganzer Handlager" },
  { id: HANDLAGER_ID, label: "Nicht zugeordnet" },
].map((o) => ({ ...o, schluessel: zaehlOrtWert(o.id) }));

const ZEILEN: InventurZeile[] = [
  {
    id: "a1", name: "Mullbinde", einheit: "Stk", fach: "Fach 1",
    kategorie: "Verband", mindestbestand: 5, bestand: 10,
    chargen: [{ id: "c1", chargenNr: "M-1", verfall: "2027-06", rest: 4, ampel: "gruen" }],
  },
];

const BREIT = '[data-rolle="breitansicht"]';
const KARTEN = '[data-rolle="schmalkarten"]';

afterEach(async () => { await unmount(); });

describe("InventurForm — beide Darstellungen", () => {
  it("legt Karten und Tabelle nebeneinander ins HTML", async () => {
    await mount(<InventurForm zeilen={ZEILEN} ortId={null} orte={ORTE} />);

    expect(queryAll(KARTEN).length).toBe(1);
    expect(queryAll(BREIT).length).toBe(1);
    // Ohne Spaltenkoepfe gaebe es auf dem Telefon sonst gar keinen Filter.
    expect(queryAll('[data-rolle="schmalfilter"]').length).toBe(1);
  });

  it("zeigt jede Zeile in beiden Darstellungen — und die Karte steht zuerst", async () => {
    await mount(<InventurForm zeilen={ZEILEN} ortId={null} orte={ORTE} />);

    /*
     * ⚠️ DIE ZAHL ZWEI IST HIER DIE AUSSAGE, nicht ein Schoenheitsfehler. Sie
     * ist der Grund, warum ein Playwright-Greifer, der ueber das DOM aufloest
     * (`getByLabel`, `getByText`), auf eine der beiden Darstellungen zeigen
     * muss — gemessen im echten Browser und ausgeschrieben bei `breit()` in
     * `e2e/lagerbuch-inventur.spec.ts`. Ein ROLLEN-Greifer braucht das nicht:
     * er laesst Verborgenes aus.
     */
    expect(queryAll('input[aria-label="Ist-Bestand Mullbinde"]').length).toBe(2);
    expect(query(KARTEN).querySelectorAll('input[aria-label="Ist-Bestand Mullbinde"]').length).toBe(1);
    expect(query(BREIT).querySelectorAll('input[aria-label="Ist-Bestand Mullbinde"]').length).toBe(1);
  });

  it("zählt in der Karte und in der Tabelle auf denselben Stand", async () => {
    await mount(<InventurForm zeilen={ZEILEN} ortId={null} orte={ORTE} />);
    const inKarte = query(KARTEN).querySelector<HTMLInputElement>('input[aria-label="Ist-Bestand Mullbinde"]')!;
    const inTabelle = query(BREIT).querySelector<HTMLInputElement>('input[aria-label="Ist-Bestand Mullbinde"]')!;
    expect(inKarte.value).toBe("10");
    expect(inTabelle.value).toBe("10");

    // In der KARTE erhoehen …
    await clickElement(
      query(KARTEN).querySelector<HTMLElement>('button[aria-label="Ist-Bestand Mullbinde erhöhen"]')!,
    );
    expect(inKarte.value).toBe("11");
    // … und die Tabelle daneben zeigt denselben Stand. Ohne das haengte der
    // gebuchte Umfang an der Fenstergroesse.
    expect(inTabelle.value).toBe("11");

    // Und umgekehrt, ueber den Knopf der TABELLE.
    await clickElement(
      query(BREIT).querySelector<HTMLElement>('button[aria-label="Ist-Bestand Mullbinde verringern"]')!,
    );
    expect(inTabelle.value).toBe("10");
    expect(inKarte.value).toBe("10");
  });

  it("klappt die Chargen der TABELLE innerhalb der breiten Darstellung auf", async () => {
    /*
     * ⚠️ DARAUF BAUT DIE EINRAHMUNG IN `e2e/lagerbuch-inventur.spec.ts`. Der
     * Fall dort klappt die Tabellenzeile auf und greift danach die Chargenfelder
     * ueber `breit(page).getByLabel(…)`. Laege die aufgeklappte Zeile ausserhalb
     * dieses Kastens, faende der Greifer nichts — und der Fall risse an einer
     * Stelle, die mit seiner Zusage nichts zu tun hat.
     */
    await mount(<InventurForm zeilen={ZEILEN} ortId={null} orte={ORTE} />);

    const aufklappen = query(BREIT)
      .querySelector<HTMLElement>('button[aria-label="Chargen Mullbinde anzeigen"]')!;
    await clickElement(aufklappen);

    expect(query(BREIT).querySelectorAll('[data-rolle="charge"]').length).toBe(1);
    expect(query(BREIT).querySelectorAll('input[aria-label="Ist Charge M-1"]').length).toBe(1);
    // Die Karte bleibt zu — ihr Aufklappzustand ist ihr eigener. Sonst stuenden
    // die Chargenfelder doppelt im Baum, und der e2e-Greifer traefe wieder zwei.
    expect(query(KARTEN).querySelectorAll('[data-rolle="charge"]').length).toBe(0);
  });
});
