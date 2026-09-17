import type { Reichweite } from "./helferBereich";
import type { SperrGrund } from "./helferZugang";

/**
 * Die EINE Form, in der eine Helfer-Action antwortet — §7.3.
 *
 * KEIN `use client` (Falle 6): die Datei exportiert WERTE (`RIEGEL_TEXTE`,
 * `NETZ_TEXT_*`), und `_actions/check.ts` ist eine Server-Datei. Aus einem
 * `use client`-Modul bekaeme sie eine Client-Referenz statt des Wertes — HTTP
 * 500 fuer die ganze Seite, und Vitest sieht es strukturell nicht.
 *
 * SIE LIEGT BEWUSST NICHT UNTER `_actions/`: der Guard-Scan aus §3.8.2 liest
 * JEDE Datei dort und erwartet exportierte Actions. Eine Typ- und Textdatei
 * braeuchte dort eine Ausnahme — und eine Ausnahme in einem Scan, dessen ganze
 * Zusage die VOLLSTAENDIGKEIT ist, ist die teuerste Zeile, die man ihm geben
 * kann.
 *
 * DAS GRUNDMUSTER (Falle 66): jede ERWARTBARE Fehlerlage ist ein
 * Rueckgabewert, kein Wurf. Der Produktions-Deserialisierer hat fuer eine
 * Fehlerzeile genau einen Zweig (`resolveErrorProd`) und baut einen festen
 * ENGLISCHEN Satz mit `digest`; `e.message` erreicht in Produktion niemanden.
 * Die 22 deutschen Texte in `lagerbuch/src/actions/*` sind fachlich richtig und
 * betrieblich wirkungslos.
 *
 * DER WURF BLEIBT DEM RIEGELFALL VORBEHALTEN — dort, wo die Lage nicht
 * „erwartbar", sondern „manipuliert" heisst: die vier
 * Zugehoerigkeitspruefungen in `checkAbschluss` (§7.3) und
 * `requireLagerbuchHost`.
 */

/**
 * FESTLEGUNG G7 (Teil 2): die geteilte Haelfte wird ABGELEITET, nicht
 * abgeschrieben. `SperrGrund` ist "sitzung" | "gesperrt" und gehoert
 * `_lib/helferZugang.ts`; zwei getrennte Literal-Unions fuer dieselben zwei
 * Woerter waeren genau die Typinkonsistenz, gegen die die Produces-Bloecke
 * geschrieben sind — und der Bruch waere still.
 */
/**
 * ⚠️ `"eingabe"` — der fuenfte Wert, Betreiberentscheidung B4 (06.08.2026).
 *
 * WARUM ES IHN GIBT. Der `safeParse`-Zweig von `checkAbschluss` (§7.4.3) ist
 * eine ERWARTBARE Fehlerlage — altes Fenster, halb geladene Seite — und damit
 * nach Falle 66 ein RUECKGABEWERT, kein Wurf. Aber er ist keiner der vier
 * vorhandenen Faelle: er ist kein Netzereignis (die Verbindung STEHT), kein
 * Riegelfall (Sitzung und Kaertchen sind in Ordnung) und nicht „nichts
 * gebucht" (`leer` heisst `gebucht === 0`).
 *
 * Der Plan schrieb dafuer `grund: "netz"` vor. Das verletzt Global Constraint
 * 12 — `"netz"` ENTSTEHT NIE SERVERSEITIG (siehe den Absatz unter
 * `HelferErgebnis`) —, und der Bruch waere STILL und typkorrekt: die Anzeige
 * sagte „Keine Verbindung", wo die Verbindung steht und die Eingabe
 * unvollstaendig ist.
 *
 * `darfErneuern("eingabe")` ist FALSE: eine unvollstaendige Nutzlast wird nicht
 * dadurch vollstaendig, dass jemand die Sitzung erneuert.
 */
