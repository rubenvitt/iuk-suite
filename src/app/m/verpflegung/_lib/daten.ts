/**
 * Die Lesewege des Verpflegungslagers. Die Ampel wird hier gerechnet, nie gespeichert (`mhd.ts`). Kein
 * `"use client"`.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { VerpflegungDb } from "../_db/client";
import { artikel, buchung, charge, helferLink, lagerort } from "../_db/schema";
import { mhdStatus } from "./mhd";
import type { ArtikelDTO, BuchungDTO, ChargeDTO, ChargeSicht, LinkDTO, OrtDTO } from "./typen";

type Leser = Pick<VerpflegungDb, "select">;

export function ladeOrte(db: Leser, nurAktive = false): OrtDTO[] {
  const alle = db.select({ id: lagerort.id, name: lagerort.name, kurz: lagerort.kurz, gekuehlt: lagerort.gekuehlt, aktiv: lagerort.aktiv })
    .from(lagerort).orderBy(asc(lagerort.position), asc(lagerort.name)).all();
  return nurAktive ? alle.filter((o) => o.aktiv) : alle;
}

export function ladeArtikel(db: Leser): ArtikelDTO[] {
  return db.select({
    id: artikel.id, name: artikel.name, ean: artikel.ean, kategorie: artikel.kategorie, einheit: artikel.einheit,
    mhdArt: artikel.mhdArt, rotTage: artikel.rotTage, gelbTage: artikel.gelbTage, mindest: artikel.mindest,
    vorlaeufig: artikel.vorlaeufig, aktiv: artikel.aktiv,
  }).from(artikel).orderBy(asc(artikel.name)).all();
}

/** Alle Chargen mit Ampel, nach MHD (früheste zuerst). */
export function ladeChargen(db: Leser, heute: string, arts?: readonly ArtikelDTO[]): ChargeDTO[] {
  const je = new Map((arts ?? ladeArtikel(db)).map((a) => [a.id, a]));
  return db.select({ id: charge.id, artikelId: charge.artikelId, ortId: charge.ortId, mhd: charge.mhd, menge: charge.menge, eingang: charge.eingang })
    .from(charge).orderBy(asc(charge.mhd), asc(charge.eingang)).all()
    .flatMap((c) => {
      const a = je.get(c.artikelId);
      return a ? [{ ...c, status: mhdStatus(c.mhd, a, heute) }] : [];
    });
}

export function ladeBuchungen(db: Leser, grenze = 500): BuchungDTO[] {
  return db.select({
    id: buchung.id, zeit: buchung.zeit, art: buchung.art, artikelId: buchung.artikelId, artikelName: artikel.name,
    einheit: artikel.einheit, ortKurz: lagerort.kurz, mhd: buchung.mhd, menge: buchung.menge, wer: buchung.wer,
    grund: buchung.grund, ziel: buchung.ziel,
  }).from(buchung)
    .innerJoin(artikel, eq(artikel.id, buchung.artikelId))
    .innerJoin(lagerort, eq(lagerort.id, buchung.ortId))
    .orderBy(desc(buchung.zeit), desc(buchung.id)).limit(grenze).all();
}

export function ladeLinks(db: Leser): LinkDTO[] {
  return db.select({
    id: helferLink.id, name: helferLink.name, code: helferLink.code, gueltigBis: helferLink.gueltigBis, aktiv: helferLink.aktiv,
    angelegtAm: helferLink.angelegtAm, angelegtVon: helferLink.angelegtVon, zuletztAm: helferLink.zuletztAm,
  }).from(helferLink).orderBy(desc(helferLink.angelegtAm)).all();
}

export function ladeOrt(db: Leser, id: string): OrtDTO | null {
  return ladeOrte(db).find((o) => o.id === id) ?? null;
}

/** Bestand je Artikel ohne abgelaufene Ware (die zählt nicht mehr). */
export function bestandJeArtikel(chargen: readonly ChargeDTO[]): Map<string, number> {
  const aus = new Map<string, number>();
  for (const c of chargen) if (!c.status.abgelaufen) aus.set(c.artikelId, (aus.get(c.artikelId) ?? 0) + c.menge);
  return aus;
}

/** Artikel mit Mindestbestand, deren gültiger Bestand darunter liegt. */
export function unterMindest(arts: readonly ArtikelDTO[], chargen: readonly ChargeDTO[]): ArtikelDTO[] {
  const bestand = bestandJeArtikel(chargen);
  return arts.filter((a) => a.aktiv && a.mindest !== null && (bestand.get(a.id) ?? 0) < a.mindest);
}

/** Chargen mit Artikel- und Ortsangaben, für die Listen der Verwaltung und das Telefon. */
export function ladeSicht(db: Leser, heute: string): { artikel: ArtikelDTO[]; orte: OrtDTO[]; chargen: ChargeSicht[] } {
  const arts = ladeArtikel(db);
  const orte = ladeOrte(db);
  const ja = new Map(arts.map((a) => [a.id, a]));
  const jo = new Map(orte.map((o) => [o.id, o]));
  const chargen = ladeChargen(db, heute, arts).map((c) => {
    const a = ja.get(c.artikelId)!;
    const o = jo.get(c.ortId);
    return { ...c, artikelName: a.name, einheit: a.einheit, mhdArt: a.mhdArt, kategorie: a.kategorie, ortName: o?.name ?? "", ortKurz: o?.kurz ?? "" };
  });
  return { artikel: arts, orte, chargen };
}
