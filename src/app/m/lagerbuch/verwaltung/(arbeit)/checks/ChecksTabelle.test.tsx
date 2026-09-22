// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../_ui/verwaltung.module.css";
import { ChecksTabelle, type CheckAnzeigeZeile } from "./ChecksTabelle";

/**
 * DER RAHMEN UM DIE BREITE DARSTELLUNG (DRK-451).
 *
 * ⚠️ SEIT DIESE TABELLE EINE `Kartentabelle` IST, STEHT JEDE ZEILE ZWEIMAL IM
 * BAUM — einmal als Tabellenzeile, einmal als Karte. Beide tragen dieselben
 * Marken, und das ist richtig: `display: none` nimmt die verborgene aus dem
 * Zugaenglichkeitsbaum, ein Greifer ueber das DOM sieht sie trotzdem. jsdom
 * wertet die Media Query gar nicht aus, dort sind also BEIDE „da".
 *
 * ⚠️ OHNE DIESEN RAHMEN MISST EIN FALL DIE DOPPELTE MENGE, und die Meldung
 * fuehrt in die Irre: „erwartet 2, bekommen 4" liest sich wie ein doppelt
 * gerenderter Lesepfad, nicht wie zwei Darstellungen derselben Zeile.
 *
 * ⚠️ `tbody`- UND `thead`-GREIFER BRAUCHEN IHN NICHT — eine Karte hat weder das
 * eine noch das andere. Eingerahmt wird nur, was ohne sie greift.
 */
const BREIT = '[data-rolle="breitansicht"]';


const ZEILE: CheckAnzeigeZeile = {
  id: "check-42",
  detailHref: "/verwaltung/checks/check-42",
  fahrzeugId: "fz-rtw-1",
  fahrzeugName: "RTW 1",
  fahrzeugKennung: "MS-1",
  fahrzeugEinheitenart: "fahrzeug",
  abgeschlossenText: "7.8.2026, 12:00:00",
  abgeschlossenIso: "2026-08-07T10:00:00.000Z",
  werText: "Anna Beispiel",
  ergebnisChips: [
    {
      schluessel: "nachgefuellt",
      text: "1 aus Handlager nachgefüllt",
      ton: "rot",
      zeichen: null,
    },
    {
      schluessel: "korrigiert",
      text: "2 korrigiert",
      ton: "gelb",
      zeichen: null,
    },
    {
      schluessel: "offen",
      text: "1 fehlt weiterhin",
      ton: "rot",
      zeichen: "warnung",
    },
    {
      schluessel: "flaschen",
      text: "1 Flasche niedrig",
      ton: "rot",
      zeichen: "sauerstoff",
    },
  ],
  positionenText: "9",
};

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

