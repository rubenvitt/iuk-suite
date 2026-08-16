"use client";

import { useRef, useState } from "react";
import { DatePicker, Select, TimePicker } from "antd";
import deDE from "antd/es/date-picker/locale/de_DE";
import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/de";

/*
 * `customParseFormat` AUSDRUECKLICH, OBWOHL antd DENSELBEN PLUGIN SCHON LAEDT
 * (`@rc-component/picker/es/generate/dayjs` ruft `dayjs.extend` auf Modulebene). Genau darauf zu
 * bauen hiesse, sich auf ein Interna eines transitiven Pakets zu verlassen: faellt es fort, parst
 * `ausIso` unten still nach ISO-8601 statt nach dem uebergebenen Muster, und eine Vorbelegung
 * verschwaende, ohne dass ein Tor es sieht. `dayjs.extend` ist idempotent — der zweite Aufruf
 * kostet nichts.
 *
 * `dayjs/locale/de` HAT EINEN ZWEITEN, EIGENEN GRUND: die Wochentagsspalten des Kalenders kommen
 * NICHT aus antds `de_DE` (das liefert nur die Beschriftungen), sondern aus dayjs' eigener
 * Locale-Data (`getWeekFirstDay`). Ohne diesen Import faellt dayjs auf `en` zurueck und der Monat
 * beginnt am Sonntag statt am Montag.
 */
dayjs.extend(customParseFormat);

