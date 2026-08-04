/**
 * Alle Zahlen des Moduls `lagerbuch` an EINER Stelle, und jeder Name traegt
 * seine Einheit (§10.1, §10.3).
 *
 * KEIN "use client" in dieser Datei. Die Zahlen liest sowohl eine Server
 * Component (`verwaltung/artikel/page.tsx`) als auch eine Client-Insel (die
 * Zaehl-Liste) — und ein WERT aus einem Client-Modul kommt in einer Server
 * Component nicht an, sondern als Client-Referenz (Falle 6, `CLAUDE.md:24-27`).
 * HTTP 500 fuer die ganze Seite, das `pnpm build` nicht sieht und Vitest
 * strukturell nicht sehen KANN, weil "use client" dort ein wirkungsloser String
 * ist.
 *
 * DIESE DATEI HAELT KEINE MILLIMETER. Die Druckgeometrie des Etikettenbogens
 * (§8.4) ist CSS-Geometrie und gehoert dorthin; was Server- und Client-Seite
 * beide brauchen, liegt in `_lib/etikettMasse.ts`. Sie hier zu spiegeln erzeugte
 * eine zweite Wahrheit, die niemand gegen das Papier prueft.
 *
 * DIESE DATEI HAELT AUCH KEINE BOOT-PRUEFUNG. `grenzenFehler()` (§10.5) und
 * `_lib/boot.ts` entstehen in TEIL 3 und lesen dieselbe ZAHLEN-Tabelle von hier
 * — zwei Tabellen waeren zwei Wahrheiten, und der Boot pruefte etwas anderes als
 * das, was zur Laufzeit gilt.
 */

/** Wie in `core/hosts.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * Die Konfiguration traegt einen Wert, mit dem das Modul nicht arbeiten kann.
 * Ein EIGENER Typ, damit ein Aufrufer ihn von einem Betriebsfehler unterscheiden
 * kann — er ist immer ein Konfigurationsfehler, nie ein Laufzeitproblem.
 */
export class GrenzenUngueltig extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "GrenzenUngueltig";
  }
}

/** Die Einheit, die in JEDE Meldung zu dieser Variable gehoert (§10.1). */
type Einheit = "Tage" | "Stunden" | "Anzahl/min" | "Anzahl/h";

interface ZahlRegel {
  readonly einheit: Einheit;
  readonly min: number;
  readonly max: number;
  readonly vorgabe: number;
}

/**
 * Die Tabelle aus §10.3, vollstaendig — die EINZIGE Quelle. `grenzen()` und (ab
 * Teil 3) `grenzenFehler()` lesen beide von hier.
 *
 * ⚠️ LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE FEHLT mit Absicht. Entscheidung 22
 * (Backup-Job) ist offen; bis zur Betreiberantwort gilt Annahme A31 der Spec —
 * Variante (a), kein Hintergrund-Eintrag, Variable entfaellt ersatzlos. Faellt
 * die Antwort anders aus, ergaenzt Teil 3 EINE Zeile hier UND eine in der
 * unabhaengigen Testtabelle in `grenzen.test.ts`; nur eine von beiden macht den
 * Test rot, und das ist der Sinn der Doppelfuehrung.
 */