function hatUseClientAlsErsteDirektive(quelle: string): boolean {
  const source = ts.createSourceFile(
    "client.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const [ersteAnweisung] = source.statements;
  return Boolean(
    ersteAnweisung
    && ts.isExpressionStatement(ersteAnweisung)
    && ts.isStringLiteral(ersteAnweisung.expression)
    && ersteAnweisung.expression.text === "use client",
  );
}

beforeEach(() => {
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await unmount();
});

describe("ChecksTabelle", () => {
  it("rendert eine gefüllte Anzeigezeile mit unverändertem Tabellenvertrag", async () => {
    await mount(<ChecksTabelle zeilen={[ZEILE]} leertext="Noch kein Check." />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      // DRK-311: „Wer" steht neben dem Abschlusszeitpunkt — wann und von wem
      // sind dieselbe Frage an dieselbe Zeile.
      .toEqual(["Einheit", "Abgeschlossen", "Wer", "Ergebnis", "Positionen"]);
    const tabelle = query("table");
    expect(tabelle.getAttribute("aria-label")).toBe("Checks");
    const zeile = query("tr[data-row-key='check-42']");
    expect(zeile.textContent).toContain("RTW 1");
    // DRK-309: Der Link nennt Name · Art · Kennung — dieselbe Zeichenkette,
    // ueber die der Spaltenfilter gruppiert (Namen sind nicht eindeutig).
    expect(query<HTMLAnchorElement>("a[href='/verwaltung/checks/check-42']").textContent)
      .toBe("RTW 1 · Fahrzeug · MS-1");
    expect(query(`.${s.jts}`).textContent).toBe("7.8.2026, 12:00:00");
    expect(zeile.textContent).toContain("Anna Beispiel");
    expect(zeile.textContent).toContain("1 aus Handlager nachgefüllt");
    expect(zeile.textContent).toContain("2 korrigiert");
    expect(zeile.textContent).toContain("1 fehlt weiterhin");
    expect(zeile.textContent).toContain("1 Flasche niedrig");
    expect(zeile.textContent).toContain("9");
    expect(Array.from(
      zeile.querySelectorAll("[data-zeichen]"),
      (zeichen) => zeichen.getAttribute("data-zeichen"),
    )).toEqual(["warnung", "sauerstoff"]);
    expect(queryAll(`${BREIT} .${s.rot}`)).toHaveLength(3);
    expect(queryAll(`${BREIT} .${s.gelb}`)).toHaveLength(1);
    expect(exists(".ant-pagination")).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksTabelle.tsx",
      "utf8",
    );
    expect(hatUseClientAlsErsteDirektive(quelle)).toBe(true);
    expect(hatUseClientAlsErsteDirektive('"use strict";\n"use client";'))
      .toBe(false);
    expect(quelle).toMatch(/rowKey=["']id["']/);
    // `pagination={false}` und `scroll={{ x: "max-content" }}` standen bis zur
    // Umstellung auf `@/core/tabelle` hier im Quelltext. Beides ist jetzt
    // Vorgabe der `Datentabelle`; geprueft wird die WIRKUNG am DOM — die
    // Pagination oben, die Tabellenbreite hier.
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");
  });

  /**
   * ⛔ KEIN SORTIERER — UND DIESER TEST STAND VORHER AUF DEM KOPF.
   *
   * Er prueft heute das Gegenteil dessen, was er bis DRK-331 (fuenfte
   * Reviewrunde) pruefte: dass die Tabelle NICHT sortierbar ist. Der Grund
   * steht ueber der Spaltenliste — die Abfrage deckelt auf `CHECK_GRENZE`, und
   * ein Vergleicher verspraeche „der aelteste Check steht oben", waehrend es
   * nur der aelteste unter den neuesten fuenfzig waere.
   *
   * Die Zeilen bleiben deshalb in der Reihenfolge, in der der Server sie
   * liefert. Die beiden Zeitpunkte sind so gewaehlt, dass eine versehentlich
   * wieder eingebaute Ordnung — ueber den Rohwert wie ueber den Anzeigetext —
   * eine andere Reihenfolge ergaebe als die Eingabe.
   */
  it("ordnet nicht selbst und bietet an keiner Spalte einen Sortierer", async () => {
    const august: CheckAnzeigeZeile = {
      ...ZEILE,
      id: "check-august",
      abgeschlossenText: "7.8.2026, 12:00:00",
      abgeschlossenIso: "2026-08-07T10:00:00.000Z",
  werText: "Anna Beispiel",
    };
    const oktober: CheckAnzeigeZeile = {
      ...ZEILE,
      id: "check-oktober",
      abgeschlossenText: "1.10.2026, 12:00:00",
      abgeschlossenIso: "2026-10-01T10:00:00.000Z",
    };

    await mount(<ChecksTabelle zeilen={[august, oktober]} leertext="leer" />);

    const schluessel = () => queryAll("tbody tr[data-row-key]")
      .map((tr) => tr.getAttribute("data-row-key"));
    expect(schluessel()).toEqual(["check-august", "check-oktober"]);
    expect(queryAll(".ant-table-column-sorter")).toHaveLength(0);
  });

  it("zeigt den serverseitig festgelegten Leertext unverändert", async () => {
    await mount(
      <ChecksTabelle
        zeilen={[]}
        leertext="Kein Check passt zu Einheit und Zeitraum."
      />,
    );

    expect(document.body.textContent)
      .toContain("Kein Check passt zu Einheit und Zeitraum.");
  });
});