/*
 * DIE DREI AUSWAHLFELDER DES MODULS — antds `DatePicker`, `TimePicker` UND `Select` STATT
 * `<input type="date">`, `<input type="time">` UND `<select>` (Betreiberurteil 2026-08-16:
 * „selects werden nicht von ant verwendet; date picker auch nicht").
 *
 * ══ WAS VORHER DAGEGEN SPRACH, UND WARUM ES HIER NICHT MEHR TRAEGT. `feedback/_ui/
 *    StartFormular.tsx` fuehrt drei Gruende gegen `DatePicker` — sie gelten dort weiter, hier
 *    keiner davon:
 *
 *      · „server-render-fest": jede Aufrufstelle dieses Moduls IST bereits eine Client-Insel
 *        (`useActionState`, `Popover`, `Modal`), keine Server Component. Es gibt nichts zu
 *        verlieren.
 *      · „braucht kein Locale-Buendel": das Buendel kommt hier genau EINMAL herein, in dieser
 *        Datei, und wird von acht Aufrufstellen geteilt.
 *      · „ohne Client-JS vorbelegbar": die Aufrufstellen laufen ohnehin erst mit JavaScript
 *        (`useActionState` ist ein Hook) — die Zusage war an dieser Stelle schon vorher keine.
 *
 *    Die zweite Haelfte der alten Begruendung stand in `PersonenFormular.tsx` und `ArchivFilter.tsx`
 *    („kein zweites Formular-Vokabular im Modul"). Sie war richtig, solange das Modul GAR KEIN
 *    antd-Auswahlfeld hatte — mit dieser Datei ist antd das Vokabular, und ein natives `<select>`
 *    daneben waere jetzt das zweite.
 *
 * ══ DER WERT FAEHRT IN EINEM VERSTECKTEN FELD, UND DAS IST KEINE BEQUEMLICHKEIT, SONDERN DIE
 *    EINZIGE MOEGLICHKEIT. antds `Select` benennt sein inneres `<input>` nicht, und der `name`, den
 *    `DatePicker`/`TimePicker` durchreichen (`@rc-component/picker`s `useInputProps`), haengt am
 *    SICHTBAREN Feld — dessen Inhalt ist der ANZEIGETEXT („01.09.2026"), nicht die ISO-Form, die
 *    jede Action dieses Moduls erwartet. Ein verstecktes Feld daneben traegt deshalb `name` und
 *    ISO-Wert; dieselbe Bauart, aus demselben Grund, wie `PersonenFormular.tsx`s `Verzeichnisfeld`
 *    sie fuer `AutoComplete` schon fuehrt.
 *
 *    DARAUS FOLGT DIE ZWEITE HAELFTE DES VERTRAGS: an den Actions aendert sich NICHTS. `planDatum`
 *    ist weiterhin `YYYY-MM-DD`, `planUhrzeit` weiterhin `HH:MM`, `nachweisArt`/`rolle`/`prioritaet`
 *    weiterhin ihre Schluessel. `actions.ts` und jeder Riegel darin bleiben unberuehrt.
 *
 * ══ ZWEI FORMATE AM DATUMSFELD, UND DAS ZWEITE IST ABSICHT. Angezeigt wird `DD.MM.YYYY` (die Form,
 *    die ein natives `<input type="date">` auf einem deutschen System auch zeigte — der Wechsel auf
 *    antd darf die gewohnte Schreibweise nicht kosten). GELESEN wird zusaetzlich `YYYY-MM-DD`:
 *    rc-picker probiert jedes Format der Liste beim Parsen durch und benutzt nur das erste zum
 *    Anzeigen. Damit nimmt das Feld eine getippte oder eingefuegte ISO-Zeichenkette weiterhin an —
 *    das ist die Form, in der Daten in diesem Projekt herumgereicht werden (Seed, Verlauf, jeder
 *    e2e-Test).
 *
 * ══ WARUM DIE FELDER SICH UEBER EINEN `key` ZURUECKSETZEN UND NICHT UEBER EINEN EFFEKT. Ein
 *    antd-Auswahlfeld ist KONTROLLIERT (nur so kann eine Auswahl im Kalender den Wert setzen), und
 *    kontrollierte Felder setzt React nach einer abgeschlossenen Action NICHT zurueck — anders als
 *    die unkontrollierten `Input`s daneben. Die naheliegenden Auswege sind in diesem Projekt beide
 *    gesperrt: ein `useEffect` mit `setState` ist ein Lint-FEHLER
 *    (`react-hooks/set-state-in-effect`), ein Abgleich waehrend des Renderns ebenso
 *    (`react-hooks/refs`). Bleibt der Remount ueber den `key` — dieselbe Lage und dieselbe Antwort,
 *    die `PersonenFormular.tsx` fuer sein Suchfeld ausfuehrlich begruendet.
 *
 *    DER SCHLUESSEL HAT ZWEI TEILE, UND BEIDE WERDEN GEBRAUCHT:
 *      · `wert` faengt den FEHLERFALL: `feldWert(state, …)` traegt die Eingabe zurueck, der Prop
 *        aendert sich, das Feld montiert mit dem zurueckgetragenen Wert neu.
 *      · `stand` faengt den ERFOLGSFALL: dort ist der Prop VORHER wie NACHHER die Vorgabe (meist
 *        `""`) — ohne einen zweiten Teil aenderte sich der Schluessel nicht, und die eben
 *        eingestellte Aufgabe stuende mit ihrem Datum noch im Formular fuer die naechste. Die
 *        Aufrufstelle reicht dafuer einen Absendezaehler herein (`AufgabeFormular`,
 *        `RoutineFormular`, `PersonenFormular`); wo ein Wert nach dem Absenden STEHEN BLEIBEN soll
 *        (die Einplan-Felder tragen danach den geltenden Plan), bleibt `stand` ungesetzt.
 *
 * ══ `imPortal` GEHOERT ZU `Popover`, NICHT ZUM GESCHMACK. Ein Auswahlfeld haengt sein Panel per
 *    Vorgabe an den `<body>` — also NEBEN den Popover-Inhalt, nicht hinein. Fuer rc-trigger ist ein
 *    Klick dorthin ein Klick nach AUSSEN: das Zeilenfeld (`ZuweisenInline`, `EinplanenInline`)
 *    schloesse sich in dem Moment, in dem man einen Tag anklickt, und die Auswahl ginge verloren.
 *    `getPopupContainer` haengt das Panel deshalb an den Elternknoten des Ausloesers — damit liegt
 *    es INNERHALB des Popovers und der Klick zaehlt als innen.
 *
 * ══ KEIN `size` (Falle 4): `ARBEITSDICHTE` in `core/theme/theme.ts` gibt die 44px, und
 *    `core/theme/theme.ts` haelt mit `DatePicker.inputFontSize`/`Select.optionFontSize` die
 *    16px-Zusage fuer Eingabefelder. Beide Token standen dort schon, bevor dieses Modul sie
 *    brauchte — diese Datei ist ihr erster Nutznieszer im Modul, nicht ihr Anlass.
 *
 * ══ KEIN `@ant-design/icons` (Falle 7): die Zeichen im Feld (Kalender, Uhr, Loeschkreuz, Pfeil)
 *    bringt antd selbst mit — es sind Vorgaben der Komponenten, kein Import dieser Datei. Der
 *    modulweite Quelltext-Riegel in `SeitenKopf.test.tsx` prueft Importpfade und bleibt gruen.
 */

