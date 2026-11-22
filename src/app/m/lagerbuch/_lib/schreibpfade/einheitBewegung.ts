/**
 * Die Bewegungen von und zu einer Einheit (Fahrzeug, Tasche) als WERFENDE
 * tx-Funktionen — gemeinsam fuer die Einzel-Actions (`bucheAufladen`,
 * `bucheRuecklauf`) und den Verwaltungscheck. Kein "use server", kein "use client".
 *
 * ⚠️ SIE WERFEN `BuchungAbgewiesen`, STATT EINEN FEHLERTEXT ZURUECKZUGEBEN. Ein
 * Rueckgabewert rollte die Transaktion des Aufrufers nicht zurueck, und der
 * Verwaltungscheck setzt mehrere Bewegungen in EINE Transaktion. Die Action
 * uebersetzt den Wurf in ihre Ergebnisform; der Text ist derselbe wie vorher.
 *
 * NICHT hier: Riegel (Rechte, Einheit aktiv, Herkunft ≠ Ziel — das bleibt je
 * Action), Verfallsstand-Rueckmeldung und `revalidiere…`.
 */
import { eq } from "drizzle-orm";
import { artikel, chargen, lagerorte } from "../../_db/schema";
import { BuchungAbgewiesen } from "../buchungAbgewiesen";
import {
  AUFLADEN_KOMMENTAR, CHECK_NACHFUELLUNG, ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR, ENTNAHMEBOX_NAME,
  RUECKLAUF_KOMMENTAR, ausDieserEinheit, ortZeile,
} from "../konstanten";
import {
  restJeChargeFuerArtikelAnOrt, restJeChargeFuerArtikelImBereich,
} from "../lesepfade/bestand";
import { handlagerOrte, zugangsZiele } from "../lesepfade/orte";
import {
  AUFLADEN_PRAEFIX, AUSSONDERN_PRAEFIX, ENTNAHMEBOX_PRAEFIX, RUECKLAUF_PRAEFIX,
} from "../vorgang";
import { fefoAbbuchungAnOrt, type Quelle, type Tx } from "./abbuchung";
import {
  raeumeVerfallAmLeerenOrt, verfallFolgtDemMaterial,
} from "./lagerortVerfall";
import { umlagerungAusBereich, umlagerungVonOrt } from "./umlagerung";

function artikelZeile(tx: Tx, artikelId: string): { name: string; einheit: string } {
  return tx.select({ name: artikel.name, einheit: artikel.einheit }).from(artikel)
    .where(eq(artikel.id, artikelId)).get() ?? { name: "diesem Artikel", einheit: "" };
}

/** RIEGEL I5: die Charge gehoert zu diesem Artikel. */
function pruefeCharge(tx: Tx, artikelId: string, chargeId: string): void {
  const charge = tx.select({ artikelId: chargen.artikelId })
    .from(chargen).where(eq(chargen.id, chargeId)).get();
  if (!charge || charge.artikelId !== artikelId) {
    throw new BuchungAbgewiesen("Diese Charge gehört nicht zu diesem Artikel. Bitte die Seite neu laden.");
  }
}

/**
 * Material aus einem BELIEBIGEN anderen Ort (auch stillgelegt) auf eine Einheit
 * packen — GENAU diese Charge, nicht FEFO. Gibt die umgelagerte Menge zurueck.
 * Nicht gedeckt heisst abweisen, nicht kappen (Begruendung an `bucheAufladen`).
 */
