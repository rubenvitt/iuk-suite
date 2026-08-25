/**
 * Alle konfigurierbaren Zahlen des Moduls `radio` an EINER Stelle, und jeder Name
 * traegt seine Einheit (Spec 1 §3.1, Zeilen 2032-2040).
 *
 * KEIN "use client" in dieser Datei. Die Zahlen liest der Gate-Zaehler
 * (`_lib/gateSchranke.ts`, A3, auf Modulebene) ebenso wie die Sitzung
 * (`_lib/ausleihSitzung.ts`, A4) — und ein WERT aus einem Client-Modul kommt in einer
 * Server Component nicht an, sondern als Client-Referenz (Falle 6, `CLAUDE.md`).
 * HTTP 500 fuer die ganze Seite, das `pnpm build` nicht sieht und Vitest strukturell
 * nicht sehen KANN, weil "use client" dort ein wirkungsloser String ist. Durchgesetzt
 * wird das von `src/app/m/radio/riegel.test.ts:909-962`.
 *
 * DIESE DATEI HAELT KEINE BOOT-PRUEFUNG. `radioBootFehler()` gehoert Kapitel 7 und damit
 * Planteil 5 (B8, Spec:97). `lagerbuch` fuehrt die Entsprechung als `grenzenFehler()`
 * (`src/app/m/lagerbuch/_lib/grenzen.ts:282-368`); hier gibt es sie heute NICHT.
 */

/** Wie in `src/app/m/lagerbuch/_lib/grenzen.ts:26-27`: nur „String rein, String oder
 *  undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * Die Konfiguration traegt einen Wert, mit dem das Modul nicht arbeiten kann.
 * Ein EIGENER Typ, damit ein Aufrufer ihn von einem Betriebsfehler unterscheiden kann —
 * er ist immer ein Konfigurationsfehler, nie ein Laufzeitproblem (Vorbild
 * `src/app/m/lagerbuch/_lib/grenzen.ts:34-39`).
 */
export class GrenzenUngueltig extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "GrenzenUngueltig";
  }
}

/**
 * Die Einheit, die in JEDE Meldung zu dieser Variable gehoert.
 *
 * ⚠️ DREI WOERTER, KEIN "Tage". `lagerbuch` fuehrt ein viertes
 * (`src/app/m/lagerbuch/_lib/grenzen.ts:42`), weil es eine Verfallsampel hat; `radio`
 * hat keine. Ein ungenutztes Wort in dieser Union waere ein Angebot an den naechsten
 * Leser, eine Zahl mit falscher Einheit einzutragen.
 */
type Einheit = "Stunden" | "Anzahl/min" | "Anzahl/h";

interface ZahlRegel {
  readonly einheit: Einheit;
  readonly min: number;
  readonly max: number;
  readonly vorgabe: number;
}

/**
 * Die Tabelle aus Spec:2034-2040 und Spec:3004-3009, vollstaendig — die EINZIGE Quelle.
 * `grenzen()` liest von hier, und ab Planteil 5 wird `radioBootFehler()` dieselbe Tabelle
 * lesen; zwei Tabellen waeren zwei Wahrheiten, und der Boot pruefte etwas anderes als das,
 * was zur Laufzeit gilt.
 *
 * ⚠️ `RADIO_AUSLEIH_SITZUNG_SECRET` STEHT HIER MIT ABSICHT NICHT. Es ist eine
 * Pflichtzeichenkette ohne Vorgabe; zoege man es in dieselbe Auswertung, braeche
 * `pnpm build` (siehe `ausleihSitzungGeheimnis()` unten).
 */
