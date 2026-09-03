import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { findeZeichen } from "./katalog";
import { merkAnzeige, VERWAIST_TEXT } from "./merkliste";

/*
 * `rezept:C.1.1` ist eine ANKER-ID (siehe `_lib/katalog.test.ts` und
 * `_lib/seedLokal.ts`). Faellt sie weg, wird zuerst die Bestandszusicherung aus
 * Aufgabe 2 rot — dieser Wurf hier nennt nur den Zusammenhang, damit niemand
 * lange sucht.
 */
const BEISPIEL = findeZeichen("rezept:C.1.1");
if (BEISPIEL === null) {
  throw new Error("Anker rezept:C.1.1 fehlt im Generat — _lib/katalog.test.ts sagt, warum");
}

describe("merkAnzeige — das Generat gewinnt, der Schnappschuss traegt den Rest", () => {
  /*
   * SPEC §4.2. Ohne diese Richtung laufen zwei Fassungen desselben Titels bei
   * jeder Katalogkorrektur auseinander, und niemand weiss, welche stimmt: die
   * Datenbank haelt den Stand des Merkens, das Generat den von heute.
   */
  it("nimmt Titel, Bedeutung und Bild aus dem Generat, nicht aus dem Schnappschuss", () => {
    const [zeile] = merkAnzeige([
      { zeichenId: BEISPIEL.id, titelSchnappschuss: "Alter Name von gestern" },
    ]);
    expect(zeile?.titel).toBe(BEISPIEL.titel);
    expect(zeile?.titel).not.toBe("Alter Name von gestern");
    expect(zeile?.bedeutung).toBe(BEISPIEL.bedeutung);
    expect(zeile?.svg).toBe(BEISPIEL.svg);
    expect(zeile?.verwaist).toBe(false);
  });

  /*
   * SPEC §4.6 STUFE 2 — DER FALL, DER DIESE FUNKTION UEBERHAUPT RECHTFERTIGT.
   * Eine Merkzeile zeigt auf eine Katalog-ID, und es gibt keine dokumentierte
   * ID-Stabilitaetszusage des Pakets (Praezedenzfall: ein Commit entfernte acht
   * comms.*-IDs ersatzlos). Die Zeile wird deshalb NICHT geloescht — sie bleibt
   * sichtbar, traegt ihren Schnappschuss und sagt, was los ist.
   */
  it("behaelt eine nicht mehr aufloesbare Zeile mit ihrem Schnappschuss", () => {
    const [zeile] = merkAnzeige([
      { zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" },
    ]);
    expect(zeile?.titel).toBe("Bergungsgruppe");
    expect(zeile?.verwaist).toBe(true);
    expect(zeile?.svg).toBeNull();
    expect(zeile?.bedeutung).toBeNull();
  });

  it("wirft nichts weg — zwei Zeilen gehen als zwei Zeilen wieder heraus", () => {
    const aus = merkAnzeige([
      { zeichenId: BEISPIEL.id, titelSchnappschuss: BEISPIEL.titel },
      { zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" },
    ]);
    expect(aus).toHaveLength(2);
    expect(aus.map((z) => z.verwaist)).toEqual([false, true]);
  });

  /* Der Satz steht auf dem Bildschirm einer Helferin — keine ID, kein Dateiname. */
  it("der Satz fuer eine verwaiste Zeile ist fuer Anwender geschrieben", () => {
    expect(VERWAIST_TEXT).not.toMatch(/rezept:|grund:|\.ts\b|\.json\b|undefined/);
    expect(VERWAIST_TEXT.length).toBeGreaterThan(10);
  });

  /*
   * FALLE 6, UND SIE IST HIER SCHARF: `(shell)/merkliste/page.tsx` ist eine
   * Server Component und liest sowohl `merkAnzeige` als auch `VERWAIST_TEXT`.
   * Traegt `merkliste.ts` je ein `"use client"`, kommt dort eine Client-Referenz
   * statt des Wertes an — HTTP 500 fuer die ganze Seite, und weder `typecheck`
   * noch `build` noch dieser Runner sieht es (in Vitest ist die Direktive ein
   * wirkungsloser String). Was der Runner sehen kann, ist der Quelltext.
   *
   * ⚠️ REGEX UEBER DEN DATEIANFANG statt `trimStart().startsWith(...)` (Vorbild
   * `lagerbuch/_lib/nav.test.ts:71`): nach ECMAScripts Directive-Prologue-Regel
   * bleibt die Direktive auch dann wirksam, wenn ihr NUR KOMMENTARE vorausgehen —
   * Kommentare sind keine Statements. Die `startsWith`-Variante uebersaehe genau
   * diesen Fall, und Falle 6 ist still.
   */
  it("ist kein Client-Modul", () => {
    const quelle = readFileSync("src/app/m/zeichen/_lib/merkliste.ts", "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});
