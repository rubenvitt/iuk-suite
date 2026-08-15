import type {
  AufgabeRow,
  Ereignis,
  NachweisArt,
  PersonRow,
  Prioritaet,
  Rolle,
  RoutineRow,
  Status,
} from "../_db/schema";
import { wochentagVon } from "./datum";

/*
 * BESCHRIFTUNGEN UND ABLEITUNGEN — die eine Quelle. KEIN "use client": jede
 * Server Component liest diese Konstanten, und aus einem Client-Modul kaeme eine
 * Client-Referenz statt des Objekts.
 *
 * WARUM DIE ABLEITUNGEN HIER LIEGEN UND NICHT IN DEN SEITEN: „ueberfaellig" und
 * „Zeitvorschlag offen" erscheinen je auf mehreren Seiten UND in einer
 * KPI-Kachel. Zwei Fassungen derselben Bedingung laufen auseinander, und der
 * Fehler ist nicht sichtbar kaputt, sondern nur falsch: die Kachel zaehlt drei,
 * die Liste zeigt zwei, und beide Zahlen sehen richtig aus.
 */

/** Die fuenf Toene der Zustands-Chips. Jeder loest sich in ein Paar `--auf-<ton>-text/-flaeche` auf. */
export type ChipTon = "grau" | "stahl" | "ocker" | "ok" | "achtung";

/** Die drei Gewichtsstufen der Prioritaet — die Rangfolge traegt die Form, nicht die Farbe. */
export type PrioritaetForm = "gefuellt" | "kontur" | "text";

export const STATUS_TEXT: Record<Status, string> = {
  eingegangen: "Zu verteilen",
  verteilt: "Verteilt",
  in_arbeit: "In Bearbeitung",
  freigabe_offen: "Freigabe offen",
  abgeschlossen: "Abgeschlossen",
  zurueckgewiesen: "Zurückgewiesen",
};

/**
 * `achtung` ist absichtlich nur EINMAL vergeben und loest sich in die getrennte
 * Ampel-Rot-Textfarbe auf, nicht in Markenrot.
 */
export const STATUS_TON: Record<Status, ChipTon> = {
  eingegangen: "grau",
  verteilt: "grau",
  in_arbeit: "stahl",
  freigabe_offen: "ocker",
  abgeschlossen: "ok",
  zurueckgewiesen: "achtung",
};

export const PRIORITAET_TEXT: Record<Prioritaet, string> = {
  hoch: "Hoch",
  mittel: "Mittel",
  niedrig: "Niedrig",
};

export const PRIORITAET_FORM: Record<Prioritaet, PrioritaetForm> = {
  hoch: "gefuellt",
  mittel: "kontur",
  niedrig: "text",
};

/**
 * DIE BESCHRIFTUNG DER ZWEI ROLLEN (Aufgabe 14, Spec §4 mit Nachtrag 2026-08-15) — die eine Quelle
 * fuer `PersonenFormular.tsx`s Auswahlfeld UND `PersonenTabelle.tsx`s Anzeige. Ohne diese Konstante
 * traegt jede Aufrufstelle ihre eigene Beschriftung, und eine dritte Fassung faellt genau dann
 * auseinander, wenn nur eine der beiden Stellen "Auftraggeber" statt "auftrag" nachzieht.
 *
 * "Koordination" IST HIER KEINE ZEILE MEHR: die Rolle kommt aus der Auth-Gruppe (`_lib/zugang.ts`),
 * und ein Eintrag hier haette der Koordination ein Auswahlfeld angeboten, das die Datenbank nicht
 * mehr kennt.
 */
export const ROLLE_TEXT: Record<Rolle, string> = {
  auftrag: "Auftraggeber",
  bufdi: "BuFDi",
};

