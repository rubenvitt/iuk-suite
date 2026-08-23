/**
 * DIE KONFLIKTSPRACHE DES AUSLEIHWEGS: die zwei Ergebnistypen mit ihren `grund`-Unions und
 * GENAU EINEN SATZ je Ausgang (Spec 1 §4.3.5,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3518-3550`).
 *
 * ⛔ KEIN `"use client"`, KEIN `"use server"` — Falle 6 (`CLAUDE.md`, Punkt 6). Aktion und
 * Flaeche muessen dieselbe Wahrheit lesen: `_db/leihen.ts` (A15) gibt diese Typen zurueck,
 * `_actions/ausleihe.ts` (A17) re-exportiert sie, und die drei Ausleihflaechen (A18-A20)
 * rendern `text`. Ein Wert aus einem Client-Modul kaeme in einer Server Component nicht an
 * — HTTP 500 fuer die ganze Seite, und Vitest kann es strukturell nicht sehen. Der Scan,
 * der das modulweit durchsetzt, steht in `src/app/m/radio/riegel.test.ts:921-940`.
 *
 * ⛔ WARUM DIE TYPEN HIER LIEGEN UND NICHT IN `_actions/ausleihe.ts`, wie Spec:3446-3455 es
 * schreibt: Entscheidung E11 (`.superpowers/sdd/planteil3/briefs/KOPF.md:649-671`). Dort
 * entstuende ein Zyklus — `_db/leihen.ts#bucheAusleihe` GIBT `AusleihErgebnis` zurueck
 * (Spec:5026) und `_actions/ausleihe.ts` IMPORTIERT `bucheAusleihe`. Hauspraezedenz:
 * `src/app/m/lagerbuch/_lib/actionTypen.ts`.
 *
 * ⛔ ZWEI REGELN AUS SPEC:3547-3550, und beide sind der Grund fuer die Gestalt dieser Datei:
 *   1. DER RUFNAME STEHT IM SATZ. Bei mehreren gewaehlten Geraeten ist ein Satz ohne
 *      Rufnamen unbrauchbar. Deshalb nimmt jeder Satz, der ein Geraet betrifft, den
 *      Rufnamen als Parameter — er ist nicht optional.
 *   2. KEINE TECHNISCHE KENNUNG ERSCHEINT. `grund` ist ein INTERNER SCHLUESSEL, nie
 *      Bildschirmtext (Spec:3549-3550, Bestand `api/loans.ts:8-12`).
 *
 * ⚠️ DER NAHELIEGENDE SCAN „kein Text enthaelt seinen `grund`-Schluessel" IST HIER
 * ROT-BY-CONSTRUCTION und steht deshalb NICHT im Test: der Satz zu `gesperrt` traegt das
 * Wort „gesperrt" als gewoehnliches deutsches Bildschirmwort. Der Test fuehrt stattdessen
 * eine FESTE ERWARTUNGSTABELLE, nach dem Vorbild von `_lib/gateTexte.test.ts:30-41`; sie
 * faengt Verstuemmelung UND eingeschmuggelten Schluessel in einem Zug
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:207-216`, Fund F3).
 *
 * ⛔ DER SATZ ZU `gesperrt` WIRD NICHT EIN ZWEITES MAL GESCHRIEBEN, sondern aus
 * `_lib/gateTexte.ts:71` GEHOLT (`VORABSCAN-A.md:402-411`, Fund F25, Form (a)). Zwei
 * zeichengleiche Saetze in zwei Dateien ohne Waechter sind genau die Mechanik, die
 * Entscheidung E13 an einem anderen Gegenstand verurteilt (`KOPF.md:768-770`: „die beiden
 * liefen beim ersten Umbau auseinander — ohne dass ein Test es saehe").
 *
 * ⛔ UND DIE ZWEI SPERR-SAETZE STEHEN AUCH INNERHALB DIESER DATEI NUR EINMAL
 * (`SPERR_SAETZE` unten): `sitzung` und `gesperrt` gehoeren BEIDEN Unions an, und zwei
 * unabhaengige Zweige waeren derselbe Fehler eine Ebene tiefer.
 */
