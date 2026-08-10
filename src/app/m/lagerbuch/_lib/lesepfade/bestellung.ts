/**
 * Der Bestellvorschlag. Kein "use client", kein Icon-Import.
 *
 * `bestand` ist IMMER der HANDLAGER-Bestand (`queries.ts:519`, §5.2.1): der
 * Mindestbestand ist eine Nachschubschwelle fuers Zentrallager, kein Fahrzeugsoll.
 * Das ist auch der Grund, warum `bestandJeArtikel` mit `HANDLAGER_ID` und nicht
 * lagerort-uebergreifend gerufen wird.
 *
 * ⚠️ `artikel.bestelltAt` TRAEGT GENAU EINE WAHRE AUSSAGE (§5.5): „seit wann steht
 * die aktuelle Markierung". Weder das Setzen noch das Nullen beim naechsten Zugang
 * schreibt eine Journalzeile; alles Fruehere ist weg, und es gibt KEINE Zeile, aus
 * der man eine Historie rekonstruieren koennte. Diese Zeile uebernimmt den
 * Spaltenwert unveraendert und ERFINDET KEINE HISTORIE.
 *
 * ⚠️ NUR EIN ZUGANG LOESCHT DIE MARKIERUNG — und der ist nicht der einzige Weg,
 * wie Ware ankommt: eine Inventurkorrektur oder ein CSV-Import bucht
 * `typ: "korrektur"`, eine Umlagerung `typ: "umlagerung"`. Eine so eingebuchte
 * Lieferung laesst „bestellt" stehen. DAS BLEIBT 1:1 — die Alternative („jede
 * positive Korrektur am Handlager loescht die Markierung") ist erfunden, im
 * Bestand nicht belegt und verwechselte eine Inventur-Zaehlung nach oben mit einer
 * Lieferung. Stattdessen wird die Regel AUSGESCHRIEBEN und gezeigt — dafuer ist
 * `wareOffenbarDa` da.
 */
import { eq } from "drizzle-orm";
import { artikel } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { braucht, vorschlagsmenge } from "../domain/vorschlag";
import { bestandJeArtikel, type Leser } from "./bestand";

export type BestellZeile = {
  id: string; name: string; einheit: string; fach: string;
  bestand: number; mindestbestand: number; vorschlag: number;
  /** ⚠️ BLEIBT, weil das CSV-Format 1:1 ist: `Status` = bestellt/offen (§9.2). */
  bestellt: boolean;
  /** NEU (§5.5): „bestellt seit <Datum>" statt eines Hakens. */
  bestelltSeit: Date | null;
  /**
   * NEU: als bestellt markiert, aber NICHT mehr unter Mindestbestand → „Ware
   * offenbar eingetroffen — Markierung zuruecksetzen?".
   * Das bedeutet bewusst NICHT, dass ein bestimmter Zugang nachweisbar waere:
   * auch eine Korrektur kann den Bestand gedeckt haben. Wahr ist nur, dass die
   * Markierung noch steht, obwohl kein Unterbestand mehr besteht.
   */
  wareOffenbarDa: boolean;
};

export function bestellvorschlag(db: Leser): BestellZeile[] {
  const bestand = bestandJeArtikel(db, HANDLAGER_ID);
  return db
    .select()
    .from(artikel)
    .where(eq(artikel.aktiv, true))
    .all()
    .map((a) => {
      const b = bestand.get(a.id) ?? 0;
      const unterMindest = braucht(b, a.mindestbestand);
      return {
        id: a.id, name: a.name, einheit: a.einheit, fach: a.fach,
        bestand: b, mindestbestand: a.mindestbestand,
        vorschlag: vorschlagsmenge(b, a.mindestbestand),
        bestellt: Boolean(a.bestelltAt),
        bestelltSeit: a.bestelltAt ?? null,
        wareOffenbarDa: Boolean(a.bestelltAt) && !unterMindest,
      };
    })
    .filter((z) => braucht(z.bestand, z.mindestbestand) || z.wareOffenbarDa)
    .sort((a, b) => {
      // Echte Unterbestaende bleiben der dringende Block. Bereits wieder
      // gedeckte Markierungen folgen gesammelt, damit ein alphabetisch frueher
      // Name keine Ruecknahme vor einen offenen Bestellbedarf schiebt.
      const nachrang = Number(a.wareOffenbarDa) - Number(b.wareOffenbarDa);
      if (nachrang !== 0) return nachrang;
      const nachName = a.name.localeCompare(b.name, "de");
      return nachName || a.id.localeCompare(b.id);
    });
}
