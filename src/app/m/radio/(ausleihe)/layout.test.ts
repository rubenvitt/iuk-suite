// src/app/m/radio/(ausleihe)/layout.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";

/**
 * DIE HUELLE DES AUSLEIH-ZWEIGS — DER VERHALTENSNACHWEIS (REVIEW-A18, Fund 1).
 *
 * ⛔ WARUM ES DIESE DATEI GIBT: bis zur Fix-Runde 1 zu A18 lief KEINE Zeile von
 * `(ausleihe)/layout.tsx` in einem Test. Belegt war nur, dass die Riegelzeile im Quelltext
 * STEHT (`riegel.test.ts` Klausel (f)) — gemessen: `return children;` zu `return null;` zu
 * aendern machte den GANZEN `(ausleihe)`-Zweig zur weissen Seite und liess Typecheck, Lint
 * und alle 435 Faelle des Moduls gruen.
 *
 * ⛔ WAS DIESE DATEI NICHT BELEGT — und das ist die Grenze, nicht eine Auslassung: sie sagt
 * NICHTS darueber, ob Next ein Group-Layout ueberhaupt ausfuehrt und ob der Riegel bei einem
 * ECHTEN Abruf GREIFT. Hier laeuft die exportierte Funktion, mehr nicht — und genau das war
 * die Luecke.
 *
 * ✅ ⬜ A-L9: DIESE FRAGE IST NICHT MEHR OFFEN, UND DER SATZ STEHT DESHALB IM PERFEKT. Bis zur
 * Fix-Runde 2 zu T3 stand hier: „(⬜ A-L9, Erbe von ⬜ Z-L1, `riegel.test.ts:50-55`). Das liest
 * Planteil 5 beim ersten e2e-Lauf ab." ⛔ Der Lauf hat am 2026-08-27 stattgefunden, und
 * abgelesen ist er in der Datei NEBENAN: `(ausleihe)/layout.tsx:38-68` traegt die zwei
 * Wirkproben P1/P2 mit Messwerten (P2 = Seitenzeile neutralisiert, Layoutzeile unberuehrt
 * -> Fall 4 Hop 1 weiterhin `307` auf `/abmelden?grund=gesperrt`). Ergebnis: Next FUEHRT das
 * Group-Layout aus, und der Riegel darin greift bei einem echten Abruf AUCH ALLEIN. Die
 * Dauerfaelle stehen in `e2e/radio-zugang.spec.ts` (Kopf `:21-23`).
 * ⚠️ ZWEI GRENZEN BLEIBEN, damit dieser Absatz nicht das naechste zu grosse Wort wird:
 * ⬜ A-L9 ist als GANZES nicht geschlossen — die Host-Schleife ueber zwei Hosts (T4,
 * `_lib/bauform.test.ts:654`), der `abgelaufen`-Zweig von `_lib/ausleihZugang.ts:240` (in KEINEM
 * der vier Faelle bei einem echten Abruf gemessen; in `e2e/radio-zugang.spec.ts` kommt das Wort
 * nur in zwei KOMMENTARzeilen vor, `:380` und `:725` — nachgezaehlt, nicht geschaetzt), `/sw.js`
 * und `/api/health/radio` (T4/T5) und der Personenriegel im `(druck)`-Zweig (⬜ V-L14, T5)
 * stehen aus. Und der Anker `riegel.test.ts:50-55` aus dem alten Wortlaut zeigt heute auf die
 * Ablesung des VERWALTUNGSzweigs (V23, 2026-08-26) — er trug den Satz ohnehin nur als Herkunft,
 * nicht als Beleg.
 *
 * ⚠️ KEIN jsdom UND KEIN `mount()`: die Huelle rendert nichts, sie REICHT DURCH. Die Zusage
 * ist eine Identitaet (`toBe`), und die misst man ohne DOM schaerfer als an einem Baum. Damit
 * bleibt die Zaehlung des Berichts (§4.3, „acht jsdom-Dateien in Block B") richtig.
 * Hauspraezedenz fuer die Bauform: `src/app/m/feedback/(admin)/layout.test.tsx` (direkter
 * Aufruf, gemockte Riegel, kein Harness).
 */

const riegel = vi.hoisted(() => vi.fn());
const DB_ATTRAPPE = vi.hoisted(() => ({ marker: "radio-ausleihe-db" }));

vi.mock("../_db/client", () => ({ getDb: () => DB_ATTRAPPE }));
vi.mock("../_lib/ausleihZugang", () => ({ requireAusleihZugang: riegel }));

import AusleiheLayout from "./layout";

const ZUGANG = {
  weg: "code" as const,
  codeId: "zc-1",
  bezeichnung: "Aufsteller Wache",
  laeuftAb: new Date("2026-06-14T20:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  riegel.mockResolvedValue(ZUGANG);
});

describe("die Huelle des Ausleih-Zweigs", () => {
  it("reicht ihre Kinder unveraendert durch", async () => {
    /*
     * ⛔ IDENTITAET, NICHT AEHNLICHKEIT. `toBe` faellt auch dann, wenn die Huelle das Kind
     * in irgendetwas einwickelt — und einwickeln darf sie nichts: sie traegt KEINEN Rahmen
     * und KEINE `<Shell>` (Entscheidung E9, ausgeschrieben in `layout.tsx`), weil der
     * `AusleihRahmen` `zugang` und `aktiv` braucht und ein Layout einer Seite keine Props
     * reichen kann.
     */
    const kind = createElement("p", { "data-rolle": "radio-ausleihe-kind" });

    expect(await AusleiheLayout({ children: kind })).toBe(kind);
  });

  it("ruft den Zugriffsriegel genau einmal, mit der Moduldatenbank", async () => {
    /*
     * ⛔ GENAU EINMAL. Ein zweiter Aufruf waere hier kein Schoenheitsfehler: die drei Seiten
     * unter `(ausleihe)/` rufen das Praedikat SELBST noch einmal (Route-Group-Grenzen sind
     * keine Sicherheitsgrenzen, `layout.tsx` schreibt das aus) — jeder weitere Aufruf IN der
     * Huelle laege oben drauf und liesse `last_used_at` und die Schranke doppelt zaehlen.
     * ⛔ UND MIT DER MODULDATENBANK, nicht ohne Argument: `requireAusleihZugang(getDb())` ist
     * die Form, die `briefs/A19.md:10` und `briefs/A20.md:9` fuer ihre Seiten woertlich
     * fortschreiben.
     */
    await AusleiheLayout({ children: null });

    expect(riegel).toHaveBeenCalledTimes(1);
    expect(riegel).toHaveBeenCalledWith(DB_ATTRAPPE);
  });

  it("leitet der Riegel um, entsteht keine Huelle", async () => {
    /*
     * ⛔ DER WURF IST DER ERWARTETE AUSGANG (Bauform-Zulaessigkeitstafel Zeile 6):
     * `requireAusleihZugang` leitet ueber einen geworfenen `redirect()`-Sentinel um
     * (`_lib/ausleihZugang.ts:236-241`). Ein `try`/`catch` in `layout.tsx` verschluckte ihn,
     * die Weiterleitung faende STILL nicht statt, und der Zweig rendert fuer eine Person
     * ohne Zugang weiter. Genau diese Zusage traegt der Quelltext-Scan NICHT — er sieht die
     * Zeile, nicht ihren Ausgang.
     */
    riegel.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(AusleiheLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT");
  });
});
