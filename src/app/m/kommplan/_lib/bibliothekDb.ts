import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { KommplanDb } from "../_db/client";
import { bibEinheit, bibStelle, bibVerbindung } from "../_db/schema";
import { feldFehlerAus } from "./angaben";
import { BIB_GRENZE, bibEinheitSchema, bibImportSchema, bibLoeschSchema, bibStelleSchema, bibVerbindungSchema, bibVerbindungsImportSchema } from "./bibliothek/schema";
import { vergleichsform, type BibEinheit, type BibStelle, type BibVerbindung, type Bibliothek } from "./bibliothek/typen";
import type { BibEinheitErgebnis, BibStelleErgebnis, BibVerbindungErgebnis, EinfachErgebnis, ImportErgebnis, VerbindungsImportErgebnis } from "./ergebnis";
import { kontaktSchema, type VerbindungsArt } from "./plan/schema";

/**
 * BIBLIOTHEK IN DER DATENBANK (Spec §4.1, §4.3; Umsetzungsplan Phase 4, Entscheidungen 11, 12) — nur Server.
 * Jede ID wird hier aufgelöst (IDOR); Dubletten werden IN der Transaktion geprüft, in der geschrieben wird.
 * Auditiert über die Trigger der drei Tabellen (Migration 0000). Bei bis zu 2000 Einträgen je Bereich ist
 * „alle Namen lesen und vergleichen" billiger und klarer als eine Spalte mit Vergleichsform.
 */
export const EINTRAG_WEG = "Diesen Eintrag gibt es nicht mehr.";
const FELDER = "Bitte die markierten Felder prüfen.";
const nachDe = (a: string, b: string) => a.localeCompare(b, "de");
const SCHON = (name: string) => `„${name}“ steht schon in der Bibliothek.`;

function kontakteAus(roh: string): BibStelle["kontakte"] {
  try {
    const r = z.array(kontaktSchema).safeParse(JSON.parse(roh));
    return r.success ? r.data : [];
  } catch { return []; }
}

export function ladeBibliothek(db: Pick<KommplanDb, "select">): Bibliothek {
  return {
    stellen: db.select().from(bibStelle).all()
      .map((z): BibStelle => ({ id: z.id, titel: z.titel, zeichen: z.zeichen, leiter: z.leiter, kontakte: kontakteAus(z.kontakte), notiz: z.notiz }))
      .sort((a, b) => nachDe(a.titel, b.titel) || nachDe(a.id, b.id)),
    einheiten: db.select().from(bibEinheit).all()
      .map((z): BibEinheit => ({ id: z.id, typ: z.typ, rufname: z.rufname, zeichen: z.zeichen, notiz: z.notiz }))
      .sort((a, b) => nachDe(a.typ, b.typ) || nachDe(a.rufname, b.rufname)),
    verbindungen: db.select().from(bibVerbindung).all()
      .map((z): BibVerbindung => ({ id: z.id, art: z.art as VerbindungsArt, bezeichnung: z.bezeichnung, notiz: z.notiz }))
      .sort((a, b) => nachDe(a.bezeichnung, b.bezeichnung) || nachDe(a.art, b.art)),
  };
}

/** Anzahl der Zeilen — typisiert über Drizzle, damit es in der Transaktion (`tx`) genauso geht. */
const ANZAHL = { n: sql<number>`count(*)` };
const ZU_VIELE = (was: string) => `Höchstens ${BIB_GRENZE.eintraege} ${was} in der Bibliothek.`;

export function speichereBibStelle(db: KommplanDb, eingabe: unknown): BibStelleErgebnis {
  const r = bibStelleSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(r.error) };
  const e = r.data;
  return db.transaction((tx): BibStelleErgebnis => {
    const doppelt = tx.select({ id: bibStelle.id, titel: bibStelle.titel }).from(bibStelle).all()
      .find((x) => x.id !== e.id && vergleichsform(x.titel) === vergleichsform(e.titel));
    if (doppelt) return { ok: false, fehler: FELDER, feldFehler: { titel: SCHON(doppelt.titel) } };
    const werte = { titel: e.titel, zeichen: e.zeichen, leiter: e.leiter, kontakte: JSON.stringify(e.kontakte), notiz: e.notiz };
    if (e.id === null) {
      if (tx.select(ANZAHL).from(bibStelle).get()!.n >= BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Stellen") };
      const id = randomUUID();
      tx.insert(bibStelle).values({ id, ...werte }).run();
      return { ok: true, eintrag: { ...e, id } };
    }
    const u = tx.update(bibStelle).set(werte).where(eq(bibStelle.id, e.id)).run();
    return u.changes === 1 ? { ok: true, eintrag: { ...e, id: e.id } } : { ok: false, fehler: EINTRAG_WEG };
  });
}

