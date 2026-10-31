/**
 * MÄNGEL LESEN UND SCHREIBEN (IDA-298) — der eine Ort für die Tabelle `maengel`. Route, Verwaltung,
 * „Was steht an" und der Sofort-Push gehen alle hier durch.
 *
 * Kein `"use client"` (Falle 6).
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { lagerorte, maengel, newId } from "../../_db/schema";
import { ENTNAHMEBOX_ID, HANDLAGER_ID, type Einheitenart } from "../konstanten";
import type { Leser } from "../lesepfade/bestand";
import { ortsartAus, type Ortsart } from "./checkliste";

/** Ein Ort, an dem man einen Mangel melden kann. */
export interface MeldeOrt {
  id: string;
  /** So steht er auf dem Bildschirm: „Handlager · Schrank 3", „RTW 1 (DRK 1-83-1)". */
  anzeige: string;
  art: Ortsart;
}

type OrtRoh = {
  id: string; name: string; kennung: string | null; parentId: string | null;
  typ: "lager" | "fahrzeug"; einheitenart: Einheitenart | null; aktiv: boolean; sortierung: number;
};

function orteRoh(db: Leser): OrtRoh[] {
  return db.select({
    id: lagerorte.id, name: lagerorte.name, kennung: lagerorte.kennung, parentId: lagerorte.parentId,
    typ: lagerorte.typ, einheitenart: lagerorte.einheitenart, aktiv: lagerorte.aktiv, sortierung: lagerorte.sortierung,
  }).from(lagerorte).all();
}

function anzeigeFuer(o: OrtRoh, namen: ReadonlyMap<string, string>): string {
  const eltern = o.parentId ? namen.get(o.parentId) : undefined;
  const name = eltern ? `${eltern} · ${o.name}` : o.name;
  return o.typ === "fahrzeug" && o.kennung ? `${name} (${o.kennung})` : name;
}

function alsMeldeOrt(o: OrtRoh, namen: ReadonlyMap<string, string>): MeldeOrt {
  return { id: o.id, anzeige: anzeigeFuer(o, namen), art: ortsartAus(o) };
}

/**
 * Alle aktiven Orte zur Auswahl: Handlager und seine Schränke zuerst, dann Fahrzeuge und Taschen. Die
 * Entnahmebox fehlt — sie ist eine Kiste für Material, kein Ort mit Mängeln.
 */
export function meldeOrte(db: Leser): MeldeOrt[] {
  const roh = orteRoh(db).filter((o) => o.aktiv && o.id !== ENTNAHMEBOX_ID);
  const namen = new Map(roh.map((o) => [o.id, o.name]));
  const rang = (o: OrtRoh) => (o.id === HANDLAGER_ID ? 0 : o.typ === "lager" ? 1 : 2);
  return roh
    .sort((a, b) => rang(a) - rang(b) || a.sortierung - b.sortierung || a.name.localeCompare(b.name, "de"))
    .map((o) => alsMeldeOrt(o, namen));
}

/** Ein aktiver Ort für die Meldung — `null`, wenn es ihn nicht (mehr) gibt oder er stillgelegt ist. */
export function meldeOrt(db: Leser, id: string | null | undefined): MeldeOrt | null {
  if (!id) return null;
  return meldeOrte(db).find((o) => o.id === id) ?? null;
}

export interface NeuerMangel {
  lagerortId: string;
  punkte: string[];
  beschreibung: string | null;
  melderName: string | null;
  quelle: { quelleTyp: "token" | "oidc"; quelleId: string };
  fotos: number;
  jetzt: Date;
  /** Vorab vergeben, weil die Fotos unter dieser ID abgelegt werden, bevor die Zeile steht. */
  id?: string;
}

export function legeMangelAn(db: Leser, m: NeuerMangel): string {
  const id = m.id ?? newId();
  db.insert(maengel).values({
    id,
    lagerortId: m.lagerortId,
    punkte: m.punkte,
    beschreibung: m.beschreibung,
    melderName: m.melderName,
    quelleTyp: m.quelle.quelleTyp,
    quelleId: m.quelle.quelleId,
    fotos: m.fotos,
    createdAt: m.jetzt,
  }).run();
  return id;
}

