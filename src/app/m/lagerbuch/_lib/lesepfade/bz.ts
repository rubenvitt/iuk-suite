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
 * ⚠️ NIMMT `DB`, NICHT `Leser` (Festlegung H11): dieser Pfad ruft
 * `quelleAufloeser(db: DB)` und laeuft nie in einer Transaktion. Wer ihn dorthin
 * ziehen will, muss `quelleAufloeser` in Teil 1 anfassen — das ist eine
 * Entscheidung, kein Cast.
 */
import { desc, eq } from "drizzle-orm";
import { bzGeraete, bzKontrollen, lagerorte } from "../../_db/schema";
import { quelleAufloeser } from "../../_db/quelle";
import { akkuLebensdauer, bzFaelligkeit,
         type BzAkkuKennzahl, type BzFaelligkeit } from "../domain/bz";
import { BZ_LOGBUCH_GRENZE } from "../grenzen";
import type { DB } from "../../_db/client";

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

export type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

/** Aktive Lagerorte als Auswahl fuer Geraete-Formulare. */
export function lagerortOptionen(db: DB): LagerortOption[] {
  return db.select().from(lagerorte).where(eq(lagerorte.aktiv, true)).all()
    .map((l) => ({ id: l.id, name: l.name, typ: l.typ }))
    .sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

export type BzGeraetZeile = {
  id: string; name: string; barcode: string | null; lagerortName: string; aktiv: boolean;
  letzteKontrolle: Date | null; letztesBestanden: boolean | null; faelligkeit: BzFaelligkeit;
};

export function bzGeraeteUebersicht(db: DB, now: Date = new Date()): BzGeraetZeile[] {
  const geraete = db.select().from(bzGeraete).all();
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const kontrollen = db.select().from(bzKontrollen).all();
  const letzteProGeraet = new Map<string, (typeof kontrollen)[number]>();
  for (const k of kontrollen) {
    const prev = letzteProGeraet.get(k.geraetId);
    if (!prev || k.ts > prev.ts) letzteProGeraet.set(k.geraetId, k);
  }
  return geraete
    .map((g) => {
      const letzte = letzteProGeraet.get(g.id) ?? null;
      return {
        id: g.id, name: g.name, barcode: g.barcode,
        lagerortName: namen.get(g.lagerortId) ?? "–", aktiv: g.aktiv,
        letzteKontrolle: letzte ? letzte.ts : null,
        letztesBestanden: letzte ? letzte.bestanden : null,
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
  faelligkeit: BzFaelligkeit;
  akku: BzAkkuKennzahl;
  /** chronologisch ABSTEIGEND */
  logbuch: BzKontrolleZeile[];
};

export function bzGeraetDetail(
  db: DB, id: string, now: Date = new Date(),
): BzGeraetDetail | null {
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get();
  if (!g) return null;
  const lagerortName =
    db.select().from(lagerorte).where(eq(lagerorte.id, g.lagerortId)).get()?.name ?? "–";
  const ks = db.select().from(bzKontrollen)
    .where(eq(bzKontrollen.geraetId, id))
    // id-Tiebreaker: `ts` sind UNIX-Sekunden (§5.14.4).
    .orderBy(desc(bzKontrollen.ts), desc(bzKontrollen.id))
    .all();
  const letzte = ks[0] ?? null;
  const wer = quelleAufloeser(db);
  return {
    geraet: g, lagerortName,
    faelligkeit: bzFaelligkeit(letzte ? letzte.ts : null, now),
    akku: akkuLebensdauer(ks.filter((k) => k.batterieGewechselt).map((k) => k.ts)),
    logbuch: ks.map((k) => toZeile(k, wer)),
  };
}

/** BYTE-EXAKTE Suche — Barcodes werden nicht normalisiert, nicht getrimmt, nicht
 *  grossgeschrieben (Teil 1, T7). */
export function bzGeraetByBarcode(db: DB, barcode: string): { id: string } | null {
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
 */
export function bzAkkuKennzahlGesamt(db: DB): BzAkkuKennzahl {
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
    const sorted = ts.slice().sort((a, b) => a.getTime() - b.getTime());
    anzahlWechsel += sorted.length;
    for (let i = 1; i < sorted.length; i++) {
      summe += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
      anzahlIntervalle += 1;
    }
  }
  return {
    tageDurchschnitt: anzahlIntervalle < 1 ? null : summe / anzahlIntervalle,
    anzahlWechsel, anzahlIntervalle,
  };
}