import { gateMeldung } from "./gateTexte";
import { statusEtikett } from "./status";
import type { SperrGrund } from "./ausleihZugang";

/**
 * ⬜ A-L11 — DIE ZEICHENGRENZE DER ZUSTANDSNOTIZ, ABGELESEN STATT GERATEN.
 *
 * Quelle: `/Users/rubeen/dev/personal/drk/radio-inventar/packages/shared/src/schemas/loan.schema.ts:30`
 * (`LOAN_FIELD_LIMITS.RETURN_NOTE_MAX: 500`, in einem `Object.freeze` auf `:28-31`).
 *
 * ⚠️ DIE „500" IM ZAEHLER IST EIN BEISPIELTEXT („0 / 500", Spec:3560), KEINE ZITIERTE
 * KONSTANTE — so schreibt es der Auftrag selbst
 * (`.superpowers/sdd/planteil3/briefs/A14.md:67-70`). Der abgelesene Wert stimmt mit dem
 * Beispieltext ueberein; das ist eine Bestaetigung und war keine Vorgabe.
 * ⚠️ ANKERKORREKTUR: der Auftrag nennt dafuer Spec `:3573`; dort steht heute
 * `): Promise<RueckgabeErgebnis>;`. Der Zaehler steht auf **`:3560`**, nachgeschlagen statt
 * abgeschrieben (Ledger-Regel `progress.md:232-233`).
 *
 * ⚠️ SIE STEHT HIER UND NICHT IN `_lib/grenzen.ts`, obwohl Spec:3560 „Zeichengrenze aus
 * `_lib/grenzen.ts`" schreibt und der Auftrag (`briefs/A14.md:69-70`) beides zulaesst:
 * `_lib/grenzen.ts:62-105` fuehrt ausschliesslich Zahlen, die aus der UMGEBUNG kommen und
 * eine Vorbelegung haben (`grenzen(env)`, `:172`). Diese hier kommt aus dem Alt-Bestand und
 * ist nicht einstellbar; ein Eintrag dort machte aus einer Portierungskonstante einen
 * Betriebsschalter — und liesse `_lib/grenzen.ts` wachsen, was nach `progress.md:118-132`
 * jeden Anker in diese Datei nachzuschlagen zwingt.
 *
 * ⛔ AUFLAGE AN A15 UND A20: die Grenze wird von HIER IMPORTIERT, nicht neu deklariert —
 * dieselbe Form wie bei `geraeteZustandAus` (`.superpowers/sdd/planteil3/progress.md:236-246`).
 * Der Satz zu `notiz-zu-lang` unten nennt sie, der Zeichenzaehler des Dialogs (Spec:3560)
 * nennt sie ein zweites Mal — zwei Anzeigen derselben Zahl sind nur dann harmlos, wenn es
 * die Zahl nur einmal gibt.
 */
export const ZUSTANDSNOTIZ_MAX = 500;

/**
 * WARUM EIN GERAET NICHT AUSGELIEHEN WERDEN KANN — die drei Pruefungen des Servers, als
 * geschlossener Satz.
 *
 * ⛔ ER IST DER TRAEGER DER DREI SAETZE ZU `nicht-verfuegbar` (Spec:3539-3541). Der
 * Diskriminator `grund` ist GROEBER als das Alt-Vokabular: drei Alt-Codes
 * (`device_not_loanable`, `device_not_available`, `device_already_on_loan`) fallen auf
 * EINEN `grund` (Spec:5217-5221). Was sie auseinanderhaelt, ist dieser Zustand — und ohne
 * ihn traegt `nicht-verfuegbar` drei Saetze gegen die Zusage „genau EINEN Satz je grund"
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:192-201`, Fund F4).
 *
 * ⛔ `NICHT_FREIGEGEBEN` IST EINE BENANNTE NEUERUNG DIESER AUFGABE, KEIN SPALTENWERT.
 * `loanable = false` (Spec:5205, Alt-Code `device_not_loanable`) ist ein EIGENES Feld und
 * kein Wert der Spalte `devices.status` (`_db/schema.ts:30` fuehrt sie als nullable
 * Textspalte). Die vier Zustaende des Chips stehen in `_lib/status.ts:48`; `AVAILABLE`
 * fehlt hier mit Absicht — ein freigegebenes, freies Geraet ist kein Konflikt, und ein
 * Zweig dafuer waere ein Satz, den niemand je sieht.
 */
