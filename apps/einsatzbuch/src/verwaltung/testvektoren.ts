/**
 * Blöcke, CEKs und Einsätze aus den eingefrorenen Testvektoren des Kerns
 * (`@kern/testvektoren/erwartet.json`, `eingaben.json`) — nur für Tests dieser App. Die JSON-
 * Typen kennen `umgebung` nur als `string`, deshalb der Cast auf die Kern-Typen.
 */
import type { Block, Einsatz } from "@kern/format";
import eingaben from "@kern/testvektoren/eingaben.json";
import erwartet from "@kern/testvektoren/erwartet.json";

import type { Schluesselposten } from "../typen";

export const BLOECKE = erwartet.bloecke as Block[];
export const EINSAETZE = eingaben.einsaetze as Einsatz[];
export const CEKS: Schluesselposten[] = eingaben.bloecke.map((b, i) => ({ block: i + 1, cek: b.cek }));
