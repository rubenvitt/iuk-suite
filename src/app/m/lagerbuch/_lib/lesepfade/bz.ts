/**
 * BZ-Geraete: Uebersicht, Detail, Logbuch, Akku-Kennzahl.
 * Kein "use client", kein Icon-Import.
 *
 * DIE EINE AENDERUNG GEGENUEBER `src/db/bz.ts`: `refSnapshot` WIRD GELESEN
 * (§5.11). Nachgeprueft liefert `grep -rn refSnapshot src/` ausserhalb von Tests
 * nur die Schreibstelle und die Spaltendefinition — die Zusage „nachweisfester
 * Snapshot der Referenzbereiche zum Messzeitpunkt" existiert als DATUM, nicht als
 * AUSSAGE. Das Logbuch zeigt ab jetzt je Zeile die DAMALS gueltigen Grenzen; ohne
 * das liest man eine alte Kontrolle gegen einen NEUEN Referenzbereich, und das ist
 * die Fehlaussage, die ein Nachweis nicht machen darf.
 *
 * ⚠️ DER ROHE JSON-STRING WIRD NUR GELESEN, NIE ZURUECKGESCHRIEBEN. Er entsteht
 * als `JSON.stringify` ueber sieben Schluessel in DIESER Reihenfolge; ein Import,
 * der ihn parst und neu serialisiert, VERAENDERT EINEN NACHWEIS (Teil 1, T7).
 *
 * ⚠️ `DB` NIMMT NUR, WER `quelleAufloeser` RUFT (Festlegung H11) — hier sind das
 * GENAU ZWEI Funktionen: `bzGeraetDetail` und `bzLogbuchGesamt`. Wer sie in eine
 * Transaktion ziehen will, muss `quelleAufloeser` in Teil 1 anfassen; das ist
 * eine Entscheidung, kein Cast.
 *
 * ⚠️ DIE UEBRIGEN VIER NEHMEN `Leser`, und das ist keine Kosmetik. `DB` allein
 * durch DATEIZUGEHOERIGKEIT waere eine Enge ohne Grund — und sie blockierte
 * Teil 4: `geraeteFuerLagerort(db: Leser)` und die Geraeteliste hier beliefern
 * DIESELBE Fahrzeug-Check-Maske, und §5.6.3 zeigt, dass die Maske innerhalb der
 * Check-Transaktion gelesen wird. Die naheliegende Abhilfe waere dann der Cast,
 * den H11 gerade verbietet.
 */
import { and, desc, eq } from "drizzle-orm";
import { bzGeraete, bzKontrollen, lagerorte } from "../../_db/schema";
import type { Einheitenart, StandortAngabe } from "../konstanten";
import { quelleAufloeser } from "../../_db/quelle";
import { akkuLebensdauer, bzBeachtung, bzFaelligkeit,
         type BzAkkuKennzahl, type BzBeachtung, type BzFaelligkeit } from "../domain/bz";
import { BZ_LOGBUCH_GRENZE } from "../grenzen";
import type { DB } from "../../_db/client";
import type { Leser } from "./bestand";

/** Die sieben Schluessel aus `refSnapshot`, alle optional — ein Altsnapshot kann
 *  weniger tragen, und ein fehlender Schluessel ist kein Fehler. */
export type RefBereiche = {
  streifenLot?: string | null;
  level1Label?: string | null; level1Min?: number | null; level1Max?: number | null;
  level2Label?: string | null; level2Min?: number | null; level2Max?: number | null;
};

/** Parst `refSnapshot`. Jeder Lesefehler wird `null` — eine kaputte Zeile darf die
 *  Detailseite nicht abstuerzen lassen, und der Nachweis ist dann eben unlesbar. */
function refDamalsAus(roh: string | null): RefBereiche | null {
  if (!roh) return null;
  try {
    const d: unknown = JSON.parse(roh);
    if (d === null || typeof d !== "object" || Array.isArray(d)) return null;
    return d as RefBereiche;
  } catch {
    return null;
  }
}

export type BzKontrolleZeile = {
  id: string; ts: Date; wer: string; bestanden: boolean;
  level1Wert: number | null; level1ImBereich: boolean | null;
  level2Wert: number | null; level2ImBereich: boolean | null;
  kompresseVerfall: string | null; sticks: number; lanzetten: number;
  batterieGewechselt: boolean; kommentar: string | null;
  /** ⚠️ Die DAMALS gueltigen Grenzen — nicht die heutigen aus `bz_geraete`. */
  refDamals: RefBereiche | null;
};

