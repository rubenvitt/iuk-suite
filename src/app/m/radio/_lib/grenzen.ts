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
 * DIESE DATEI HAELT SEIT PLANTEIL 5 (G1) `grenzenFehler()` — die Boot-Meldungen aus der
 * Zahlentabelle, ganz unten, Entsprechung zu `lagerbuch/_lib/grenzen.ts:282-368` (368
 * Zeilen). EINGEHAENGT wird sie dort nicht, sondern von `radioBootFehler()` (G2, B8).
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
 * KEINE KOPPLUNGSPRUEFUNG hier — SIE STEHT IN `grenzenFehler()` AM DATEIENDE. Die
 * Gate-Ungleichungskette (Absender <= gesamt/min <= gesamt/h) ist eine BOOT-Pruefung: der
 * Boot will ALLE Fehler auf einmal melden, nicht den ersten, und `grenzen()` muss dieselbe
 * Auswertung ohne Gate liefern koennen — sonst gaebe es zwei Auswertungen und damit zwei
 * Wahrheiten. Gebaut in Planteil 5, Aufgabe G1 (B8, Spec:97).
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
 * Der Wortlaut fuer „fehlt oder ist leer" — EINE Zeichenkette fuer ZWEI Leser.
 *
 * ⛔ SIE STAND FRUEHER NUR IM WURF von `ausleihSitzungGeheimnis()`. `grenzenFehler()`
 * meldet denselben Betriebsfall zur Startzeit; zwei Formulierungen waeren zwei Wahrheiten,
 * und der Betreiber suchte je nach Weg (Startprotokoll oder 500 beim Einloesen) nach einem
 * anderen Satz. Deshalb die Konstante und nicht zweimal derselbe Absatz.
 */
const GEHEIMNIS_FEHLT =
  `RADIO_AUSLEIH_SITZUNG_SECRET ist nicht gesetzt oder leer. Ohne das Geheimnis kann ` +
  `keine Ausleih-Sitzung ausgestellt oder geprueft werden. Der Wert gehoert ueber ` +
  `env_file in den Container, nicht als \${VAR:?}-Zeile in die compose.yaml.`;

/**
 * Die Mindestlaenge des Sitzungsgeheimnisses, in ZEICHEN.
 *
 * 32 wie im Vorbild (`src/app/m/lagerbuch/_lib/grenzen.ts:252`) und wie der Erzeugungs-
 * hinweis, den die Meldung mitgibt: `openssl rand -base64 32` liefert 44 Zeichen Base64
 * aus 32 Byte Zufall und liegt damit sicher darueber.
 */
const GEHEIMNIS_MINDESTLAENGE = 32;

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
 * ⬜ A-L7 — ABGELESEN in Planteil 5 (G1). Die Boot-Pruefung auf das Geheimnis ist gebaut:
 * `grenzenFehler()` am Dateiende meldet fehlend, kuerzer als 32 Zeichen und gleich
 * `AUTH_SECRET` als drei getrennte Zeilen. Dieser Absatz bleibt stehen, weil er erklaert,
 * warum sie NICHT hier sitzt. ⛔ ZUM STARTABBRUCH IST SIE GEWORDEN, seit `radioBootFehler()`
 * sie ruft (G2, `_lib/boot.ts:218`) — eine fehlende Variable haelt den Container jetzt an.
 */
export function ausleihSitzungGeheimnis(env: EnvLike = process.env): string {
  const wert = env.RADIO_AUSLEIH_SITZUNG_SECRET?.trim();
  if (!wert) {
    throw new GrenzenUngueltig(GEHEIMNIS_FEHLT);
  }
  return wert;
}

