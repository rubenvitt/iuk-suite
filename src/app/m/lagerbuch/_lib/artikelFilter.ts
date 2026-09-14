/**
 * Das Artikellisten-Praedikat, gehoben aus `ArtikelTable.tsx:112-123`.
 *
 * WARUM ES GEHOBEN WIRD (§12.1, Punkt 2): es steht heute als `useMemo` INLINE in
 * der Komponente — es gibt NICHTS, was ein Unit-Test importieren koennte, und die
 * einzige Absicherung ist ein E2E, der nur den Namen probiert. Nebenbefund: das
 * Praedikat sucht ueber Name, Fach UND Chargennummer.
 *
 * Kein "use client": die Datei wird von der Client-Insel der Tabelle UND vom
 * Excel-Export gelesen, und der Export laeuft ab Teil 6 ueber eine Server-Route.
 *
 * ⚠️ DIE SORTIERUNG IST NICHT HIER. Die sechs Sortierungen der Artikelliste sind
 * §6.9.4 und damit Teil 5 — hier steht nur das FILTER-Praedikat. Wer beides
 * zusammenlegt, macht aus einer reinen Funktion einen Anzeige-Entwurf.
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
   * diesem Modul keine (`lesepfade/artikel.ts:90`, §5.2.1). Die Zeile fuehrt
   * die Zahl selbst und keinen vorgerechneten Merker: sie steht ohnehin schon
   * auf jeder Zeile, und ein `bestandNull: boolean` waere ein zweiter Ort, an
   * dem dieselbe Schwelle steht.
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
  nurUnterMindest: boolean;
  nurChargeKritisch: boolean;
  ohneInaktive: boolean;
  ohneBestandNull: boolean;
};

export const LEERER_FILTER: ArtikelFilterZustand = {
  suche: "", nurUnterMindest: false, nurChargeKritisch: false, ohneInaktive: false,
  // AUS. Ein vorgewaehltes Ausblenden zeigte beim ersten Aufschlagen eine
  // verkuerzte Liste, ohne dass jemand danach gefragt haette — ein fehlender
  // Artikel sieht dann aus wie ein geloeschter (DRK-295, offene Frage 2).
  ohneBestandNull: false,
};

const KEINE_KATEGORIEN: ReadonlySet<string> = new Set();

/**
 * Alle Bedingungen sind UND-verknuepft. Leere Suche laesst alles durch.
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
 * die Chips gelten nur fuer den Moment, und „Zuruecksetzen" setzt
 * `LEERER_FILTER` — laege die Auswahl darin, loeschte der Knopf still eine
 * gespeicherte Einstellung. Ein Artikel OHNE Kategorie bleibt immer stehen: ein
 * frisch angelegter Artikel darf nicht aus der Liste verschwinden.
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
  if (f.ohneInaktive && !z.aktiv) return false;
  // `=== 0`, NICHT `<= 0`. Ein negativer Handlagerbestand kann heute nicht
  // entstehen (Invariante I2, `schreibpfade/abbuchung.ts:20`) — waere er doch
  // da, ist er ein Buchungsfehler und muss SICHTBAR bleiben. Ein Filter, der
  // Rauschen wegnehmen soll, darf nicht ausgerechnet die eine Zeile schlucken,
  // die jemanden braucht.
  if (f.ohneBestandNull && z.bestand === 0) return false;
  if (f.nurUnterMindest && !z.unterMindest) return false;
  if (f.nurChargeKritisch && !z.chargeKritisch) return false;
  const q = falte(f.suche.trim());
  if (!q) return true;
  // DREI Felder, 1:1 aus `ArtikelTable.tsx:119`.
  const heuhaufen = falte(`${z.name} ${z.fach} ${z.naechsteCharge?.chargenNr ?? ""}`);
  return heuhaufen.includes(q);
}

/**
 * Die abgeleitete Liste — DIESELBE fuer Tabelle und Excel-Export.
 *
 * ⚠️ AUFLAGE AN TEIL 6 (§9.4): der Export ruft `artikelFiltern` mit demselben
 * Filterzustand, nie `bestandExportZeilen(alleZeilen)`. Sonst exportiert der Knopf
 * still wieder alles, sobald Filtern in antds Table-eigenen Zustand wandert.
 */
export function artikelFiltern<T extends ArtikelFilterZeile>(
  zeilen: T[], f: ArtikelFilterZustand,
  ausgeblendeteKategorien: ReadonlySet<string> = KEINE_KATEGORIEN,
): T[] {
  return zeilen.filter((z) => artikelTrifft(z, f, ausgeblendeteKategorien));
}
