/**
 * Die einstellbare Zuordnung „HiOrg-Qualifikation → Kürzel“ für den Abgleich mit dem
 * Helferverzeichnis (IDA-250). Eine Regel gilt für genau eine HiOrg-Qualifikation, erkannt an ihrem
 * Namen (ohne Rücksicht auf Groß-/Kleinschreibung und Rand-Leerzeichen; ohne Namen an der Kurzform).
 * Sie überschreibt die eingebaute Zuordnung (`helferAbgleich.ts`, `ZUORDNUNG`) — auch mit „nicht
 * zuordnen“ (`kurz: null`), falls die eingebaute Zuordnung zu großzügig ist. Ohne Regel bleibt es bei
 * der eingebauten.
 *
 * Gespeichert wird in `einstellung` unter `qualiZuordnung`, NICHT im Stammdatenpaket: die App sieht
 * nur das Ergebnis, die Kürzel am Personal (`stammdatenpaket.ts` liest nur seine eigenen Schlüssel).
 * Ein Speichern zählt den Stammdatenstand hoch (Trigger `stand_einstellung_*`); der Rechner holt
 * dann einmal ein unverändertes Paket. Das ist billiger als eine eigene Tabelle samt Migration.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { einstellung } from "../../_db/schema";
import type { Db } from "./daten";
import { QUALIS } from "./vorlage";

export const QUALI_ZUORDNUNG_SCHLUESSEL = "qualiZuordnung";

const quali = z.enum(QUALIS as [(typeof QUALIS)[number], ...(typeof QUALIS)[number][]]);
export const qualiRegelnSchema = z.array(z.object({
  hiorg: z.string().trim().min(1, "Name der HiOrg-Qualifikation fehlt").max(120, "Höchstens 120 Zeichen"),
  kurz: quali.nullable(),
})).max(200, "Höchstens 200 Regeln");
export type QualiRegel = z.infer<typeof qualiRegelnSchema>[number];

/** Der Schlüssel, unter dem eine HiOrg-Qualifikation einer Regel begegnet. */
export function hiorgSchluessel(q: { name: string; kurz: string }): string {
  return (q.name.trim() || q.kurz.trim()).toLocaleLowerCase("de");
}

export function leseQualiRegeln(db: Db): QualiRegel[] {
  const zeile = db.select().from(einstellung).where(eq(einstellung.schluessel, QUALI_ZUORDNUNG_SCHLUESSEL)).get();
  if (!zeile) return [];
  try {
    const regeln = qualiRegelnSchema.safeParse(JSON.parse(zeile.wert));
    return regeln.success ? regeln.data : [];
  } catch {
    return []; // unlesbar → eingebaute Zuordnung
  }
}

/** Ersetzt alle Regeln. Je HiOrg-Qualifikation gilt die letzte; eine leere Liste löscht die Zeile. */
export function schreibeQualiRegeln(db: Db, regeln: QualiRegel[]): void {
  const eindeutig = [...new Map(qualiRegelnSchema.parse(regeln).map((r) => [hiorgSchluessel({ name: r.hiorg, kurz: "" }), r])).values()];
  const wert = JSON.stringify(eindeutig);
  db.transaction((tx) => {
    if (eindeutig.length === 0) {
      tx.delete(einstellung).where(eq(einstellung.schluessel, QUALI_ZUORDNUNG_SCHLUESSEL)).run();
      return;
    }
    tx.insert(einstellung).values({ schluessel: QUALI_ZUORDNUNG_SCHLUESSEL, wert })
      .onConflictDoUpdate({ target: einstellung.schluessel, set: { wert } }).run();
  });
}