/** Die Form, in der jede Action dieses Moduls ein Datum erwartet (`_lib/eingabe.ts`). */
const ISO_TAG = "YYYY-MM-DD";
/** Die Form, in der ein Datum in diesem Land GELESEN wird — nur die Anzeige, nie der Wert. */
const ANZEIGE_TAG = "DD.MM.YYYY";
/** Uhrzeiten sind in beiden Rollen gleich: `HH:MM` steht im Feld und geht so an die Action. */
const ISO_ZEIT = "HH:mm";

/** Das Panel INNERHALB des Ausloesers aufhaengen — s. `imPortal` im Kopfkommentar. */
function imElternknoten(ausloeser: HTMLElement): HTMLElement {
  return ausloeser.parentElement ?? document.body;
}

/**
 * `Enter` IM DATUMS- ODER ZEITFELD UEBERNIMMT DIE EINGABE — UND SENDET NICHT DAS FORMULAR AB.
 *
 * `@rc-component/picker` uebernimmt eine getippte Eingabe bei `Enter` (`Selector/Input.js`s
 * `onSharedKeyDown` ruft `onSubmit()`), ruft danach diesen Handler und ruft `preventDefault()
 * SELBST NICHT. In einem `<form>` bleibt damit die implizite Absendung des Browsers stehen: der
 * Tastendruck, der das Datum uebernimmt, betaetigt im selben Zug den ersten Absendeknopf.
 *
 * DAS IST NICHT NUR EIN SCHOENHEITSFEHLER, und der schlimmste Fall steht in `ZuweisenInline.tsx`:
 * dort IST jeder Absendeknopf eine Person („der Klick auf den Namen ist das Absenden"). Ein `Enter`
 * im Zeitvorschlag verteilte die Aufgabe damit an die ERSTE Person der Liste — nicht an die
 * gewaehlte, denn gewaehlt war noch keine. Ein natives `<input type="date">` trug denselben
 * scharfen Rand; er faellt hier auf, weil `Enter` am Auswahlfeld nicht mehr nur „absenden" heisst,
 * sondern „uebernehmen".
 *
 * DIE REIHENFOLGE MACHT ES MOEGLICH: rc-pickers eigene Uebernahme laeuft VOR diesem Handler. Wir
 * unterdruecken also nur die Folge des Tastendrucks, nicht seine Wirkung im Feld.
 */
function enterUebernimmtNurDasFeld(ereignis: React.KeyboardEvent<HTMLElement>): void {
  if (ereignis.key === "Enter") ereignis.preventDefault();
}

interface FeldProps {
  /** Traegt das SICHTBARE Feld — `label htmlFor` und jeder Testgriff zeigen darauf. */
  id: string;
  /** Traegt das VERSTECKTE Feld — das ist der Name, unter dem die Action den Wert liest. */
  name: string;
  /** Der Ausgangswert in ISO-Form; `""` heisst „leer". */
  wert?: string;
  /** Gesetzt heisst: rote Kontur plus `aria-invalid`. Der Text selbst steht an der Aufrufstelle. */
  fehler?: string;
  /** Die Id der Fehler- oder Hinweiszeile, die das Feld beschreibt (`aria-describedby`). */
  beschriebenVon?: string;
  /** Im `Popover`-Inhalt: das Panel INNERHALB des Popovers aufhaengen (s. Kopfkommentar). */
  imPortal?: boolean;
  /** Zweiter Teil des Remount-Schluessels — s. Kopfkommentar. */
  stand?: string | number;
}

