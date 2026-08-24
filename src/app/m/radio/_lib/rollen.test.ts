import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { UPDATER_FELDER, filterSchreibbareFelder } from "./rollen";

/**
 * Die Tests zu `_lib/rollen.ts` — Aufgabe V2 (Planteil 4).
 *
 * ⛔ WAS HIER NICHT STEHT, UND WO ES STATTDESSEN LIEGT: die vier Faelle zur GRUPPENQUELLE
 * („fehlendes / leeres / nur-Leerraum `SUITE_UPDATER_GROUP_RADIO` schliesst die Stufe" und
 * „der Vergleich ist zeichengleich") liegen in `_lib/zugang.test.ts`, Aufgabe V3 — dort, wo
 * `updaterGruppe()` und `istInUpdaterGruppe()` gebaut werden.
 * ⚠️ DAS IST EINE BENANNTE ABWEICHUNG von `Spec:4843-4845` und `Spec:4420-4422`, die beide
 * die Gruppenquelle in `_lib/rollen.ts` fuehren. Der Grund ist gemessen und steht im
 * Kopfkommentar von `rollen.ts`: dieselbe Datei liefert ihren Wert `UPDATER_FELDER` an eine
 * `"use client"`-Insel (V14), und ein Wertimport zieht sie in das Client-Bundle. Eine
 * Umgebungsvariable ohne den Praefix, den Next in den Browser reicht, ist dort schlicht
 * nicht gesetzt — die Stufenpruefung gaebe still `false` zurueck. Die Bruchstelle aus der
 * Gegenrichtung: `src/core/shell/types.ts:10-15`.
 */

const ROLLEN_QUELLE = "src/app/m/radio/_lib/rollen.ts";

/**
 * ⛔ JE FELD EIN ANDERER WERT — DAS IST EINE AUFLAGE, KEINE STILFRAGE (`Spec:4439-4440`,
 * wiederholt in `Spec:4843-4844`): „mit je Feld unterschiedlichen Werten, sonst besteht eine
 * Vertauschung den Test". Waeren zwei Werte gleich, bliebe eine Zuordnung, die den Wert von
 * `status` nach `softwareVersion` schreibt, gruen.
 *
 * FUENF Felder, davon ZWEI ausserhalb der Allowlist (`issi`, `notes`) — beides Feldnamen des
 * Bestands (`radio-admin/shared/src/schemas.ts:50-99`).
 *
 * ⚠️ `lastUpdatedAt` IST EINE ZAHL, KEINE DATUMSZEICHENKETTE — der Bestand fuehrt das Feld als
 * `z.number().int().nullable().optional()` (`radio-admin/shared/src/schemas.ts:87`, gleiche
 * Form im Anlege-Schema `:61`). ⛔ OHNE WIRKUNG AUF DIESEN TEST, und deshalb steht der Grund
 * hier: `filterSchreibbareFelder` ist generisch ueber `Record<string, unknown>` und sieht den
 * Typ nie — die Zahl steht da fuer den NAECHSTEN, der die Fixture uebernimmt (V10 schreibt
 * gegen dieses Feld). ⛔ WELCHE EINHEIT sie traegt, behauptet dieser Test NICHT: der Wert ist
 * ein Fixture-Platzhalter, keine Messung am Bestand.
 */
const PATCH_FUENF = {
  softwareVersion: "wert-software",
  lastUpdatedAt: 1234567890,
  status: "wert-status",
  issi: "wert-issi",
  notes: "wert-notiz",
};

describe("UPDATER_FELDER", () => {
  it("traegt genau die drei Namen des Bestands, in dieser Reihenfolge", () => {
    /*
     * ⛔ `toEqual` UND NICHT `toContain`: `toContain` bliebe gruen, wenn ein VIERTES Feld
     * dazukaeme — und ein viertes Feld in dieser Liste ist eine Rechteerweiterung, die
     * typecheck, lint und build nicht sehen.
     *
     * 1:1 aus `radio-admin/shared/src/editable-fields.ts:3` (`UPDATER_EDITABLE_FIELDS`),
     * Reihenfolge und Woerter unveraendert.
     */
    expect(UPDATER_FELDER).toEqual(["softwareVersion", "lastUpdatedAt", "status"]);
  });
});