function toZeile(
  k: typeof bzKontrollen.$inferSelect,
  wer: (quelleTyp: string, quelleId: string) => string,
): BzKontrolleZeile {
  return {
    id: k.id, ts: k.ts, wer: wer(k.quelleTyp, k.quelleId), bestanden: k.bestanden,
    level1Wert: k.level1Wert, level1ImBereich: k.level1ImBereich,
    level2Wert: k.level2Wert, level2ImBereich: k.level2ImBereich,
    kompresseVerfall: k.kompresseVerfall, sticks: k.sticks, lanzetten: k.lanzetten,
    batterieGewechselt: k.batterieGewechselt, kommentar: k.kommentar,
    refDamals: refDamalsAus(k.refSnapshot),
  };
}

/**
 * ⚠️ MIT `kennung` UND `einheitenart` (DRK-309, Reviewrunde 5). Diese Liste
 * haengt an jedem Standortfeld — Geraet, BZ-Geraet, Sauerstoffflasche —, und
 * `typ` allein trennt seit dieser Aenderung nicht mehr, was daran haengt: eine
 * Tasche traegt `typ: "fahrzeug"` wie jedes Fahrzeug. Ohne die beiden Felder
 * kann die Auswahl darueber nur Namen zeigen, und Namen sind in `lagerorte`
 * nicht eindeutig.
 */
export type LagerortOption = {
  id: string; name: string; typ: "lager" | "fahrzeug";
  kennung: string | null; einheitenart: Einheitenart | null;
};