export type Konflikt =
  | { zustand: "ON_LOAN"; entleiher: string }
  | { zustand: "DEFECT" }
  | { zustand: "MAINTENANCE" }
  | { zustand: "NICHT_FREIGEGEBEN" };

/**
 * Das Vokabular, das in `betroffen[].status` gehoert — als eigener Name, damit A15 nicht
 * raten muss, was dort hineingeschrieben wird.
 */
export type KonfliktZustand = Konflikt["zustand"];

/**
 * Ein Geraet, an dem die Ausleihe gescheitert ist.
 *
 * ⛔ `status` DARF NICHT VERLOREN GEHEN (Spec:5223-5228, Entscheidung E11,
 * `KOPF.md:668-671`): es ist der Platz des heutigen `condition`-Felds aus dem 409-Rumpf
 * (`loanApi.ts:168`) und „das einzige, das dem Kiosk sagt, WARUM ein Geraet nicht verfuegbar
 * ist". Ein `betroffen`-Eintrag ohne `status` ist derselbe Verlust in neuer Schreibweise.
 *
 * ⚠️ DER TYP BLEIBT `string`, WOERTLICH WIE IN SPEC:3449 UND ENTSCHEIDUNG E13
 * (`KOPF.md:771`: „die Signaturen der Spec bleiben sonst woertlich"). Eine Verengung
 * auf `KonfliktZustand` waere enger als die Quelle: A15 baut den Zustand als
 * `hatLeihe ? "ON_LOAN" : geraeteZustandAus(...)` (`progress.md:245`), und dieser
 * Ausdruck hat den Typ `GeraeteStatus` — er enthaelt `AVAILABLE` und kennt
 * `NICHT_FREIGEGEBEN` nicht. Die Verengung erzwaenge dort einen Typfehler, dessen
 * billigster oertlicher Fix eine Aufweichung in `_lib/status.ts` waere.
 * ⛔ AUFLAGE AN A15: hier gehoert einer der Werte aus `KonfliktZustand` hinein.
 */
export interface BetroffenesGeraet {
  rufname: string;
  status: string;
}

/**
 * DIE EINGABE FUER EINEN AUSLEIH-SATZ — je `grund` genau die Angaben, die sein Satz
 * braucht, und keine weitere.
 *
 * ⛔ DAS IST DER GRUND FUER DIE UNIONSFORM statt eines Objekts mit lauter optionalen
 * Feldern: ein `rufname?: string` liesse „undefined steht nicht mehr in der Liste."
 * typkorrekt durch. Regel 1 aus Spec:3547 („der Rufname steht IM SATZ") ist damit
 * konstruktiv gehalten und nicht bloss zugesichert.
 *
 * ⛔ `sitzung` UND `gesperrt` KOMMEN AUS `SperrGrund` (`_lib/ausleihZugang.ts:77`) — sie
 * werden hier NICHT ein zweites Mal ausgeschrieben. Entscheidung E13 (`KOPF.md:732-778`)
 * verlangt genau diese zwei Werte in BEIDEN Unions, weil Zusage §3.10 Nr. 8 (Spec:3235-3236)
 * die Flaeche zwingt, sie zu unterscheiden. ⚠️ WAECHST `SperrGrund` um einen Wert, brechen
 * die zwei `switch` unten am `never`-Zweig — das ist Absicht und kein Kollateralschaden.
 */
export type AusleihMeldung =
  | { grund: "keine-auswahl" }
  | { grund: "kein-name" }
  | { grund: "nicht-verfuegbar"; rufname: string; konflikt: Konflikt }
  | { grund: "verschwunden"; rufname: string }
  | { grund: "unbekannt" }
  | { grund: SperrGrund };