export function speichereBibEinheit(db: KommplanDb, eingabe: unknown): BibEinheitErgebnis {
  const r = bibEinheitSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(r.error) };
  const e = r.data;
  return db.transaction((tx): BibEinheitErgebnis => {
    const doppelt = tx.select({ id: bibEinheit.id, rufname: bibEinheit.rufname }).from(bibEinheit).all()
      .find((x) => x.id !== e.id && vergleichsform(x.rufname) === vergleichsform(e.rufname));
    if (doppelt) return { ok: false, fehler: FELDER, feldFehler: { rufname: SCHON(doppelt.rufname) } };
    const werte = { typ: e.typ, rufname: e.rufname, zeichen: e.zeichen, notiz: e.notiz };
    if (e.id === null) {
      if (tx.select(ANZAHL).from(bibEinheit).get()!.n >= BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Einheiten") };
      const id = randomUUID();
      tx.insert(bibEinheit).values({ id, ...werte }).run();
      return { ok: true, eintrag: { ...werte, id } };
    }
    const u = tx.update(bibEinheit).set(werte).where(eq(bibEinheit.id, e.id)).run();
    return u.changes === 1 ? { ok: true, eintrag: { ...werte, id: e.id } } : { ok: false, fehler: EINTRAG_WEG };
  });
}

export function speichereBibVerbindung(db: KommplanDb, eingabe: unknown): BibVerbindungErgebnis {
  const r = bibVerbindungSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(r.error) };
  const e = r.data;
  return db.transaction((tx): BibVerbindungErgebnis => {
    const doppelt = tx.select().from(bibVerbindung).all()
      .find((x) => x.id !== e.id && x.art === e.art && vergleichsform(x.bezeichnung) === vergleichsform(e.bezeichnung));
    if (doppelt) return { ok: false, fehler: FELDER, feldFehler: { bezeichnung: SCHON(doppelt.bezeichnung) } };
    const werte = { art: e.art, bezeichnung: e.bezeichnung, notiz: e.notiz };
    if (e.id === null) {
      if (tx.select(ANZAHL).from(bibVerbindung).get()!.n >= BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Verbindungen") };
      const id = randomUUID();
      tx.insert(bibVerbindung).values({ id, ...werte }).run();
      return { ok: true, eintrag: { ...werte, id } };
    }
    const u = tx.update(bibVerbindung).set(werte).where(eq(bibVerbindung.id, e.id)).run();
    return u.changes === 1 ? { ok: true, eintrag: { ...werte, id: e.id } } : { ok: false, fehler: EINTRAG_WEG };
  });
}

export function loescheBibEintrag(db: KommplanDb, eingabe: unknown): EinfachErgebnis {
  const r = bibLoeschSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: "Ungültige Anfrage." };
  const tabelle = { stelle: bibStelle, einheit: bibEinheit, verbindung: bibVerbindung }[r.data.art];
  const d = db.delete(tabelle).where(eq(tabelle.id, r.data.id)).run();
  return d.changes === 1 ? { ok: true } : { ok: false, fehler: EINTRAG_WEG };
}

function importFehler(fehler: z.ZodError): { ok: false; fehler: string } {
  const i = fehler.issues[0];
  const zeile = typeof i?.path[0] === "number" ? `Zeile ${i.path[0] + 1}: ` : "";
  return { ok: false, fehler: `${zeile}${i?.message ?? "Ungültige Liste."}` };
}

export function importiereBibEinheiten(db: KommplanDb, eingabe: unknown): ImportErgebnis {
  const r = bibImportSchema.safeParse(eingabe);
  if (!r.success) return importFehler(r.error);
  return db.transaction((tx): ImportErgebnis => {
    const bekannt = new Set(tx.select({ r: bibEinheit.rufname }).from(bibEinheit).all().map((x) => vergleichsform(x.r)));
    const vorher = bekannt.size;
    const neu = r.data.filter((z) => { const k = vergleichsform(z.rufname); if (bekannt.has(k)) return false; bekannt.add(k); return true; });
    if (vorher + neu.length > BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Einheiten") };
    const eintraege = neu.map((z): BibEinheit => ({ id: randomUUID(), typ: z.typ, rufname: z.rufname, zeichen: z.zeichen ?? null, notiz: z.notiz }));
    for (const e of eintraege) tx.insert(bibEinheit).values(e).run();
    return { ok: true, angelegt: neu.length, uebersprungen: r.data.length - neu.length, eintraege };
  });
}

/** „Verbindungen in Bibliothek übernehmen" (Entscheidung 13): alle Verbindungen eines Plans in EINEM Aufruf. */
export function importiereBibVerbindungen(db: KommplanDb, eingabe: unknown): VerbindungsImportErgebnis {
  const r = bibVerbindungsImportSchema.safeParse(eingabe);
  if (!r.success) return importFehler(r.error);
  return db.transaction((tx): VerbindungsImportErgebnis => {
    const schluessel = (art: string, bezeichnung: string) => `${art}\u0000${vergleichsform(bezeichnung)}`;
    const bekannt = new Set(tx.select().from(bibVerbindung).all().map((x) => schluessel(x.art, x.bezeichnung)));
    const vorher = bekannt.size;
    const neu = r.data.filter((v) => { const k = schluessel(v.art, v.bezeichnung); if (bekannt.has(k)) return false; bekannt.add(k); return true; });
    if (vorher + neu.length > BIB_GRENZE.eintraege) return { ok: false, fehler: ZU_VIELE("Verbindungen") };
    const eintraege = neu.map((v): BibVerbindung => ({ id: randomUUID(), art: v.art, bezeichnung: v.bezeichnung, notiz: null }));
    for (const e of eintraege) tx.insert(bibVerbindung).values(e).run();
    return { ok: true, angelegt: neu.length, uebersprungen: r.data.length - neu.length, eintraege };
  });
}