const ZAHLEN = {
  // Zu klein: Chargen laufen ab, ohne je rot gewesen zu sein — die Ampel warnt
  // zu spaet, und niemand merkt es, weil sie ja etwas anzeigt.
  LAGERBUCH_VERFALL_ROT_TAGE: { einheit: "Tage", min: 1, max: 3650, vorgabe: 31 },
  // Obergrenze 3650, weil die Kopplungspruefung allein ROT=9999, GELB=99999
  // durchliesse — und das ist eine Ampel, die immer leuchtet.
  LAGERBUCH_VERFALL_GELB_TAGE: { einheit: "Tage", min: 1, max: 3650, vorgabe: 56 },
  // Obergrenze 24: eine Feldsitzung darf nie laenger dauern als eine Schicht plus
  // Puffer. Der Wert steht ZWEIMAL in derselben Sitzung — als JWT-`exp` und als
  // Cookie-`maxAge` (§3.4.3); ein verlorenes Kaertchen gibt dem Finder genau so
  // lange Lesezugriff auf den gesamten Bestand, wie diese Zahl sagt.
  LAGERBUCH_HELFER_SITZUNG_STUNDEN: { einheit: "Stunden", min: 1, max: 24, vorgabe: 12 },
  // 1:1 die heutige Zusage (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`). Der Eimer
  // wird ab jetzt NUR bei Fehlversuchen verbraucht (§3.5.3) — dieselbe Zahl ist
  // damit deutlich grosszuegiger als heute.
  LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 60, vorgabe: 5 },
  // Die modulweite Burst-Kappe gegen Rotation des Absenderschluessels.
  // 30 = sechs Absender-Budgets.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 600, vorgabe: 30 },
  // DER tragende Zaehler. 300 = 5/min x 60 — die Zahl stellt genau die Zusage
  // wieder her, die das Per-Absender-Limit nur unter der Annahme einer
  // wahrhaftigen Absenderadresse je hatte.
  // ⚠️ Runbook: `select count(*) from tokens where aktiv = 1`; liegt die Zahl
  // oberhalb von etwa 60, gehoert dieser Wert gesenkt.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: { einheit: "Anzahl/h", min: 1, max: 3600, vorgabe: 300 },
} as const satisfies Record<string, ZahlRegel>;

type ZahlName = keyof typeof ZAHLEN;

/**
 * Die NAMEN der Zahl-Variablen — und ausdruecklich nur sie, nicht `ZAHLEN`
 * selbst.
 *
 * `grenzen.test.ts` fuehrt eine EIGENE Tabelle mit Einheit, Mindest- und
 * Hoechstwert je Variable und vergleicht sie gegen diese Liste. So faellt eine
 * hier ergaenzte Zeile auf, die dort fehlt (und umgekehrt) — ohne dass der Test
 * seine Erwartungswerte aus der Implementierung zieht. Wer `ZAHLEN` exportierte,
 * machte aus dem Test eine Tautologie: er pruefte den Code gegen sich selbst und
 * bliebe auch bei falscher Einheit gruen (§10.8, Eigenschaft 2).
 */
export const ZAHL_NAMEN: readonly ZahlName[] = Object.keys(ZAHLEN) as ZahlName[];

/** Die Werte, mit denen das Modul arbeitet. Jeder Feldname traegt seine Einheit. */
export interface Grenzen {
  readonly verfallRotTage: number;
  readonly verfallGelbTage: number;
  readonly helferSitzungStunden: number;
  readonly gateProAbsenderProMin: number;
  readonly gateGesamtProMin: number;
  readonly gateGesamtProStunde: number;
}

/**
 * Ganze Dezimalzahl mit optionalem Vorzeichen — bewusst NICHT `Number()`.
 * `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr: eine Pruefung ueber
 * `Number` allein liesse Hex und `1e7` durch, und die GELTENDE Grenze waere eine
 * andere als die, die in der .env steht (Vorbild `files/_lib/grenzen.ts:199`).
 */
const GANZZAHL = /^[+-]?\d+$/;

/**
 * Eine Zahl aus der Umgebung — oder ihre Vorbelegung.
 *
 * LEER GESETZT GILT WIE NICHT GESETZT. `LAGERBUCH_VERFALL_ROT_TAGE=` ist der
 * haeufigere Fall als die fehlende Zeile (jemand raeumt eine .env auf), und
 * `Number("")` waere 0 — eine Ampel, die sofort rot ist, oder ein Gate-Limit,
 * das jeden abweist.
 */
function zahl(name: ZahlName, env: EnvLike): number {
  const regel = ZAHLEN[name];
  const roh = env[name]?.trim();
  if (roh === undefined || roh === "") return regel.vorgabe;
  if (!GANZZAHL.test(roh)) {
    throw new GrenzenUngueltig(
      `${name}="${roh}" ist keine ganze Zahl. Erwartet: ${regel.min} bis ${regel.max} ` +
        `(${regel.einheit}).`,
    );
  }
  const wert = Number.parseInt(roh, 10);
  if (wert < regel.min || wert > regel.max) {
    throw new GrenzenUngueltig(
      `${name}=${wert} liegt ausserhalb von ${regel.min} bis ${regel.max} (${regel.einheit}).`,
    );
  }
  return wert;
}