/** Die `grund`-Union der Ausleihe — ABGELEITET, damit sie von den Saetzen nicht abweichen kann. */
export type AusleihGrund = AusleihMeldung["grund"];

/**
 * Der geschlossene Satz als WERT, nach dem Vorbild von `GATE_GRUENDE`
 * (`_lib/gateTexte.ts:37-42`) und `GERAETE_STATUS` (`_lib/status.ts:56-61`). Er ist
 * exportiert, damit der Test ihn durchlaufen kann — und er ist die einzige Stelle, an der
 * ein verlorener Grund ohne Typfehler auffiele.
 */
export const AUSLEIH_GRUENDE: readonly AusleihGrund[] = [
  "keine-auswahl",
  "kein-name",
  "nicht-verfuegbar",
  "verschwunden",
  "unbekannt",
  "sitzung",
  "gesperrt",
] as const;

/** Dasselbe fuer die Rueckgabe (Spec:3566-3568, erweitert um `SperrGrund`, Entscheidung E13). */
export type RueckgabeMeldung =
  | { grund: "schon-zurueck"; rufname: string }
  | { grund: "unbekannt-geworden" }
  | { grund: "notiz-zu-lang" }
  | { grund: "unbekannt" }
  | { grund: SperrGrund };

/** Die `grund`-Union der Rueckgabe — abgeleitet, aus demselben Grund wie `AusleihGrund`. */
export type RueckgabeGrund = RueckgabeMeldung["grund"];

/** Der geschlossene Satz der Rueckgabe-Gruende, als Wert. */
export const RUECKGABE_GRUENDE: readonly RueckgabeGrund[] = [
  "schon-zurueck",
  "unbekannt-geworden",
  "notiz-zu-lang",
  "unbekannt",
  "sitzung",
  "gesperrt",
] as const;

/**
 * DIE RUECKGABEFORM BEIDER SCHREIB-ACTIONS (Spec:3446-3450, Entscheidung E11).
 *
 * ⛔ RUECKGABEWERT STATT WURF (Spec:3458-3459): ein `throw` aus einer Server Action kommt
 * in Produktion als anonymisierte Meldung an und verliert genau die Auskunft, die der
 * Mensch braucht — derselbe Verlust wie `device_not_available` ohne `condition`
 * (Spec:5229-5232).
 *
 * ⛔ `betroffen` IST BEI `grund: "sitzung"` UND `"gesperrt"` DIE LEERE LISTE
 * (`KOPF.md:774-775`): es gibt kein betroffenes Geraet, der Vorgang ist am Riegel
 * gescheitert. ⛔ AUFLAGE AN A15 UND A17.
 */
export type AusleihErgebnis =
  | { ok: true; anzahl: number; entleiher: string }
  | { ok: false; grund: AusleihGrund; text: string; betroffen: BetroffenesGeraet[] };

/** Dasselbe fuer die Rueckgabe (Spec:3566-3568). Ohne `betroffen` — es geht um EINE Ausleihe. */
export type RueckgabeErgebnis =
  | { ok: true; rufname: string }
  | { ok: false; grund: RueckgabeGrund; text: string };

/**
 * DIE ZWEI SPERR-SAETZE, AN GENAU EINER STELLE — sie gehoeren beiden Unions an.
 *
 * ⚠️ DER SATZ ZU `sitzung` SAGT AUSDRUECKLICH, DASS DIE EINGABEN STEHEN BLEIBEN, und dieser
 * Halbsatz ist tragend: er steht neben dem Erneuerungsfeld (`_ui/SitzungErneuern.tsx`,
 * A19/A20), und ohne ihn tippt der Mensch vorsichtshalber alles neu. Die Inline-Erneuerung
 * ist Entscheidung E12 (`KOPF.md:675-728`), ihr Spec-Grund ist Spec:2563-2570.
 *
 * ⛔ DER SATZ ZU `gesperrt` KOMMT AUS `_lib/gateTexte.ts:71` UND WIRD HIER NICHT ABGESCHRIEBEN
 * (Fund F25). Die Form `gateMeldung(...)!` ist die Hausform — `gateMeldung` liefert `null`
 * nur fuer einen Grund AUSSERHALB des Satzes (`_lib/gateTexte.ts:111`), und `"gesperrt"`
 * steht namentlich in `GATE_GRUENDE` (`_lib/gateTexte.ts:37-42`). Bestand:
 * `_actions/sitzung.ts:101` und `:122`. ⛔ KEIN `?? "…"` DAHINTER — ein Rueckfalltext waere
 * eine zweite, verkuerzte Fassung desselben Satzes; `_lib/bauform.test.ts:546-583` macht
 * das rot.
 *
 * ⛔ UND ER BIETET KEINE ERNEUERUNG AN (Zusage §3.10 Nr. 8, Spec:3235-3236): derselbe Code
 * scheitert genauso. Die Flaeche liest dafuer `grund`, nicht den Text.
 */