/**
 * DIE INITIALEN AUS EINEM NAMEN — zwei Buchstaben, wie sie die Koordination im Formular auch von
 * Hand vergibt. Zwei oder mehr Namensteile ergeben die Anfangsbuchstaben der ersten beiden, ein
 * einzelner Teil (oder eine E-Mail als Ersatzname) seine ersten beiden Zeichen. `initialen` ist
 * `NOT NULL` und steht in jeder Liste des Moduls; ein leerer Wert waere eine Zelle, die niemand
 * zuordnen kann. Die Koordination korrigiert beides ueber `/personen` in zwei Klicks.
 *
 * SIE STAND BIS ZUM VERZEICHNIS-AUTOFILL (2026-08-15) PRIVAT IN `_lib/zugang.ts` — dort braucht sie
 * die JIT-Zeile (`legeKoordinationAn`), hier braucht sie zusaetzlich das PERSONENFORMULAR, das nach
 * einem Verzeichnistreffer `sub`, `name` UND die Initialen vorbelegt. Der Umzug war Pflicht, keine
 * Ordnungsliebe: `zugang.ts` importiert `@/core/auth`, und ein Import daraus in die Client-Insel
 * `_ui/PersonenFormular.tsx` zoege next-auth ins Client-Bundle (dieselbe Begruendung wie im
 * Kopfkommentar von `_ui/PersonenTabelle.tsx`). Diese Datei traegt kein `"use client"` und keine
 * Sitzung — sie ist die Stelle, die BEIDE Seiten lesen duerfen. Eine zweite Fassung im Formular
 * waere die schlechtere Antwort gewesen: die Koordination saehe im Formular andere Initialen als
 * die, die ihre eigene JIT-Zeile bekommen hat.
 */
export function initialenAus(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  const roh =
    teile.length >= 2
      ? `${teile[0]!.slice(0, 1)}${teile[1]!.slice(0, 1)}`
      : (teile[0] ?? "").slice(0, 2);
  return (roh || "??").toUpperCase();
}

/**
 * DIE BESCHRIFTUNG DER NACHWEISFORM (Aufgabe 15, Spec §5.3) — die eine Quelle fuer
 * `AufgabeFormular.tsx`s Formwahl UND `FreigabeZone.tsx`s Anzeige, welche Form ein Nachweis
 * gerade traegt. Dieselbe Ueberlegung wie bei `ROLLE_TEXT`: eine zweite, freihaendige
 * Beschriftung an einer der beiden Stellen liefe irgendwann auseinander.
 */
export const NACHWEIS_ART_TEXT: Record<NachweisArt, string> = {
  text: "Text",
  bild: "Bild",
};

/**
 * DIE BESCHRIFTUNG JEDES VERLAUFS-EREIGNISSES (Aufgabe 16, Spec §6 `verlauf`) — die eine Quelle
 * fuer `a/[id]/page.tsx`s Journal. `EREIGNISSE` (`_db/schema.ts`) traegt die zehn Datenbankwerte
 * ohne Umlaute; diese Map haengt die lesbare Form daneben, wie `STATUS_TEXT`/`ROLLE_TEXT` es fuer
 * ihre jeweilige Spalte tun. `zurueckziehen` erzeugt KEIN Ereignis (es loescht die Aufgabe samt
 * Verlauf, `schema.ts`-Kommentar) und fehlt hier deshalb zu Recht — es gibt keine Zeile, die diese
 * Beschriftung je tragen koennte.
 */
export const EREIGNIS_TEXT: Record<Ereignis, string> = {
  eingestellt: "Eingestellt",
  verteilt: "Verteilt",
  umverteilt: "Umverteilt",
  eingeplant: "Eingeplant",
  gestartet: "Bearbeitung gestartet",
  zurueckgesetzt: "Bearbeitung zurückgesetzt",
  fertig_gemeldet: "Fertig gemeldet",
  abgeschlossen: "Abgeschlossen",
  zurueckgewiesen: "Zurückgewiesen",
  wiederaufgenommen: "Bearbeitung wieder aufgenommen",
};

