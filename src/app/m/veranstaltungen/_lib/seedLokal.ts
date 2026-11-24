import { ausWanduhr, wanduhr } from "@/app/m/schichtplan/_lib/zeit";
import type { VeranstaltungenDb } from "../_db/client";
import { veranstaltung } from "../_db/schema";
import { speichereVeranstaltung } from "./daten";
import { veranstaltungEingabe } from "./eingabe";

/** Der nächste Samstag in der Suite-Zone (mindestens drei Tage hin) — derselbe Tag wie die Demo-Planung. */
export function naechsterSamstag(jetzt: number) {
  for (let t = jetzt + 3 * 86_400_000; ; t += 86_400_000) {
    const w = wanduhr(t);
    if (new Date(Date.UTC(w.jahr, w.monat - 1, w.tag)).getUTCDay() === 6) return w;
  }
}

export const DEMO_STADTFEST = "Stadtfest (Demo)";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag veranstaltungen). Drei
 * Veranstaltungen: das Stadtfest, zu dem die Demo-Planung der Schichtplanung gehört, eine angefragte
 * Blutspende und eine Übung. Idempotent: gibt es schon eine Veranstaltung, bleibt alles, wie es ist.
 * Läuft vor `schichtplan`.
 */
export async function seedLokalVeranstaltungen(db: VeranstaltungenDb, jetzt = Date.now()): Promise<string[]> {
  if (db.select({ id: veranstaltung.id }).from(veranstaltung).limit(1).get()) return ["veranstaltungen: Veranstaltung vorhanden, nichts geändert"];
  const sa = naechsterSamstag(jetzt);
  const um = (tagePlus: number, stunde: number) => ausWanduhr({ ...sa, stunde, minute: 0 }) + tagePlus * 86_400_000;
  const demo = [
    { name: DEMO_STADTFEST, art: "sanitaetsdienst", status: "zugesagt", ort: "Marktplatz", veranstalter: "Stadtmarketing (Demo)", von: um(0, 8), bis: um(0, 22), bemerkung: "Zwei Sanitätswachen, ein Fahrzeug." },
    { name: "Blutspende (Demo)", art: "betreuung", status: "angefragt", ort: "Gemeindehaus", veranstalter: "Blutspendedienst (Demo)", von: um(7, 15), bis: um(7, 20), bemerkung: "" },
    { name: "Übung Großschadenslage (Demo)", art: "uebung", status: "zugesagt", ort: "Schulzentrum", veranstalter: "", von: um(14, 9), bis: um(14, 16), bemerkung: "" },
  ];
  for (const v of demo) speichereVeranstaltung(db, null, veranstaltungEingabe.parse(v), jetzt);
  return [`veranstaltungen: ${demo.length} Veranstaltungen angelegt`];
}
