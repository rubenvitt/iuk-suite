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
   *
   * ⚠️ In der Liste, die `bestellvorschlag` liefert, ist dieses Feld IMMER
   * `false`: die Funktion gibt nur Artikel unter Mindestbestand zurueck, und
   * „unter Mindestbestand" schliesst „offenbar wieder da" per Definition aus.
   * Das Feld gehoert trotzdem zur Zeile und nicht in die Komponente, weil die
   * Auflage an Teil 5 (Brief, Befund 3) vorsieht, dass DIE SEITE beide Mengen
   * zeigt — den Vorschlag UND die bereits bestellten Artikel, die wieder
   * gedeckt sind. Wie Teil 5 an die zweite Menge kommt, entscheidet Teil 5;
   * dieser Lesepfad legt nur die Berechnung in die Zeile statt in eine
   * Komponente.
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
    .filter((z) => braucht(z.bestand, z.mindestbestand));
}