const ZAHLEN = {
  // Obergrenze 24: eine Feldsitzung darf nie laenger dauern als eine Schicht plus Puffer.
  // Der Wert steht ZWEIMAL in derselben Sitzung — als JWT-`exp` und als Cookie-`maxAge`
  // (Spec §3.4.3, Zeilen 2519-2530); deshalb rechnet ihn genau EINE Funktion um
  // (`ausleihGueltigkeitSekunden()`, A4).
  //
  // ⬜ A-L1 — 12 ist der VORSCHLAG der Spec (§3.4.3, Spec:2529-2531), nicht die Antwort
  // des Betreibers. Spec §3.11 Punkt 1 (Spec:3279) schreibt woertlich: „Ob eine Schicht
  // laenger laeuft, steht in keinem Repo." Abgelesen wird die Zahl vom Betreiber vor dem
  // Cutover; sie aendert genau diese eine Zeile und die entsprechende in `.env.example`.
  // Das `vorgabe`-Feld ist eine Vorbelegung, keine Behauptung ueber die Schichtlaenge.
  //
  // ⛔ Der Name ist `RADIO_AUSLEIH_SITZUNG_STUNDEN` und NICHT `RADIO_ZUGANG_SITZUNG_STUNDEN`
  // — B1 (Spec:90) gegen Kapitel 7 und 9: „Ausleih" ist die Rolle, „Zugang" die Mechanik.
  RADIO_AUSLEIH_SITZUNG_STUNDEN: { einheit: "Stunden", min: 1, max: 24, vorgabe: 12 },

  // Die BEQUEMLICHKEITSGRENZE gegen Tippfehler und ungezieltes Klopfen, ausdruecklich
  // NICHT die Brute-Force-Abwehr (`src/app/m/lagerbuch/_lib/absender.ts:30-33`: „Die
  // Abwehr sind die beiden modulweiten Zaehler … weil ihr Schluessel der einzige ist, den
  // niemand rotieren kann."). Fuenf Fehlversuche je Absender und Minute (Spec:3004).
  RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 60, vorgabe: 5 },

  // Die modulweite Burst-Kappe gegen Rotation des Absenderschluessels (Spec:3005-3006).
  // 30 = sechs Absender-Budgets.
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 600, vorgabe: 30 },

  // DER tragende Zaehler (Spec:3007-3009). 300 = 5/min x 60 — die Zahl stellt genau die
  // Zusage wieder her, die das Per-Absender-Limit nur unter der Annahme einer
  // wahrhaftigen Absenderadresse je hatte.
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: { einheit: "Anzahl/h", min: 1, max: 3600, vorgabe: 300 },
} as const satisfies Record<string, ZahlRegel>;

type ZahlName = keyof typeof ZAHLEN;

/**
 * Die NAMEN der Zahl-Variablen — und ausdruecklich nur sie, nicht `ZAHLEN` selbst.
 *
 * `grenzen.test.ts` fuehrt eine EIGENE Tabelle mit Einheit, Mindest-, Hoechstwert und
 * Vorbelegung je Variable und vergleicht sie gegen diese Liste. So faellt eine hier
 * ergaenzte Zeile auf, die dort fehlt (und umgekehrt) — ohne dass der Test seine
 * Erwartungswerte aus der Implementierung zieht. Wer `ZAHLEN` exportierte, machte aus dem
 * Test eine Tautologie: er pruefte den Code gegen sich selbst und bliebe auch bei falscher
 * Einheit gruen (`src/app/m/lagerbuch/_lib/grenzen.ts:91-102`, Spec 1 §10.8 Eigenschaft 2).
 */
export const ZAHL_NAMEN: readonly ZahlName[] = Object.keys(ZAHLEN) as ZahlName[];

/** Die Werte, mit denen das Modul arbeitet. Jeder Feldname traegt seine Einheit. */
export interface Grenzen {
  readonly ausleihSitzungStunden: number;
  readonly gateProAbsenderProMin: number;
  readonly gateGesamtProMin: number;
  readonly gateGesamtProStunde: number;
}

/**
 * Ganze Dezimalzahl mit optionalem Vorzeichen — bewusst NICHT `Number()`.
 * `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr: eine Pruefung ueber `Number`
 * allein liesse Hex und `1e7` durch, und die GELTENDE Grenze waere eine andere als die,
 * die in der .env steht (Vorbild `src/app/m/files/_lib/grenzen.ts:193-199`).
 */
const GANZZAHL = /^[+-]?\d+$/;

/**
 * Eine Zahl aus der Umgebung — oder ihre Vorbelegung.
 *
 * LEER GESETZT GILT WIE NICHT GESETZT. `RADIO_AUSLEIH_SITZUNG_STUNDEN=` ist der
 * haeufigere Fall als die fehlende Zeile (jemand raeumt eine .env auf), und `Number("")`
 * waere 0 — eine Sitzung, die sofort abgelaufen ist, oder ein Gate-Limit, das jeden
 * abweist (Vorbild `src/app/m/lagerbuch/_lib/grenzen.ts:122-133`).
 *
 * ⚠️ EIN GESETZTER, UNGUELTIGER WERT WIRFT — er faellt NICHT still auf die Vorgabe
 * zurueck. Das ist gewollt (`src/app/m/lagerbuch/_lib/gateSchranke.ts:12-14`): „ein Modul,
 * das mit einer kaputten Zahl gar nicht erst startet, ist richtiger als eines, das still
 * eine andere Grenze faehrt als die, die in der .env steht."
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
 * Die geltenden Werte. GELESEN WIRD BEI JEDEM AUFRUF, nicht beim Import — dieselbe Form
 * wie `src/app/m/lagerbuch/_lib/grenzen.ts:160-169`.
 *
 * ⚠️ WER SIE AUF MODULEBENE RUFT, FRIERT DIE ZAHLEN EIN. `_lib/gateSchranke.ts` (A3) tut
 * genau das, und es ist dort zulaessig, WEIL alle vier Zahlen eine Vorbelegung haben:
 * `next build` laeuft mit NODE_ENV=production und ohne .env und wertet Modulebene aus.
 * Die Folge, die man kennen muss: eine geaenderte .env wirkt erst nach einem Neustart
 * (`src/app/m/lagerbuch/_lib/gateSchranke.ts:16-20`).
 *
 * KEINE KOPPLUNGSPRUEFUNG hier. Die Gate-Ungleichungskette (Absender <= gesamt/min <=
 * gesamt/h) ist eine BOOT-Pruefung und gehoert zu `radioBootFehler()` in Planteil 5 (B8,
 * Spec:97): der Boot will ALLE Fehler auf einmal melden, nicht den ersten, und `grenzen()`
 * muss dieselbe Auswertung ohne Gate liefern koennen — sonst gaebe es zwei Auswertungen
 * und damit zwei Wahrheiten.
 */
