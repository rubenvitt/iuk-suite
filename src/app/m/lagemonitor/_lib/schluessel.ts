/**
 * Schlüssel, mit denen ein Lagemonitor seine Einstellungen abholt. 32 Zufallsbytes base64url (43
 * Zeichen) wie die Geräte-Tokens des Einsatzbuchs (`einsatzbuch/_lib/anbindung/token.ts`; eigene Kopie,
 * kein modulübergreifender Import). Gespeichert wird nur der SHA-256; den Schlüssel sieht die
 * Verwaltung genau einmal, beim Anlegen.
 */
import { createHash, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LagemonitorDb } from "../_db/client";
import { zugang } from "../_db/schema";

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

export function neuerSchluessel(): string {
  return randomBytes(32).toString("base64url");
}

export function hashVon(schluessel: string): string {
  return createHash("sha256").update(schluessel, "utf8").digest("hex");
}

/** Der Schlüssel aus `Authorization: Bearer <43 Zeichen base64url>`, sonst `null`. */
export function bearerAus(req: Request): string | null {
  return BEARER.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;
}

export interface ZugangDTO {
  id: string;
  bezeichnung: string;
  angelegtAm: string;
  angelegtVon: string;
  zuletztAbgeholtAm: string | null;
}

export function listeZugaenge(db: LagemonitorDb): ZugangDTO[] {
  return db.select().from(zugang).orderBy(desc(zugang.angelegtAm)).all().map((z) => ({
    id: z.id,
    bezeichnung: z.bezeichnung,
    angelegtAm: z.angelegtAm.toISOString(),
    angelegtVon: z.angelegtVon,
    zuletztAbgeholtAm: z.zuletztAbgeholtAm?.toISOString() ?? null,
  }));
}

/** Legt einen Zugang an und gibt den Schlüssel zurück — das einzige Mal, dass er im Klartext existiert. */
export function legeZugangAn(db: LagemonitorDb, bezeichnung: string, von: string, jetzt = new Date()): { id: string; schluessel: string } {
  const schluessel = neuerSchluessel();
  const id = nanoid();
  db.insert(zugang).values({ id, bezeichnung, schluesselHash: hashVon(schluessel), angelegtAm: jetzt, angelegtVon: von }).run();
  return { id, schluessel };
}

/** Widerruft einen Zugang; der Lagemonitor bekommt ab dann 401 und zeigt weiter den letzten Stand. */
export function widerrufeZugang(db: LagemonitorDb, id: string): boolean {
  return db.delete(zugang).where(eq(zugang.id, id)).run().changes > 0;
}

/**
 * Prüft einen Schlüssel und vermerkt die Abholung. Der Vergleich läuft über den Hash im eindeutigen
 * Index; ein Zeitunterschied verrät damit nichts über den Schlüssel selbst.
 */
export function zugangAusSchluessel(db: LagemonitorDb, schluessel: string | null, jetzt = new Date()): string | null {
  if (!schluessel) return null;
  const z = db.select({ id: zugang.id }).from(zugang).where(eq(zugang.schluesselHash, hashVon(schluessel))).get();
  if (!z) return null;
  db.update(zugang).set({ zuletztAbgeholtAm: jetzt }).where(eq(zugang.id, z.id)).run();
  return z.id;
}
