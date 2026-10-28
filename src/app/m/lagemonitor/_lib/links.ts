/**
 * Links für den Online-Lagemonitor: Wer so einen Link öffnet, sieht den Monitor ohne Anmeldung bei
 * Pocket ID, bis der Link widerrufen ist. Der Schlüssel entsteht wie bei den Zugängen
 * (`_lib/schluessel.ts`) und steht hinter `#` im Link, damit er in keinem Server-Log landet; der
 * Lagemonitor tauscht ihn im Browser gegen eine Sitzung (Repo `lagemonitor`, `src/auth.rs`).
 */
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LagemonitorDb } from "../_db/client";
import { link } from "../_db/schema";
import { hashVon, neuerSchluessel } from "./schluessel";

export interface LinkDTO {
  id: string;
  bezeichnung: string;
  angelegtAm: string;
  angelegtVon: string;
}

/** So steht ein Link im Drahtformat (`publicLinks`): nur der Hash, nie der Schlüssel. */
export interface PublicLink {
  id: string;
  label: string;
  hash: string;
}

export function listeLinks(db: LagemonitorDb): LinkDTO[] {
  return db.select().from(link).orderBy(desc(link.angelegtAm)).all().map((l) => ({
    id: l.id,
    bezeichnung: l.bezeichnung,
    angelegtAm: l.angelegtAm.toISOString(),
    angelegtVon: l.angelegtVon,
  }));
}

/** Legt einen Link an und gibt den Schlüssel zurück — das einzige Mal, dass er im Klartext existiert. */
export function legeLinkAn(db: LagemonitorDb, bezeichnung: string, von: string, jetzt = new Date()): { id: string; schluessel: string } {
  const schluessel = neuerSchluessel();
  const id = nanoid();
  db.insert(link).values({ id, bezeichnung, schluesselHash: hashVon(schluessel), angelegtAm: jetzt, angelegtVon: von }).run();
  return { id, schluessel };
}

/** Widerruft einen Link; der Rechner verliert den Zugang mit der nächsten Abholung (eine Minute). */
export function widerrufeLink(db: LagemonitorDb, id: string): boolean {
  return db.delete(link).where(eq(link.id, id)).run().changes > 0;
}

export function alsPublicLinks(db: LagemonitorDb): PublicLink[] {
  return db
    .select({ id: link.id, label: link.bezeichnung, hash: link.schluesselHash })
    .from(link)
    .orderBy(link.angelegtAm)
    .all();
}

/**
 * Der Link zum Weitergeben. `basis` ist die Adresse des Online-Monitors aus `LAGEMONITOR_ONLINE_URL`
 * (`_lib/online.ts`), etwa `https://lagemonitor.iuk-ue.de/monitor`.
 */
export function linkAdresse(basis: string, schluessel: string): string {
  return `${basis.replace(/\/+$/, "")}/auth/link#${schluessel}`;
}