/**
 * ⚠️ `"bereich"` — der SECHSTE Wert, DRK-406.
 *
 * WARUM ES IHN GIBT. Der Handlager-Code darf ausschliesslich entnehmen; Box und
 * Check sind fuer ihn zu. Das ist keiner der fuenf vorhandenen Faelle: die
 * Sitzung ist gueltig, das Kaertchen ist NICHT gesperrt, die Verbindung steht,
 * die Eingabe ist vollstaendig, und gebucht wurde nichts, weil nichts gebucht
 * werden durfte.
 *
 * ⚠️ NICHT `"gesperrt"` MITBENUTZEN, so naheliegend das waere. Der Satz dort
 * lautet woertlich „Dieses Kaertchen wurde gesperrt" — fuer einen voll
 * gueltigen Regal-Code ist das schlicht falsch, und wer ihn liest, meldet der
 * Verwaltung einen Defekt, den es nicht gibt. Und es haette eine zweite,
 * teurere Folge: `RIEGEL_TEXTE` ist `Record<SperrGrund, string>`, ein dritter
 * `SperrGrund` waere also eine Aenderung an `requireHelferSchreibend`,
 * `CheckFlow` und `Entnahme` fuer einen Zustand, den nur zwei Actions kennen.
 *
 * `darfErneuern("bereich")` ist FALSE: derselbe Code erneut eingeloest darf
 * genauso wenig. Ein Erneuerungsfeld waere eine Schleife.
 */
export type HelferGrund = SperrGrund | "leer" | "netz" | "eingabe" | "bereich";

export type HelferErgebnis<T> =
  | { ok: true; wert: T }
  | { ok: false; grund: HelferGrund; text: string };

/**
 * ⚠️ `"netz"` ENTSTEHT NIE SERVERSEITIG. Es ist der Grund, den der Client im
 * `catch` selbst setzt, damit die Anzeigelogik genau EINE Form kennt. Ohne
 * diesen Satz sucht der naechste Leser die Erzeugerstelle im Server und findet
 * sie nie.
 */

/** Die zwei Saetze, die der Server schreibt — wortgleich mit §7.3. */
export const RIEGEL_TEXTE: Readonly<Record<SperrGrund, string>> = {
  sitzung: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
  gesperrt: "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
} as const;

/**
 * DER SATZ FUER DEN KONTO-WEG — DRK-305, und er steht NEBEN `RIEGEL_TEXTE`,
 * nicht darin.
 *
 * ⚠️ `RIEGEL_TEXTE` ist `Record<SperrGrund, string>`, und der Server kennt den
 * Unterschied gar nicht: fällt der Konto-Zweig aus, sieht `requireHelferSchreibend`
 * nur noch „kein Kärtchen, kein Konto" und gibt den Kärtchen-Grund zurück. WER
 * hier stand, weiß allein die SEITE — sie hat die Herkunft beim Rendern gekannt
 * und reicht sie den Inseln als Prop. Ein dritter `SperrGrund` würde also einen
 * Zustand benennen, den die Stelle, die ihn setzen müsste, nicht unterscheiden
 * kann.
 *
 * ⚠️ „IN EINEM NEUEN TAB" IST DER KERN DES SATZES, nicht Höflichkeit: der
 * gesamte Check-Zustand liegt im Client (`CheckFlow.tsx`, sechs `useState`).
 * Wer zum Anmelden dieselbe Seite verlässt, verliert zwanzig Minuten
 * Zählarbeit — genau der Datenverlust, gegen den §7.4.4 das Erneuerungsfeld
 * gebaut hat. Das Feld selbst hilft hier nicht: es verlangt einen Code, und die
 * angemeldete Person hat kein Kärtchen.
 */
export const ANMELDUNG_TEXT =
  "Deine Anmeldung ist abgelaufen. Melde dich in einem neuen Tab an und tippe hier erneut — "
  + "deine Eingaben bleiben stehen.";

/**
 * DER SATZ FUER DEN FALSCHEN CODE — DRK-406, je Reichweite seit DRK-417.
 *
 * ⚠️ ER SAGT, WAS GEHT, NICHT NUR WAS NICHT GEHT (§11.7: jeder abgelehnte Weg
 * nennt den Weg, der bleibt). Wer am Regal steht und den Check aufrufen wollte,
 * hat entweder das falsche Kaertchen in der Hand oder braucht das des
 * Fahrzeugs — beides ist ein Handgriff, wenn es dasteht, und eine Viertelstunde
 * Suchen, wenn nicht.
 *
 * ⚠️ ER NENNT DEN ORT DER RICHTIGEN KARTE, nicht ihren Namen: der Ortscode
 * einer Einheit klebt auf ihrer Karte, nicht im Lager. Ein Satz, der ins Lager
 * schickt, schickt in die falsche Richtung.
 *
 * ⚠️ EIN SATZ JE REICHWEITE UND KEINE BAUKASTENFORMEL. Drei Saetze aus
 * Bausteinen zusammenzusetzen ergaebe grammatisch richtige Zeilen, die niemand
 * so sagen wuerde („Fuer Entnahme und Box scanne die Karte am Regal oder an
 * der Entnahmebox") — und der Satz ist das Einzige, was die Person in der Hand
 * hat, wenn ihr Code nicht gilt.
 *
 * ⚠️ DER `default`-ZWEIG IST KEIN TOTER CODE. Die volle Reichweite erreicht
 * diese Funktion nie (`bereichsAbweisung` steigt vorher mit `null` aus), eine
 * kuenftige vierte Reichweite aber schon — und dann ist ein allgemeiner Satz
 * besser als ein `undefined`, das als leerer Fehlerkasten auf dem Telefon
 * landet.
 */
