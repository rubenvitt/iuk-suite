/**
 * Den Erstimport anwenden (IDA-256): in EINER Transaktion neue Stammfahrzeuge anlegen und jede Zeile der
 * Apps zuordnen. Der Plan kommt frisch aus den Quellen (die Action plant neu, statt der Vorschau aus dem
 * Browser zu trauen); die Entscheidungen beziehen sich auf die Schlüssel der Vorschläge, und was es nicht
 * mehr gibt, wird übergangen.
 *
 * Ein vorhandenes Stammfahrzeug bekommt dabei fehlenden Funkkenner und fehlendes Kennzeichen aus seinen
 * Zeilen nachgetragen — nie überschrieben, und nie, wenn der Wert schon ein anderes Fahrzeug trägt.
 */
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { FahrzeugeDb, FahrzeugeSchreiber } from "../../_db/client";
import { quellzuordnung, stammfahrzeug } from "../../_db/schema";
import { speichereFahrzeug } from "../daten";
import { fahrzeugEingabe } from "../eingabe";
import { kennerAus, type Erstimportplan, type Kandidat } from "./plan";

/** Was für einen offenen Vorschlag gewählt wurde. */
export const wahlSchema = z.discriminatedUnion("art", [
  z.object({ art: z.literal("stamm"), id: z.string().min(1).max(64) }),
  z.object({ art: z.literal("vorschlag"), schluessel: z.string().min(1).max(4000) }),
  z.object({ art: z.literal("kein") }),
]);
export type Wahl = z.infer<typeof wahlSchema>;

export const entscheidungenSchema = z.object({
  /** Schlüssel der Vorschläge mit Ziel „bestand“ oder „neu“, die übernommen werden. */
  uebernehmen: z.array(z.string().min(1).max(4000)).max(2000),
  /** Je offenem Vorschlag die Wahl; fehlt ein Schlüssel, bleibt er offen. */
  offen: z.record(z.string().min(1).max(4000), wahlSchema),
});
export type Entscheidungen = z.infer<typeof entscheidungenSchema>;

export interface Erstimportergebnis {
  neu: number;
  zugeordnet: number;
  keinFahrzeug: number;
}

export function wendeErstimportAn(
  db: FahrzeugeDb,
  plan: Erstimportplan,
  e: Entscheidungen,
  von: string,
  jetzt = new Date(),
): Erstimportergebnis {
  const ergebnis: Erstimportergebnis = { neu: 0, zugeordnet: 0, keinFahrzeug: 0 };
  const uebernehmen = new Set(e.uebernehmen);
  return db.transaction((tx) => {
    const angelegt = new Map<string, string>();
    for (const v of plan.vorschlaege) {
      if (v.ziel.art !== "neu" || !uebernehmen.has(v.schluessel)) continue;
      angelegt.set(v.schluessel, speichereFahrzeug(tx, null, fahrzeugEingabe.parse(v.ziel.fahrzeug), jetzt).id);
      ergebnis.neu += 1;
    }

    for (const v of plan.vorschlaege) {
      let stammId: string | null | undefined;
      if (v.ziel.art === "neu") stammId = angelegt.get(v.schluessel);
      else if (v.ziel.art === "bestand") stammId = uebernehmen.has(v.schluessel) ? v.ziel.stammId : undefined;
      else {
        const wahl = e.offen[v.schluessel];
        if (wahl?.art === "kein") stammId = null;
        else if (wahl?.art === "vorschlag") stammId = angelegt.get(wahl.schluessel);
        else if (wahl?.art === "stamm") stammId = tx.select({ id: stammfahrzeug.id }).from(stammfahrzeug).where(eq(stammfahrzeug.id, wahl.id)).get()?.id;
      }
      if (stammId === undefined) continue;

      for (const k of v.kandidaten) ordneZu(tx, k, stammId, von, jetzt);
      if (stammId === null) ergebnis.keinFahrzeug += v.kandidaten.length;
      else {
        ergebnis.zugeordnet += v.kandidaten.length;
        ergaenze(tx, stammId, v.kandidaten, jetzt);
      }
    }
    return ergebnis;
  });
}

function ordneZu(tx: FahrzeugeSchreiber, k: Kandidat, stammId: string | null, von: string, jetzt: Date): void {
  tx.insert(quellzuordnung)
    .values({ quelle: k.quelle, quellId: k.quellId, stammId, entschiedenAm: jetzt, entschiedenVon: von })
    .onConflictDoUpdate({ target: [quellzuordnung.quelle, quellzuordnung.quellId], set: { stammId, entschiedenAm: jetzt, entschiedenVon: von } })
    .run();
}

/** Trägt fehlenden Funkkenner und fehlendes Kennzeichen nach, wenn kein anderes Fahrzeug den Wert trägt. */
function ergaenze(tx: FahrzeugeSchreiber, stammId: string, kandidaten: Kandidat[], jetzt: Date): void {
  const kenner = kandidaten.map((k) => kennerAus(k.funkkenner)).find((w) => w !== null) ?? null;
  const zeichen = kandidaten.map((k) => k.kennzeichen?.trim().toUpperCase().replace(/\s+/g, " ") || null).find((w) => w !== null) ?? null;
  if (kenner && !tx.select({ id: stammfahrzeug.id }).from(stammfahrzeug).where(and(eq(stammfahrzeug.funkkenner, kenner), ne(stammfahrzeug.id, stammId))).get()) {
    tx.update(stammfahrzeug).set({ funkkenner: kenner, aktualisiertAm: jetzt }).where(and(eq(stammfahrzeug.id, stammId), isNull(stammfahrzeug.funkkenner))).run();
  }
  if (zeichen && zeichen.length <= 20 && !tx.select({ id: stammfahrzeug.id }).from(stammfahrzeug).where(and(eq(stammfahrzeug.kennzeichen, zeichen), ne(stammfahrzeug.id, stammId))).get()) {
    tx.update(stammfahrzeug).set({ kennzeichen: zeichen, aktualisiertAm: jetzt }).where(and(eq(stammfahrzeug.id, stammId), isNull(stammfahrzeug.kennzeichen))).run();
  }
}

/** Die schon getroffenen Entscheidungen, als `quelle:quellId` — für `planeErstimport`. */
export function zugeordneteSchluessel(db: FahrzeugeDb): Set<string> {
  return new Set(db.select({ quelle: quellzuordnung.quelle, quellId: quellzuordnung.quellId }).from(quellzuordnung).all().map((z) => `${z.quelle}:${z.quellId}`));
}
