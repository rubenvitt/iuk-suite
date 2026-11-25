/**
 * Schlüssel, mit denen Lifeline Hub Personal und Qualifikationen abholt (LLH-1194, `api/stammdaten`). 32
 * Zufallsbytes base64url (43 Zeichen) wie beim Lagemonitor (`lagemonitor/_lib/schluessel.ts`; eigene Kopie,
 * kein modulübergreifender Import). Gespeichert wird nur der SHA-256; den Schlüssel sieht die Verwaltung genau
 * einmal, beim Anlegen.
 */
import { createHash, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { HelferDb } from "../_db/client";
import { lifelineZugang } from "../_db/schema";

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

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

export function listeZugaenge(db: HelferDb): ZugangDTO[] {
  return db.select().from(lifelineZugang).orderBy(desc(lifelineZugang.angelegtAm)).all().map((z) => ({
    id: z.id,
    bezeichnung: z.bezeichnung,
    angelegtAm: z.angelegtAm.toISOString(),
    angelegtVon: z.angelegtVon,
    zuletztAbgeholtAm: z.zuletztAbgeholtAm?.toISOString() ?? null,
  }));
}

/** Ob es mindestens einen Zugang gibt — dann warnt der Quellwechsel, dass Lifeline Hub neu zuordnen muss. */
export function hatLifelineZugang(db: HelferDb): boolean {
  return db.select({ id: lifelineZugang.id }).from(lifelineZugang).limit(1).get() !== undefined;
}

/** Legt einen Zugang an und gibt den Schlüssel zurück — das einzige Mal, dass er im Klartext existiert. */
export function legeZugangAn(db: HelferDb, bezeichnung: string, von: string, jetzt = new Date()): { id: string; schluessel: string } {
  const schluessel = randomBytes(32).toString("base64url");
  const id = nanoid();
  db.insert(lifelineZugang).values({ id, bezeichnung, schluesselHash: hashVon(schluessel), angelegtAm: jetzt, angelegtVon: von }).run();
  return { id, schluessel };
}

/** Widerruft einen Zugang; Lifeline Hub bekommt ab dann 401 und behält seinen letzten Stand. */
export function widerrufeZugang(db: HelferDb, id: string): boolean {
  return db.delete(lifelineZugang).where(eq(lifelineZugang.id, id)).run().changes > 0;
}

/**
 * Prüft einen Schlüssel und vermerkt die Abholung. Der Vergleich läuft über den Hash im eindeutigen Index; ein
 * Zeitunterschied verrät damit nichts über den Schlüssel selbst.
 */
export function zugangAusSchluessel(db: HelferDb, schluessel: string | null, jetzt = new Date()): string | null {
  if (!schluessel) return null;
  const z = db.select({ id: lifelineZugang.id }).from(lifelineZugang).where(eq(lifelineZugang.schluesselHash, hashVon(schluessel))).get();
  if (!z) return null;
  db.update(lifelineZugang).set({ zuletztAbgeholtAm: jetzt }).where(eq(lifelineZugang.id, z.id)).run();
  return z.id;
}
