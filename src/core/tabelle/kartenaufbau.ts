/**
 * WIE AUS SPALTEN EINE KARTE WIRD — als reine Funktion (DRK-451).
 *
 * ⚠️ WARUM ABGELEITET UND NICHT JE TABELLE GESCHRIEBEN. DRK-421 hat die
 * Kartendarstellung gebaut und an zwei Tabellen angewandt; im Repo stehen rund
 * fünfzig. Der Grund, warum es bei zwei blieb, steht dort im Quelltext: die
 * zweite Anwendung kostete eine eigene Kartenkomponente samt CSS-Modul, zwei
 * Leertexte, eine Filterleiste und `filteredValue` an jeder Spalte — rund 150
 * Zeilen. Fünfzigmal abgeschrieben ist das weder zu bauen noch zu halten, und
 * jede Abschrift kann eine Spalte vergessen, ohne dass ein Tor rot wird.
 *
 * Die Beobachtung, die das auflöst: eine Spalte trägt beides schon. Ihr `title`
 * IST die Beschriftung, die eine Karte braucht (in der Tabelle steht sie im
 * Spaltenkopf), und ihr `render` IST der Wert. Was in der Tabelle nebeneinander
 * steht, steht in der Karte untereinander — mehr ist eine Karte nicht.
 *
 * ⚠️ WAS DIE ABLEITUNG NICHT KANN, UND DESHALB DER WUNSCH DANEBEN: sie weiß
 * nicht, WELCHE Spalte den Datensatz benennt. „Artikel" ist eine Überschrift,
 * „Fach" ist ein Merkmal, und beide sehen für eine Rechnung gleich aus.
 * Gemessen an den 45 Tabellen dieser Suite ist die erste Spalte in 40 Fällen
 * die benennende (Name, Titel, Gerät, Datei, Artikel, Flasche, Code …) — das
 * ist die Vorgabe. Die fünf Ausnahmen sind Protokolle, deren erste Spalte die
 * ZEIT trägt; sie nennen ihre Titelspalte ausdrücklich.
 *
 * KEIN "use client" (Falle 6). Diese Datei ist der prüfbare Teil: `Spaltenkarte`
 * rendert nur noch, was hier entschieden wurde, und das ist in Vitest zu prüfen,
 * ohne irgendetwas zu rendern — dieselbe Aufteilung wie `masse.ts` gegenüber
 * `Datentabelle.tsx`.
 */

import { isValidElement, type Key, type ReactNode } from "react";
import { blattSpalten, spaltenSchluessel, type AnzeigeSpalte } from "./angezeigt";

/**
 * Was von einer Spalte für die Karte zählt — antds `ColumnType` in den drei
 * Feldern, die hier gelesen werden, plus allem, was `angezeigt.ts` braucht.
 *
 * ⚠️ DIE TYPEN SIND ABSICHTLICH WEIT (`unknown`, `ReactNode`). Der ganze Zweck
 * ist, dass der Aufrufer seine `columns` UNVERÄNDERT hereinreicht; jede engere
 * Angabe machte eine echte antd-Spaltenliste unzuweisbar. Dieselbe Begründung
 * wie bei `AnzeigeSpalte` in `angezeigt.ts`, wo sie ausführlich steht.
 */
export type KartenSpalte<T> = Omit<AnzeigeSpalte<T>, "children"> & {
  title?: unknown;
  render?: (wert: never, zeile: T, index: number) => unknown;
  /**
   * ⚠️ `Omit<…, "children">` OBEN IST DER GRUND, DASS DAS HIER ÜBERHAUPT GEHT.
   * Stünde `children` in BEIDEN Hälften der Schnittmenge, wäre sein Typ
   * `readonly AnzeigeSpalte<T>[] & readonly KartenSpalte<T>[]` — und gegen eine
   * Schnittmenge prüft TypeScript überschüssige Eigenschaften je Hälfte
   * einzeln. Eine gruppierte Spalte mit `title` fiele dann durch, weil
   * `AnzeigeSpalte` kein `title` kennt: „Object literal may only specify known
   * properties". Gemessen an `kartenaufbau.test.ts`, dem Fall mit dem
   * gruppierten Spaltenkopf.
   */
  children?: readonly KartenSpalte<T>[];
};