const SPERR_SAETZE: Record<SperrGrund, string> = {
  sitzung: "Dein Zugang ist abgelaufen. Gib den Code erneut ein — deine Eingaben bleiben stehen.",
  gesperrt: gateMeldung("gesperrt", null)!,
};

/*
 * DIE ZWEI HAELFTEN DES SCHREIBSPERREN-SATZES (Spec:3809, woertlich: „Gerade ist zu viel
 * gleichzeitig los. Bitte in einem Moment erneut versuchen.").
 *
 * ⛔ SIE STEHEN GETRENNT, WEIL DER `unbekannt`-SATZ ZWISCHEN SIE SCHREIBT. Spec:3545 fuehrt
 * die Zeile „Verbindung / Server" mit „woertlich uebernommen, ERGAENZT UM ‚Es wurde nichts
 * gebucht.'" — die Ergaenzung gehoert hinter den Befund und vor die Aufforderung. Eine
 * Zusammensetzung per `replace` auf dem fertigen Satz waere dieselbe Aussage, aber sie
 * zerbraeche still, sobald jemand ein Wort aendert.
 */
const SPERRE_BEFUND = "Gerade ist zu viel gleichzeitig los.";
const SPERRE_AUFFORDERUNG = "Bitte in einem Moment erneut versuchen.";

/**
 * SCHREIBSPERRE AUF SQLITE — der zweite der drei Stoerungssaetze aus §4.7 (Spec:3809).
 *
 * ⚠️ ER IST DER SATZ FUER DEN FALL OHNE VORGANG (etwa ein Lesepfad). Wo ein Vorgang
 * gescheitert ist, tritt der `unbekannt`-Satz an seine Stelle — er sagt zusaetzlich, dass
 * nichts gebucht wurde.
 */
export const SCHREIBSPERRE = `${SPERRE_BEFUND} ${SPERRE_AUFFORDERUNG}`;

/**
 * BROWSER OFFLINE (Funkloch im Geraetelager) — der erste Stoerungssatz aus §4.7
 * (Spec:3808), Wortwahl aus dem Bestand `lib/error-messages.ts:45-47`, ergaenzt um den
 * entscheidenden Satz, dass nichts gebucht wurde.
 *
 * ⚠️ ER IST KEIN `grund`, UND DAS IST DER PUNKT: in diesem Fall erreicht die Server Action
 * den Server gar nicht (Spec:3808), es gibt also keine Union, die ihn tragen koennte. Ihn
 * zeigt die Client-Insel (A19/A20), wenn der Aufruf scheitert.
 */
export const KEINE_VERBINDUNG =
  "Keine Verbindung. Die Ausleihe ist nicht gespeichert. Bitte erneut versuchen.";

/**
 * DER LEERZUSTAND OHNE GERAETE (§4.9.6, Spec:3919-3922).
 *
 * ⛔ EIN SATZ OHNE VERWEIS. Der Bestand hat hier einen Knopf „Geraete verwalten" auf
 * `/admin` (`DeviceList.tsx:89-98`) — auf einer ANONYMEN Flaeche. Ein sichtbarer Weg
 * dorthin, wo die aufrufende Person nicht hindarf, verletzt die Gegenprobe
 * `docs/design/README.md:420` („fuehrt KEIN Weg dorthin, wo die aufrufende Person nicht
 * hindarf?"), und die Riegel der Suite werfen dort absichtlich `notFound()`, damit die
 * Existenz der Seite nicht verraten wird.
 *
 * ⚠️ DAS WORT „Verwaltung" IM SATZ IST KEIN VERWEIS, sondern die Auskunft, WER es erledigt.
 * Ein Testanker auf diesem Wort waere rot-by-construction; der Test verankert deshalb auf
 * dem Fehlen eines PFADES.
 */
