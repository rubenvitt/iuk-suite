/**
 * DRK-299 — welche Inventurzeilen SICHTBAR sind. Reine Funktion, kein
 * "use client". Der Filter blendet nur aus: gezaehlte Werte ausgeblendeter
 * Zeilen bleiben im Zaehlzustand und werden mitgebucht (Spec §A).
 *
 * Kategorien kommen als GEFALTETE Schluessel — dieselbe Faltung wie DRK-294,
 * nicht nachgebaut. Ein Artikel ohne Kategorie erscheint nur ohne
 * Kategorienfilter: wer „Hygiene" zaehlt, zaehlt keine unkategorisierten Teile.
 */
import { kategorieNormalisieren, kategorieSchluessel } from "./kategorie";
import { falte } from "./suche";

export type InventurFilter = { kategorien: readonly string[]; faecher: readonly string[] };

export const LEERER_INVENTUR_FILTER: InventurFilter = { kategorien: [], faecher: [] };

export function inventurTrifft(z: { fach: string; kategorie: string | null }, f: InventurFilter): boolean {
  if (f.kategorien.length > 0) {
    const k = kategorieNormalisieren(z.kategorie);
    if (k === null || !f.kategorien.includes(kategorieSchluessel(k))) return false;
  }
  if (f.faecher.length > 0 && !f.faecher.includes(z.fach)) return false;
  return true;
}

export function filterIstLeer(f: InventurFilter): boolean {
  return f.kategorien.length === 0 && f.faecher.length === 0;
}

/**
 * IDA-237 — DIE SUCHE DER ZAEHLLEISTE: Artikelname oder Fach, gefaltet wie jede
 * andere Suche im Modul (`falte`, eine Quelle fuer alle).
 *
 * ⚠️ SIE IST NAVIGATION, KEIN UMFANG. Anders als Kategorie und Fach geht sie
 * weder in den Umfang des Laufs (append-only Verlauf) noch in den Hinweis
 * „ausgeblendet, wird mitgebucht": wer nach Artikel 137 sucht, zaehlt danach
 * Artikel 138 — die Suche wechselt bei jeder Zeile, der Umfang nicht. Was
 * insgesamt erfasst ist, sagt die Abschlussleiste.
 */
export function inventurSucheTrifft(z: { name: string; fach: string }, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === "" || falte(`${z.name} ${z.fach}`).includes(suche);
}
