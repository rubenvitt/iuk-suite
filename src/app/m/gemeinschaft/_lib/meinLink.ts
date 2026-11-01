import { and, asc, eq, gt, inArray, isNull, notInArray } from "drizzle-orm";
import type { GemeinschaftSchreiber } from "../_db/client";
import { aufgabe, mitglied, vorhaben, zustaendig } from "../_db/schema";
import { istLinkCode } from "./kennung";
import { nichtVergangen } from "./mitglieder";
import { plusTage, tagInZone, uhrInZone, wochentag } from "./zeit";

/**
 * Der persönliche Link eines Mitglieds (`/mein/<link>`, IDA-320). Wer den Link hat, ist für diese Seite das
 * Mitglied — es gibt kein Konto. Deshalb gilt hier und in `_actions/mein.ts`:
 *
 * - Das Mitglied kommt NUR über den Code aus der Datenbank (`mitgliedZuLink`), nie über eine Kennung aus dem Client.
 * - Eine Aufgabe ändert sich nur, wenn sie diesem Mitglied gehört (abhaken, wieder öffnen, abgeben) oder offen
 *   und ohne Zuständige ist („Ich mach’s“) — jeweils in einem nicht vergangenen Vorhaben, also genau das, was
 *   die Seite zeigt. Die Aufgabe-ID aus dem Client ist nur ein Wunsch; geprüft wird sie hier gegen die Datenbank.
 * - Die Seite zeigt keine Telefonnummern und keine Namen anderer Mitglieder.
 *
 * Kein `"use client"`: Seite, Actions und Vitest lesen diese Datei.
 */

export class AufgabeAbgelehnt extends Error {}

export interface LinkMitglied { id: string; name: string }

/** Das Mitglied zu einem Link-Code oder `null`. Die Form wird vor der Datenbank geprüft. */
export function mitgliedZuLink(db: GemeinschaftSchreiber, code: string): LinkMitglied | null {
  if (typeof code !== "string" || !istLinkCode(code)) return null;
  return db.select({ id: mitglied.id, name: mitglied.name }).from(mitglied).where(eq(mitglied.link, code)).get() ?? null;
}

export interface MeineAufgabe {
  id: string;
  titel: string;
  vorhaben: string;
  /** „fällig morgen“, „Sa, 28. Nov., 14:00 Uhr“ … oder leer. */
  wann: string | null;
  /** Ist der Tag schon da oder vorbei (überfällig, heute)? Text trägt die Aussage, das ist nur die Betonung. */
  dringend: boolean;
}

export interface MeinTermin {
  id: string;
  titel: string;
  monat: string;
  tag: string;
  wochentag: string;
  zeit: string;
  ort: string;
  dabei: boolean;
}

export interface MeineSeiteDaten {
  vorname: string;
  verantwortlich: string[];
  offen: MeineAufgabe[];
  erledigt: MeineAufgabe[];
  gebraucht: MeineAufgabe[];
  termine: MeinTermin[];
}

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const MONATE = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."] as const;

/** „Fr, 13. Nov.“ für einen Kalendertag `JJJJ-MM-TT` (reine Kalenderrechnung, keine Zone nötig). */
export function tagKurz(isoTag: string): string {
  const [, m, t] = isoTag.split("-").map(Number);
  return `${WOCHENTAGE[wochentag(isoTag)]}, ${t}. ${MONATE[m - 1]}`;
}

/** Fälligkeit relativ zu heute, wie im POC (`faelligText`). */
export function faelligText(faellig: string, heute: string): { text: string; dringend: boolean } {
  if (faellig < heute) {
    const [, m, t] = faellig.split("-").map(Number);
    return { text: `überfällig seit ${t}. ${MONATE[m - 1]}`, dringend: true };
  }
  if (faellig === heute) return { text: "fällig heute", dringend: true };
  if (faellig === plusTage(heute, 1)) return { text: "fällig morgen", dringend: false };
  return { text: `fällig ${tagKurz(faellig)}`, dringend: false };
}

