/**
 * Das Artikellisten-Praedikat, gehoben aus `ArtikelTable.tsx`.
 *
 * Kein "use client": die Datei wird von der Client-Insel der Tabelle UND vom
 * Excel-Export gelesen, und der Export laeuft ab Teil 6 ueber eine Server-Route.
 *
 * ⚠️ DIE SORTIERUNG IST NICHT HIER und war es nie. Seit die Spaltenkoepfe
 * sortieren (DRK-331), liegt sie ganz bei antd — `columns[].sorter` mit den
 * Vergleichern aus `@/core/tabelle`.
 *
 * ⚠️ HIER STEHEN NUR NOCH ZWEI BEDINGUNGEN: die Freitextsuche und die je Konto
 * gespeicherten ausgeblendeten Kategorien. Die vier Haken „unter
 * Mindestbestand", „Charge kritisch", „inaktive ausblenden" und „Bestand 0
 * ausblenden" lagen bis DRK-331 ebenfalls hier und sind jetzt SPALTENFILTER
 * (`zustandsFilter` aus `@/core/tabelle`). Sie als tote Schalter
 * stehenzulassen, waere ein zweiter Ort fuer dieselbe Frage gewesen — und der
 * teurere, weil ein spaeterer Leser nicht sieht, dass niemand sie mehr setzt.
 *
 * WAS DAS FUER DEN EXPORT HEISST (§9.4, Entscheidung 9-E): die Zusage bleibt
 * „exportiert wird, was du siehst", aber die Quelle dafuer ist nicht mehr
 * `artikelFiltern` allein. Was auf dem Schirm steht, weiss jetzt antd; die
 * Tabelle liest es ueber `onChange(…, extra.currentDataSource)` und gibt genau
 * das an den Export. Die alte Auflage („der Export ruft `artikelFiltern` mit
 * demselben Filterzustand") ist damit nicht verletzt, sondern erfuellt — nur an
 * der Stelle, an der die Wahrheit seither liegt.
 */
import { kategorieNormalisieren, kategorieSchluessel } from "./kategorie";
import { falte } from "./suche";

export type ArtikelFilterZeile = {
  name: string;
  fach: string;
  aktiv: boolean;
  /** DRK-294 — die Schreibweise am Artikel; `null` heisst „ohne Kategorie". */
  kategorie: string | null;
  /**
   * DER HANDLAGER-BESTAND, nicht die Summe ueber alle Lagerorte — es gibt in
   * diesem Modul keine (`lesepfade/artikel.ts`, §5.2.1).
   */
  bestand: number;
  /** vorgerechnet im Lesepfad — `braucht(bestand, mindestbestand)` */
  unterMindest: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
  /** vorgerechnet im Lesepfad — die naechste Charge ist rot oder gelb */
  chargeKritisch: boolean;
};

export type ArtikelFilterZustand = {
  suche: string;
};

export const LEERER_FILTER: ArtikelFilterZustand = { suche: "" };

const KEINE_KATEGORIEN: ReadonlySet<string> = new Set();

/**
 * Leere Suche laesst alles durch.
 *
 * Die Faltung laeuft ueber `falte()` aus `_lib/suche.ts` — DIE EINE Faltung des
 * Moduls (§5.13.2) — und wird hier NICHT nachgebaut. `falte()` faltet Umlaute
 * korrekt und ß/ss ausdruecklich NICHT (§5.20); ein eigenes `toLowerCase()`
 * traefe bei den heutigen Zeichen zufaellig dieselbe Entscheidung, liefe der
 * SQL-Haelfte (`lb_falte`, registriert in `_db/client.ts`) aber auseinander,
 * sobald sich die Faltung je aendert.
 *
 * `ausgeblendeteKategorien` (DRK-294) traegt GEFALTETE Schluessel und steht
 * bewusst NICHT in `ArtikelFilterZustand`: die Auswahl ist je Konto gespeichert,
 * die Spaltenfilter gelten nur fuer den Moment. Ein Artikel OHNE Kategorie
 * bleibt immer stehen: ein frisch angelegter Artikel darf nicht aus der Liste
 * verschwinden.
 */
export function artikelTrifft(
  z: ArtikelFilterZeile,
  f: ArtikelFilterZustand,
  ausgeblendeteKategorien: ReadonlySet<string> = KEINE_KATEGORIEN,
): boolean {
  const kategorie = kategorieNormalisieren(z.kategorie);
  if (kategorie !== null && ausgeblendeteKategorien.has(kategorieSchluessel(kategorie))) {
    return false;
  }
  const q = falte(f.suche.trim());
  if (!q) return true;
  // DREI Felder: Name, Fach und Chargennummer.
  const heuhaufen = falte(`${z.name} ${z.fach} ${z.naechsteCharge?.chargenNr ?? ""}`);
  return heuhaufen.includes(q);
}

/**
 * Die abgeleitete Liste — was die Tabelle als `dataSource` bekommt, BEVOR antds
 * Spaltenfilter darauf greifen.
 */
