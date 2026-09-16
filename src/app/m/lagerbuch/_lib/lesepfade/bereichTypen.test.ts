/**
 * DRK-354 — DIE ZUSICHERUNG DES TICKETS, ALS TEST GESCHRIEBEN.
 *
 * Akzeptanzkriterium: „Ein Aufruf, der einen Handlager-Bereich dort einsetzt, wo
 * ein einzelner Ort gemeint ist, wird vom Compiler abgelehnt — nicht erst von
 * einem Prüfer." Genau das steht hier, und zwar in BEIDE Richtungen.
 *
 * ⚠️ DIESE DATEI PRUEFT DER TYPECHECK, NICHT VITEST. `@ts-expect-error` ist
 * selbst eine Zusicherung: die Zeile darunter MUSS einen Typfehler ergeben,
 * sonst meldet `tsc` „Unused '@ts-expect-error' directive" und `pnpm typecheck`
 * faellt. Wer die zwei Einstiege spaeter wieder zu einem zusammenlegt, sieht es
 * hier — und nur hier.
 *
 * ⚠️ DER KOERPER LAEUFT NIE. `verwechslungen` wird nirgends gerufen; ein echter
 * Lauf braeuchte eine Datenbank und wuerde ausserdem Bestand verruecken. Der
 * eine `it` unten haelt die Datei fuer vitest gueltig — ohne ihn meldete der
 * Lauf „No test suite found".
 */
import { describe, it, expect } from "vitest";
import type { Lagerbereich } from "../domain/orte";
import type { Tx } from "../schreibpfade/abbuchung";
import { fefoAbbuchungAnOrt, fefoAbbuchungImBereich } from "../schreibpfade/abbuchung";
import { umlagerungAusBereich, umlagerungVonOrt } from "../schreibpfade/umlagerung";
import {
  bestandJeArtikelImBereich, restJeChargeAnOrt, restJeChargeFuerArtikelAnOrt,
  restJeChargeFuerArtikelImBereich, restJeChargeImBereich, type Leser,
} from "./bestand";
import { handlagerOrte } from "./orte";

function verwechslungen(db: Leser, tx: Tx, fahrzeugId: string, bereich: Lagerbereich) {
  const quelle = { quelleTyp: "system", quelleId: "t" } as const;

  /* ── Richtung 1: ein BEREICH dort, wo ein EINZELNER ORT gemeint ist ── */

  // @ts-expect-error DRK-354 — `handlagerOrte` ist kein einzelner Ort.
  restJeChargeAnOrt(db, handlagerOrte(db));
  // @ts-expect-error DRK-354 — dito, hier fuer einen Artikel.
  restJeChargeFuerArtikelAnOrt(db, "a1", handlagerOrte(db));
  // @ts-expect-error DRK-354 — der Abbuchungskern buchte sonst Handlagerware vom Fahrzeug ab.
  fefoAbbuchungAnOrt(tx, { artikelId: "a1", menge: 1, ort: bereich,
    quelle, kommentar: null, referenz: null });
  // @ts-expect-error DRK-354 — die Umlagerung holte sich sonst Ware aus dem Nachbarschrank.
  umlagerungVonOrt(tx, { artikelId: "a1", menge: 1, vonOrt: bereich,
    nachLagerortId: fahrzeugId, quelle, kommentar: null, referenz: "check:t" });

  /* ── Richtung 2: eine NACKTE LISTE dort, wo ein BEREICH gemeint ist ── */

  // @ts-expect-error DRK-354 — `[fahrzeugId]` ist kein Bereich, nur eine Liste.
  bestandJeArtikelImBereich(db, [fahrzeugId]);
  // @ts-expect-error DRK-354 — dito.
  restJeChargeImBereich(db, [fahrzeugId]);
  // @ts-expect-error DRK-354 — dito.
  restJeChargeFuerArtikelImBereich(db, "a1", [fahrzeugId]);
  // @ts-expect-error DRK-354 — dito, auf dem Schreibweg.
  fefoAbbuchungImBereich(tx, { artikelId: "a1", menge: 1, bereich: [fahrzeugId],
    quelle, kommentar: null, referenz: null });
  // @ts-expect-error DRK-354 — dito.
  umlagerungAusBereich(tx, { artikelId: "a1", menge: 1, vonBereich: [fahrzeugId],
    nachLagerortId: fahrzeugId, quelle, kommentar: null, referenz: "check:t" });

  /* ── Und die richtigen Formen bleiben erlaubt (ohne `@ts-expect-error`) ── */

  restJeChargeAnOrt(db, fahrzeugId);
  restJeChargeFuerArtikelAnOrt(db, "a1", fahrzeugId);
  bestandJeArtikelImBereich(db, bereich);
  restJeChargeImBereich(db, handlagerOrte(db));
  restJeChargeFuerArtikelImBereich(db, "a1", bereich);
}

describe("DRK-354 — Bereich und Einzelort sind fuer den Compiler unterscheidbar", () => {
  it("die Zusicherungen stehen im Typecheck, nicht hier", () => {
    expect(typeof verwechslungen).toBe("function");
  });
});