describe("filterSchreibbareFelder", () => {
  it("admin behaelt jedes Feld des Patches", () => {
    /*
     * Der `{ ...patch }`-Zweig aus `editable-fields.ts:9`. Die Admin-Stufe filtert NICHT —
     * die Feld-Allowlist ist die Verfeinerung der Updater-Stufe, nicht eine zweite Sperre
     * ueber allen (`_lib/zugang.ts:161-168`).
     */
    const ergebnis = filterSchreibbareFelder("admin", PATCH_FUENF);
    expect(ergebnis).toEqual(PATCH_FUENF);
    /*
     * ⛔ UND ES IST EINE KOPIE, NICHT DAS UEBERGEBENE OBJEKT (`{ ...patch }`, nicht
     * `patch`): der Aufrufer in `admin/actions.ts` (V10) baut aus dem Ergebnis das
     * Update-Objekt weiter; gaebe diese Funktion die Referenz zurueck, schriebe jede
     * spaetere Aenderung in den Patch des Aufrufers zurueck.
     */
    expect(ergebnis).not.toBe(PATCH_FUENF);
  });

  it("updater: fremde Felder werden verworfen, erlaubte bleiben", () => {
    /*
     * ⛔ VERWORFEN, NICHT ABGELEHNT (`Spec:4435-4440`): das Alt-Formular zeigt gesperrte
     * Felder als `disabled` (`radio-admin/client/src/features/devices/DeviceFields.tsx:67`),
     * ein Fehler statt eines Verwerfens waere also nur mit einer manipulierten Anfrage
     * erreichbar — und wuerde dort einen Riegel verraten, den ein Verwerfen still haelt.
     *
     * ⛔ `toEqual` AUF DEM GANZEN ERGEBNIS faengt beide Fehler in einem Zug: ein fremdes
     * Feld, das durchrutscht, UND eine Vertauschung zweier Werte (deshalb die je Feld
     * unterschiedlichen Werte oben).
     */
    const ergebnis = filterSchreibbareFelder("updater", PATCH_FUENF);
    expect(ergebnis).toEqual({
      softwareVersion: "wert-software",
      lastUpdatedAt: 1234567890,
      status: "wert-status",
    });
  });

  it("updater: ein fehlendes erlaubtes Feld erscheint NICHT als undefined", () => {
    /*
     * ⛔ DER `Object.keys(patch)`-ZWEIG (`editable-fields.ts:12`). Wer stattdessen ueber
     * `UPDATER_FELDER` iteriert, schreibt fuer jedes im Patch fehlende Feld ein
     * `undefined` — und `diffGeraet` (V7) traegt es dann als Aenderung ein.
     *
     * ⚠️ Der Bestand faengt das eine Ebene tiefer ab (`diff-device.ts:18`:
     * `if (next === undefined) continue;`) — sich darauf zu verlassen waere aber eine
     * Kopplung ueber zwei Dateien: wer den Ausstieg dort entfernt, bricht diese Datei,
     * ohne sie anzufassen.
     *
     * ⛔ `toHaveProperty` UND NICHT `ergebnis.lastUpdatedAt === undefined`: der Vergleich
     * waere fuer den fehlenden UND fuer den gesetzt-undefinierten Schluessel wahr, also
     * genau fuer den Fehler blind, den dieser Fall bewacht.
     */
    const ergebnis = filterSchreibbareFelder("updater", {
      softwareVersion: "wert-software",
      status: "wert-status",
      issi: "wert-issi",
    });
    expect(ergebnis).not.toHaveProperty("lastUpdatedAt");
    expect(Object.keys(ergebnis)).toEqual(["softwareVersion", "status"]);
  });

  it("updater: das Ergebnis enthaelt genau die erlaubten Schluessel des Patches", () => {
    /*
     * ⛔ EXAKTER SCHLUESSELSATZ, NICHT `toMatchObject`: `toMatchObject` prueft nur, dass die
     * genannten Felder da sind, und bliebe gruen, waehrend `issi` und `notes` daneben
     * mitwanderten — also gruen bei genau der Rechteerweiterung, gegen die die Allowlist
     * steht.
     */
    const ergebnis = filterSchreibbareFelder("updater", PATCH_FUENF);
    expect([...Object.keys(ergebnis)].sort()).toEqual(
      ["lastUpdatedAt", "softwareVersion", "status"].sort(),
    );
    expect(ergebnis).not.toHaveProperty("issi");
    expect(ergebnis).not.toHaveProperty("notes");
  });
});

