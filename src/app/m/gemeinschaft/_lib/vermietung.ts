import { and, asc, count, eq, gt, lt } from "drizzle-orm";
import type { GemeinschaftDb, GemeinschaftSchreiber } from "../_db/client";
import { anfrage, sperrzeit, vertragsdatei, vorhaben } from "../_db/schema";
import { EVENT_PRAEFIX, harteKonflikte, sperrenAusEvents, ueberlappt, type BarEvent, type Eintrag, type Zeitraum } from "./belegung";
import { neueId, neuerLinkCode } from "./kennung";
import type { AnfrageWert, SperrzeitWert } from "./vermietungEingabe";
import { zeitraumText, type VertragStand } from "./vermietungText";
import { anfrageAlsEintrag, sperreAlsEintrag, type AnfrageDTO, type SperrzeitDTO, type StatusDTO } from "./vermietungTypen";

export type { AnfrageDTO, SperrzeitDTO, StatusDTO } from "./vermietungTypen";

/**
 * Die Datenbankseite der Vermietung (IDA-315). Jede Funktion nimmt die Datenbank als Argument — die Actions
 * reichen `getDb()`, die Tests eine In-Memory-DB (`testDb.ts`). Erwartbare Ablehnungen werfen `Abgelehnt` mit
 * einem Satz für die Oberfläche, eine unbekannte Kennung `NichtGefunden`. Heute gibt es nur einen Raum, die Bar.
 */

export const RAUM = "bar";

export class Abgelehnt extends Error {}
export class NichtGefunden extends Error {
  constructor() { super("Diesen Eintrag gibt es nicht mehr. Bitte die Seite neu laden."); }
}

/* ---------------- Lesen ---------------- */

export function ladeAnfragen(db: GemeinschaftSchreiber): AnfrageDTO[] {
  const zeilen = db.select({
    id: anfrage.id, status: anfrage.status, code: anfrage.code, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass,
    personen: anfrage.personen, person: anfrage.person, kontakt: anfrage.kontakt, hinweis: anfrage.hinweis, mitglied: anfrage.mitglied,
    begruendung: anfrage.begruendung, vertrag: anfrage.vertrag, eingegangenAm: anfrage.eingegangenAm, entschiedenAm: anfrage.entschiedenAm,
    dateiName: vertragsdatei.name, dateiGroesse: vertragsdatei.groesse, dateiAm: vertragsdatei.abgelegtAm,
  }).from(anfrage).leftJoin(vertragsdatei, eq(vertragsdatei.anfrageId, anfrage.id))
    .where(eq(anfrage.raum, RAUM)).orderBy(asc(anfrage.von)).all();
  return zeilen.map(({ dateiName, dateiGroesse, dateiAm, ...a }) => ({
    ...a, datei: dateiName !== null && dateiGroesse !== null && dateiAm !== null ? { name: dateiName, groesse: dateiGroesse, abgelegtAm: dateiAm } : null,
  }));
}

export function ladeSperrzeiten(db: GemeinschaftSchreiber): SperrzeitDTO[] {
  const eigene = db.select({ id: sperrzeit.id, von: sperrzeit.von, bis: sperrzeit.bis, grund: sperrzeit.grund })
    .from(sperrzeit).where(eq(sperrzeit.raum, RAUM)).all().map((s) => ({ ...s, eventId: null }));
  const ausEvents = sperrenAusEvents(ladeBarEvents(db)).map((e) => ({ id: e.id, von: e.von, bis: e.bis, grund: e.titel, eventId: e.eventId }));
  return [...eigene, ...ausEvents].sort((a, b) => a.von - b.von || a.bis - b.bis);
}

/** Events mit „Bar belegen“ (Tabelle des Bereichs Planung; nur gelesen). */
export function ladeBarEvents(db: GemeinschaftSchreiber): BarEvent[] {
  return db.select({ id: vorhaben.id, titel: vorhaben.titel, von: vorhaben.von, bis: vorhaben.bis }).from(vorhaben)
    .where(and(eq(vorhaben.art, "event"), eq(vorhaben.barBelegen, true))).all()
    .flatMap((v) => (v.von !== null && v.bis !== null ? [{ id: v.id, titel: v.titel, von: v.von, bis: v.bis }] : []));
}

/** Alle Einträge der Belegung: Anfragen in jedem Stand, Sperrzeiten, Sperrzeiten aus Events. */
export function ladeEintraege(db: GemeinschaftSchreiber): Eintrag[] {
  return [...ladeAnfragen(db).map(anfrageAlsEintrag), ...ladeSperrzeiten(db).map(sperreAlsEintrag)];
}

