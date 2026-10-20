import type { HelferDb } from "../_db/client";
import { helfer } from "../_db/schema";
import { planeAbgleich, wendeAbgleichAn } from "./abgleich";
import { leseEinstellungen, schreibeEinstellung } from "./einstellungen";
import { heuteInZone, liesQuelle } from "./quelle";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag helfer). Stellt die Demo-Quelle
 * ein, schließt die Gruppen „Passive“ und „Fördermitglieder“ aus und gleicht einmal ab — derselbe
 * Weg wie „Übernehmen“ in der Oberfläche. Idempotent: steht schon ein Helfer im Bestand, bleibt
 * alles, wie es ist (additiv, nichts wird überschrieben).
 */
export async function seedLokalHelfer(db: HelferDb): Promise<string[]> {
  if (db.select({ id: helfer.id }).from(helfer).limit(1).get()) return ["helfer: Bestand vorhanden, nichts geändert"];
  if (leseEinstellungen(db).quelle !== "demo") return ["helfer: Quelle ist HiOrg-Server, keine Demodaten angelegt"];
  schreibeEinstellung(db, "quelle", "demo");
  schreibeEinstellung(db, "filter", { status: ["aktiv"], gruppenEin: [], gruppenAus: ["Passive", "Fördermitglieder"] });
  const e = leseEinstellungen(db);
  const gelesen = await liesQuelle(db, e);
  if (!gelesen.ok) return [`helfer: ${gelesen.fehler}`];
  const plan = planeAbgleich(gelesen, [], e.filter, heuteInZone(), "demo");
  const r = wendeAbgleichAn(db, plan, { neueFreigeben: e.neueFreigeben, von: { name: "Lokale Demodaten", sub: "seed" } });
  return [`helfer: Demo-Quelle eingestellt, ${r.neu} Demo-Helfer übernommen`];
}
