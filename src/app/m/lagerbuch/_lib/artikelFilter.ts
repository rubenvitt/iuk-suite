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
import { falte } from "./suche";

export type ArtikelFilterZeile = {
  name: string;
  fach: string;
  aktiv: boolean;
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
};

export const LEERER_FILTER: ArtikelFilterZustand = {
  suche: "", nurUnterMindest: false, nurChargeKritisch: false, ohneInaktive: false,
};

/**
 * Alle vier Bedingungen sind UND-verknuepft. Leere Suche laesst alles durch.
 *
 * Die Faltung laeuft ueber `falte()` aus `_lib/suche.ts` — DIE EINE Faltung des
 * Moduls (§5.13.2) — und wird hier NICHT nachgebaut. `falte()` faltet Umlaute
 * korrekt und ß/ss ausdruecklich NICHT (§5.20); ein eigenes `toLowerCase()`
 * traefe bei den heutigen Zeichen zufaellig dieselbe Entscheidung, liefe der
 * SQL-Haelfte (`lb_falte`, registriert in `_db/client.ts`) aber auseinander,
 * sobald sich die Faltung je aendert.
 */
export function artikelTrifft(z: ArtikelFilterZeile, f: ArtikelFilterZustand): boolean {
  if (f.ohneInaktive && !z.aktiv) return false;
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
): T[] {
  return zeilen.filter((z) => artikelTrifft(z, f));
}