export function grenzen(env: EnvLike = process.env): Grenzen {
  return {
    ausleihSitzungStunden: zahl("RADIO_AUSLEIH_SITZUNG_STUNDEN", env),
    gateProAbsenderProMin: zahl("RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN", env),
    gateGesamtProMin: zahl("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN", env),
    gateGesamtProStunde: zahl("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE", env),
  };
}

/**
 * Das Sitzungsgeheimnis — PFLICHT, und deshalb ausdruecklich KEINE Zeile in `ZAHLEN` und
 * kein Feld von `Grenzen`.
 *
 * ⛔ ES HEISST `RADIO_AUSLEIH_SITZUNG_SECRET`. Der Kapiteltext schreibt an ZWEI Stellen
 * `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS` (Spec:2042 in §3.1 und Spec:2502 in §3.4.2); B2
 * (Spec:91) sticht ueber beide und setzt die englische Endung nach dem Praezedenzfall
 * `LAGERBUCH_HELFER_SITZUNG_SECRET` (`.env.example:300`).
 *
 * WARUM DIE TRENNUNG VON `grenzen()` TRAEGT: alle vier Zahlen haben eine Vorbelegung,
 * `grenzen()` laeuft also auf einer leeren Umgebung klaglos durch — und genau das braucht
 * `next build`, das mit NODE_ENV=production und OHNE Secrets laeuft und dabei
 * `_lib/gateSchranke.ts` (A3) importiert, wo `grenzen()` auf Modulebene steht.
 *
 * ⛔ DIESE FUNKTION LAEUFT ZUR ANFRAGEZEIT UND WIRD NIE AUF MODULEBENE GERUFEN. Ein
 * `const SCHLUESSEL = new TextEncoder().encode(ausleihSitzungGeheimnis())` am Dateikopf
 * ihres Aufrufers braeche `pnpm build` aus demselben Grund. Der Bestand macht es richtig
 * und schreibt den Befund aus: `src/app/m/lagerbuch/_lib/helferSitzung.ts:39-49`
 * (`const schluessel = () => ...`). Ihr Aufrufer wird `_lib/ausleihSitzung.ts` (A4) sein,
 * und zwar in einem Thunk.
 *
 * SIE PRUEFT NUR „gesetzt und nicht leer". Mindestlaenge, Dev-Vorgabewert und die
 * Ungleichheit zu `AUTH_SECRET` sind BOOT-Pruefungen (Vorbild
 * `src/app/m/lagerbuch/_lib/grenzen.ts:331-365`).
 *
 * ⬜ A-L7 — ES GIBT FUER DIESES MODUL HEUTE KEINE BOOT-PRUEFUNG AUF DAS GEHEIMNIS.
 * `radioBootFehler()` ist Kapitel 7 und damit Planteil 5 (B8, Spec:97). Fehlt die
 * Variable, faellt das erst beim ersten Einloesen auf — nicht beim Start des Containers.
 * Abgelesen wird die Leerstelle von Planteil 5 beim Bau von `radioBootFehler()`; ueber die
 * Gestalt der Meldung, die ein Nutzer dann saehe, steht hier ausdruecklich nichts.
 */
export function ausleihSitzungGeheimnis(env: EnvLike = process.env): string {
  const wert = env.RADIO_AUSLEIH_SITZUNG_SECRET?.trim();
  if (!wert) {
    throw new GrenzenUngueltig(
      `RADIO_AUSLEIH_SITZUNG_SECRET ist nicht gesetzt oder leer. Ohne das Geheimnis kann ` +
        `keine Ausleih-Sitzung ausgestellt oder geprueft werden. Der Wert gehoert ueber ` +
        `env_file in den Container, nicht als \${VAR:?}-Zeile in die compose.yaml.`,
    );
  }
  return wert;
}
