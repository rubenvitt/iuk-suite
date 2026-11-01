/**
 * Lesen und Schreiben der Planungen. Jede Funktion bekommt die Planungskennung und prüft, dass das
 * Objekt (Einheit, Schicht, temporärer Helfer) zu GENAU dieser Planung gehört — nie einer Kennung aus
 * der Anfrage glauben (IDOR, CLAUDE.md „Zugriffsschutz“). Die Prüfregeln (`pruefung.ts`) blockieren
 * nichts; hier wird nur abgelehnt, was die Daten kaputt machen würde.
 */
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { SchichtplanDb, SchichtplanSchreiber } from "../_db/client";
import { einheit, planung, schicht, tempHelfer, zuordnung } from "../_db/schema";
import type { EinheitEingabe, PlanungEingabe, SchichtZeitEingabe, TempHelferEingabe } from "./eingabe";
import type { Anforderung, EinheitDTO, HelferQuelle, PlanungDTO, Quali, SchichtDTO, TempHelferDTO } from "./typen";
import { MINUTE } from "./typen";

export class NichtGefunden extends Error {
  constructor(was = "Diese Planung gibt es nicht mehr.") {
    super(was);
  }
}

/** Ein Wert, den die Planung nicht aufnehmen kann (Zeit außerhalb des Zeitraums, Person unbekannt). */
export class Abgelehnt extends Error {}

function json<T>(roh: string, ersatz: T): T {
  try {
    return JSON.parse(roh) as T;
  } catch {
    return ersatz;
  }
}

type Db = SchichtplanSchreiber;

function planungsZeile(db: Db, planId: string) {
  const p = db.select().from(planung).where(eq(planung.id, planId)).get();
  if (!p) throw new NichtGefunden();
  return p;
}

function einheitIn(db: Db, planId: string, einheitId: string) {
  const e = db.select().from(einheit).where(and(eq(einheit.id, einheitId), eq(einheit.planungId, planId))).get();
  if (!e) throw new NichtGefunden("Diesen Abschnitt bzw. dieses Fahrzeug gibt es in der Planung nicht mehr.");
  return e;
}

function schichtIn(db: Db, planId: string, schichtId: string) {
  const s = db.select({ id: schicht.id, einheitId: schicht.einheitId, von: schicht.von, bis: schicht.bis })
    .from(schicht).innerJoin(einheit, eq(einheit.id, schicht.einheitId))
    .where(and(eq(schicht.id, schichtId), eq(einheit.planungId, planId))).get();
  if (!s) throw new NichtGefunden("Diese Schicht gibt es nicht mehr.");
  return s;
}

function tempIn(db: Db, planId: string, id: string) {
  const t = db.select().from(tempHelfer).where(and(eq(tempHelfer.id, id), eq(tempHelfer.planungId, planId))).get();
  if (!t) throw new NichtGefunden("Diese Person gibt es in der Planung nicht mehr.");
  return t;
}

const beruehrt = (db: Db, planId: string, jetzt = Date.now()) =>
  db.update(planung).set({ aktualisiertAm: jetzt }).where(eq(planung.id, planId)).run();

function imZeitraum(p: { von: number; bis: number }, s: { von: number; bis: number }) {
  if (s.von < p.von || s.bis > p.bis) throw new Abgelehnt("Die Schicht liegt außerhalb des Planungszeitraums.");
}

/** Schichten fester Länge über den ganzen Zeitraum; die letzte endet mit dem Zeitraum. */
export function teileAuf(von: number, bis: number, schichtMin: number): { von: number; bis: number }[] {
  const schritt = schichtMin * MINUTE;
  const out: { von: number; bis: number }[] = [];
  for (let t = von; t < bis; t += schritt) out.push({ von: t, bis: Math.min(t + schritt, bis) });
  return out;
}

