import { z } from "zod";
import { einstellung } from "../_db/schema";
import type { Db } from "./stammdaten/daten";

export const einstellungenSchema = z.object({
  fristMinuten: z.number().int("Die Frist ist eine ganze Zahl von Minuten").min(1, "Mindestens 1 Minute").max(120, "Höchstens 120 Minuten"),
  besatzung: z.boolean(),
  bereitschaft: z.string().trim().min(1, "Name der Bereitschaft fehlt").max(80, "Höchstens 80 Zeichen"),
});
export type Einstellungen = z.infer<typeof einstellungenSchema>;
export const EINSTELLUNG_VORGABEN: Einstellungen = { fristMinuten: 15, besatzung: true, bereitschaft: "DRK-Bereitschaft Uelzen" };

export function leseEinstellungen(db: Db): Einstellungen {
  const roh = Object.fromEntries(db.select().from(einstellung).all().map((z) => [z.schluessel, z.wert]));
  const ergebnis = { ...EINSTELLUNG_VORGABEN };
  for (const k of Object.keys(EINSTELLUNG_VORGABEN) as (keyof Einstellungen)[]) {
    if (roh[k] === undefined) continue;
    try {
      const teil = einstellungenSchema.shape[k].safeParse(JSON.parse(roh[k]));
      if (teil.success) (ergebnis as Record<string, unknown>)[k] = teil.data;
    } catch { /* unlesbar → Vorgabe */ }
  }
  return ergebnis;
}

/** Upsert je Schlüssel. Ein unveränderter Wert trifft die `WHEN`-Klauseln der Trigger nicht. */
export function schreibeEinstellungen(db: Db, e: Einstellungen): void {
  db.transaction((tx) => {
    for (const [schluessel, wert] of Object.entries(einstellungenSchema.parse(e))) {
      tx.insert(einstellung).values({ schluessel, wert: JSON.stringify(wert) })
        .onConflictDoUpdate({ target: einstellung.schluessel, set: { wert: JSON.stringify(wert) } }).run();
    }
  });
}