/**
 * Die Rolle einer Spalte auf der Karte. Alles, was nicht genannt wird, ist ein
 * `merkmal` — die Vorgabe ist die häufigste Rolle, nicht die seltenste.
 */
export type Kartenwunsch = {
  /**
   * Der Spaltenschlüssel, dessen Inhalt als Überschrift steht. Ohne Angabe die
   * erste Spalte, die nicht ausgeblendet ist und keine Handlungsspalte ist.
   */
  titel?: string;
  /**
   * Spalten, die OBEN NEBEN DEM TITEL stehen statt in der Merkmalsliste —
   * Status, Ampel, eine Menge. Ohne Beschriftung, weil sie sich selbst
   * erklären (ein `Tag`, ein `Chip`, eine Zahl mit Einheit).
   */
  kennzeichen?: readonly string[];
  /**
   * Die Handlungsspalte. Sie steht unten über die volle Breite. Ohne Angabe
   * die Spalte, deren Titel „Aktion" oder „Aktionen" lautet — mehr Raten wäre
   * eine Vermutung über fremde Wörter.
   */
  aktionen?: string;
  /**
   * Spalten, die auf 390px nicht gebraucht werden. ⚠️ WEGLASSEN IST DIE
   * EIGENTLICHE ENTSCHEIDUNG EINER KARTE: acht Spalten untereinander sind kein
   * Fortschritt gegenüber acht Spalten nebeneinander, sondern dieselbe Zeile
   * hochkant (die Begründung steht ausführlich in `InventurKarte.tsx`).
   */
  aus?: readonly string[];
};

/** Eine Spalte, die als beschriftetes Merkmal auf der Karte steht. */
export type Kartenfach<T> = {
  schluessel: string;
  /** Der Spaltentitel als Beschriftung — leer, wenn die Spalte keinen trägt. */
  beschriftung: string;
  spalte: KartenSpalte<T>;
};

export type Kartenaufbau<T> = {
  titel: Kartenfach<T> | null;
  kennzeichen: Kartenfach<T>[];
  merkmale: Kartenfach<T>[];
  aktionen: Kartenfach<T> | null;
  /**
   * Gesetzt, wenn ein Wunsch einen Schlüssel nennt, den es nicht gibt. Der
   * Aufrufer meldet es in der Entwicklungskonsole — ein vertippter Schlüssel
   * fiele sonst still auf die Vorgabe zurück, und die Karte sähe fast richtig
   * aus.
   */
  hinweis?: string;
};

/** Die Titel, an denen eine Handlungsspalte ohne Angabe erkannt wird. */
const HANDLUNGSTITEL = new Set(["aktion", "aktionen"]);

/**
 * Der Schlüssel, unter dem eine Spalte auf der Karte angesprochen wird.
 *
 * ⚠️ DER RÜCKFALL AUF DIE POSITION IST NÖTIG, NICHT BEQUEM. `spaltenSchluessel`
 * gibt `null` für eine Spalte ohne `key` und ohne skalares `dataIndex` — eine
 * Spalte, die nur rendert, und davon hat fast jede Tabelle hier eine. Ohne
 * Rückfall fiele sie aus der Karte heraus, und zwar still. Die Position ist als
 * Adresse schlechter (sie wandert beim Umsortieren), aber sie ist eine.
 */
function kartenSchluessel<T>(spalte: KartenSpalte<T>, index: number): string {
  return spaltenSchluessel(spalte) ?? `#${index}`;
}

