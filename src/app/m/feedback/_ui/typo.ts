import type { CSSProperties } from "react";
import { SCHRIFT, ZIFFERN as ZIFFERN_SUITE } from "@/core/theme/schrift";

/**
 * DIE TYPO-LEITER DES MODULS — SEIT 2026-08-12 EIN ADAPTER.
 *
 * Die Werte kommen aus `core/theme/schrift.ts`. Der Grund fuer den Umzug: die
 * Leiter dieses Moduls und die von `lagerbuch` waren zwei unabhaengig
 * entstandene Fassungen derselben Sache — beide auf antds Leiter, beide mit
 * tabellarischen Ziffern, verschieden nur in den Namen. Das ist der zweite,
 * heute belegbare Nutznieszer, den `docs/design/README.md` fuer `core` verlangt.
 *
 * DIE NAMEN DIESES MODULS BLEIBEN. `T.kicker`, `T.meta`, `T.body` … stehen an
 * ueber hundert Stellen; sie umzubenennen waere Arbeit ohne Ertrag und ein
 * Risiko ohne Gegenwert. Der Adapter ist die billigere Haelfte.
 *
 * DIE FARBE BLEIBT EBENFALLS HIER. `core` traegt bewusst keine — sonst muesste
 * sie einem der beiden Module aufgezwungen werden. `--fb-muted` ist die Farbe
 * DIESES Entwurfs (§4.7), und sie ist nicht `--ant-*`: antd deklariert seine
 * Variablen auf der Scope-Klasse SEINER Komponenten, eigenes Markup sieht sie
 * nie, und der Ausfall waere still. Die eigenen Variablen stehen in
 * `feedback.css`.
 *
 * WAS SICH SICHTBAR AENDERT, IST GENAU EINES: die Familie. `kicker`, `h1`,
 * `h2` und `zahl` tragen jetzt die Display-Familie der Suite. Groeszen,
 * Gewichte, Laufweiten, Zeilenhoehen und Farben bleiben, was §4.7 fuer dieses
 * Modul festlegt — auch dort, wo die Suite-Rolle etwas anderes vorschlaegt.
 * Die Abweichungen stehen einzeln an ihrer Rolle, mit Grund.
 *
 * DIE LAUFWEITE IST DER FALL, AN DEM DAS ZUERST AUFFIEL: die Suite-Rolle
 * traegt 0.09em (aus dem alten Lagerbuch), dieses Modul .12em. Beide sind
 * entschieden, keine ist Drift.
 *
 * ZWEI FORMEN UNTEN, UND DAS IST EINE REGEL, KEIN ZUFALL. Wo die Suite-Rolle
 * nur traegt, was hier ohnehin gilt, wird sie GESPREADET und hoechstens EINE
 * abweichende Eigenschaft danach ueberschrieben (`kicker` mit `.12em`;
 * `meta`, `body` unveraendert). Das ist der Normalfall — und der ganze Zweck
 * der gemeinsamen Leiter: geteilt wird, was geteilt ist. Wuerden Groesze und
 * Gewicht hier wieder als Literale ausgeschrieben, waere diese Datei keine
 * Anpassung mehr, sondern eine Kopie, und `core/theme/schrift.ts` haette
 * seinen zweiten, heute belegbaren Nutznieszer verloren. Wo die Suite-Rolle
 * dagegen etwas MITBRINGT, das §4.7 fuer dieses Modul ausdruecklich nicht
 * will, geht das Spreaden-und-Ueberschreiben nicht — aus einem Spread laesst
 * sich nichts wieder herausnehmen. `h1`, `h2` und `zahl` picken deshalb
 * gezielt nur die `fontFamily` und schreiben den Rest selbst aus: betroffen
 * sind `letterSpacing` (h1, h2) und `lineHeight` (h1, zahl) — §4.7 nennt fuer
 * diese Rollen keine, und diese Datei hielt schon vor dem Adapter ausdruecklich
 * fest, dass das Absicht ist (kein Wert, den ein spaeterer Leser fuer geprueft
 * haelt).
 *
 * WAS HIER BLEIBT UND NICHT NACH `core` DARF: `lead` (16/600). Die Rolle hat in
 * `lagerbuch` kein Gegenstueck; eine Rolle mit einem Anwender ist eine
 * Konvention, keine Komponente — dieselbe Regel, die den Umzug rechtfertigt.
 */

