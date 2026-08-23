import { describe, it, expect } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

/**
 * 1:1 aus `lagerbuch` uebernommen (Spec:2417-2419). Der Wert kommt aus einer URL und
 * landet in einem `redirect()` bzw. einem `Location`-Kopf; er darf ausschliesslich ein
 * LOKALER Pfad sein.
 */
describe("radio-returnTo: nur lokale Pfade", () => {
  it.each([
    ["/geraete", "/geraete"],
    ["/ausleihen?geraete=a,b", "/ausleihen?geraete=a,b"],
    ["/rueckgabe", "/rueckgabe"],
  ])("laesst %s durch", (roh, erwartet) => {
    expect(sanitizeReturnTo(roh)).toBe(erwartet);
  });

  it.each([
    ["absolute URL", "https://boese.example/"],
    ["protokollrelativ", "//boese.example/"],
    ["protokollrelativ mit Backslash", "/\\boese.example/"],
    ["javascript-Schema", "javascript:alert(1)"],
    ["data-Schema", "data:text/html,x"],
    ["eingeschmuggeltes Schema hinter einem Schraegstrich", "/x:foo"],
    ["Zeilenumbruch fuer Header-Injection", "/ok\r\nSet-Cookie: x=y"],
    ["Tabulator vor dem Ziel", "/\t/boese.example"],
    ["Zeilenvorschub vor dem Ziel", "/\n/boese.example"],
    ["Wagenruecklauf vor dem Ziel", "/\r/boese.example"],
    ["relativer Pfad ohne fuehrenden Schraegstrich", "geraete"],
    ["leer", ""],
    ["null", null],
    ["undefined", undefined],
  ])("verwirft %s", (_n, roh) => {
    /*
     * ⛔ `//boese.example/` IST DER FALL, DEN EIN NAIVES `startsWith("/")` DURCHLAESST —
     * der Browser liest ihn als protokollrelative ABSOLUTE URL. Das ist die klassische
     * Open-Redirect-Luecke, und sie sieht in jedem Test gruen aus, der nur „faengt es
     * `http://` ab?" fragt.
     *
     * ⛔ `/x:foo` STEHT HIER AUS EINEM GEMESSENEN GRUND UND IST EINE ERGAENZUNG ZUR
     * VORLAGE. Der Brief `.superpowers/sdd/planteil3/briefs/A5.md:172-182` fuehrt zwoelf
     * Faelle, und keiner davon erreicht die Zeile `if (raw.includes(":")) return null;` in
     * `returnTo.ts`: `https://…`, `javascript:…` und `data:…` scheitern schon eine Zeile
     * frueher am fehlenden ersten Schraegstrich. Gemessen als Mutationssonde S-A5i —
     * die Doppelpunkt-Ablehnung ersatzlos entfernt, `21 passed`, **0 rot**. Die beiden
     * Fallnamen „javascript-Schema" und „data-Schema" versprachen damit eine Zusicherung,
     * die die Datei nicht hielt. `/x:foo` ist der Fall, den die Vorlage im Bestand dafuer
     * fuehrt (`src/app/m/lagerbuch/_lib/returnTo.test.ts:32`), und mit ihm ist S-A5i rot.
     *
     * ⛔ DIESELBE MESSUNG TRAF ZWEI WEITERE ZEILEN, und beide waren aus DEMSELBEN Grund
     * unbewacht: die Doppelpunkt-Ablehnung fing sie vorher ab.
     *
     *   S-A5k — `if (/[\t\n\r]/.test(raw))` ersatzlos entfernt: **0 rot**. Der Fall
     *   „Zeilenumbruch fuer Header-Injection" (`/ok\r\nSet-Cookie: x=y`) traegt einen
     *   Doppelpunkt und faellt deshalb eine Zeile spaeter — er erreicht die
     *   WHATWG-Haertung nie. Die drei Faelle darunter tragen KEINEN Doppelpunkt, und
     *   genau das ist der Punkt der Messung im Kopf von `returnTo.ts`:
     *   `new URL("/\t/boese.example", …).href` → `"https://boese.example/"`, obwohl alle
     *   fuenf uebrigen Ablehnungen bestehen. Mit ihnen ist S-A5k rot.
     *
     *   S-A5n — `if (!raw.startsWith("/"))` ersatzlos entfernt: **0 rot**. `https://…`,
     *   `javascript:…` und `data:…` tragen alle einen Doppelpunkt. Ein GEWOEHNLICHER
     *   relativer Pfad (`geraete`) traegt keinen — er ist der einzige Fall, der diese
     *   Zeile erreicht, und mit ihm ist S-A5n rot.
     *
     * ⚠️ Die Lehre ist nicht „mehr Faelle": sie ist, dass ein Fallname („data-Schema",
     * „Zeilenumbruch") die Zeile benennt, die der Leser bewacht GLAUBT — nicht die, die
     * beim Lauf tatsaechlich greift. Nur die Sonde unterscheidet das.
     *
     * ⚠️ DIE TYPZUSICHERUNG UNTEN IST TRAGEND, NICHT KOSMETIK. `it.each` leitet aus der
     * Tabelle den Typ der Spalte ab; sie enthaelt `null` und `undefined`, und `roh` ist
     * damit `string | null | undefined` — aber erst die Zusicherung sagt das dem Aufruf.
     * Die Tabelle SIEHT nach lauter Zeichenketten aus; wer sie „aufraeumt", bekommt
     * `rtk pnpm typecheck` rot und nicht etwa einen gruenen Lauf mit weniger Deckung.
     */
    expect(sanitizeReturnTo(roh as string | null | undefined)).toBeNull();
  });
});