/* ── DATUM ──────────────────────────────────────────────────────────────────────────────────── */

export function DatumFeld({ stand, ...rest }: FeldProps): React.ReactElement {
  return <DatumFeldInnen key={`${stand ?? ""} ${rest.wert ?? ""}`} {...rest} />;
}

function DatumFeldInnen({
  id,
  name,
  wert = "",
  fehler,
  beschriebenVon,
  imPortal = false,
}: Omit<FeldProps, "stand">): React.ReactElement {
  const [iso, setIso] = useState(wert);

  return (
    <>
      <input type="hidden" name={name} value={iso} />
      <DatePicker
        id={id}
        locale={deDE}
        value={ausIso(iso, ISO_TAG)}
        onChange={(tag: Dayjs | null) => setIso(tag ? tag.format(ISO_TAG) : "")}
        format={[ANZEIGE_TAG, ISO_TAG]}
        onKeyDown={enterUebernimmtNurDasFeld}
        placeholder="TT.MM.JJJJ"
        style={{ width: "100%" }}
        status={fehler ? "error" : undefined}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={beschriebenVon}
        getPopupContainer={imPortal ? imElternknoten : undefined}
      />
    </>
  );
}

/* ── UHRZEIT ────────────────────────────────────────────────────────────────────────────────── */

export function ZeitFeld({ stand, ...rest }: FeldProps): React.ReactElement {
  return <ZeitFeldInnen key={`${stand ?? ""} ${rest.wert ?? ""}`} {...rest} />;
}

function ZeitFeldInnen({
  id,
  name,
  wert = "",
  fehler,
  beschriebenVon,
  imPortal = false,
}: Omit<FeldProps, "stand">): React.ReactElement {
  const [iso, setIso] = useState(wert);

  return (
    <>
      <input type="hidden" name={name} value={iso} />
      <TimePicker
        id={id}
        locale={deDE}
        value={ausIso(iso, ISO_ZEIT)}
        onChange={(zeit: Dayjs | null) => setIso(zeit ? zeit.format(ISO_ZEIT) : "")}
        format={ISO_ZEIT}
        /*
         * MINUTENGENAU UND OHNE SEKUNDENSPALTE (`format` oben): `_lib/eingabe.ts` kennt nur
         * `HH:MM`, eine dritte Spalte boete eine Genauigkeit an, die das Feld gar nicht speichern
         * kann.
         *
         * KEIN `minuteStep`, OBWOHL EIN GROBERES RASTER (5 oder 15) DAS PANEL VIEL KUERZER MACHTE:
         * das waere eine fachliche Einschraenkung, die es heute nicht gibt — `istGueltigeUhrzeit`
         * nimmt jede Minute an, und geplante Zeiten kommen aus Routinen und Vorschlaegen, nicht
         * aus einer Rasterwahl. Wer die Liste kuerzen will, aendert damit, was planbar IST, und
         * das ist eine Entscheidung des Betreibers, keine der Oberflaeche.
         *
         * `needConfirm={false}`: antds Vorgabe verlangt am Zeitwaehler einen „OK"-Klick, bevor die
         * Auswahl gilt. In einem Formular, dessen anderes Feld (das Datum) ohne Bestaetigung
         * uebernimmt, ist das ein zweiter Bedienweg fuer dieselbe Handlung — und in den zwei
         * Zeilenfeldern (`ZuweisenInline`, `EinplanenInline`) faellt der Knopf zusaetzlich mit dem
         * Absenden zusammen, das dort der Klick auf einen Namen ist.
         *
         * `showNow={false}`: „Jetzt" traegt die aktuelle Uhrzeit auf die Minute genau ein — in
         * einem Plan- oder Fristfeld ist das nie die gemeinte Angabe.
         */
        showNow={false}
        needConfirm={false}
        onKeyDown={enterUebernimmtNurDasFeld}
        placeholder="HH:MM"
        style={{ width: "100%" }}
        status={fehler ? "error" : undefined}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={beschriebenVon}
        getPopupContainer={imPortal ? imElternknoten : undefined}
      />
    </>
  );
}

