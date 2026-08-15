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
import { tagePlus, wochentagVon } from "./datum";

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

/**
 * OHNE AKTIVEN TRAEGER (Oberflaechen-Spec 2026-08-16 §4.5, §9/S1) — eine offene Aufgabe, die bei
 * einer Person liegt, die nicht mehr aktiv ist.
 *
 * DER FALL IST DER TOEDLICHSTE DES SKEPTIKERS, WEIL ER HEUTE UNSICHTBAR IST: `bufdis()`
 * (`_db/queries.ts`) ist `aktivePersonen(db, heute).filter(rolle === "bufdi")` — sobald `aktivBis`
 * gesetzt ist, verschwindet die Spalte aus jeder Achse. Die offenen Aufgaben stehen in KEINEM
 * Posteingang (`verteilt`/`in_arbeit`/`freigabe_offen` sind nicht `eingegangen`) und damit
 * nirgends; auffindbar bleiben sie nur ueber `/a/<id>`, das man erst kennen muss.
 *
 * `aktiveIds` KOMMT ALS MENGE HEREIN, NICHT ALS `db`: dieselbe Regel wie ueberall in dieser Datei —
 * kein Datenbankzugriff, keine Uhr. Der Aufrufer baut sie aus `aktivePersonen(db, heute)`.
 * `bufdis()` bleibt dabei WOERTLICH unangetastet (§11.3): eine ausgeschiedene Person ist kein
 * Verteilziel, und der Fall wird OBERHALB dieses Riegels geloest, nicht durch sein Aufweichen.
 *
 * `abgeschlossen` UND `zurueckgewiesen` FALLEN DURCH: eine abgeschlossene Aufgabe bei einer
 * ausgeschiedenen Person ist der Normalfall eines Abschieds (im lokalen Seed genau Doertes einzige
 * Zeile), und `zurueckgewiesen` ist eine eigene Sprosse der Leiter.
 */
export function ohneAktivenTraeger(a: AufgabeRow, aktiveIds: ReadonlySet<string>): boolean {
  const offen = a.status === "verteilt" || a.status === "in_arbeit" || a.status === "freigabe_offen";
  return offen && a.zugewiesenAn !== null && !aktiveIds.has(a.zugewiesenAn);
}

/**
 * OHNE PLATZ IN DER ACHSE (Oberflaechen-Spec 2026-08-16 §4.5, Regel V) — eine Aufgabe, die in
 * KEINER der fuenf Tagesspalten stehen kann. Zwei Zweige, und der Name ist bewusst weiter als
 * „ausserhalbDerWoche":
 *
 *  1. `planDatum` gesetzt, aber nicht unter den fuenf Tagen — die vorausgeplante oder liegen
 *     gebliebene Zeile.
 *  2. GAR KEIN `planDatum` bei `in_arbeit`/`freigabe_offen` — ueber diese Zeile waere „ausserhalb
 *     der Woche" eine Falschaussage: sie hat keine Woche. Dieser Zweig traegt die Restmenge aus
 *     §4.1 UND die R3-Ausnahme fuer BuFDi-Rang 3 (§3.4); wer ihn wegnimmt, oeffnet beide Loecher
 *     wieder.
 *
 * `verteilt` OHNE `planDatum` STEHT NICHT DARIN: das ist `wartetAufEinplanung` und damit ein
 * eigener Anlass (Rang 6). Stuende es hier, zaehlte dieselbe Zeile zweimal — einmal in der Zone
 * „Einzuplanen", einmal in der Fusszeile der Achse.
 *
 * `tage` IST IMMER DIE LAUFENDE WOCHE, nie die geblaetterte — sonst aenderte sich die Zahl beim
 * Blaettern, ohne dass sich an den Daten etwas geaendert haette.
 */
export function ohnePlatzInDerAchse(a: AufgabeRow, tage: readonly string[]): boolean {
  if (a.status === "abgeschlossen") return false;
  if (a.planDatum !== null) return !tage.includes(a.planDatum);
  return a.status === "in_arbeit" || a.status === "freigabe_offen";
}

/**
 * DER NAECHSTE TAG MIT EINEM WOCHENTAG (Oberflaechen-Spec 2026-08-16 §4.5) — fuer die Sprosse
 * `kein_arbeitstag` („Wochenende. Naechster Arbeitstag: Mo, 24.08.") und fuer das versteckte Feld
 * von „Auf morgen schieben".
 *
 * IMMER DER NAECHSTE, NIE DER HEUTIGE: auch von einem Montag aus ist es der Dienstag. „Morgen
 * schieben" heisst morgen, und am Freitag heisst es Montag.
 *
 * `montagDerWoche` BLEIBT UNANGETASTET (§4.5): sie ist Kalenderarithmetik und heute korrekt; eine
 * fachliche Regel „am Wochenende meint man die naechste Woche" darin wuerde still auch die
 * Rueckwaertsnavigation verbiegen.
 */
