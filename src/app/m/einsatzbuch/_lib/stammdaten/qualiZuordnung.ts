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
 *
 * `kurz` ist seit IDA-282 eine Kurzform aus der Tabelle `qualifikation`. Eine geänderte Kurzform
 * zieht die Regeln mit, eine entfernte Qualifikation nimmt ihre Regeln mit (`zieheRegelnNach`).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { einstellung } from "../../_db/schema";
import { QualiFehler, listeQualifikationen, type Db } from "./daten";

export const QUALI_ZUORDNUNG_SCHLUESSEL = "qualiZuordnung";

const quali = z.string().trim().min(1).max(20);
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
  const bekannt = new Set(listeQualifikationen(db).map((q) => q.kurz));
  const fremd = eindeutig.find((r) => r.kurz !== null && !bekannt.has(r.kurz));
  if (fremd) throw new QualiFehler(`Die Qualifikation „${fremd.kurz}“ gibt es nicht mehr. Bitte die Seite neu laden.`);
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

/**
 * Zieht die Regeln einer Kurzform nach: `neu` benennt sie um, `null` streicht ihre Regeln (die
 * Qualifikation ist entfernt; „nicht zuordnen“-Regeln bleiben). Läuft in der Transaktion des Aufrufers.
 */
export function zieheRegelnNach(db: Db, alt: string, neu: string | null): void {
  const regeln = leseQualiRegeln(db);
  if (!regeln.some((r) => r.kurz === alt)) return;
  const nachher = regeln.flatMap((r) => (r.kurz !== alt ? [r] : neu === null ? [] : [{ ...r, kurz: neu }]));
  if (nachher.length === 0) {
    db.delete(einstellung).where(eq(einstellung.schluessel, QUALI_ZUORDNUNG_SCHLUESSEL)).run();
    return;
  }
  db.update(einstellung).set({ wert: JSON.stringify(nachher) }).where(eq(einstellung.schluessel, QUALI_ZUORDNUNG_SCHLUESSEL)).run();
}
