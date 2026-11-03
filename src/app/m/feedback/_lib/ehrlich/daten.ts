import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { zeitFormat } from "@/core/zeit";
import * as schema from "../../_db/schema";
import {
  ehrlichKasten,
  ehrlichMitteilungen,
  ehrlichNachrichten,
  ehrlichNotizen,
  type EhrlichAntwortweg,
  type EhrlichMitteilungRow,
  type EhrlichStatus,
} from "../../_db/schema";
import { abholcodeHash, neuerAbholcode } from "./abholcode";
import { LOESCHFRIST_MONATE } from "./themen";

/**
 * DIE DATENSEITE VON „EHRLICH GESAGT" — alles, was die Tabellen liest und schreibt, an einer Stelle.
 * Server-only, kein `"use client"` (Falle 6). Die Riegel (`zugang.ts`) prüfen die Aufrufer, nicht diese Datei.
 */
export type EhrlichDb = BetterSQLite3Database<typeof schema>;

/** Kalendertag `JJJJ-MM-TT` in der Suite-Zone — je Aufruf, nie auf Modulebene eingefroren. */
export function tagVon(ms: number): string {
  return zeitFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

// ---- Kasten (ein Link für die ganze Bereitschaft) ----

function neuesSecret(): string {
  return randomBytes(9).toString("base64url");
}

/** Das Secret des öffentlichen Links; legt den Kasten beim ersten Aufruf an. */
export function kastenSecret(db: EhrlichDb, jetzt = new Date()): string {
  const da = db.select().from(ehrlichKasten).where(eq(ehrlichKasten.id, 1)).get();
  if (da) return da.secret;
  const secret = neuesSecret();
  db.insert(ehrlichKasten).values({ id: 1, secret, createdAt: jetzt }).onConflictDoNothing().run();
  return db.select().from(ehrlichKasten).where(eq(ehrlichKasten.id, 1)).get()!.secret;
}

/** Nur vergleichen, nie anlegen: ein anonymer Aufruf erzeugt keinen Kasten. */
export function istKastenSecret(db: EhrlichDb, secret: string): boolean {
  const da = db.select({ secret: ehrlichKasten.secret }).from(ehrlichKasten).where(eq(ehrlichKasten.id, 1)).get();
  return da !== undefined && secret.length > 0 && da.secret === secret;
}

export function erneuereKastenSecret(db: EhrlichDb): string {
  kastenSecret(db);
  const secret = neuesSecret();
  db.update(ehrlichKasten).set({ secret }).where(eq(ehrlichKasten.id, 1)).run();
  return secret;
}

// ---- Einwurf (öffentlich) ----

export type Einwurf = {
  thema: string | null;
  text: string;
  antwortweg: EhrlichAntwortweg;
  name: string | null;
  kontakt: string | null;
};

/**
 * Legt die Mitteilung an. Bewusst OHNE IP, Konto oder Zeitpunkt in der Signatur: was hier nicht hereinkommt,
 * kann nicht gespeichert werden (`einwurf.test.ts` prüft die geschriebene Zeile). Mit Antwortweg `code` kommt
 * der Klartext-Code genau einmal zurück — gespeichert wird nur sein Hash.
 */
export function legeMitteilungAn(db: EhrlichDb, e: Einwurf, tag: string, zufall?: (max: number) => number): { id: number; code: string | null } {
  for (let versuch = 0; versuch < 8; versuch += 1) {
    const code = e.antwortweg === "code" ? neuerAbholcode(zufall) : null;
    try {
      const zeile = db
        .insert(ehrlichMitteilungen)
        .values({
          tag,
          thema: e.thema,
          text: e.text,
          antwortweg: e.antwortweg,
          name: e.antwortweg === "name" ? e.name : null,
          kontakt: e.antwortweg === "name" ? e.kontakt : null,
          codeHash: code ? abholcodeHash(code) : null,
        })
        .returning({ id: ehrlichMitteilungen.id })
        .get();
      return { id: zeile.id, code };
    } catch (fehler) {
      // Nur eine Kollision des Codes (UNIQUE) wird neu gewürfelt; alles andere ist ein echter Fehler.
      if (!code || !String(fehler).includes("UNIQUE")) throw fehler;
    }
  }
  throw new Error("Kein freier Abholcode gefunden");
}

// ---- Abholen (öffentlich, nur über den Code) ----

export type Abholung = {
  tag: string;
  thema: string | null;
  text: string;
  status: EhrlichStatus;
  rueckfrageMoeglich: boolean;
  /** Ohne `autor`: unter dem Code steht nicht, wer geantwortet hat. */
  gespraech: { von: "vp" | "person"; text: string; tag: string }[];
};

function mitteilungZumCode(db: EhrlichDb, code: string): EhrlichMitteilungRow | undefined {
  return db.select().from(ehrlichMitteilungen).where(eq(ehrlichMitteilungen.codeHash, abholcodeHash(code))).get();
}

export function holeAbholung(db: EhrlichDb, code: string): Abholung | null {
  const m = mitteilungZumCode(db, code);
  if (!m) return null;
  const gespraech = db
    .select({ von: ehrlichNachrichten.von, text: ehrlichNachrichten.text, tag: ehrlichNachrichten.tag })
    .from(ehrlichNachrichten)
    .where(eq(ehrlichNachrichten.mitteilungId, m.id))
    .orderBy(asc(ehrlichNachrichten.id))
    .all();
  const letzte = gespraech.at(-1);
  return {
    tag: m.tag,
    thema: m.thema,
    text: m.text,
    status: m.status,
    rueckfrageMoeglich: m.rueckfrageErlaubt && letzte?.von === "vp",
    gespraech,
  };
}

/** Die Person schreibt unter ihrem Code zurück — nur, wenn freigeschaltet und die letzte Nachricht eine Antwort ist. */
export function schreibeZurueck(db: EhrlichDb, code: string, text: string, tag: string): boolean {
  const m = mitteilungZumCode(db, code);
  if (!m || !m.rueckfrageErlaubt) return false;
  const letzte = db
    .select({ von: ehrlichNachrichten.von })
    .from(ehrlichNachrichten)
    .where(eq(ehrlichNachrichten.mitteilungId, m.id))
    .orderBy(desc(ehrlichNachrichten.id))
    .get();
  if (letzte?.von !== "vp") return false;
  db.transaction((tx) => {
    tx.insert(ehrlichNachrichten).values({ mitteilungId: m.id, von: "person", text, tag }).run();
    if (m.status === "erledigt") {
      tx.update(ehrlichMitteilungen).set({ status: "bearbeitung", erledigtTag: null }).where(eq(ehrlichMitteilungen.id, m.id)).run();
    }
  });
  return true;
}

// ---- Verwaltung ----

export type ListenZeile = {
  id: number;
  tag: string;
  thema: string | null;
  auszug: string;
  status: EhrlichStatus;
  antwortweg: EhrlichAntwortweg;
  name: string | null;
  /** `rueckfrage`: die letzte Nachricht ist von der Person; `beantwortet`: von einer Vertrauensperson. */
  gespraech: "rueckfrage" | "beantwortet" | null;
};

export function listeMitteilungen(db: EhrlichDb): ListenZeile[] {
  const zeilen = db.select().from(ehrlichMitteilungen).orderBy(desc(ehrlichMitteilungen.tag), desc(ehrlichMitteilungen.id)).all();
  const letzte = new Map<number, "vp" | "person">();
  if (zeilen.length > 0) {
    for (const n of db
      .select({ m: ehrlichNachrichten.mitteilungId, von: ehrlichNachrichten.von })
      .from(ehrlichNachrichten)
      .where(inArray(ehrlichNachrichten.mitteilungId, zeilen.map((z) => z.id)))
      .orderBy(asc(ehrlichNachrichten.id))
      .all()) letzte.set(n.m, n.von);
  }
  return zeilen.map((z) => {
    const von = letzte.get(z.id);
    return {
      id: z.id,
      tag: z.tag,
      thema: z.thema,
      auszug: z.text.length > 220 ? `${z.text.slice(0, 220)}…` : z.text,
      status: z.status,
      antwortweg: z.antwortweg,
      name: z.name,
      gespraech: von === "person" ? "rueckfrage" : von === "vp" ? "beantwortet" : null,
    };
  });
}

/** Was in der Navigation als Zahl steht: neue Mitteilungen und offene Rückfragen. */
export function zuLesen(db: EhrlichDb): number {
  return listeMitteilungen(db).filter((z) => z.status === "neu" || z.gespraech === "rueckfrage").length;
}

export type Detail = {
  id: number;
  tag: string;
  thema: string | null;
  text: string;
  status: EhrlichStatus;
  antwortweg: EhrlichAntwortweg;
  name: string | null;
  kontakt: string | null;
  rueckfrageErlaubt: boolean;
  gespraech: { id: number; von: "vp" | "person"; autor: string | null; text: string; tag: string }[];
  notizen: { id: number; autor: string; text: string; tag: string; kontakt: boolean }[];
};

export function holeDetail(db: EhrlichDb, id: number): Detail | null {
  const m = db.select().from(ehrlichMitteilungen).where(eq(ehrlichMitteilungen.id, id)).get();
  if (!m) return null;
  const gespraech = db
    .select({ id: ehrlichNachrichten.id, von: ehrlichNachrichten.von, autor: ehrlichNachrichten.autor, text: ehrlichNachrichten.text, tag: ehrlichNachrichten.tag })
    .from(ehrlichNachrichten)
    .where(eq(ehrlichNachrichten.mitteilungId, id))
    .orderBy(asc(ehrlichNachrichten.id))
    .all();
  const notizen = db
    .select({ id: ehrlichNotizen.id, autor: ehrlichNotizen.autor, text: ehrlichNotizen.text, tag: ehrlichNotizen.tag, kontakt: ehrlichNotizen.kontakt })
    .from(ehrlichNotizen)
    .where(eq(ehrlichNotizen.mitteilungId, id))
    .orderBy(asc(ehrlichNotizen.id))
    .all();
  return {
    id: m.id,
    tag: m.tag,
    thema: m.thema,
    text: m.text,
    status: m.status,
    antwortweg: m.antwortweg,
    name: m.name,
    kontakt: m.kontakt,
    rueckfrageErlaubt: m.rueckfrageErlaubt,
    gespraech,
    notizen,
  };
}

function gibt(db: EhrlichDb, id: number): EhrlichMitteilungRow | undefined {
  return db.select().from(ehrlichMitteilungen).where(eq(ehrlichMitteilungen.id, id)).get();
}

export function setzeStatus(db: EhrlichDb, id: number, status: EhrlichStatus, tag: string): boolean {
  const m = gibt(db, id);
  if (!m) return false;
  if (m.status === status) return true;
  db.update(ehrlichMitteilungen)
    .set({ status, erledigtTag: status === "erledigt" ? tag : null })
    .where(eq(ehrlichMitteilungen.id, id))
    .run();
  return true;
}

/** Wer etwas tut, hat die Mitteilung gelesen: „Neu" rückt auf „In Bearbeitung". */
function mindestensInBearbeitung(db: Pick<EhrlichDb, "update">, m: EhrlichMitteilungRow): void {
  if (m.status === "neu") db.update(ehrlichMitteilungen).set({ status: "bearbeitung" }).where(eq(ehrlichMitteilungen.id, m.id)).run();
}

export function legeNotizAn(db: EhrlichDb, id: number, autor: string, text: string, tag: string, kontakt = false): boolean {
  const m = gibt(db, id);
  if (!m) return false;
  if (kontakt && (m.antwortweg !== "name" || db.select({ id: ehrlichNotizen.id }).from(ehrlichNotizen).where(and(eq(ehrlichNotizen.mitteilungId, id), eq(ehrlichNotizen.kontakt, true))).get())) return false;
  db.transaction((tx) => {
    tx.insert(ehrlichNotizen).values({ mitteilungId: id, autor, text, tag, kontakt }).run();
    mindestensInBearbeitung(tx, m);
  });
  return true;
}

export function gibAntwortFrei(db: EhrlichDb, id: number, autor: string, text: string, tag: string): boolean {
  const m = gibt(db, id);
  if (!m || m.antwortweg !== "code") return false;
  db.transaction((tx) => {
    // `gemeldet: true`: die eigene Antwort ist kein Anlass für einen Push an die Vertrauenspersonen.
    tx.insert(ehrlichNachrichten).values({ mitteilungId: id, von: "vp", autor, text, tag, gemeldet: true }).run();
    mindestensInBearbeitung(tx, m);
  });
  return true;
}

export function setzeRueckfrage(db: EhrlichDb, id: number, erlaubt: boolean): boolean {
  const m = gibt(db, id);
  if (!m || m.antwortweg !== "code") return false;
  db.update(ehrlichMitteilungen).set({ rueckfrageErlaubt: erlaubt }).where(eq(ehrlichMitteilungen.id, id)).run();
  return true;
}

export function loescheMitteilung(db: EhrlichDb, id: number): boolean {
  return db.delete(ehrlichMitteilungen).where(eq(ehrlichMitteilungen.id, id)).run().changes > 0;
}

// ---- Löschfrist ----

/** Der letzte Erledigt-Tag, der heute gelöscht wird: genau `LOESCHFRIST_MONATE` vor heute. */
export function loeschGrenze(heute: string, monate = LOESCHFRIST_MONATE): string {
  const [j, m, t] = heute.split("-").map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 - monate, 1));
  const letzterTag = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzterTag));
  return ziel.toISOString().slice(0, 10);
}

