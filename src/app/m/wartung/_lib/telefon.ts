/**
 * Was die Telefonseiten am Gerät lesen: das Gerät (aktiv), seine Checkliste (bei einer Materialkiste die
 * Inhaltsliste, IDA-335), offene Mängel und Unterlagen — ohne Gruppenfilter, denn prüfen darf jeder Angemeldete.
 *
 * Hat das Gerät mehrere Prüfungen am Gerät (IDA-369), steht in `pruefung` die gewählte bzw. fällige und in
 * `checkliste` nur ihre Punkte.
 */
import { asc, eq } from "drizzle-orm";
import type { WartungDb } from "../_db/client";
import { checkpunkt } from "../_db/schema";
import { ladeGeraet, ladeInhalt, ladeMaengel, ladeUnterlagen, pruefartenJePunkt } from "./daten";
import type { FristStand } from "./fristen";
import { pruefungAmGeraet, punktGilt } from "./pruefplan";
import type { CheckpunktDTO, GeraetZeile, MangelDTO, UnterlageDTO } from "./typen";

export interface AmGeraet {
  g: GeraetZeile;
  /** Die Prüfung am Gerät, die läuft; `null`, wenn es keine gibt (oder die gewünschte hier nicht gilt). */
  pruefung: FristStand | null;
  checkliste: CheckpunktDTO[];
  /** Je Prüfung am Gerät die Zahl ihrer Punkte. */
  punkteJe: Record<string, number>;
  offen: Pick<MangelDTO, "id" | "text" | "einsatzbereit">[];
  unterlagen: UnterlageDTO[];
}

export function ladeAmGeraet(db: Pick<WartungDb, "select">, id: string, heute: string, pruefartId?: string | null): AmGeraet | null {
  const g = ladeGeraet(db, id, heute);
  if (!g || !g.aktiv) return null;
  const pruefung = pruefungAmGeraet(g.staende, pruefartId);
  // Eine Materialkiste zählt ihre Inhaltsliste durch (IDA-335); die Bemerkung steht, wo sonst „So geht’s“ steht.
  const selbst = g.staende.filter((f) => f.vorlage.wer === "intern").map((f) => f.vorlage.id);
  let checkliste: CheckpunktDTO[];
  let punkteJe: Record<string, number>;
  if (g.kiste) {
    checkliste = ladeInhalt(db, id).map((p) => ({ id: p.id, text: p.text, hinweis: p.bemerkung, soll: p.soll }));
    punkteJe = Object.fromEntries(selbst.map((pid) => [pid, checkliste.length]));
  } else {
    const zu = pruefartenJePunkt(db);
    const alle = db.select({ id: checkpunkt.id, text: checkpunkt.text, hinweis: checkpunkt.hinweis }).from(checkpunkt)
      .where(eq(checkpunkt.artId, g.artId)).orderBy(asc(checkpunkt.position)).all();
    const gilt = (pid: string) => alle.filter((p) => punktGilt({ pruefarten: zu.get(p.id) }, pid));
    checkliste = pruefung ? gilt(pruefung.vorlage.id) : alle;
    punkteJe = Object.fromEntries(selbst.map((pid) => [pid, gilt(pid).length]));
  }
  const offen = ladeMaengel(db, { gruppen: null, geraetId: id, offen: true }).map((m) => ({ id: m.id, text: m.text, einsatzbereit: m.einsatzbereit }));
  return { g, pruefung, checkliste, punkteJe, offen, unterlagen: ladeUnterlagen(db, id) };
}
