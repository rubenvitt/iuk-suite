/**
 * Die Schreibwege des Verpflegungslagers — rein über die Datenbank, ohne Sitzung, damit Verwaltung, Telefon und
 * Tests dieselben Regeln teilen. Die Rechte prüfen die Actions davor (`_actions/*`, `_lib/zugang.ts`). Eine
 * erwartbare Ablehnung ist `Abgelehnt` und wird am Bildschirm zum Satz.
 *
 * Jede Bestandsänderung schreibt im SELBEN Schritt eine Buchung; das Journal ist der Nachweis und wird nie geändert.
 */
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { neuerZugangscode } from "@/core/helferlink/code";
import type { VerpflegungDb } from "../_db/client";
import { artikel, buchung, charge, helferLink, lagerort, vermerk } from "../_db/schema";
import type { ArtikelEingabe, OrtEingabe } from "./eingabe";
import { mengePasst } from "./eingabe";
import { einheitText, mhdStatus, runde, tageBis, zahlText, type AussonderGrund } from "./mhd";

export class Abgelehnt extends Error {
  constructor(message: string, readonly feld?: string) {
    super(message);
  }
}

export const neueId = (): string => randomUUID();

export interface Wer {
  jetzt: number;
  heute: string;
  wer: string;
  linkId: string | null;
}

// ---------------------------------------------------------------- Artikel

function eanFrei(db: VerpflegungDb, ean: string | null, ausser?: string): void {
  if (!ean) return;
  const da = db.select({ id: artikel.id, name: artikel.name }).from(artikel).where(eq(artikel.ean, ean)).get();
  if (da && da.id !== ausser) throw new Abgelehnt(`Diesen Strichcode trägt schon „${da.name}“.`, "ean");
}

