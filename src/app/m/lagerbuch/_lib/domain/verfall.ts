/**
 * Die Verfallsampel — die Kernsprache dieses Moduls.
 *
 * KEIN "use client". Die Ampel wird von Server Components entschieden und von
 * Client-Inseln nur DARGESTELLT; ein Wert aus einem Client-Modul kaeme in einer
 * Server Component als Client-Referenz an (Falle 6, `CLAUDE.md:24-27`).
 *
 * KEIN Icon-Import, kein JSX, kein Hexwert. Diese Datei entscheidet, WELCHE Farbe
 * gilt — nicht, wie sie aussieht. Die Palette liegt in `_lib/ampel.ts` (Teil 5,
 * §6.6.2); ein hier festgenagelter Hexwert entschiede Entscheidung 30 versehentlich
 * mit (§12.1, Punkt 4).
 */
import { monatsEnde } from "../zeit";
import { grenzen } from "../grenzen";

/**
 * Die drei Ampelzustaende. EIN Typ fuer vier Rechnungen — `verfallStatus`,
 * `o2Status`, `datumFaelligkeit` und `bzFaelligkeit` sprechen dieselbe Sprache.
 * Ein zweiter Literal-Union in `o2.ts` waere die Typinkonsistenz, gegen die die
 * Produces-Bloecke geschrieben sind.
 */
export type Ampel = "rot" | "gelb" | "gruen";

/**
 * DIE NAMEN TRAGEN IHRE FARBE UND IHRE EINHEIT (§10.1, Festlegung H2).
 *
 * Die Alt-Anwendung heisst sie `{ kritisch, faellig }` — und genau diese zwei
 * Namen sind der Fehler: „kritisch" klingt dringender als „faellig", ist aber das
 * KLEINERE Fenster. Vertauscht man die Werte beim Uebertragen, wirft nichts: der
 * Gelb-Zweig wird unerreichbar, weil jede Charge mit `tage <= 56` schon im
 * Rot-Zweig gelandet ist. Die Ampel hat danach zwei Zustaende statt drei, elf
 * Aufrufstellen zeigen sie, und kein Gate sieht es.
 */
export type VerfallSchwellen = { rotTage: number; gelbTage: number };

export type VerfallStatus = {
  ampel: Ampel;
  /** Kalendertage bis zum Monatsende, AUFGERUNDET. Negativ, wenn abgelaufen. */
  tage: number;
  /**
   * `abgelaufen` und `ampel === "rot"` sind NICHT dasselbe: eine abgelaufene
   * Charge ist immer rot, eine rote nicht immer abgelaufen. Die Verfallsliste
   * sortiert danach in drei Raengen (§5.6.1).
   */
  abgelaufen: boolean;
};

/**
 * Ampel, Resttage und Ablaufkennzeichen fuer ein Monatsdatum "YYYY-MM".
 *
 * Das Monatsende kommt aus `_lib/zeit.ts#monatsEnde` — ZONENEXPLIZIT. Die
 * Alt-Anwendung bildet es mit `new Date(y, m, 0, 23,59,59,999)` (`verfall.ts:10`),
 * also aus lokalen Komponenten: unter TZ=UTC schnitte sie das Monatsende zwei
 * Stunden SPAETER. Beide Ampelgrenzen wanderten dabei in die harmlose Richtung —
 * kaputt ginge `fmtTs`, wo eine Buchung um 01:30 Ortszeit als Vortag 23:30
 * erschiene (§5.16). Unter Entscheidung 26 (b) tritt keiner der Faelle ein.
 *
 * `now` ist ein PARAMETER und keine Vorbelegung: eine Funktion, die `new Date()`
 * selbst bildet, ist nur mit gefaelschter Uhr pruefbar.
 */
export function verfallStatus(
  verfall: string,
  schwellen: VerfallSchwellen,
  now: Date,
): VerfallStatus {
  const ende = monatsEnde(verfall);
  // AUFGERUNDET: eine Charge, die in 12 Stunden ablaeuft, hat tage = 1, nicht 0.
  const tage = Math.ceil((ende.getTime() - now.getTime()) / 86_400_000);
  const abgelaufen = ende.getTime() < now.getTime();
  let ampel: Ampel;
  if (tage <= schwellen.rotTage) ampel = "rot";
  else if (tage <= schwellen.gelbTage) ampel = "gelb";
  else ampel = "gruen";
  return { ampel, tage, abgelaufen };
}

/**
 * DIE EINZIGE BRUECKE zwischen `_lib/grenzen.ts` und dieser Datei.
 *
 * Kein Lesepfad baut `{ rotTage, gelbTage }` selbst. Gaebe es zwei Bauorte,
 * koennte einer die Felder vertauschen — und der ganze Zweck der Umbenennung
 * waere dahin.
 *
 * GELESEN WIRD BEI JEDEM AUFRUF, nicht beim Import (§10.8, Eigenschaft 3): ein
 * Modul-Singleton wuerde von `next build` ausgewertet, das mit
 * NODE_ENV=production und ohne .env laeuft.
 *
 * ⚠️ Diese Funktion prueft die KOPPLUNG NICHT. `rotTage > gelbTage` ist eine
 * Boot-Pruefung (§10.5, Pruefung 2) und liegt in `grenzenFehler()` (T32) — der
 * Boot will alle Fehler auf einmal melden, nicht den ersten, und eine
 * Leseseite darf an einer Fehlkonfiguration nicht mit einem Wurf enden.
 */
export function verfallSchwellen(
  env: Record<string, string | undefined> = process.env,
): VerfallSchwellen {
  const g = grenzen(env);
  return { rotTage: g.verfallRotTage, gelbTage: g.verfallGelbTage };
}
