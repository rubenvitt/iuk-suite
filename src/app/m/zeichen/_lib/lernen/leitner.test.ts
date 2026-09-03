import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTERVALL_TAGE, naechsterStand } from "./leitner";

const HEUTE = "2026-09-03";

describe("naechsterStand", () => {
  it("hebt bei richtig um eine Stufe", () => {
    expect(naechsterStand(0, "richtig", HEUTE).stufe).toBe(1);
    expect(naechsterStand(2, "richtig", HEUTE).stufe).toBe(3);
  });

  it("kommt nicht ueber Stufe vier hinaus", () => {
    expect(naechsterStand(4, "richtig", HEUTE).stufe).toBe(4);
  });

  it("setzt bei falsch auf null und macht heute faellig", () => {
    expect(naechsterStand(4, "falsch", HEUTE)).toEqual({ stufe: 0, faelligAm: HEUTE });
  });

  /*
   * DAS INTERVALL GEHOERT ZUR ERREICHTEN STUFE, nicht zur verlassenen. Wer von 1 auf 2
   * steigt, sieht das Zeichen in INTERVALL_TAGE[2] = 7 Tagen wieder — nicht in dreien.
   * Ein Off-by-one hier faellt niemandem auf: beide Fassungen sehen plausibel aus, und
   * der Unterschied zeigt sich erst nach Wochen als "kommt zu oft" oder "kommt nie".
   */
  it("rechnet das Intervall der ERREICHTEN Stufe", () => {
    expect(INTERVALL_TAGE).toEqual([1, 3, 7, 16, 35]);
    expect(naechsterStand(1, "richtig", HEUTE).faelligAm).toBe("2026-09-10"); // +7
    expect(naechsterStand(0, "richtig", HEUTE).faelligAm).toBe("2026-09-06"); // +3
  });

  /*
   * heute IST EIN PARAMETER, kein new Date() im Rumpf — sonst haenge dieser Fall an
   * dem Tag, an dem er laeuft, und der Monatswechsel unten waere nicht pruefbar.
   */
  it("nimmt heute als Parameter und rechnet ueber Monatsgrenzen", () => {
    expect(naechsterStand(0, "richtig", "2026-09-30").faelligAm).toBe("2026-10-03");
    expect(naechsterStand(3, "richtig", "2026-12-15").faelligAm).toBe("2027-01-19"); // +35
  });
});

describe("leitner.ts ist kein Client-Modul", () => {
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
    const quelle = readFileSync("src/app/m/zeichen/_lib/lernen/leitner.ts", "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });
});
