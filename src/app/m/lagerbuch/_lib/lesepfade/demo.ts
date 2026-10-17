/**
 * Lesepfade des Demo-Checks — IDA-224, voruebergehend (Rueckbau: IDA-225).
 * Kopf und Begruendung: `_lib/demoCheck.ts`.
 *
 * ⚠️ NUR LESEN. Die Demo-Seite und ihr Abschluss laufen anonym; nichts hier
 * darf eine Zeile anlegen oder aendern (`demo/page.test.tsx` vergleicht jede
 * Tabelle vorher/nachher).
 */
import { eq } from "drizzle-orm";
import { demoEinstellung } from "../../_db/schema";
import type { CheckPos } from "../../_ui/CheckFlow";
import { grundText, waehleStichprobe } from "../domain/stichprobe";
import { DEMO_FAHRZEUG_ID } from "../demoCheck";
import { heuteIso } from "../zeit";
import type { Leser } from "./bestand";
import { templateDetail } from "./fahrzeuge";

/** Die eine Zeile in `demo_einstellung`. */
export const DEMO_EINSTELLUNG_ID = "check";

export function demoEinstellungLesen(db: Leser): { aktiv: boolean; templateId: string | null } {
  const zeile = db.select().from(demoEinstellung)
    .where(eq(demoEinstellung.id, DEMO_EINSTELLUNG_ID)).get();
  return { aktiv: zeile?.aktiv ?? false, templateId: zeile?.templateId ?? null };
}

export type DemoCheckDaten = {
  fahrzeug: { id: string; name: string; kennung: string; einheitenart: "fahrzeug" };
  soll: CheckPos[];
  /** Die gezogenen Positionen des Kurzchecks mit ihrem Grund als Satz. */
  stichprobe: Record<string, string>;
};

/**
 * Die Check-Daten des Demo-Fahrzeugs, gebaut aus der gewaehlten Vorlage — oder
 * `null`, wenn die Demo aus ist, die Vorlage fehlt, inaktiv oder leer ist. Die
 * Seite und der Abschluss antworten dann mit 404.
 *
 * ⚠️ DIE BESTAENDE SIND ERFUNDEN: Handlager = Soll je Artikel, damit der
 * Nachfuellschritt wie im Ernstfall aussieht. Echte Bestaende gingen sonst auf
 * jedes anonyme Telefon.
 *
 * ⚠️ DIE STICHPROBE zieht dieselbe Funktion wie im Ernstfall. Das Demo-Fahrzeug
 * hat keine Historie, also ist jede Position „noch nie gezaehlt" — gezogen wird
 * der volle Umfang, wie bei einem frisch angelegten Fahrzeug. Plomben, Geraete
 * und Sauerstoff haengen am Fahrzeug, nicht an der Vorlage, und fehlen deshalb.
 */
export function demoCheckDaten(db: Leser, now: Date = new Date()): DemoCheckDaten | null {
  const einstellung = demoEinstellungLesen(db);
  if (!einstellung.aktiv || !einstellung.templateId) return null;
  const vorlage = templateDetail(db, einstellung.templateId);
  if (!vorlage || !vorlage.aktiv || vorlage.positionen.length === 0) return null;

  const handlager = new Map<string, number>();
  for (const p of vorlage.positionen) handlager.set(p.artikelId, (handlager.get(p.artikelId) ?? 0) + p.soll);
  const soll: CheckPos[] = vorlage.positionen.map((p) => ({
    id: p.id, fachLabel: p.fachLabel, artikelId: p.artikelId, artikelName: p.artikelName,
    einheit: p.einheit, handlagerFach: p.handlagerFach, soll: p.soll,
    fahrzeugBestand: 0, handlagerBestand: handlager.get(p.artikelId) ?? 0,
  }));

  const gezogen = waehleStichprobe(
    soll.map((p) => ({
      id: p.id, artikelId: p.artikelId, tageSeitZaehlung: null, verbraucht: false, verfallBald: false,
    })),
    { seed: `${DEMO_FAHRZEUG_ID}|${heuteIso(now)}` },
  );

  return {
    fahrzeug: { id: DEMO_FAHRZEUG_ID, name: vorlage.name, kennung: "Demo", einheitenart: "fahrzeug" },
    soll,
    stichprobe: Object.fromEntries(gezogen.map((t) => [t.id, grundText(t)])),
  };
}
