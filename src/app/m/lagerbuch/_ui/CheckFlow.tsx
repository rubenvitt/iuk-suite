"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Stepper } from "./Stepper";
import { HelferChip } from "./HelferChip";
import { LeerZustand } from "./LeerZustand";
import { Ikone } from "./ikonen";
import { checkAbschluss, type CheckAbschlussWert } from "../_actions/check";
import { erneuereSitzung } from "../_actions/sitzung";
import { CODEFELD_LAENGE, CODEFELD_MUSTER, CODEFELD_PLATZHALTER } from "../_lib/tokenForm";
import {
  checkNutzlast,
  zaehleAblaufende,
  GERAET_VORBELEGUNG,
  type CheckZaehlung,
  type CheckGeraetAntwort,
} from "../_lib/checkNutzlast";
import { verfallStatus, type VerfallSchwellen } from "../_lib/domain/verfall";
import { o2Status } from "../_lib/domain/o2";
import { obergrenze, ueberschuss } from "../_lib/domain/sollBereich";
import { chargeText, ampelTon } from "../_lib/format";
import {
  dieseEinheit, einheitMeta, grossAmAnfang, inDerEinheit, inDieEinheit, ZUSTAENDE,
  type Einheitenart, type Zustand,
} from "../_lib/konstanten";
import {
  ANMELDUNG_TEXT, NETZ_TEXT_CHECK, darfKaertchenErneuern, type HelferGrund,
} from "../_lib/actionTypen";
import { plombenNummerNorm } from "../_lib/plombe";
import { DEMO_PFAD, demoAbschluss } from "../_lib/demoCheck";
import s from "./helfer.module.css";

/**
 * DER FAHRZEUG-CHECK — §7.9.
 *
 * ⚠️ DIE EINE STRUKTURAENDERUNG (Falle 15, §7.9.1): DIESE KOMPONENTE KENNT NUR
 * NOCH EIN FAHRZEUG. Heute reicht `helfer/check/page.tsx` vier
 * `Object.fromEntries(fahrzeuge.map(...))`-Woerterbuecher KOMPLETT herein
 * (`CheckFlow.tsx:50-58`) — damit wandert bei JEDEM Helfer-Aufruf die
 * Soll-Bestueckung, Geraeteliste, Flaschenliste und Verfallslage DER GESAMTEN
 * ORGANISATION in den RSC-Payload: auf ein PRIVATES Telefon, in einer Sitzung
 * OHNE Konto (§3.4.5). Die vier Woerterbuecher und `preselect` entfallen; die
 * Fahrzeugwahl wird eine NAVIGATION (`_ui/FahrzeugWahl.tsx`, T80).
 *
 * ⚠️ DIE NUTZLAST WIRD NICHT HIER GEBAUT, sondern von `checkNutzlast`
 * (Teil 3, T43). Das Verfallsfeld im Zaehlschritt und die Live-Vorschau
 * „{n} laufen ab" sind laut §12.1 DIE EINZIGE Absicherung ihrer Fachlichkeit —
 * `actions/check.test.ts:229` beweist nur, dass der Server richtig zaehlt,
 * WENN der Wert ankommt.
 *
 * ⚠️ DIE AMPEL WIRD IM CLIENT GERECHNET, und das ist keine Zeitzonenfrage mehr
 * (§7.9.3): `verfallStatus` rechnet ueber `monatsEnde()` aus `_lib/zeit.ts` und
 * ist ZONENEXPLIZIT. Ob die Funktion im Browser oder im Container laeuft,
 * aendert das Ergebnis nicht mehr — Chip im Zaehlschritt und Zahl in der
 * Abschlussmeldung koennen KONSTRUKTIV nicht auseinanderfallen.
 */

export type CheckPos = {
  id: string;
  fachLabel: string;
  artikelId: string;
  artikelName: string;
  einheit: string;
  handlagerFach: string;
  soll: number;
  /** IDA-247: „OK bis", `null` = kein Bereich. Erst darueber ist es zu viel. */
  sollMax: number | null;
  fahrzeugBestand: number;
  handlagerBestand: number;
};
export type CheckGeraet = { id: string; typ: "medizin" | "objekt"; name: string };
export type CheckFlasche = {
  id: string;
  name: string;
  nennfuelldruckBar: number;
  /**
   * % vom Nennfuelldruck, ab dem der Wechselhinweis erscheint (DRK-308).
   *
   * ⚠️ EIN PROP, KEIN IMPORT. Diese Datei ist eine Client-Insel; ein Wert aus
   * einem Servermodul kaeme hier als Client-Referenz an statt als Zahl
   * (Falle 6, `CLAUDE.md`). Die Zahl kommt aus `o2FlaschenFuerLagerort` und
   * damit aus der Stammzeile DIESER Flasche — eine Konstante an dieser Stelle
   * zeigte etwas anderes an, als der Abschluss danach zaehlt.
   */
  wechselAbProzent: number;
  /**
   * Der zuletzt gemessene Druck, oder `null`, wenn NIE gemessen wurde.
   *
   * ⚠️ Seit Teil 3 nullbar, und der Grund ist ein Fehlalarm: eine fehlende
   * Messung wurde vorher als „0 bar" gelesen — Ampel rot, und jemand lief los,
   * um eine volle Flasche zu tauschen. Der Null-Fall MUSS deshalb als „noch
   * nicht gemessen" erscheinen (Uebergabe Teil 3, Punkt 4). Das ist eine ANDERE
   * Aussage als „Nennfuelldruck nicht hinterlegt" (keine Messung vs. kein
   * Sollwert), und die eine ersetzt die andere nicht.
   */
  letzterDruck: number | null;
};

/**
 * IDA-222: eine Plombe, wie die Insel sie sieht.
 *
 * `erwartet` ist die NORMALISIERTE Nummer und nur im Kurzcheck gesetzt — und
 * dort nur, wenn die Plombe etwas bezeugt (`plombeDecktAb`). `null` heisst im
 * Kurzcheck „noch nie gesetzt" (der Schritt zeigt sie als Hinweis), im
 * Vollcheck immer: dort wird gesetzt, nicht verglichen.
 */
export type CheckPlombe = {
  id: string;
  bezeichnung: string;
  fachLabel: string | null;
  erwartet: string | null;
};

type Phase = "plomben" | "zaehlen" | "nachfuellen" | "geraete" | "sauerstoff";
const PHASE_LABEL: Record<Phase, string> = {
  plomben: "Plomben",
  zaehlen: "Zählen",
  nachfuellen: "Nachfüllen",
  geraete: "Geräte",
  sauerstoff: "Sauerstoff",
};

/** Der Schritt-Kopf zeigt NUR die Schritte, die dieses Fahrzeug wirklich hat (1:1, `:28-39`). */
function Schritte({ folge, aktiv }: { folge: Phase[]; aktiv: Phase }) {
  const idx = folge.indexOf(aktiv);
  return (
    <div className={s.schritte}>
      {folge.map((p, i) => (
        <div
          key={p}
          className={`${s.schritt} ${i === idx ? s.schrittAktiv : i < idx ? s.schrittFertig : ""}`}
          data-rolle="schritt"
        >
          <span className={s.schrittNr}>{i + 1}</span> {PHASE_LABEL[p]}
        </div>
      ))}
    </div>
  );
}

const zustandTon = (z: Zustand) =>
  z === "In Ordnung" ? "ok" : z === "Gebrauchsspuren" ? "gelb" : "rot";

/**
 * NACH OBEN BEIM SCHRITTWECHSEL — IDA-233.
 *
 * Gescrollt wird nicht das Fenster, sondern `.inhalt` des `HelferRahmen`
 * (`overflow-y: auto`). Ohne diese Funktion behielt der Kasten beim Wechsel
 * seine Position: wer am Ende einer 210er-Zaehlliste „Weiter" tippte, landete
 * mitten im Nachfuellschritt, ohne dessen Anweisung gesehen zu haben.
 *
 * Gesucht wird der naechste Vorfahr, der WIRKLICH scrollt, statt die Klasse zu
 * kennen: die Insel weiss nicht, in welchem Rahmen sie steht, und der Rahmen
 * darf seinen Scroller umbauen. Ohne Treffer (jsdom rechnet kein CSS) bleibt
 * das Dokument selbst — `scrollTop` statt `window.scrollTo`, das jsdom nicht
 * kennt.
 */
function nachOben(von: HTMLElement | null) {
  for (let el = von?.parentElement; el; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY;
    if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight) {
      el.scrollTop = 0;
      return;
    }
  }
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
}