/** Zeitraum eines Events: „19:00–22:00 Uhr“, über Mitternacht oder mehrere Tage mit dem Endtag. */
export function zeitraumText(von: number, bis: number): string {
  const vonTag = tagInZone(von), bisTag = tagInZone(bis);
  if (vonTag === bisTag) return `${uhrInZone(von)}–${uhrInZone(bis)} Uhr`;
  return `${uhrInZone(von)} Uhr bis ${tagKurz(bisTag)}, ${uhrInZone(bis)} Uhr`;
}

type Roh = { id: string; titel: string; faellig: string | null; erledigtAm: number | null; vTitel: string; vVon: number | null };

/** Sortierschlüssel: Fälligkeit, sonst Beginn des Events, sonst ans Ende. */
const schluessel = (a: Roh) => a.faellig ?? (a.vVon != null ? `${tagInZone(a.vVon)} ${uhrInZone(a.vVon)}` : "9999");

function alsAufgabe(a: Roh, heute: string): MeineAufgabe {
  if (a.faellig) {
    const f = faelligText(a.faellig, heute);
    return { id: a.id, titel: a.titel, vorhaben: a.vTitel, wann: f.text, dringend: f.dringend };
  }
  const wann = a.vVon != null ? `${tagKurz(tagInZone(a.vVon))}, ${uhrInZone(a.vVon)} Uhr` : null;
  return { id: a.id, titel: a.titel, vorhaben: a.vTitel, wann, dringend: false };
}

/** Alles, was die Seite `/mein/<link>` zeigt — für genau dieses Mitglied, ohne Daten anderer Mitglieder. */
export function meineSeite(db: GemeinschaftSchreiber, m: LinkMitglied, jetzt = Date.now()): MeineSeiteDaten {
  const heute = tagInZone(jetzt);
  const spalten = { id: aufgabe.id, titel: aufgabe.titel, faellig: aufgabe.faellig, erledigtAm: aufgabe.erledigtAm, vTitel: vorhaben.titel, vVon: vorhaben.von };
  const sortiert = (xs: Roh[]) => [...xs].sort((x, y) => (schluessel(x) < schluessel(y) ? -1 : schluessel(x) > schluessel(y) ? 1 : 0));

  const meine: Roh[] = db.select(spalten).from(zustaendig)
    .innerJoin(aufgabe, eq(aufgabe.id, zustaendig.aufgabeId))
    .innerJoin(vorhaben, eq(vorhaben.id, aufgabe.vorhabenId))
    .where(and(eq(zustaendig.mitgliedId, m.id), nichtVergangen(jetzt)))
    .orderBy(asc(aufgabe.position)).all();

  const vergeben = db.select({ id: zustaendig.aufgabeId }).from(zustaendig);
  const gebraucht: Roh[] = db.select(spalten).from(aufgabe)
    .innerJoin(vorhaben, eq(vorhaben.id, aufgabe.vorhabenId))
    .where(and(isNull(aufgabe.erledigtAm), nichtVergangen(jetzt), notInArray(aufgabe.id, vergeben)))
    .orderBy(asc(aufgabe.position)).all();

  const verantwortlich = db.select({ titel: vorhaben.titel }).from(vorhaben)
    .where(and(eq(vorhaben.verantwortlichId, m.id), nichtVergangen(jetzt)))
    .orderBy(asc(vorhaben.von), asc(vorhaben.titel)).all().map((v) => v.titel);

  const events = db.select({ id: vorhaben.id, titel: vorhaben.titel, von: vorhaben.von, bis: vorhaben.bis, ort: vorhaben.ort, wer: vorhaben.verantwortlichId })
    .from(vorhaben).where(and(eq(vorhaben.art, "event"), gt(vorhaben.bis, jetzt)))
    .orderBy(asc(vorhaben.von)).limit(5).all();
  const ichBeiEvent = new Set(events.length === 0 ? [] : db.select({ v: aufgabe.vorhabenId }).from(zustaendig)
    .innerJoin(aufgabe, eq(aufgabe.id, zustaendig.aufgabeId))
    .where(and(eq(zustaendig.mitgliedId, m.id), inArray(aufgabe.vorhabenId, events.map((e) => e.id))))
    .all().map((x) => x.v));

  return {
    vorname: m.name.trim().split(/\s+/)[0] ?? m.name,
    verantwortlich,
    offen: sortiert(meine.filter((a) => a.erledigtAm == null)).map((a) => alsAufgabe(a, heute)),
    erledigt: meine.filter((a) => a.erledigtAm != null).map((a) => alsAufgabe(a, heute)),
    gebraucht: sortiert(gebraucht).map((a) => alsAufgabe(a, heute)),
    termine: events.map((e) => {
      const tag = tagInZone(e.von!);
      const [, mo, t] = tag.split("-").map(Number);
      return {
        id: e.id, titel: e.titel, monat: MONATE[mo - 1], tag: String(t), wochentag: WOCHENTAGE[wochentag(tag)],
        zeit: zeitraumText(e.von!, e.bis!), ort: e.ort, dabei: e.wer === m.id || ichBeiEvent.has(e.id),
      };
    }),
  };
}

