/**
 * Die gespeicherte Verbindung zu HiOrg-Server und der Weg zu einem gültigen Access-Token.
 *
 * Gespeichert wird NUR das Refresh-Token, verschlüsselt (`tresor.ts`). Das Access-Token lebt im
 * Speicher des Prozesses und höchstens bis kurz vor seinem Ablauf; nach einem Neustart holt der erste
 * Abgleich ein neues. Erneuerungen laufen nacheinander (`laufend`): HiOrg kann bei jeder Erneuerung
 * ein neues Refresh-Token ausgeben und das alte entwerten — zwei gleichzeitige Erneuerungen mit
 * demselben Token verlören sonst die Verbindung.
 */
import { and, eq, lt } from "drizzle-orm";
import type { HelferDb } from "../../_db/client";
import { anmeldevorgang, hiorgVerbindung } from "../../_db/schema";
import { erneuere, HiorgFehler, type Abruf } from "./api";
import type { HiorgKonfiguration } from "./konfiguration";
import { entschluessele, schluesselAusUmgebung, verschluessele } from "./tresor";

export interface Verbindungsstand {
  kontoName: string;
  verbundenVon: string;
  verbundenAm: Date;
  erneuertAm: Date;
}

const VORGANG_MINUTEN = 10;
const g = globalThis as unknown as { __helferToken?: { token: string; bis: number } | null; __helferErneuerung?: Promise<string> | null };

export function verbindungsstand(db: HelferDb): Verbindungsstand | null {
  const v = db.select().from(hiorgVerbindung).where(eq(hiorgVerbindung.id, 1)).get();
  return v ? { kontoName: v.kontoName, verbundenVon: v.verbundenVon, verbundenAm: v.verbundenAm, erneuertAm: v.erneuertAm } : null;
}

function schluessel(): Buffer {
  const s = schluesselAusUmgebung();
  if (s.status !== "ok") throw new HiorgFehler("HELFER_SCHLUESSEL ist nicht gesetzt; die Verbindung lässt sich nicht öffnen.", "anmeldung");
  return s.schluessel;
}

export function legeVorgangAn(db: HelferDb, v: { state: string; verifier: string; sub: string }, jetzt = new Date()): void {
  db.delete(anmeldevorgang).where(lt(anmeldevorgang.ablauf, jetzt)).run();
  db.insert(anmeldevorgang).values({ ...v, ablauf: new Date(jetzt.getTime() + VORGANG_MINUTEN * 60_000) }).run();
}

/** Löst einen Vorgang genau einmal ein — nur für dieselbe Person und nur vor Ablauf. */
export function loeseVorgangEin(db: HelferDb, state: string, sub: string, jetzt = new Date()): string | null {
  const v = db.delete(anmeldevorgang).where(and(eq(anmeldevorgang.state, state), eq(anmeldevorgang.sub, sub))).returning().get();
  return v && v.ablauf > jetzt ? v.verifier : null;
}

export function speichereVerbindung(
  db: HelferDb, v: { kontoName: string; verbundenVon: string; verbundenVonSub: string; refreshToken: string }, jetzt = new Date(),
): void {
  const werte = {
    kontoName: v.kontoName, verbundenVon: v.verbundenVon, verbundenVonSub: v.verbundenVonSub, verbundenAm: jetzt,
    refreshToken: verschluessele(v.refreshToken, schluessel()), erneuertAm: jetzt,
  };
  db.insert(hiorgVerbindung).values({ id: 1, ...werte }).onConflictDoUpdate({ target: hiorgVerbindung.id, set: werte }).run();
  g.__helferToken = null;
}

export function trenneVerbindung(db: HelferDb): void {
  db.delete(hiorgVerbindung).where(eq(hiorgVerbindung.id, 1)).run();
  g.__helferToken = null;
}

/** Merkt sich ein frisches Access-Token (z. B. direkt nach dem Verbinden), 30 s vor Ablauf verworfen. */
export function merkeAccessToken(token: string, laeuftAbIn: number, jetzt = Date.now()): void {
  g.__helferToken = { token, bis: jetzt + Math.max(0, laeuftAbIn - 30) * 1000 };
}

/**
 * Ein gültiges Access-Token, notfalls über das gespeicherte Refresh-Token. Weist HiOrg das
 * Refresh-Token zurück, wird die Verbindung gelöscht: sie ist dann ohnehin tot, und ein liegen
 * gebliebenes Geheimnis wäre nur noch Risiko.
 */
export async function accessToken(db: HelferDb, k: HiorgKonfiguration, abruf: Abruf, jetzt = Date.now()): Promise<string> {
  const gemerkt = g.__helferToken;
  if (gemerkt && gemerkt.bis > jetzt) return gemerkt.token;
  if (g.__helferErneuerung) return g.__helferErneuerung;
  g.__helferErneuerung = (async () => {
    const v = db.select().from(hiorgVerbindung).where(eq(hiorgVerbindung.id, 1)).get();
    if (!v) throw new HiorgFehler("Es besteht keine Verbindung zu HiOrg-Server.", "anmeldung");
    const s = schluessel();
    const refresh = entschluessele(v.refreshToken, s);
    if (refresh === null) throw new HiorgFehler("Das gespeicherte HiOrg-Token lässt sich mit HELFER_SCHLUESSEL nicht öffnen. Bitte neu verbinden.", "anmeldung");
    try {
      const t = await erneuere(k, abruf, refresh);
      if (t.refreshToken && t.refreshToken !== refresh) {
        db.update(hiorgVerbindung).set({ refreshToken: verschluessele(t.refreshToken, s), erneuertAm: new Date(jetzt) }).where(eq(hiorgVerbindung.id, 1)).run();
      } else {
        db.update(hiorgVerbindung).set({ erneuertAm: new Date(jetzt) }).where(eq(hiorgVerbindung.id, 1)).run();
      }
      merkeAccessToken(t.accessToken, t.laeuftAbIn, jetzt);
      return t.accessToken;
    } catch (e) {
      if (e instanceof HiorgFehler && e.art === "anmeldung") trenneVerbindung(db);
      throw e;
    }
  })();
  try {
    return await g.__helferErneuerung;
  } finally {
    g.__helferErneuerung = null;
  }
}
