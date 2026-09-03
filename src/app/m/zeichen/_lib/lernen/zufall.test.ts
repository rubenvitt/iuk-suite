import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mische, zufallsfolge } from "./zufall";

describe("zufallsfolge", () => {
  /*
   * DETERMINISTISCH, UND DAS IST DIE BEDINGUNG DAFUER, DASS EIN QUIZ UEBERHAUPT
   * TESTBAR IST. Math.random() im Rumpf machte jeden Fall unten zu einer Wette.
   * Zweiter Grund: die Frage darf bei einem Rerender nicht neu wuerfeln — der
   * Seed kommt aus (sub, zeichenId, typ, rundenNr).
   */
  it("liefert zum selben Seed dieselbe Folge", () => {
    const a = zufallsfolge(4711);
    const b = zufallsfolge(4711);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("liefert zu verschiedenen Seeds verschiedene Folgen", () => {
    expect(zufallsfolge(1)()).not.toBe(zufallsfolge(2)());
  });

  it("bleibt zwischen 0 und 1", () => {
    const f = zufallsfolge(99);
    for (let i = 0; i < 200; i += 1) {
      const w = f();
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(1);
    }
  });
});

describe("mische", () => {
  it("behaelt alle Elemente", () => {
    const ein = [1, 2, 3, 4, 5];
    expect([...mische(ein, 7)].sort()).toEqual(ein);
  });

  it("laesst die Eingabe unangetastet", () => {
    const ein = [1, 2, 3];
    mische(ein, 7);
    expect(ein).toEqual([1, 2, 3]);
  });

  it("mischt zum selben Seed gleich", () => {
    expect(mische([1, 2, 3, 4, 5], 7)).toEqual(mische([1, 2, 3, 4, 5], 7));
  });
});

describe("zufall.ts ist kein Client-Modul", () => {
  /*
   * FIX-RUNDE 1 ZU AUFGABE 8, FUENFTER BEFUND (hochgestuft): `_db/lernen.ts` liest
   * diese Datei als WERT — `baueRundenfrage`/`idsAusSet` werden von Server Components
   * (`/lernen`, `/lernen/runde`, der Lernset-Verwaltung) importiert, und
   * `(shell)/verwaltung/lernsets/[id]/page.tsx` liest `fragbareZeichen` sogar direkt.
   * Truege diese Datei ein `"use client"`, kaeme dort ueberall eine Client-Referenz
   * statt des Wertes an — HTTP 500, und weder `typecheck` noch `build` noch Vitest
   * saehe es (hier ist die Direktive ein wirkungsloser String). Nur der
   * Quelltext-Scan sieht es.
   *
   * ⚠️ REGEX UEBER DEN DATEIANFANG, NICHT `trimStart().startsWith(...)` (Vorbild
   * `_lib/merkliste.test.ts`, nicht `lagerbuch/_lib/nav.test.ts`): nach ECMAScripts
   * Directive-Prologue-Regel bleibt die Direktive auch dann wirksam, wenn ihr NUR
   * KOMMENTARE vorausgehen — die `startsWith`-Form uebersaehe genau diesen Fall.
   */
  it("ist kein Client-Modul", () => {
    const quelle = readFileSync("src/app/m/zeichen/_lib/lernen/zufall.ts", "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});
