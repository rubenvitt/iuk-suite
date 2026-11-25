/**
 * Der Vertrag „Veranstaltungen-Abruf v1“ (LLH-2097), wie Lifeline Hub ihn abholt (`api/abruf`). Beschrieben im
 * Repo `lifeline-hub` unter `docs/schnittstellen/veranstaltungen-abruf.md`. Fachbegriffe deutsch, Zeitpunkte
 * UTC ohne Millisekunden. Geliefert wird alles, dessen Ende höchstens `FENSTER_TAGE` zurückliegt, abgesagte
 * eingeschlossen: so sieht Lifeline eine Absage, bevor die Veranstaltung aus der Liste fällt.
 */
import { asc, gte } from "drizzle-orm";
import type { VeranstaltungenDb } from "../_db/client";
import { veranstaltung } from "../_db/schema";
import type { VeranstaltungArt, VeranstaltungStatus } from "./typen";

export const FASSUNG = 1;
export const FENSTER_TAGE = 7;
export const HOECHSTENS = 500;

export interface AbrufVeranstaltung {
  id: string;
  name: string;
  art: VeranstaltungArt;
  status: VeranstaltungStatus;
  ort: string;
  veranstalter: string;
  beginn: string;
  ende: string;
  bemerkung: string;
  geaendert: string;
}

export interface AbrufAntwort {
  fassung: typeof FASSUNG;
  stand: string;
  veranstaltungen: AbrufVeranstaltung[];
}

/** `2026-11-28T07:00:00Z`: UTC, sekundengenau. */
export const utc = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

/** Die Antwort für Lifeline Hub; die frühesten zuerst, höchstens `HOECHSTENS`. */
export function abrufAntwort(db: VeranstaltungenDb, jetzt = Date.now()): AbrufAntwort {
  const ab = jetzt - FENSTER_TAGE * 86_400_000;
  const zeilen = db.select().from(veranstaltung).where(gte(veranstaltung.bis, ab))
    .orderBy(asc(veranstaltung.von), asc(veranstaltung.id)).limit(HOECHSTENS).all();
  return {
    fassung: FASSUNG,
    stand: utc(jetzt),
    veranstaltungen: zeilen.map((v) => ({
      id: v.id, name: v.name, art: v.art, status: v.status, ort: v.ort, veranstalter: v.veranstalter,
      beginn: utc(v.von), ende: utc(v.bis), bemerkung: v.bemerkung, geaendert: utc(v.aktualisiertAm),
    })),
  };
}