/**
 * Ziffern durchgehend tabellarisch (§4.7): Ruecklaufzaehler, Notenmittel und
 * Datumsangaben stehen in Tabellen und Karten untereinander — mit
 * proportionalen Ziffern wandert die Spalte bei jedem Wert.
 *
 * Exportiert fuer die EINE Stelle mit einer Groesse ausserhalb der Leiter (die
 * Notenplakette, 40/700 laut §3.2): sie braucht die Ziffernstellung, nicht die
 * Groesse von `T.zahl` — die gehoert laut §4.7 allein dem Ruecklaufzaehler.
 */
export const ZIFFERN: CSSProperties = ZIFFERN_SUITE;

export const T = {
  /** 12/600, uppercase — Kartentitel, Spaltenkoepfe, Achsenlabel, Feld-Labels. */
  kicker: {
    ...SCHRIFT.kicker,
    // .12em, NICHT die 0.09em der Suite-Rolle: der Entwurf dieses Moduls nennt
    // .12em (§4.7), und `Noten.test.tsx` pinnt es. Die beiden Leitern waren in
    // der Laufweite schon immer verschieden — feedback .12em, lagerbuch .09em —
    // und das ist kein Drift, sondern zweimal entschieden. Wer sie
    // vereinheitlichen will, aendert den Entwurf, nicht diese Zeile.
    letterSpacing: ".12em",
    color: "var(--fb-muted)",
  },
  /** 12/400 — Metazeilen, Fristen, Hilfetexte, Feldfehler, Zeichenzaehler. */
  meta: { ...SCHRIFT.neben, color: "var(--fb-muted)" },
  /**
   * 14/400 — Fliesztext, Tabellenzellen, Fragetexte. Knoepfe tragen laut §4.7
   * dieselbe Groesse mit 600; das ist antds `Button`-Vorgabe und braucht keine
   * eigene Rolle (`{ ...T.body, fontWeight: 600 }` am Ort der Verwendung).
   */
  body: SCHRIFT.text,
  /**
   * 16/600 — Gruppenname auf Einstiegskarten, Kartenueberschrift 2. Ordnung.
   * MODULEIGEN: 16 liegt auf antds Leiter, aber die Rolle hat auszerhalb dieses
   * Moduls keinen Anwender (siehe Kopf) — kein Gegenstueck in `core/theme/schrift.ts`.
   */
  lead: { ...ZIFFERN_SUITE, fontSize: 16, fontWeight: 600 },
  /**
   * 20/600 — Ueberschrift der Lagekarte, `Statistic` „Letzter Abend". Nur die
   * Familie kommt aus `core`: §4.7 nennt fuer diese Rolle weder Laufweite noch
   * Zeilenhoehe, und diese Datei hielt das schon immer bewusst offen (siehe
   * Kopf) — die 0.02em der Suite-Rolle `unterTitel` (aus `lagerbuch`) werden
   * hier nicht mitgenommen.
   */
  h2: { ...ZIFFERN_SUITE, fontFamily: SCHRIFT.unterTitel.fontFamily, fontSize: 20, fontWeight: 600 },
  /**
   * 24/600 — `<h1>`. Nur die Familie kommt aus `core`, aus demselben Grund wie
   * bei `h2`: §4.7 nennt weder Laufweite noch Zeilenhoehe. Die Suite-Rolle
   * `titel` traegt 0.02em Laufweite und `lineHeight: 1.2` — das ist die
   * Vorgabe fuer `lagerbuch`, nicht fuer dieses Modul.
   */
  h1: { ...ZIFFERN_SUITE, fontFamily: SCHRIFT.titel.fontFamily, fontSize: 24, fontWeight: 600 },
  /**
   * 30/600 — NUR der laufende Ruecklaufzaehler. Sonst nirgends. Familie kommt
   * aus `core`; das Gewicht bleibt 600 (die Suite-Rolle `zahl` ist 700 — das
   * gilt fuer `lagerbuch`s Zaehler, nicht fuer diesen). `lineHeight` bleibt wie
   * bisher unbesetzt: §4.7 nennt keine, und die Suite-Rolle traegt
   * `lineHeight: 1` nur fuer `lagerbuch`.
   */
  zahl: { ...ZIFFERN_SUITE, fontFamily: SCHRIFT.zahl.fontFamily, fontSize: 30, fontWeight: 600 },
} satisfies Record<string, CSSProperties>;

export type TypoRolle = keyof typeof T;