export function loescheAbgelaufene(db: EhrlichDb, heute: string): number {
  return db
    .delete(ehrlichMitteilungen)
    .where(and(eq(ehrlichMitteilungen.status, "erledigt"), isNotNull(ehrlichMitteilungen.erledigtTag), lte(ehrlichMitteilungen.erledigtTag, loeschGrenze(heute))))
    .run().changes;
}

// ---- Sofort-Push (über „Was steht an") ----

export type Ungemeldet = { id: string; art: "mitteilung" | "rueckfrage" };

/** Neue Mitteilungen und Rückfragen, die noch nicht gemeldet sind, ab dem Tag von `seit`. */
export function ungemeldete(db: EhrlichDb, seitTag: string): Ungemeldet[] {
  const neu = db
    .select({ id: ehrlichMitteilungen.id, tag: ehrlichMitteilungen.tag })
    .from(ehrlichMitteilungen)
    .where(eq(ehrlichMitteilungen.gemeldet, false))
    .all()
    .filter((m) => m.tag >= seitTag)
    .map((m) => ({ id: `m${m.id}`, art: "mitteilung" as const }));
  const rueck = db
    .select({ id: ehrlichNachrichten.id, tag: ehrlichNachrichten.tag })
    .from(ehrlichNachrichten)
    .where(and(eq(ehrlichNachrichten.gemeldet, false), eq(ehrlichNachrichten.von, "person")))
    .all()
    .filter((n) => n.tag >= seitTag)
    .map((n) => ({ id: `r${n.id}`, art: "rueckfrage" as const }));
  return [...neu, ...rueck];
}

export function vermerkeGemeldet(db: EhrlichDb, ids: readonly string[]): void {
  const m = ids.filter((i) => i.startsWith("m")).map((i) => Number(i.slice(1))).filter(Number.isInteger);
  const r = ids.filter((i) => i.startsWith("r")).map((i) => Number(i.slice(1))).filter(Number.isInteger);
  if (m.length) db.update(ehrlichMitteilungen).set({ gemeldet: true }).where(inArray(ehrlichMitteilungen.id, m)).run();
  if (r.length) db.update(ehrlichNachrichten).set({ gemeldet: true }).where(inArray(ehrlichNachrichten.id, r)).run();
}
