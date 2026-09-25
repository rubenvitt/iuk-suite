/**
 * Verwaltungssitzung der App (Spec §4.4, §12): entsteht beim Tausch eines Einmalcodes, gilt
 * 30 Minuten ab Anmeldung und verlängert sich nie. Sie ist an höchstens einen Rechner gebunden
 * (Entscheidung 2); wird der widerrufen, gilt sie sofort nicht mehr.
 */
import { eq } from "drizzle-orm";
import { rechner, sitzung } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";
import type { Einrichtungswunsch } from "./einmalcode";
import { gleich, hashVon, neuesGeheimnis } from "./token";

export const SITZUNG_GUELTIG_MS = 30 * 60_000;

export type SitzungZeile = typeof sitzung.$inferSelect;

export function erzeugeSitzung(
  db: Db,
  o: { sub: string; name: string; rechnerId: string | null; einrichtung: Einrichtungswunsch | null; jetzt: Date },
): { token: string; ablauf: Date } {
  const token = neuesGeheimnis();
  // Die Spalte speichert ganze Sekunden: zurückgegeben wird der Ablauf, der auch in der DB steht.
  const ablauf = new Date(Math.floor((o.jetzt.getTime() + SITZUNG_GUELTIG_MS) / 1000) * 1000);
  db.insert(sitzung).values({
    tokenHash: hashVon(token),
    sub: o.sub,
    name: o.name,
    ablauf,
    rechnerId: o.rechnerId,
    einrichtungArt: o.einrichtung?.art ?? null,
    rechnerName: o.einrichtung?.name ?? null,
    ersetzen: o.einrichtung?.ersetzen ?? false,
  }).run();
  return { token, ablauf };
}

/** Die Sitzung zum Token, oder `null`: ohne Token, unbekannt, abgelaufen, gebundener Rechner widerrufen. Liest nur. */
export function sitzungAus(db: Db, token: string | null, jetzt: Date): SitzungZeile | null {
  if (!token) return null;
  const hash = hashVon(token);
  const s = db.select().from(sitzung).where(eq(sitzung.tokenHash, hash)).get();
  if (!s || !gleich(s.tokenHash, hash)) return null;
  if (s.ablauf.getTime() <= jetzt.getTime()) return null;
  if (s.rechnerId !== null) {
    const r = db.select({ widerrufenAm: rechner.widerrufenAm }).from(rechner).where(eq(rechner.id, s.rechnerId)).get();
    if (!r || r.widerrufenAm !== null) return null;
  }
  return s;
}