export function artikelAnlegen(db: VerpflegungDb, e: ArtikelEingabe, jetzt: number): string {
  eanFrei(db, e.ean);
  const id = neueId();
  db.insert(artikel).values({ id, ...e, vorlaeufig: false, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  return id;
}

/** Ändern bestätigt einen vorläufigen Artikel zugleich: die Verwaltung hat ihn angesehen. */
export function artikelAendern(db: VerpflegungDb, id: string, e: ArtikelEingabe, jetzt: number): void {
  const alt = db.select({ einheit: artikel.einheit }).from(artikel).where(eq(artikel.id, id)).get();
  if (!alt) throw new Abgelehnt("Diesen Artikel gibt es nicht mehr.");
  eanFrei(db, e.ean, id);
  // Gegen Buchungen geprüft, nicht gegen Chargen: das Journal zeigt die Einheit des Artikels, auch rückwirkend.
  if (alt.einheit !== e.einheit && db.select({ id: buchung.id }).from(buchung).where(eq(buchung.artikelId, id)).limit(1).get()) {
    throw new Abgelehnt("Die Einheit lässt sich nur ändern, solange nichts darauf gebucht ist.", "einheit");
  }
  db.update(artikel).set({ ...e, vorlaeufig: false, aktualisiertAm: jetzt }).where(eq(artikel.id, id)).run();
}

export function artikelAktiv(db: VerpflegungDb, id: string, aktiv: boolean, jetzt: number): void {
  if (!aktiv && db.select({ id: charge.id }).from(charge).where(eq(charge.artikelId, id)).limit(1).get()) {
    throw new Abgelehnt("Davon liegt noch etwas im Lager. Erst ausgeben oder aussondern.");
  }
  const r = db.update(artikel).set({ aktiv, aktualisiertAm: jetzt }).where(eq(artikel.id, id)).run();
  if (r.changes === 0) throw new Abgelehnt("Diesen Artikel gibt es nicht mehr.");
}

/**
 * Am Telefon: eine unbekannte Packung vorläufig anlegen (Entscheidung 2026-11-04 an IDA-316). Kategorie
 * „Sonstiges“, Ampel 7/30, MHD-Art „mhd“; die Verwaltung prüft und ergänzt.
 */
export function artikelVorlaeufig(db: VerpflegungDb, e: { name: string; ean: string; einheit: string; kategorie?: string | null }, jetzt: number): string {
  eanFrei(db, e.ean);
  const id = neueId();
  db.insert(artikel).values({
    id, name: e.name, ean: e.ean, einheit: e.einheit, kategorie: e.kategorie ?? "Sonstiges", mhdArt: "mhd", rotTage: 7, gelbTage: 30,
    mindest: null, vorlaeufig: true, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt,
  }).run();
  return id;
}

// ---------------------------------------------------------------- Lagerorte

export function ortAnlegen(db: VerpflegungDb, e: OrtEingabe, jetzt: number): string {
  const id = neueId();
  const position = db.select({ id: lagerort.id }).from(lagerort).all().length;
  db.insert(lagerort).values({ id, ...e, position, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
  return id;
}

export function ortAendern(db: VerpflegungDb, id: string, e: OrtEingabe, jetzt: number): void {
  const r = db.update(lagerort).set({ ...e, aktualisiertAm: jetzt }).where(eq(lagerort.id, id)).run();
  if (r.changes === 0) throw new Abgelehnt("Diesen Lagerort gibt es nicht mehr.");
}

export function ortAktiv(db: VerpflegungDb, id: string, aktiv: boolean, jetzt: number): void {
  if (!aktiv && db.select({ id: charge.id }).from(charge).where(eq(charge.ortId, id)).limit(1).get()) {
    throw new Abgelehnt("Hier liegt noch etwas. Erst ausgeben oder aussondern.");
  }
  const r = db.update(lagerort).set({ aktiv, aktualisiertAm: jetzt }).where(eq(lagerort.id, id)).run();
  if (r.changes === 0) throw new Abgelehnt("Diesen Lagerort gibt es nicht mehr.");
}

// ---------------------------------------------------------------- Helfer-Links

export function linkAnlegen(db: VerpflegungDb, e: { name: string; stunden: number }, jetzt: number, von: string): { id: string; code: string } {
  for (let versuch = 0; versuch < 5; versuch++) {
    const code = neuerZugangscode();
    if (db.select({ id: helferLink.id }).from(helferLink).where(eq(helferLink.code, code)).get()) continue;
    const id = neueId();
    db.insert(helferLink).values({ id, code, name: e.name, gueltigBis: jetzt + e.stunden * 3_600_000, aktiv: true, angelegtAm: jetzt, angelegtVon: von }).run();
    return { id, code };
  }
  throw new Abgelehnt("Es ließ sich kein freier Code ziehen. Bitte noch einmal versuchen.");
}

/** Sperren wirkt sofort: jeder Zugriff liest den Link (`_lib/helfer.ts`). Links werden nie gelöscht. */
export function linkSperren(db: VerpflegungDb, id: string): void {
  const r = db.update(helferLink).set({ aktiv: false }).where(eq(helferLink.id, id)).run();
  if (r.changes === 0) throw new Abgelehnt("Diesen Link gibt es nicht mehr.");
}

// ---------------------------------------------------------------- Bestand

function aktiverArtikel(db: Pick<VerpflegungDb, "select">, id: string) {
  const a = db.select().from(artikel).where(eq(artikel.id, id)).get();
  if (!a || !a.aktiv) throw new Abgelehnt("Diesen Artikel gibt es nicht mehr.");
  return a;
}

function pruefeMenge(m: number, einheit: string): void {
  if (!mengePasst(m, einheit)) throw new Abgelehnt(`${einheitText(2, einheit)} nur ganz.`, "menge");
}

/** Eingang: gleiche Ware, gleicher Ort, gleiches MHD wird zur selben Charge zusammengezählt. */
export function eingang(db: VerpflegungDb, e: { artikelId: string; ortId: string; mhd: string; menge: number }, w: Wer): { chargeId: string } {
  const menge = runde(e.menge);
  return db.transaction((tx) => {
    const a = aktiverArtikel(tx, e.artikelId);
    const o = tx.select({ aktiv: lagerort.aktiv }).from(lagerort).where(eq(lagerort.id, e.ortId)).get();
    if (!o || !o.aktiv) throw new Abgelehnt("Diesen Lagerort gibt es nicht mehr.");
    pruefeMenge(menge, a.einheit);
    if (menge <= 0) throw new Abgelehnt("Mindestens 0,001.", "menge");
    if (tageBis(e.mhd, w.heute) < 0) throw new Abgelehnt("Dieses Datum liegt in der Vergangenheit. Abgelaufene Ware nicht einbuchen.", "mhd");
    const da = tx.select({ id: charge.id, menge: charge.menge }).from(charge)
      .where(and(eq(charge.artikelId, e.artikelId), eq(charge.ortId, e.ortId), eq(charge.mhd, e.mhd))).get();
    let chargeId: string;
    if (da) {
      chargeId = da.id;
      tx.update(charge).set({ menge: runde(da.menge + menge), aktualisiertAm: w.jetzt }).where(eq(charge.id, da.id)).run();
    } else {
      chargeId = neueId();
      tx.insert(charge).values({ id: chargeId, artikelId: e.artikelId, ortId: e.ortId, mhd: e.mhd, menge, eingang: w.heute, angelegtAm: w.jetzt, aktualisiertAm: w.jetzt }).run();
    }
    tx.insert(buchung).values({ id: neueId(), zeit: w.jetzt, art: "eingang", artikelId: e.artikelId, ortId: e.ortId, mhd: e.mhd, menge, wer: w.wer, linkId: w.linkId }).run();
    return { chargeId };
  });
}

function abbuchen(
  db: VerpflegungDb, chargeId: string, roh: number, w: Wer, art: "ausgabe" | "aussonderung", extra: { grund?: string; ziel?: string },
): { name: string; einheit: string; mhd: string; menge: number } {
  // Einmal gerundet: Prüfung, Restbestand und Journal rechnen mit derselben Zahl.
  const menge = runde(roh);
  return db.transaction((tx) => {
    const c = tx.select().from(charge).where(eq(charge.id, chargeId)).get();
    if (!c) throw new Abgelehnt("Diese Packung ist nicht mehr im Bestand. Bitte neu laden.");
    const a = tx.select().from(artikel).where(eq(artikel.id, c.artikelId)).get();
    if (!a) throw new Abgelehnt("Diesen Artikel gibt es nicht mehr.");
    pruefeMenge(menge, a.einheit);
    if (menge <= 0) throw new Abgelehnt("Mindestens 0,001.", "menge");
    if (menge > c.menge + 1e-9) throw new Abgelehnt(`Es liegen nur ${zahlText(c.menge)} ${einheitText(c.menge, a.einheit)} da.`, "menge");
    if (art === "ausgabe" && mhdStatus(c.mhd, a, w.heute).gesperrt) {
      throw new Abgelehnt("Das Verbrauchsdatum ist überschritten. Diese Packung nicht ausgeben, sondern aussondern.");
    }
    const rest = runde(c.menge - menge);
    if (rest <= 0) tx.delete(charge).where(eq(charge.id, c.id)).run();
    else tx.update(charge).set({ menge: rest, aktualisiertAm: w.jetzt }).where(eq(charge.id, c.id)).run();
    tx.insert(buchung).values({
      id: neueId(), zeit: w.jetzt, art, artikelId: c.artikelId, ortId: c.ortId, mhd: c.mhd, menge, wer: w.wer, linkId: w.linkId,
      grund: extra.grund ?? null, ziel: extra.ziel ?? null,
    }).run();
    return { name: a.name, einheit: a.einheit, mhd: c.mhd, menge };
  });
}

export function ausgabe(db: VerpflegungDb, e: { chargeId: string; menge: number; ziel: string }, w: Wer) {
  return abbuchen(db, e.chargeId, e.menge, w, "ausgabe", { ziel: e.ziel });
}

export function aussondern(db: VerpflegungDb, e: { chargeId: string; menge: number; grund: AussonderGrund; freitext: string }, w: Wer) {
  const grund = e.grund === "Sonstiges" ? `Sonstiges: ${e.freitext}` : e.grund;
  return abbuchen(db, e.chargeId, e.menge, w, "aussonderung", { grund });
}

// ---------------------------------------------------------------- Vermerke

export function vermerkt(db: Pick<VerpflegungDb, "select">, ids: readonly string[]): Set<string> {
  if (ids.length === 0) return new Set();
  return new Set(db.select({ id: vermerk.id }).from(vermerk).where(inArray(vermerk.id, [...ids])).all().map((v) => v.id));
}

export function vermerke(db: VerpflegungDb, ids: readonly string[], jetzt: number): void {
  for (const id of ids) db.insert(vermerk).values({ id, am: jetzt }).onConflictDoNothing().run();
}
