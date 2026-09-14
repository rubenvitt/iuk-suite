/**
 * Die Journalzeile in der Form, die ueber die Client-Grenze reist — und der
 * Umwandler dorthin.
 *
 * ⚠️ KEIN "use client", UND DAS IST DER GANZE GRUND FUER DIESE DATEI (Falle 6).
 * Beide Werte standen bis DRK-331 in `journal/JournalTable.tsx`, also in einem
 * `"use client"`-Modul — und wurden von ZWEI Serverstellen gerufen:
 * `journal/page.tsx` (Server Component) und `_actions/journal.ts`
 * (`"use server"`). Ein WERT aus einem Client-Modul kommt dort nicht an; die
 * Server Component bekommt eine Client-Referenz statt der Funktion, und der
 * Aufruf endet in HTTP 500 fuer die GANZE Seite.
 *
 * ⚠️ KEIN TOR HAETTE DAS GEFUNDEN. `typecheck` ist zufrieden (Typen sind
 * geloescht), `build` serialisiert klaglos, und **Vitest kann es strukturell
 * nicht sehen** — dort ist `"use client"` eine wirkungslose Zeichenkette, die
 * Funktion laeuft im selben Prozess und tut genau das Richtige. Gefunden hat es
 * ein Review, nicht ein Lauf.
 *
 * WER HIER ETWAS ERGAENZT, PRUEFT ZUERST: gibt es einen Serverleser? Dann bleibt
 * die Datei ohne Direktive.
 */
import type { JournalZeileRoh } from "./lesepfade/journal";

/**
 * ⚠️ `ts` IST EINE ISO-ZEICHENKETTE, KEIN `Date`. `journal/page.test.tsx` haelt
 * fuer diese Grenze fest, dass alles, was hinuebergeht, REKURSIV PRIMITIV ist.
 * React serialisiert ein `Date` zwar von sich aus, aber die Grenze wird auf ZWEI
 * Wegen ueberquert — Server Component und Server Action —, und eine
 * Zeichenkette verhaelt sich auf beiden gleich.
 */
export type JournalZeileDTO = Omit<JournalZeileRoh, "ts"> & { ts: string };

/** Aus einer gelesenen Zeile die Form, die ueber die Grenze darf. */
export function journalZeileDTO(zeile: JournalZeileRoh): JournalZeileDTO {
  return { ...zeile, ts: zeile.ts.toISOString() };
}
