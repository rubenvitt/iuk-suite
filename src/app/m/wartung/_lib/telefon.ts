/**
 * Was die Telefonseiten am Gerät lesen: das Gerät (aktiv), seine Checkliste (bei einer Materialkiste die
 * Inhaltsliste, IDA-335), offene Mängel und Unterlagen — ohne Gruppenfilter, denn prüfen darf jeder Angemeldete.
 */
import { asc, eq } from "drizzle-orm";
import type { WartungDb } from "../_db/client";
import { checkpunkt } from "../_db/schema";
import { ladeGeraet, ladeInhalt, ladeMaengel, ladeUnterlagen } from "./daten";
import { unterwegsStand, type Unterwegs } from "./unterwegs";
import type { CheckpunktDTO, GeraetZeile, MangelDTO, UnterlageDTO } from "./typen";

export interface AmGeraet {
  g: GeraetZeile;
  checkliste: CheckpunktDTO[];
  offen: Pick<MangelDTO, "id" | "text" | "einsatzbereit">[];
  unterlagen: UnterlageDTO[];
  /** Was gerade aus der Kiste unterwegs ist (IDA-372). */
  unterwegs: Unterwegs;
}

export function ladeAmGeraet(db: Pick<WartungDb, "select">, id: string, heute: string): AmGeraet | null {
  const g = ladeGeraet(db, id, heute);
  if (!g || !g.aktiv) return null;
  // Eine Materialkiste zählt ihre Inhaltsliste durch (IDA-335); die Bemerkung steht, wo sonst „So geht’s“ steht.
  const checkliste = g.kiste
    ? ladeInhalt(db, id).map((p) => ({ id: p.id, text: p.text, hinweis: p.bemerkung, soll: p.soll }))
    : db.select({ id: checkpunkt.id, text: checkpunkt.text, hinweis: checkpunkt.hinweis }).from(checkpunkt)
      .where(eq(checkpunkt.artId, g.artId)).orderBy(asc(checkpunkt.position)).all();
  const offen = ladeMaengel(db, { gruppen: null, geraetId: id, offen: true }).map((m) => ({ id: m.id, text: m.text, einsatzbereit: m.einsatzbereit }));
  return { g, checkliste, offen, unterlagen: ladeUnterlagen(db, id), unterwegs: unterwegsStand(db, id) };
}
