// src/app/m/radio/_lib/geraeteDiff.test.ts
import { describe, it, expect } from "vitest";
import { diffGeraet } from "./geraeteDiff";
import type { Geraet } from "../_db/schema";

/**
 * DER FELD-DIFF EINES GERAETS — 1:1 aus `radio-admin/shared/src/diff-device.ts:14-27`
 * (Aufgabe V8, `.superpowers/sdd/planteil4/briefs/V8.md:9-27`).
 *
 * ⚠️ WAS HIER AUSDRUECKLICH NICHT GEPRUEFT WIRD, UND DAS IST KEINE AUSLASSUNG: der fruehe
 * Ausstieg „leerer Diff heisst KEIN Ereignis" (`radio-admin/server/src/routes/devices.ts:139-142`
 * und derselbe Satz in `radio-admin/server/src/repos/deviceRepo.ts:229`:
 * `if (diffs.length === 0) return;`) ist eine Zusage des AUFRUFERS. Diese Funktion kennt kein
 * Ereignis und keine Datenbank — sie gibt eine Liste zurueck. Der Fall haengt an
 * `geraetAendernAction` und liegt damit in Aufgabe V10
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:1251-1257`). Der Fall „gleicher Wert ergibt eine
 * leere Diff-Liste" unten ist die HAELFTE, die hier prueffaehig ist: er sichert, dass der
 * Aufrufer die leere Liste ueberhaupt zu sehen bekommt.
 *
 * ⚠️ UND `createdAt`/`updatedAt` STEHEN IN KEINEM PATCH DIESER DATEI. Beide sind
 * `mode: "timestamp"` (`_db/schema.ts:60-61`), also `Date`-Objekte; `String(new Date(...))`
 * ist zeitzonen- und sprachabhaengig und ergaebe einen flackernden Vergleichswert.
 */

/**
 * Ein vollstaendiges Geraet in der Schluesselreihenfolge von `_db/schema.ts:20-64`.
 *
 * ⛔ DIE REIHENFOLGE IST HIER TRAGEND, NICHT KOSMETIK: der Fall „diffGeraet iteriert nur die
 * Schluessel des Patches" unten unterscheidet die beiden Schluesselquellen allein an der
 * REIHENFOLGE der Ausgabe (siehe die Begruendung dort). Wer `rufname` und `status` in diesem
 * Objekt umsortiert, macht jenen Fall still leer-gruen.
 */
function geraet(ueberschreibungen: Partial<Geraet> = {}): Geraet {
  return {
    id: "dev-1",
    rufname: null,
    issi: "1000",
    tei: null,
    serialNumber: null,
    deviceType: null,
    status: null,
    location: null,
    assignedTo: null,
    softwareVersion: null,
    lastUpdatedAt: null,
    notes: null,
    hiorgId: null,
    opta: null,
    funktion: null,
    hersteller: null,
    bedieneinheit: null,
    deviceModes: null,
    alamosIntegrated: null,
    loanable: null,
    updateNote: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: null,
    updatedBy: null,
    ...ueberschreibungen,
  };
}

describe("diffGeraet — was KEINE Aenderung ist", () => {
  it("gleicher Wert ergibt eine leere Diff-Liste", () => {
    /*
     * `Spec:4837`. Alt-Fall `radio-admin/shared/src/diff-device.test.ts:51-55`.
     *
     * ⛔ DER FALL, AN DEM „KEIN EREIGNIS" HAENGT (`.superpowers/sdd/planteil4/briefs/V8.md:63`).
     * Der Aufrufer steigt bei `diffs.length === 0` frueh aus — schreibt kein Ereignis, kein
     * `updatedAt`, kein `revalidatePath` (`.superpowers/sdd/planteil4/briefs/KOPF.md:1251-1257`). Gibt diese Funktion fuer einen
     * unveraenderten Wert eine Zeile zurueck, entsteht bei jedem Speichern eines
     * unveraenderten Formulars eine Auditzeile, und die Historie wird wertlos.
     *
     * Sonde S-V8e haengt an der Ausstiegszeile `if (bestehend[feld] === neu) continue;`.
     */
    const bestehend = geraet({ status: "einsatzbereit", rufname: "Alpha" });
    expect(diffGeraet(bestehend, { status: "einsatzbereit" })).toEqual([]);
  });

  it("ein Feld, das im Patch fehlt, erzeugt keinen Diff", () => {
    /*
     * `radio-admin/shared/src/diff-device.ts:18`: `if (next === undefined) continue;`.
     *
     * ⛔ BEIDE FORMEN VON „FEHLT" STEHEN HIER, UND NUR EINE VON BEIDEN KANN DEN
     * `undefined`-AUSSTIEG UEBERHAUPT PRUEFEN. Ein Schluessel, der gar nicht im Objekt steht,
     * faellt schon aus `Object.keys(patch)` heraus — er bewacht die ERSTE Regel, nicht die
     * zweite. Der Ausstieg wird erst von einem Schluessel getroffen, der MIT dem Wert
     * `undefined` im Patch steht. Genau diese Form entsteht im Bestand real: der Rollenfilter
     * darf nicht ueber seine Allowlist laufen, weil er sonst jedes fehlende Feld als
     * `undefined` eintraegt (`_lib/rollen.ts:91-95`).
     *
     * Sonde S-V8a haengt an dieser Zeile.
     */
    const bestehend = geraet({ notes: "Bestandsnotiz", status: "einsatzbereit" });
    expect(diffGeraet(bestehend, { notes: undefined })).toEqual([]);
    expect(diffGeraet(bestehend, {})).toEqual([]);
  });
});