/**
 * NAME JE PERSON-ID (Aufgabe 14) — fuer Tabellen, die eine FREMDE Person je Zeile nennen (die
 * Posteingang-Tabelle nennt den Auftraggeber, nicht den aktuellen Betrachter). Eine Ableitung aus
 * BEREITS GELADENEN Personen, keine zweite Datenbankabfrage je Zeile: der Aufrufer hat `PersonRow[]`
 * ohnehin schon (z. B. `allePersonen(db)`), und diese Funktion baut daraus nur die Umkehrung
 * `id -> name`, damit eine Client-Insel (Tabelle mit `render`-Funktionen, Falle 3) NUR
 * serialisierbare Werte braucht statt eines Callbacks ueber die RSC-Grenze.
 */
export function namenMap(personenListe: readonly PersonRow[]): Record<string, string> {
  return Object.fromEntries(personenListe.map((p) => [p.id, p.name]));
}

/**
 * „Zeitvorschlag offen" (Spec §5.1) — ein ABGELEITETER Zustand, kein siebter
 * gespeicherter. Die MITTLERE Bedingung ist die, die man vergisst: die
 * Vorschlagsfelder bleiben nach dem Einplanen stehen, damit der Verlauf belegen
 * kann, ob angenommen oder abgewichen wurde.
 */
export function vorschlagOffen(a: AufgabeRow): boolean {
  return a.status === "verteilt" && a.planDatum === null && a.vorschlagDatum !== null;
}

/**
 * Ueberfaellig heisst: die FRIST ist verstrichen und die Aufgabe ist nicht
 * abgeschlossen. Der Zeitplan spielt keine Rolle. ISO-Tagesstrings sind
 * lexikografisch vergleichbar, deshalb `<` und kein Datums-Parsen.
 */
export function istUeberfaellig(a: AufgabeRow, heute: string): boolean {
  return a.status !== "abgeschlossen" && a.faelligAm < heute;
}

/**
 * WARTET AUF EINPLANUNG (Spec §8.1, Aufgabe 13) — der Posteingang-Streifen
 * der BuFDi-Woche „Meine Woche": verteilt UND noch in keinem Tag. BEWUSST
 * WEITER als `vorschlagOffen`: eine Aufgabe OHNE Zeitvorschlag gehoert
 * genauso hierher (die Zeile zeigt dann schlicht keinen Vorschlag) — der
 * Brief nennt den Streifen "was verteilt und noch in keinem Tag liegt", ohne
 * einen Vorschlag vorauszusetzen.
 *
 * DIESELBE Ableitung speist die KPI-Kachel "Einzuplanen" UND die Liste
 * darunter (`EinstiegBufdi.tsx`) — zwei Fassungen derselben Bedingung liefen
 * sonst auseinander, und der Fehler waere nicht sichtbar kaputt, nur falsch.
 */
export function wartetAufEinplanung(a: AufgabeRow): boolean {
  return a.status === "verteilt" && a.planDatum === null;
}

/**
 * HEUTE OFFEN (Spec §8.1) — auf den heutigen Tag eingeplant und noch nicht
 * abgeschlossen. `heute` kommt als Argument wie bei `istUeberfaellig`, nie
 * aus `new Date()` hier.
 */
export function heuteOffen(a: AufgabeRow, heute: string): boolean {
  return a.planDatum === heute && a.status !== "abgeschlossen";
}

/**
 * ANZAHL DER AUFGABEN IN EINER WOCHE (Review Fix-Runde 1, Minor — vorher eine dritte, ungeteste
 * Fassung derselben Mitgliedschaft inline in `_ui/EinstiegBufdi.tsx`). KEIN Statusfilter, absichtlich
 * — dieselbe Zusage wie `tagesOrdnung`/`tagesBudget` in `_lib/tagesplan.ts` ("ALLE Zustaende
 * zaehlen, auch abgeschlossen"): eine Kontextzeile, die weniger Aufgaben zaehlt als die
 * Tagesspalten darunter zeigen, waere sichtbar inkonsistent. `aufgaben` ist bereits auf die
 * betrachtete Person gefiltert (Aufrufer: `aufgabenFuerPerson`), diese Funktion filtert nur noch
 * nach Wochenzugehoerigkeit.
 */
export function aufgabenInWoche(aufgaben: readonly AufgabeRow[], tage: readonly string[]): number {
  return aufgaben.filter((a) => a.planDatum !== null && tage.includes(a.planDatum)).length;
}

