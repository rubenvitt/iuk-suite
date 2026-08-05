/**
 * Geraete (medizin/objekt). Kein "use client", kein Icon-Import.
 *
 * DER CHIP KOMMT SERVERSEITIG MIT. `geraetFaelligChip` (T39) liefert reinen Text
 * plus Tonname; ihn erst in einer Client-Insel zu rufen hiesse, `DatumFaelligkeit`
 * durch den RSC-Payload zu schicken UND die Textregel zu duplizieren.
 *
 * ⚠️ BEI `typ = "objekt"` OHNE Ablaufdatum ist `chip` NULL (§5.10): das
 * Ablaufdatum ist dort optional, und ein grauer Chip an jedem Spineboard waere
 * Grundrauschen. Bei `medizin` gibt es IMMER einen — auch ohne Datum, dann grau.
 *
 * DIE TYP-TRENNUNG IST EINE SCHREIB-INVARIANTE (`geraete.ts:39-42` haelt
 * typ-fremde Felder auf null) — aber ein Altdatensatz kann beides tragen.
 * `geraetFaelligkeit` liest NUR das zum Typ passende Feld; diese Datei reicht
 * BEIDE Rohfelder durch, damit das Formular sie zeigen kann.
 *
 * ⚠️ NIMMT `Leser`, NICHT `DB` (Festlegung H11): dieser Pfad ruft
 * `quelleAufloeser` NICHT und kann deshalb auch innerhalb einer Transaktion
 * laufen.
 */
import { eq } from "drizzle-orm";
import { geraete, lagerorte } from "../../_db/schema";
import { geraetFaelligkeit, type DatumFaelligkeit, type GeraetTyp } from "../domain/geraet";
import { geraetFaelligChip, type FaelligChip } from "../format";
import type { Leser } from "./bestand";

export type GeraetZeile = {
  id: string; typ: GeraetTyp; name: string; barcode: string | null;
  lagerortId: string; lagerortName: string; anmerkung: string | null;
  mtkFaellig: string | null; beschreibung: string | null; ablaufdatum: string | null;
  aktiv: boolean;
  faelligkeit: DatumFaelligkeit;
  /** ⚠️ `null` bei typ='objekt' ohne Ablaufdatum — dann gibt es KEINEN Chip. */
  chip: FaelligChip | null;
};

function toZeile(
  g: typeof geraete.$inferSelect, lagerortName: string, now: Date,
): GeraetZeile {
  const f = geraetFaelligkeit(g, now);
  return {
    id: g.id, typ: g.typ, name: g.name, barcode: g.barcode,
    lagerortId: g.lagerortId, lagerortName, anmerkung: g.anmerkung,
    mtkFaellig: g.mtkFaellig, beschreibung: g.beschreibung, ablaufdatum: g.ablaufdatum,
    aktiv: g.aktiv, faelligkeit: f, chip: geraetFaelligChip(g.typ, f),
  };
}

export function geraeteUebersicht(db: Leser, now: Date = new Date()): GeraetZeile[] {
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  return db.select().from(geraete).all()
    .map((g) => toZeile(g, namen.get(g.lagerortId) ?? "–", now))
    .sort((a, b) =>
      Number(b.aktiv) - Number(a.aktiv) ||
      a.typ.localeCompare(b.typ) ||
      a.name.localeCompare(b.name));
}

/** Aktive Geraete an einem Standort — fuer den Fahrzeug-Check und die
 *  Fahrzeug-Detailseite. */
export function geraeteFuerLagerort(
  db: Leser, lagerortId: string, now: Date = new Date(),
): GeraetZeile[] {
  const name = db.select().from(lagerorte).where(eq(lagerorte.id, lagerortId)).get()?.name ?? "–";
  return db.select().from(geraete).where(eq(geraete.lagerortId, lagerortId)).all()
    .filter((g) => g.aktiv)
    .map((g) => toZeile(g, name, now))
    .sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

export type GeraetDetail = {
  geraet: typeof geraete.$inferSelect;
  lagerortName: string;
  faelligkeit: DatumFaelligkeit;
  chip: FaelligChip | null;
};

export function geraetById(
  db: Leser, id: string, now: Date = new Date(),
): GeraetDetail | null {
  const g = db.select().from(geraete).where(eq(geraete.id, id)).get();
  if (!g) return null;
  const lagerortName =
    db.select().from(lagerorte).where(eq(lagerorte.id, g.lagerortId)).get()?.name ?? "–";
  const f = geraetFaelligkeit(g, now);
  return { geraet: g, lagerortName, faelligkeit: f, chip: geraetFaelligChip(g.typ, f) };
}

/** BYTE-EXAKTE Suche — Barcodes stehen physisch am Geraet, oft
 *  herstellergedruckt, und werden nicht normalisiert (Teil 1, T7). */
export function geraetByBarcode(db: Leser, barcode: string): { id: string } | null {
  const g = db.select().from(geraete).where(eq(geraete.barcode, barcode)).get();
  return g ? { id: g.id } : null;
}