function legeSchichtenAn(db: Db, einheitId: string, p: { von: number; bis: number }, schichtMin: number) {
  const zeilen = teileAuf(p.von, p.bis, schichtMin).map((s) => ({ id: nanoid(), einheitId, ...s }));
  if (zeilen.length > 0) db.insert(schicht).values(zeilen).run();
}

// ── Lesen ──────────────────────────────────────────────────────────────────

export function ladePlanung(db: SchichtplanDb, planId: string): PlanungDTO | null {
  const p = db.select().from(planung).where(eq(planung.id, planId)).get();
  if (!p) return null;
  const einheiten: EinheitDTO[] = db.select().from(einheit).where(eq(einheit.planungId, planId)).orderBy(asc(einheit.position)).all()
    .map((e) => ({
      id: e.id, art: e.art, name: e.name, fahrzeugId: e.fahrzeugId, kenner: e.kenner, schichtMin: e.schichtMin, soll: e.soll,
      anforderungen: json<Anforderung[]>(e.anforderungen, []), position: e.position,
    }));
  const ids = einheiten.map((e) => e.id);
  const schichten: SchichtDTO[] = ids.length === 0 ? [] : db.select().from(schicht).where(inArray(schicht.einheitId, ids)).orderBy(asc(schicht.von)).all();
  const sids = schichten.map((s) => s.id);
  const zuordnungen = sids.length === 0 ? [] : db.select().from(zuordnung).where(inArray(zuordnung.schichtId, sids)).all();
  const temporaere: TempHelferDTO[] = db.select().from(tempHelfer).where(eq(tempHelfer.planungId, planId)).all()
    .map((t) => ({ id: t.id, vorname: t.vorname, nachname: t.nachname, telefon: t.telefon, organisation: t.organisation, qualifikationen: json<Quali[]>(t.qualifikationen, []) }))
    .sort((a, b) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"));
  return {
    id: p.id, name: p.name, art: p.art, ort: p.ort, von: p.von, bis: p.bis, maxDienstMin: p.maxDienstMin, minRuheMin: p.minRuheMin,
    einheiten, schichten, zuordnungen, temporaere,
  };
}

/** Alle Planungen, jüngster Beginn zuerst. Für die Übersicht; eine Bereitschaft hat davon eine Handvoll. */
export function allePlanungen(db: SchichtplanDb): PlanungDTO[] {
  return db.select({ id: planung.id }).from(planung).all()
    .map((z) => ladePlanung(db, z.id))
    .filter((p): p is PlanungDTO => p !== null)
    .sort((a, b) => b.von - a.von);
}

// ── Planung ────────────────────────────────────────────────────────────────

/** Anlegen (`planId === null`) oder ändern. Ein kürzerer Zeitraum darf keine Schicht abschneiden. */
export function speicherePlanung(db: SchichtplanDb, planId: string | null, e: PlanungEingabe, jetzt = Date.now()): string {
  return db.transaction((tx) => {
    if (planId === null) {
      const id = nanoid();
      tx.insert(planung).values({ id, ...e, angelegtAm: jetzt, aktualisiertAm: jetzt }).run();
      return id;
    }
    planungsZeile(tx, planId);
    const ausserhalb = tx.select({ von: schicht.von, bis: schicht.bis }).from(schicht).innerJoin(einheit, eq(einheit.id, schicht.einheitId))
      .where(eq(einheit.planungId, planId)).all().some((s) => s.von < e.von || s.bis > e.bis);
    if (ausserhalb) throw new Abgelehnt("Einige Schichten liegen außerhalb des neuen Zeitraums. Bitte sie zuerst verschieben oder löschen.");
    tx.update(planung).set({ ...e, aktualisiertAm: jetzt }).where(eq(planung.id, planId)).run();
    return planId;
  });
}

export function loeschePlanung(db: SchichtplanDb, planId: string): void {
  if (db.delete(planung).where(eq(planung.id, planId)).run().changes === 0) throw new NichtGefunden();
}

// ── Einheiten ──────────────────────────────────────────────────────────────

/**
 * Anlegen legt Schichten über den ganzen Zeitraum an. Beim Ändern bleiben die Schichten, außer
 * `neuAufteilen` ist gesetzt — dann werden sie nach der neuen Länge neu geschnitten, und ihre
 * Einteilungen gehen verloren (die Oberfläche sagt das vorher).
 */
export function speichereEinheit(db: SchichtplanDb, planId: string, einheitId: string | null, e: EinheitEingabe): string {
  return db.transaction((tx) => {
    const p = planungsZeile(tx, planId);
    const werte = {
      art: e.art, name: e.name, fahrzeugId: e.art === "fahrzeug" ? e.fahrzeugId : null, kenner: e.kenner || null,
      schichtMin: e.schichtMin, soll: e.soll, anforderungen: JSON.stringify(e.anforderungen),
    };
    let id = einheitId;
    if (id === null) {
      id = nanoid();
      const letzte = tx.select({ m: max(einheit.position) }).from(einheit).where(eq(einheit.planungId, planId)).get()?.m ?? -1;
      tx.insert(einheit).values({ id, planungId: planId, position: letzte + 1, ...werte }).run();
      legeSchichtenAn(tx, id, p, e.schichtMin);
    } else {
      einheitIn(tx, planId, id);
      tx.update(einheit).set(werte).where(eq(einheit.id, id)).run();
      if (e.neuAufteilen) {
        tx.delete(schicht).where(eq(schicht.einheitId, id)).run();
        legeSchichtenAn(tx, id, p, e.schichtMin);
      }
    }
    beruehrt(tx, planId);
    return id;
  });
}

export function entferneEinheit(db: SchichtplanDb, planId: string, einheitId: string): void {
  db.transaction((tx) => {
    einheitIn(tx, planId, einheitId);
    tx.delete(einheit).where(eq(einheit.id, einheitId)).run();
    beruehrt(tx, planId);
  });
}

/** Eine Zeile nach oben (`-1`) oder unten (`1`). Am Rand passiert nichts. */
export function verschiebeEinheit(db: SchichtplanDb, planId: string, einheitId: string, richtung: -1 | 1): void {
  db.transaction((tx) => {
    einheitIn(tx, planId, einheitId);
    const reihe = tx.select({ id: einheit.id }).from(einheit).where(eq(einheit.planungId, planId)).orderBy(asc(einheit.position)).all().map((z) => z.id);
    const i = reihe.indexOf(einheitId);
    const j = i + richtung;
    if (j < 0 || j >= reihe.length) return;
    [reihe[i], reihe[j]] = [reihe[j], reihe[i]];
    reihe.forEach((id, position) => tx.update(einheit).set({ position }).where(eq(einheit.id, id)).run());
    beruehrt(tx, planId);
  });
}

// ── Schichten ──────────────────────────────────────────────────────────────

export function legeSchichtAn(db: SchichtplanDb, planId: string, einheitId: string, z: SchichtZeitEingabe): string {
  return db.transaction((tx) => {
    const p = planungsZeile(tx, planId);
    einheitIn(tx, planId, einheitId);
    imZeitraum(p, z);
    const id = nanoid();
    tx.insert(schicht).values({ id, einheitId, von: z.von, bis: z.bis }).run();
    beruehrt(tx, planId);
    return id;
  });
}

/** Neue Zeit, auf Wunsch in eine andere Einheit derselben Planung (Ziehen in eine andere Zeile). Einteilungen bleiben. */
export function setzeSchicht(db: SchichtplanDb, planId: string, schichtId: string, z: SchichtZeitEingabe, einheitId?: string): void {
  db.transaction((tx) => {
    const p = planungsZeile(tx, planId);
    const s = schichtIn(tx, planId, schichtId);
    if (einheitId && einheitId !== s.einheitId) einheitIn(tx, planId, einheitId);
    imZeitraum(p, z);
    tx.update(schicht).set({ von: z.von, bis: z.bis, einheitId: einheitId ?? s.einheitId }).where(eq(schicht.id, schichtId)).run();
    beruehrt(tx, planId);
  });
}

export function loescheSchicht(db: SchichtplanDb, planId: string, schichtId: string): void {
  db.transaction((tx) => {
    schichtIn(tx, planId, schichtId);
    tx.delete(schicht).where(eq(schicht.id, schichtId)).run();
    beruehrt(tx, planId);
  });
}

// ── Einteilung ─────────────────────────────────────────────────────────────

/**
 * Teilt eine Person einer Schicht zu; mit `ausSchichtId` wird sie umgesetzt (aus der alten Schicht
 * heraus). `stammIds` sind die Kennungen, die das Helfer-Modul gerade herausgibt — eine fremde oder
 * veraltete Kennung wird abgelehnt. Schon eingeteilt ist kein Fehler.
 */
export function teileZu(
  db: SchichtplanDb, planId: string, schichtId: string, quelle: HelferQuelle, helferId: string,
  stammIds: ReadonlySet<string>, ausSchichtId?: string,
): void {
  db.transaction((tx) => {
    schichtIn(tx, planId, schichtId);
    if (quelle === "temp") tempIn(tx, planId, helferId);
    else if (!stammIds.has(helferId)) throw new Abgelehnt("Diese Person steht nicht mehr in den Helferdaten.");
    if (ausSchichtId && ausSchichtId !== schichtId) {
      schichtIn(tx, planId, ausSchichtId);
      tx.delete(zuordnung).where(and(eq(zuordnung.schichtId, ausSchichtId), eq(zuordnung.quelle, quelle), eq(zuordnung.helferId, helferId))).run();
    }
    tx.insert(zuordnung).values({ schichtId, quelle, helferId }).onConflictDoNothing().run();
    beruehrt(tx, planId);
  });
}

export function tragAus(db: SchichtplanDb, planId: string, schichtId: string, quelle: HelferQuelle, helferId: string): void {
  db.transaction((tx) => {
    schichtIn(tx, planId, schichtId);
    tx.delete(zuordnung).where(and(eq(zuordnung.schichtId, schichtId), eq(zuordnung.quelle, quelle), eq(zuordnung.helferId, helferId))).run();
    beruehrt(tx, planId);
  });
}

// ── Temporäre Helfer ───────────────────────────────────────────────────────

export function speichereTempHelfer(db: SchichtplanDb, planId: string, id: string | null, e: TempHelferEingabe): string {
  return db.transaction((tx) => {
    planungsZeile(tx, planId);
    const werte = { vorname: e.vorname, nachname: e.nachname, telefon: e.telefon, organisation: e.organisation, qualifikationen: JSON.stringify(e.qualifikationen) };
    let tid = id;
    if (tid === null) {
      tid = nanoid();
      tx.insert(tempHelfer).values({ id: tid, planungId: planId, ...werte }).run();
    } else {
      tempIn(tx, planId, tid);
      tx.update(tempHelfer).set(werte).where(eq(tempHelfer.id, tid)).run();
    }
    beruehrt(tx, planId);
    return tid;
  });
}

/** Entfernt die Person und alle ihre Einteilungen in dieser Planung. */
export function loescheTempHelfer(db: SchichtplanDb, planId: string, id: string): void {
  db.transaction((tx) => {
    tempIn(tx, planId, id);
    const sids = tx.select({ id: schicht.id }).from(schicht).innerJoin(einheit, eq(einheit.id, schicht.einheitId))
      .where(eq(einheit.planungId, planId)).all().map((s) => s.id);
    if (sids.length > 0) tx.delete(zuordnung).where(and(eq(zuordnung.quelle, "temp"), eq(zuordnung.helferId, id), inArray(zuordnung.schichtId, sids))).run();
    tx.delete(tempHelfer).where(eq(tempHelfer.id, id)).run();
    beruehrt(tx, planId);
  });
}