/**
 * Alle Boot-Meldungen dieses Moduls, die aus der Grenzen-Tabelle stammen. WIRFT NIE.
 *
 * ⛔ SIE LIEST DIE TABELLE VON INNEN, ueber die modul-private `zahl()`. `ZAHLEN` wird
 * ausdruecklich NICHT exportiert (der Grund steht oben beim Kopfkommentar von
 * `ZAHL_NAMEN`: „Wer `ZAHLEN` exportierte, machte aus dem Test eine Tautologie"), und
 * `grenzen.ts:53-56` schreibt aus, warum es nur EINE Tabelle geben darf: „zwei Tabellen
 * waeren zwei Wahrheiten, und der Boot pruefte etwas anderes als das, was zur Laufzeit
 * gilt."
 *
 * ⛔ DESHALB ENTSTEHT KEIN `zahlFehler` IN `_lib/boot.ts` (Entscheidung E-G1). Der
 * Kapiteltext (§7.3.3) schreibt dort einen Helfer mit `min`/`max`-Parametern aus; der
 * braeuchte die Grenzen entweder als Import aus `ZAHLEN` (verboten) oder zweitgeschrieben
 * (die zwei Wahrheiten). Wer `zahlFehler` sucht, findet diese Funktion und diesen Absatz.
 *
 * ⛔ JE VARIABLE EIN EIGENER AUFRUF-UND-FANG, nicht ein einzelnes `try { grenzen(env) }`.
 * `grenzen()` wertet alle vier Namen in EINEM Objektliteral aus (siehe dort), und der
 * erste Wurf aus `zahl()` beendet den Aufruf — bei vier kaputten `.env`-Zeilen saehe der
 * Betreiber drei davon erst nach drei weiteren Neustarts. Die Schleife laeuft ueber
 * `ZAHL_NAMEN` und nicht ueber eine handgeschriebene Namensliste: eine fuenfte Zeile in
 * `ZAHLEN` ist damit ohne Zutun mitgeprueft.
 *
 * ⛔ KEIN HOST-SCHALTER HIER. `lagerbuch` beginnt seine Entsprechung mit
 * `if (prodHostsFor(...).length === 0) return [];` (`lagerbuch/_lib/grenzen.ts:283`);
 * fuer `radio` steht dieser Schalter als ERSTE Anweisung von `radioBootFehler()`
 * (Aufgabe G2, Bauform-Tafel Nr. 6). Hier waere er zweimal dieselbe Gating-Logik — und
 * machte diese Funktion fuer jeden zweiten Aufrufer unbrauchbar.
 *
 * ⬜ A-L7 ist mit dieser Funktion ABGELESEN (Teile 2 bis 4).
 */