describe("diffGeraet — was eine Aenderung ist und wie sie aussieht", () => {
  it("null gegen einen Wert und ein Wert gegen null sind beides Aenderungen", () => {
    /*
     * `radio-admin/shared/src/diff-device.ts:22-23`. ⛔ BEIDE RICHTUNGEN
     * (`.superpowers/sdd/planteil4/briefs/V8.md:65`): der Alt-Test fuehrt nur `null -> Wert`
     * (`diff-device.test.ts:45-49`). Die Gegenrichtung entsteht real, sobald jemand ein Feld
     * im Formular leert, und ein Nachbau, der `null` im Patch fuer „nicht gesetzt" haelt,
     * verschluckt genau diese Aenderung.
     */
    expect(diffGeraet(geraet({ status: null }), { status: "in Reparatur" })).toEqual([
      { feld: "status", alt: null, neu: "in Reparatur" },
    ]);
    expect(diffGeraet(geraet({ status: "in Reparatur" }), { status: null })).toEqual([
      { feld: "status", alt: "in Reparatur", neu: null },
    ]);
  });

  it("alt und neu sind Zeichenketten, null bleibt null", () => {
    /*
     * `toEventValue`, `radio-admin/shared/src/diff-device.ts:4-6`: `v == null ? null : String(v)`.
     * Beide Haelften der Zeile stehen hier einzeln — die Stringifizierung an einem echten
     * Nicht-Zeichenketten-Feld, und die Erhaltung von `null`.
     *
     * ⛔ `loanable` UND `alamosIntegrated` SIND DIE EINZIGEN NICHT-ZEICHENKETTEN, DIE EIN
     * PATCH FUEHREN KANN (`_db/schema.ts:50`, `:55` — beide `mode: "boolean"`). Ohne
     * `String(...)` traegt die Ereigniszeile ein `true` statt `"true"`, und der Spaltentyp
     * der Zieltabelle ist `text` (`_db/schema.ts:131-132`). Sonden S-V8f und S-V8g haengen an
     * den beiden Haelften dieser einen Zeile.
     */
    expect(diffGeraet(geraet({ loanable: false }), { loanable: true })).toEqual([
      { feld: "loanable", alt: "false", neu: "true" },
    ]);
    expect(diffGeraet(geraet({ alamosIntegrated: true }), { alamosIntegrated: null })).toEqual([
      { feld: "alamosIntegrated", alt: "true", neu: null },
    ]);
  });

  it("diffGeraet iteriert nur die Schluessel des Patches", () => {
    /*
     * `radio-admin/shared/src/diff-device.ts:16`: `Object.keys(patch)`.
     *
     * ⛔ DIE ZAHL ALLEIN ENTSCHEIDET DIESEN FALL NICHT, UND DAS IST GEMESSEN. Das Geraet traegt
     * zehn gesetzte Felder, der Patch zwei; laeuft die Schleife stattdessen ueber
     * `Object.keys(bestehend)`, faengt der `undefined`-Ausstieg eine Zeile darunter JEDES nicht
     * gepatchte Feld ab — es kaemen wieder genau zwei Diffs, und ein `toHaveLength(2)` bliebe
     * gruen. Beobachtbar bleibt allein die REIHENFOLGE: aus dem Patch kommt
     * `status` vor `rufname` (Einfuegereihenfolge unten), aus dem Geraet kaeme `rufname` vor
     * `status` (Schluesselreihenfolge des Fixtures, `_db/schema.ts:21` vor `:30`).
     * Deshalb ist die Zusicherung ein geordnetes `toEqual` und nicht `toContainEqual`.
     *
     * Sonde S-V8h haengt an der Schluesselquelle.
     */
    const bestehend = geraet({
      rufname: "Alpha",
      tei: "TEI-1",
      serialNumber: "SN-1",
      deviceType: "MTP850",
      status: "einsatzbereit",
      location: "Wache",
      assignedTo: "Zug 1",
      softwareVersion: "FW 11.0",
      notes: "Bestandsnotiz",
      updateNote: "[2026-06-01 · Eva] alt",
    });
    const diffs = diffGeraet(bestehend, { status: "in Reparatur", rufname: "Alpha-2" });
    expect(diffs).toHaveLength(2);
    expect(diffs).toEqual([
      { feld: "status", alt: "einsatzbereit", neu: "in Reparatur" },
      { feld: "rufname", alt: "Alpha", neu: "Alpha-2" },
    ]);
  });
});
