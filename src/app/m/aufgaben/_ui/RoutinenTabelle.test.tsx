// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { RoutineRow } from "../_db/schema";
import { RoutinenTabelle } from "./RoutinenTabelle";

/*
 * DIE ZEILENAKTIONEN — UND WARUM SIE EIN EIGENER TEST BRAUCHEN (Review Fix-Runde 1, Important): weder
 * der Aendern-Verweis noch die `routineId` im Ruhen-Formular waren gegen die RICHTIGE zeilenspezifische
 * Id geprueft. Eine fest verdrahtete Id (z. B. immer die der ersten Zeile) haette in `page.test.tsx`
 * NICHT aufgefallen — dort steht bislang keine Zeile, die zwei Routinen NEBENEINANDER auf ihre je
 * EIGENE Aktion prueft. Der Fehler traefe die falsche Zeile, und niemand bemerkte ihn, bis jemand die
 * falsche Routine schlafen legt. DIESER TEST NIMMT DESHALB ZWEI ZEILEN — mit einer einzigen bewiese er
 * nichts, eine fest verdrahtete Id waere ununterscheidbar von der richtigen.
 */

afterEach(async () => {
  await unmount();
});

function routine(over: Partial<RoutineRow> & Pick<RoutineRow, "id">): RoutineRow {
  return {
    personId: "alina",
    titel: "R",
    wochentage: 0b11111,
    uhrzeit: "08:00",
    dauerMinuten: 15,
    aktiv: true,
    erstelltAm: new Date(0),
    ...over,
  };
}

describe("RoutinenTabelle — Zeilenaktionen tragen die EIGENE routine.id, nicht die einer anderen Zeile", () => {
  it("der Aendern-Verweis zeigt je Zeile auf die eigene id", async () => {
    const zeilen = [
      routine({ id: "r-1", titel: "Erste" }),
      routine({ id: "r-2", titel: "Zweite" }),
    ];
    await mount(<RoutinenTabelle routinen={zeilen} />);

    const hrefs = queryAll<HTMLAnchorElement>("a")
      .filter((a) => a.textContent === "Ändern")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/routinen?bearbeiten=r-1", "/routinen?bearbeiten=r-2"]);
  });

  it("das Ruhen-Formular traegt je Zeile die eigene routineId im versteckten Feld", async () => {
    const zeilen = [
      routine({ id: "r-1", titel: "Erste" }),
      routine({ id: "r-2", titel: "Zweite" }),
    ];
    await mount(<RoutinenTabelle routinen={zeilen} />);

    const ids = queryAll<HTMLInputElement>("input[name='routineId']").map((i) => i.value);
    expect(ids).toEqual(["r-1", "r-2"]);
  });

  it("die Ruhen-Beschriftung folgt je Zeile dem EIGENEN aktiv-Zustand, nicht dem der ersten Zeile", async () => {
    const zeilen = [
      routine({ id: "r-1", titel: "Aktive", aktiv: true }),
      routine({ id: "r-2", titel: "Ruhende", aktiv: false }),
    ];
    await mount(<RoutinenTabelle routinen={zeilen} />);

    const rows = queryAll("tbody tr[data-row-key]");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Ruhen lassen");
    expect(rows[1]!.textContent).toContain("Wieder aktivieren");
  });
});