export function grenzenFehler(env: EnvLike = process.env): string[] {
  const fehler: string[] = [];

  // ── Teil 1: die vier Zahlen, jede EINZELN, damit ein kaputter Wert die uebrigen nicht
  // verdeckt. Die Meldung kommt woertlich aus `zahl()` und traegt deshalb Name, gelesenen
  // Wert, Bereich und Einheit, ohne dass hier ein zweiter Text entsteht.
  const werte: Partial<Record<ZahlName, number>> = {};
  for (const name of ZAHL_NAMEN) {
    try {
      werte[name] = zahl(name, env);
    } catch (e) {
      fehler.push(e instanceof GrenzenUngueltig ? e.message : String(e));
    }
  }

  // ── Teile 2 bis 4: das Geheimnis. Die Bedingung ist dieselbe wie im Wurf von
  // `ausleihSitzungGeheimnis()` (`?.trim()`, dann „leer"), damit beide Wege denselben
  // Betriebsfall meinen.
  //
  // ⛔ DIE LAENGENPRUEFUNG STEHT IM `else`-ZWEIG, und das ist tragend: die leere
  // Zeichenkette ist auch „kuerzer als 32". Ausserhalb des `else` meldete eine fehlende
  // Variable ZWEI Zeilen statt einer — nachgezaehlt an der Sonde S-G1f, nicht geschaetzt.
  // Der AUTH_SECRET-Vergleich haengt am SELBEN Zweig; die Wache darunter ist dort
  // redundant (Begruendung an ihr). Vorbild: `lagerbuch/_lib/grenzen.ts:334-365`.
  const geheim = env.RADIO_AUSLEIH_SITZUNG_SECRET?.trim() ?? "";
  const authSecret = env.AUTH_SECRET?.trim() ?? "";
  if (geheim === "") {
    fehler.push(GEHEIMNIS_FEHLT);
  } else {
    if (geheim.length < GEHEIMNIS_MINDESTLAENGE) {
      // ⛔ DIE LAENGE, NIE DER WERT. Diese Meldung landet im Startprotokoll des Containers,
      // und das liest beim Cutover mehr als eine Person; ein mitgeliefertes Praefix des
      // Geheimnisses machte aus einem Konfigurationsfehler einen Geheimnisverlust.
      fehler.push(
        `RADIO_AUSLEIH_SITZUNG_SECRET ist ${geheim.length} Zeichen lang, mindestens ` +
          `${GEHEIMNIS_MINDESTLAENGE} sind gefordert. Ein tauglicher Wert entsteht mit: ` +
          `openssl rand -base64 32`,
      );
    }
    // ⚠️ `authSecret !== ""` IST HIER KEINE WACHE, SONDERN REDUNDANT: im `else` gilt
    // `geheim !== ""`, also ist `geheim === authSecret` bei leerem AUTH_SECRET ohnehin
    // falsch. Sie bleibt aus Formgleichheit mit `lagerbuch/_lib/grenzen.ts:357` stehen.
    if (authSecret !== "" && geheim === authSecret) {
      fehler.push(
        `RADIO_AUSLEIH_SITZUNG_SECRET ist identisch mit AUTH_SECRET. Damit gaebe es keine ` +
          `Domaenentrennung mehr zwischen Suite-Sitzung und Ausleih-Sitzung: dieselbe ` +
          `Signatur truege zwei Bedeutungen, und aus einer Ausleih-Sitzung waere eine ` +
          `Suite-Sitzung. Zu aendern ist RADIO_AUSLEIH_SITZUNG_SECRET — AUTH_SECRET ` +
          `gehoert der Suite und bleibt unveraendert, ein Wechsel dort meldet jede ` +
          `angemeldete Person ab.`,
      );
    }
  }

  // ── Teil 5: die Gate-Ungleichungskette Absender/min <= gesamt/min <= gesamt/h.
  //
  // ⛔ SIE LAEUFT JE GLIED NUR, WENN BEIDE BETEILIGTEN WERTE GELESEN WERDEN KONNTEN — und
  // dieser Zustand steht als `!== undefined` IM CODE, nicht als Reihenfolge zwischen den
  // Absaetzen. Sonst verglichen wir einen Wert, den `zahl()` gerade abgelehnt hat, gegen
  // eine Vorbelegung: die Meldung behauptete eine Kette, die so nirgends steht, und
  // schickte den Betreiber an die falsche `.env`-Zeile.
  //
  // ⚠️ Jede Meldung nennt ALLE DREI Namen mit ihrem gelesenen Wert, nicht nur die zwei
  // verglichenen: die Kette ist eine Aussage ueber drei Zahlen, und wer sie reparieren
  // soll, braucht die dritte, um nicht das naechste Glied zu brechen.
  const gelesen = (name: ZahlName): string =>
    werte[name] === undefined ? `${name}=<nicht lesbar>` : `${name}=${werte[name]}`;
  const KETTE =
    `Gefordert ist die Kette Absender/min <= gesamt/min <= gesamt/h. Gelesen: ` +
    `${gelesen("RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN")}, ` +
    `${gelesen("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN")}, ` +
    `${gelesen("RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE")}.`;

  const absender = werte.RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN;
  const proMin = werte.RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN;
  const proStunde = werte.RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE;

  if (absender !== undefined && proMin !== undefined && absender > proMin) {
    fehler.push(
      `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=${absender} ist groesser als ` +
        `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=${proMin}. Dann fuellt ein einzelner ` +
        `Absender die modulweite Bremse, bevor sein eigener Eimer leer ist — die ` +
        `Reihenfolge der Bremsen waere umgekehrt zur Absicht. ${KETTE}`,
    );
  }
  if (proMin !== undefined && proStunde !== undefined && proMin > proStunde) {
    fehler.push(
      `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=${proMin} ist groesser als ` +
        `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=${proStunde}. Dann ist der ` +
        `Stundendeckel wirkungslos — und er ist der tragende Zaehler. ${KETTE}`,
    );
  }

  return fehler;
}