/** Der Spaltentitel als Beschriftung — nur eine Zeichenkette trägt eine. */
function beschriftungVon<T>(spalte: KartenSpalte<T>): string {
  return typeof spalte.title === "string" ? spalte.title : "";
}

/**
 * Die LETZTE Spalte, wenn sie keinen Titel trägt — die zweite Art, eine
 * Handlungsspalte zu erkennen.
 *
 * ⚠️ SIE IST NICHT GERATEN, SONDERN GEMESSEN. Ein knappes Dutzend Tabellen
 * dieser Suite schreibt seine Knopfzeile in eine Spalte mit `title: ""` statt
 * mit dem Wort „Aktionen" — über einer Spalte aus Knöpfen wäre eine
 * Überschrift auch nur Lärm. In der Karte kehrt sich das um: ohne diese Regel
 * stünde die Knopfzeile als MERKMAL in der Beschreibungsliste, mit einer
 * leeren Beschriftung daneben, und die Knöpfe blieben schmal statt über die
 * volle Breite zu gehen.
 *
 * ⚠️ NUR DIE LETZTE. Eine titellose Spalte MITTEN in der Liste ist keine
 * Knopfzeile, sondern eine Fortsetzung ihrer Nachbarin (ein Symbol neben einer
 * Zahl, eine Einheit hinter einem Wert); sie als Handlung ganz nach unten zu
 * ziehen risse sie von ihrem Bezug los. Solche Spalten bleiben Merkmale —
 * `Spaltenkarte` rendert sie ohne Beschriftung über die volle Breite.
 */
function letzteOhneTitel<T>(faecher: readonly Kartenfach<T>[]): Kartenfach<T> | null {
  const letzte = faecher.at(-1);
  if (!letzte || letzte.beschriftung !== "") return null;
  // Eine Tabelle, die NUR aus einer titellosen Spalte besteht, hat keine
  // Handlungsspalte — sie hätte sonst keinen Titel mehr.
  if (faecher.length < 2) return null;
  return letzte;
}

/**
 * Die Aufteilung einer Spaltenliste auf die Bereiche einer Karte.
 *
 * ⚠️ ÜBER DIE BLÄTTER, NICHT ÜBER DIE OBERSTE EBENE. Ein gruppierter
 * Spaltenkopf ist keine Spalte, sondern eine Klammer um welche; wer nur die
 * oberste Ebene liest, baut eine Karte aus Gruppennamen ohne einen einzigen
 * Wert. Dieselbe Begründung wie bei `blattSpalten` in `angezeigt.ts` und bei
 * `breitenSumme` in `masse.ts`.
 */