export function bereichText(reichweite: Reichweite): string {
  if (!reichweite.includes("entnahme") && reichweite.includes("check")) {
    return "Mit der Karte an der Einheit kannst du den Check machen und Material "
      + "in die Entnahmebox legen. Zum Entnehmen scanne die Karte am Regal.";
  }
  if (reichweite.length === 1 && reichweite[0] === "entnahme") {
    return "Mit dem Code vom Regal kannst du nur Material entnehmen. Für Box und Check "
      + "scanne die Karte am Fahrzeug oder an der Tasche.";
  }
  if (reichweite.length === 1 && reichweite[0] === "box") {
    return "Mit der Karte an der Entnahmebox kannst du nur Material ablegen. Für "
      + "Entnahme oder Check scanne die Karte am Regal oder an der Einheit.";
  }
  return "Dieser Code gilt für diesen Bereich nicht. Scanne die Karte an dem Ort, "
    + "an dem du gerade stehst.";
}

/**
 * `gebucht === 0` ist ausdruecklich ein FEHLER, kein Erfolg (§7.3). Heute gibt
 * `fefoAbbuchung` bei leerem Handlager `{gebucht: 0}` zurueck
 * (`db/abbuchung.ts:24-54` wirft nie), und `HelferEntnahme.tsx:26-27` macht
 * daraus „Entnahme gebucht: 0 × X" — GRUEN, MIT HAEKCHEN (`:55`,
 * `chip chip-ok`). Ein 200, das luegt, ist der teuerste Zustand der Tabelle.
 */
export function leerText(artikelName: string): string {
  return `Im Handlager liegt nichts mehr von ${artikelName}. Bitte der Verwaltung melden.`.replace(
    / {2,}/g,
    " ",
  );
}

/** Entnahme: ein Handgriff, ein Satz. */
export const NETZ_TEXT_BUCHUNG = "Keine Verbindung. Die Buchung wurde nicht gespeichert.";

/**
 * Check: der Nachsatz ist tragend. Ein Fahrzeug-Check ist zehn bis zwanzig
 * Minuten Arbeit, und der gesamte Zustand liegt im Client
 * (`CheckFlow.tsx:62-71`: sechs `useState`). „Nicht gespeichert" ohne den
 * Nachsatz liest sich wie „alles weg" — und genau dann laedt jemand neu.
 */
export const NETZ_TEXT_CHECK =
  "Keine Verbindung. Der Check wurde nicht gespeichert — nichts ist verloren, " +
  "bitte erneut auf Abschließen tippen.";

/**
 * §7.4.4: Bei `"sitzung"` zeigt der Abschlussbereich AN ORT UND STELLE ein
 * Zahlenfeld — die einzige Antwort auf „Sitzung weg nach 15 Minuten Zaehlen",
 * die die Arbeit nicht verwirft.
 *
 * Bei `"gesperrt"` erscheint es NICHT: ein erneutes Einloesen desselben Codes
 * scheitert genauso, und ein Feld anzubieten, das nicht helfen kann, ist
 * schlimmer als keins.
 */
export function darfErneuern(grund: HelferGrund): boolean {
  return grund === "sitzung";
}

/**
 * DARF DIESE SEITE EIN KAERTCHEN NACHFORDERN? — DRK-305.
 *
 * `darfErneuern` beantwortet „passt der GRUND zu einer Erneuerung"; diese
 * Funktion beantwortet die zweite Hälfte: „gibt es überhaupt ein Kärtchen".
 * Beide müssen ja sagen. Ohne die zweite bot die Oberfläche einer angemeldeten
 * Person ein Code-Feld für ein Kärtchen an, das sie nie hatte — eine Sackgasse,
 * und im Check eine, die zwanzig Minuten Zählarbeit kostet (Codex-Review zu
 * PR #164).
 */
export function darfKaertchenErneuern(grund: HelferGrund, kontoZugang: boolean): boolean {
  return !kontoZugang && darfErneuern(grund);
}