export function naechsterArbeitstag(iso: string): string {
  let tag = tagePlus(iso, 1);
  while (wochentagVon(tag) === null) {
    tag = tagePlus(tag, 1);
  }
  return tag;
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

/*
 * ═══ DIE BESCHRIFTUNG DER OBERFLAECHE (Oberflaechen-Spec 2026-08-16) ═══════════════════════════
 *
 * WARUM DIE TEXTE HIER LIEGEN UND NICHT IM SELEKTOR (§4.1, fuenfte Bauregel): `_lib/lage.ts`
 * liefert DATEN, keine Saetze — `art`, Zeilen und Zahlen, nie einen formatierten Text. Zwei Gruende,
 * beide belegbar: die Zonenueberschriften stuenden sonst in drei Einstiegen dreimal (heute genau
 * der Zustand), und der Quelltext-Scan aus §6.6 muss EIN Ziel haben. Stuende die
 * Ueberfaellig-Prosa im Selektor, haette der Scan zwei Ausnahmen statt einer und fange die vierte
 * Fassung nicht mehr.
 *
 * ES SIND DESHALB GENAU ZWEI ERLAUBTE ORTE FUER DAS WORT „ueberfaellig" IM GANZEN MODUL:
 * `_ui/Frist.tsx` rendert die FORM, diese Datei haelt die TEXTE. `_ui/Frist.test.tsx` riegelt das
 * ueber `.ts` UND `.tsx` ab.
 */

/**
 * DIE EINE WORTQUELLE FUER DRINGLICHKEIT (§6.2, §6.3 Kanal 1) — drei Auspraegungen, sonst nichts.
 *
 * „UEBERFAELLIG" TRAEGT IMMER DIE ZAHL. Nie ein nacktes „Überfällig" (das sagt nicht, ob es gestern
 * oder im Mai war), nie ein kleingeschriebenes Suffix hinter einem Datum, nie nur ein Datum. Die
 * Zahl ist der einzige Kanal, der auch in einer Screenreader-Ausgabe die SCHWERE traegt — Farbe und
 * Kante tun es nicht.
 *
 * DIE SINGULARGRENZE STEHT HIER UND NUR HIER: „seit 1 Tag" gegen „seit 2 Tagen". An sechs
 * Aufrufstellen (§6.2) waere sie an einer davon vergessen.
 */
export const FRIST_TEXT = {
  ueberfaellig: (tage: number): string => `Überfällig seit ${tage} ${tage === 1 ? "Tag" : "Tagen"}`,
  heute: "Frist heute",
  frist: (tagKurz: string): string => `Frist: ${tagKurz}`,
} as const;

/**
 * ÜBERGANGSTEXTE DER HEUTIGEN KPI-ZEILE — SIE STERBEN MIT §11.4 SCHRITT 4/5.
 *
 * WARUM SIE UEBERHAUPT HIER STEHEN: der Quelltext-Scan aus §6.6 laesst das Wort „ueberfaellig" nur
 * in `_ui/Frist.tsx` und in DIESER Datei zu. `_ui/EinstiegKoordination.tsx` traegt es heute an drei
 * Stellen (KPI-Kachel, Abschnittsueberschrift, Leertext), und der Einstieg wird erst in Schritt 4
 * umgebaut — genau das ist der Grund, aus dem §11.4 den Scan (Schritt 2) NACH die Beschriftung
 * (Schritt 1) legt. Bis dahin liest der Einstieg seine drei Zeichenketten von hier.
 *
 * BEWUSST EIN EIGENER EXPORT UND NICHT DREI FELDER IN `FRIST_TEXT`: `FRIST_TEXT` ist eine
 * dauerhafte Zusage, an der die Fuehrungskarte und fuenf weitere Aufrufstellen haengen. Drei
 * Uebergangstexte darin waeren nach zwei Umbauten nicht mehr von ihr zu unterscheiden, und
 * niemand koennte sagen, welche Haelfte noch traegt.
 *
 * DIE MITTLERE UND DIE UNTERE ZEICHENKETTE SIND ZEICHENGLEICH ZU HEUTE —
 * `EinstiegKoordination.test.tsx:221` prueft den Leertext woertlich.
 */
export const UEBERGANG_KOORDINATION_TEXT = {
  kachelUeberfaellig: "Überfällig",
  abschnittUeberfaellig: "Überfällige Aufgaben",
  leerUeberfaellig: "Keine überfälligen Aufgaben",
} as const;

/**
 * DIE ANLAESSE DER DREI RANGLEITERN (§3.5, §4.2) — die Schluesselmenge der Beschriftungstabelle.
 *
 * DER TYP STEHT HIER UND NICHT IN `_lib/lage.ts`, obwohl der Selektor ihn erzeugt: `ANLASS_TEXT`
 * ist ein `Record<AnlassArt, …>` und muesste sonst aus `lage.ts` importieren — und `lage.ts`
 * importiert `_lib/zugang.ts` und damit `@/core/auth`. Diese Datei wird von zwei Client-Inseln
 * gelesen (`_ui/FreigabeZone.tsx`, `_ui/VerteilenDialog.tsx`); ein Import in die Gegenrichtung
 * zoege next-auth ins Client-Bundle, sobald jemand `import type` versehentlich zu `import` macht.
 * Der Schluessel gehoert ohnehin zur Beschriftungstabelle: er IST ihre Zeilenmenge.
 *
 * `koordRuhe`/`bufdiRuhe`/`auftragRuhe` SIND ANLAESSE OHNE ZEILEN (§3.4, R1: „Ist die Liste leer,
 * zeigt sie die Belegung Ruhe"). `koordNegativ`/`bufdiNegativ`/`auftragNegativ` ebenso — sie sind
 * der Satz der Zeile „ALS NAECHSTES", wenn die Restmenge leer ist, und ein eigener Schluessel statt
 * eines dritten Typzustands, damit `alsNaechstes` ein `Anlass | null` bleibt und nicht Struktur mit
 * String mischt (§4.1, §12.4).
 */
export const ANLASS_ARTEN = [
  "koordOhneTraeger",
  "koordPosteingangUeberfaellig",
  "koordPosteingang",
  "koordFreigabeOffen",
  "koordUeberfaelligVerteilt",
  "koordUeberfaelligInArbeit",
  "koordZurueckgewiesen",
  "koordRuhe",
  "koordNegativ",
  "bufdiUeberfaellig",
  "bufdiZurueckgewiesen",
  "bufdiInArbeit",
  "bufdiKeinArbeitstag",
  "bufdiHeuteOffen",
  "bufdiWartetAufEinplanung",
  "bufdiRuhe",
  "bufdiNegativ",
  "auftragFreigabe",
  "auftragUeberfaellig",
  "auftragUnverteilt",
  "auftragRuhe",
  "auftragNegativ",
] as const;

export type AnlassArt = (typeof ANLASS_ARTEN)[number];

/**
 * VIER ANGABEN JE ANLASS (§3.5) — plus die DOM-Id als fuenfte, weil §3.5 sie in der Spalte
 * „Zonenueberschrift" mitfuehrt (`id="posteingang"`, `id="freigabe"`) und eine magische
 * Zeichenkette in der aufrufenden Komponente ein zweiter Ort fuer dieselbe Zusage waere (§3.2:
 * die Ids behalten ihre Schreibweise, nur nicht ihre garantierte Anwesenheit).
 */
export interface AnlassText {
  /**
   * DER KICKER IN DER FUEHRUNGSKARTE, Versalien (§3.4). `null` heisst: dieser Anlass ist NIE die
   * Karte — das gilt genau fuer die drei Negativsaetze.
   *
   * ALS FUNKTION UEBER EINEM NAMEN, obwohl nur EIN Eintrag ihn benutzt: §3.5 schreibt fuer
   * `bufdiZurueckgewiesen` „ZURÜCKGEWIESEN VON <Prüfer>" aus. Die Alternative waere gewesen, den
   * Kicker als „ZURÜCKGEWIESEN VON" abzulegen und den Namen in der Komponente anzuhaengen — dann
   * stuende eine Haelfte der Prosa hier und die andere dort, und die Regel „die Beschriftung liegt
   * in `anzeige.ts`" waere fuer genau eine Zeile aufgehoben. Jeder andere Eintrag ignoriert das
   * Argument.
   */
  kicker: ((name: string | null) => string) | null;
  /**
   * DIE ZONENUEBERSCHRIFT (Ebene 4) mit ihrer Zahl. `null` heisst: dieser Anlass bildet NIE eine
   * Zone — entweder weil er kein Bestand ist (`bufdiKeinArbeitstag`, die Ruhe- und Negativsaetze)
   * oder weil er nach §3.4 R3 bereits vollstaendig auf der Flaeche der Rolle steht.
   */
  zone: ((anzahl: number) => string) | null;
  /** Die DOM-Id der Zone, wo §3.5 eine nennt — sonst `null`. */
  zonenId: string | null;
  /**
   * DAS DECKELZIEL AM FUSS DER ZONE (Regel D). `null` heisst: die Zone ist UNGEDECKELT und
   * vollstaendig, weil es kein Sammelziel gibt — §3.1 verbietet ausdruecklich, fuer „ueberfaellig"
   * oder „zurueckgewiesen" eine Route zu erfinden, und ein Deckel ohne Ausgang machte ab der
   * sechsten Zeile Aufgaben nur noch ueber `/a/<id>` erreichbar (§9/S1).
   *
   * ALS FUNKTION UEBER DER EIGENEN PERSON-ID, weil `bufdiWartetAufEinplanung` auf
   * `/plan/<eigene>` zeigt. Jeder andere Eintrag ignoriert das Argument.
   *
   * `koordFreigabeOffen` GILT NUR BEI `darfFreigabenSehen(akteur, heute)` — die Bedingung steht
   * beim Aufrufer, nicht hier: ein Auftraggeber ohne Koordination bekommt auf `/freigaben` 404
   * (`zugang.ts:534-536`), und ein Deckel dorthin waere ein Knopf auf eine 404-Seite.
   */
  deckelziel: ((eigenePersonId: string) => string) | null;
  /**
   * DER FESTE SATZ, wo §4.2 einen ohne jede Datenabhaengigkeit ausschreibt — die drei Ruhe- und die
   * drei Negativsaetze. `null` bei jedem Anlass, dessen Satz Titel, Namen, Zahlen oder Daten
   * traegt: diese Saetze stehen in §4.2, Spalte „Die Karte zeigt", und werden mit der
   * Fuehrungskarte gebaut (§11.4 Schritt 4).
   *
   * BEWUSST KEIN VORGEBAUTER KONTEXT-TYP: in den Schritten 1 bis 3 gibt es keinen einzigen
   * Aufrufer, an dem sich eine geratene Feldliste pruefen liesse. Eine Signatur ohne Aufrufer ist
   * eine Zusage, die der naechste Bauschritt entweder umbaut oder falsch bedient.
   */
  satz: string | null;
}

/** Ein fester Kicker, der sein Namensargument nicht braucht — die Regel, nicht die Ausnahme. */
const kicker = (text: string) => (): string => text;

export const ANLASS_TEXT: Record<AnlassArt, AnlassText> = {
  // ─── Koordination (§4.2, Rang 1–6) ────────────────────────────────────────────────────────────
  koordOhneTraeger: {
    kicker: kicker("ZUGEWIESEN AN EINE NICHT MEHR AKTIVE PERSON"),
    zone: (n) => `Ohne aktiven Träger (${n})`,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  koordPosteingangUeberfaellig: {
    kicker: kicker("POSTEINGANG · ÜBERFÄLLIG"),
    zone: (n) => `Überfällig im Posteingang (${n})`,
    zonenId: null,
    deckelziel: () => "/verteilen",
    satz: null,
  },
  koordPosteingang: {
    kicker: kicker("POSTEINGANG · NOCH NIEMANDEM ZUGEWIESEN"),
    zone: (n) => `Zu verteilen (${n})`,
    zonenId: "posteingang",
    deckelziel: () => "/verteilen",
    satz: null,
  },
  koordFreigabeOffen: {
    kicker: kicker("WARTET AUF FREIGABE"),
    zone: (n) => `Freigabe offen (${n})`,
    zonenId: "freigabe",
    deckelziel: () => "/freigaben",
    satz: null,
  },
  koordUeberfaelligVerteilt: {
    kicker: kicker("ÜBERFÄLLIG · NOCH NICHT BEGONNEN"),
    zone: (n) => `Überfällig, noch nicht begonnen (${n})`,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  koordUeberfaelligInArbeit: {
    kicker: kicker("ÜBERFÄLLIG · IN BEARBEITUNG"),
    zone: (n) => `Überfällig, in Bearbeitung (${n})`,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  koordZurueckgewiesen: {
    kicker: kicker("ZURÜCKGEWIESEN"),
    zone: (n) => `Zurückgewiesen (${n})`,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  koordRuhe: {
    kicker: kicker("NICHTS LIEGT AN"),
    zone: null,
    zonenId: null,
    deckelziel: null,
    satz: "Nichts liegt an: Posteingang leer, keine Freigabe offen, nichts überfällig.",
  },
  koordNegativ: { kicker: null, zone: null, zonenId: null, deckelziel: null, satz: "Sonst liegt nichts an." },

  // ─── BuFDi (§4.2, Rang 1–6) ───────────────────────────────────────────────────────────────────
  bufdiUeberfaellig: {
    kicker: kicker("ÜBERFÄLLIG"),
    zone: (n) => `Überfällig (${n})`,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  bufdiZurueckgewiesen: {
    // DER EINE EINTRAG, DER SEIN ARGUMENT BRAUCHT (§3.5): „ZURÜCKGEWIESEN VON <Prüfer>".
    kicker: (name) => (name === null ? "ZURÜCKGEWIESEN" : `ZURÜCKGEWIESEN VON ${name.toUpperCase()}`),
    zone: (n) => `Zurückgewiesen (${n})`,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  // Rang 3 und 5 bilden KEINE Zone: sie stehen vollstaendig in der Wochenachse (§3.4,
  // R3-Ausnahmetabelle) — und diese Aussage haengt an Regel V, die die terminlose Zeile ueber
  // `ohnePlatzInDerAchse` in der Fusszeile der Achse faengt.
  bufdiInArbeit: { kicker: kicker("IN BEARBEITUNG"), zone: null, zonenId: null, deckelziel: null, satz: null },
  // Rang 4 ist KEIN Bestand, sondern eine Aussage ueber den Tag — es gibt nichts zu listen.
  bufdiKeinArbeitstag: { kicker: kicker("WOCHENENDE"), zone: null, zonenId: null, deckelziel: null, satz: null },
  bufdiHeuteOffen: { kicker: kicker("HEUTE"), zone: null, zonenId: null, deckelziel: null, satz: null },
  bufdiWartetAufEinplanung: {
    kicker: kicker("EINZUPLANEN"),
    zone: (n) => `Einzuplanen (${n})`,
    zonenId: "posteingang",
    deckelziel: (eigenePersonId) => `/plan/${eigenePersonId}`,
    satz: null,
  },
  bufdiRuhe: {
    kicker: kicker("NICHTS MEHR OFFEN"),
    zone: null,
    zonenId: null,
    deckelziel: null,
    // Der Zusatz („Morgen: <Titel> · <Dauer>." bzw. „Diese Woche ist alles eingeplant.") haengt an
    // Daten und entsteht mit der Fuehrungskarte — §4.2, Ruhe-Zeile der BuFDi-Leiter.
    satz: "Für heute ist nichts mehr offen.",
  },
  bufdiNegativ: {
    kicker: null,
    zone: null,
    zonenId: null,
    deckelziel: null,
    satz: "Sonst ist für heute nichts offen.",
  },

  // ─── Auftraggeber (§4.2, Rang 1–3) ────────────────────────────────────────────────────────────
  // KEINE ZONE FUER DIESE ROLLE: „Eigene Auftraege" zeigt JEDE eigene Zeile, ungedeckelt (Regel D)
  // — jede Zone waere eine wortwoertliche Wiederholung zwei Bildschirmzentimeter tiefer. Ebene 4
  // des Aufbaus existiert fuer den Auftraggeber nicht (§3.4, R3-Ausnahmetabelle).
  auftragFreigabe: {
    kicker: kicker("WARTET AUF DEINE FREIGABE"),
    zone: null,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  auftragUeberfaellig: { kicker: kicker("ÜBERFÄLLIG"), zone: null, zonenId: null, deckelziel: null, satz: null },
  auftragUnverteilt: {
    kicker: kicker("NOCH NICHT VERTEILT"),
    zone: null,
    zonenId: null,
    deckelziel: null,
    satz: null,
  },
  auftragRuhe: {
    kicker: kicker("ALLES LÄUFT"),
    zone: null,
    zonenId: null,
    deckelziel: null,
    satz: "Alle deine Aufträge laufen, nichts wartet auf dich.",
  },
  auftragNegativ: {
    kicker: null,
    zone: null,
    zonenId: null,
    deckelziel: null,
    satz: "Nichts wartet auf deine Freigabe.",
  },
};

/**
 * WELCHE VERLAUFSZEILE DIE FUEHRUNGSKARTE JE ANLASS BRAUCHT (§4.2) — die Zuordnung steht bei der
 * Beschriftung, weil sie zur Darstellung gehoert; der Datenbankzugriff bleibt beim Aufrufer
 * (`letztesEreignis`, `_db/queries.ts`), denn diese Datei sieht kein `db`.
 *
 * Zwei Faelle: die Begruendung einer Zurueckweisung WOERTLICH (Koordination Rang 6, BuFDi Rang 2 —
 * „das ist der ganze Wert einer Zurueckweisung") und „seit <Tag> in Bearbeitung" (BuFDi Rang 3).
 * Beides steht ausschliesslich im Verlauf, nie auf der Aufgabenzeile.
 */
export const FUEHRUNG_EREIGNIS: Partial<Record<AnlassArt, Ereignis>> = {
  koordZurueckgewiesen: "zurueckgewiesen",
  bufdiZurueckgewiesen: "zurueckgewiesen",
  bufdiInArbeit: "gestartet",
};

/**
 * DIE SAETZE DES KARTENKOERPERS UND DER ZEILE „ALS NAECHSTES" (§4.2, Spalte „Die Karte zeigt").
 *
 * WARUM SIE HIER STEHEN UND NICHT IN `_ui/Fuehrungskarte.tsx`: fuenf dieser Saetze tragen das Wort
 * „ueberfaellig", und der Quelltext-Scan aus §6.6 laesst es im ganzen Modul nur in `_ui/Frist.tsx`
 * und in dieser Datei zu. Eine Karte, die ihre Prosa selbst formulierte, waere am ersten Tag rot —
 * und zwar zu Recht: dann gaebe es wieder zwei Orte, an denen dieselbe Dringlichkeit
 * unterschiedlich klingt, und genau das ist Befund (2).
 *
 * DAS VIERTE FELD VON `ANLASS_TEXT` BLEIBT DAVON UNBERUEHRT. `ANLASS_TEXT[art].satz` traegt die
 * SECHS Saetze ohne jede Datenabhaengigkeit (die drei Ruhe- und die drei Negativsaetze); alles
 * darunter braucht Titel, Namen, Zahlen oder Daten und steht hier. Zwei Records statt eines
 * siebten Feldes, weil ein `satz: string | ((d) => string) | null` an jeder Aufrufstelle eine
 * Fallunterscheidung erzwungen haette, die genau nichts entscheidet.
 */
export interface SatzDaten {
  /** Wie viele Zeilen der Anlass traegt. */
  anzahl: number;
  /** Die fuehrende Zeile (`zeilen[0]`) — Leerstring, wenn der Anlass keinen Bestand hat. */
  titel: string;
  dauerMinuten: number;
  status: Status;
  /**
   * TAGE SEIT DER FRIST der fuehrenden Zeile, 0 solange sie laeuft. Das ist NICHT die Liegezeit —
   * die beiden Zahlen fallen fast nie zusammen, und ein Satz, der die eine nennt und die andere
   * meint, ist nicht sichtbar kaputt, sondern nur falsch.
   */
  tageSeitFrist: number;
  /**
   * TAGE SEIT `erstelltAm` der fuehrenden Zeile. Sie erscheint erst AB EINEM VOLLEN TAG (§5): der
   * Seed legt Aufgabe und Verlauf im selben Durchlauf an, jede Liegezeit dort ist also null, und
   * „seit 0 Tagen" waere in einer frisch geseedeten Umgebung schlicht falsch. Die Saetze unten
   * lassen den Zusatz bei 0 deshalb WEG, statt eine Null zu schreiben.
   */
  tageLiegezeit: number;
  /** Ein aufgeloester Name — je Anlass Traeger, Auftraggeber oder Pruefer. */
  name: string;
  /** Ein fertig formatierter Kalendertag (`fmtTagKurz`), ggf. mit Uhrzeit. Leerstring: keiner. */
  tag: string;
  /** Die Frist der fuehrenden Zeile, wortgleich zu dem, was `<Frist>` zeigt. */
  fristText: string;
  /** Wie viele der gezaehlten Zeilen in Vertretung gepruefte Freigaben sind. */
  vertretung: number;
}

export interface KartenText {
  /** n = 1 — der Satz des Kartenkoerpers. `null`: die Karte zeigt Titel, Chips und `<Frist>`. */
  einzeln: ((d: SatzDaten) => string) | null;
  /** n > 1 — die Zahl und das Extrem. KEINE Aufgabe wird herausgegriffen (§4.3). */
  mehrere: ((d: SatzDaten) => string) | null;
  /** Die Zeile „ALS NAECHSTES" — ein Satz, kein Knopf (§4.2). */
  naechstes: ((d: SatzDaten) => string) | null;
}

/** „1 Tag" gegen „2 Tagen" — die Singulargrenze steht hier und nicht an sechs Aufrufstellen. */
function tage(n: number): string {
  return `${n} ${n === 1 ? "Tag" : "Tagen"}`;
}

/** „1 Aufgabe" gegen „2 Aufgaben". */
function aufgabenZahl(n: number): string {
  return `${n} ${n === 1 ? "Aufgabe" : "Aufgaben"}`;
}

/**
 * DER WOCHENENDSATZ HAT GENAU EINEN ORT — UND ES SIND NICHT ZWEI (§4.2). Er steht im
 * KARTENKOERPER, wenn `bufdiKeinArbeitstag` fuehrt (Rang 4), und in der ALS-NAECHSTES-ZEILE, wenn
 * er `anlaesse[1]` ist (der Sonntagsfall aus §5.4). Dieselbe Funktion in beiden Feldern, nicht
 * zwei Fassungen, die auseinanderlaufen koennen.
 */
// KEIN SCHLUSSPUNKT NACH `d.tag`: `fmtTagKurz` LIEFERT IHN SCHON MIT („Mo, 24.08."). Ein zweiter
// ergaebe „24.08..", und keine Typpruefung sieht das — nur ein Test, der den Satz WOERTLICH
// vergleicht. Dasselbe gilt unten fuer jeden Satz, der auf einem Datum endet.
const wochenende = (d: SatzDaten): string => `Wochenende. Nächster Arbeitstag: ${d.tag}`;

const OHNE_SATZ: KartenText = { einzeln: null, mehrere: null, naechstes: null };

export const KARTEN_TEXT: Record<AnlassArt, KartenText> = {
  // ─── Koordination ─────────────────────────────────────────────────────────────────────────────
  koordOhneTraeger: {
    einzeln: (d) => `Zugewiesen an ${d.name}, die nicht mehr aktiv ist.`,
    mehrere: (d) => `${d.anzahl} Aufgaben liegen bei Personen, die nicht mehr aktiv sind.`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "liegt" : "liegen"} bei einer Person, die nicht mehr aktiv ist.`,
  },
  koordPosteingangUeberfaellig: {
    einzeln: (d) => `Von ${d.name} · noch niemandem zugewiesen.`,
    mehrere: (d) =>
      `${d.anzahl} Aufgaben sind überfällig und noch niemandem zugewiesen — die älteste seit ${tage(d.tageSeitFrist)}.`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} im Posteingang ${d.anzahl === 1 ? "ist" : "sind"} überfällig.`,
  },
  koordPosteingang: {
    einzeln: (d) => `Von ${d.name} · noch niemandem zugewiesen.`,
    mehrere: (d) =>
      `${d.anzahl} Aufgaben warten auf Verteilung${d.tageLiegezeit > 0 ? ` — die älteste liegt seit ${tage(d.tageLiegezeit)}` : ""}.`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "wartet" : "warten"} auf Verteilung.`,
  },
  koordFreigabeOffen: {
    einzeln: (d) => `${d.name} hat „${d.titel}“ fertig gemeldet.`,
    mehrere: (d) =>
      `${d.anzahl} Aufgaben warten auf Freigabe${d.vertretung > 0 ? ` (${d.vertretung} in Vertretung)` : ""}.`,
    // DER KLAMMERZUSATZ OHNE ZAHL, WENN ALLE in Vertretung sind — dieselbe Regel wie in der
    // Kontextzeile (§3.5): er ist eine PRAEZISIERUNG derselben Zahl, keine zweite.
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "wartet" : "warten"} auf deine Freigabe${
        d.vertretung === d.anzahl && d.vertretung > 0
          ? " (in Vertretung)"
          : d.vertretung > 0
            ? ` (${d.vertretung} in Vertretung)`
            : ""
      }.`,
  },
  koordUeberfaelligVerteilt: {
    einzeln: (d) => `Bei ${d.name}, ${STATUS_TEXT[d.status]}.`,
    mehrere: (d) => `${d.anzahl} Aufgaben sind überfällig.`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "ist" : "sind"} überfällig und noch nicht begonnen.`,
  },
  koordUeberfaelligInArbeit: {
    einzeln: (d) => `Bei ${d.name}, ${STATUS_TEXT[d.status]}.`,
    mehrere: (d) => `${d.anzahl} Aufgaben sind überfällig.`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "ist" : "sind"} überfällig und in Bearbeitung.`,
  },
  koordZurueckgewiesen: {
    einzeln: (d) =>
      `Bei ${d.name}${d.tageLiegezeit > 0 ? ` seit ${tage(d.tageLiegezeit)}` : ""}.`,
    mehrere: (d) => `${d.anzahl} Aufgaben wurden zurückgewiesen.`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "wurde" : "wurden"} zurückgewiesen.`,
  },
  koordRuhe: OHNE_SATZ,
  koordNegativ: OHNE_SATZ,

  // ─── BuFDi ────────────────────────────────────────────────────────────────────────────────────
  bufdiUeberfaellig: {
    einzeln: null,
    mehrere: (d) => `${d.anzahl} Aufgaben sind überfällig — die älteste seit ${tage(d.tageSeitFrist)}.`,
    naechstes: (d) => `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "ist" : "sind"} überfällig.`,
  },
  bufdiZurueckgewiesen: {
    einzeln: (d) =>
      d.tag === "" ? `Zurückgewiesen von ${d.name}.` : `Zurückgewiesen von ${d.name} am ${d.tag}`,
    mehrere: (d) => `${d.anzahl} Aufgaben kamen zurück.`,
    naechstes: (d) => `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "kam" : "kamen"} zurück.`,
  },
  bufdiInArbeit: {
    einzeln: (d) => (d.tag === "" ? "In Bearbeitung." : `Seit ${d.tag} in Bearbeitung.`),
    mehrere: (d) => `${d.anzahl} Aufgaben sind in Bearbeitung.`,
    naechstes: (d) =>
      d.anzahl === 1
        ? `In Bearbeitung: ${d.titel} · ${fmtDauer(d.dauerMinuten)}`
        : `${d.anzahl} Aufgaben sind in Bearbeitung.`,
  },
  bufdiKeinArbeitstag: { einzeln: wochenende, mehrere: null, naechstes: wochenende },
  bufdiHeuteOffen: {
    einzeln: (d) => `Als Nächstes heute: ${d.titel}`,
    mehrere: (d) => `${d.anzahl} Aufgaben stehen heute an.`,
    naechstes: (d) =>
      d.anzahl === 1
        ? `Heute: ${d.titel} · ${fmtDauer(d.dauerMinuten)} · ${d.fristText}`
        : `${d.anzahl} Aufgaben stehen heute an.`,
  },
  bufdiWartetAufEinplanung: {
    // LEERSTRING HEISST „KEIN SATZ" (nicht „leerer Satz"): ohne Zeitvorschlag gibt es nichts
    // anzunehmen, und die Karte zeigt dann Titel, Frist und Dauer — §4.2, Rang 6, „n=1 ohne".
    einzeln: (d) => (d.tag === "" ? "" : `${d.name} schlägt ${d.tag} vor für „${d.titel}“.`),
    mehrere: (d) => `${d.anzahl} Aufgaben warten auf einen Termin — die früheste Frist ist ${d.tag}`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "wartet" : "warten"} auf einen Termin.`,
  },
  bufdiRuhe: OHNE_SATZ,
  bufdiNegativ: OHNE_SATZ,

  // ─── Auftraggeber ─────────────────────────────────────────────────────────────────────────────
  auftragFreigabe: {
    einzeln: (d) => `${d.name} hat „${d.titel}“ fertig gemeldet.`,
    mehrere: (d) => `${d.anzahl} Aufgaben warten auf deine Freigabe.`,
    naechstes: (d) =>
      `${aufgabenZahl(d.anzahl)} ${d.anzahl === 1 ? "wartet" : "warten"} auf deine Freigabe.`,
  },
  auftragUeberfaellig: {
    einzeln: (d) => `Bei ${d.name}, ${STATUS_TEXT[d.status]}.`,
    mehrere: (d) => `${d.anzahl} deiner Aufträge sind überfällig.`,
    naechstes: (d) => `${d.anzahl} deiner Aufträge ${d.anzahl === 1 ? "ist" : "sind"} überfällig.`,
  },
  auftragUnverteilt: {
    // KEIN WORT UND KEIN `href` MIT DEM TEILSTRING `verteilen` ALS LINK (§5.3, e2e `:363`) — „noch
    // nicht verteilt" ist TEXT, nie ein Weg. Das ist die andere Haelfte der Kernzusage aus
    // Modulspec §8.3, und e2e sucht aktiv danach.
    einzeln: () => "Noch niemandem zugewiesen.",
    mehrere: (d) => `${d.anzahl} deiner Aufträge sind noch nicht verteilt.`,
    naechstes: (d) =>
      `${d.anzahl} deiner Aufträge ${d.anzahl === 1 ? "ist" : "sind"} noch nicht verteilt.`,
  },
  auftragRuhe: OHNE_SATZ,
  auftragNegativ: OHNE_SATZ,
};

/**
 * EINE KENNZAHL DER KONTEXTZEILE (§3.5) — die Null als WORT, nie als Ziffer.
 *
 * Die Zusage aus §1.4 ist, dass die Kennzahl DASTEHT, nicht dass sie eine Ziffer traegt: eine
 * Reihe aus „0 X · 0 Y · 0 Z" liest sich als Defekt statt als Entwarnung. Genau dafuer hatte die
 * Modulspec die stehenbleibende 0-Kachel erfunden; das Wort ersetzt sie.
 */
function kennzahl(n: number, text: string): string {
  return n === 0 ? `nichts ${text}` : `${n} ${text}`;
}

/**
 * DIE KONTEXTZEILE JE ROLLE (§3.5) — Formatvorlage, Reihenfolge und Trennzeichen an EINER Stelle.
 *
 * SIE STEHT HIER UND NICHT IM SELEKTOR, obwohl `lage()` sie zurueckgibt: `SeitenKopf` WIRFT bei
 * leerem `kontext`, die Zeile ist also Pflicht, und sie traegt die Zahlen der gestrichenen
 * KPI-Kacheln (§1.4). Waere sie in `_lib/lage.ts` gebaut, stuende das Wort „überfällig" in einer
 * dritten Datei — und der Quelltext-Scan aus §6.6 haette drei Ausnahmen statt zwei. Der Selektor
 * liefert die ZAHLEN, diese Datei die Saetze; genau die Aufteilung, die §4.1 als fuenfte Bauregel
 * ausschreibt.
 */
export const KONTEXT_TEXT = {
  koordination: (z: {
    zuVerteilen: number;
    freigabe: number;
    /**
     * Wahr, wenn ALLE gezaehlten Freigaben in Vertretung sind. Der Klammerzusatz ist eine
     * PRAEZISIERUNG derselben Zahl, keine zweite — bei gemischter Lage bliebe offen, worauf er
     * sich bezieht, deshalb tritt er dort nicht hinzu.
     */
    nurVertretung: boolean;
    ueberfaellig: number;
    zurueckgewiesen: number;
  }): string =>
    [
      kennzahl(z.zuVerteilen, "zu verteilen"),
      z.freigabe === 0
        ? "nichts wartet auf Freigabe"
        : // `wartet`/`warten` — dieselbe Beugung, die `EinstiegAuftrag.tsx` schon fuehrt; §3.5s
          // Formatvorlage zeigt den Singularfall.
          `${z.freigabe} wartet${z.freigabe === 1 ? "" : "en"} auf Freigabe${z.nurVertretung ? " (in Vertretung)" : ""}`,
      kennzahl(z.ueberfaellig, "überfällig"),
      kennzahl(z.zurueckgewiesen, "zurückgewiesen"),
    ].join(" · "),

  bufdi: (z: {
    kw: number;
    /** Die gezeigte Woche liegt ganz in der Vergangenheit — der Wochenendfall aus §5.4. */
    abgeschlosseneWoche: boolean;
    eingeplant: number;
    verplantMinuten: number;
    sollMinuten: number;
    imPosteingang: number;
    ueberfaellig: number;
  }): string =>
    [
      `KW ${z.kw}${z.abgeschlosseneWoche ? " (abgeschlossen)" : ""}`,
      z.eingeplant === 0
        ? "nichts eingeplant"
        : `${z.eingeplant} ${z.eingeplant === 1 ? "Aufgabe" : "Aufgaben"} eingeplant`,
      `${fmtStunden(z.verplantMinuten)} von ${fmtStunden(z.sollMinuten)} Std.`,
      kennzahl(z.imPosteingang, "im Posteingang"),
      kennzahl(z.ueberfaellig, "überfällig"),
    ].join(" · "),

  auftrag: (z: { gesamt: number; offen: number; unverteilt: number; freigabe: number }): string =>
    [
      // „nichts Auftraege" WAERE KEIN DEUTSCH — die Regel aus §3.5 lautet „die Null als Wort, nie
      // als Ziffer", nicht „immer dasselbe Wort". Bei einem zaehlbaren Hauptwort ist es „keine".
      z.gesamt === 0 ? "keine Aufträge" : `${z.gesamt} ${z.gesamt === 1 ? "Auftrag" : "Aufträge"}`,
      kennzahl(z.offen, "offen"),
      kennzahl(z.unverteilt, "unverteilt"),
      z.freigabe === 0
        ? "nichts wartet auf deine Freigabe"
        : `${z.freigabe} wartet${z.freigabe === 1 ? "" : "en"} auf deine Freigabe`,
    ].join(" · "),
} as const;