export function aufladenVonOrtTx(
  tx: Tx,
  a: {
    artikelId: string; menge: number; fahrzeugId: string; vonLagerortId: string;
    chargeId: string; quelle: Quelle;
  },
): number {
  const von = tx.select().from(lagerorte).where(eq(lagerorte.id, a.vonLagerortId)).get();
  if (!von) throw new BuchungAbgewiesen("Diesen Ort gibt es nicht mehr. Bitte die Seite neu laden.");
  pruefeCharge(tx, a.artikelId, a.chargeId);

  const vorhanden = restJeChargeFuerArtikelAnOrt(tx, a.artikelId, a.vonLagerortId)
    .get(a.chargeId) ?? 0;
  if (vorhanden < a.menge) {
    throw new BuchungAbgewiesen(
      `In „${ortZeile(von)}“ liegen von dieser Charge nur `
      + `${Math.max(vorhanden, 0)} ${artikelZeile(tx, a.artikelId).einheit}`.trimEnd()
      + ". Es wurde nichts gebucht — bitte die Menge prüfen.",
    );
  }

  const umgelagert = umlagerungVonOrt(tx, {
    artikelId: a.artikelId,
    menge: a.menge,
    // GENAU DIESER ORT, nicht sein Teilbaum (DRK-354).
    vonOrt: a.vonLagerortId,
    nachLagerortId: a.fahrzeugId,
    chargeId: a.chargeId,
    quelle: a.quelle,
    kommentar: AUFLADEN_KOMMENTAR,
    referenz: `${AUFLADEN_PRAEFIX}${a.fahrzeugId}`,
  }).umgelagert;
  if (umgelagert < a.menge) {
    // Unerreichbar hinter der Deckungspruefung — ein Wurf ohne Oberflaechentext.
    throw new Error("Deckung und Buchung sind uneins");
  }

  // Die gemeldete Verfallsangabe folgt dem Material (DRK-377).
  verfallFolgtDemMaterial(tx, {
    vonLagerortId: a.vonLagerortId, nachLagerortId: a.fahrzeugId, artikelId: a.artikelId,
  });
  return umgelagert;
}

/**
 * Von einer Einheit zurueck in einen Schrank (oder die Handlager-Wurzel),
 * GENAU diese Charge. Die Quelle ist eine Einheit (`typ fahrzeug`; `aktiv` wird
 * nicht verlangt — die stillgelegte raeumt man aus), das Ziel steht in
 * `zugangsZiele` (ein stillgelegter Schrank nimmt nichts mehr auf).
 */
export function ruecklaufTx(
  tx: Tx,
  a: {
    fahrzeugId: string; artikelId: string; chargeId: string; menge: number;
    zielLagerortId: string; quelle: Quelle;
  },
): number {
  const von = tx.select({ typ: lagerorte.typ, einheitenart: lagerorte.einheitenart })
    .from(lagerorte).where(eq(lagerorte.id, a.fahrzeugId)).get();
  if (!von) throw new BuchungAbgewiesen("Diese Einheit gibt es nicht mehr. Bitte die Seite neu laden.");
  if (von.typ !== "fahrzeug") {
    throw new BuchungAbgewiesen("Zurückbuchen geht nur aus einem Fahrzeug oder einer Tasche.");
  }
  if (!zugangsZiele(tx).some((o) => o.id === a.zielLagerortId)) {
    throw new BuchungAbgewiesen("Dieser Schrank nimmt kein Material mehr auf. Bitte die Seite neu laden.");
  }
  pruefeCharge(tx, a.artikelId, a.chargeId);

  const vorhanden = restJeChargeFuerArtikelAnOrt(tx, a.artikelId, a.fahrzeugId).get(a.chargeId) ?? 0;
  if (vorhanden < a.menge) {
    throw new BuchungAbgewiesen(
      `Von dieser Charge liegen ${ausDieserEinheit(von.einheitenart)} nur `
      + `${vorhanden} ${artikelZeile(tx, a.artikelId).einheit}`.trimEnd()
      + ". Es wurde nichts gebucht — bitte die Menge prüfen.",
    );
  }

  const umgelagert = umlagerungVonOrt(tx, {
    artikelId: a.artikelId,
    menge: a.menge,
    vonOrt: a.fahrzeugId,
    nachLagerortId: a.zielLagerortId,
    chargeId: a.chargeId,
    quelle: a.quelle,
    kommentar: RUECKLAUF_KOMMENTAR,
    referenz: `${RUECKLAUF_PRAEFIX}${a.fahrzeugId}`,
  }).umgelagert;
  if (umgelagert < a.menge) throw new Error("Deckung und Buchung sind uneins");

  // Im Handlager traegt die CHARGE den Verfall, nicht der Ort: die Meldung faellt mit dem letzten Stueck.
  raeumeVerfallAmLeerenOrt(tx, a.fahrzeugId, a.artikelId);
  return umgelagert;
}

/**
 * Von einer Einheit in die Entnahmebox. Ohne `chargeId` FEFO ueber die Einheit.
 * Nur der Box-Teil und die Buchung; Einheit-Riegel (aktiv, Berechtigung) und
 * Wiederholungsschutz (`sendungId`) bleiben bei `bucheInEntnahmebox`.
 */