export function artikelFiltern<T extends ArtikelFilterZeile>(
  zeilen: T[], f: ArtikelFilterZustand,
  ausgeblendeteKategorien: ReadonlySet<string> = KEINE_KATEGORIEN,
): T[] {
  return zeilen.filter((z) => artikelTrifft(z, f, ausgeblendeteKategorien));
}

/**
 * Die Zustaende, die bis DRK-331 die vier Haken ueber der Tabelle waren — jetzt
 * Spaltenfilter, verteilt auf die Spalten, um die es jeweils geht.
 *
 * ⚠️ JEDER ZUSTAND HAT EIN GEGENSTUECK, und das ist die eigentliche Arbeit an
 * dieser Liste. Die alten Haken waren AUSSCHLUESSE („inaktive ausblenden",
 * „Bestand 0 ausblenden"), ein Spaltenfilter ist ein EINSCHLUSS. Wer nur
 * „inaktiv" anbietet, hat die Bedeutung umgedreht: angekreuzt zeigt er
 * ausschliesslich die inaktiven, und der alte Vorgang — die inaktiven
 * loswerden — laesst sich gar nicht mehr ausdruecken. Mit dem Gegenstueck
 * „aktiv" ist er wieder da, nur anders herum angeklickt.
 *
 * ⚠️ SIE STEHEN AUF VERSCHIEDENEN SPALTEN, nicht alle auf einer — und auch das
 * folgt aus der Bedeutung: antd verodert MEHRERE WERTE EINER Spalte und
 * verundet ZWISCHEN Spalten. Laegen alle sechs auf „Status", waere „aktiv UND
 * unter Mindestbestand" nicht mehr moeglich; genau diese Kombination war mit
 * den alten, unabhaengigen Haken aber der Normalfall. Verteilt auf Bestand,
 * Min., Verfall und Status ergibt das Und wieder das, was die Leiste konnte.
 *
 * ⚠️ `bestand === 0`, NICHT `<= 0`. Ein negativer Handlagerbestand kann heute
 * nicht entstehen (Invariante I2, `schreibpfade/abbuchung.ts`) — waere er doch
 * da, ist er ein Buchungsfehler und muss SICHTBAR bleiben. Er zaehlt deshalb zu
 * „Bestand vorhanden": ein Filter, der Rauschen wegnehmen soll, darf nicht
 * ausgerechnet die eine Zeile schlucken, die jemanden braucht.
 *
 * ⚠️ KEINER IST VORGEWAEHLT (DRK-295, offene Frage 2). Ein vorgewaehltes
 * Ausblenden zeigte beim ersten Aufschlagen eine verkuerzte Liste, ohne dass
 * jemand danach gefragt haette — ein fehlender Artikel sieht dann aus wie ein
 * geloeschter.
 */
export type ArtikelZustand = {
  readonly wert: string;
  readonly text: string;
  readonly trifft: (zeile: ArtikelFilterZeile) => boolean;
};

/** Spalte „Bestand". Loest „Bestand 0 ausblenden" ab — ueber das Gegenstueck. */
export const ARTIKEL_BESTAND_ZUSTAENDE: readonly ArtikelZustand[] = [
  { wert: "bestand-vorhanden", text: "Bestand vorhanden", trifft: (z) => z.bestand !== 0 },
  { wert: "bestand-null", text: "Bestand 0", trifft: (z) => z.bestand === 0 },
];

/** Spalte „Min.". Loest „unter Mindestbestand" ab. */
export const ARTIKEL_MINDEST_ZUSTAENDE: readonly ArtikelZustand[] = [
  { wert: "unter-mindest", text: "unter Mindestbestand", trifft: (z) => z.unterMindest },
  { wert: "mindest-erfuellt", text: "Mindestbestand erfüllt", trifft: (z) => !z.unterMindest },
];

/** Spalte „Naechster Verfall". Loest „Charge kritisch" ab. */
export const ARTIKEL_CHARGEN_ZUSTAENDE: readonly ArtikelZustand[] = [
  { wert: "charge-kritisch", text: "Charge kritisch", trifft: (z) => z.chargeKritisch },
  {
    wert: "charge-ruhig",
    text: "Charge unkritisch",
    trifft: (z) => z.naechsteCharge !== null && !z.chargeKritisch,
  },
  { wert: "ohne-charge", text: "ohne Charge", trifft: (z) => z.naechsteCharge === null },
];

/** Spalte „Status". Loest „inaktive ausblenden" ab — ueber das Gegenstueck. */
export const ARTIKEL_STATUS_ZUSTAENDE: readonly ArtikelZustand[] = [
  { wert: "aktiv", text: "aktiv", trifft: (z) => z.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (z) => !z.aktiv },
];

/** Alle vier Gruppen — fuer Pruefungen, die ueber die ganze Menge gehen. */
export const ARTIKEL_ZUSTAND_GRUPPEN: readonly (readonly ArtikelZustand[])[] = [
  ARTIKEL_BESTAND_ZUSTAENDE,
  ARTIKEL_MINDEST_ZUSTAENDE,
  ARTIKEL_CHARGEN_ZUSTAENDE,
  ARTIKEL_STATUS_ZUSTAENDE,
];