/** Bit je Wochentag: Index 0 = Montag. Die Maske liegt in `routinen.wochentage`. */
export const WOCHENTAG_BIT = [1, 2, 4, 8, 16] as const;

export function routineAmTag(r: RoutineRow, wochentag: number): boolean {
  const bit = WOCHENTAG_BIT[wochentag];
  // Die Undefined-Pruefung ist nicht Zierde: ohne sie waere `wochentage & undefined`
  // eine NaN-Rechnung, die hier zufaellig 0 ergibt — kein Verhalten, auf das man baut.
  return r.aktiv && bit !== undefined && (r.wochentage & bit) !== 0;
}

/** Kurzform je Index von `WOCHENTAG_BIT` (0 = Montag … 4 = Freitag). Nur fuer `fmtWochentage`. */
const WOCHENTAG_KURZ_MO_FR: readonly string[] = ["Mo", "Di", "Mi", "Do", "Fr"];

/**
 * Die Wochentage EINER Routine lesbar, nicht als Zahl (Aufgabe 11, Spec §8.1:
 * „die Wochentage lesbar (nicht die Zahl)"). Liest `WOCHENTAG_BIT` in
 * AUFSTEIGENDER Reihenfolge — DIESELBE Quelle wie `routineAmTag` — statt die
 * Maske selbst zu zerlegen: Auswahl → Maske → Anzeige haengt damit an EINER
 * Stelle, nicht an zwei Fassungen, die auseinanderlaufen koennten (genau die
 * Stelle, an der ein Off-by-one still falsch waere — eine Routine erschiene
 * dann am falschen Tag, und niemand saehe es auszer der betroffenen Person).
 */
export function fmtWochentage(maske: number): string {
  return WOCHENTAG_BIT.map((bit, i) => ((maske & bit) !== 0 ? WOCHENTAG_KURZ_MO_FR[i] : null))
    .filter((tag): tag is string => tag !== null)
    .join(", ");
}

export interface Budget {
  verplantMinuten: number;
  sollMinuten: number;
  ueberbucht: boolean;
}

/**
 * Das Tagesbudget einer Person: eingeplante Aufgaben plus aktive Routinen des
 * Wochentags, gegen `sollMinutenTag`.
 *
 * ALLE ZUSTAENDE ZAEHLEN, auch `abgeschlossen`: „verplant" ist eine Aussage
 * ueber den Tag, nicht ueber den Arbeitsvorrat. Ein Rueckblick auf eine
 * vergangene Woche zeigte sonst leere Tage.
 *
 * `ueberbucht` ist ECHT groesser: ein exakt gefuellter Tag ist voll, nicht
 * ueberbucht.
 */
export function tagesBudget(
  aufgaben: AufgabeRow[],
  routinen: RoutineRow[],
  person: PersonRow,
  datum: string,
): Budget {
  const wochentag = wochentagVon(datum);
  const ausAufgaben = aufgaben
    .filter((a) => a.zugewiesenAn === person.id && a.planDatum === datum)
    .reduce((summe, a) => summe + a.dauerMinuten, 0);
  const ausRoutinen =
    wochentag === null
      ? 0
      : routinen
          .filter((r) => r.personId === person.id && routineAmTag(r, wochentag))
          .reduce((summe, r) => summe + r.dauerMinuten, 0);
  const verplantMinuten = ausAufgaben + ausRoutinen;
  return {
    verplantMinuten,
    sollMinuten: person.sollMinutenTag,
    ueberbucht: verplantMinuten > person.sollMinutenTag,
  };
}

/** „45 Min." · „1 Std." · „1,5 Std." */
export function fmtDauer(minuten: number): string {
  if (minuten < 60) return `${minuten} Min.`;
  return `${fmtStunden(minuten)} Std.`;
}

/**
 * „7,8" · „2" · „2,75". `toFixed(2)` statt `toLocaleString`, damit die Rundung
 * nicht von der ICU-Fassung des Laufzeitsystems abhaengt.
 */
export function fmtStunden(minuten: number): string {
  return (minuten / 60)
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}