export function inEntnahmeboxTx(
  tx: Tx,
  a: { fahrzeugId: string; artikelId: string; menge: number; chargeId?: string; quelle: Quelle },
): number {
  const box = tx.select({ typ: lagerorte.typ, aktiv: lagerorte.aktiv })
    .from(lagerorte).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).get();
  if (!box || box.typ !== "lager") {
    throw new BuchungAbgewiesen(`Die ${ENTNAHMEBOX_NAME} ist nicht eingerichtet. Bitte der Verwaltung melden.`);
  }
  if (!box.aktiv) {
    throw new BuchungAbgewiesen(`Die ${ENTNAHMEBOX_NAME} ist stillgelegt und nimmt nichts mehr auf.`);
  }
  if (a.chargeId) pruefeCharge(tx, a.artikelId, a.chargeId);

  const ergebnis = umlagerungVonOrt(tx, {
    artikelId: a.artikelId,
    menge: a.menge,
    vonOrt: a.fahrzeugId,
    nachLagerortId: ENTNAHMEBOX_ID,
    ...(a.chargeId ? { chargeId: a.chargeId } : {}),
    quelle: a.quelle,
    kommentar: ENTNAHMEBOX_KOMMENTAR,
    referenz: `${ENTNAHMEBOX_PRAEFIX}${a.fahrzeugId}`,
  });
  // Eine Teilumlagerung wird nicht gekappt, sondern abgewiesen — der Wurf rollt die Legs zurueck.
  if (ergebnis.umgelagert < a.menge) {
    throw new BuchungAbgewiesen(
      `Von ${artikelZeile(tx, a.artikelId).name} liegen an der Einheit nur ${ergebnis.umgelagert}`,
    );
  }
  verfallFolgtDemMaterial(tx, {
    vonLagerortId: a.fahrzeugId, nachLagerortId: ENTNAHMEBOX_ID, artikelId: a.artikelId,
  });
  return ergebnis.umgelagert;
}

/**
 * Eine gezaehlte Menge an einer Einheit aussondern: FEFO-Abgang als `korrektur`
 * mit `aussondern:`-Referenz (so zaehlt die Statistik sie als Aussonderung).
 *
 * ⚠️ KEIN `setzeVerfall` — die Verfallsmeldung pflegt der Aufrufer
 * (`aussondernVomLagerort` per Dialog; der Verwaltungscheck gar nicht).
 */
export function aussondernAnEinheitTx(
  tx: Tx,
  a: { lagerortId: string; artikelId: string; menge: number; quelle: Quelle; kommentar: string },
): void {
  let gesamt = 0;
  for (const r of restJeChargeFuerArtikelAnOrt(tx, a.artikelId, a.lagerortId).values()) gesamt += r;
  if (gesamt < a.menge) throw new BuchungAbgewiesen(`Hier liegen nur ${gesamt} Stück.`);
  fefoAbbuchungAnOrt(tx, {
    artikelId: a.artikelId,
    menge: a.menge,
    ort: a.lagerortId,
    quelle: a.quelle,
    kommentar: a.kommentar,
    referenz: `${AUSSONDERN_PRAEFIX}${a.lagerortId}`,
    typ: "korrektur",
  });
}

/**
 * Nachfuellen aus dem Handlager (Schraenke eingeschlossen), FEFO. Die Referenz
 * gibt der Aufrufer (`check:<id>`). Deckung wird VOR der Buchung geprueft.
 */
export function auffuellenAusHandlagerTx(
  tx: Tx,
  a: { artikelId: string; menge: number; fahrzeugId: string; quelle: Quelle; referenz: string },
): number {
  const bereich = handlagerOrte(tx);
  let summe = 0;
  for (const r of restJeChargeFuerArtikelImBereich(tx, a.artikelId, bereich).values()) {
    if (r > 0) summe += r;
  }
  if (summe < a.menge) {
    throw new BuchungAbgewiesen(
      `Im Handlager liegen von ${artikelZeile(tx, a.artikelId).name} nur ${summe}`,
    );
  }
  const { umgelagert } = umlagerungAusBereich(tx, {
    artikelId: a.artikelId,
    menge: a.menge,
    vonBereich: bereich,
    nachLagerortId: a.fahrzeugId,
    quelle: a.quelle,
    kommentar: CHECK_NACHFUELLUNG,
    referenz: a.referenz,
  });
  if (umgelagert < a.menge) {
    throw new BuchungAbgewiesen(
      `Im Handlager liegen von ${artikelZeile(tx, a.artikelId).name} nur ${umgelagert}`,
    );
  }
  return umgelagert;
}