/* ── WAHL AUS EINER LISTE ───────────────────────────────────────────────────────────────────── */

export interface WahlOption {
  wert: string;
  text: string;
}

interface WahlFeldProps extends FeldProps {
  optionen: readonly WahlOption[];
  /**
   * Wird NACH dem Schreiben des versteckten Feldes gerufen und bekommt dieses Feld mit — der
   * einzige Aufrufer ist heute `ArchivFilter`, das daraufhin `feld.form?.requestSubmit()` ruft.
   *
   * DAS FELD WIRD MITGEGEBEN, STATT DASS DER AUFRUFER SICH EINE `ref` HAELT: antds `Select` ist
   * kein Formularelement und hat kein `.form` — der einzige Knoten, der das Formular kennt, ist
   * genau dieses versteckte Feld. Und die REIHENFOLGE ist die ganze Mechanik: `requestSubmit()`
   * liest den DOM, nicht den React-Zustand, deshalb wird der Wert vorher von Hand geschrieben.
   */
  beiWahl?: (wert: string, feld: HTMLInputElement) => void;
}

export function WahlFeld({ stand, ...rest }: WahlFeldProps): React.ReactElement {
  return <WahlFeldInnen key={`${stand ?? ""} ${rest.wert ?? ""}`} {...rest} />;
}

function WahlFeldInnen({
  id,
  name,
  wert = "",
  optionen,
  fehler,
  beschriebenVon,
  imPortal = false,
  beiWahl,
}: Omit<WahlFeldProps, "stand">): React.ReactElement {
  const [gewaehlt, setGewaehlt] = useState(wert);
  /*
   * DAS VERSTECKTE FELD WIRD ZUSAETZLICH VON HAND GESCHRIEBEN, UND ZWAR VOR `beiWahl`.
   * `setGewaehlt` wirkt erst beim naechsten Rendern; ein `requestSubmit()` im selben Handler saehe
   * sonst den ALTEN Wert und schickte die vorige Wahl ab. Der Zustand setzt gleich darauf denselben
   * Wert — die zwei Wege widersprechen sich nie, sie sind nur verschieden schnell.
   */
  const versteckt = useRef<HTMLInputElement>(null);

  const waehlen = (neu: string): void => {
    const feld = versteckt.current;
    if (feld) feld.value = neu;
    setGewaehlt(neu);
    if (feld) beiWahl?.(neu, feld);
  };

  return (
    <>
      <input ref={versteckt} type="hidden" name={name} value={gewaehlt} />
      <Select
        id={id}
        value={gewaehlt}
        onChange={waehlen}
        options={optionen.map((o) => ({ value: o.wert, label: o.text }))}
        /*
         * jsdom kennt keine Elementhoehen; mit Virtualisierung rendert die Liste in Tests NIE —
         * ein Test, der eine Option anklicken will, faende sie strukturell nicht. Woertlich
         * dieselbe Zeile und derselbe Grund wie an `PersonenFormular.tsx`s `AutoComplete`. Der
         * Verzicht kostet nichts: die laengste Liste dieses Moduls hat vier Eintraege.
         */
        virtual={false}
        style={{ width: "100%" }}
        status={fehler ? "error" : undefined}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={beschriebenVon}
        getPopupContainer={imPortal ? imElternknoten : undefined}
      />
    </>
  );
}

/* ── HILFSMITTEL ────────────────────────────────────────────────────────────────────────────── */

/**
 * ISO-Zeichenkette → `Dayjs` oder `null`. STRIKT geparst (dritter Parameter `true`): eine
 * unvollstaendige oder ungueltige Zeichenkette ergibt dann `null` statt eines stillschweigend
 * zurechtgebogenen Datums — die Vorbelegung kommt aus der Datenbank oder aus `values` einer
 * fehlgeschlagenen Action, und beides darf im Feld nicht als etwas anderes erscheinen, als es ist.
 */
function ausIso(roh: string, muster: string): Dayjs | null {
  if (roh === "") return null;
  const gelesen = dayjs(roh, muster, true);
  return gelesen.isValid() ? gelesen : null;
}