/* ---------------- Änderungen über den Link ---------------- */

const WEG = "Diese Aufgabe gibt es hier nicht mehr. Lade die Seite neu.";

/** Die Aufgabe, wenn sie in einem nicht vergangenen Vorhaben steht — sonst Ablehnung. */
function aktiveAufgabe(db: GemeinschaftSchreiber, aufgabeId: string, jetzt: number) {
  if (typeof aufgabeId !== "string" || aufgabeId.length > 64) throw new AufgabeAbgelehnt(WEG);
  const a = db.select({ id: aufgabe.id, erledigtAm: aufgabe.erledigtAm }).from(aufgabe)
    .innerJoin(vorhaben, eq(vorhaben.id, aufgabe.vorhabenId))
    .where(and(eq(aufgabe.id, aufgabeId), nichtVergangen(jetzt))).get();
  if (!a) throw new AufgabeAbgelehnt(WEG);
  return a;
}

function istZustaendig(db: GemeinschaftSchreiber, aufgabeId: string, mitgliedId: string): boolean {
  return !!db.select({ a: zustaendig.aufgabeId }).from(zustaendig)
    .where(and(eq(zustaendig.aufgabeId, aufgabeId), eq(zustaendig.mitgliedId, mitgliedId))).get();
}

/** Abhaken (`erledigt = true`) oder wieder öffnen — nur eine eigene Aufgabe. */
export function setzeErledigt(db: GemeinschaftSchreiber, mitgliedId: string, aufgabeId: string, erledigt: boolean, jetzt: number): void {
  const a = aktiveAufgabe(db, aufgabeId, jetzt);
  if (!istZustaendig(db, a.id, mitgliedId)) throw new AufgabeAbgelehnt(WEG);
  if (erledigt === (a.erledigtAm != null)) return;
  db.update(aufgabe).set({ erledigtAm: erledigt ? jetzt : null }).where(eq(aufgabe.id, a.id)).run();
}

/** „Schaffe ich doch nicht“: das Mitglied trägt sich aus einer eigenen, offenen Aufgabe aus. */
export function gebeAufgabeAb(db: GemeinschaftSchreiber, mitgliedId: string, aufgabeId: string, jetzt: number): void {
  const a = aktiveAufgabe(db, aufgabeId, jetzt);
  if (a.erledigtAm != null) throw new AufgabeAbgelehnt("Diese Aufgabe ist schon erledigt. Öffne sie zuerst wieder.");
  const r = db.delete(zustaendig).where(and(eq(zustaendig.aufgabeId, a.id), eq(zustaendig.mitgliedId, mitgliedId))).run();
  if (r.changes === 0) throw new AufgabeAbgelehnt(WEG);
}

/** „Ich mach’s“: nur für eine offene Aufgabe, für die noch niemand zuständig ist. */
export function uebernehmeAufgabe(db: GemeinschaftSchreiber, mitgliedId: string, aufgabeId: string, jetzt: number): void {
  const a = aktiveAufgabe(db, aufgabeId, jetzt);
  if (a.erledigtAm != null) throw new AufgabeAbgelehnt("Diese Aufgabe ist schon erledigt.");
  const schon = db.select({ m: zustaendig.mitgliedId }).from(zustaendig).where(eq(zustaendig.aufgabeId, a.id)).limit(1).get();
  if (schon) throw new AufgabeAbgelehnt("Da war schon jemand schneller. Danke trotzdem!");
  db.insert(zustaendig).values({ aufgabeId: a.id, mitgliedId }).run();
}