/** Nur was belegt (Zusagen, Sperrzeiten, Events) und nach `ab` endet — Grundlage der öffentlichen Sicht und der Kollisionsprüfung. */
export function ladeBelegendeEintraege(db: GemeinschaftSchreiber, ab = 0): Eintrag[] {
  const zusagen = db.select({ id: anfrage.id, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, status: anfrage.status }).from(anfrage)
    .where(and(eq(anfrage.raum, RAUM), eq(anfrage.status, "zugesagt"), gt(anfrage.bis, ab))).all().map(anfrageAlsEintrag);
  const sperren = ladeSperrzeiten(db).filter((s) => s.bis > ab).map(sperreAlsEintrag);
  return [...zusagen, ...sperren];
}

/** Die Statusseite: nur über den Code, nie über die Kennung (IDOR). */
export function anfrageNachCode(db: GemeinschaftSchreiber, code: string): StatusDTO | null {
  return db.select({
    status: anfrage.status, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, personen: anfrage.personen,
    person: anfrage.person, kontakt: anfrage.kontakt, begruendung: anfrage.begruendung,
  }).from(anfrage).where(eq(anfrage.code, code)).get() ?? null;
}

/** Wie viele Anfragen seit `ab` eingegangen sind — das Mengenbudget gegen Massenabsenden liegt in der Datenbank. */
export function anfragenSeit(db: GemeinschaftSchreiber, ab: number): number {
  return db.select({ n: count() }).from(anfrage).where(gt(anfrage.eingegangenAm, ab)).get()?.n ?? 0;
}

/* ---------------- Öffentlich schreiben ---------------- */

function kollisionsSatz(k: Eintrag): string {
  return `In diesem Zeitraum ist die Bar schon belegt (${zeitraumText(k.von, k.bis)}). Schau im Kalender, wann sie frei ist.`;
}

/** Legt eine Anfrage an, wenn der Zeitraum frei ist (Prüfung und Schreiben in einer Transaktion). Gibt den Code zurück. */
export function legeAnfrageAn(db: GemeinschaftDb, w: AnfrageWert, mitglied: boolean, jetzt: number): string {
  return db.transaction((tx) => {
    const [k] = harteKonflikte(w, ladeBelegendeEintraege(tx, w.von));
    if (k) throw new Abgelehnt(kollisionsSatz(k));
    const code = neuerLinkCode();
    tx.insert(anfrage).values({
      id: neueId(), raum: RAUM, status: "angefragt", code, von: w.von, bis: w.bis, anlass: w.anlass, personen: w.personen,
      person: w.person, kontakt: w.kontakt, hinweis: w.hinweis, mitglied, eingegangenAm: jetzt,
    }).run();
    return code;
  });
}

/** Die Person zieht ihre Anfrage zurück — offen oder zugesagt; danach ist die Bar für andere wieder frei. */
export function zieheZurueck(db: GemeinschaftDb, code: string, jetzt: number): void {
  db.transaction((tx) => {
    const a = tx.select({ id: anfrage.id, status: anfrage.status }).from(anfrage).where(eq(anfrage.code, code)).get();
    if (!a) throw new NichtGefunden();
    if (a.status !== "angefragt" && a.status !== "zugesagt") throw new Abgelehnt("Diese Anfrage ist schon abgeschlossen.");
    tx.update(anfrage).set({ status: "zurueckgezogen", entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
  });
}

/* ---------------- Leitung ---------------- */

function holeAnfrage(tx: GemeinschaftSchreiber, id: string) {
  const a = tx.select({ id: anfrage.id, status: anfrage.status, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass })
    .from(anfrage).where(and(eq(anfrage.id, id), eq(anfrage.raum, RAUM))).get();
  if (!a) throw new NichtGefunden();
  return a;
}

/**
 * Zusagen. Eine harte Überschneidung (Zusage, Sperrzeit, Event) blockiert; offene Anfragen im selben Zeitraum
 * nicht — ihre Zahl kommt zurück, damit die Leitung sie danach ablehnt.
 */
export function sageZu(db: GemeinschaftDb, id: string, jetzt: number): { weitereOffene: number } {
  return db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "angefragt") throw new Abgelehnt("Diese Anfrage ist nicht mehr offen.");
    const hart = harteKonflikte(a, ladeBelegendeEintraege(tx, a.von), a.id);
    if (hart.length) {
      throw new Abgelehnt(`Zusagen geht nicht: der Zeitraum ist schon belegt (${hart.map((x) => x.titel).join(", ")}). Lehne die Anfrage ab oder ändere zuerst die Sperrzeit.`);
    }
    tx.update(anfrage).set({ status: "zugesagt", begruendung: "", entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
    const offen = tx.select({ id: anfrage.id }).from(anfrage)
      .where(and(eq(anfrage.raum, RAUM), eq(anfrage.status, "angefragt"), lt(anfrage.von, a.bis), gt(anfrage.bis, a.von))).all();
    return { weitereOffene: offen.length };
  });
}

/** Ablehnen (offene Anfrage) mit Pflichtbegründung. */
export function lehneAb(db: GemeinschaftDb, id: string, begruendung: string, jetzt: number): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "angefragt") throw new Abgelehnt("Diese Anfrage ist nicht mehr offen.");
    tx.update(anfrage).set({ status: "abgelehnt", begruendung, entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
  });
}