export const KEINE_GERAETE_ERFASST =
  "Es sind noch keine Geräte erfasst. Das erledigt die Verwaltung.";

/**
 * DER SATZ ZU EINEM AUSLEIH-AUSGANG. Genau einer je `grund` (Spec:3537-3545).
 *
 * ⚠️ DREI DER SIEBEN SAETZE SIND EINE PLANENTSCHEIDUNG DIESER AUFGABE UND KEIN SPEC-ZITAT:
 * `keine-auswahl`, `kein-name` (hier) und `notiz-zu-lang` (unten). Spec:5203 sagt zu ihnen
 * nur, sie seien „Feldfehler am Formularfeld, nicht als Seitenmeldung" — einen Wortlaut gibt
 * weder Spec noch Plan, und der Alt-Kiosk hat keinen: er schaltet den Knopf bloss ab
 * (`ConfirmLoanButton.tsx:45-46`). ⛔ EINEN SATZ BRAUCHEN SIE TROTZDEM, weil `text: string`
 * im `ok: false`-Zweig nicht optional ist und Spec:5229-5232 verlangt: „JEDER `grund`
 * braucht dort einen Text." Gewaehlt ist damit die erste der zwei zulaessigen Formen aus
 * `VORABSCAN-A.md:201` (Fund F4) — die Zahlen bleiben SIEBEN und SECHS, wie Entscheidung E13
 * sie setzt (`KOPF.md:775-778`).
 *
 * ⛔ WO SIE ERSCHEINEN, ENTSCHEIDET DIE FLAECHE, NICHT DIESE DATEI: die drei feldnahen
 * Gruende gehoeren ans Feld (Spec:5203), die uebrigen an den Meldungsort. A19/A20 bauen das.
 */
export function ausleihText(m: AusleihMeldung): string {
  switch (m.grund) {
    case "keine-auswahl":
      return "Kein Gerät ausgewählt. Wähle mindestens ein Gerät aus.";
    case "kein-name":
      return "Kein Name eingetragen. Trag ein, wer die Geräte mitnimmt.";
    case "nicht-verfuegbar":
      return konfliktSatz(m.rufname, m.konflikt);
    case "verschwunden":
      return `${m.rufname} steht nicht mehr in der Liste. Die Liste wurde aktualisiert.`;
    case "unbekannt":
      /*
       * Spec:3545, Zeile „Verbindung / Server": woertlich uebernommen (Spec:3809), ergaenzt
       * um „Es wurde nichts gebucht." Der Fall, der ihn wirklich ausloest, ist die
       * Schreibsperre auf SQLite — der Offline-Fall erreicht den Server nicht und hat
       * deshalb keinen `grund` (siehe `KEINE_VERBINDUNG`).
       */
      return `${SPERRE_BEFUND} Es wurde nichts gebucht. ${SPERRE_AUFFORDERUNG}`;
    case "sitzung":
    case "gesperrt":
      return SPERR_SAETZE[m.grund];
    default: {
      /*
       * ⛔ DER WURF IST TRAGEND UND KEINE ZIERDE. Vitest streift Typen ab: ein geloeschter
       * `case` waere allein ein `tsc`-Fehler, und ein `default`, der irgendeinen Text
       * zurueckgibt, liesse die Mutationssonde dazu GRUEN. Erst der Wurf macht sie rot.
       */
      const unerreicht: never = m;
      throw new Error(`kein Satz fuer ${JSON.stringify(unerreicht)}`);
    }
  }
}