export function kartenaufbau<T>(
  spalten: readonly KartenSpalte<T>[] | undefined,
  wunsch: Kartenwunsch = {},
): Kartenaufbau<T> {
  const blaetter = blattSpalten(spalten as readonly AnzeigeSpalte<T>[] | undefined) as KartenSpalte<T>[];
  const faecher: Kartenfach<T>[] = blaetter.map((spalte, index) => ({
    schluessel: kartenSchluessel(spalte, index),
    beschriftung: beschriftungVon(spalte),
    spalte,
  }));
  const nachSchluessel = new Map(faecher.map((fach) => [fach.schluessel, fach]));

  const unbekannt: string[] = [];
  function hole(schluessel: string | undefined): Kartenfach<T> | null {
    if (schluessel === undefined) return null;
    const fach = nachSchluessel.get(schluessel);
    if (!fach) unbekannt.push(schluessel);
    return fach ?? null;
  }

  const aus = new Set(wunsch.aus ?? []);
  for (const schluessel of aus) if (!nachSchluessel.has(schluessel)) unbekannt.push(schluessel);

  /*
   * ⚠️ DIE HANDLUNGSSPALTE WIRD VOR DEM TITEL BESTIMMT, und die Reihenfolge ist
   * kein Zufall: ohne sie würde eine Tabelle, deren einzige Spalte „Aktionen"
   * heißt, diese Spalte zur Überschrift machen — eine Karte, deren Titel ein
   * Knopf ist.
   */
  const aktionen = wunsch.aktionen !== undefined
    ? hole(wunsch.aktionen)
    : faecher.find((fach) => HANDLUNGSTITEL.has(fach.beschriftung.toLowerCase()))
      ?? letzteOhneTitel(faecher);

  const kennzeichen = (wunsch.kennzeichen ?? [])
    .map((schluessel) => hole(schluessel))
    .filter((fach): fach is Kartenfach<T> => fach !== null);
  const kennzeichenSchluessel = new Set(kennzeichen.map((fach) => fach.schluessel));

  function vergeben(fach: Kartenfach<T>): boolean {
    return aus.has(fach.schluessel)
      || fach.schluessel === aktionen?.schluessel
      || kennzeichenSchluessel.has(fach.schluessel);
  }

  const titel = wunsch.titel !== undefined
    ? hole(wunsch.titel)
    : faecher.find((fach) => !vergeben(fach)) ?? null;

  const merkmale = faecher.filter(
    (fach) => !vergeben(fach) && fach.schluessel !== titel?.schluessel,
  );

  return {
    titel,
    kennzeichen,
    merkmale,
    aktionen,
    hinweis: unbekannt.length > 0
      ? `Unbekannte Spaltenschlüssel im Kartenaufbau: ${unbekannt.join(", ")}`
      : undefined,
  };
}

/**
 * Der Wert eines `dataIndex` aus einer Zeile — WÖRTLICH nach rc-tables eigener
 * Rechnung (`Cell/useCellRender.js`):
 *
 *     const path = dataIndex == null || dataIndex === '' ? [] : […];
 *     const value = getValue(record, path);
 *
 * ⚠️ OHNE `dataIndex` IST DER WERT DIE GANZE ZEILE, NICHT `undefined` — und das
 * ist der Unterschied, der eine Seite zum Absturz bringt. Ein leerer Pfad gibt
 * bei rc-util das Objekt selbst zurück, und eine Spalte, die nur `key` und
 * `render` trägt, bekommt damit den Datensatz als ERSTEN Parameter. Die meisten
 * Spalten dieser Suite schreiben `render: (_, zeile) => …` und merken es nicht;
 * `lagerorte/LagerorteListe.tsx` schreibt `render: (zeile) => …` und ist damit
 * genauso richtig. Gab man dort `undefined` herein, riss die Karte mit
 * „Cannot read properties of undefined (reading 'aktiv')" — gemessen, nicht
 * vermutet.
 */
function feldWert<T>(dataIndex: unknown, zeile: T): unknown {
  if (dataIndex === undefined || dataIndex === null || dataIndex === "") return zeile;
  const pfad = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  if (pfad.length === 0) return zeile;
  let hier: unknown = zeile;
  for (const stufe of pfad) {
    if (hier === null || hier === undefined || typeof hier !== "object") return undefined;
    hier = (hier as Record<string, unknown>)[String(stufe)];
  }
  return hier;
}

/**
 * Was eine Spaltenzelle für DIESE Zeile anzeigt — derselbe Weg, den rc-table
 * geht, und deshalb derselbe Inhalt wie in der Tabelle daneben.
 *
 * ⚠️ `render` DARF EIN OBJEKT ZURÜCKGEBEN, UND DAS IST KEIN REACT-ELEMENT.
 * antds `RenderedCell` ist `{ children, props }` — die Form, mit der eine
 * Spalte Zellen zusammenfasst (`colSpan`). Gäbe man sie unverändert an React
 * weiter, stünde „Objects are not valid as a React child" auf der Seite. Auf
 * einer Karte gibt es keine Zellen zum Zusammenfassen, also zählt allein
 * `children`. Ein echtes React-Element trägt ebenfalls ein `props`-Feld, aber
 * kein eigenes `children` — daran sind die beiden zu unterscheiden, und
 * `isValidElement` davor macht die Probe eindeutig.
 */