/** Die fünf Geräteknöpfe teilen das 56x56px-Tippziel aus `.chipKnopf` (DRK-399). */
export function CheckFlow({
  fahrzeug,
  art,
  soll: sollAlle,
  stichprobe,
  versiegelt,
  plomben,
  geraete,
  flaschen,
  verfall,
  warn,
  andereEinheitErreichbar,
  kontoZugang,
  letzterCheckText,
  entnahmebox,
  demo = false,
}: {
  /**
   * ⚠️ `einheitenart` GEHOERT HIER HER UND NICHT NUR IN DIE VERWALTUNG
   * (DRK-309). Diese Strecke ist die Flaeche, auf der jemand den Gegenstand in
   * der Hand haelt — eine Sanitaetstasche, die zum „Fahrzeug waehlen" auffordert
   * und „aufs Fahrzeug legen" sagt, ist genau die Einheit, die das Ticket
   * sichtbar machen wollte. `null` heisst „noch nicht zugeordnet" und faellt auf
   * das neutrale Wort zurueck, nie auf „Fahrzeug".
   */
  fahrzeug: {
    id: string; name: string; kennung: string | null;
    einheitenart: Einheitenart | null;
  };
  /** IDA-222: Kurzcheck (Stichprobe + Plomben ablesen) oder Vollcheck. */
  art: "kurz" | "voll";
  /** Die GANZE Bestueckung. Was davon gezaehlt wird, entscheidet `art`. */
  soll: CheckPos[];
  /**
   * IDA-222: im Kurzcheck die gezogenen Positionen mit ihrem Grund als Satz;
   * im Vollcheck `null`.
   */
  stichprobe: Record<string, string> | null;
  /** IDA-222: je stehender Plombe die Positionen, die sie bezeugt. */
  versiegelt: Record<string, string[]>;
  plomben: CheckPlombe[];
  geraete: CheckGeraet[];
  flaschen: CheckFlasche[];
  /** Beim letzten Check gemeldeter Verfall je artikelId („YYYY-MM"), leer = keine Angabe. */
  verfall: Record<string, string>;
  warn: VerfallSchwellen;
  /**
   * DIE HERKUNFT DES ZUGANGS — DRK-305: `true` heisst „angemeldetes Konto, kein
   * Kaertchen".
   *
   * Sie steuert GENAU EINE Sache: was passiert, wenn der Zugang MITTEN IM CHECK
   * ausfaellt. Der Server kann das nicht entscheiden — faellt der Konto-Zweig
   * aus, sieht er nur noch „kein Kaertchen, kein Konto" und gibt den
   * Kaertchen-Grund `sitzung` zurueck (`_lib/helferZugang.ts`). Die Seite
   * dagegen KENNT die Herkunft, weil sie mit ihr gerendert hat.
   *
   * ⚠️ OHNE SIE IST DER AUSFALL EINE SACKGASSE, und eine teure: `darfErneuern`
   * oeffnete das Code-Feld, die angemeldete Person hat aber kein Kaertchen
   * einzugeben — und zum Anmelden muesste sie diese Seite verlassen, wo der
   * gesamte Zaehlstand in sechs `useState` liegt. Gefunden hat das die
   * Codex-Review zu PR #164.
   *
   * PFLICHT-PROP, KEIN OPTIONAL — dieselbe Begruendung wie bei
   * `andereEinheitErreichbar` darunter: ein vergessenes `kontoZugang?` waere
   * still `undefined` und damit „Kaertchen", also genau der Defekt.
   */
  kontoZugang: boolean;
  /**
   * FUEHRT „ANDERE EINHEIT" UEBERHAUPT WOANDERSHIN? — DRK-376.
   *
   * Die beiden Auswege dieses Flows — der Rueckweg im Leerzustand und der Knopf
   * auf dem Abschlussschirm — zeigen auf `/helfer/check`, also auf DIESELBE
   * Seite, die ihre Einheit als `gebunden ?? (?fz= …) ?? (genau eine aktive)`
   * waehlt. Sie sind genau dann wirkungslos, wenn diese Kette wieder dieselbe
   * Einheit liefert, und dafuer gibt es ZWEI Gruende:
   *
   *   `gebunden`         — das Kaertchen zeigt auf DIESE Einheit und gewinnt
   *                        gegen jedes `?fz=` (DRK-302).
   *   genau EINE aktive  — die Wahl wird uebersprungen.
   *
   * Bis DRK-376 kannte der Flow nur den ersten (als Prop `gebunden`). Beim
   * zweiten lud der Link denselben Schirm, und zwar ohne dass etwas kaputt
   * aussieht: er funktioniert, die Seite laedt, sie zeigt dasselbe — wer
   * davorsteht, haelt den eigenen Klick fuer danebengegangen und klickt noch
   * einmal. Getroffen hat es genau die Bereitschaften mit einer einzigen
   * aktiven Einheit, also die, denen am wenigsten auffaellt, dass eine Wahl
   * fehlt.
   *
   * ⚠️ DIE ENTSCHEIDUNG GEHOERT DER SEITE, NICHT DIESER INSEL. Nur sie kennt
   * die Bindung der Sitzung und die Zahl der aktiven Einheiten; die Insel
   * bekaeme beides nur, wenn man ihr mehr in den Payload legt, als sie zeigt.
   * Dieselbe Aufteilung und DERSELBE NAME wie bei `BoxAbgabe` — zwei Woerter
   * fuer dieselbe Frage liefen beim naechsten Griff auseinander.
   *
   * ⚠️ NICHT DIE BINDUNG LOCKERN. Sie ist eine Anzeige-Entscheidung, kein
   * Riegel, aber sie im Vorbeigehen zu umgehen hiesse, die offene
   * Betreiberfrage 5 zu beantworten. Geaendert ist der WEG, nicht die Wahl.
   *
   * PFLICHT-PROP, KEIN OPTIONAL. Ein `andereEinheitErreichbar?: boolean` waere
   * in jeder vergessenen Aufrufstelle still `undefined` und damit „nicht
   * erreichbar" — der Weg in die Wahl verschwaende auf JEDEM Schirm, auch dort,
   * wo er gebraucht wird. Die Seite ist heute der einzige Aufrufer; ein zweiter
   * muesste die Frage ausdruecklich beantworten.
   *
   * ⚠️ DER WERT FRIERT BEI DER INLINE-ERNEUERUNG EIN, UND DAS BLEIBT SO.
   * `erneuereSitzung` (§7.4.4) tauscht das Cookie OHNE Seitenaufbau; wer mit
   * einem Kaertchen eines anderen Fahrzeugs erneuert, sieht die zwei Auswege
   * danach weiter nach dem ALTEN Kaertchen. Drei Gruende, warum hier trotzdem
   * nichts nachgezogen wird:
   *
   * 1. EINE NEUAUFLOESUNG VOR DEM ABSENDEN WAERE DER SCHADEN, NICHT DIE
   *    HEILUNG. Sie hiesse Seitenaufbau, und der verwirft die eingetragenen
   *    Mengen — genau der Datenverlust, gegen den das Inline-Feld ueberhaupt
   *    gebaut ist (§7.4.4, `docs/design/README.md`: Fehler aus Server-Actions
   *    kommen AM FELD an, nicht als Redirect). Zwanzig Minuten Zaehlarbeit
   *    stehen an dieser Stelle auf dem Spiel.
   * 2. `fahrzeug.id` FRIERT MIT EIN, und das ist RICHTIG: gezaehlt wurde
   *    DIESES Fahrzeug, also gehoeren die Mengen dorthin. Ein Ziel, das unter
   *    der Helferin wechselt, waere die Fehlbuchung.
   * 3. KEINE SACKGASSE. Das Prop steuert allein, WOHIN der eine Ausweg fuehrt
   *    — die Tab-Leiste des `HelferRahmen` liegt in JEDER Lage darunter
   *    (der Flow ist ihr Kind, `helfer/check/page.tsx`), und ihr
   *    „Fahrzeug-Check" fuehrt auf `/helfer/check`, wo die Bindung frisch
   *    aufgeloest wird.
   *
   * WAS BLEIBT, ist die Frage, ob ein an Fahrzeug B haengendes Kaertchen einen
   * Check auf A bezeugen darf. Das ist die BERECHTIGUNGSFRAGE, nicht die
   * Anzeigefrage — offene Betreiberfrage 5, Ansatzpunkt 2 in
   * `_actions/check.ts`, und sie gilt dort unveraendert AUCH OHNE Erneuerung.
   */
  andereEinheitErreichbar: boolean;
  /**
   * DER LETZTE ABGESCHLOSSENE CHECK DIESES FAHRZEUGS — DRK-306, als FERTIGER
   * TEXT; `null` heisst „noch nie abgeschlossen geprueft".
   *
   * ⚠️ TEXT UND KEIN `Date`, und das ist keine Bequemlichkeit: ein `Date` reist
   * klaglos ueber die RSC-Grenze und wuerde hier in der Zone des GERAETS
   * formatiert. Die Seite formatiert deshalb zonenexplizit vor
   * (`helfer/check/page.tsx`, `fmtDatumZeit`) — dieselbe Zusage, die
   * `verwaltung/fahrzeuge` woertlich traegt.
   *
   * PFLICHT-PROP, KEIN OPTIONAL — aus demselben Grund wie
   * `andereEinheitErreichbar` darueber. Ein `letzterCheckText?: string | null`
   * waere in jeder vergessenen Aufrufstelle still `undefined` und damit vom
   * „noch nie geprueft"-Fall NICHT
   * zu unterscheiden: ein gestern geprueftes Fahrzeug bekaeme die Zeile „Noch
   * kein Check erfasst" und saehe aus wie ein vergessenes. Ein fehlender Wert
   * soll LAUT sein, nicht falsch.
   *
   * ⚠️ ER WIRD AUF DEM FERTIG-SCHIRM NICHT GEZEIGT. Nach dem Abschluss ist der
   * letzte Check DIESER hier; die vorgeladene Zahl waere dort die
   * VORLETZTE — ein Wert, der stimmt und trotzdem das Falsche behauptet.
   */
  letzterCheckText: string | null;
  /**
   * IDA-247: die Kiste in der Halle, wenn sie aufnimmt — sonst `null`. Mit Box
   * schlaegt der Nachfuellschritt den Ueberschuss ueber „OK bis" zum
   * Hineinlegen vor; ohne nennt er ihn nur.
   *
   * PFLICHT-PROP, KEIN OPTIONAL — dieselbe Begruendung wie bei
   * `andereEinheitErreichbar`: ein vergessenes `entnahmebox?` waere still
   * „keine Box", und der Vorschlag verschwaende ohne Spur.
   */
  entnahmebox: { name: string } | null;
  /**
   * IDA-224 (voruebergehend, Rueckbau IDA-225): der Demo-Check unter `/demo`.
   * Abschluss ueber den Route Handler, der nichts schreibt; „Nochmal" fuehrt
   * zurueck in die Demo. Kopf: `_lib/demoCheck.ts`.
   */
  demo?: boolean;
}) {
  // DIE SECHS CLIENT-ZUSTAENDE (1:1, `:62-71`). Sie bleiben bei JEDEM Fehler
  // stehen — das ist die tragende Zusage von §7.4.4 und §7.10.3.
  /*
   * IDA-222 — DIE PLOMBEN UND WAS SIE AN DIE ZAEHLLISTE GEBEN.
   *
   * Im Kurzcheck steht der Plombenschritt VORN: eine offene Plombe gibt ihr
   * ganzes Fach in die Zaehlliste, und das muss feststehen, bevor gezaehlt
   * wird. Im Vollcheck steht er HINTEN: gesetzt wird, wenn alles drin ist.
   */
  const ablesen = art === "kurz" ? plomben.filter((p) => p.erwartet !== null) : [];
  const nieGesetzt = art === "kurz" ? plomben.filter((p) => p.erwartet === null) : [];
  const [plombenWert, setPlombenWert] = useState<Record<string, string>>({});
  const [plombeFehlt, setPlombeFehlt] = useState<Record<string, boolean>>({});
  const plombeEingabe = (id: string) => (plombenWert[id] ?? "").trim();
  const plombeErfasst = (p: CheckPlombe) => !!plombeFehlt[p.id] || plombeEingabe(p.id) !== "";
  const plombeOffen = (p: CheckPlombe) =>
    !!plombeFehlt[p.id]
    || (plombeEingabe(p.id) !== "" && plombenNummerNorm(plombeEingabe(p.id)) !== p.erwartet);

  /*
   * DIE ZAEHLLISTE. Im Vollcheck die ganze Bestueckung. Im Kurzcheck die
   * Stichprobe plus jedes Fach einer offenen Plombe — und dann JEDE Position
   * jedes betroffenen Artikels: der Abschluss gleicht den Bestand je Artikel
   * ab, eine Teilsumme buchte das ungezaehlte Fach auf null (der Server weist
   * eine solche Nutzlast ab).
   */
  const soll = (() => {
    if (art === "voll") return sollAlle;
    const ids = new Set(Object.keys(stichprobe ?? {}));
    for (const p of ablesen) {
      if (plombeOffen(p)) for (const id of versiegelt[p.id] ?? []) ids.add(id);
    }
    const artikelIds = new Set(sollAlle.filter((p) => ids.has(p.id)).map((p) => p.artikelId));
    return sollAlle.filter((p) => artikelIds.has(p.artikelId));
  })();
  const grundFuer = (p: CheckPos): string | null => {
    if (art === "voll") return null;
    const g = stichprobe?.[p.id];
    if (g) return g;
    const pl = ablesen.find((x) => (versiegelt[x.id] ?? []).includes(p.id) && plombeOffen(x));
    if (pl) return `Plombe offen: ${pl.bezeichnung}`;
    return "Gleicher Artikel wie eine gezogene Position";
  };

  const [phase, setPhase] = useState<Phase>(ablesen.length > 0 ? "plomben" : "zaehlen");
  const [ist, setIst] = useState<Record<string, number>>({});
  const [nachfuell, setNachfuell] = useState<Record<string, number>>({});
  // IDA-247: was je Position in die Entnahmebox wandert.
  const [box, setBox] = useState<Record<string, number>>({});
  const [geraeteState, setGeraeteState] = useState<Record<string, CheckGeraetAntwort>>({});
  const [druck, setDruck] = useState<Record<string, number>>({});
  const [verfallState, setVerfallState] = useState<Record<string, string>>({});

  const [ergebnis, setErgebnis] = useState<CheckAbschlussWert | null>(null);
  const [fehler, setFehler] = useState<{ text: string; grund: HelferGrund } | null>(null);
  const [erneuerungsCode, setErneuerungsCode] = useState("");
  const [erneuerungsFehler, setErneuerungsFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();

  /*
   * REINE ANZEIGE, KEIN SIEBTER ZAEHLZUSTAND (IDA-233): welches Verfallsfeld
   * aufgeklappt ist. Es geht in keine Nutzlast; ein zugeklapptes Feld mit
   * Angabe zeigt sie im Knopf weiter an.
   */
  const [verfallAuf, setVerfallAuf] = useState<Record<string, boolean>>({});
  const verfallFokus = useRef<string | null>(null);
  /** Die Zahlenfelder der Zaehlliste je Position — Ziel von „Nächste offene" und Enter. */
  const zaehlFelder = useRef(new Map<string, HTMLInputElement>());
  const weiterKnopf = useRef<HTMLButtonElement>(null);
  const kopf = useRef<HTMLDivElement>(null);

  const faecher = [...new Set(soll.map((p) => p.fachLabel))];

  /*
   * DEFAULT = 0, NICHT MEHR SOLL — DRK-304.
   *
   * Bis hierher galt „voll annehmen, Gezaehltes runterkorrigieren" (`:97`).
   * Diese Vorbelegung WAR die Aktion „Alles auf Soll", die das Ticket
   * entfernt: wer den Schritt durchklickte, bezeugte einen vollen Wagen, ohne
   * ein Fach gesehen zu haben — und serverseitig ist „gezaehlt und stimmt" von
   * „nicht gezaehlt" nicht unterscheidbar (`_lib/checkNutzlast.ts`, Kopf).
   *
   * ⚠️ DIE UMKEHR IST NICHT FOLGENLOS, UND DESHALB STEHT `gezaehlt` DANEBEN.
   * `check.ts` rechnet aus der Summe der gezaehlten Ist JE ARTIKEL eine
   * Korrekturbuchung auf den Fahrzeugbestand — in ein Journal ohne UPDATE und
   * ohne DELETE. Eine 0, die niemand gezaehlt hat, waere damit eine
   * unwiderrufliche Leerbuchung; das Ticket verbietet sie ausdruecklich
   * („keine automatische Deutung von 0 als bestaetigter Leerbestand"). Der
   * Riegel im Zaehlschritt ist die Antwort darauf — NICHT eine zweite
   * Vorbelegung.
   *
   * Der RECORDED Fahrzeugbestand ist weiterhin kein Per-Position-Default: er
   * ist pro ARTIKEL, nicht pro Fach, und derselbe Artikel in mehreren Faechern
   * wuerde sich vervielfachen (`:94-96`, §5.7.1).
   */
  const istWert = (p: CheckPos) => ist[p.id] ?? 0;

  /**
   * Hat jemand diese Position ANGEFASST? `undefined` heisst „noch nicht
   * gezaehlt" und ist von einer gezaehlten 0 zu unterscheiden — genau darauf
   * steht und faellt DRK-304.
   *
   * ⚠️ DER AUSGANG FUER EIN WIRKLICH LEERES FACH IST DAS „−" — ODER SEIT
   * IDA-233 EINE GETIPPTE „0". `Stepper.tsx` ruft `setWert` auch dann, wenn der
   * Wert bei `min` schon steht; der Klick schreibt also die 0 in `ist` und macht
   * sie zur Aussage. Ohne diese Eigenschaft gaebe es aus dem Riegel keinen Weg,
   * und sie darf beim naechsten Umbau des Steppers nicht stillschweigend
   * verloren gehen. Ein blosser Tipp INS Feld schreibt dagegen nichts (`leer`).
   */
  const gezaehlt = (p: CheckPos) => ist[p.id] !== undefined;
  const nfWert = (p: CheckPos) => nachfuell[p.id] ?? 0;
  const boxWert = (p: CheckPos) => box[p.id] ?? 0;
  const zuViel = (p: CheckPos) => ueberschuss(istWert(p), p.soll, p.sollMax);

  // Verfall haengt am ARTIKEL, nicht am Fach. Vorbelegt ist der beim letzten
  // Check gemeldete Wert; leeren heisst „keine Angabe" (`:100-109`).
  const verfallWert = (artikelId: string) => verfallState[artikelId] ?? verfall[artikelId] ?? "";

  // Anzeigereihenfolge Fach fuer Fach → je Artikel bekommt nur die ERSTE Zeile
  // das Eingabefeld. Zwei Felder fuer eine Angabe waeren nicht
  // auseinanderzuhalten (`:105-109`).
  const zaehlFolge = faecher.flatMap((f) => soll.filter((p) => p.fachLabel === f));
  const ersteZeile = new Map<string, string>();
  for (const p of zaehlFolge) if (!ersteZeile.has(p.artikelId)) ersteZeile.set(p.artikelId, p.id);

  const verfallChip = (wert: string) => {
    if (!wert) return null;
    const st = verfallStatus(wert, warn, new Date());
    return { ton: ampelTon(st.ampel), text: chargeText(st, wert) };
  };

  const hatArtikel = soll.length > 0;
  const schrittFolge: Phase[] = [
    ...(ablesen.length > 0 ? (["plomben"] as const) : []),
    ...(hatArtikel ? (["zaehlen", "nachfuellen"] as const) : []),
    ...(geraete.length > 0 ? (["geraete"] as const) : []),
    ...(flaschen.length > 0 ? (["sauerstoff"] as const) : []),
    ...(art === "voll" && plomben.length > 0 ? (["plomben"] as const) : []),
  ];
  const aktivePhase: Phase = schrittFolge.includes(phase) ? phase : (schrittFolge[0] ?? "zaehlen");
  const idx = schrittFolge.indexOf(aktivePhase);
  const istLetzter = idx === schrittFolge.length - 1;
  const naechste = schrittFolge[idx + 1];

  // Jeder Wechsel — Schritt vor, Schritt zurueck, Fertig-Schirm — beginnt oben
  // (`nachOben`). Nicht beim ersten Aufbau: da steht die Seite ohnehin oben,
  // und ein ScanHinweis darueber (`helfer/check/page.tsx`) bliebe im Bild.
  const ansicht = ergebnis ? "fertig" : aktivePhase;
  const ersteAnsicht = useRef(ansicht);
  useEffect(() => {
    if (ersteAnsicht.current === ansicht) return;
    ersteAnsicht.current = "";
    nachOben(kopf.current);
  }, [ansicht]);

  const geraetE = (id: string): CheckGeraetAntwort => geraeteState[id] ?? GERAET_VORBELEGUNG;
  const setGeraet = (id: string, patch: Partial<CheckGeraetAntwort>) =>
    setGeraeteState((v) => ({ ...v, [id]: { ...(v[id] ?? GERAET_VORBELEGUNG), ...patch } }));

  // Druck-Default = Nennfuelldruck („voll annehmen, Abgelesenes runterstellen", `:136-137`).
  //
  // ⚠️ NICHT `letzterDruck`: der letzte Messwert wird ANGEZEIGT, aber er ist
  // keine Vorbelegung. Sonst schriebe ein durchgeklickter Check den vorigen
  // Wert fort, ohne dass jemand aufs Manometer gesehen haette.
  const druckWert = (f: CheckFlasche) => druck[f.id] ?? f.nennfuelldruckBar;

  const zaehlung = (): CheckZaehlung => ({
    ist: Object.fromEntries(soll.map((p) => [p.id, istWert(p)])),
    nachfuell: Object.fromEntries(soll.map((p) => [p.id, nfWert(p)])),
    box: Object.fromEntries(soll.map((p) => [p.id, boxWert(p)])),
    geraete: Object.fromEntries(geraete.map((g) => [g.id, geraetE(g.id)])),
    druck: Object.fromEntries(flaschen.map((f) => [f.id, druckWert(f)])),
    // NUR die GEAENDERTEN — ein fehlender Eintrag laesst die Angabe
    // unangetastet (`:152-155`).
    verfaelle: Object.fromEntries(
      Object.entries(verfallState)
        .filter(([artikelId, wert]) => wert !== (verfall[artikelId] ?? ""))
        .map(([artikelId, wert]) => [artikelId, wert || null]),
    ),
  });

  function abschliessen() {
    setFehler(null);
    start(async () => {
      try {
        const nutzlast = checkNutzlast({
          fahrzeugId: fahrzeug.id,
          positionen: soll.map((p) => ({ id: p.id, artikelId: p.artikelId, soll: p.soll })),
          geraete: geraete.map((g) => ({ id: g.id })),
          flaschen: flaschen.map((f) => ({ id: f.id, nennfuelldruckBar: f.nennfuelldruckBar })),
          z: zaehlung(),
        });
        const r = await (demo ? demoAbschluss : checkAbschluss)({
          ...nutzlast,
          art,
          // Kurzcheck: jede stehende Plombe, abgelesen oder als fehlend
          // gemeldet. Vollcheck: nur die neu gesetzten.
          plomben: art === "kurz"
            ? ablesen.map((p) => ({ plombeId: p.id, nummer: plombeFehlt[p.id] ? null : plombeEingabe(p.id) }))
            : plomben
                .filter((p) => plombeEingabe(p.id) !== "")
                .map((p) => ({ plombeId: p.id, nummer: plombeEingabe(p.id) })),
        });
        if (!r.ok) {
          // Der Server hat den Text; die Insel formuliert ihn NICHT neu (§7.3).
          // Das gilt auch fuer den fuenften Grund `"eingabe"`
          // (Betreiberentscheidung B4): er traegt seine Botschaft im `text`,
          // und weil `darfErneuern("eingabe")` false ist, erscheint das
          // Erneuerungsfeld nicht — eine unvollstaendige Nutzlast wird nicht
          // dadurch vollstaendig, dass jemand die Sitzung erneuert.
          //
          // ⚠️ HIER WIRD KEIN ZUSTAND ZURUECKGESETZT. Alle sechs bleiben stehen.
          setFehler({ text: r.text, grund: r.grund });
          return;
        }
        setErgebnis(r.wert);
      } catch {
        // FALLE 62/66: `CheckFlow.tsx:158-159` faengt zwar, zeigt aber
        // `e.message` — in Produktion der ENGLISCHE Server-Components-Satz mit
        // `digest`, der niemanden erreicht. `"netz"` entsteht ausschliesslich
        // HIER, nie serverseitig (Global Constraint 12).
        // ALLE SECHS ZUSTAENDE BLEIBEN STEHEN.
        setFehler({ text: NETZ_TEXT_CHECK, grund: "netz" });
      }
    });
  }

  function erneuern() {
    setErneuerungsFehler(null);
    start(async () => {
      try {
        const r = await erneuereSitzung(erneuerungsCode);
        if (!r.ok) {
          setErneuerungsFehler(r.text);
          return;
        }
        // Danach tippt die Helferin erneut auf „Abschliessen" (§7.4.4).
        setFehler(null);
        setErneuerungsCode("");
      } catch {
        setErneuerungsFehler(NETZ_TEXT_CHECK);
      }
    });
  }

  /*
   * ⚠️ DIE KOPFZEILE NENNT DIE ART — AUF JEDEM SCHIRM (DRK-309,
   * Reviewrunde 11).
   *
   * Bis hierher stand die Art nur dort, wo ein Satz sie ohnehin brauchte
   * („Wie viel liegt wirklich in der Tasche") und in der Wahl davor. Das
   * reicht fuer den Regelfall und genau fuer den nicht, den dieser Befund
   * nennt: ein kaertchengebundenes Ziel mit bereits erfasstem Check, das NUR
   * Geraete oder NUR Sauerstoff traegt. Dann faellt die Wahl weg, die
   * Zaehlstrecke mit ihren art-bewussten Saetzen ebenso — und auf dem ganzen
   * Schirm steht ein blosser Name, der bei einer Tasche nichts ueber sie sagt.
   *
   * ⚠️ DIESELBE FORM WIE IN DER WAHL EINEN SCHIRM VORHER (`FahrzeugWahl`,
   * `einheitMeta`): „Name · Art · Kennung". Wer dort „Rucksack Betreuung ·
   * Tasche" angetippt hat, liest hier dieselbe Zeile wieder — eine zweite
   * Schreibweise waere an dieser Stelle ein eigener kleiner Zweifel.
   */
  /*
   * DIE UEBERSCHRIFT TRAEGT SEIT DRK-373 EIN `data-rolle="check-einheit"` — an
   * ALLEN SECHS Stellen, an denen sie steht.
   *
   * ⚠️ DER GRUND IST NICHT KOSMETIK: seit DRK-373 steht der Name der
   * GEBUNDENEN Einheit auf diesem Schirm zweimal — hier und im Hinweis
   * „dein Scan gilt hier nicht" (`_ui/ScanHinweis.tsx`). Ein e2e-Greifer ueber
   * den blossen Text traf damit zwei Elemente und riss an Playwrights
   * Strict-Mode; er liess sich mit `.first()` beruhigen, und DANN haette er
   * gruen behauptet „der Check laeuft auf meiner Einheit", waehrend er in
   * Wahrheit den HINWEIS gelesen hat — also genau die Verwechslung, gegen die
   * DRK-373 geschrieben ist, nur im Test.
   *
   * ⚠️ AN ALLEN SECHS, NICHT NUR AN DER ERSTEN. Welche Phase die erste ist,
   * haengt an der Bestueckung (`schrittFolge`), und die beiden Endschirme
   * tragen ihre eigene. Ein Greifer, der nur im Zaehlschritt traegt, ist in
   * einer Einheit ohne Soll-Artikel still weg — dieselbe Begruendung, aus der
   * `letzterCheckZeile` an JEDEM Schritt steht.
   */
  const kopfEinheit = `${fahrzeug.name} · ${einheitMeta(fahrzeug)}`;

  // ——— Fahrzeug ohne Soll, Geraet und Flasche ———
  if (schrittFolge.length === 0) {
    return (
      <>
        <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit}</div>
        <LeerZustand
          titel="Nichts zu prüfen"
          text={
            `Für ${dieseEinheit(fahrzeug.einheitenart)} ist weder ein Soll noch ein Gerät noch eine Sauerstoffflasche ` +
            "hinterlegt. Die Verwaltung pflegt die Bestückung."
          }
          /*
           * DER RUECKWEG WIRD GETAUSCHT, NICHT VERSTECKT (DRK-302, DRK-376).
           * Fuehrt die Wahl auf DIESELBE Einheit zurueck, waere „Andere
           * Einheit" ein Knopf, der nichts tut — und er ist hier die einzige
           * Handlung des Schirms neben der Reiterleiste. `weg` ist Pflicht-Prop
           * (§11.7), ein Weglassen ist also ohnehin keine Option; die Entnahme
           * ist der Ort, an dem es fuer diese Sitzung wirklich weitergeht.
           */
          weg={andereEinheitErreichbar
            ? { href: "/helfer/check", text: "Andere Einheit" }
            : { href: "/helfer", text: "Zur Entnahme" }}
        />
      </>
    );
  }

  // ——— Fertig ———
  if (ergebnis) {
    const alles =
      ergebnis.offen === 0 &&
      ergebnis.geraeteAuffaellig === 0 &&
      ergebnis.flaschenAuffaellig === 0 &&
      ergebnis.verfallAuffaellig === 0 &&
      ergebnis.flaschenNichtBewertbar === 0 &&
      ergebnis.plombenOffen === 0;
    const einraeumen = faecher
      .map((fach) => ({ fach, positionen: soll.filter((p) => p.fachLabel === fach && nfWert(p) > 0) }))
      .filter((g) => g.positionen.length > 0);
    return (
      <>
        <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit} · Fertig</div>
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="check-ergebnis">
          <div className={s.zeileName}>{art === "kurz" ? "Kurzcheck" : "Vollcheck"} abgeschlossen</div>
          <div className={s.zeileMeta}>
            {/* Ohne Soll-Bestueckung gab es nichts nachzufuellen — ein Chip
                „0 aus Handlager geholt" waere eine Aussage ueber Arbeit, die
                nie stattgefunden hat. */}
            {hatArtikel && (
              <HelferChip ton="ok">{ergebnis.nachgefuellt} aus Handlager geholt</HelferChip>
            )}
            {ergebnis.inBox > 0 && (
              <HelferChip ton="ok">{ergebnis.inBox} in die Entnahmebox gelegt</HelferChip>
            )}
            {ergebnis.offen > 0 && (
              <HelferChip ton="rot">{ergebnis.offen} fehlt weiterhin</HelferChip>
            )}
            {ergebnis.geraeteAuffaellig > 0 && (
              <HelferChip ton="rot">{ergebnis.geraeteAuffaellig} Gerät(e) auffällig</HelferChip>
            )}
            {ergebnis.flaschenAuffaellig > 0 && (
              <HelferChip ton="rot">{ergebnis.flaschenAuffaellig} Flasche(n) wechseln</HelferChip>
            )}
            {ergebnis.flaschenNichtBewertbar > 0 && (
              <HelferChip ton="grau">
                {ergebnis.flaschenNichtBewertbar} Flasche(n) nicht bewertbar
              </HelferChip>
            )}
            {ergebnis.verfallAuffaellig > 0 && (
              <HelferChip ton="gelb">{ergebnis.verfallAuffaellig} laufen ab</HelferChip>
            )}
            {ergebnis.plombenOffen > 0 && (
              <HelferChip ton="gelb">{ergebnis.plombenOffen} Plombe(n) offen</HelferChip>
            )}
            {ergebnis.plombenGesetzt > 0 && (
              <HelferChip ton="ok">{ergebnis.plombenGesetzt} Plombe(n) gesetzt</HelferChip>
            )}
            {alles && <HelferChip ton="ok">Alles in Ordnung</HelferChip>}
          </div>

          {/*
            NEU (§7.9.4): `umlagerung` kappt STILL an der Verfuegbarkeit, und der
            Helfer hat die Teile IN DER HAND. Ohne diesen Satz legt er sie ins
            Fahrzeug und das Journal weiss es nicht.
          */}
          {ergebnis.nachgefuellt < ergebnis.nachfuellBestaetigt && (
            <p className={s.fussnote}>
              Von {ergebnis.nachfuellBestaetigt} bestätigten Teilen konnten nur{" "}
              {ergebnis.nachgefuellt} gebucht werden. Das Handlager war zwischenzeitlich leer —
              bitte der Verwaltung melden.
            </p>
          )}
          {ergebnis.offen > 0 && (
            <p className={s.fussnote}>
              Das Handlager hatte nicht genug. {ergebnis.offen} Teile fehlen weiterhin{" "}
              {inDerEinheit(fahrzeug.einheitenart)} – bitte der Verwaltung melden.
            </p>
          )}
          {ergebnis.geraeteAuffaellig > 0 && (
            <p className={s.fussnote}>Fehlende oder defekte Geräte bitte der Verwaltung melden.</p>
          )}
          {ergebnis.flaschenAuffaellig > 0 && (
            <p className={s.fussnote}>
              Flaschen mit erreichtem Wechselwert bitte tauschen oder der Verwaltung melden.
            </p>
          )}
          {ergebnis.flaschenNichtBewertbar > 0 && (
            <p className={s.fussnote}>
              Für diese Flaschen ist kein Nennfülldruck hinterlegt – der Füllstand lässt sich nicht
              bewerten. Der abgelesene Druck wurde trotzdem gespeichert.
            </p>
          )}
          {ergebnis.plombenOffen > 0 && (
            <p className={s.fussnote}>
              Offene Plomben gelten ab jetzt nicht mehr. Ihr Inhalt wurde heute gezählt; neu
              gesetzt werden sie beim nächsten Vollcheck.
            </p>
          )}
          {ergebnis.verfallAuffaellig > 0 && (
            <p className={s.fussnote}>
              {ergebnis.verfallAuffaellig} Artikel {inDerEinheit(fahrzeug.einheitenart)} laufen
              bald ab oder sind abgelaufen – bitte tauschen oder der Verwaltung melden.
            </p>
          )}

          {/*
            DER AUFFUELLHINWEIS NACH DEM DIENST — DRK-301.

            Er steht am ABSCHLUSS, nicht dauerhaft auf jedem Schritt: er
            beschreibt eine Handlung NACH dem Check, und auf einem Schritt
            konkurrierte er mit dessen eigener Anweisung (die Fussnoten dort
            sind ohnehin dicht). Auf dem Fertig-Schirm ist er bei „Alles in
            Ordnung" der einzige Satz und faellt genau dann auf, wenn nichts
            anderes zu tun bleibt.

            ⚠️ ER IST TEXT, KEIN WEG. Kein Link, kein Knopf: gemeint ist der
            PHYSISCHE QR-Code am Handlager, und AK3 verlangt ausdruecklich, dass
            der Hinweis allein keine Bestandsbuchung ausloest. Ein Link auf
            `/helfer` waere zudem eine zweite, leisere Antwort auf dieselbe
            Frage — und die faende niemand wieder, wenn DRK-312 das
            Handlager-Etikett neu zuschneidet.

            ⚠️ ER WIDERSPRICHT DEM NACHFUELLSCHRITT NICHT. Der bucht Handlager →
            Fahrzeug INNERHALB dieses Checks; gemeint ist hier das Auffuellen
            NACH dem Dienst, ausserhalb des Checks — der Weg, ohne den der
            Handlagerbestand still auseinanderlaeuft.

            ⚠️ NUR MIT SOLL-BESTUECKUNG, aus demselben Grund wie der Chip oben:
            traegt das Fahrzeug nur Geraete und Flaschen, gibt es nichts
            aufzufuellen, und der Satz spraeche von Arbeit, die es nicht gibt.
          */}
          {demo && (
            <p className={s.fussnote} data-rolle="demo-ergebnis">
              <b>Das war eine Demo:</b> Es wurde nichts gespeichert.
            </p>
          )}
          {hatArtikel && (
            <p className={s.fussnote} data-rolle="auffuell-hinweis">
              {/*
                ⚠️ `inDerEinheit`, NICHT `dieseEinheit` (Reviewrunde 8): „in"
                mit einer ORTSANGABE verlangt den Dativ. `dieseEinheit` liefert
                den Nominativ, und „Was in dieses Fahrzeug fehlt" ist falsches
                Deutsch — der Baustein war da, ich hatte den falschen gegriffen.
                Genau der Fehler, vor dem der Kopf von `konstanten.ts` warnt.
              */}
              <b>Nach dem Dienst auffüllen:</b> Was {inDerEinheit(fahrzeug.einheitenart)} fehlt, holst du aus dem
              Handlager – scanne dafür den QR-Code am Handlager, damit die Entnahme dort gebucht
              wird.
            </p>
          )}
        </div>

        {/*
          WOHIN DIE GEHOLTEN TEILE GEHOEREN (IDA-226). Eingeraeumt wird oft
          erst nach dem Bestaetigen, und dann ist der Nachfuellschritt weg.
          Gezeigt wird, was der Helfer BESTAETIGT hat — das hat er in der Hand —,
          nicht das Gebuchte; kappt der Server, sagt es die Fussnote oben.
        */}
        {einraeumen.length > 0 && (
          <>
            <div className={`${s.karte} ${s.kartePad}`}>
              <div className={s.zeileName}>Wohin die geholten Teile gehören</div>
            </div>
            <div className={s.fachraster} data-rolle="einraeum-liste">
              {einraeumen.map(({ fach, positionen }) => (
                <div key={fach} data-rolle="einraeum-fach">
                  <div className={s.fachKopf}>{fach}</div>
                  <div className={s.karte}>
                    {positionen.map((p) => (
                      <div className={s.nfZeile} key={p.id}>
                        <div className={`${s.zeileHaupt} ${s.zeileName}`}>{p.artikelName}</div>
                        <b data-rolle="einraeum-menge">
                          {nfWert(p)} {p.einheit}
                        </b>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/*
          ZWEI LINKS statt eines Zustandsresets ueber sieben Setter (`:210`,
          §7.9.1). Ein Seitenaufbau ist hier ohnehin gewollt — DIE BESTAENDE
          HABEN SICH GERADE GEAENDERT. AEUSSERE Pfade, beide.

          ⚠️ `encodeURIComponent` (Befund 31): T80 baut dieselbe URL und
          begruendet die Kodierung damit, dass ein importierter Alt-Bestand
          andere IDs tragen kann — ein rohes `?fz=a b` erzeugt eine kaputte URL.
          „Nochmal dieses Fahrzeug" fuehrt auf exakt denselben Pfad; die Gefahr
          besteht hier unveraendert.
        */}
        <Link
          className={`${s.knopf} ${s.knopfGeist}`}
          href={demo ? DEMO_PFAD : `/helfer/check?fz=${encodeURIComponent(fahrzeug.id)}`}
          data-rolle="nochmal"
        >
          Nochmal {dieseEinheit(fahrzeug.einheitenart)}
        </Link>
        {/*
          NUR, WENN ES EINE ANDERE GIBT (DRK-302, DRK-376). Gibt die Wahl
          dieselbe Einheit zurueck — gebundenes Kaertchen ODER genau eine aktive
          Einheit —, fuehrte der Knopf sichtbar nach nirgendwo.

          ⚠️ HIER WIRD VERSTECKT UND NICHT GETAUSCHT, anders als im Leerzustand
          darueber und in `BoxAbgabe`: dieser Schirm behaelt seinen Ausgang
          ohnehin. „Nochmal diese Einheit" bleibt in BEIDEN Lagen stehen — es ist
          der Weg, mit dem die Helferin nach einer Buchung frische Bestaende
          sieht —, und ein zweites „Zur Entnahme" daneben waere ein zweiter
          Ausgang statt eines Ersatzes.
        */}
        {andereEinheitErreichbar && (
          <Link className={`${s.knopf} ${s.knopfGeist}`} href="/helfer/check" data-rolle="anderes">
            Andere Einheit
          </Link>
        )}
      </>
    );
  }

  /**
   * DIE HERKUNFTSZEILE DES SCHRITTS — DRK-306, AK1.
   *
   * Sie steht auf JEDEM Schritt und nicht nur auf dem ersten: welcher Schritt
   * der erste ist, haengt an der Bestueckung (`schrittFolge`), und ein Fahrzeug
   * ohne Soll-Artikel faengt bei „Geraete" an. Eine Zeile, die nur im
   * Zaehlschritt steht, waere dort ersatzlos weg — „sichtbar" waere dann eine
   * Aussage ueber die Bestueckung statt ueber die Oberflaeche.
   *
   * Sie macht zugleich den Satz der Einleitungskarte ueberpruefbar: dort steht
   * „Das Verfallsdatum kommt aus dem letzten Check", und ohne Zeitpunkt kann
   * niemand beurteilen, ob dieser Stand von gestern oder vom Vorjahr ist.
   */
  const letzterCheckZeile = (
    <div className={s.letzterCheck} data-rolle="letzter-check">
      {/* IDA-222: die Art steht auf JEDEM Schritt, aus demselben Grund wie die Herkunftszeile. */}
      <b data-rolle="check-art">{art === "kurz" ? "Kurzcheck" : "Vollcheck"}</b>
      {" · "}
      {letzterCheckText === null
        ? `Noch kein Check erfasst — das ist der erste für ${dieseEinheit(fahrzeug.einheitenart)}.`
        : `Letzter Check: ${letzterCheckText}`}
    </div>
  );

  /** Der Fehlerbereich am Abschluss — samt Inline-Erneuerung (§7.4.4). */
  const fehlerBereich = fehler && (
    <div className={`${s.karte} ${s.kartePad}`}>
      <div className={s.gateFehler} data-rolle="check-fehler" role="status">
        {/*
          DER SATZ DES SERVERS GILT — AUSSER FUER DEN KONTO-WEG (DRK-305).
          `RIEGEL_TEXTE.sitzung` lautet woertlich „Scanne das Kaertchen erneut";
          wer angemeldet zaehlt, hat keins. Die Herkunft kennt nur diese Seite,
          also setzt sie hier den richtigen Satz ein.
        */}
        {kontoZugang && fehler.grund === "sitzung" ? ANMELDUNG_TEXT : fehler.text}
      </div>
      {kontoZugang && fehler.grund === "sitzung" && (
        /*
          NEUER TAB, und das ist die ganze Zusage: der Zaehlstand liegt im
          Client. `rel="noreferrer"` gehoert zu `target="_blank"` — ohne es
          bekaeme die Zielseite `window.opener`.
        */
        <p className={s.fussnote}>
          <a href="/verwaltung" target="_blank" rel="noreferrer" data-rolle="check-anmelden">
            Verwaltung in neuem Tab öffnen
          </a>
        </p>
      )}
      {!demo && darfKaertchenErneuern(fehler.grund, kontoZugang) && (
        <div data-rolle="erneuern">
          <p className={s.fussnote}>
            Kärtchen erneut eingeben — <b>die gezählten Mengen bleiben stehen.</b>
          </p>
          <div className={s.feldZeile}>
            <input
              className={s.codefeld}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              autoComplete="off"
              maxLength={CODEFELD_LAENGE}
              pattern={CODEFELD_MUSTER}
              placeholder={CODEFELD_PLATZHALTER}
              aria-label="Zugangs-Code"
              value={erneuerungsCode}
              onChange={(e) => setErneuerungsCode(e.target.value)}
              data-rolle="erneuern-code"
            />
            <button
              className={`${s.knopf} ${s.knopfTinte}`}
              type="button"
              disabled={laeuft}
              onClick={erneuern}
              data-rolle="erneuern-weiter"
            >
              Weiter
            </button>
          </div>
          {erneuerungsFehler && (
            <div className={s.gateFehler} data-rolle="erneuern-fehler" role="status">
              {erneuerungsFehler}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ——— Schritt: Plomben (IDA-222) ———
  if (aktivePhase === "plomben") {
    const zurueck = idx > 0 && (
      <button
        className={`${s.knopf} ${s.knopfGeist}`}
        type="button"
        onClick={() => setPhase(schrittFolge[idx - 1])}
        data-rolle="zurueck-zaehlen"
      >
        ← Zurück
      </button>
    );
    const weiterLeiste = (info: string, gesperrt: boolean) => (
      <div className={s.abschluss} data-rolle="abschlussleiste">
        <div className={s.abschlussInfo}>
          <b>{info}</b>
          <div>
            {istLetzter ? "Bestätigen schließt den Check ab" : `Weiter zu ${PHASE_LABEL[naechste]}`}
          </div>
        </div>
        {istLetzter ? (
          <button
            className={s.abschlussGo}
            type="button"
            disabled={laeuft || gesperrt}
            onClick={abschliessen}
            data-rolle="abschliessen"
          >
            Abschließen
          </button>
        ) : (
          <button
            className={s.abschlussGo}
            type="button"
            disabled={gesperrt}
            onClick={() => { setFehler(null); setPhase(naechste); }}
            data-rolle="weiter"
          >
            Weiter
          </button>
        )}
      </div>
    );

    if (art === "kurz") {
      const offen = ablesen.filter((p) => !plombeErfasst(p)).length;
      return (
        <>
          <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit} · Plomben</div>
          <Schritte folge={schrittFolge} aktiv={aktivePhase} />
          {letzterCheckZeile}
          {zurueck}
          <div className={`${s.karte} ${s.kartePad}`}>
            <div className={s.zeileName}>Steht die Plombe vom letzten Vollcheck noch?</div>
            <p className={s.fussnote}>
              Lies die Nummer an der Plombe ab. Passt sie, ist der Behälter seitdem zu geblieben und
              du musst ihn nicht öffnen. Fehlt die Plombe oder ist sie aufgebrochen, zählst du seinen
              Inhalt gleich mit.
            </p>
          </div>
          <div className={s.karte} data-rolle="plomben-liste">
            {ablesen.map((p) => {
              const eingabe = plombeEingabe(p.id);
              const fehlt = !!plombeFehlt[p.id];
              const passt = !fehlt && eingabe !== "" && !plombeOffen(p);
              const anzahl = versiegelt[p.id]?.length ?? 0;
              return (
                <div className={s.zeile} key={p.id} style={{ alignItems: "flex-start" }} data-rolle="plombe">
                  <div className={`${s.pruefKreis} ${passt ? s.pruefKreisOk : plombeOffen(p) ? s.pruefKreisFehl : ""}`} />
                  <div className={s.zeileHaupt}>
                    <div className={s.zeileName}>{p.bezeichnung}</div>
                    <div className={s.zeileMeta}>
                      {passt && <HelferChip ton="ok">passt</HelferChip>}
                      {plombeOffen(p) && <HelferChip ton="gelb">offen</HelferChip>}
                      {!plombeErfasst(p) && <HelferChip ton="grau">nicht abgelesen</HelferChip>}
                    </div>
                  </div>
                  <div className={s.verfallZeile}>
                    <input
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      aria-label={`Plombennummer ${p.bezeichnung}`}
                      placeholder="Nummer ablesen"
                      value={plombenWert[p.id] ?? ""}
                      disabled={fehlt}
                      onChange={(e) => setPlombenWert((v) => ({ ...v, [p.id]: e.target.value }))}
                      data-rolle="plombe-nummer"
                    />
                    <button
                      type="button"
                      className={`${s.knopf} ${s.knopfGeist}`}
                      aria-pressed={fehlt}
                      onClick={() => setPlombeFehlt((v) => ({ ...v, [p.id]: !fehlt }))}
                      data-rolle="plombe-fehlt"
                    >
                      {fehlt ? "Doch da" : "Fehlt"}
                    </button>
                  </div>
                  {plombeOffen(p) && (
                    <div className={s.grundZeile} data-rolle="plombe-folge">
                      {fehlt ? "Plombe fehlt" : "Andere Nummer als beim Vollcheck"} – die {anzahl}{" "}
                      {anzahl === 1 ? "Position" : "Positionen"} aus „{p.fachLabel}“ zählst du gleich mit.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {nieGesetzt.length > 0 && (
            <p className={s.fussnote} data-rolle="plomben-nie">
              Noch ohne Plombe: {nieGesetzt.map((p) => p.bezeichnung).join(", ")}. Gesetzt wird beim
              nächsten Vollcheck.
            </p>
          )}
          {fehlerBereich}
          {weiterLeiste(
            offen > 0 ? `Noch ${offen} von ${ablesen.length} abzulesen` : "Alle Plomben abgelesen",
            offen > 0,
          )}
        </>
      );
    }

    const gesetzt = plomben.filter((p) => plombeEingabe(p.id) !== "").length;
    return (
      <>
        <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit} · Plomben</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {letzterCheckZeile}
        {zurueck}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Behälter verplomben</div>
          <p className={s.fussnote}>
            Alles ist gezählt und aufgefüllt. Verschließ die Behälter mit einer neuen Plombe und trag
            ihre Nummer ein – bis zum nächsten Vollcheck reicht es dann, sie abzulesen. Leer lassen,
            wenn du keine neue Plombe gesetzt hast.
          </p>
        </div>
        <div className={s.karte} data-rolle="plomben-liste">
          {plomben.map((p) => (
            <div className={s.zeile} key={p.id} data-rolle="plombe">
              <div className={`${s.pruefKreis} ${plombeEingabe(p.id) !== "" ? s.pruefKreisOk : ""}`} />
              <div className={s.zeileHaupt}>
                <div className={s.zeileName}>{p.bezeichnung}</div>
                {p.fachLabel && (
                  <div className={s.zeileMeta}>
                    deckt <b className={s.fachInZeile}>{p.fachLabel}</b> ab
                  </div>
                )}
              </div>
              <div className={s.verfallZeile}>
                <input
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label={`Neue Plombennummer ${p.bezeichnung}`}
                  placeholder="Neue Plombennummer"
                  value={plombenWert[p.id] ?? ""}
                  onChange={(e) => setPlombenWert((v) => ({ ...v, [p.id]: e.target.value }))}
                  data-rolle="plombe-nummer"
                />
              </div>
            </div>
          ))}
        </div>
        {fehlerBereich}
        {weiterLeiste(`${gesetzt} von ${plomben.length} gesetzt`, false)}
      </>
    );
  }

  // ——— Schritt: Zaehlen ———
  if (aktivePhase === "zaehlen") {
    const ungezaehlt = soll.filter((p) => !gezaehlt(p)).length;
    const ablaufend = zaehleAblaufende(
      Object.fromEntries(soll.map((p) => [p.artikelId, verfallWert(p.artikelId) || null])),
      warn,
      new Date(),
    );

    const zurNachfuellung = () => {
      /*
       * DER RIEGEL GEHOERT DER FUNKTION, NICHT DEM KNOPF (DRK-304). Das
       * `disabled` unten sichert genau EINEN Pfad; ein zweiter — eine
       * Enter-Taste, ein Kuerzel, ein spaeterer „ueberspringen"-Weg — haette
       * ihn stillschweigend umgangen, und die Rechnung darunter arbeitet mit
       * `istWert(p)` OHNE eigene Pruefung: der greedy Vorschlag laege bei jeder
       * unberuehrten Position auf der vollen Luecke, und der Abschluss schriebe
       * eine Leerbuchung, die niemand gezaehlt hat.
       */
      if (ungezaehlt > 0) return;

      // Greedy je Artikel: die Handlager-Verfuegbarkeit ueber die Positionen
      // (Anzeige-Reihenfolge) verteilen, damit der Vorschlag nicht mehr
      // verspricht, als der Handlager hergibt (1:1, `:222-238`).
      const rest = new Map<string, number>();
      for (const p of soll) if (!rest.has(p.artikelId)) rest.set(p.artikelId, p.handlagerBestand);
      const nf: Record<string, number> = {};
      for (const p of soll) {
        const luecke = Math.max(0, p.soll - istWert(p));
        const uebrig = rest.get(p.artikelId) ?? 0;
        const nimm = Math.min(luecke, uebrig);
        nf[p.id] = nimm;
        rest.set(p.artikelId, uebrig - nimm);
      }
      setNachfuell(nf);
      // IDA-247: vorgeschlagen ist der ganze Ueberschuss ueber „OK bis" — wer
      // weniger in die Kiste legt, stellt es herunter. Ohne aufnehmende Box
      // wird nichts vorgeschlagen; der Schritt nennt den Ueberschuss dann nur.
      setBox(entnahmebox
        ? Object.fromEntries(soll.map((p) => [p.id, zuViel(p)]))
        : {});
      setFehler(null);
      setPhase("nachfuellen");
    };

    /*
     * „NAECHSTE OFFENE" — IDA-233. Bei 210 Positionen war die Frage „welche
     * fehlt noch?" nur durch Scrollen ueber die ganze Liste zu beantworten, und
     * der gesperrte Knopf am Ende sagte bloss, DASS etwas fehlt.
     *
     * Gesprungen wird in der ANZEIGEREIHENFOLGE (`zaehlFolge`, Fach fuer Fach),
     * nicht in der von `soll`: die erste offene ist die, die oben am weitesten
     * steht. Der Fokus geht ins Zahlenfeld — am Telefon oeffnet das die
     * Zifferntastatur, und die naechste Eingabe ist die Zaehlung selbst.
     * `preventScroll`, weil `scrollIntoView` die Zeile schon mittig gestellt
     * hat; der Fokus allein schoebe sie an die Kante unter den klebenden
     * Fachkopf.
     */
    const springeZu = (ziel: HTMLElement | null | undefined) => {
      if (!ziel) return;
      ziel.scrollIntoView?.({ block: "center" });
      ziel.focus({ preventScroll: true });
    };
    const ersteOffene = zaehlFolge.find((p) => !gezaehlt(p));
    const zurOffenen = () => {
      if (ersteOffene) springeZu(zaehlFelder.current.get(ersteOffene.id));
    };
    /** Enter im Feld: die naechste Zeile der Liste, nach der letzten der Abschlussknopf. */
    const nachZeile = (posId: string) => {
      const folgende = zaehlFolge[zaehlFolge.findIndex((p) => p.id === posId) + 1];
      springeZu(folgende ? zaehlFelder.current.get(folgende.id) : weiterKnopf.current);
    };
    const gezaehltAnzahl = soll.length - ungezaehlt;
    const nachFach = faecher.map((fach) => ({
      fach,
      imFach: zaehlFolge.filter((p) => p.fachLabel === fach),
    }));

    return (
      <>
        <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit}</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {letzterCheckZeile}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>
            Wie viel liegt wirklich {inDerEinheit(fahrzeug.einheitenart)}, und wie lange
            hält es?
          </div>
          {/*
            ZWEI SAETZE STATT FUENF (IDA-233). Was wegfiel, steht jetzt am
            Bedienelement selbst: das leere Feld traegt „nicht gezählt", der
            Leerknopf am Verfallsfeld sein eigenes Kreuz. Geblieben ist, was man
            VOR dem ersten Tipp wissen muss — dass eine 0 bestaetigt werden will
            (DRK-304), dass blind gezaehlt wird (IDA-219) und dass der Verfall
            freiwillig und vorbelegt ist.
          */}
          <p className={s.fussnote}>
            Trag ein, was du wirklich findest – tippen oder mit <b>+/−</b>, ein leeres Fach mit{" "}
            <b>0</b>; das Soll zeigt dir erst der nächste Schritt. Der Verfall ist freiwillig und aus
            dem letzten Check übernommen: nur ändern, wenn die Packung ein anderes (das{" "}
            <b>früheste</b>) Datum zeigt.
          </p>
          {art === "kurz" && (
            <p className={s.fussnote} data-rolle="stichprobe-hinweis">
              <b>Heute {soll.length} von {sollAlle.length} Positionen.</b> Ausgewählt, weil sie lange
              nicht gezählt, seit der letzten Zählung entnommen wurden oder bald ablaufen – dazu ein
              Zufallsanteil.
            </p>
          )}
        </div>

        <div className={s.fachraster} data-rolle="zaehlliste">
          {nachFach.map(({ fach, imFach }) => (
            <div key={fach}>
              {/*
                KLEBT BEIM SCROLLEN (IDA-233) — innerhalb seines Fachs, weil das
                Fach-`div` sein Containing Block ist: am Fachende schiebt der
                naechste Kopf ihn hinaus. Der Zaehler beantwortet „bin ich mit
                diesem Fach durch?", ohne dass jemand Kreise zaehlt.
              */}
              <div className={s.fachKopf} data-rolle="fach-kopf">
                <span>{fach}</span>
                <span className={s.fachStand}>
                  {imFach.filter(gezaehlt).length}/{imFach.length}
                </span>
              </div>
              <div className={s.karte}>
                {imFach.map((p) => {
                    const wert = istWert(p);
                    const offen = !gezaehlt(p);
                    const vw = verfallWert(p.artikelId);
                    const vc = verfallChip(vw);
                    const traegtFeld = ersteZeile.get(p.artikelId) === p.id;
                    const aufgeklappt = traegtFeld && verfallAuf[p.artikelId] === true;
                    return (
                      <div
                        className={`${s.zeile} ${s.zaehlZeile}`}
                        key={p.id}
                        style={{ alignItems: "flex-start" }}
                        data-rolle="zaehlzeile"
                      >
                        {/*
                          DREIWERTIG SEIT DRK-304, und aus demselben Grund wie
                          beim Sauerstoff weiter unten: der nackte
                          `.pruefKreis` ist neutral, und „noch nicht gezaehlt"
                          ist weder ein Fehl- noch ein Ok-Befund. Zweiwertig
                          faerbte die unberuehrte Zeile ROT — jede Zeile beim
                          Betreten des Schritts —, und der Marker, der beim
                          Scrollen ohne Lesen wirkt, saegte damit genau die
                          Aussage ab, die der Riegel daneben macht.
                        */}
                        {/*
                          BLIND GEZAEHLT SEIT IDA-219: der Kreis sagt nur noch
                          „gezaehlt", nie „unter Soll". Ein Rot/Gruen gegen das
                          Soll verriete das Soll durch die Hintertuer — wer bei
                          Gruen aufhoert zu tippen, zaehlt aufs Soll hin statt
                          zu zaehlen.
                        */}
                        <div className={`${s.pruefKreis} ${offen ? "" : s.pruefKreisOk}`} />
                        <div className={s.zeileHaupt}>
                          <div className={s.zeileName}>{p.artikelName}</div>
                          <div className={s.zeileMeta}>
                            {/* ⚠️ KEIN SOLL, KEINE LUECKE, KEIN UEBERBESTAND
                                IM ZAEHLSCHRITT (IDA-219). Gezaehlt wird blind;
                                was fehlt, zeigt erst der Schritt „Nachfuellen".
                                Die Einheit bleibt, sie sagt, WAS gezaehlt wird
                                (Stueck oder Packung).

                                ⚠️ „nicht gezaehlt" UND NICHT „noch nicht
                                gezaehlt": `.chip` traegt `white-space: nowrap`,
                                und die lange Fassung liess die Zeile am Telefon
                                schon einmal waagerecht ueberlaufen (CI-Lauf
                                34956458586, `lagerbuch-mobil.spec.ts` bei
                                390px, damals neben dem Stepper mit 110px
                                Textbreite). Seit IDA-233 steht der Stepper im
                                Band darunter und der Text hat die volle Breite;
                                der kurze Text bleibt trotzdem der richtige. */}
                            <span>{p.einheit}</span>
                            {offen && <HelferChip ton="grau">nicht gezählt</HelferChip>}
                            {/* Der Chip steht in JEDER Zeile desselben Artikels —
                                deshalb faellt die Hinweiszeile bei Wiederholzeilen
                                ersatzlos weg (§7.7.2 Punkt 3). In der ERSTEN Zeile
                                traegt ihn der Verfallsknopf im Band darunter. */}
                            {vc && !traegtFeld && <HelferChip ton={vc.ton}>{vc.text}</HelferChip>}
                          </div>
                        </div>
                        {/*
                          DAS BEDIENBAND — IDA-233. Verfallsknopf und Stepper
                          teilen sich EINE 56er-Zeile unter dem Text. Vorher
                          stand der Stepper neben dem Namen und liess ihm am
                          Telefon rund 110px (drei, vier Umbrueche je Artikel),
                          und das Verfallsfeld belegte in jeder ersten
                          Artikelzeile eine eigene 56er-Zeile darunter.
                        */}
                        {/* IDA-222: der Grund der Stichprobe, als eigene
                            volle Zeile zwischen Text und Bedienband — er ist
                            ein Satz, kein Chip, und `.chip` bricht nicht um. */}
                        {grundFuer(p) && (
                          <div className={s.grundZeile} data-rolle="stichprobe-grund">{grundFuer(p)}</div>
                        )}
                        <div className={s.zaehlBand}>
                          {traegtFeld && (
                            /*
                              DAS VERFALLSFELD LIEGT HINTER EINEM KNOPF (IDA-233).
                              Es ist freiwillig und wird selten geaendert, stand
                              aber in jeder ersten Artikelzeile offen da. Eine
                              VORHANDENE Angabe bleibt sichtbar: der Knopf
                              traegt dann ihren Ampelchip statt „Verfall
                              angeben" — derselbe Chip, den §7.7.2 Punkt 3 in
                              jeder Zeile des Artikels verlangt.

                              ⚠️ DER ARTIKELNAME STEHT VORN im aria-label, aus
                              demselben Grund wie beim Leerknopf unten: das Feld
                              heisst `Verfall <Artikel>`, und ein Knopf mit
                              demselben Anfang liesse `getByLabel(/^Verfall …/)`
                              auf zwei Elemente aufloesen.
                            */
                            <button
                              type="button"
                              className={s.verfallKnopf}
                              data-rolle="verfall-knopf"
                              aria-expanded={aufgeklappt}
                              aria-label={
                                vc
                                  ? `${p.artikelName}: Verfall ${vc.text}, ändern`
                                  : `${p.artikelName}: Verfall angeben`
                              }
                              onClick={() => {
                                verfallFokus.current = aufgeklappt ? null : p.artikelId;
                                setVerfallAuf((v) => ({ ...v, [p.artikelId]: !aufgeklappt }));
                              }}
                            >
                              {vc ? (
                                <HelferChip ton={vc.ton}>{vc.text}</HelferChip>
                              ) : (
                                <>
                                  <Ikone name="verfall" groesse={16} />
                                  Verfall angeben
                                </>
                              )}
                            </button>
                          )}
                          {/* max grosszuegig ueber Soll: echter Ueberbestand muss
                              zaehlbar sein, sonst korrigiert der Abgleich real
                              vorhandene Teile STILL heraus (`:293-294`).

                              ⚠️ TIPPBAR SEIT IDA-233 — `leer` STATT `noText`. Ein
                              Tipp ins Feld zaehlt NICHT: erst eine Ziffer (auch
                              „0") oder `−`/`+` macht die Zeile zur Zaehlung, ein
                              ohne Ziffer verlassenes Feld bleibt ungezaehlt
                              (`Stepper.tsx`, Prop `leer`). */}
                          <Stepper
                            wert={wert}
                            leer={offen}
                            min={0}
                            max={9999}
                            beschriftung={p.artikelName}
                            setWert={(v) => setIst((z) => ({ ...z, [p.id]: v }))}
                            beiEnter={() => nachZeile(p.id)}
                            ref={(el) => {
                              if (el) zaehlFelder.current.set(p.id, el);
                              else zaehlFelder.current.delete(p.id);
                            }}
                          />
                        </div>
                        {/*
                          GESCHWISTER VON KREIS, TEXT UND BAND. §7.7.2 Punkt 2
                          gibt dem Verfallsfeld „eine eigene, volle Zeile"; mit
                          `flex: 1 0 100%` (shell-seitig in `.verfallZeile`)
                          faellt es unter alle drei und nimmt die volle
                          Kartenbreite ein — seit IDA-233 nur aufgeklappt.
                        */}
                        {aufgeklappt && (
                          <div className={s.verfallZeile}>
                            {/* Natives <input type="month"> — kein antd-DatePicker
                                (§7.7.2 Punkt 4): die Klasse ist ohnehin ohne
                                Bibliothek, die native Monatsauswahl ist mit
                                Handschuhen einhaendig bedienbar, und es entfaellt
                                jede Dayjs-Umrechnung. `pattern` und `inputMode`
                                sind der Rueckfall fuer Browser, die `month` als
                                Textfeld rendern; die STRENGE selbst ist
                                serverseitig (MONAT_REGEX, §4.6).

                                Den Fokus bekommt es NUR nach dem Aufklappen per
                                Knopf (`verfallFokus`), nie per `autoFocus`: beim
                                Zurueckblaettern in diesen Schritt stehen alle
                                offenen Felder neu auf, und die Liste spraenge zum
                                letzten von ihnen. */}
                            <input
                              type="month"
                              inputMode="numeric"
                              pattern="\d{4}-\d{2}"
                              aria-label={`Verfall ${p.artikelName}`}
                              value={vw}
                              ref={(el) => {
                                if (el && verfallFokus.current === p.artikelId) {
                                  verfallFokus.current = null;
                                  el.focus();
                                }
                              }}
                              onChange={(e) =>
                                setVerfallState((v) => ({ ...v, [p.artikelId]: e.target.value }))
                              }
                            />
                            {/*
                              DER WEG ZURUECK AUS EINER ANGABE — DRK-306, AK4.

                              ⚠️ ER SCHREIBT `""`, NIEMALS `delete` ODER
                              `undefined`. `verfallWert` loest ueber
                              `verfallState[a] ?? verfall[a] ?? ""` auf: ein
                              entfernter Schluessel faellt durch die ??-Kette
                              auf den VORBELEGTEN Wert zurueck, und der alte
                              Monat stuende sofort wieder im Feld. Weder
                              `typecheck` noch `build` saehen das, und von Hand
                              faellt es nur auf, wenn ueberhaupt ein Vorwert
                              existiert.

                              ⚠️ ER IST KEIN LOESCHKNOPF FUER DIE HISTORIE.
                              `checkNutzlast` macht aus `""` ein `verfall: null`,
                              der Server ruft damit `loescheVerfallEintrag` —
                              also GENAU EINE Zeile in `lagerort_verfall`,
                              dem AKTUELLEN Stand des Fahrzeugs. Die
                              `ergebnis`-JSONs frueherer Checks sind eigene
                              Momentaufnahmen und bleiben unberuehrt; der
                              Nachweis DIESES Checks entsteht erst danach aus
                              dem neuen Stand und fuehrt den Artikel dann nicht
                              mehr.

                              ⚠️ NUR BEI VORHANDENER ANGABE. Ein Knopf, der
                              nichts zu loeschen hat, waere in jeder Zeile ein
                              zweites Tippziel neben dem Feld — und weil das
                              Leeren eines leeren Feldes ohnehin NICHTS sendet
                              (der Filter in `zaehlung()` vergleicht gegen den
                              Vorwert), auch folgenlos.

                              ⚠️ NICHT ROT (Falle 3): Rot traegt auf dieser
                              Flaeche die Ampelbedeutung „laeuft ab". Ein rotes
                              Kreuz neben einem gruenen Verfallschip laese sich
                              als Befund lesen statt als Bedienung.
                            */}
                            {vw !== "" && (
                              <button
                                type="button"
                                className={s.verfallLeeren}
                                data-rolle="verfall-leeren"
                                /*
                                  ⚠️ DER ARTIKELNAME STEHT VORN, NICHT „Verfall".
                                  Das Feld daneben heisst `Verfall <Artikel>`;
                                  traegt der Knopf denselben Anfang, loest jeder
                                  Greifer ueber diesen Praefix auf ZWEI Elemente
                                  auf — gemessen an `e2e/lagerbuch-helfer.spec.ts`,
                                  wo ein bestehendes `getByLabel(/^Verfall …/)`
                                  mit „strict mode violation" brach, sobald eine
                                  Vorbelegung den Knopf ueberhaupt erscheinen
                                  liess. Im Seed ohne Vorbelegung bleibt so ein
                                  Test still gruen; kaputt geht er erst auf
                                  echten Daten.
                                */
                                aria-label={`${p.artikelName}: Verfall entfernen`}
                                onClick={() =>
                                  setVerfallState((v) => ({ ...v, [p.artikelId]: "" }))
                                }
                              >
                                <Ikone name="kreuz" groesse={20} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {/*
          DER MITLAUFENDE STAND — IDA-233. Er klebt am UNTEREN Rand des
          Scrollkastens, weil dort der Daumen ist (eine Hand am Telefon), und
          landet am Listenende im Fluss direkt ueber der Weiter-Leiste.

          ⚠️ ER TRAEGT KEIN „WEITER", und das ist die Grenze zu DRK-304: ein
          mitfahrendes Weiter waere erreichbar, BEVOR die Liste gelesen wurde.
          Hier faehrt nur mit, was zur offenen Zeile FUEHRT. Hell statt tintig,
          damit er nicht wie die Abschlussleiste der anderen Schritte aussieht.

          ⚠️ KEINE LIVE-REGION. Er aendert sich mit jeder Zaehlung; eine
          Ansage je Tipp waere bei 210 Positionen Laerm.
        */}
        <div className={s.zaehlStand} data-rolle="zaehl-stand">
          <div className={s.zaehlStandText}>
            <b>
              {gezaehltAnzahl} von {soll.length} gezählt
            </b>
            <div className={s.zaehlStandSpur} aria-hidden="true">
              <div style={{ width: `${(gezaehltAnzahl / soll.length) * 100}%` }} />
            </div>
          </div>
          {ersteOffene ? (
            <button
              className={`${s.knopf} ${s.knopfTinte}`}
              type="button"
              onClick={zurOffenen}
              data-rolle="naechste-offene"
            >
              Nächste offene
            </button>
          ) : (
            /* ⚠️ NICHT „Weiter" im Namen: `getByRole("button", { name: "Weiter" })`
               trifft Teilstrings und fasste dann zwei Knoepfe. */
            <button
              className={`${s.knopf} ${s.knopfGeist}`}
              type="button"
              onClick={() => springeZu(weiterKnopf.current)}
              data-rolle="zum-ende"
            >
              Zum Abschluss
            </button>
          )}
        </div>

        {fehlerBereich}

        {/*
          DIE LEISTE DES ZAEHLSCHRITTS SCHWEBT NICHT MEHR — DRK-304. Sie steht
          am ENDE der Liste, und das ist der Punkt: ein „Weiter", das ueber der
          Liste mitfaehrt, ist erreichbar, BEVOR die Liste gelesen wurde. Wer
          gezaehlt hat, ist ohnehin unten angekommen.

          ⚠️ DIE UEBRIGEN DREI SCHRITTE BEHALTEN IHRE SCHWEBENDE LEISTE. Das
          Ticket nennt nur den Zaehlschritt, ihr Inhalt ist ein anderer, und ihr
          Knopf heisst „Abschliessen" — die Konsistenzfrage ist im Board
          gestellt und nicht einseitig entschieden.

          ⚠️ `.abschluss.abschlussRuhend` statt zweier gleichrangiger Klassen:
          bei Gleichstand entschiede die Reihenfolge im Stylesheet, und die ist
          keine Zusage (Falle 5).
        */}
        <div
          className={`${s.abschluss} ${s.abschlussRuhend}`}
          data-rolle="abschlussleiste"
        >
          <div className={s.abschlussInfo} data-rolle="zaehl-summe">
            {/*
              SOLANGE ETWAS OFFEN IST, IST DIE OFFENE ZAHL DIE NACHRICHT; „2 von
              2" sagt, warum der Knopf daneben nicht geht. Eine Bilanz gegen
              das Soll („unter Soll") steht hier NICHT MEHR (IDA-219): sie
              verriete das Soll, und der Schritt danach sagt es ohnehin.
            */}
            <b>
              {ungezaehlt > 0
                ? `Noch ${ungezaehlt} von ${soll.length} zu zählen`
                : "Alles gezählt"}
            </b>
            <div>
              {ablaufend > 0 && `${ablaufend} laufen ab · `}
              {ungezaehlt > 0
                ? "„Weiter“ zeigt dir die erste offene Zeile."
                : "Was fehlt, zeigt der nächste Schritt"}
            </div>
          </div>
          {/*
            ⚠️ GESPERRT, NICHT NUR GEWARNT. Ein Hinweis liesse den Ein-Klick-Weg
            in die Leerbuchung offen — und die ist im Journal nicht
            zuruecknehmbar (`check.ts`, `korrekturAufLagerort`). Der Riegel ist
            zugleich die Zusage der User Story: Mengen werden BEWUSST erfasst.

            ⚠️ `aria-disabled` STATT `disabled` — IDA-233. Ein natives
            `disabled` schluckt den Tipp, und wer am Ende einer langen Liste
            darauf tippt, erfaehrt nicht, WELCHE Zeile fehlt. Jetzt fuehrt der
            gesperrte Knopf dorthin. Gesperrt bleibt er trotzdem: sein Klick
            ruft dann `zurOffenen`, nie `zurNachfuellung` — und deren erste
            Anweisung bleibt der Riegel, falls ein zweiter Weg sie erreicht.
            `aria-disabled` sagt der Vorlesehilfe dasselbe wie das Aussehen
            (`.abschlussGo[aria-disabled="true"]`).
          */}
          <button
            className={s.abschlussGo}
            type="button"
            ref={weiterKnopf}
            aria-disabled={ungezaehlt > 0 ? true : undefined}
            onClick={ungezaehlt > 0 ? zurOffenen : zurNachfuellung}
            data-rolle="weiter"
          >
            Weiter
          </button>
        </div>
      </>
    );
  }

  // ——— Schritt: Geraete ———
  if (aktivePhase === "geraete") {
    return (
      <>
        <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit} · Geräte</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {letzterCheckZeile}
        {idx > 0 && (
          <button
            className={`${s.knopf} ${s.knopfGeist}`}
            type="button"
            onClick={() => setPhase(schrittFolge[idx - 1])}
            data-rolle="zurueck-zaehlen"
          >
            ← Zurück
          </button>
        )}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Sind die Geräte da und in Ordnung?</div>
          <p className={s.fussnote}>
            Alles ist auf <b>vorhanden · In Ordnung</b> vorbelegt – nur Abweichungen antippen.
          </p>
        </div>
        <div className={s.karte}>
          {geraete.map((g) => {
            const e = geraetE(g.id);
            return (
              <div className={s.zeile} key={g.id} style={{ alignItems: "flex-start" }}>
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{g.name}</div>
                  <div className={s.zeileMeta}>
                    {/* ⚠️ `aria-pressed` UND der Haken sind die Zusage, dass die
                        Auswahl nicht allein auf der Farbe steht: der Chiptext ist
                        im gewaehlten wie im ungewaehlten Fall derselbe. */}
                    <button
                      type="button"
                      aria-pressed={e.vorhanden}
                      data-rolle="geraet-vorhanden"
                      className={s.chipKnopf}
                      onClick={() => setGeraet(g.id, { vorhanden: true })}
                    >
                      <HelferChip ton={e.vorhanden ? "ok" : "grau"}>
                        {e.vorhanden && <Ikone name="haken" groesse={13} />}vorhanden
                      </HelferChip>
                    </button>
                    <button
                      type="button"
                      aria-pressed={!e.vorhanden}
                      data-rolle="geraet-fehlt"
                      className={s.chipKnopf}
                      onClick={() => setGeraet(g.id, { vorhanden: false })}
                    >
                      <HelferChip ton={!e.vorhanden ? "rot" : "grau"}>
                        {!e.vorhanden && <Ikone name="haken" groesse={13} />}fehlt
                      </HelferChip>
                    </button>
                    {e.vorhanden &&
                      ZUSTAENDE.map((z) => (
                        <button
                          key={z}
                          type="button"
                          aria-pressed={e.zustand === z}
                          data-rolle="geraet-zustand"
                          className={s.chipKnopf}
                          onClick={() => setGeraet(g.id, { zustand: z })}
                        >
                          <HelferChip ton={e.zustand === z ? zustandTon(z) : "grau"}>
                            {e.zustand === z && <Ikone name="haken" groesse={13} />}
                            {z}
                          </HelferChip>
                        </button>
                      ))}
                  </div>
                  <input
                    className={s.feld}
                    placeholder="Bemerkung (optional)"
                    aria-label={`Bemerkung ${g.name}`}
                    value={e.bemerkung ?? ""}
                    onChange={(ev) => setGeraet(g.id, { bemerkung: ev.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {fehlerBereich}

        <div className={s.abschluss} data-rolle="abschlussleiste">
          <div className={s.abschlussInfo}>
            <b>{geraete.length} Gerät(e)</b>
            <div>
              {istLetzter ? "Quittieren schließt den Check ab" : `Weiter zu ${PHASE_LABEL[naechste]}`}
            </div>
          </div>
          {istLetzter ? (
            <button
              className={s.abschlussGo}
              type="button"
              disabled={laeuft}
              onClick={abschliessen}
              data-rolle="abschliessen"
            >
              Abschließen
            </button>
          ) : (
            <button
              className={s.abschlussGo}
              type="button"
              onClick={() => setPhase(naechste)}
              data-rolle="weiter"
            >
              Weiter
            </button>
          )}
        </div>
      </>
    );
  }

  // ——— Schritt: Sauerstoff ———
  if (aktivePhase === "sauerstoff") {
    // ⚠️ `f.wechselAbProzent` KOMMT ALS PROP HEREIN, nicht aus einem Import
    // (DRK-308). Diese Datei ist eine Client-Insel; ein Wert aus einem
    // Servermodul kaeme hier als Client-Referenz an, nicht als Zahl (Falle 6).
    const zuWechseln = flaschen.filter(
      (f) => f.nennfuelldruckBar > 0
        && o2Status(druckWert(f), f.nennfuelldruckBar, f.wechselAbProzent).wechseln,
    ).length;
    return (
      <>
        <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit} · Sauerstoff</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {letzterCheckZeile}
        {idx > 0 && (
          <button
            className={`${s.knopf} ${s.knopfGeist}`}
            type="button"
            onClick={() => setPhase(schrittFolge[idx - 1])}
            data-rolle="zurueck-zaehlen"
          >
            ← Zurück
          </button>
        )}
        <div className={`${s.karte} ${s.kartePad}`}>
          <div className={s.zeileName}>Welchen Druck zeigt das Manometer?</div>
          <p className={s.fussnote}>
            Jede Flasche ist auf den Nennfülldruck vorbelegt – mit <b>−</b> auf den abgelesenen Wert
            runterstellen.
          </p>
        </div>
        <div className={s.karte} data-rolle="o2-liste">
          {flaschen.map((f) => {
            const wert = druckWert(f);
            // Ohne bekannten Nennfuelldruck ist der Fuellstand NICHT BEWERTBAR
            // (§5.12) — `o2Status` gaebe hier „rot / niedrig" zurueck, und die
            // Helferin liefe los, um eine VOLLE Flasche zu tauschen.
            const st = f.nennfuelldruckBar > 0
              ? o2Status(wert, f.nennfuelldruckBar, f.wechselAbProzent)
              : null;
            return (
              <div className={s.zeile} key={f.id}>
                {/*
                  ⚠️ DREIWERTIG, NICHT ZWEIWERTIG (Review-Befund 3). `st === null`
                  heisst „nicht bewertbar" (kein Nennfuelldruck hinterlegt) — und
                  ein zweiwertiges `st?.niedrig ? Fehl : Ok` faellt dann auf
                  `.pruefKreisOk`, also auf eine GEFUELLTE GRUENE Flaeche
                  (`helfer.module.css:275`, `background: var(--lb-ampel-ok-text)`).
                  Die Zeile sagte gleichzeitig „geprueft und in Ordnung" (Farbe)
                  und „nicht bewertbar" (Chiptext daneben).

                  `HelferChip.tsx:29-31` haelt die Regel fest: „⚠️ `grau` IST KEIN
                  AMPELWERT … und darf NIE als gruen dargestellt werden." Das ist
                  das Spiegelbild von Befund 30: dort wanderte eine volle Flasche
                  faelschlich als ROT durch, hier eine unbeurteilbare als GRUEN —
                  und der `pruefKreis` ist der einzige Marker, der beim Scrollen
                  ohne Lesen wirkt.

                  Der nackte `.pruefKreis` ist bereits neutral
                  (`background: var(--lb-karte)`, grauer Rand) und damit die
                  richtige dritte Stufe.
                */}
                <div
                  className={`${s.pruefKreis} ${
                    st === null ? "" : st.wechseln ? s.pruefKreisFehl : s.pruefKreisOk
                  }`}
                />
                <div className={s.zeileHaupt}>
                  <div className={s.zeileName}>{f.name}</div>
                  <div className={s.zeileMeta}>
                    {f.nennfuelldruckBar > 0 ? (
                      <span>Nennfülldruck {f.nennfuelldruckBar} bar</span>
                    ) : (
                      <span>Nennfülldruck nicht hinterlegt</span>
                    )}
                    {/* ⚠️ „noch nicht gemessen" ist eine ANDERE Aussage als
                        „Nennfuelldruck nicht hinterlegt" (keine Messung vs. kein
                        Sollwert). Ohne sie stuende im Null-Fall ein leeres Feld
                        ohne Erklaerung (Uebergabe Teil 3, Punkt 4). */}
                    {f.letzterDruck === null ? (
                      <span>noch nicht gemessen</span>
                    ) : (
                      <span>zuletzt gemessen: {f.letzterDruck} bar</span>
                    )}
                    {st ? (
                      <HelferChip ton={ampelTon(st.ampel)}>{st.prozent}%</HelferChip>
                    ) : (
                      <HelferChip ton="grau">nicht bewertbar</HelferChip>
                    )}
                    {/* ⚠️ DER HINWEIS NENNT SEINEN GRENZWERT (DRK-308). Ein
                        nacktes „niedrig" liess offen, ab wann es gilt — und die
                        Schwelle ist ab jetzt je Flasche einstellbar, also nicht
                        mehr aus dem Kopf bekannt. Die bar-Zahl steht dabei VOR
                        der Prozentzahl: am Manometer wird bar abgelesen. */}
                    {st?.wechseln && (
                      <HelferChip ton="rot">
                        wechseln – ab {st.wechselAbBar} bar ({st.wechselAbProzent} %)
                      </HelferChip>
                    )}
                  </div>
                </div>
                {/* max grosszuegig ueber Nennfuelldruck: eine ueberfuellte
                    Flasche muss ablesbar bleiben (`:401`). */}
                <Stepper
                  wert={wert}
                  min={0}
                  max={9999}
                  beschriftung={`Druck ${f.name}`}
                  setWert={(v) => setDruck((z) => ({ ...z, [f.id]: v }))}
                />
              </div>
            );
          })}
        </div>

        {fehlerBereich}

        <div className={s.abschluss} data-rolle="abschlussleiste">
          <div className={s.abschlussInfo}>
            <b>
              {zuWechseln === 0
                ? `${flaschen.length} Flasche(n)`
                : `${zuWechseln} wechseln`}
            </b>
            <div>
              {istLetzter ? "Bestätigen schließt den Check ab" : `Weiter zu ${PHASE_LABEL[naechste]}`}
            </div>
          </div>
          {istLetzter ? (
            <button
              className={s.abschlussGo}
              type="button"
              disabled={laeuft}
              onClick={abschliessen}
              data-rolle="abschliessen"
            >
              Abschließen
            </button>
          ) : (
            <button
              className={s.abschlussGo}
              type="button"
              onClick={() => setPhase(naechste)}
              data-rolle="weiter"
            >
              Weiter
            </button>
          )}
        </div>
      </>
    );
  }

  // ——— Schritt: Nachfuellen ———
  const knappheit = new Map<string, { verfuegbar: number; gewuenscht: number }>();
  for (const p of soll) {
    const e = knappheit.get(p.artikelId) ?? { verfuegbar: p.handlagerBestand, gewuenscht: 0 };
    e.gewuenscht += nfWert(p);
    knappheit.set(p.artikelId, e);
  }
  const nfPositionen = soll.filter((p) => Math.max(0, p.soll - istWert(p)) > 0);
  const summe = soll.reduce((z, p) => z + nfWert(p), 0);
  // IDA-247: was ueber „OK bis" liegt, und was davon in die Kiste wandert.
  const zuVielPositionen = soll.filter((p) => zuViel(p) > 0);
  const boxSumme = soll.reduce((z, p) => z + boxWert(p), 0);

  return (
    <>
      <div className={s.schirmKopf} ref={kopf} data-rolle="check-einheit">{kopfEinheit}</div>
      <Schritte folge={schrittFolge} aktiv={aktivePhase} />
      {letzterCheckZeile}
      <button
        className={`${s.knopf} ${s.knopfGeist}`}
        type="button"
        onClick={() => setPhase("zaehlen")}
        data-rolle="zurueck-zaehlen"
      >
        ← Zurück zum Zählen
      </button>

      {nfPositionen.length === 0 ? (
        <div className={`${s.karte} ${s.kartePad}`}>
          Nichts nachzufüllen – alle Positionen sind auf Soll.
          {/* Mit Ueberschuss bleibt darunter noch etwas zu tun. */}
          {zuVielPositionen.length === 0
            ? ` Du kannst ${istLetzter ? "den Check direkt abschließen" : "direkt weiter"}.`
            : null}
        </div>
      ) : (
        <>
          <div className={`${s.karte} ${s.kartePad}`}>
            <div className={s.zeileName}>
              Aus dem Handlager {inDieEinheit(fahrzeug.einheitenart)} legen
            </div>
            <p className={s.fussnote}>
              Die Überschriften sind die Fächer {inDerEinheit(fahrzeug.einheitenart)}, in die die
              Teile gehören. Hol sie aus dem angegebenen Handlager-Fach und stell mit <b>+/−</b> ein,
              wie viele du <b>wirklich</b> geholt hast.
            </p>
          </div>
          {/*
            NACH ZIEL-FACH GEGLIEDERT (IDA-226), wie der Zaehlschritt. Das
            Handlager-Fach sagt nur, WOHER; wer die Teile danach einraeumt, muss
            wissen, WOHIN — und ein Artikel in zwei Faechern war vorher zweimal
            dieselbe Zeile.
          */}
          <div className={s.fachraster} data-rolle="nf-liste">
            {faecher.filter((f) => nfPositionen.some((p) => p.fachLabel === f)).map((fach) => (
              <div key={fach} data-rolle="nf-fach">
                <div className={s.fachKopf}>{fach}</div>
                <div className={s.karte}>
                  {nfPositionen.filter((p) => p.fachLabel === fach).map((p) => {
                    const luecke = Math.max(0, p.soll - istWert(p));
                    return (
                      <div className={s.nfZeile} key={p.id}>
                        <div className={s.zeileHaupt}>
                          <div className={s.zeileName}>{p.artikelName}</div>
                          <div className={s.zeileMeta}>
                            <span className={s.fach}>{p.handlagerFach}</span>
                            <span>
                              Lücke {luecke} · im Handlager {p.handlagerBestand}
                            </span>
                          </div>
                        </div>
                        <div className={s.nfGeholt}>
                          {/* `max={luecke}`: der Helfer stellt ein, was er WIRKLICH
                              geholt hat — die Buchung folgt der Wirklichkeit, nicht
                              dem Vorschlag (`:461`). */}
                          <Stepper
                            noText
                            wert={nfWert(p)}
                            min={0}
                            max={luecke}
                            beschriftung={`geholt ${p.artikelName}`}
                            setWert={(v) => setNachfuell((z) => ({ ...z, [p.id]: v }))}
                          />
                          <small>geholt</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/*
        ZU VIEL AN BORD — IDA-247. Dieselbe Gliederung nach Ziel-Fach wie die
        Nachfuellung darueber: wer die Teile herausnimmt, steht vor genau
        diesem Fach. Der Vorschlag ist der ganze Ueberschuss ueber „OK bis";
        der Stepper sagt, was WIRKLICH in die Kiste gewandert ist — gebucht
        wird nur das.
      */}
      {zuVielPositionen.length > 0 && (
        <>
          <div className={`${s.karte} ${s.kartePad}`} data-rolle="box-hinweis">
            <div className={s.zeileName}>Zu viel an Bord</div>
            <p className={s.fussnote}>
              {entnahmebox ? (
                <>
                  {grossAmAnfang(inDerEinheit(fahrzeug.einheitenart))} liegt mehr, als hingehört.
                  Leg es in die <b>{entnahmebox.name}</b> und stell mit <b>+/−</b> ein, wie viel du{" "}
                  <b>wirklich</b> hineingelegt hast.
                </>
              ) : (
                <>
                  {grossAmAnfang(inDerEinheit(fahrzeug.einheitenart))} liegt mehr, als hingehört. Die
                  Entnahmebox nimmt gerade nichts auf – bitte der Verwaltung melden.
                </>
              )}
            </p>
          </div>
          <div className={s.fachraster} data-rolle="box-liste">
            {faecher.filter((f) => zuVielPositionen.some((p) => p.fachLabel === f)).map((fach) => (
              <div key={fach} data-rolle="box-fach">
                <div className={s.fachKopf}>{fach}</div>
                <div className={s.karte}>
                  {zuVielPositionen.filter((p) => p.fachLabel === fach).map((p) => {
                    const mehr = zuViel(p);
                    return (
                      <div className={s.nfZeile} key={p.id}>
                        <div className={s.zeileHaupt}>
                          <div className={s.zeileName}>{p.artikelName}</div>
                          <div className={s.zeileMeta}>
                            <span>
                              {mehr} zu viel · gezählt {istWert(p)} ·{" "}
                              {p.sollMax === null ? "Soll" : "OK bis"} {obergrenze(p.soll, p.sollMax)}
                            </span>
                          </div>
                        </div>
                        {entnahmebox && (
                          <div className={s.nfGeholt}>
                            <Stepper
                              noText
                              wert={boxWert(p)}
                              min={0}
                              max={mehr}
                              beschriftung={`in die Box ${p.artikelName}`}
                              setWert={(v) => setBox((z) => ({ ...z, [p.id]: v }))}
                            />
                            <small>in Box</small>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/*
        ⚠️ Diese Warnung KANN der greedy Vorschlag nicht ausloesen — er deckelt
        selbst an der Verfuegbarkeit (Befund 32). Sie erscheint erst, wenn der
        Helfer von Hand mehr eintraegt, als der Handlager fuer diesen Artikel
        hergibt: dann kappt die Buchung serverseitig, und er soll es VORHER
        wissen.
      */}
      {[...knappheit.values()].some((e) => e.gewuenscht > e.verfuegbar) && (
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="nf-knappheit">
          {/* Der mehrzeilige Hinweis braucht die von `.chip` abweichende Form aus `.warnhinweis`. */}
          <span
            className={`${s.chip} ${s.gelb} ${s.warnhinweis}`}
            data-rolle="helfer-chip"
          >
            Handlager reicht nicht für alle Positionen – es wird nur gebucht, was verfügbar ist.
          </span>
        </div>
      )}

      {fehlerBereich}

      <div className={s.abschluss} data-rolle="abschlussleiste">
        <div className={s.abschlussInfo}>
          <b>
            {summe} Teile {inDieEinheit(fahrzeug.einheitenart)}
            {boxSumme > 0 && entnahmebox ? ` · ${boxSumme} in die Box` : null}
          </b>
          <div>
            {istLetzter
              ? `Bestätigen bucht Handlager → ${fahrzeug.name}`
                + (boxSumme > 0 && entnahmebox ? ` und ${fahrzeug.name} → ${entnahmebox.name}` : "")
              : `Weiter zu ${PHASE_LABEL[naechste]}`}
          </div>
        </div>
        {istLetzter ? (
          <button
            className={s.abschlussGo}
            type="button"
            disabled={laeuft}
            onClick={abschliessen}
            data-rolle="abschliessen"
          >
            {/* „Gelegt & abschließen" stand hier und war kein Satz, sondern
                zwei Bruchstücke: ein Partizip ohne Bezug plus ein Infinitiv.
                Der Knopf bestätigt, was die Karte darüber verlangt („Aus dem
                Handlager aufs Fahrzeug legen") — er sagt das jetzt in denselben
                Worten. Dass damit der Check endet, steht im Text daneben
                („Bestätigen bucht Handlager → …"). */}
            {grossAmAnfang(inDieEinheit(fahrzeug.einheitenart))} gelegt
          </button>
        ) : (
          <button
            className={s.abschlussGo}
            type="button"
            onClick={() => setPhase(naechste)}
            data-rolle="weiter"
          >
            Weiter
          </button>
        )}
      </div>
    </>
  );
}