/**
 * Die geltenden Werte. GELESEN WIRD BEI JEDEM AUFRUF, nicht beim Import
 * (§10.8, Eigenschaft 3) — dieselbe Form wie `DATA_DIR` in `core/db` und wie
 * `files/_lib/grenzen.ts:368`.
 *
 * KEINE KOPPLUNGSPRUEFUNG hier. „ROT <= GELB" und die Gate-Ungleichungskette
 * sind BOOT-Pruefungen (§10.5) und liegen ab Teil 3 in `grenzenFehler()`: der
 * Boot will ALLE Fehler auf einmal melden, nicht den ersten, und `grenzen()`
 * muss dieselbe Auswertung ohne Gate liefern koennen — sonst gaebe es zwei
 * Auswertungen und damit zwei Wahrheiten.
 */
export function grenzen(env: EnvLike = process.env): Grenzen {
  return {
    verfallRotTage: zahl("LAGERBUCH_VERFALL_ROT_TAGE", env),
    verfallGelbTage: zahl("LAGERBUCH_VERFALL_GELB_TAGE", env),
    helferSitzungStunden: zahl("LAGERBUCH_HELFER_SITZUNG_STUNDEN", env),
    gateProAbsenderProMin: zahl("LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN", env),
    gateGesamtProMin: zahl("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN", env),
    gateGesamtProStunde: zahl("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE", env),
  };
}

/**
 * Das Sitzungsgeheimnis — PFLICHT, und deshalb ausdruecklich KEINE Zeile in
 * `ZAHLEN` und kein Feld von `Grenzen`.
 *
 * WARUM DIE TRENNUNG TRAEGT: alle sechs Zahlen haben eine Vorbelegung, `grenzen()`
 * laeuft also auf einer leeren Umgebung klaglos durch — und genau das braucht
 * `next build`, das mit NODE_ENV=production und OHNE Secrets laeuft und dabei
 * `gateSchranke.ts` importiert, wo `grenzen()` auf Modulebene steht. Zoege man
 * das Geheimnis in dieselbe Auswertung, braeche `pnpm build`, und kein Kapitel
 * dieser Spec sonst faengt das ab (§10.8, Eigenschaft 3).
 *
 * DIESE FUNKTION LAEUFT ZUR ANFRAGEZEIT. Ihr einziger Aufrufer ist
 * `_lib/helferSitzung.ts`, und zwar in einem Thunk, nicht auf Modulebene.
 *
 * SIE PRUEFT NUR „gesetzt und nicht leer". Mindestlaenge, Dev-Default und die
 * Ungleichheit zu AUTH_SECRET sind BOOT-Pruefungen (§10.5, Pruefung 4) und
 * gehoeren zu `grenzenFehler()` in Teil 3 — ein zu kurzes Geheimnis waehrend
 * eines Cutover-Abends abzulehnen machte aus einer Konfigurationswarnung einen
 * Ausfall JEDER laufenden Feld-Sitzung, an einer Stelle, an der niemand die
 * Meldung liest.
 */
export function helferSitzungGeheimnis(env: EnvLike = process.env): string {
  const wert = env.LAGERBUCH_HELFER_SITZUNG_SECRET?.trim();
  if (!wert) {
    throw new GrenzenUngueltig(
      `LAGERBUCH_HELFER_SITZUNG_SECRET ist nicht gesetzt oder leer. Ohne das Geheimnis ` +
        `kann keine Helfer-Sitzung ausgestellt oder geprueft werden. Der Wert wird beim ` +
        `Cutover 1:1 aus der alten stack.env uebernommen (HELFER_SESSION_SECRET) und ` +
        `ueber env_file gesetzt, nicht als \${VAR:?}-Zeile in der compose.yaml.`,
    );
  }
  return wert;
}