export function zellenInhalt<T>(spalte: KartenSpalte<T>, zeile: T, index: number): ReactNode {
  const roh = feldWert(spalte.dataIndex, zeile);
  /*
   * ⚠️ OHNE `render` IST DER ROHWERT DER INHALT — aber nur, wenn es einen
   * `dataIndex` gab. Sonst wäre er die ganze ZEILE (s. `feldWert`), und ein
   * Objekt als React-Kind ergibt „Objects are not valid as a React child".
   * In der Tabelle fällt das nicht auf, weil eine Spalte ohne beides ohnehin
   * nichts anzeigt.
   */
  if (!spalte.render) {
    return spalte.dataIndex === undefined || spalte.dataIndex === null
      ? null
      : (roh as ReactNode);
  }
  const gerendert = spalte.render(roh as never, zeile, index);
  // Dieselbe Probe wie rc-tables `isRenderCell`: ein gewöhnliches Objekt ist
  // eine `RenderedCell`, ein Feld und ein Element sind es nicht.
  if (
    typeof gerendert === "object"
    && gerendert !== null
    && !Array.isArray(gerendert)
    && !isValidElement(gerendert)
  ) {
    return (gerendert as { children?: ReactNode }).children ?? null;
  }
  return gerendert as ReactNode;
}

/**
 * Ob ein Wert auf der Karte überhaupt eine Zeile wert ist.
 *
 * ⚠️ DAS IST EINE UX-ENTSCHEIDUNG MIT EINER SCHARFEN GRENZE. Leergelassene
 * Felder als „—" untereinander zu stapeln macht aus einer Karte eine Liste von
 * Nichtigkeiten; gemessen an den Protokolltabellen dieser Suite wäre über die
 * Hälfte der Zeilen leer. Weggelassen wird deshalb, was NICHTS ist — `null`,
 * `undefined`, die leere Zeichenkette.
 *
 * ⚠️ UND AUSDRÜCKLICH NICHT „—". Ein Gedankenstrich ist eine Aussage des
 * Aufrufers („hier steht nichts"), und die gehört ihm, nicht uns. Wer ihn
 * wegfiltert, unterscheidet nicht mehr zwischen „kein Wert eingetragen" und
 * „diese Spalte gibt es für diese Zeile nicht" — zwei verschiedene Auskünfte,
 * und in einem Verfallsprotokoll ist der Unterschied fachlich.
 */
export function traegtInhalt(wert: ReactNode): boolean {
  if (wert === null || wert === undefined || wert === false) return false;
  if (typeof wert === "string") return wert.trim().length > 0;
  if (Array.isArray(wert)) return wert.some((teil) => traegtInhalt(teil as ReactNode));
  return true;
}

/**
 * Der Schlüssel einer Zeile aus antds `rowKey` — als Funktion, egal in welcher
 * Form er hereinkam.
 *
 * ⚠️ OHNE RÜCKFALL AUF DEN INDEX. Ein Index als Schlüssel hält keine Zeile
 * fest: filtert oder sortiert jemand, bekommt eine andere Zeile denselben
 * Schlüssel, und React schreibt den Zustand der Karte (ein aufgeklapptes Feld,
 * ein Kreuzchen) auf einen fremden Datensatz um. `rowKey` ist an jeder Tabelle
 * dieser Suite gesetzt; es zu erzwingen ist billiger als das stille Umschreiben.
 */
export function schluesselAus<T>(
  rowKey: string | ((zeile: T, index?: number) => Key) | undefined,
): (zeile: T, index: number) => Key {
  if (typeof rowKey === "function") return (zeile, index) => rowKey(zeile, index);
  const feld = rowKey ?? "key";
  return (zeile) => feldWert(feld, zeile) as Key;
}
