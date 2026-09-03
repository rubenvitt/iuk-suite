import { and, desc, eq } from "drizzle-orm";
import type { DB } from "./client";
import { eigeneZeichen } from "./schema";

/*
 * DIE ZUGRIFFE AUF `eigene_zeichen` — bewusst eine eigene Datei und nicht
 * `_db/queries.ts`: dort liegen die Abfragen fuer Katalog und Merkliste aus der
 * vorigen Aufgabe, und zwei Autoren in derselben Datei sind ein Konflikt ohne
 * Gegenwert. Diese Tabelle hat genau einen Konsumenten.
 *
 * ABFRAGEN MIT DEM QUERY-BUILDER: `db.query.*` und `relations()` kommen im ganzen
 * Repo null mal vor.
 *
 * ⛔ `sub` KOMMT IMMER AUS `auth()`, NIE AUS EINEM URL-PARAMETER. Jede Funktion
 * hier filtert auf ihn — es gibt keinen Lesepfad, der ohne ihn auskommt.
 *
 * ⚠️ `spec_kanon` IST EIN PERSISTIERTES VERGLEICHSFORMAT, KEIN STABILER VERTRAG.
 * Der Wert entsteht in `_lib/kanon.ts`, und dessen Serialisierung hat sich waehrend
 * der Entwicklung bereits einmal geaendert (Arrays sind seit Aufgabe 2 geklammert).
 * Solange niemand ihn speicherte, war das folgenlos — mit dieser Tabelle steht er
 * in der Datenbank. Aendert sich das Format erneut, beantwortet die Lesefrage
 * „diese Zusammenstellung habe ich schon gespeichert?" fuer JEDE alte Zeile still
 * „nein", und der Baukasten bietet eine Dublette an, die laengst existiert.
 * Wer `kanonischerSchluessel` anfasst, schuldet also eine Migration, die diese
 * Spalte neu rechnet — `spec_json` traegt dafuer alles Noetige.
 */

export interface EigenesZeichenZeile {
  id: string;
  name: string;
  specJson: string;
  specKanon: string;
  svg: string;
  paketVersion: string;
  datenVersion: string;
  geaendertAm: Date;
}

export interface EigenesZeichenWerte {
  sub: string;
  name: string;
  specJson: string;
  specKanon: string;
  svg: string;
  paketVersion: string;
  datenVersion: string;
}

const AUSWAHL = {
  id: eigeneZeichen.id,
  name: eigeneZeichen.name,
  specJson: eigeneZeichen.specJson,
  specKanon: eigeneZeichen.specKanon,
  svg: eigeneZeichen.svgZwischenspeicher,
  paketVersion: eigeneZeichen.paketVersion,
  datenVersion: eigeneZeichen.datenVersion,
  geaendertAm: eigeneZeichen.geaendertAm,
};

export function eigeneZeichenVon(db: DB, sub: string): EigenesZeichenZeile[] {
  return db
    .select(AUSWAHL)
    .from(eigeneZeichen)
    .where(eq(eigeneZeichen.sub, sub))
    .orderBy(desc(eigeneZeichen.geaendertAm))
    .all();
}

export function eigenesZeichenMitNamen(
  db: DB,
  sub: string,
  name: string,
): EigenesZeichenZeile | null {
  const treffer = db
    .select(AUSWAHL)
    .from(eigeneZeichen)
    .where(and(eq(eigeneZeichen.sub, sub), eq(eigeneZeichen.name, name)))
    .all();
  return treffer[0] ?? null;
}

/**
 * Die LESEFRAGE „diese Zusammenstellung habe ich schon gespeichert?". Der Index
 * darauf ist bewusst NICHT eindeutig; hier wird gelesen, nicht durchgesetzt.
 */
export function eigenesZeichenMitKanon(
  db: DB,
  sub: string,
  kanon: string,
): EigenesZeichenZeile | null {
  const treffer = db
    .select(AUSWAHL)
    .from(eigeneZeichen)
    .where(and(eq(eigeneZeichen.sub, sub), eq(eigeneZeichen.specKanon, kanon)))
    .all();
  return treffer[0] ?? null;
}

export function legeEigenesZeichenAn(db: DB, werte: EigenesZeichenWerte): string {
  const jetzt = new Date();
  const zeilen = db
    .insert(eigeneZeichen)
    .values({
      sub: werte.sub,
      name: werte.name,
      specJson: werte.specJson,
      specKanon: werte.specKanon,
      svgZwischenspeicher: werte.svg,
      paketVersion: werte.paketVersion,
      datenVersion: werte.datenVersion,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    })
    .returning({ id: eigeneZeichen.id })
    .all();
  return zeilen[0].id;
}

/**
 * ⛔ KEIN `onConflictDoUpdate`. Ueberschrieben wird nur, wenn die Person die
 * Rueckfrage aus §6.6 ausdruecklich beantwortet hat — die Entscheidung faellt in
 * `konfliktFrage`, nicht in einer SQL-Klausel.
 */
export function ueberschreibeEigenesZeichen(
  db: DB,
  id: string,
  werte: Omit<EigenesZeichenWerte, "sub" | "name">,
): void {
  db.update(eigeneZeichen)
    .set({
      specJson: werte.specJson,
      specKanon: werte.specKanon,
      svgZwischenspeicher: werte.svg,
      paketVersion: werte.paketVersion,
      datenVersion: werte.datenVersion,
      geaendertAm: new Date(),
    })
    .where(eq(eigeneZeichen.id, id))
    .run();
}