describe("Bauform", () => {
  it("_lib/rollen.ts nennt process.env nicht", () => {
    /*
     * ⛔ DER SCAN, DER DIE TRENNUNG HAELT — und ohne ihn kehrt sie beim naechsten
     * Aufraeumen zurueck („die Gruppenquelle gehoert doch zur Rolle").
     *
     * ⛔ WAS EINE WIEDERVEREINIGUNG KOSTET: `_lib/rollen.ts` liefert `UPDATER_FELDER` als
     * WERT an die `"use client"`-Insel von V14 (`lockedFor`). Ein Wertimport zieht das
     * Modul in das Client-Bundle; eine Umgebungsvariable ohne den Browser-Praefix ist dort
     * nicht gesetzt, und die Stufenpruefung gaebe still `false` zurueck. Typkorrekt,
     * lint-sauber, fuer `build` unsichtbar. Gegenrichtung derselben Bruchstelle:
     * `src/core/shell/types.ts:10-15`.
     *
     * ⛔ ER LIEST DEN ROHEN DATEITEXT, KOMMENTARE EINGESCHLOSSEN, und das ist Absicht:
     * `_lib/quelltextScan.ts` entsteht erst in V11 (E-V13), ein Import darauf waere hier
     * ein Vorwaerts-Zirkel, und eine VIERTE Kopie der dreiteiligen Kommentarschnitt-
     * Reparatur ist verboten (KOPF.md, Verbotsliste). Der Preis ist die PROSA-SPERRE im
     * Kopf von `rollen.ts`. Vorbild und Messung: `_db/leihen.ts:57-64` — dort faerbte ein
     * einziger Kommentar den Scan rot (`1 failed | 25 passed`).
     *
     * ⛔ UND DIE ZWEITE HAELFTE, OHNE DIE DER SCAN EIN LOCH HAETTE: die Zeichenkette fehlt
     * auch dann, wenn die Datei ein serverseitiges Modul IMPORTIERT, das sie enthaelt —
     * der Zug in das Client-Bundle waere derselbe. Deshalb traegt diese Datei GAR KEINEN
     * Import. ⚠️ Wer hier spaeter einen Typ braucht, deklariert ihn in `rollen.ts`, statt
     * ihn zu holen.
     *
     * ⛔ DIE WORTGRENZE `\b` IST GEMESSEN, NICHT GEWAEHLT (Fix-Runde 1 zu REVIEW-V2, Fund 3).
     * Beide engeren Formen sind an derselben Sonde gruen geblieben, mit der Zeile
     * `import*as ns from"node:path";` als erster Zeile von `rollen.ts`:
     *   - `/^\s*import\s/m` verlangt Leerraum hinter dem Wort: blind fuer die geschweifte
     *     Form (REVIEW-V2, Sonde M10) und hier gemessen blind fuer `import*as` — `6 passed (6)`.
     *   - `/^\s*import[\s{("']/m` (der Vorschlag der Kritik) schliesst die geschweifte Form,
     *     verfehlt aber weiter den Namensraum-Import `import*as` — gemessen `6 passed (6)`.
     *   - `/^\s*import\b/m` faengt ihn: gemessen `1 failed | 5 passed (6)`.
     * ⚠️ `\b` OEFFNET NICHTS NACH UNTEN: `importiert` und `import_x` tragen an derselben
     * Stelle ein Wortzeichen, dort gibt es keine Grenze — beide bleiben unbeanstandet.
     */
    const quelle = readFileSync(ROLLEN_QUELLE, "utf8");
    expect(quelle, "die Gruppenquelle gehoert nach _lib/zugang.ts (V3)").not.toContain(
      "process.env",
    );
    expect(quelle, "diese Datei traegt keinen Import — auch keinen Typimport").not.toMatch(
      /^\s*import\b/m,
    );
  });
});