/**
 * DIE DREI SAETZE ZU `nicht-verfuegbar`, auseinandergehalten durch den Konflikt und nicht
 * durch den `grund` (Spec:3539-3541, Fund F4).
 *
 * ⚠️ DER SATZ NENNT EIN GERAET. Die vollstaendige Liste steht in `betroffen`
 * (`AusleihErgebnis`), und die Flaeche zeigt sie daneben — Regel 1 (Spec:3547) verlangt den
 * Rufnamen IM Satz, nicht alle Rufnamen in einem Satz.
 */
function konfliktSatz(rufname: string, konflikt: Konflikt): string {
  switch (konflikt.zustand) {
    case "ON_LOAN":
      return `${rufname} ist inzwischen an ${konflikt.entleiher} ausgeliehen. Es wurde nichts gebucht.`;
    case "DEFECT":
    case "MAINTENANCE":
      /*
       * ⛔ DAS ETIKETT KOMMT AUS `_lib/status.ts:107` UND WIRD NICHT ABGESCHRIEBEN. Es ist
       * dasselbe Wort, das der Chip neben dem Geraet traegt (`ETIKETT`,
       * `_lib/status.ts:94-99`, woertlich aus dem Alt-Kiosk) — stuenden hier eigene Woerter,
       * saehe der Mensch am Chip das eine und im Satz darueber das andere.
       *
       * ⛔ UND DESHALB STEHEN DIE ZWEI ETIKETTWOERTER IN DIESER DATEI NIRGENDS AUSGESCHRIEBEN,
       * AUCH NICHT IN PROSA: `_lib/meldungen.test.ts` scannt den ROHEN Dateitext auf sie, und
       * eine Erwaehnung im Kommentar macht ihn rot. Dieselbe Auflage traegt `_lib/anzeige.ts`
       * fuer den Namen ihres Formatierers (`.superpowers/sdd/planteil3/progress.md:291-295`);
       * ohne den Scan liess sich `statusEtikett(...)` durch die zeichengleichen Literale
       * ersetzen, ohne dass ein Fall rot wurde (Sonde P7, **0 rot**, gemessen).
       */
      return `${rufname} steht auf ${statusEtikett(konflikt.zustand)} und kann nicht ausgeliehen werden.`;
    case "NICHT_FREIGEGEBEN":
      return `${rufname} ist zurzeit nicht zum Ausleihen freigegeben.`;
    default: {
      const unerreicht: never = konflikt;
      throw new Error(`kein Satz fuer ${JSON.stringify(unerreicht)}`);
    }
  }
}

/**
 * DER SATZ ZU EINEM RUECKGABE-AUSGANG. Genau einer je `grund` (Spec:3543-3544, 3566-3568).
 */
export function rueckgabeText(m: RueckgabeMeldung): string {
  switch (m.grund) {
    case "schon-zurueck":
      return `${m.rufname} wurde zwischenzeitlich von jemand anderem zurückgegeben.`;
    case "unbekannt-geworden":
      return "Diese Ausleihe gibt es nicht mehr. Die Liste wurde aktualisiert.";
    case "notiz-zu-lang":
      /*
       * ⚠️ PLANENTSCHEIDUNG, kein Spec-Zitat — siehe den Absatz an `ausleihText`. Die Zahl
       * kommt aus `ZUSTANDSNOTIZ_MAX` und nicht aus dem Satz: eine ausgeschriebene „500"
       * hier waere die zweite Wahrheit ueber dieselbe Grenze.
       */
      return `Die Zustandsnotiz ist zu lang. Höchstens ${ZUSTANDSNOTIZ_MAX} Zeichen.`;
    case "unbekannt":
      /*
       * Dieselbe Bauart wie bei der Ausleihe, mit dem Vorgang dieses Flusses im Mittelteil:
       * „Es wurde nichts gebucht." beschriebe eine Ausleihe und nicht eine Rueckgabe.
       */
      return `${SPERRE_BEFUND} Die Rückgabe ist nicht gespeichert. ${SPERRE_AUFFORDERUNG}`;
    case "sitzung":
    case "gesperrt":
      return SPERR_SAETZE[m.grund];
    default: {
      const unerreicht: never = m;
      throw new Error(`kein Satz fuer ${JSON.stringify(unerreicht)}`);
    }
  }
}