/** Aktive Lagerorte als Auswahl fuer Geraete-Formulare. */
export function lagerortOptionen(db: Leser): LagerortOption[] {
  return db.select().from(lagerorte).where(eq(lagerorte.aktiv, true)).all()
    .map((l) => ({
      id: l.id, name: l.name, typ: l.typ,
      kennung: l.kennung, einheitenart: l.einheitenart,
    }))
    .sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

/**
 * DRK-309: Standorte samt Art — siehe `standortZeile`. Der Rueckfall traegt
 * `typ: "lager"`, damit ein geloeschter Standort „Lager" sagt statt „nicht
 * zugeordnet": offen ist die Art nur da, wo es eine Einheit GIBT.
 */
const STANDORT_UNBEKANNT: StandortAngabe = {
  name: "–", typ: "lager", kennung: null, einheitenart: null,
};

function standorte(db: Leser): Map<string, StandortAngabe> {
  return new Map(db.select().from(lagerorte).all().map((l) => [l.id, {
    name: l.name, typ: l.typ, kennung: l.kennung, einheitenart: l.einheitenart,
  }]));
}

export type BzGeraetZeile = {
  id: string; name: string; barcode: string | null; lagerortName: string;
  /** DRK-309: Der Standort wird BENANNT, nicht nur genannt — `standortZeile`. */
  lagerortStandort: StandortAngabe;
  aktiv: boolean;
  letzteKontrolle: Date | null; letztesBestanden: boolean | null; faelligkeit: BzFaelligkeit;
  /**
   * DRK-311 — DER KOMMENTAR DER LETZTEN KONTROLLE, sonst `null`.
   *
   * ⚠️ AUS DERSELBEN ZEILE WIE `letzteKontrolle` UND `letztesBestanden`, nicht
   * aus der letzten Kontrolle, die ueberhaupt einen Kommentar trug. Der
   * naheliegende „letzte nicht-leere Bemerkung" waere die falsche Aussage:
   * daneben steht der Zeitpunkt der LETZTEN Kontrolle, und dann liest jemand
   * einen drei Monate alten Satz als das, was gestern beobachtet wurde. Keine
   * Bemerkung ist eine Aussage — „bei der letzten Kontrolle gab es nichts zu
   * sagen".
   */
  letzteBemerkung: string | null;
  /**
   * DRK-311 — der Aufmerksamkeitshinweis. ⚠️ NICHT aus `letzteBemerkung`
   * abgeleitet (Gespraechsnotiz: „Nicht jede Bemerkung automatisch als Warnung
   * interpretieren"); beide Felder stehen absichtlich nebeneinander.
   */
  beachtung: BzBeachtung;
};

export function bzGeraeteUebersicht(db: Leser, now: Date = new Date()): BzGeraetZeile[] {
  const geraete = db.select().from(bzGeraete).all();
  const stamm = standorte(db);
  const kontrollen = db.select().from(bzKontrollen).all();
  const letzteProGeraet = new Map<string, (typeof kontrollen)[number]>();
  for (const k of kontrollen) {
    const prev = letzteProGeraet.get(k.geraetId);
    // id-Tiebreaker bei GLEICHEM `ts` (§5.14.4) — MUSS mit der Sortierung in
    // `bzGeraetDetail`/`bzLogbuchGesamt` (`orderBy(desc(ts), desc(id))`)
    // uebereinstimmen: sonst kann diese Uebersicht eine ANDERE Kontrolle als
    // „die letzte" behandeln als das Logbuch — bei zwei Kontrollen in
    // derselben Sekunde (ts ist Sekunden-genau) eine reale Divergenz auf
    // einem Medizinprodukte-Nachweis, nicht nur ein theoretischer Fall.
    const istSpaeter = !prev
      || k.ts.getTime() > prev.ts.getTime()
      || (k.ts.getTime() === prev.ts.getTime() && k.id > prev.id);
    if (istSpaeter) letzteProGeraet.set(k.geraetId, k);
  }
  return geraete
    .map((g) => {
      const letzte = letzteProGeraet.get(g.id) ?? null;
      return {
        id: g.id, name: g.name, barcode: g.barcode,
        lagerortName: (stamm.get(g.lagerortId) ?? STANDORT_UNBEKANNT).name,
        lagerortStandort: stamm.get(g.lagerortId) ?? STANDORT_UNBEKANNT,
        aktiv: g.aktiv,
        letzteKontrolle: letzte ? letzte.ts : null,
        letztesBestanden: letzte ? letzte.bestanden : null,
        // Ein Kommentar aus lauter Leerzeichen ist keiner — dieselbe Regel wie
        // in `bzBeachtung`, damit die Spalte nicht scheinbar etwas traegt.
        letzteBemerkung: letzte?.kommentar?.trim() || null,
        beachtung: bzBeachtung(g),
        // ⚠️ `null` → rot MIT ueberfaellig false. Die Anzeige muss `nieGeprueft`
        // eigenstaendig behandeln (§5.11).
        faelligkeit: bzFaelligkeit(letzte ? letzte.ts : null, now),
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type BzGeraetDetail = {
  geraet: typeof bzGeraete.$inferSelect;
  lagerortName: string;
  /** DRK-309: volle Standortangabe — Begruendung an `GeraetDetail`. */
  lagerortStandort: StandortAngabe;
  faelligkeit: BzFaelligkeit;
  /**
   * DRK-311. ⚠️ Auch hier FERTIG GERECHNET, obwohl `geraet` die beiden Rohfelder
   * mitbringt: die Detailseite soll dieselbe Bedingung nicht ein zweites Mal
   * formulieren wie die Liste (`bzBeachtung` in `domain/bz.ts`).
   */
  beachtung: BzBeachtung;
  akku: BzAkkuKennzahl;
  /** chronologisch ABSTEIGEND */
  logbuch: BzKontrolleZeile[];
  /** Mehr als die sichtbaren 100 Kontrollen sind vorhanden. */
  logbuchMehrVorhanden: boolean;
};

export function bzGeraetDetail(
  db: DB, id: string, now: Date = new Date(),
): BzGeraetDetail | null {
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get();
  if (!g) return null;
  const lo = db.select().from(lagerorte).where(eq(lagerorte.id, g.lagerortId)).get();
  const lagerortStandort: StandortAngabe = lo
    ? { name: lo.name, typ: lo.typ, kennung: lo.kennung, einheitenart: lo.einheitenart }
    : STANDORT_UNBEKANNT;
  const sichtbareRows = db.select().from(bzKontrollen)
    .where(eq(bzKontrollen.geraetId, id))
    // id-Tiebreaker: `ts` sind UNIX-Sekunden (§5.14.4).
    .orderBy(desc(bzKontrollen.ts), desc(bzKontrollen.id))
    .limit(BZ_LOGBUCH_GRENZE + 1)
    .all();
  const letzte = sichtbareRows[0] ?? null;
  // Die Tabellenbegrenzung darf die medizinische Kennzahl nicht veraendern:
  // fuer den Akku wird die geraetegebundene Vollhistorie getrennt gelesen.
  const batterieWechsel = db.select({ ts: bzKontrollen.ts }).from(bzKontrollen)
    .where(and(
      eq(bzKontrollen.geraetId, id),
      eq(bzKontrollen.batterieGewechselt, true),
    ))
    .all();
  const wer = quelleAufloeser(db);
  return {
    geraet: g, lagerortName: lagerortStandort.name, lagerortStandort,
    faelligkeit: bzFaelligkeit(letzte ? letzte.ts : null, now),
    beachtung: bzBeachtung(g),
    akku: akkuLebensdauer(batterieWechsel.map((k) => k.ts)),
    logbuch: sichtbareRows.slice(0, BZ_LOGBUCH_GRENZE).map((k) => toZeile(k, wer)),
    logbuchMehrVorhanden: sichtbareRows.length > BZ_LOGBUCH_GRENZE,
  };
}

/** BYTE-EXAKTE Suche — Barcodes werden nicht normalisiert, nicht getrimmt, nicht
 *  grossgeschrieben (Teil 1, T7). */
export function bzGeraetByBarcode(db: Leser, barcode: string): { id: string } | null {
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.barcode, barcode)).get();
  return g ? { id: g.id } : null;
}

export function bzLogbuchGesamt(db: DB, grenze: number = BZ_LOGBUCH_GRENZE) {
  const namen = new Map(db.select().from(bzGeraete).all().map((g) => [g.id, g.name]));
  const wer = quelleAufloeser(db);
  const rows = db.select().from(bzKontrollen)
    .orderBy(desc(bzKontrollen.ts), desc(bzKontrollen.id))
    .limit(grenze + 1)
    .all();
  return {
    mehrVorhanden: rows.length > grenze,
    zeilen: rows.slice(0, grenze).map((k) => ({
      ...toZeile(k, wer), geraetName: namen.get(k.geraetId) ?? "–",
    })),
  };
}

/**
 * Ø Akku-Lebensdauer ueber ALLE Geraete.
 *
 * ⚠️ NUR GERAETEINTERNE Intervalle (`src/db/bz.ts:137-161`). Ein
 * `akkuLebensdauer(alleTs)` ueber alle Geraete auf einmal waere die naheliegende
 * Vereinfachung und FALSCH: es entstuende ein Intervall zwischen dem letzten
 * Wechsel des einen und dem ersten des anderen Geraets.
 *
 * ⚠️ DIE RECHNUNG SELBST STEHT NICHT HIER. Sortieren, Differenzen bilden und
 * durch 86_400_000 teilen ist Zeile fuer Zeile `domain/bz.ts#akkuLebensdauer` —
 * ein zweiter Rechenweg fuer dieselbe Zahl. Genau diese Regel stellt
 * `lesepfade/bestand.ts:30-31` fuer die Aggregate auf („die reinen Funktionen
 * bleiben die Spezifikation, jedes Aggregat schuldet einen Differenztest gegen
 * sie"); sie gilt hier genauso. Diese Funktion ruft die Domaenenfunktion JE
 * GERAET und poolt nur noch — aendert sich die Domaenenregel, wandert die
 * Gesamt-KPI mit, statt still auseinanderzulaufen.
 *
 * ⚠️ GEPOOLT WIRD UEBER DIE INTERVALLE, NICHT UEBER DIE GERAETE-MITTEL. Ein
 * Mittel der Geraete-Mittel gewichtete ein Geraet mit einem Intervall genauso
 * schwer wie eines mit zwanzig; `summe` wird deshalb aus
 * `tageDurchschnitt · anzahlIntervalle` zurueckgewonnen.
 */
export function bzAkkuKennzahlGesamt(db: Leser): BzAkkuKennzahl {
  const ks = db.select().from(bzKontrollen)
    .where(eq(bzKontrollen.batterieGewechselt, true)).all();
  const proGeraet = new Map<string, Date[]>();
  for (const k of ks) {
    const arr = proGeraet.get(k.geraetId) ?? [];
    arr.push(k.ts);
    proGeraet.set(k.geraetId, arr);
  }
  let summe = 0;
  let anzahlIntervalle = 0;
  let anzahlWechsel = 0;
  for (const ts of proGeraet.values()) {
    const je = akkuLebensdauer(ts);
    anzahlWechsel += je.anzahlWechsel;
    anzahlIntervalle += je.anzahlIntervalle;
    if (je.tageDurchschnitt !== null) summe += je.tageDurchschnitt * je.anzahlIntervalle;
  }
  return {
    tageDurchschnitt: anzahlIntervalle < 1 ? null : summe / anzahlIntervalle,
    anzahlWechsel, anzahlIntervalle,
  };
}