/** Eine Zusage zurücknehmen, mit Begründung; die Person sieht sie als Absage auf ihrer Statusseite. */
export function nimmZusageZurueck(db: GemeinschaftDb, id: string, begruendung: string, jetzt: number): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Diese Anfrage ist nicht zugesagt.");
    tx.update(anfrage).set({ status: "abgelehnt", begruendung, entschiedenAm: jetzt }).where(eq(anfrage.id, a.id)).run();
  });
}

export function setzeVertrag(db: GemeinschaftDb, id: string, stand: VertragStand): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Einen Vertrag gibt es nur zu einer Zusage.");
    tx.update(anfrage).set({ vertrag: stand }).where(eq(anfrage.id, a.id)).run();
  });
}

/** Offene und zugesagte Anfragen, die eine geplante Sperrzeit treffen. */
export function getroffeneAnfragen(db: GemeinschaftSchreiber, z: Zeitraum): AnfrageDTO[] {
  return ladeAnfragen(db).filter((a) => (a.status === "angefragt" || a.status === "zugesagt") && ueberlappt(a, z));
}

/**
 * Eine Sperrzeit anlegen. Liegt eine Zusage im Zeitraum, geht es nicht — die Zusage muss zuerst mit Begründung
 * zurückgenommen werden, damit die Person Bescheid bekommt. Offene Anfragen blockieren nicht.
 */
export function legeSperrzeitAn(db: GemeinschaftDb, w: SperrzeitWert, jetzt: number): string {
  return db.transaction((tx) => {
    const zusage = getroffeneAnfragen(tx, w).find((a) => a.status === "zugesagt");
    if (zusage) throw new Abgelehnt(`Hier liegt schon eine Zusage („${zusage.anlass}“, ${zeitraumText(zusage.von, zusage.bis)}). Nimm sie zuerst zurück.`);
    const id = neueId();
    tx.insert(sperrzeit).values({ id, raum: RAUM, von: w.von, bis: w.bis, grund: w.grund, angelegtAm: jetzt }).run();
    return id;
  });
}

export function loescheSperrzeit(db: GemeinschaftDb, id: string): void {
  if (id.startsWith(EVENT_PRAEFIX)) throw new Abgelehnt("Diese Sperrzeit kommt aus einem Event. Ändern oder freigeben geht nur dort.");
  const r = db.delete(sperrzeit).where(and(eq(sperrzeit.id, id), eq(sperrzeit.raum, RAUM))).run();
  if (r.changes === 0) throw new NichtGefunden();
}

/* ---------------- Vertrag als PDF ---------------- */

/** Legt die PDF ab (ersetzt eine vorhandene). Steht der Vertrag noch auf „offen“, wird er „unterschrieben“ (POC). */
export function legeVertragAb(db: GemeinschaftDb, id: string, name: string, inhalt: Buffer, jetzt: number): void {
  db.transaction((tx) => {
    const a = holeAnfrage(tx, id);
    if (a.status !== "zugesagt") throw new Abgelehnt("Einen Vertrag gibt es nur zu einer Zusage.");
    const zeile = { anfrageId: a.id, name, groesse: inhalt.length, inhalt, abgelegtAm: jetzt };
    tx.insert(vertragsdatei).values(zeile).onConflictDoUpdate({ target: vertragsdatei.anfrageId, set: { name, groesse: inhalt.length, inhalt, abgelegtAm: jetzt } }).run();
    tx.update(anfrage).set({ vertrag: "unterschrieben" }).where(and(eq(anfrage.id, a.id), eq(anfrage.vertrag, "offen"))).run();
  });
}

export function ladeVertragsdatei(db: GemeinschaftSchreiber, id: string): { name: string; inhalt: Buffer } | null {
  return db.select({ name: vertragsdatei.name, inhalt: vertragsdatei.inhalt }).from(vertragsdatei).where(eq(vertragsdatei.anfrageId, id)).get() ?? null;
}

export function entferneVertrag(db: GemeinschaftDb, id: string): void {
  const r = db.delete(vertragsdatei).where(eq(vertragsdatei.anfrageId, id)).run();
  if (r.changes === 0) throw new NichtGefunden();
}