export interface MangelZeile {
  id: string;
  ortId: string;
  ort: string;
  ortAktiv: boolean;
  punkte: string[];
  beschreibung: string | null;
  melderName: string | null;
  fotos: number;
  createdAt: Date;
  erledigtAt: Date | null;
  erledigtVermerk: string | null;
}

function zeilen(db: Leser, offen: boolean, grenze?: number): MangelZeile[] {
  const namen = new Map(orteRoh(db).map((o) => [o.id, o]));
  const namenKurz = new Map([...namen.values()].map((o) => [o.id, o.name]));
  const abfrage = db.select().from(maengel)
    .where(offen ? isNull(maengel.erledigtAt) : isNotNull(maengel.erledigtAt))
    .orderBy(offen ? asc(maengel.createdAt) : desc(maengel.erledigtAt), asc(maengel.id));
  const roh = grenze === undefined ? abfrage.all() : abfrage.limit(grenze).all();
  return roh.map((m) => {
    const o = namen.get(m.lagerortId);
    return {
      id: m.id,
      ortId: m.lagerortId,
      ort: o ? anzeigeFuer(o, namenKurz) : "Unbekannter Ort",
      ortAktiv: o?.aktiv ?? false,
      punkte: m.punkte,
      beschreibung: m.beschreibung,
      melderName: m.melderName,
      fotos: m.fotos,
      createdAt: m.createdAt,
      erledigtAt: m.erledigtAt,
      erledigtVermerk: m.erledigtVermerk,
    };
  });
}

/** Offene Mängel, älteste zuerst. */
export function offeneMaengel(db: Leser): MangelZeile[] {
  return zeilen(db, true);
}

/** Die zuletzt erledigten, neueste zuerst. */
export function erledigteMaengel(db: Leser, grenze = 20): MangelZeile[] {
  return zeilen(db, false, grenze);
}

export function mangel(db: Leser, id: string) {
  return db.select().from(maengel).where(eq(maengel.id, id)).get() ?? null;
}

/** `false`: gibt es nicht oder ist schon erledigt. */
export function erledigeMangel(db: Leser, id: string, von: string, vermerk: string | null, jetzt: Date): boolean {
  const r = db.update(maengel)
    .set({ erledigtAt: jetzt, erledigtVon: von, erledigtVermerk: vermerk })
    .where(and(eq(maengel.id, id), isNull(maengel.erledigtAt)))
    .run();
  return r.changes > 0;
}

/** `false`: gibt es nicht oder ist noch offen. */
export function oeffneMangelWieder(db: Leser, id: string): boolean {
  const r = db.update(maengel)
    .set({ erledigtAt: null, erledigtVon: null, erledigtVermerk: null })
    .where(and(eq(maengel.id, id), isNotNull(maengel.erledigtAt)))
    .run();
  return r.changes > 0;
}

/**
 * Für den Sofort-Push: offene Mängel ohne Vermerk, nicht älter als `seit`. Die Grenze verhindert, dass
 * ein später eingerichteter Push alte Meldungen auf einmal nachschickt.
 */
export function ungemeldeteMaengel(db: Leser, seit: Date): MangelZeile[] {
  const ids = new Set(db.select({ id: maengel.id }).from(maengel)
    .where(and(isNull(maengel.gemeldetAt), isNull(maengel.erledigtAt), gte(maengel.createdAt, seit)))
    .all().map((m) => m.id));
  return ids.size === 0 ? [] : offeneMaengel(db).filter((m) => ids.has(m.id));
}

export function vermerkeGemeldet(db: Leser, ids: readonly string[], jetzt: Date): void {
  if (ids.length === 0) return;
  db.update(maengel).set({ gemeldetAt: jetzt }).where(inArray(maengel.id, [...ids])).run();
}
